import { Module } from "@nestjs/common";

import { CallQueueModule } from "../call-queue/call-queue.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({
  imports: [WorkspaceModule, CallQueueModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
