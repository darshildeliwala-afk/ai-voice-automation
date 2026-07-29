import * as XLSX from "xlsx";

import type { ParsedOrderRow } from "@/lib/orders/types";

const HEADER_ALIASES: Record<keyof ParsedOrderRow, string[]> = {
  orderNumber: ["order_number", "ordernumber", "order number", "order id", "order_id"],
  customerName: [
    "customer_name",
    "customername",
    "customer name",
    "name",
    "customer",
  ],
  phone: ["phone", "mobile", "phone_number", "phonenumber", "contact"],
  address: ["address", "shipping_address", "delivery_address", "location"],
  amount: ["amount", "total", "order_amount", "price", "value"],
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveField(
  header: string
): keyof ParsedOrderRow | null {
  const normalized = normalizeHeader(header);

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
    keyof ParsedOrderRow,
    string[],
  ][]) {
    if (aliases.includes(normalized)) {
      return field;
    }
  }

  return null;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "")
    .replace(/[₹,]/g, "")
    .trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRecordToRow(record: Record<string, unknown>): ParsedOrderRow | null {
  const mapped: Partial<ParsedOrderRow> = {};

  for (const [key, value] of Object.entries(record)) {
    const field = resolveField(key);
    if (!field) continue;

    if (field === "amount") {
      mapped.amount = parseAmount(value);
    } else {
      mapped[field] = String(value ?? "").trim();
    }
  }

  if (
    !mapped.orderNumber ||
    !mapped.customerName ||
    !mapped.phone ||
    !mapped.address
  ) {
    return null;
  }

  return {
    orderNumber: mapped.orderNumber,
    customerName: mapped.customerName,
    phone: mapped.phone,
    address: mapped.address,
    amount: mapped.amount ?? 0,
  };
}

function parseCsvText(text: string): ParsedOrderRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: ParsedOrderRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const record: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });

    const row = mapRecordToRow(record);
    if (row) rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseWorkbook(buffer: ArrayBuffer): ParsedOrderRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  return json
    .map((record) => mapRecordToRow(record))
    .filter((row): row is ParsedOrderRow => row !== null);
}

export async function parseOrderFile(file: File): Promise<ParsedOrderRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    const text = await file.text();
    return parseCsvText(text);
  }

  if (extension === "xlsx" || extension === "xls") {
    const buffer = await file.arrayBuffer();
    return parseWorkbook(buffer);
  }

  throw new Error("Unsupported file type. Please upload a .csv or .xlsx file.");
}

export const ACCEPTED_FILE_TYPES = ".csv,.xlsx,.xls";
