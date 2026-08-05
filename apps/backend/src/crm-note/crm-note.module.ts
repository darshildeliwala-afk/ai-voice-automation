import { Module } from "@nestjs/common";

import { CustomerModule } from "../customer/customer.module";
import { CrmNoteController } from "./crm-note.controller";
import { CrmNoteService } from "./crm-note.service";

@Module({
  imports: [CustomerModule],
  controllers: [CrmNoteController],
  providers: [CrmNoteService],
  exports: [CrmNoteService],
})
export class CrmNoteModule {}
