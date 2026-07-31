import { BadRequestException, Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { CallQueueService } from "../call-queue/call-queue.service";
import {
  ImportJobStatus,
  ImportRowStatus,
  Marketplace,
  Prisma,
  type ImportJob,
} from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";
import { ExecuteImportDto } from "./dto/execute-import.dto";
import { UploadImportDto } from "./dto/upload-import.dto";
import { ValidateImportDto } from "./dto/validate-import.dto";
import {
  detectMapping,
  REQUIRED_IMPORT_FIELDS,
  type ImportField,
  type SuggestedMapping,
} from "./mapping/field-synonyms";
import { validateMappedRow } from "./mapping/row-validator";
import {
  detectFileType,
  parseFile,
  type UploadedImportFile,
} from "./parsing/file-parser";

const MAX_IMPORT_ROWS = 20000;
const ROW_BATCH_SIZE = 500;
const PREVIEW_DEFAULT_LIMIT = 20;
const SAMPLE_ERROR_LIMIT = 50;

export interface UploadImportResult {
  uploadId: string;
  fileName: string;
  fileType: string;
  status: ImportJobStatus;
  headers: string[];
  suggestedMapping: SuggestedMapping;
  totalRows: number;
}

export interface ImportMappingResult {
  uploadId: string;
  fileName: string;
  fileType: string;
  status: ImportJobStatus;
  headers: string[];
  suggestedMapping: SuggestedMapping;
  fieldMapping: Record<string, string> | null;
  totalRows: number;
}

export interface RowErrorSummary {
  rowNumber: number;
  errors: string[];
}

export interface ValidateImportResult {
  uploadId: string;
  status: ImportJobStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  sampleErrors: RowErrorSummary[];
}

export interface ImportPreviewRow {
  rowNumber: number;
  rawData: Record<string, string>;
  mappedData: Record<string, string> | null;
  status: ImportRowStatus;
  errors: string[] | null;
}

export interface ImportPreviewResult {
  uploadId: string;
  status: ImportJobStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  completedAt: Date | null;
  errorMessage: string | null;
  sample: ImportPreviewRow[];
}

export interface ExecuteImportResult {
  uploadId: string;
  status: ImportJobStatus;
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
}

@Injectable()
export class ImportsService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly callQueueService: CallQueueService,
  ) {
    super();
  }

  async uploadImport(
    dto: UploadImportDto,
    file: UploadedImportFile,
  ): Promise<UploadImportResult> {
    await this.workspaceService.getWorkspaceById(dto.workspaceId);

    if (!file) {
      throw new BadRequestException("A file is required");
    }

    const fileType = detectFileType(file.originalname, file.mimetype);
    const { headers, rows } = await parseFile(file.buffer, fileType);

    if (rows.length === 0) {
      throw new BadRequestException("Uploaded file contains no data rows");
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `Uploaded file exceeds the maximum of ${MAX_IMPORT_ROWS} rows`,
      );
    }

    const suggestedMapping = detectMapping(headers);

    const job = await this.prisma.importJob.create({
      data: {
        workspaceId: dto.workspaceId,
        source: Marketplace.CSV,
        status: ImportJobStatus.UPLOADED,
        fileName: file.originalname,
        fileType,
        headers,
        suggestedMapping,
        totalRows: rows.length,
      },
    });

    for (let offset = 0; offset < rows.length; offset += ROW_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + ROW_BATCH_SIZE);

      await this.prisma.$transaction(
        chunk.map((row, index) =>
          this.prisma.importRow.create({
            data: {
              importJobId: job.id,
              rowNumber: offset + index + 1,
              rawData: row,
              status: ImportRowStatus.PENDING,
            },
          }),
        ),
      );
    }

    return {
      uploadId: job.id,
      fileName: job.fileName,
      fileType: job.fileType,
      status: job.status,
      headers,
      suggestedMapping,
      totalRows: rows.length,
    };
  }

  async getMapping(uploadId: string): Promise<ImportMappingResult> {
    const job = await this.getImportJobById(uploadId);

    return {
      uploadId: job.id,
      fileName: job.fileName,
      fileType: job.fileType,
      status: job.status,
      headers: job.headers as string[],
      suggestedMapping: job.suggestedMapping as SuggestedMapping,
      fieldMapping: job.fieldMapping as Record<string, string> | null,
      totalRows: job.totalRows,
    };
  }

  async validateImport(dto: ValidateImportDto): Promise<ValidateImportResult> {
    const job = await this.getImportJobById(dto.uploadId);

    const headers = job.headers as string[];
    const missingFields = REQUIRED_IMPORT_FIELDS.filter((field) => {
      const mappedHeader = dto.fieldMapping[field];
      return !mappedHeader || !headers.includes(mappedHeader);
    });

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `fieldMapping is missing required fields: ${missingFields.join(", ")}`,
      );
    }

    const rows = await this.prisma.importRow.findMany({
      where: { importJobId: job.id },
      orderBy: { rowNumber: "asc" },
    });

    let validCount = 0;
    let invalidCount = 0;
    const sampleErrors: RowErrorSummary[] = [];

    const updates = rows.map((row) => {
      const rawData = row.rawData as Record<string, string>;
      const mappedData: Partial<Record<ImportField, string>> = {};

      for (const [field, header] of Object.entries(dto.fieldMapping)) {
        mappedData[field as ImportField] = rawData[header] ?? "";
      }

      const { errors } = validateMappedRow(mappedData);
      const status =
        errors.length > 0 ? ImportRowStatus.INVALID : ImportRowStatus.VALID;

      if (status === ImportRowStatus.VALID) {
        validCount += 1;
      } else {
        invalidCount += 1;
        if (sampleErrors.length < SAMPLE_ERROR_LIMIT) {
          sampleErrors.push({ rowNumber: row.rowNumber, errors });
        }
      }

      return {
        id: row.id,
        mappedData,
        status,
        errors: errors.length > 0 ? errors : null,
        groupKey: mappedData.orderReference ?? null,
      };
    });

    for (let offset = 0; offset < updates.length; offset += ROW_BATCH_SIZE) {
      const chunk = updates.slice(offset, offset + ROW_BATCH_SIZE);

      await this.prisma.$transaction(
        chunk.map((update) =>
          this.prisma.importRow.update({
            where: { id: update.id },
            data: {
              mappedData: update.mappedData,
              status: update.status,
              errors: update.errors ?? Prisma.JsonNull,
              groupKey: update.groupKey,
            },
          }),
        ),
      );
    }

    await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: ImportJobStatus.VALIDATED,
        fieldMapping: dto.fieldMapping,
        validRows: validCount,
        invalidRows: invalidCount,
      },
    });

    return {
      uploadId: job.id,
      status: ImportJobStatus.VALIDATED,
      totalRows: job.totalRows,
      validRows: validCount,
      invalidRows: invalidCount,
      sampleErrors,
    };
  }

  async getPreview(
    uploadId: string,
    limit = PREVIEW_DEFAULT_LIMIT,
  ): Promise<ImportPreviewResult> {
    const job = await this.getImportJobById(uploadId);

    const rows = await this.prisma.importRow.findMany({
      where: { importJobId: job.id },
      orderBy: { rowNumber: "asc" },
      take: limit,
    });

    return {
      uploadId: job.id,
      status: job.status,
      totalRows: job.totalRows,
      validRows: job.validRows,
      invalidRows: job.invalidRows,
      processedRows: job.processedRows,
      successCount: job.successCount,
      errorCount: job.errorCount,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      sample: rows.map((row) => ({
        rowNumber: row.rowNumber,
        rawData: row.rawData as Record<string, string>,
        mappedData: row.mappedData as Record<string, string> | null,
        status: row.status,
        errors: row.errors as string[] | null,
      })),
    };
  }

  async executeImport(dto: ExecuteImportDto): Promise<ExecuteImportResult> {
    const job = await this.getImportJobById(dto.uploadId);

    if (job.status !== ImportJobStatus.VALIDATED) {
      throw new BadRequestException(
        "Import must be validated before it can be executed",
      );
    }

    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: ImportJobStatus.PROCESSING },
    });

    const validRows = await this.prisma.importRow.findMany({
      where: { importJobId: job.id, status: ImportRowStatus.VALID },
      orderBy: { rowNumber: "asc" },
    });

    const groups = new Map<string, typeof validRows>();
    for (const row of validRows) {
      const key = row.groupKey ?? `__row_${row.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(key, [row]);
      }
    }

    let processedRows = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const [groupKey, groupRows] of groups) {
      try {
        const normalizedRows = groupRows.map((row) => {
          const { normalized } = validateMappedRow(
            row.mappedData as Partial<Record<ImportField, string>>,
          );

          if (!normalized) {
            throw new Error(`Row ${row.rowNumber} failed re-validation`);
          }

          return { row, normalized };
        });

        const first = normalizedRows[0].normalized;
        const totalAmount = normalizedRows.reduce(
          (sum, { normalized }) =>
            sum + normalized.itemQuantity * normalized.itemUnitPrice,
          0,
        );

        const orderId = await this.prisma.$transaction(async (tx) => {
          let customer = await tx.customer.findFirst({
            where: {
              workspaceId: job.workspaceId,
              phone: first.customerPhone,
              deletedAt: null,
            },
          });

          if (!customer) {
            customer = await tx.customer.create({
              data: {
                workspaceId: job.workspaceId,
                name: first.customerName,
                phone: first.customerPhone,
                email: first.customerEmail,
              },
            });
          }

          const order = await tx.order.create({
            data: {
              workspaceId: job.workspaceId,
              customerId: customer.id,
              marketplace: Marketplace.CSV,
              marketplaceOrderId: groupKey,
              paymentType: first.paymentType,
              totalAmount,
              items: {
                create: normalizedRows.map(({ normalized }) => ({
                  name: normalized.itemName,
                  sku: normalized.itemSku,
                  quantity: normalized.itemQuantity,
                  unitPrice: normalized.itemUnitPrice,
                })),
              },
            },
          });

          await tx.importRow.updateMany({
            where: { id: { in: groupRows.map((row) => row.id) } },
            data: {
              status: ImportRowStatus.IMPORTED,
              customerId: customer.id,
              orderId: order.id,
            },
          });

          return order.id;
        });

        await this.callQueueService.enqueue(orderId);

        successCount += groupRows.length;
      } catch (error) {
        errorCount += groupRows.length;

        await this.prisma.importRow.updateMany({
          where: { id: { in: groupRows.map((row) => row.id) } },
          data: {
            status: ImportRowStatus.FAILED,
            errors: [
              error instanceof Error ? error.message : "Import failed",
            ],
          },
        });
      }

      processedRows += groupRows.length;

      await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          processedRows,
          successCount,
          errorCount,
        },
      });
    }

    const completedJob = await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: ImportJobStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    return {
      uploadId: completedJob.id,
      status: completedJob.status,
      totalRows: completedJob.totalRows,
      processedRows: completedJob.processedRows,
      successCount: completedJob.successCount,
      errorCount: completedJob.errorCount,
    };
  }

  private async getImportJobById(id: string): Promise<ImportJob> {
    const job = this.throwIfNotFound(
      await this.prisma.importJob.findFirst({ where: { id } }),
      "Import job",
      id,
    );

    await this.workspaceService.getWorkspaceById(job.workspaceId);

    return job;
  }
}
