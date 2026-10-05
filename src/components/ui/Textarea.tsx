import React, { forwardRef, useId } from 'react';

export type TextareaSize = 'sm' | 'md' | 'lg';

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  size?: TextareaSize;
  hideLabel?: boolean;
  /** Renders a monospaced face (markdown source editing). */
  monospace?: boolean;
  fullWidth?: boolean;
  /** Convenience hook used by end-to-end checks; sets `data-testid`. */
  testId?: string;
}

const TEXTAREA_SIZE_CLASSES: Record<TextareaSize, string> = {
  sm: 'px-2.5 py-2 text-xs md:text-[13px]',
  md: 'px-3 py-2.5 text-sm',
  lg: 'px-3.5 py-3 text-base',
};

/**
 * Multi-line text control with the same label/error contract as `Input`.
 * `text-base` on touch viewports prevents the iOS focus zoom.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    error,
    hint,
    size = 'md',
    hideLabel = false,
    monospace = false,
    fullWidth = true,
    testId,
    className = '',
    id,
    rows = 4,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? `textarea-${generatedId}`;
  const errorId = `${textareaId}-error`;
  const hintId = `${textareaId}-hint`;

  return (
    <div className={fullWidth ? 'flex w-full flex-col gap-1.5' : 'flex flex-col gap-1.5'}>
      {label ? (
        <label
          htmlFor={textareaId}
          className={['text-xs font-medium text-text-muted', hideLabel ? 'sr-only' : ''].join(' ')}
        >
          {label}
        </label>
      ) : null}

      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
        }
        className={[
          'w-full resize-y rounded-lg border bg-canvas text-text-main placeholder:text-text-subtle',
          'transition-colors duration-150 focus:outline-none',
          'focus:ring-1 focus:ring-node-cyan focus:border-node-cyan/70',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-node-rose/70' : 'border-border hover:border-text-subtle',
          monospace ? 'font-mono leading-relaxed' : '',
          TEXTAREA_SIZE_CLASSES[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />

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

export default Textarea;