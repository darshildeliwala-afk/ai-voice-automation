export const ORDER_STATUSES = [
  "Pending",
  "Queued",
  "Calling",
  "Completed",
  "Failed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Order = {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  amount: number;
  status: OrderStatus;
  createdAt: string;
};

export type ParsedOrderRow = {
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  amount: number;
};

export const PAGE_SIZE = 10;
