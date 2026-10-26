import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ui";

// shadcn/ui-style button, restyled to Rift Ledger tokens.
const button = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-quill text-quill-ink hover:bg-quill/90",
        secondary: "border border-rule-strong bg-sheet text-ink hover:bg-hover",
        ghost: "text-ink-2 hover:bg-hover hover:text-ink",
        danger: "bg-loss text-white hover:bg-loss/90",
      },
      size: {
        sm: "h-8 px-2.5 text-[13px]",
        md: "h-9 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(button({ variant, size }), className)} type={asChild ? undefined : (type ?? "button")} {...props} />;
}
