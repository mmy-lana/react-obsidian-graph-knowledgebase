/**
 * Minimal Chrome DevTools Protocol client.
 *
 * puppeteer-core cannot attach to the installed Chrome 154 build, so the
 * verification harness speaks CDP directly over Node's built-in WebSocket.
 * The browser is launched headless with a throwaway profile in the OS temp
 * directory: the user's everyday browser is never opened or closed.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const COMMAND_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 40;

/**
 * Launch flags for the throwaway headless instance.
 *
 * `--no-sandbox` / `--disable-gpu` are required because this harness runs
 * inside an OS sandbox that blocks Chrome's own Mach sandbox and crashpad
 * helper processes; without them the GPU process aborts the whole browser.
 * They apply to this short-lived verification instance only.
 */
const CHROME_ARGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-features=Crashpad,Translate,MediaRouter,OptimizationHints,CalculateNativeWinOcclusion',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-sync',
  '--metrics-recording-only',
  '--password-store=basic',
  '--use-mock-keychain',
  '--hide-scrollbars',
  '--mute-audio',
  '--force-device-scale-factor=1',
];

class Connection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();

    socket.addEventListener('message', (event) => this.#onMessage(String(event.data)));
    socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('devtools connection closed'));
      }
      this.pending.clear();
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error('devtools websocket timeout')), 20_000);

      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(new Connection(socket));
      });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`devtools websocket error for ${url}`));
      });
    });
  }

  #onMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.id !== undefined) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);

      if (message.error) {
        entry.reject(new Error(`${message.error.message} (${message.error.code})`));
      } else {
        entry.resolve(message.result ?? {});
      }
      return;
    }

    for (const listener of this.listeners) {
      listener(message);
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;

    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout for ${method}`));
      }, COMMAND_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(payload));
    });
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    try {
      this.socket.close();
    } catch {
      /* already closed */
    }
  }
}

const KEY_DEFINITIONS = {
  Enter: { keyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
  Tab: { keyCode: 9, key: 'Tab', code: 'Tab', text: '\t' },
  Escape: { keyCode: 27, key: 'Escape', code: 'Escape' },
  Backspace: { keyCode: 8, key: 'Backspace', code: 'Backspace' },
  Delete: { keyCode: 46, key: 'Delete', code: 'Delete' },
  ArrowUp: { keyCode: 38, key: 'ArrowUp', code: 'ArrowUp' },
  ArrowDown: { keyCode: 40, key: 'ArrowDown', code: 'ArrowDown' },
  ArrowLeft: { keyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft' },
  ArrowRight: { keyCode: 39, key: 'ArrowRight', code: 'ArrowRight' },
  Space: { keyCode: 32, key: ' ', code: 'Space', text: ' ' },
};

const MODIFIER = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

function keyDescriptor(key, modifiers = 0) {
  const definition = KEY_DEFINITIONS[key];

  if (definition) {
    return {
      ...definition,
      modifiers,
      windowsVirtualKeyCode: definition.keyCode,
      nativeVirtualKeyCode: definition.keyCode,
    };
  }

  if (key.length === 1) {
    const upper = key.toUpperCase();
    const base = { key, code: `Key${upper}`, text: key, keyCode: upper.charCodeAt(0) };
    if ((modifiers & MODIFIER.shift) !== 0) {
      return { ...base, key: upper, text: upper, code: `Key${upper}` };
    }
    return base;
  }

  return { key, code: key, text: key, keyCode: 0 };
}

function formatRemoteObject(arg) {
  if (!arg) return '';
  if (arg.type === 'string') return arg.value;
  if ('value' in arg) return JSON.stringify(arg.value);
  return arg.description ?? arg.className ?? arg.type;
}

/** A single CDP page target with navigation, evaluation, input and capture. */
export class Page {
  constructor(connection, sessionId, targetId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.diagnostics = {
      errors: [],
      warnings: [],
      failedRequests: [],
      reset() {
        this.errors = [];
        this.warnings = [];
        this.failedRequests = [];
      },
    };
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');

    this.connection.on((message) => {
      if (message.sessionId !== this.sessionId) return;

      if (message.method === 'Runtime.consoleAPICalled') {
        const { type, args } = message.params;
        const text = (args ?? []).map(formatRemoteObject).join(' ');
        if (type === 'error') this.diagnostics.errors.push(`console.error: ${text}`);
        else if (type === 'warning' || type === 'warn') this.diagnostics.warnings.push(text);
      }

      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        const text = details.exception?.description ?? details.text ?? 'unknown exception';
        this.diagnostics.errors.push(`pageerror: ${text}`);
      }

      if (message.method === 'Log.entryAdded') {
        const entry = message.params.entry;
        if (entry.level === 'error') {
          this.diagnostics.errors.push(`log(${entry.source}): ${entry.text}`);
        } else if (entry.level === 'warning') {
          this.diagnostics.warnings.push(`${entry.source}: ${entry.text}`);
        }
      }

      if (message.method === 'Network.loadingFailed') {
        const { type, errorText, blockedReason } = message.params;
        if (!/net::ERR_ABORTED/.test(errorText ?? '') && blockedReason !== 'other') {
          this.diagnostics.failedRequests.push(`${type}: ${errorText}`);
        }
      }
    });
  }

  async setViewport({ width, height, deviceScaleFactor = 1, mobile = false, touch = false }) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });

    if (touch) {
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    } else {
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
  }

  async goto(url, { timeout = 30_000 } = {}) {
    this.diagnostics.reset();
    const loaded = this.#waitForEvent('Page.loadEventFired', timeout);
    const result = await this.send('Page.navigate', { url });

    if (result.errorText) {
      throw new Error(`navigation to ${url} failed: ${result.errorText}`);
    }
    await loaded;
    return result;
  }

  async reload() {
    const loaded = this.#waitForEvent('Page.loadEventFired', 30_000);
    await this.send('Page.reload');
    await loaded;
  }

  #waitForEvent(method, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timeout waiting for ${method}`));
      }, timeout);

      const off = this.connection.on((message) => {
        if (message.method !== method || message.sessionId !== this.sessionId) return;
        clearTimeout(timer);
        off();
        resolve(message.params);
      });
    });
  }

  /** Evaluates `fn(...args)` in the page and returns its (awaited) value. */
  async evaluate(fn, ...args) {
    const serialized = args
      .map((arg) => JSON.stringify(arg === undefined ? null : arg))
      .join(',');
    const expression = `(${fn.toString()})(${serialized})`;

    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });

    if (response.exceptionDetails) {
      const details = response.exceptionDetails;
      throw new Error(details.exception?.description ?? details.text ?? 'evaluation failed');
    }
    return response.result?.value;
  }

  async waitForSelector(selector, { timeout = 15_000 } = {}) {
    return this.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return Boolean(el);
      },
      { timeout },
      selector,
    );
  }

  async waitForFunction(fn, { timeout = 15_000 } = {}, ...args) {
    const deadline = Date.now() + timeout;
    let lastError = 'no result';

    while (Date.now() < deadline) {
      try {
        const value = await this.evaluate(fn, ...args);
        if (value) return value;
        lastError = 'predicate still falsy';
      } catch (error) {
        lastError = error.message;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`waitForFunction timed out after ${timeout}ms (${lastError})`);
  }

  async boundingBox(selector) {
    return this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, selector);
  }

  async click(selector, { optional = false } = {}) {
    const box = await this.boundingBox(selector);
    if (!box) {
      if (optional) return false;
      throw new Error(`click target not found: ${selector}`);
    }

    if (box.width === 0 || box.height === 0) {
      await this.evaluate((sel) => {
        document.querySelector(sel)?.click();
      }, selector);
      return true;
    }

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    return true;
  }

  async hover(selector) {
    const box = await this.boundingBox(selector);
    if (!box) throw new Error(`hover target not found: ${selector}`);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
  }

  async focus(selector) {
    await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`focus target not found: ${sel}`);
      el.focus();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(el, el.value);
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, selector);
  }

  async type(text) {
    await this.send('Input.insertText', { text });
  }

  async press(key, modifiers = 0) {
    const descriptor = keyDescriptor(key, modifiers);
    const base = {
      modifiers,
      key: descriptor.key,
      code: descriptor.code,
      windowsVirtualKeyCode: descriptor.windowsVirtualKeyCode ?? 0,
      nativeVirtualKeyCode: descriptor.nativeVirtualKeyCode ?? 0,
    };

    await this.send('Input.dispatchKeyEvent', {
      type: descriptor.text ? 'keyDown' : 'rawKeyDown',
      text: descriptor.text,
      ...base,
    });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  /** Convenience for Cmd/Ctrl style shortcuts: `pressWithModifier('p', 'meta')`. */
  async pressWithModifier(key, modifier) {
    await this.press(key, MODIFIER[modifier] ?? 0);
  }

  async screenshot(filePath) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(filePath, Buffer.from(data, 'base64'));
    return filePath;
  }

  async close() {
    await this.connection.send('Target.closeTarget', { targetId: this.targetId });
  }
}

class Browser {
  constructor(connection, process_, userDataDir) {
    this.connection = connection;
    this.process = process_;
    this.userDataDir = userDataDir;
  }

  async newPage() {
    const { targetId } = await this.connection.send('Target.createTarget', {
      url: 'about:blank',
    });
    const { sessionId } = await this.connection.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });

    const page = new Page(this.connection, sessionId, targetId);
    await page.init();
    return page;
  }

  async version() {
    return this.connection.send('Browser.getVersion');
  }

  async close() {
    try {
      await this.connection.send('Browser.close');
    } catch {
      this.process.kill('SIGTERM');
    }
    this.connection.close();
  }
}

export async function launchBrowser({ executablePath }) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'kb-verify-chrome-'));

  const child = spawn(
    executablePath,
    [
      ...CHROME_ARGS,
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not report a devtools endpoint')), 30_000);

    const onData = (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };

    child.stderr.on('data', onData);
    child.stdout.on('data', onData);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited early with code ${code}`));
    });
  });

  const connection = await Connection.connect(wsUrl);
  const browser = new Browser(connection, child, userDataDir);

  return {
    browser,
    cleanup: async () => {
      try {
        await browser.close();
      } catch {
        child.kill('SIGKILL');
      }
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        /* best effort temp cleanup */
      }
    },
  };
}

export { MODIFIER };