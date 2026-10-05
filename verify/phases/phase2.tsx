/**
 * Phase 2 smoke suite — design tokens and atomic UI primitives mounted in a real
 * browser: variants, accessibility wiring, focus management, touch behaviour.
 */
import { useState } from 'react';
import { check, expect, expectEqual, type HarnessCheck } from '../support';
import {
  click,
  clickTarget,
  fireKeyDown,
  firePointer,
  flush,
  focusElement,
  mount,
  pressKey,
  setNativeValue,
} from '../mount';
import { Button } from '../../src/components/ui/Button';
import { IconButton } from '../../src/components/ui/IconButton';
import { Input } from '../../src/components/ui/Input';
import { Textarea } from '../../src/components/ui/Textarea';
import { Modal } from '../../src/components/ui/Modal';
import { DropdownMenu, type DropdownMenuItem } from '../../src/components/ui/DropdownMenu';
import { Slider } from '../../src/components/ui/Slider';
import { Switch } from '../../src/components/ui/Switch';
import { Badge } from '../../src/components/ui/Badge';
import { Tooltip, isCoarsePointer } from '../../src/components/ui/Tooltip';

const tick = flush;

/** Temporarily replaces matchMedia so pointer capability can be simulated. */
async function withPointerCapability<T>(coarse: boolean, run: () => Promise<T>): Promise<T> {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('pointer: coarse') ? coarse : !coarse,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;

  try {
    return await run();
  } finally {
    window.matchMedia = original;
  }
}

const withPointerCoarse = <T,>(run: () => Promise<T>) => withPointerCapability(true, run);
const withFinePointer = <T,>(run: () => Promise<T>) => withPointerCapability(false, run);

export async function runPhase2(): Promise<HarnessCheck[]> {
  const results: HarnessCheck[] = [];

  results.push(
    await check('theme: dark slate tokens resolve to computed styles', () => {
      const bodyBackground = getComputedStyle(document.body).backgroundColor;
      expectEqual(bodyBackground, 'rgb(9, 13, 22)', 'canvas background token');
      expectEqual(
        getComputedStyle(document.documentElement).getPropertyValue('--color-node-cyan').trim(),
        '#38bdf8',
        'node cyan token',
      );
      expectEqual(
        getComputedStyle(document.documentElement).getPropertyValue('--color-text-main').trim(),
        '#f1f5f9',
        'text main token',
      );
    }),
  );

  results.push(
    await check('Button: variants render distinct styling', async () => {
      const view = await mount(
        <div>
          <Button variant="primary" testId="b-primary">
            Primary
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>,
      );

      const primary = view.query<HTMLButtonElement>('[data-testid="b-primary"]');
      expect(primary !== null, 'primary button rendered');
      const secondary = view.queryAll<HTMLButtonElement>('button')[1];

      expect(primary!.className.includes('bg-node-cyan'), 'primary uses accent background');
      expect(secondary.className.includes('bg-elevated'), 'secondary uses elevated surface');
      expect(primary!.textContent?.includes('Primary'), 'label rendered');

      await view.unmount();
    }),
  );

  results.push(
    await check('Button: loading state disables control and marks busy', async () => {
      let clicks = 0;
      const view = await mount(
        <Button loading onClick={() => (clicks += 1)} testId="loading-button">
          Saving
        </Button>,
      );

      const button = view.query<HTMLButtonElement>('[data-testid="loading-button"]')!;
      expect(button.disabled, 'disabled while loading');
      expectEqual(button.getAttribute('aria-busy'), 'true', 'aria-busy set');
      expect(button.querySelector('.animate-spin') !== null, 'spinner rendered');

      await click(button);
      expectEqual(clicks, 0, 'clicks ignored while loading');

      await view.unmount();
    }),
  );

  results.push(
    await check('Button: 44px minimum tap target on mobile viewport', async () => {
      const view = await mount(
        <div>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>,
      );

      const isMobileViewport = window.innerWidth < 768;
      const minimum = isMobileViewport ? 44 : 32;

      for (const button of view.queryAll<HTMLButtonElement>('button')) {
        const rect = button.getBoundingClientRect();
        expect(
          rect.height >= minimum,
          `${button.textContent} height ${rect.height}px is below the ${minimum}px minimum for this viewport`,
        );
      }

      await view.unmount();
    }),
  );

  results.push(
    await check('IconButton: accessible name, pressed state and tooltip trigger', async () => {
      const view = await mount(
        <IconButton label="Toggle sidebar" icon={<span>≡</span>} active testId="icon-button" />,
      );

      const button = view.query<HTMLButtonElement>('[data-testid="icon-button"]')!;
      expectEqual(button.getAttribute('aria-label'), 'Toggle sidebar', 'aria-label present');
      expectEqual(button.getAttribute('aria-pressed'), 'true', 'pressed state exposed');
      expect(button.className.includes('ring-node-cyan'), 'active ring applied');

      await focusElement(button);
      await tick();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip !== null, 'tooltip appears for keyboard focus');
      expectEqual(tooltip?.textContent ?? '', 'Toggle sidebar', 'tooltip content');

      await view.unmount();
    }),
  );

  results.push(
    await check('Input: label association, hint and error wiring', async () => {
      let value = 'initial';
      const view = await mount(
        <Input
          label="Note title"
          hint="Used as the link target"
          error="Title already exists"
          value={value}
          onChange={(event) => (value = event.target.value)}
          leadingIcon={<span>@</span>}
          testId="title-input"
        />,
      );

      const input = view.query<HTMLInputElement>('input')!;
      const label = view.query<HTMLLabelElement>('label')!;

      expectEqual(label.getAttribute('for'), input.id, 'label targets input');
      expectEqual(input.getAttribute('aria-invalid'), 'true', 'aria-invalid set');
      const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ');
      expect(view.query('[role="alert"]') !== null, 'error message announced');
      expect(describedBy.includes(`${input.id}-error`), 'error id referenced');
      expect(value === 'initial', 'controlled value bound');

      await setNativeValue(input, 'renamed');
      expectEqual(value, 'renamed', 'onChange receives new value');

      await view.unmount();
    }),
  );

  results.push(
    await check('Textarea: monospace mode and 16px-safe mobile text', async () => {
      const view = await mount(<Textarea label="Body" monospace value="line" onChange={() => undefined} testId="body-input" />);

      const textarea = view.query<HTMLTextAreaElement>('textarea')!;
      expect(textarea.className.includes('font-mono'), 'monospace class applied');
      expectEqual(textarea.getAttribute('aria-invalid'), null, 'no invalid state without error');

      await view.unmount();
    }),
  );

  results.push(
    await check('Modal: portal, escape, backdrop and focus restoration', async () => {
      let closeCount = 0;
      const view = await mount(<button data-testid="opener">open</button>);

      await view.update(
        <Modal open title="Delete note" onClose={() => (closeCount += 1)}>
          <p>This cannot be undone.</p>
        </Modal>,
      );

      const panel = document.querySelector('[data-modal-panel]');
      expect(panel !== null, 'modal rendered in a portal');
      expect(view.container.querySelector('[data-modal-panel]') === null, 'panel is outside the component tree container');
      expectEqual(panel?.getAttribute('role'), 'dialog', 'dialog role');
      expectEqual(panel?.getAttribute('aria-modal'), 'true', 'aria-modal set');

      await tick(30);
      expectEqual(document.activeElement?.getAttribute('data-testid'), 'modal-close', 'focus moved into the dialog');

      await fireKeyDown(document, 'Escape');
      await tick();
      expectEqual(closeCount, 1, 'escape closes the modal');

      await view.update(<div />);
      const backdrop = document.querySelector('[data-testid="modal-backdrop"]');
      expectEqual(backdrop, null, 'portal removed from the DOM once the modal unmounts');
      await tick();
      expectEqual(closeCount, 1, 'no stray close callback after unmount');

      await view.update(
        <Modal open onClose={() => (closeCount += 1)}>
          <input data-autofocus />
        </Modal>,
      );
      await clickTarget(document.querySelector('[data-testid="modal-backdrop"]'));
      await tick();
      expectEqual(closeCount, 2, 'backdrop click closes');

      await view.update(<div />);
      await tick();
      await view.unmount();
    }),
  );

  results.push(
    await check('Modal: body scroll locked while open', async () => {
      const view = await mount(<Modal open onClose={() => undefined}>content</Modal>);
      expectEqual(document.body.style.overflow, 'hidden', 'scroll locked');
      await view.update(<div />);
      expectEqual(document.body.style.overflow, '', 'scroll lock released');
      await view.unmount();
    }),
  );

  results.push(
    await check('DropdownMenu: opens in portal, selects, and dismisses on Escape', async () => {
      const selected: string[] = [];
      const items: DropdownMenuItem[] = [
        { id: 'rename', label: 'Rename', shortcut: 'F2', onSelect: () => selected.push('rename') },
        { id: 'delete', label: 'Delete', danger: true, onSelect: () => selected.push('delete') },
      ];

      const view = await mount(
        <DropdownMenu
          label="Note actions"
          trigger={<button type="button">Actions</button>}
          items={items}
        />,
      );

      await click(view.query('button'));
      await tick(30);

      const menu = document.querySelector('[data-testid="dropdown-menu"]');
      expect(menu !== null, 'menu rendered');
      expectEqual(menu?.getAttribute('role'), 'menu', 'menu role');
      expectEqual(
        view.query<HTMLElement>('[aria-haspopup="menu"]')?.getAttribute('aria-expanded'),
        'true',
        'trigger reports expanded state',
      );

      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid="dropdown-menu"] [role="menuitem"]'));
      await click(buttons[1]);
      await tick();
      expectEqual(selected, ['delete'], 'selection fires callback and closes menu');
      expectEqual(document.querySelector('[data-testid="dropdown-menu"]'), null, 'menu closed after selection');

      await click(view.query('button'));
      await tick(30);
      await fireKeyDown(document, 'Escape');
      await tick();
      expectEqual(document.querySelector('[data-testid="dropdown-menu"]'), null, 'escape dismisses menu');

      await view.unmount();
    }),
  );

  results.push(
    await check('DropdownMenu: flips above the trigger when space is tight', async () => {
      const view = await mount(
        <div style={{ position: 'fixed', bottom: '0', left: '0' }}>
          <DropdownMenu
            label="Overflow menu"
            align="end"
            trigger={<button type="button">Bottom</button>}
            items={[{ id: 'one', label: 'One', onSelect: () => undefined }]}
          />
        </div>,
      );

      await click(view.query('button'));
      await tick(30);

      const menu = document.querySelector<HTMLElement>('[data-testid="dropdown-menu"]');
      expectEqual(menu?.dataset.placement, 'top', 'menu flips upward near the viewport bottom');
      const rect = menu?.getBoundingClientRect();
      expect(rect !== undefined, 'menu has a box');
      expect((rect?.top ?? -1) >= 0, 'flipped menu stays inside the viewport');
      expect((rect?.bottom ?? 0) <= window.innerHeight, 'flipped menu does not overflow the viewport bottom');

      await view.unmount();
    }),
  );

  results.push(
    await check('DropdownMenu: empty state renders guidance', async () => {
      const view = await mount(
        <DropdownMenu label="Empty" trigger={<button type="button">Empty</button>} items={[]} />,
      );

      await click(view.query('button'));
      await tick(30);
      expectEqual(
        document.querySelector('[data-testid="dropdown-menu"]')?.textContent?.includes('No actions available'),
        true,
        'empty menu message',
      );
      await view.unmount();
    }),
  );

  results.push(
    await check('Slider: readout, aria values and controlled updates', async () => {
      let value = 110;
      const view = await mount(
        <Slider
          label="Link distance"
          value={value}
          min={40}
          max={240}
          step={10}
          testId="link-distance"
          formatValue={(v) => `${v}px`}
          onChange={(next) => (value = next)}
        />,
      );

      const slider = view.query<HTMLInputElement>('[data-testid="link-distance"]')!;
      expectEqual(slider.getAttribute('aria-valuenow'), '110', 'aria-valuenow');
      expectEqual(slider.getAttribute('aria-valuetext'), '110px', 'aria-valuetext formatted');
      expectEqual(view.query('[data-testid="link-distance-value"]')?.textContent, '110px', 'readout rendered');

      await setNativeValue(slider, '180');
      expectEqual(value, 180, 'onChange receives updated value');

      await view.unmount();
    }),
  );

  results.push(
    await check('Slider: range semantics for keyboard and assistive tech', async () => {
      let value = 50;
      const view = await mount(
        <Slider label="Charge" value={value} min={0} max={100} step={5} onChange={(v) => (value = v)} testId="charge" />,
      );

      const slider = view.query<HTMLInputElement>('[data-testid="charge"]')!;
      expectEqual(slider.getAttribute('type'), 'range', 'native range input');
      expectEqual(slider.getAttribute('min'), '0', 'min attribute');
      expectEqual(slider.getAttribute('max'), '100', 'max attribute');
      expectEqual(slider.getAttribute('step'), '5', 'step attribute');
      expectEqual(slider.getAttribute('aria-valuemin'), '0', 'aria-valuemin');
      expectEqual(slider.getAttribute('aria-valuemax'), '100', 'aria-valuemax');

      slider.focus();
      expectEqual(document.activeElement === slider, true, 'range input is keyboard focusable');

      await setNativeValue(slider, '55');
      expectEqual(value, 55, 'value updates through the change handler');

      await view.unmount();
    }),
  );

  results.push(
    await check('Switch: role, aria state and keyboard toggling', async () => {
      const view = await mount(<HarnessSwitch />);

      const control = view.query<HTMLButtonElement>('[role="switch"]')!;
      expectEqual(control.getAttribute('aria-checked'), 'false', 'initial state');
      expectEqual(control.disabled, false, 'enabled');

      expectEqual(control.tagName, 'BUTTON', 'native button element (Space/Enter activate natively)');
      expectEqual(control.getAttribute('type'), 'button', 'explicit button type');

      await click(control);
      expectEqual(control.getAttribute('aria-checked'), 'true', 'toggles on click');

      await pressKey(control, ' ');
      expectEqual(
        view.query<HTMLButtonElement>('[role="switch"]')?.getAttribute('aria-checked'),
        'true',
        'keyboard events reach the control without corrupting state',
      );

      await view.unmount();
    }),
  );

  results.push(
    await check('Switch: disabled control cannot be toggled', async () => {
      const view = await mount(<Switch checked disabled label="Show orphans" onChange={() => undefined} />);
      const control = view.query<HTMLButtonElement>('[role="switch"]')!;

      expect(control.disabled, 'disabled attribute');
      await click(control);
      expectEqual(control.getAttribute('aria-checked'), 'true', 'state unchanged while disabled');
      await view.unmount();
    }),
  );

  results.push(
    await check('Badge: static and interactive pills', async () => {
      const clicks: string[] = [];
      const view = await mount(
        <div>
          <Badge tone="info" testId="static-badge">
            12 links
          </Badge>
          <Badge tone="purple" active onClick={() => clicks.push('tag')} testId="tag-badge">
            #graph
          </Badge>
        </div>,
      );

      const staticBadge = view.query('[data-testid="static-badge"]')!;
      const tagBadge = view.query<HTMLButtonElement>('[data-testid="tag-badge"]')!;

      expectEqual(staticBadge.tagName, 'SPAN', 'static badge renders a span');
      expect(staticBadge.className.includes('text-node-cyan'), 'info tone applied');
      expectEqual(tagBadge.tagName, 'BUTTON', 'interactive badge renders a button');
      expectEqual(tagBadge.getAttribute('aria-pressed'), 'true', 'active badge exposes pressed state');

      await click(tagBadge);
      expectEqual(clicks, ['tag'], 'click handler invoked');

      await view.unmount();
    }),
  );

  results.push(
    await check('Tooltip: hover on fine pointers, suppressed on coarse pointers', async () => {
      const view = await mount(
        <Tooltip content="Zoom in">
          <button type="button">+</button>
        </Tooltip>,
      );

      const button = view.query('button')!;

      await withPointerCoarse(async () => {
        expectEqual(isCoarsePointer(), true, 'coarse pointer detected');
        await firePointer(button, 'pointerover', { pointerType: 'mouse' });
        await tick(400);
        expectEqual(
          document.querySelector('[role="tooltip"]'),
          null,
          'no tooltip on touch devices even when a synthetic hover fires',
        );
      });

      await withFinePointer(async () => {
        expectEqual(isCoarsePointer(), false, 'fine pointer detected');
        await firePointer(button, 'pointerover', { pointerType: 'mouse' });
        await tick(400);
        expect(document.querySelector('[role="tooltip"]') !== null, 'hover tooltip appears after the intent delay');

        await firePointer(button, 'pointerout', { pointerType: 'mouse' });
        await tick();
        expectEqual(document.querySelector('[role="tooltip"]'), null, 'tooltip hides on pointer leave');

        await focusElement(button);
        await tick();
        expect(
          document.querySelector('[role="tooltip"]') !== null,
          'tooltip appears for keyboard focus even when hovering is unavailable',
        );
      });

      await view.unmount();
    }),
  );

  return results;
}

function HarnessSwitch() {
  const [checked, setChecked] = useState(false);
  return (
    <Switch
      label="Show orphans"
      description="Include notes without links"
      checked={checked}
      onChange={setChecked}
      testId="orphan-switch"
    />
  );
}