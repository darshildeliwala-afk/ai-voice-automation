import { Module } from "@nestjs/common";

import { LeadQualificationController } from "./lead-qualification.controller";
import { LeadQualificationService } from "./lead-qualification.service";

@Module({
  controllers: [LeadQualificationController],
  providers: [LeadQualificationService],
  exports: [LeadQualificationService],
})
export class LeadQualificationModule {}
