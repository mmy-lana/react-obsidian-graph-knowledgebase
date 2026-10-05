# Headless Chrome verification harness

Verifies each phase of the knowledge base against **real** source modules and the
**real** built app in a throwaway headless Chrome instance.

```bash
node verify/run.mjs phase1            # typecheck + bundle + module suite + app suite
node verify/run.mjs phase1 --no-build # reuse the existing dist
```

## Pieces

| File | Purpose |
| --- | --- |
| `cdp.mjs` | Minimal Chrome DevTools Protocol client (Node built-in WebSocket, no browser-automation dependency). |
| `driver.mjs` | Chrome resolution, `tsc`/`vite` invocation, dev + preview server lifecycle, assertion helpers, viewport matrix. |
| `run.mjs` | Runner: build → module suite → responsive app suite → screenshots → exit code. |
| `harness.html` / `harness.ts` | Browser-side entry that loads `phases/<phase>.ts` and publishes results on `window.__VERIFY__`. |
| `phases/phaseN.ts` | Phase-specific smoke suites (pure logic, IndexedDB, rendering behaviour). |
| `specs/phaseN.mjs` | Optional interaction specs (clicks, keyboard shortcuts, routing) executed against the built app. |
| `screenshots/` | Per-viewport evidence (git-ignored). |

## Safety

* Chrome runs **headless** with `--no-sandbox --disable-gpu` (required because the
  OS sandbox used during development blocks Chrome's own Mach sandbox helpers).
* A fresh profile is created in the OS temp directory and deleted afterwards, so the
  developer's everyday browser is never attached to, focused, or closed.

## Coverage

* **Module suite** — runs against the Vite dev server so source modules execute in a
  real browser (IndexedDB, canvas, crypto all behave as in production).
* **App suite** — runs against `vite preview` of the production bundle at 360px,
  390px, 430px, 768px and 1440px: boots clean, no console errors, no failed
  requests, no horizontal overflow, no undersized tap targets, plus the
  phase-specific interactions from `specs/`.