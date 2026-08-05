import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";

import { ListLeadQualificationsQueryDto } from "./dto/list-lead-qualifications-query.dto";
import { UpdateLeadQualificationDto } from "./dto/update-lead-qualification.dto";
import { LeadQualificationService } from "./lead-qualification.service";

@Controller("lead-qualifications")
export class LeadQualificationController {
  constructor(
    private readonly leadQualificationService: LeadQualificationService,
  ) {}

  @Get()
  list(@Query() query: ListLeadQualificationsQueryDto) {
    const { workspaceId, interestLevel, ...pagination } = query;

    return this.leadQualificationService.listLeadQualifications(
      workspaceId,
      pagination,
      interestLevel,
    );
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.leadQualificationService.getById(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadQualificationDto,
  ) {
    return this.leadQualificationService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.leadQualificationService.softDelete(id);
  }
}
