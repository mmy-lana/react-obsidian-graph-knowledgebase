import { forwardRef, useId } from 'react';

export interface SliderProps {
  /** Accessible + visible label. */
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Optional commit callback fired on pointer/key release. */
  onCommit?: (value: number) => void;
  /** Formats the readout; defaults to the raw number. */
  formatValue?: (value: number) => string;
  description?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Range control for graph physics tuning.
 * Built on the native `input[type=range]` so keyboard, screen reader and
 * assistive technology support come for free, with a live numeric readout.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    label,
    value,
    min,
    max,
    step = 1,
    onChange,
    onCommit,
    formatValue,
    description,
    disabled = false,
    className = '',
    testId,
  },
  ref,
) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const percentage = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className={['flex w-full flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-text-muted">
          {label}
        </label>
        <span
          className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-node-cyan"
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {formatValue ? formatValue(value) : value}
        </span>
      </div>

      <input
        ref={ref}
        id={id}
        type="range"
        role="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatValue ? formatValue(value) : String(value)}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={() => onCommit?.(value)}
        onKeyUp={() => onCommit?.(value)}
        onBlur={() => onCommit?.(value)}
        style={{
          background: `linear-gradient(to right, var(--color-node-cyan) ${percentage}%, var(--color-elevated) ${percentage}%)`,
        }}
        className={[
          'h-6 w-full cursor-pointer appearance-none rounded-full bg-elevated',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-node-cyan',
          'disabled:cursor-not-allowed disabled:opacity-50',
          '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-canvas',
          '[&::-webkit-slider-thumb]:bg-node-cyan',
          '[&::-webkit-slider-thumb]:shadow',
          '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-canvas',
          '[&::-moz-range-thumb]:bg-node-cyan',
        ].join(' ')}
      />

      {description ? (
        <p id={descriptionId} className="text-[11px] text-text-subtle">
          {description}
        </p>
      ) : null}
    </div>
  );
});

export default Slider;