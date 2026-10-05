import React, { forwardRef } from 'react';
import { Tooltip } from './Tooltip';

export type IconButtonVariant = 'ghost' | 'subtle' | 'solid' | 'danger';

export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> {
  /** Required: icon-only controls must expose an accessible name. */
  label: string;
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Renders the pressed/selected indicator (toggles, view switches). */
  active?: boolean;
  /** `false` disables the tooltip, a node replaces the default label text. */
  tooltip?: React.ReactNode | false;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  /** Convenience hook used by end-to-end checks; sets `data-testid`. */
  testId?: string;
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-text-muted hover:bg-elevated hover:text-text-main',
  subtle: 'bg-elevated/70 text-text-muted border border-border hover:text-text-main hover:border-node-cyan/50',
  solid: 'bg-node-cyan text-canvas hover:bg-node-cyan/85',
  danger: 'bg-transparent text-node-rose hover:bg-node-rose/15',
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-11 w-11 md:h-9 md:w-9 rounded-lg [&_svg]:h-4 [&_svg]:w-4',
  lg: 'h-11 w-11 rounded-lg [&_svg]:h-5 [&_svg]:w-5',
};

/**
 * Square icon-only control with a mandatory accessible name and an optional
 * hover/focus tooltip (automatically suppressed on touch devices).
 * Minimum 44x44px on mobile, 32-36px from the `md` breakpoint upwards.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'ghost',
    size = 'md',
    active = false,
    tooltip,
    tooltipPlacement = 'top',
    testId,
    className = '',
    disabled = false,
    type = 'button',
    ...rest
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      data-testid={testId}
      aria-pressed={rest['aria-pressed'] ?? (active || undefined)}
      disabled={disabled}
      className={[
        'inline-flex shrink-0 items-center justify-center transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-node-cyan/15 text-node-cyan ring-1 ring-inset ring-node-cyan/40'
          : VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center">
        {icon}
      </span>
    </button>
  );

  if (tooltip === false) return button;

  return (
    <Tooltip content={tooltip ?? label} placement={tooltipPlacement}>
      {button}
    </Tooltip>
  );
});

export default IconButton;