import { Module } from "@nestjs/common";

import { CallQueueModule } from "../call-queue/call-queue.module";
import { ConversationEngineModule } from "../conversation-engine/conversation-engine.module";
import { CustomerModule } from "../customer/customer.module";
import { OrderModule } from "../order/order.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { TelephonyProviderFactory } from "./providers/telephony-provider.factory";
import { TelephonyController } from "./telephony.controller";
import { TelephonyService } from "./telephony.service";
import { TelephonyWebhookController } from "./webhooks/telephony-webhook.controller";
import { TelephonyWebhookService } from "./webhooks/telephony-webhook.service";

@Module({
  imports: [
    WorkspaceSettingsModule,
    OrderModule,
    CustomerModule,
    CallQueueModule,
    ConversationEngineModule,
  ],
  controllers: [TelephonyController, TelephonyWebhookController],
  providers: [TelephonyService, TelephonyProviderFactory, TelephonyWebhookService],
  exports: [TelephonyService, TelephonyProviderFactory],
})
export class TelephonyModule {}
