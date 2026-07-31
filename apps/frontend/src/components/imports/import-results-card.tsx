"use client";

import { CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ExecuteImportResult } from "@/lib/imports/types";

interface ImportResultsCardProps {
  result: ExecuteImportResult;
  onReset: () => void;
}

export function ImportResultsCard({ result, onReset }: ImportResultsCardProps) {
  const hasErrors = result.errorCount > 0;

  return (
    <Card className="py-0">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className={`flex size-14 items-center justify-center rounded-full ${
              hasErrors
                ? "bg-amber-500/10 text-amber-600"
                : "bg-emerald-500/10 text-emerald-600"
            }`}
          >
            {hasErrors ? (
              <TriangleAlert className="size-7" />
            ) : (
              <CheckCircle2 className="size-7" />
            )}
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {hasErrors
                ? "Import completed with some errors"
                : "Import completed successfully"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.successCount} of {result.totalRows} rows were imported.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Rows</p>
            <p className="mt-1 text-xl font-semibold">{result.totalRows}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-500/5 p-4 text-center">
            <p className="text-xs text-emerald-700">Succeeded</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">
              {result.successCount}
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-500/5 p-4 text-center">
            <p className="text-xs text-rose-700">Failed</p>
            <p className="mt-1 text-xl font-semibold text-rose-700">
              {result.errorCount}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" type="button" onClick={onReset}>
            <RotateCcw data-icon="inline-start" />
            Import Another File
          </Button>
          <Button nativeButton={false} render={<Link href="/orders" />}>
            View Orders
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
