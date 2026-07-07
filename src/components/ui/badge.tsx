import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-lavender/50",
  {
    variants: {
      variant: {
        default: "bg-carbon text-ash border border-graphite",
        active: "bg-mint/10 text-mint border border-mint/30",
        expired: "bg-danger/10 text-danger border border-danger/30",
        admin: "bg-lavender/10 text-lavender border border-lavender/30",
        warning: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
