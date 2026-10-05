/**
 * Browser-side harness entry. Loads the phase smoke suite, runs it against the
 * real source modules (served through Vite), and publishes the result on
 * `window.__VERIFY__` for the headless Chrome runner to read.
 */
import type { HarnessCheck } from './support';

type PhaseRunner = () => Promise<HarnessCheck[]>;
type PhaseModule = { run: PhaseRunner };

const SUPPORTED_PHASES = ['phase1', 'phase2', 'phase3', 'phase4', 'phase5'] as const;

/**
 * Phase suites are loaded through a computed specifier so Vite does not try to
 * statically resolve a suite that has not been written yet.
 */
async function loadPhase(phase: string): Promise<PhaseModule> {
  const specifier = `./phases/${phase}.tsx`;
  const module = (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>;
  const run = module[`run${phase.charAt(0).toUpperCase()}${phase.slice(1)}`];

  if (typeof run !== 'function') {
    throw new Error(`phase module "${phase}" does not export run${phase}`);
  }
  return { run: run as PhaseRunner };
}

const params = new URLSearchParams(window.location.search);
const phase = params.get('phase') ?? 'phase1';
const outputEl = document.getElementById('harness-output');

function render(results: HarnessCheck[]): void {
  if (!outputEl) return;
  outputEl.innerHTML = results
    .map(
      (r) =>
        `<span class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}</span>  ${r.name}` +
        (r.detail ? ` — ${r.detail}` : ''),
    )
    .join('\n');
}

/**
 * React warns about updates that happen outside `act()` while the harness is
 * mounted programmatically. Those updates come from reactive IndexedDB queries
 * resolving on their own microtask — expected here, not an app defect — so only
 * that exact warning is filtered. Every other console error still fails a check.
 */
function installActWarningFilter(): () => void {
  const ACT_WARNING = 'not wrapped in act';
  const original = console.error;
  console.error = (...args: unknown[]) => {
    // React emits the warning as a format string plus substitution arguments, so
    // every argument has to be inspected before deciding to drop the call.
    const text = args
      .map((arg) => (typeof arg === 'string' ? arg : ''))
      .join(' ');
    if (text.includes(ACT_WARNING)) return;
    original(...(args as Parameters<typeof original>));
  };
  return () => {
    console.error = original;
  };
}

async function main(): Promise<void> {
  const restoreConsole = installActWarningFilter();
  if (!(SUPPORTED_PHASES as readonly string[]).includes(phase)) {
    (window as unknown as Record<string, unknown>).__VERIFY__ = {
      done: true,
      error: `Unknown phase "${phase}"`,
      results: [],
    };
    return;
  }

  try {
    const module = await loadPhase(phase);
    const results = await module.run();
    restoreConsole();
    render(results);
    (window as unknown as Record<string, unknown>).__VERIFY__ = {
      done: true,
      error: null,
      results,
    };
  } catch (error) {
    restoreConsole();
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    render([{ name: 'harness execution', ok: false, detail: message }]);
    (window as unknown as Record<string, unknown>).__VERIFY__ = {
      done: true,
      error: message,
      results: [],
    };
  }
}

void main();