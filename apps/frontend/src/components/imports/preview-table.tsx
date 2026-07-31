"use client";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ImportPreviewResult, ImportRowStatus } from "@/lib/imports/types";

const statusStyles: Record<ImportRowStatus, string> = {
  PENDING: "bg-slate-500/10 text-slate-600",
  VALID: "bg-emerald-500/10 text-emerald-700",
  INVALID: "bg-rose-500/10 text-rose-700",
  IMPORTED: "bg-blue-500/10 text-blue-700",
  FAILED: "bg-rose-500/10 text-rose-700",
};

interface PreviewTableProps {
  preview: ImportPreviewResult;
  onBack: () => void;
  onStartImport: () => void;
  isStarting?: boolean;
}

export function PreviewTable({
  preview,
  onBack,
  onStartImport,
  isStarting,
}: PreviewTableProps) {
  return (
    <div className="space-y-5">
      <Card className="py-0">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-heading font-medium">Preview</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Showing {preview.sample.length} of {preview.totalRows} rows ·{" "}
              {preview.validRows} valid, {preview.invalidRows} invalid
            </p>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Row</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Order Ref</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row) => (
                  <tr key={row.rowNumber} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{row.rowNumber}</td>
                    <td className="px-4 py-3">
                      <p>{row.mappedData?.customerName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.mappedData?.customerPhone ?? ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.mappedData?.orderReference ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.mappedData?.itemName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={statusStyles[row.status]}
                      >
                        {row.status}
                      </Badge>
                      {row.errors && row.errors.length > 0 && (
                        <p className="mt-1 text-xs text-rose-600">
                          {row.errors[0]}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" type="button" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onStartImport}
          disabled={isStarting || preview.validRows === 0}
        >
          {isStarting && (
            <Loader2
              className="size-4 animate-spin"
              data-icon="inline-start"
            />
          )}
          Start Import
        </Button>
      </div>
    </div>
  );
}
