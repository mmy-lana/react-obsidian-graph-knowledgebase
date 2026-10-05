import React, { forwardRef, useId } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visible label rendered above the control. */
  label?: string;
  /** Validation message. Sets `aria-invalid` and wires `aria-describedby`. */
  error?: string;
  /** Supplementary hint rendered below the control. */
  hint?: string;
  leadingIcon?: React.ReactNode;
  trailingSlot?: React.ReactNode;
  size?: InputSize;
  /** Hide the label visually while keeping it available to assistive tech. */
  hideLabel?: boolean;
  fullWidth?: boolean;
  /** Convenience hook used by end-to-end checks; sets `data-testid`. */
  testId?: string;
}

const FIELD_SIZE_CLASSES: Record<InputSize, string> = {
  sm: 'min-h-11 md:min-h-8 px-2.5 text-xs md:text-[13px]',
  md: 'min-h-11 md:min-h-9 px-3 text-sm',
  lg: 'min-h-11 md:min-h-11 px-3.5 text-base md:text-base',
};

/**
 * Text input with label, hint and error wiring.
 * Font size never drops below 16px-equivalent scaling rules so iOS does not
 * zoom while typing (`text-base` on touch, `text-sm` from `md` upwards).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    hint,
    leadingIcon,
    trailingSlot,
    size = 'md',
    hideLabel = false,
    fullWidth = true,
    testId,
    className = '',
    id,
    type = 'text',
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `input-${generatedId}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className={fullWidth ? 'flex w-full flex-col gap-1.5' : 'flex flex-col gap-1.5'}>
      {label ? (
        <label
          htmlFor={inputId}
          className={[
            'text-xs font-medium text-text-muted',
            hideLabel ? 'sr-only' : '',
          ].join(' ')}
        >
          {label}
        </label>
      ) : null}

      <div className="relative flex w-full items-center">
        {leadingIcon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 flex items-center text-text-subtle [&_svg]:h-4 [&_svg]:w-4"
          >
            {leadingIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          type={type}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
          }
          className={[
            'w-full rounded-lg border bg-canvas text-text-main placeholder:text-text-subtle',
            'transition-colors duration-150 focus:outline-none',
            'focus:ring-1 focus:ring-node-cyan focus:border-node-cyan/70',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-node-rose/70' : 'border-border hover:border-text-subtle',
            leadingIcon ? 'pl-9' : '',
            trailingSlot ? 'pr-9' : '',
            FIELD_SIZE_CLASSES[size],
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />

        {trailingSlot ? (
          <span className="absolute right-1.5 flex items-center">{trailingSlot}</span>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-node-rose">
          {error}
        </p>
      ) : null}

      {hint && !error ? (
        <p id={hintId} className="text-xs text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Input;