import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-input border border-hairline bg-surface px-3 py-2 text-sm text-ink",
        "placeholder:text-subtle",
        "focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40 transition-colors",
        className
      )}
      {...props}
    />
  );
}

export { Input };
