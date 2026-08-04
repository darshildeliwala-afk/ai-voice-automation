import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { AiAgentController } from "./ai-agent.controller";
import { AiAgentService } from "./ai-agent.service";

@Module({
  imports: [WorkspaceModule, WorkspaceSettingsModule],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
