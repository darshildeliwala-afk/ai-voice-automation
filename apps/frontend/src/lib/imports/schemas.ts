import { z } from "zod";

export const mappingSchema = z.object({
  customerName: z.string().min(1, "Required"),
  customerPhone: z.string().min(1, "Required"),
  customerEmail: z.string().optional(),
  orderReference: z.string().min(1, "Required"),
  paymentType: z.string().min(1, "Required"),
  itemName: z.string().min(1, "Required"),
  itemSku: z.string().optional(),
  itemQuantity: z.string().min(1, "Required"),
  itemUnitPrice: z.string().min(1, "Required"),
});

export type MappingFormValues = z.infer<typeof mappingSchema>;
