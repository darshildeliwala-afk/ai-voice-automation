"use client";

import { AlertTriangle, CheckCircle2, CircleAlert, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ValidateImportResult } from "@/lib/imports/types";

interface ValidationSummaryProps {
  result: ValidateImportResult;
  onBack: () => void;
  onContinue: () => void;
  isLoading?: boolean;
}

export function ValidationSummary({
  result,
  onBack,
  onContinue,
  isLoading,
}: ValidationSummaryProps) {
  const stats = [
    {
      label: "Total Rows",
      value: result.totalRows,
    },
    {
      label: "Valid Rows",
      value: result.validRows,
      valueClassName: "text-emerald-600",
    },
    {
      label: "Invalid Rows",
      value: result.invalidRows,
      valueClassName: "text-rose-600",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="py-0">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </p>
              <p
                className={`mt-2 text-2xl font-semibold tracking-tight ${stat.valueClassName ?? ""}`}
              >
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      {result.sampleErrors.length > 0 && (
        <Card className="py-0">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <CircleAlert className="size-4 text-rose-600" />
            <h3 className="font-heading font-medium">Row errors</h3>
            <Badge
              variant="secondary"
              className="ml-auto bg-rose-500/10 text-rose-700"
            >
              {result.sampleErrors.length} shown
            </Badge>
          </div>
          <CardContent className="max-h-80 space-y-3 overflow-y-auto p-5">
            {result.sampleErrors.map((rowError) => (
              <div
                key={rowError.rowNumber}
                className="rounded-lg border border-rose-200 bg-rose-500/5 p-3"
              >
                <p className="text-sm font-medium">Row {rowError.rowNumber}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {rowError.errors.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result.validRows === 0 && (
        <Card className="border-amber-200 bg-amber-500/5 py-0">
          <CardContent className="flex items-center gap-3 p-5 text-sm text-amber-800">
            <AlertTriangle className="size-4 shrink-0" />
            No valid rows were found. Fix the source file or adjust the
            column mapping before continuing.
          </CardContent>
        </Card>
      )}

      {result.invalidRows === 0 && result.validRows > 0 && (
        <Card className="border-emerald-200 bg-emerald-500/5 py-0">
          <CardContent className="flex items-center gap-3 p-5 text-sm text-emerald-800">
            <CheckCircle2 className="size-4 shrink-0" />
            All rows passed validation.
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" type="button" onClick={onBack}>
          Back to Mapping
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={result.validRows === 0 || isLoading}
        >
          {isLoading && (
            <Loader2
              className="size-4 animate-spin"
              data-icon="inline-start"
            />
          )}
          Continue to Preview
        </Button>
      </div>
    </div>
  );
}
