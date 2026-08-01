import { Injectable } from "@nestjs/common";
import {
  createCallProvider,
  TelephonyConfigMissingError,
  type SupportedTelephonyProvider,
} from "@ai-voice-automation/telephony-core";

import { TelephonyEncryptionProvider } from "../../common/encryption/telephony-encryption.provider";
import { StructuredLogger } from "../../common/logger/structured-logger";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CallDirection,
  CallStatus,
  type Call,
  type Prisma,
  type CallQueue,
} from "../../generated/prisma/client";
import type {
  CallProcessingResult,
  ICallProcessingProvider,
} from "./call-processing.provider.interface";

/**
 * Places the real outbound call via Plivo (or whichever provider the
 * workspace has configured) when the queue worker dequeues a row. This
 * replaces StubCallProcessingProvider behind the same
 * ICallProcessingProvider extension point -- CallQueueWorkerService /
 * CallQueueProcessor are unchanged.
 *
 * Scope: places the call and persists the result. Does NOT connect any AI
 * conversation after answer (out of scope for this sprint) -- the worker's
 * job ends once the outbound call has been initiated with the provider.
 */
@Injectable()
export class PlivoCallProcessingProvider implements ICallProcessingProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TelephonyEncryptionProvider,
    private readonly logger: StructuredLogger,
  ) {}

  async process(job: CallQueue): Promise<CallProcessingResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: job.orderId },
    });
    if (!order) {
      return { success: false, message: `Order ${job.orderId} not found` };
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: order.customerId },
    });
    if (!customer) {
      return {
        success: false,
        message: `Customer ${order.customerId} not found`,
      };
    }

    let call = await this.prisma.call.findFirst({
      where: { callQueueId: job.id },
      orderBy: { createdAt: "desc" },
    });

    try {
      if (call?.providerCallId) {
        this.logger.event(
          "PlivoCallProcessingProvider",
          "call already placed with provider, skipping",
          { callId: call.id, providerCallId: call.providerCallId },
        );
        return { success: true, message: "Call already placed with provider" };
      }

      const config = await this.getActiveConfig(order.workspaceId);

      if (!call) {
        call = await this.prisma.call.create({
          data: {
            workspaceId: order.workspaceId,
            orderId: order.id,
            customerId: customer.id,
            callQueueId: job.id,
            provider: config.provider,
            phoneNumber: customer.phone,
            status: CallStatus.INITIATED,
            direction: CallDirection.OUTBOUND,
          },
        });
      }

      const authToken = this.encryption.decrypt(config.authToken);
      const provider = createCallProvider(
        config.provider as SupportedTelephonyProvider,
        {
          provider: config.provider as SupportedTelephonyProvider,
          authId: config.authId as string,
          authToken,
          phoneNumber: config.phoneNumber as string,
        },
      );

      const baseUrl = (process.env.TELEPHONY_WEBHOOK_BASE_URL ?? "").replace(
        /\/$/,
        "",
      );

      const result = await provider.makeCall({
        to: customer.phone,
        answerUrl: `${baseUrl}/telephony/webhook?callId=${call.id}&type=answer`,
        hangupUrl: `${baseUrl}/telephony/webhook?callId=${call.id}&type=hangup`,
      });

      await this.prisma.call.update({
        where: { id: call.id },
        data: {
          providerCallId: result.providerCallId,
          providerPayload: result.rawResponse as Prisma.InputJsonValue,
          status: CallStatus.RINGING,
          startedAt: new Date(),
        },
      });

      this.logger.event("PlivoCallProcessingProvider", "call placed", {
        callId: call.id,
        callQueueId: job.id,
        provider: config.provider,
        providerCallId: result.providerCallId,
      });

      return {
        success: true,
        message: `Call placed via ${config.provider}, providerCallId=${result.providerCallId}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (call) {
        await this.markCallFailed(call, message);
      }

      this.logger.eventError(
        "PlivoCallProcessingProvider",
        "failed to place call",
        error,
        { callQueueId: job.id, callId: call?.id },
      );

      return { success: false, message };
    }
  }

  private async getActiveConfig(workspaceId: string) {
    const config = await this.prisma.telephonyConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!config || !config.authId || !config.phoneNumber) {
      throw new TelephonyConfigMissingError(workspaceId);
    }

    return config;
  }

  private async markCallFailed(call: Call, reason: string): Promise<void> {
    await this.prisma.call
      .update({
        where: { id: call.id },
        data: { status: CallStatus.FAILED, hangupReason: reason },
      })
      .catch(() => undefined);
  }
}
