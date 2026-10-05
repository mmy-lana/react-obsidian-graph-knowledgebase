import { useId } from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label; also becomes the control's accessible name. */
  label: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  testId?: string;
}

/**
 * Accessible toggle built on a native `button` with `role="switch"`, so
 * Space/Enter activation, focus ring and screen reader state all work natively.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className = '',
  testId,
}: SwitchProps) {
  const id = useId();
  const descriptionId = `${id}-description`;

  const trackSize = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const thumbSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const thumbOffset = size === 'sm' ? 'translate-x-4' : 'translate-x-5';

  return (
    <div className={['flex items-center justify-between gap-3', className].filter(Boolean).join(' ')}>
      <span className="min-w-0 flex-1">
        <span id={id} className="block text-xs font-medium text-text-muted">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-[11px] text-text-subtle">
            {description}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={[
          'relative shrink-0 rounded-full border transition-colors duration-200',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-node-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'disabled:cursor-not-allowed disabled:opacity-50',
          trackSize,
          checked ? 'border-node-cyan/70 bg-node-cyan/80' : 'border-border bg-elevated',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'absolute left-0.5 top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200',
            thumbSize,
            checked ? thumbOffset : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

export default Switch;