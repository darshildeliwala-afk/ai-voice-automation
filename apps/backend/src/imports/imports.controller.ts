import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { ExecuteImportDto } from "./dto/execute-import.dto";
import { UploadImportDto } from "./dto/upload-import.dto";
import { ValidateImportDto } from "./dto/validate-import.dto";
import { ImportsService } from "./imports.service";
import type { UploadedImportFile } from "./parsing/file-parser";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Controller("imports")
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(
    @Body() dto: UploadImportDto,
    @UploadedFile() file: UploadedImportFile,
  ) {
    return this.importsService.uploadImport(dto, file);
  }

  @Get("mapping/:uploadId")
  getMapping(@Param("uploadId", ParseUUIDPipe) uploadId: string) {
    return this.importsService.getMapping(uploadId);
  }

  @Post("validate")
  validate(@Body() dto: ValidateImportDto) {
    return this.importsService.validateImport(dto);
  }

  @Get("preview/:uploadId")
  preview(
    @Param("uploadId", ParseUUIDPipe) uploadId: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit =
      limit && !Number.isNaN(Number(limit)) ? Number(limit) : undefined;

    return this.importsService.getPreview(uploadId, parsedLimit);
  }

  @Post("execute")
  execute(@Body() dto: ExecuteImportDto) {
    return this.importsService.executeImport(dto);
  }
}
