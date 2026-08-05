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
  Post,
  Query,
} from "@nestjs/common";

import { CrmNoteService } from "./crm-note.service";
import { CreateCrmNoteDto } from "./dto/create-crm-note.dto";
import { ListCrmNotesQueryDto } from "./dto/list-crm-notes-query.dto";
import { UpdateCrmNoteDto } from "./dto/update-crm-note.dto";

@Controller("crm-notes")
export class CrmNoteController {
  constructor(private readonly crmNoteService: CrmNoteService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCrmNoteDto) {
    return this.crmNoteService.createNote(dto);
  }

  @Get()
  list(@Query() query: ListCrmNotesQueryDto) {
    const { workspaceId, customerId, ...pagination } = query;

    return this.crmNoteService.listCrmNotes(workspaceId, pagination, customerId);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmNoteService.getNoteById(id);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCrmNoteDto) {
    return this.crmNoteService.updateNote(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.crmNoteService.softDeleteNote(id);
  }
}
