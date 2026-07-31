import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { UserService } from "./user.service";

@Module({
  imports: [WorkspaceModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
