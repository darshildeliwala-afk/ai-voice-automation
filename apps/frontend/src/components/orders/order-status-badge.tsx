import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/orders/types";

const statusStyles: Record<OrderStatus, string> = {
  Pending: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/10",
  Queued: "bg-slate-500/10 text-slate-700 hover:bg-slate-500/10",
  Calling: "bg-violet-500/10 text-violet-700 hover:bg-violet-500/10",
  Completed: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10",
  Failed: "bg-red-500/10 text-red-700 hover:bg-red-500/10",
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(statusStyles[status], status === "Calling" && "animate-pulse", className)}
    >
      {status}
    </Badge>
  );
}
