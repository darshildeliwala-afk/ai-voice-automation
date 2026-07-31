import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { AiAgentController } from "./ai-agent.controller";
import { AiAgentService } from "./ai-agent.service";

@Module({
  imports: [WorkspaceModule],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
