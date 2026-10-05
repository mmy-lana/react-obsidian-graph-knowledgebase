import React from 'react';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: React.ReactNode;
  /** Renders an interactive pill (tag filters, link counters). */
  onClick?: () => void;
  active?: boolean;
  title?: string;
  className?: string;
  testId?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-elevated text-text-muted border-border',
  info: 'bg-node-cyan/12 text-node-cyan border-node-cyan/35',
  success: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/35',
  warning: 'bg-node-amber/12 text-node-amber border-node-amber/35',
  danger: 'bg-node-rose/12 text-node-rose border-node-rose/35',
  purple: 'bg-node-purple/12 text-node-purple border-node-purple/35',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'h-5 px-1.5 text-[10px] gap-1',
  md: 'h-6 px-2 text-[11px] gap-1.5',
};

/** Compact pill used for tags, link counts and metadata chips. */
export function Badge({
  children,
  tone = 'neutral',
  size = 'md',
  icon,
  onClick,
  active = false,
  title,
  className = '',
  testId,
}: BadgeProps) {
  const base = [
    'inline-flex max-w-full items-center rounded-full border font-medium',
    'transition-colors duration-150',
    SIZE_CLASSES[size],
    TONE_CLASSES[tone],
    onClick ? 'min-h-7 cursor-pointer hover:brightness-125 focus:outline-none focus-visible:ring-1 focus-visible:ring-node-cyan' : '',
    active ? 'ring-1 ring-inset ring-current' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {icon ? (
        <span aria-hidden="true" className="flex shrink-0 items-center [&_svg]:h-3 [&_svg]:w-3">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} aria-pressed={active} data-testid={testId} className={base}>
        {content}
      </button>
    );
  }

  return (
    <span title={title} data-testid={testId} className={base}>
      {content}
    </span>
  );
}

export default Badge;