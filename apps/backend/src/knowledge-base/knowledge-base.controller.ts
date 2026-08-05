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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CreateKnowledgeBaseDto } from "./dto/create-knowledge-base.dto";
import { ListKnowledgeBasesQueryDto } from "./dto/list-knowledge-bases-query.dto";
import { SearchKnowledgeBaseQueryDto } from "./dto/search-knowledge-base-query.dto";
import { UpdateKnowledgeBaseDto } from "./dto/update-knowledge-base.dto";
import { UploadKnowledgeBaseDto } from "./dto/upload-knowledge-base.dto";
import { KnowledgeBaseService } from "./knowledge-base.service";
import type { UploadedKnowledgeBaseFile } from "./parsing/text-file-parser";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@ApiTags("knowledge-base")
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

  /** Declared before GET(":id") -- else Nest would parse "search" as the :id param and 400 on ParseUUIDPipe (Sprint 20). */
  @Get("search")
  @ApiOperation({ summary: "Relevance-ranked knowledge base search (Sprint 20)" })
  search(@Query() query: SearchKnowledgeBaseQueryDto) {
    return this.knowledgeBaseService.searchWithRelevance(
      query.workspaceId,
      query.query,
      query.limit,
    );
  }

  @Post("upload")
  @ApiOperation({ summary: "Upload a freeform-text file as a knowledge base entry (Sprint 20)" })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(
    @Body() dto: UploadKnowledgeBaseDto,
    @UploadedFile() file: UploadedKnowledgeBaseFile,
  ) {
    return this.knowledgeBaseService.uploadKnowledgeBaseFile(dto, file);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.knowledgeBaseService.getKnowledgeBaseById(id);
  }

  @Post(":id/reindex")
  @ApiOperation({ summary: "Re-check indexing status of a knowledge base entry (Sprint 20)" })
  reindex(@Param("id", ParseUUIDPipe) id: string) {
    return this.knowledgeBaseService.reindexKnowledgeBase(id);
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
