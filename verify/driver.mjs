/**
 * Headless Chrome verification driver.
 *
 * Launches a *separate* headless Chrome instance with a throwaway profile in
 * the OS temp directory, so the user's daily browser (Zen) is never opened,
 * focused, or closed by this harness.
 *
 * Usage: node verify/run.mjs <spec.mjs> [--no-build]
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser as launchChrome } from './cdp.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHOT_DIR = path.join(ROOT, 'verify', 'screenshots');
const VITE_BIN = path.join(ROOT, 'node_modules', '.bin', 'vite');
const TSC_BIN = path.join(ROOT, 'node_modules', '.bin', 'tsc');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  process.env.CHROME_PATH,
].filter(Boolean);

export function resolveChromePath() {
  for (const candidate of CHROME_CANDIDATES) {
    if (!candidate) continue;
    if (!candidate.startsWith('/') || existsSync(candidate)) return candidate;
  }
  throw new Error(
    'No Chrome/Chromium binary found. Set CHROME_PATH=/path/to/chrome and retry.',
  );
}

/** Typechecks (`tsc -b`) then bundles (`vite build`); throws on any error. */
export function buildProject() {
  console.log('\n▸ typecheck (tsc -b)');
  const typecheck = spawnSync(TSC_BIN, ['-b', '--force'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (typecheck.status !== 0) {
    console.log(typecheck.stdout ?? '');
    console.log(typecheck.stderr ?? '');
    throw new Error(`typecheck failed with exit code ${typecheck.status}`);
  }
  console.log('  typecheck ok');

  console.log('▸ bundle (vite build)');
  const bundle = spawnSync(VITE_BIN, ['build'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (bundle.status !== 0) {
    console.log(bundle.stdout ?? '');
    console.log(bundle.stderr ?? '');
    throw new Error(`build failed with exit code ${bundle.status}`);
  }
  console.log('  build ok');
}

/** Spawns `vite` in the given mode and resolves once it reports its URL. */
export function startVite(mode, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const args =
      mode === 'dev'
        ? ['--port', '0', '--strictPort', ...extraArgs]
        : ['preview', '--port', '0', '--strictPort', ...extraArgs];

    const child = spawn(VITE_BIN, args, {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: '1', BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`vite ${mode} did not start in time. Output:\n${output}`));
    }, 60_000);

    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/Local:\s+(https?:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, origin: match[1].replace(/\/$/, ''), get output() { return output; } });
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      if (code !== 0 && !output.includes('Local:')) {
        clearTimeout(timer);
        reject(new Error(`vite ${mode} exited with ${code}. Output:\n${output}`));
      }
    });
  });
}

/** Launches a fresh headless Chrome with a throwaway profile. */
export function launchBrowser() {
  return launchChrome({ executablePath: resolveChromePath() });
}

/** Diagnostics collected for the most recent navigation of a page. */
export function watchPage(page) {
  return page.diagnostics;
}

export class CheckList {
  constructor(title) {
    this.title = title;
    this.results = [];
  }

  async check(name, fn) {
    try {
      const detail = await fn();
      this.results.push({ name, ok: true, detail: detail ?? '' });
      console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
      return true;
    } catch (error) {
      this.results.push({ name, ok: false, detail: error.message });
      console.log(`  FAIL  ${name} — ${error.message}`);
      return false;
    }
  }

  get failures() {
    return this.results.filter((r) => !r.ok);
  }

  summary() {
    const passed = this.results.filter((r) => r.ok).length;
    console.log(`\n[${this.title}] ${passed}/${this.results.length} checks passed`);
    return { passed, total: this.results.length, failures: this.failures };
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message} (expected ${b}, received ${a})`);
}

export async function shot(page, name) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot(file);
  console.log(`  shot  ${path.relative(ROOT, file)}`);
  return file;
}

export const VIEWPORTS = [
  { name: '360-compact-mobile', width: 360, height: 740, mobile: true },
  { name: '390-standard-mobile', width: 390, height: 844, mobile: true },
  { name: '430-pro-mobile', width: 430, height: 932, mobile: true },
  { name: '768-tablet', width: 768, height: 1024, mobile: true },
  { name: '1440-desktop', width: 1440, height: 900, mobile: false },
];

/** Detects horizontal overflow, which breaks the mobile-first layout rules. */
export const NO_HORIZONTAL_OVERFLOW = () => {
  const doc = document.documentElement;
  const overflow = doc.scrollWidth - doc.clientWidth;
  return { overflow, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
};