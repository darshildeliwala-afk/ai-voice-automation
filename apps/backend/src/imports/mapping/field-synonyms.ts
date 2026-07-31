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

export const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  customerName: ["name", "customer name", "customer", "full name", "buyer name"],
  customerPhone: [
    "phone",
    "phone number",
    "mobile",
    "mobile number",
    "contact",
    "contact number",
    "customer phone",
  ],
  customerEmail: ["email", "email address", "customer email"],
  orderReference: [
    "order id",
    "order number",
    "order ref",
    "order reference",
    "orderid",
    "order_id",
    "reference",
  ],
  paymentType: ["payment type", "payment method", "payment", "pay type", "mode of payment"],
  itemName: ["item", "item name", "product", "product name", "sku name"],
  itemSku: ["sku", "item sku", "product sku", "product code"],
  itemQuantity: ["qty", "quantity", "item qty", "units"],
  itemUnitPrice: ["price", "unit price", "item price", "rate", "amount"],
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type SuggestedMapping = Partial<Record<ImportField, string>>;

export function detectMapping(headers: string[]): SuggestedMapping {
  const normalizedHeaders = headers.map((header) => ({
    header,
    normalized: normalize(header),
  }));

  const mapping: SuggestedMapping = {};

  for (const field of IMPORT_FIELDS) {
    const candidates = [field, ...FIELD_SYNONYMS[field]].map(normalize);

    const match = normalizedHeaders.find(({ normalized }) =>
      candidates.includes(normalized),
    );

    if (match) {
      mapping[field] = match.header;
    }
  }

  return mapping;
}
