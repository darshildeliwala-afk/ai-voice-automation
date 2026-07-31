import { apiClient } from "@/lib/api/client";
import type {
  ExecuteImportResult,
  ImportMappingResult,
  ImportPreviewResult,
  UploadImportResult,
  ValidateImportResult,
} from "@/lib/imports/types";

export function uploadImport(
  workspaceId: string,
  file: File
): Promise<UploadImportResult> {
  const formData = new FormData();
  formData.append("workspaceId", workspaceId);
  formData.append("file", file);

  return apiClient.post<UploadImportResult>("/imports/upload", formData);
}

export function getImportMapping(uploadId: string): Promise<ImportMappingResult> {
  return apiClient.get<ImportMappingResult>(`/imports/mapping/${uploadId}`);
}

export function validateImport(
  uploadId: string,
  fieldMapping: Record<string, string>
): Promise<ValidateImportResult> {
  return apiClient.post<ValidateImportResult>("/imports/validate", {
    uploadId,
    fieldMapping,
  });
}

export function getImportPreview(
  uploadId: string,
  limit?: number
): Promise<ImportPreviewResult> {
  const query = limit ? `?limit=${limit}` : "";
  return apiClient.get<ImportPreviewResult>(`/imports/preview/${uploadId}${query}`);
}

export function executeImport(uploadId: string): Promise<ExecuteImportResult> {
  return apiClient.post<ExecuteImportResult>("/imports/execute", { uploadId });
}
