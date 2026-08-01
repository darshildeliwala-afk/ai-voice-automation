import { BadRequestException, Injectable } from "@nestjs/common";
import {
  TelephonyConfigMissingError,
  TelephonyProviderInactiveError,
} from "@ai-voice-automation/telephony-core";

import { BaseService } from "../common/base/base.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { CallQueueService } from "../call-queue/call-queue.service";
import { CustomerService } from "../customer/customer.service";
import { OrderService } from "../order/order.service";
import {
  CallDirection,
  CallStatus,
  type Call,
  type Prisma,
} from "../generated/prisma/client";
import { TelephonyConfigService } from "../workspace-settings/telephony-config.service";
import { CreateCallDto } from "./dto/create-call.dto";
import { EnqueueCallDto } from "./dto/enqueue-call.dto";
import type { CreateCallResult } from "./interfaces/create-call-result.interface";
import type { EnqueueCallResult } from "./interfaces/enqueue-call-result.interface";
import { TelephonyProviderFactory } from "./providers/telephony-provider.factory";

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
