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

import { CreateKnowledgeBaseDto } from "./dto/create-knowledge-base.dto";
import { ListKnowledgeBasesQueryDto } from "./dto/list-knowledge-bases-query.dto";
import { UpdateKnowledgeBaseDto } from "./dto/update-knowledge-base.dto";
import { KnowledgeBaseService } from "./knowledge-base.service";

@Controller("knowledge-bases")
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateKnowledgeBaseDto) {
    return this.knowledgeBaseService.createKnowledgeBase(dto);
  }

  @Get()
  list(@Query() query: ListKnowledgeBasesQueryDto) {
    const { workspaceId, search, ...pagination } = query;

    return this.knowledgeBaseService.listKnowledgeBases(
      workspaceId,
      pagination,
      search,
    );
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.knowledgeBaseService.getKnowledgeBaseById(id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.updateKnowledgeBase(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.knowledgeBaseService.softDeleteKnowledgeBase(id);
  }
}
