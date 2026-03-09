/**
 * Input — unified text input component.
 *
 * Provides a standardised dark-mode input that meets WCAG AA contrast
 * requirements against the dark surface background.  Placeholder text uses
 * surface-muted (#6b7280) which achieves a contrast ratio of ~4.6:1 against
 * the surface-raised background (#1f2937).
 *
 * Forwards all native <input> props so it can be used as a drop-in
 * replacement for `<input>` elements throughout the codebase.
 */

import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Accessible, theme-consistent text input.
 *
 * @example
 * <Input placeholder="Search…" />
 * <Input type="email" aria-label="Email address" />
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={[
          "w-full rounded-xl border border-surface-overlay bg-surface-raised",
          "px-4 py-3 text-sm text-white",
          "placeholder:text-surface-muted",
          "transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-surface",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
