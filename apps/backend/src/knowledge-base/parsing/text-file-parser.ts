import { BadRequestException } from "@nestjs/common";

export interface UploadedKnowledgeBaseFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Freeform prose upload (Sprint 20 KB) -- unlike imports' CSV/XLSX tabular parser, this just decodes UTF-8 text as-is. */
export function extractTextContent(file: UploadedKnowledgeBaseFile): string {
  const content = file.buffer.toString("utf-8").trim();

  if (content.length === 0) {
    throw new BadRequestException("Uploaded file has no text content.");
  }

  return content;
}
