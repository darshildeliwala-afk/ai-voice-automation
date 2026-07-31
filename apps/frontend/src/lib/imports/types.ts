export type ImportJobStatus =
  | "UPLOADED"
  | "VALIDATED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type ImportRowStatus =
  | "PENDING"
  | "VALID"
  | "INVALID"
  | "IMPORTED"
  | "FAILED";

export const IMPORT_FIELDS = [
  "customerName",
  "customerPhone",
  "customerEmail",
  "orderReference",
  "paymentType",
  "itemName",
  "itemSku",
  "itemQuantity",
  "itemUnitPrice",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const REQUIRED_IMPORT_FIELDS: ImportField[] = [
  "customerName",
  "customerPhone",
  "orderReference",
  "paymentType",
  "itemName",
  "itemQuantity",
  "itemUnitPrice",
];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  customerName: "Customer Name",
  customerPhone: "Customer Phone",
  customerEmail: "Customer Email",
  orderReference: "Order Reference",
  paymentType: "Payment Type",
  itemName: "Item Name",
  itemSku: "Item SKU",
  itemQuantity: "Item Quantity",
  itemUnitPrice: "Item Unit Price",
};

export type SuggestedMapping = Partial<Record<ImportField, string>>;

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
  completedAt: string | null;
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
