import { ShoppingCart } from "lucide-react";

import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export default function OrdersPage() {
  return (
    <PlaceholderPage
      title="Orders"
      description="Manage and track customer orders for AI call automation."
      icon={ShoppingCart}
    />
  );
}
