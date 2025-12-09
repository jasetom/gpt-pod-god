import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = {
  id: string;
  label: string;
  description: string;
};

type ProgressStepperProps = {
  steps: Step[];
  currentStep: number;
  status: "idle" | "processing" | "complete" | "error";
};

export function ProgressStepper({ steps, currentStep, status }: ProgressStepperProps) {
  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isPending = index > currentStep;

          return (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-500",
                    isCompleted && "border-accent bg-accent/20",
                    isCurrent && status === "processing" && "border-primary bg-primary/20",
                    isCurrent && status === "complete" && "border-accent bg-accent/20",
                    isCurrent && status === "error" && "border-destructive bg-destructive/20",
                    isPending && "border-muted bg-muted/20"
                  )}
                >
                  {/* Pulse ring animation for current step */}
                  {isCurrent && status === "processing" && (
                    <div className="absolute inset-0 rounded-full border-2 border-primary animate-pulse-ring" />
                  )}
                  
                  {isCompleted ? (
                    <CheckCircle className="h-6 w-6 text-accent" />
                  ) : isCurrent && status === "processing" ? (
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  ) : isCurrent && status === "complete" ? (
                    <CheckCircle className="h-6 w-6 text-accent" />
                  ) : (
                    <Circle className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                
                <div className="mt-3 text-center">
                  <p
                    className={cn(
                      "text-sm font-medium transition-colors duration-300",
                      isCompleted && "text-accent",
                      isCurrent && "text-foreground",
                      isPending && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[120px]">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="w-16 sm:w-24 h-0.5 mx-2 sm:mx-4 mt-[-2rem]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      index < currentStep ? "bg-accent" : "bg-muted"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
