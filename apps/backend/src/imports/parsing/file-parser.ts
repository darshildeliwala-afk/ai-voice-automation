import { BadRequestException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";

export type ImportFileType = "csv" | "xlsx";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export interface UploadedImportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export function detectFileType(originalName: string, mimeType: string): ImportFileType {
  const extension = originalName.split(".").pop()?.toLowerCase();

  if (extension === "csv" || mimeType === "text/csv") {
    return "csv";
  }

  if (
    extension === "xlsx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "xlsx";
  }

  throw new BadRequestException(
    "Unsupported file type. Only .csv and .xlsx files are supported.",
  );
}

function parseCsvBuffer(buffer: Buffer): ParsedFile {
  const records: Record<string, string>[] = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const headers = records.length > 0 ? Object.keys(records[0]) : [];

  return { headers, rows: records };
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedFile> {
  const data = await readSheet(buffer);

  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = data[0].map((cell) => String(cell ?? "").trim());

  const rows = data.slice(1).map((row) => {
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      const value = row[index];
      record[header] =
        value === null || value === undefined ? "" : String(value);
    });

    return record;
  });

  return { headers, rows };
}

export async function parseFile(
  buffer: Buffer,
  fileType: ImportFileType,
): Promise<ParsedFile> {
  if (fileType === "csv") {
    return parseCsvBuffer(buffer);
  }

  return parseXlsxBuffer(buffer);
}
