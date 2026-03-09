/**
 * Badge — inline status indicator using class-variance-authority (CVA).
 *
 * Variants:
 *   default     — brand-400 (yellow) for general highlights
 *   success     — success-600 green for completed / positive states
 *   danger      — danger-500 red for errors / critical states
 *   warning     — brand-500 amber for caution states
 *   muted       — surface-overlay with muted text for secondary info
 *
 * Sizes:
 *   sm (default), md
 *
 * All variants meet WCAG AA contrast on the dark-mode surface background.
 */

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const badgeVariants = cva(
  // ── Shared base ───────────────────────────────────────────────────────
  "inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-brand-400 text-gray-950",
        success: "bg-success-600 text-white",
        danger: "bg-danger-500 text-white",
        warning: "bg-brand-500 text-gray-950",
        muted: "bg-surface-overlay text-surface-muted",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Accessible, theme-consistent status badge.
 *
 * @example
 * <Badge variant="success">Paid</Badge>
 * <Badge variant="danger" size="md">Overdue</Badge>
 */
function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={[badgeVariants({ variant, size }), className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
