"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface WizardStepperProps {
  steps: string[];
  currentIndex: number;
}

export function WizardStepper({ steps, currentIndex }: WizardStepperProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                isComplete && "bg-primary text-primary-foreground",
                isCurrent &&
                  "bg-primary/15 text-primary ring-2 ring-primary/30",
                !isComplete && !isCurrent && "bg-muted text-muted-foreground"
              )}
            >
              {isComplete ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {step}
            </span>
            {index < steps.length - 1 && (
              <span className="mx-1 h-px w-6 bg-border sm:w-10" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
