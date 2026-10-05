import { startVite, launchBrowser } from './driver.mjs';
const dev = await startVite('dev');
const { browser, cleanup } = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${dev.origin}/verify/_debug.html`);
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  const info = await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="markdown-editor-textarea"]');
    if (!ta) return { error: 'no textarea' };
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'Link to [[Graph');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  });
  console.log('INPUT', JSON.stringify(info));
  await new Promise((r) => setTimeout(r, 600));
  const after = await page.evaluate(() => ({
    value: document.querySelector('[data-testid="markdown-editor-textarea"]')?.value,
    popover: document.querySelector('[data-testid="wikilink-popover"]') !== null,
    last: window.__last,
  }));
  console.log('AFTER', JSON.stringify(after));
} finally {
  await cleanup();
  dev.child.kill('SIGTERM');
}
process.exit(0);
