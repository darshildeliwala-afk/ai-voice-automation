import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="items-center py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
            <Icon className="size-6 text-muted-foreground" />
          </div>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription className="max-w-md">
            This section is part of the UI shell. Backend integration will be
            added in a future phase.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
