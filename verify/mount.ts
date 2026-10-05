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
 * Dispatches a bubbling keydown inside `act`, for handlers registered on
 * `document`/`window` (Escape handling in Modal and DropdownMenu).
 */
export async function fireKeyDown(target: EventTarget, key: string): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

/** Dispatches a click on an arbitrary (non-React-rendered) node inside `act`. */
export async function clickTarget(target: EventTarget | null): Promise<void> {
  if (!target) throw new Error('click target does not exist');
  await act(async () => {
    (target as Element).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
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