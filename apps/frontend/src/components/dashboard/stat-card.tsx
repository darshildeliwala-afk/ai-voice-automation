import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatCardData } from "@/lib/dashboard-data";

const accentStyles = [
  "from-violet-500/10 to-violet-500/5 ring-violet-500/20",
  "from-blue-500/10 to-blue-500/5 ring-blue-500/20",
  "from-emerald-500/10 to-emerald-500/5 ring-emerald-500/20",
  "from-amber-500/10 to-amber-500/5 ring-amber-500/20",
];

export function StatCard({
  stat,
  index,
}: {
  stat: StatCardData;
  index: number;
}) {
  const TrendIcon = stat.trend === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <Card
      className={cn(
        "relative overflow-hidden bg-gradient-to-br ring-1",
        accentStyles[index % accentStyles.length]
      )}
    >
      <CardHeader>
        <CardDescription>{stat.title}</CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight">
          {stat.value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-sm font-medium",
              stat.trend === "up" ? "text-emerald-600" : "text-red-600"
            )}
          >
            <TrendIcon className="size-4" />
            {stat.change}
          </span>
          <span className="text-sm text-muted-foreground">
            {stat.description}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
