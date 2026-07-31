import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { CustomerService } from "./customer.service";

@Module({
  imports: [WorkspaceModule],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
