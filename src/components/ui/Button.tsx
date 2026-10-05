import React, { forwardRef } from 'react';

/** Visual emphasis of a button. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Control height. Every size keeps a 44px tap target below the `md` breakpoint. */
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the full width of the parent container. */
  fullWidth?: boolean;
  /** Shows a spinner, disables interaction and marks the control busy for AT. */
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  /** Convenience hook used by end-to-end checks; sets `data-testid`. */
  testId?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-node-cyan text-canvas hover:bg-node-cyan/85 active:bg-node-cyan/75 border border-transparent font-semibold disabled:hover:bg-node-cyan',
  secondary:
    'bg-elevated text-text-main border border-border hover:border-node-cyan/60 hover:bg-elevated/80 active:bg-elevated',
  ghost:
    'bg-transparent text-text-muted border border-transparent hover:bg-elevated hover:text-text-main active:bg-elevated/70',
  danger:
    'bg-node-rose/15 text-node-rose border border-node-rose/40 hover:bg-node-rose/25 active:bg-node-rose/35 font-medium',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-11 md:min-h-8 px-3 md:px-2.5 text-xs md:text-[13px] gap-1.5 rounded-md',
  md: 'min-h-11 md:min-h-9 px-4 md:px-3.5 text-sm gap-2 rounded-lg',
  lg: 'min-h-11 md:min-h-11 px-5 text-base gap-2.5 rounded-lg',
};

/**
 * Primary interactive control. Sized for touch first (44px minimum height on
 * mobile) while staying compact from the `md` breakpoint upwards.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    fullWidth = false,
    loading = false,
    leadingIcon,
    trailingIcon,
    testId,
    className = '',
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = Boolean(disabled) || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      data-testid={testId}
      aria-busy={loading || undefined}
      className={[
        'inline-flex select-none items-center justify-center whitespace-nowrap',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children !== undefined && children !== null ? <span className="truncate">{children}</span> : null}
      {!loading && trailingIcon}
    </button>
  );
});

export default Button;