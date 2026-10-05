/** Tiny React mounting helper for the browser-side verification suites. */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLElement;
  root: Root;
  update: (element: React.ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
  query: <T extends Element = HTMLElement>(selector: string) => T | null;
  queryAll: <T extends Element = HTMLElement>(selector: string) => T[];
  text: (selector: string) => string;
}

export async function mount(element: React.ReactElement): Promise<Mounted> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '400px';
  container.style.zIndex = '1';
  document.body.appendChild(container);

  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });

  return {
    container,
    root,
    async update(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
    query<T extends Element = HTMLElement>(selector: string): T | null {
      return container.querySelector<T>(selector);
    },
    queryAll<T extends Element = HTMLElement>(selector: string): T[] {
      return Array.from(container.querySelectorAll<T>(selector));
    },
    text(selector: string): string {
      return container.querySelector(selector)?.textContent ?? '';
    },
  };
}

/**
 * Dispatches a cancellable wheel event inside `act` and reports whether the
 * handler cancelled it. A passive listener cannot prevent the default action, so
 * this distinguishes a native non-passive binding from a passive one.
 */
export async function dispatchWheel(
  element: Element | null,
  {
    deltaY = -120,
    deltaX = 0,
    deltaMode = 0,
    ctrlKey = false,
    clientX,
    clientY,
  }: {
    deltaY?: number;
    deltaX?: number;
    deltaMode?: number;
    ctrlKey?: boolean;
    clientX?: number;
    clientY?: number;
  } = {},
): Promise<boolean> {
  if (!element) throw new Error('wheel target does not exist');

  const rect = element.getBoundingClientRect();

  let defaultPrevented = false;
  await act(async () => {
    const event = new WheelEvent('wheel', {
      deltaY,
      deltaX,
      deltaMode,
      ctrlKey,
      bubbles: true,
      cancelable: true,
      clientX: clientX ?? rect.left + rect.width / 2,
      clientY: clientY ?? rect.top + rect.height / 2,
    });
    element.dispatchEvent(event);
    defaultPrevented = event.defaultPrevented;
  });

  return defaultPrevented;
}

/** Dispatch a click through React's synthetic event system. */
export async function click(element: Element | null): Promise<void> {
  if (!element) throw new Error('click target does not exist');
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** Set a controlled input/textarea value through the native setter. */
export async function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('native value setter unavailable');
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Press a key on the currently focused element (or `element`). */
export async function pressKey(element: Element | null, key: string, init: KeyboardEventInit = {}): Promise<void> {
  const target = element ?? document.activeElement;
  if (!target) throw new Error('no element to press a key on');
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    if (key === ' ') {
      target.dispatchEvent(
        new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }),
      );
    }
  });
}

/** Dispatch a pointer event through React's synthetic event system. */
export async function firePointer(
  element: Element | null,
  type: 'pointerover' | 'pointerout' | 'pointerdown' | 'pointerup',
  init: PointerEventInit = {},
): Promise<void> {
  if (!element) throw new Error(`pointer target does not exist for ${type}`);
  await act(async () => {
    element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init }));
  });
}

/** Moves DOM focus inside `act` so React focus handlers run synchronously. */
export async function focusElement(element: Element | null): Promise<void> {
  if (!element) throw new Error('focus target does not exist');
  await act(async () => {
    (element as HTMLElement).focus?.();
  });
}

/**
 * Focuses and then blurs an element inside `act`.
 * React listens to `focusout` (not the non-bubbling `blur`), so a real
 * `element.blur()` is the faithful way to exercise `onBlur` handlers.
 */
export async function blurElement(element: Element | null): Promise<void> {
  if (!element) throw new Error('blur target does not exist');
  const focusable = element as HTMLElement;
  await act(async () => {
    focusable.focus?.();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    focusable.blur?.();
  });
}

/** Sets a controlled input value through the native setter, inside `act`. */
export async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('native value setter unavailable');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * Dispatches a bubbling keydown inside `act`, for handlers registered on
 * `document`/`window` (Escape handling in Modal and DropdownMenu).
 */
export async function fireKeyDown(
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

/** Dispatches a click on an arbitrary (non-React-rendered) node inside `act`. */
export async function clickTarget(target: EventTarget | null, { optional = false } = {}): Promise<void> {
  if (!target) {
    if (optional) return;
    throw new Error('click target does not exist');
  }
  await act(async () => {
    (target as Element).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** Runs an async operation inside `act` so live-query updates flush cleanly. */
export async function withAct<T>(operation: () => Promise<T> | T): Promise<T> {
  let result: T | undefined;
  await act(async () => {
    result = await operation();
  });
  return result as T;
}

/** Polls until `predicate` returns true (used to await reactive queries). */
export async function waitFor(
  predicate: () => boolean,
  { timeout = 5_000, label = 'condition' }: { timeout?: number; label?: string } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  throw new Error(`timed out waiting for ${label}`);
}

/**
 * Advances timers, animation frames and pending promises inside `act` so
 * component state updates triggered by `setTimeout`/`requestAnimationFrame`
 * are flushed without React's "not wrapped in act" warnings.
 */
export async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}