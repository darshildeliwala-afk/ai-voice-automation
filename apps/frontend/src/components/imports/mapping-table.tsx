"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mappingSchema, type MappingFormValues } from "@/lib/imports/schemas";
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  type SuggestedMapping,
} from "@/lib/imports/types";

const NOT_MAPPED = "__not_mapped__";

interface MappingTableProps {
  headers: string[];
  suggestedMapping: SuggestedMapping;
  onSubmit: (mapping: Record<string, string>) => void;
  isSubmitting?: boolean;
}

export function MappingTable({
  headers,
  suggestedMapping,
  onSubmit,
  isSubmitting,
}: MappingTableProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<MappingFormValues>({
    resolver: zodResolver(mappingSchema),
    defaultValues: {
      customerName: suggestedMapping.customerName ?? "",
      customerPhone: suggestedMapping.customerPhone ?? "",
      customerEmail: suggestedMapping.customerEmail ?? "",
      orderReference: suggestedMapping.orderReference ?? "",
      paymentType: suggestedMapping.paymentType ?? "",
      itemName: suggestedMapping.itemName ?? "",
      itemSku: suggestedMapping.itemSku ?? "",
      itemQuantity: suggestedMapping.itemQuantity ?? "",
      itemUnitPrice: suggestedMapping.itemUnitPrice ?? "",
    },
  });

  function submit(values: MappingFormValues) {
    const mapping: Record<string, string> = {};
    for (const field of IMPORT_FIELDS) {
      const value = values[field];
      if (value) mapping[field] = value;
    }
    onSubmit(mapping);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-3 font-medium">Field</th>
              <th className="px-4 py-3 font-medium">Column in file</th>
            </tr>
          </thead>
          <tbody>
            {IMPORT_FIELDS.map((field) => {
              const isRequired = REQUIRED_IMPORT_FIELDS.includes(field);
              return (
                <tr key={field} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{IMPORT_FIELD_LABELS[field]}</p>
                    <p className="text-xs text-muted-foreground">
                      {isRequired ? "Required" : "Optional"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Controller
                      control={control}
                      name={field}
                      render={({ field: controllerField }) => (
                        <Select
                          value={controllerField.value || NOT_MAPPED}
                          onValueChange={(value) =>
                            controllerField.onChange(
                              value === NOT_MAPPED ? "" : value
                            )
                          }
                        >
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Select a column" />
                          </SelectTrigger>
                          <SelectContent>
                            {!isRequired && (
                              <SelectItem value={NOT_MAPPED}>
                                Not mapped
                              </SelectItem>
                            )}
                            {headers.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors[field] && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors[field]?.message}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2
              className="size-4 animate-spin"
              data-icon="inline-start"
            />
          )}
          Validate Mapping
        </Button>
      </div>
    </form>
  );
}
