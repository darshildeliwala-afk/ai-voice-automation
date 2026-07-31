"use client";

import { Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ImportPreviewResult } from "@/lib/imports/types";

interface ImportProgressCardProps {
  totalRows: number;
  progress: ImportPreviewResult | null;
}

export function ImportProgressCard({
  totalRows,
  progress,
}: ImportProgressCardProps) {
  const processedRows = progress?.processedRows ?? 0;
  const successCount = progress?.successCount ?? 0;
  const errorCount = progress?.errorCount ?? 0;
  const percent =
    totalRows > 0 ? Math.min(100, Math.round((processedRows / totalRows) * 100)) : 0;

  return (
    <Card className="py-0">
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <div>
            <h2 className="font-heading font-medium">Importing your data...</h2>
            <p className="text-sm text-muted-foreground">
              This may take a moment. Please don&apos;t close this tab.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {processedRows} of {totalRows} rows processed
            </span>
            <span className="text-muted-foreground">{percent}%</span>
          </div>
          <Progress value={percent} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-xl font-semibold">{totalRows}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-500/5 p-4">
            <p className="text-xs text-emerald-700">Succeeded</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">
              {successCount}
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-500/5 p-4">
            <p className="text-xs text-rose-700">Failed</p>
            <p className="mt-1 text-xl font-semibold text-rose-700">
              {errorCount}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
