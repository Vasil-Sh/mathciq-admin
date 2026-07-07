import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-[6px] border border-graphite bg-void px-3 py-2 text-sm text-ghost",
        "placeholder:text-steel",
        "focus:border-lavender focus:ring-1 focus:ring-lavender/30 focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "transition-colors",
        className
      )}
      {...props}
    />
  );
}

export { Input };
