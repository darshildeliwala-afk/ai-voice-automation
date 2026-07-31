import { PaymentType } from "../../generated/prisma/client";
import type { ImportField } from "./field-synonyms";
import { REQUIRED_IMPORT_FIELDS } from "./field-synonyms";

export interface NormalizedImportRow {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  orderReference: string;
  paymentType: PaymentType;
  itemName: string;
  itemSku?: string;
  itemQuantity: number;
  itemUnitPrice: number;
}

export interface RowValidationResult {
  errors: string[];
  normalized: NormalizedImportRow | null;
}

const PAYMENT_TYPE_SYNONYMS: Record<string, PaymentType> = {
  prepaid: PaymentType.PREPAID,
  online: PaymentType.PREPAID,
  "online payment": PaymentType.PREPAID,
  cod: PaymentType.COD,
  "cash on delivery": PaymentType.COD,
  "partial cod": PaymentType.PARTIAL_COD,
  "partial cash on delivery": PaymentType.PARTIAL_COD,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeValue(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function resolvePaymentType(raw: string): PaymentType | null {
  const normalized = normalizeValue(raw);

  const direct = Object.values(PaymentType).find(
    (value) => value.toLowerCase() === normalized,
  );

  if (direct) {
    return direct;
  }

  return PAYMENT_TYPE_SYNONYMS[normalized] ?? null;
}

export function validateMappedRow(
  mappedData: Partial<Record<ImportField, string>>,
): RowValidationResult {
  const errors: string[] = [];

  for (const field of REQUIRED_IMPORT_FIELDS) {
    if (!mappedData[field] || mappedData[field]?.trim() === "") {
      errors.push(`${field} is required`);
    }
  }

  const phone = mappedData.customerPhone?.replace(/[^0-9]/g, "");
  if (
    mappedData.customerPhone &&
    (!phone || phone.length < 7 || phone.length > 15)
  ) {
    errors.push("customerPhone must be a valid phone number");
  }

  const email = mappedData.customerEmail?.trim();
  if (email && !EMAIL_REGEX.test(email)) {
    errors.push("customerEmail must be a valid email address");
  }

  let paymentType: PaymentType | null = null;
  if (mappedData.paymentType) {
    paymentType = resolvePaymentType(mappedData.paymentType);
    if (!paymentType) {
      errors.push(
        `paymentType "${mappedData.paymentType}" is not recognized (expected PREPAID, COD, or PARTIAL_COD)`,
      );
    }
  }

  let quantity: number | null = null;
  if (mappedData.itemQuantity) {
    quantity = Number(mappedData.itemQuantity);
    if (
      !Number.isFinite(quantity) ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      errors.push("itemQuantity must be a positive whole number");
      quantity = null;
    }
  }

  let unitPrice: number | null = null;
  if (mappedData.itemUnitPrice) {
    unitPrice = Number(mappedData.itemUnitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      errors.push("itemUnitPrice must be a positive number");
      unitPrice = null;
    }
  }

  if (
    errors.length > 0 ||
    !phone ||
    !paymentType ||
    quantity === null ||
    unitPrice === null
  ) {
    return { errors, normalized: null };
  }

  return {
    errors,
    normalized: {
      customerName: mappedData.customerName!.trim(),
      customerPhone: phone,
      customerEmail: email || undefined,
      orderReference: mappedData.orderReference!.trim(),
      paymentType,
      itemName: mappedData.itemName!.trim(),
      itemSku: mappedData.itemSku?.trim() || undefined,
      itemQuantity: quantity,
      itemUnitPrice: unitPrice,
    },
  };
}
