/**
 * Headless Chrome verification runner.
 *
 * node verify/run.mjs phase1            # typecheck + bundle + module suite + app suite
 * node verify/run.mjs phase2 --no-build # reuse the existing dist
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT,
  CheckList,
  VIEWPORTS,
  assert,
  assertEqual,
  buildProject,
  launchBrowser,
  shot,
  startVite,
} from './driver.mjs';

const args = process.argv.slice(2);
const phase = args.find((a) => !a.startsWith('--')) ?? 'phase1';
const skipBuild = args.includes('--no-build');

const MODULE_VIEWPORTS = [
  { width: 390, height: 844, mobile: true, touch: true },
  { width: 1280, height: 900, mobile: false, touch: false },
];

async function runModuleSuite(page, devOrigin, list) {
  for (const viewport of MODULE_VIEWPORTS) {
    const url = `${devOrigin}/verify/harness.html?phase=${phase}`;
    const label = `${viewport.width}px`;
    console.log(`\n▸ module suite ${label} ${url}`);

    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
      touch: viewport.touch,
    });
    await page.goto(url);

    try {
      await page.waitForFunction(() => Boolean(window.__VERIFY__?.done), { timeout: 60_000 });
    } catch (error) {
      const partial = await page.evaluate(() => window.__VERIFY__ ?? null);
      throw new Error(
        `harness did not finish at ${label}: ${error.message}; state=${JSON.stringify(partial)}`,
      );
    }

    const state = await page.evaluate(() => window.__VERIFY__);
    if (state.error) throw new Error(`harness error at ${label}: ${state.error}`);

    for (const result of state.results) {
      const name = `[${label}] ${result.name}`;
      console.log(
        result.ok
          ? `  PASS  ${name}${result.detail ? ` — ${result.detail}` : ''}`
          : `  FAIL  ${name} — ${result.detail}`,
      );
      list.results.push({ name, ok: result.ok, detail: result.detail });
    }

    await list.check(`[${label}] module suite produced no console errors`, () => {
      const { errors, failedRequests } = page.diagnostics;
      assert(errors.length === 0, errors.join(' | ') || 'unknown console error');
      assert(failedRequests.length === 0, failedRequests.join(' | ') || 'unknown failed request');
    });
  }
}

async function runAppSuite(page, origin, spec, list) {
  console.log(`\n▸ app suite ${origin}`);

  for (const viewport of VIEWPORTS) {
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 2,
      mobile: viewport.mobile,
      touch: viewport.mobile,
    });
    await page.goto(origin);
    await page.waitForSelector('#root > *', { timeout: 15_000 });

    await list.check(`[${viewport.name}] boots with a rendered root`, async () => {
      const children = await page.evaluate(() => document.querySelectorAll('#root > *').length);
      assert(children > 0, '#root has no children');
    });

    await list.check(`[${viewport.name}] no console errors`, () => {
      const { errors, failedRequests } = page.diagnostics;
      assert(errors.length === 0, errors.join(' | ') || 'unknown console error');
      assert(failedRequests.length === 0, failedRequests.join(' | ') || 'unknown failed request');
    });

    await list.check(`[${viewport.name}] no horizontal page overflow`, async () => {
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert(
        metrics.scrollWidth <= metrics.clientWidth + 1,
        `document overflows horizontally (${metrics.scrollWidth} > ${metrics.clientWidth})`,
      );
    });

    await list.check(`[${viewport.name}] interactive elements >= 24px`, async () => {
      const small = await page.evaluate(() => {
        const selector =
          'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"]';
        const offenders = [];
        for (const el of Array.from(document.querySelectorAll(selector))) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          // Links inside rendered prose are text links, not standalone targets.
          if (el.tagName === 'A' && el.closest('.kb-prose') !== null) continue;
          if (rect.width < 24 || rect.height < 24) {
            const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 18) || '';
            offenders.push(`${el.tagName.toLowerCase()}[${name}] ${Math.round(rect.width)}x${Math.round(rect.height)}`);
          }
        }
        return offenders.slice(0, 8);
      });
      assert(small.length === 0, `undersized interactive elements: ${small.join(', ')}`);
    });

    if (spec?.appChecks) {
      await spec.appChecks({ page, list, viewport, shot, origin, assert, assertEqual });
    }

    await shot(page, `${phase}-${viewport.name}`);
  }
}

async function main() {
  if (!skipBuild) buildProject();

  const dev = await startVite('dev');
  const preview = await startVite('preview');

  let spec = null;
  try {
    const specPath = path.join(ROOT, 'verify', 'specs', `${phase}.mjs`);
    spec = await import(pathToFileURL(specPath).href);
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }

  const { browser, cleanup } = await launchBrowser();
  const list = new CheckList(`${phase} checks`);
  let failed = false;

  try {
    const page = await browser.newPage();

    if (spec?.skipModuleSuite !== true) {
      await runModuleSuite(page, dev.origin, list);
    }

    await runAppSuite(page, preview.origin, spec, list);
    await page.close();

    const summary = list.summary();
    failed = summary.failures.length > 0;
  } finally {
    await cleanup();
    dev.child.kill('SIGTERM');
    preview.child.kill('SIGTERM');
  }

  if (failed) process.exit(1);
  console.log('✅ verification passed');
}

main().catch((error) => {
  console.error(`\n❌ verification aborted: ${error.message}`);
  process.exit(1);
});