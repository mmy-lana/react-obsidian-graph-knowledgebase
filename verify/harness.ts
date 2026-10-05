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
  const specifier = `./phases/${phase}.ts`;
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

async function main(): Promise<void> {
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
    render(results);
    (window as unknown as Record<string, unknown>).__VERIFY__ = {
      done: true,
      error: null,
      results,
    };
  } catch (error) {
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