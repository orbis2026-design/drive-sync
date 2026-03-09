/**
 * Button — unified button component using class-variance-authority (CVA).
 *
 * Variants:
 *   default    — brand-400 (warning yellow) for primary interactive actions
 *   secondary  — surface-raised with white text for secondary actions
 *   destructive — danger-500 (red) for destructive / irreversible actions
 *   outline    — transparent background with surface-overlay border
 *   ghost      — transparent, no border, subtle hover
 *
 * Sizes:
 *   sm, md (default), lg
 *
 * All variants meet WCAG AA contrast on the dark-mode surface background and
 * the 48 px minimum touch-target requirement.
 */

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
  // ── Base classes shared across all variants ────────────────────────────
  [
    "inline-flex items-center justify-center gap-2",
    "rounded-xl font-bold",
    "min-h-touch min-w-touch",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "cursor-pointer",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Primary CTA — high-visibility brand yellow */
        default:
          "bg-brand-400 text-gray-950 hover:bg-brand-300 active:bg-brand-500",
        /** Secondary action — raised surface */
        secondary:
          "bg-surface-raised text-white border border-surface-overlay hover:bg-surface-overlay",
        /** Destructive / irreversible action — danger red */
        destructive:
          "bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700",
        /** Outlined — transparent with border */
        outline:
          "bg-transparent text-white border border-surface-overlay hover:bg-surface-raised",
        /** Ghost — no background or border */
        ghost:
          "bg-transparent text-surface-muted hover:text-white hover:bg-surface-raised",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-5 py-3 text-base",
        lg: "px-7 py-4 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/**
 * Accessible, theme-consistent button.
 *
 * @example
 * <Button>Save</Button>
 * <Button variant="destructive">Delete</Button>
 * <Button variant="outline" size="sm">Cancel</Button>
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={[buttonVariants({ variant, size }), className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
