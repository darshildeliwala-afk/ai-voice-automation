import { Module } from "@nestjs/common";

import { WorkspaceModule } from "../workspace/workspace.module";
import { CustomerTagService } from "./customer-tag.service";
import { CustomerController } from "./customer.controller";
import { CustomerService } from "./customer.service";

@Module({
  imports: [WorkspaceModule],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerTagService],
  exports: [CustomerService, CustomerTagService],
})
export class CustomerModule {}
