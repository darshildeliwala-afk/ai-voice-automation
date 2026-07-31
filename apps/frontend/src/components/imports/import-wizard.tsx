"use client";

import { useEffect, useRef, useState } from "react";

import { ImportProgressCard } from "@/components/imports/import-progress-card";
import { ImportResultsCard } from "@/components/imports/import-results-card";
import { MappingTable } from "@/components/imports/mapping-table";
import { PreviewTable } from "@/components/imports/preview-table";
import { UploadDropzone } from "@/components/imports/upload-dropzone";
import { ValidationSummary } from "@/components/imports/validation-summary";
import { WizardStepper } from "@/components/imports/wizard-stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  executeImport,
  getImportPreview,
  uploadImport,
  validateImport,
} from "@/lib/imports/api";
import type {
  ExecuteImportResult,
  ImportPreviewResult,
  UploadImportResult,
  ValidateImportResult,
} from "@/lib/imports/types";

type WizardStep =
  | "upload"
  | "mapping"
  | "validation"
  | "preview"
  | "importing"
  | "results";

const STEP_ORDER: WizardStep[] = [
  "upload",
  "mapping",
  "validation",
  "preview",
  "importing",
  "results",
];

const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Upload",
  mapping: "Column Mapping",
  validation: "Validation",
  preview: "Preview",
  importing: "Import Progress",
  results: "Results",
};

const POLL_INTERVAL_MS = 1500;

export function ImportWizard() {
  const { user } = useAuth();

  const [step, setStep] = useState<WizardStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadImportResult | null>(
    null
  );
  const [validateResult, setValidateResult] =
    useState<ValidateImportResult | null>(null);
  const [previewResult, setPreviewResult] =
    useState<ImportPreviewResult | null>(null);
  const [progress, setProgress] = useState<ImportPreviewResult | null>(null);
  const [executeResult, setExecuteResult] =
    useState<ExecuteImportResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeStartedRef = useRef<string | null>(null);

  function resetWizard() {
    executeStartedRef.current = null;
    setStep("upload");
    setSelectedFile(null);
    setUploadResult(null);
    setValidateResult(null);
    setPreviewResult(null);
    setProgress(null);
    setExecuteResult(null);
    setError(null);
  }

  async function handleUpload() {
    if (!selectedFile || !user) return;

    setIsBusy(true);
    setError(null);
    try {
      const result = await uploadImport(user.workspaceId, selectedFile);
      setUploadResult(result);
      setStep("mapping");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleValidate(mapping: Record<string, string>) {
    if (!uploadResult) return;

    setIsBusy(true);
    setError(null);
    try {
      const result = await validateImport(uploadResult.uploadId, mapping);
      setValidateResult(result);
      setStep("validation");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleContinueToPreview() {
    if (!uploadResult) return;

    setIsBusy(true);
    setError(null);
    try {
      const result = await getImportPreview(uploadResult.uploadId);
      setPreviewResult(result);
      setStep("preview");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  function handleStartImport() {
    setError(null);
    setStep("importing");
  }

  useEffect(() => {
    if (step !== "importing" || !uploadResult) return;
    if (executeStartedRef.current === uploadResult.uploadId) return;
    executeStartedRef.current = uploadResult.uploadId;

    let cancelled = false;
    const uploadId = uploadResult.uploadId;

    const pollTimer = setInterval(() => {
      getImportPreview(uploadId)
        .then((latest) => {
          if (!cancelled) setProgress(latest);
        })
        .catch(() => {
          // transient polling errors are ignored; the execute() call below is authoritative
        });
    }, POLL_INTERVAL_MS);

    executeImport(uploadId)
      .then((result) => {
        if (cancelled) return;
        setExecuteResult(result);
        setStep("results");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err));
        setStep("preview");
      })
      .finally(() => {
        clearInterval(pollTimer);
      });

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [step, uploadResult]);

  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-7">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Import Orders
        </h1>
        <p className="mt-1 text-muted-foreground">
          Upload a CSV or XLSX file to bulk-import customers and orders.
        </p>
      </div>

      <WizardStepper
        steps={STEP_ORDER.map((s) => STEP_LABELS[s])}
        currentIndex={currentIndex}
      />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-500/5 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {step === "upload" && (
        <Card className="py-0">
          <CardContent className="space-y-5 p-6">
            <UploadDropzone
              selectedFile={selectedFile}
              onFileSelected={setSelectedFile}
              onClear={() => setSelectedFile(null)}
              disabled={isBusy}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleUpload}
                disabled={!selectedFile || isBusy}
              >
                {isBusy ? "Uploading..." : "Upload & Continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && uploadResult && (
        <Card className="py-0">
          <CardContent className="p-6">
            <MappingTable
              headers={uploadResult.headers}
              suggestedMapping={uploadResult.suggestedMapping}
              onSubmit={handleValidate}
              isSubmitting={isBusy}
            />
          </CardContent>
        </Card>
      )}

      {step === "validation" && validateResult && (
        <ValidationSummary
          result={validateResult}
          onBack={() => setStep("mapping")}
          onContinue={handleContinueToPreview}
          isLoading={isBusy}
        />
      )}

      {step === "preview" && previewResult && (
        <PreviewTable
          preview={previewResult}
          onBack={() => setStep("validation")}
          onStartImport={handleStartImport}
          isStarting={isBusy}
        />
      )}

      {step === "importing" && uploadResult && (
        <ImportProgressCard
          totalRows={uploadResult.totalRows}
          progress={progress}
        />
      )}

      {step === "results" && executeResult && (
        <ImportResultsCard result={executeResult} onReset={resetWizard} />
      )}
    </div>
  );
}
