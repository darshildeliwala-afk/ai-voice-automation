import { BadRequestException, Injectable } from "@nestjs/common";
import {
  TelephonyConfigMissingError,
  TelephonyProviderInactiveError,
} from "@ai-voice-automation/telephony-core";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import { CallQueueService } from "../call-queue/call-queue.service";
import { CustomerService } from "../customer/customer.service";
import { OrderService } from "../order/order.service";
import {
  CallDirection,
  CallStatus,
  Prisma,
  type Call,
  type LiveCallAiStatus,
  type LiveCallSpeakingParty,
  type TelephonyProvider,
} from "../generated/prisma/client";
import { TelephonyConfigService } from "../workspace-settings/telephony-config.service";
import { CreateCallDto } from "./dto/create-call.dto";
import { EnqueueCallDto } from "./dto/enqueue-call.dto";
import type { ListCallsQueryDto } from "./dto/list-calls-query.dto";
import type { CreateCallResult } from "./interfaces/create-call-result.interface";
import type { EnqueueCallResult } from "./interfaces/enqueue-call-result.interface";
import { TelephonyProviderFactory } from "./providers/telephony-provider.factory";

export interface LiveCallSummary {
  callId: string;
  customerName: string;
  phoneNumber: string;
  currentWorkflowNodeKey: string | null;
  speakingParty: LiveCallSpeakingParty;
  aiStatus: LiveCallAiStatus;
  lastTranscriptSnippet: string | null;
  callStartedAt: string | null;
  durationSeconds: number;
}

export interface CallHistoryRow {
  id: string;
  customerId: string;
  customerName: string;
  phoneNumber: string;
  status: CallStatus;
  direction: CallDirection;
  provider: TelephonyProvider;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  hangupReason: string | null;
  recordingUrl: string | null;
}

export interface PaginatedCallHistory {
  data: CallHistoryRow[];
  meta: PaginationMeta;
}

@Injectable()
export class TelephonyService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly customerService: CustomerService,
    private readonly callQueueService: CallQueueService,
    private readonly telephonyConfigService: TelephonyConfigService,
    private readonly providerFactory: TelephonyProviderFactory,
  ) {
    super();
  }

  /** Creates a CallQueue row for an existing order, scoped to the caller's workspace. */
  async enqueueCall(
    workspaceId: string,
    dto: EnqueueCallDto,
  ): Promise<EnqueueCallResult> {
    const order = await this.orderService.getOrderById(dto.orderId);

    if (order.workspaceId !== workspaceId) {
      throw new BadRequestException(
        "Order does not belong to the caller's workspace",
      );
    }

    const queueItem = await this.callQueueService.enqueue(order.id);

    return { queueId: queueItem.id, status: queueItem.status };
  }

  async createCall(
    workspaceId: string,
    dto: CreateCallDto,
  ): Promise<CreateCallResult> {
    const queueItem = await this.callQueueService.findById(dto.queueId);
    const order = await this.orderService.getOrderById(queueItem.orderId);

    if (order.workspaceId !== workspaceId) {
      throw new BadRequestException(
        "Queue item does not belong to the caller's workspace",
      );
    }

    // Scoped lookup: a customer in another workspace is treated as not
    // found, so this also enforces that the customer belongs to workspaceId.
    const customer = await this.customerService.getCustomerById(
      workspaceId,
      dto.customerId,
    );

    if (customer.id !== order.customerId) {
      throw new BadRequestException(
        "customerId does not match the queue item's order",
      );
    }

    const config = await this.telephonyConfigService.getActiveConfig(
      workspaceId,
    );

    if (!config) {
      throw new TelephonyConfigMissingError(workspaceId);
    }

    if (!config.isActive) {
      throw new TelephonyProviderInactiveError(workspaceId);
    }

    const metadata: Prisma.InputJsonValue | undefined = dto.aiAgentId
      ? { aiAgentId: dto.aiAgentId }
      : undefined;

    const call = await this.prisma.call.create({
      data: {
        workspaceId,
        orderId: order.id,
        customerId: customer.id,
        callQueueId: queueItem.id,
        provider: config.provider,
        phoneNumber: customer.phone,
        status: CallStatus.INITIATED,
        direction: CallDirection.OUTBOUND,
        metadata,
      },
    });

    await this.callQueueService.expediteNow(queueItem.id);

    return { callId: call.id, status: call.status };
  }

  async getCallById(workspaceId: string, id: string): Promise<Call> {
    return this.throwIfNotFound(
      await this.prisma.call.findFirst({ where: { id, workspaceId } }),
      "Call",
      id,
    );
  }

  /**
   * Admin Live Call API (Sprint 20) -- reads MediaSession's real-time
   * LiveCallState rows (see media-session.ts), which only exist for the
   * duration of an actual live call and are deleted the moment one ends.
   */
  async listLiveCalls(workspaceId: string): Promise<LiveCallSummary[]> {
    const rows = await this.prisma.liveCallState.findMany({
      where: { workspaceId },
      include: { call: { include: { customer: true } } },
    });

    return rows.map((row) => ({
      callId: row.callId,
      customerName: row.call.customer.name,
      phoneNumber: row.call.phoneNumber,
      currentWorkflowNodeKey: row.currentWorkflowNodeKey,
      speakingParty: row.speakingParty,
      aiStatus: row.aiStatus,
      lastTranscriptSnippet: row.lastTranscriptSnippet,
      callStartedAt: row.call.startedAt?.toISOString() ?? null,
      durationSeconds: row.call.startedAt
        ? Math.floor((Date.now() - row.call.startedAt.getTime()) / 1000)
        : 0,
    }));
  }

  /** Admin Call History API (Sprint 20) -- searchable/filterable/paginated, flat export-ready rows. */
  async listCalls(
    workspaceId: string,
    pagination: PaginationDto,
    filters: Pick<
      ListCallsQueryDto,
      "status" | "direction" | "customerId" | "dateFrom" | "dateTo" | "search"
    >,
  ): Promise<PaginatedCallHistory> {
    const { skip, take, orderBy } = this.buildPagination(pagination);

    const where: Prisma.CallWhereInput = {
      workspaceId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.direction ? { direction: filters.direction } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.search
        ? { phoneNumber: { contains: filters.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            startedAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.call.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { customer: true },
      }),
      this.prisma.call.count({ where }),
    ]);

    const data: CallHistoryRow[] = rows.map((call) => ({
      id: call.id,
      customerId: call.customerId,
      customerName: call.customer.name,
      phoneNumber: call.phoneNumber,
      status: call.status,
      direction: call.direction,
      provider: call.provider,
      startedAt: call.startedAt?.toISOString() ?? null,
      answeredAt: call.answeredAt?.toISOString() ?? null,
      endedAt: call.endedAt?.toISOString() ?? null,
      durationSeconds: call.durationSeconds,
      hangupReason: call.hangupReason,
      recordingUrl: call.recordingUrl,
    }));

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  /**
   * Requests an immediate hangup on the provider. The Call row itself is
   * NOT optimistically mutated here -- the provider's own hangup webhook
   * is the single source of truth for the final status/endedAt/duration,
   * avoiding a race between this response and that callback.
   */
  async hangupCall(workspaceId: string, id: string): Promise<Call> {
    const call = await this.getCallById(workspaceId, id);

    if (!call.providerCallId) {
      throw new BadRequestException(
        "Call has not been placed with the provider yet",
      );
    }

    const provider = await this.providerFactory.createForWorkspace(
      workspaceId,
    );

    await provider.hangup(call.providerCallId);

    return call;
  }
}
