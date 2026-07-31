import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { KnowledgeBaseController } from "./knowledge-base.controller";
import { KnowledgeBaseService } from "./knowledge-base.service";

@Module({
  imports: [WorkspaceModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
