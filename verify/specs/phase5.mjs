/**
 * App-level interaction specs executed against the production build at every
 * target viewport (360 / 390 / 430 / 768 / 1440).
 */

const sel = {
  header: '[data-testid="app-header"]',
  layout: '[data-testid="app-layout"]',
  sidebar: '[data-testid="app-layout-sidebar"]',
  inspector: '[data-testid="app-layout-inspector"]',
  editor: '[data-testid="markdown-editor-textarea"]',
  graphCanvas: '[data-testid="force-graph-canvas"]',
  explorer: '[data-testid="file-explorer"]',
  mobileNav: '[data-testid="mobile-nav"]',
  split: '[data-testid="split-pane"]',
  separator: '[data-testid="split-pane-separator"]',
  palette: '[data-testid="command-palette"]',
  switcher: '[data-testid="quick-switcher"]',
  toast: '[data-testid="app-toast"]',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads painted pixels from the graph canvas so viewport framing can be
 * asserted against the production bundle, not only in component-level checks.
 */
async function readPaintedPixels(page, selector, region) {
  return page.evaluate(
    ([sel, box]) => {
      const canvas = document.querySelector(sel);
      if (!canvas) return { total: -1, width: 0, height: 0 };

      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return { total: -2, width: 0, height: 0 };

      const x = Math.max(0, Math.floor(box?.x ?? 0));
      const y = Math.max(0, Math.floor(box?.y ?? 0));
      const w = Math.max(1, Math.floor(box?.w ?? canvas.width));
      const h = Math.max(1, Math.floor(box?.h ?? canvas.height));
      const { data } = context.getImageData(x, y, w, h);

      let total = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] !== 0) total += 1;
      }
      return { total, width: canvas.width, height: canvas.height };
    },
    [selector, region ?? null],
  );
}

/** Dispatches a wheel event on the canvas; `ctrlKey` models a trackpad pinch. */
async function dispatchWheel(page, selector, { deltaY, deltaX = 0, ctrlKey = false }) {
  return page.evaluate(
    ([sel, options]) => {
      const canvas = document.querySelector(sel);
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const event = new WheelEvent('wheel', {
        deltaY: options.deltaY,
        deltaX: options.deltaX,
        ctrlKey: options.ctrlKey,
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    },
    [selector, { deltaY, deltaX, ctrlKey }],
  );
}


/** Clears a controlled input the way React sees it (native setter + input event). */
async function clearInput(page, selector) {
  await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector);
}

async function waitForApp(page) {
  await page.waitForSelector(sel.header, { timeout: 20_000 });
  // The editor or the graph is always mounted; the explorer lives inside a
  // drawer on mobile, so it cannot be used as the readiness signal.
  await page.waitForFunction(
    (selectors) =>
      Boolean(document.querySelector(selectors.editor)) || Boolean(document.querySelector(selectors.graphCanvas)),
    { timeout: 20_000 },
    sel,
  );
}

export async function appChecks({ page, list, viewport, assert, assertEqual }) {
  await waitForApp(page);

  await list.check(`[${viewport.name}] app layout mounts with a seeded vault`, async () => {
    const state = await page.evaluate(async (selectors) => {
      const layout = document.querySelector(selectors.layout);
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('ObsidianKnowledgeBaseDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const count = await new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const request = tx.objectStore('notes').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();

      return {
        breakpoint: layout?.dataset.breakpoint ?? null,
        hasHeader: Boolean(document.querySelector(selectors.header)),
        noteCount: count,
        title: document.querySelector('[data-testid="header-title"]')?.textContent?.trim() ?? '',
      };
    }, sel);

    assert(state.hasHeader, 'header missing');
    assertEqual(state.noteCount, 4, 'the vault was seeded with the four starter notes');
    assert(state.title.includes('Welcome'), `expected the welcome note to be active, found "${state.title}"`);
  });

  await list.check(`[${viewport.name}] vault is seeded exactly once after reload`, async () => {
    await page.reload();
    await waitForApp(page);

    const count = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('ObsidianKnowledgeBaseDB');
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('notes', 'readonly');
            const all = tx.objectStore('notes').count();
            all.onsuccess = () => {
              db.close();
              resolve(all.result);
            };
            all.onerror = () => reject(all.error);
          };
          request.onerror = () => reject(request.error);
        }),
    );

    assertEqual(count, 4, 'reloading must not re-seed or duplicate notes');
  });

  await list.check(`[${viewport.name}] layout matches the mobile-first rules`, async () => {
    const layoutState = await page.evaluate((selectors) => {
      const layout = document.querySelector(selectors.layout);
      const nav = document.querySelector(selectors.mobileNav);
      const sidebar = document.querySelector(selectors.sidebar);
      const inspector = document.querySelector(selectors.inspector);
      const separator = document.querySelector(selectors.separator);
      const navButtons = Array.from(document.querySelectorAll('[data-testid^="mobile-nav-"]'));

      return {
        breakpoint: layout?.dataset.breakpoint,
        navVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
        sidebarVisible: sidebar ? getComputedStyle(sidebar).display !== 'none' : false,
        inspectorVisible: inspector ? getComputedStyle(inspector).display !== 'none' : false,
        separatorVisible: separator ? getComputedStyle(separator).display !== 'none' : false,
        navCount: navButtons.length,
        navLabels: nav?.dataset.labels ?? null,
      };
    }, sel);

    if (viewport.width < 768) {
      assert(layoutState.navVisible, 'bottom navigation must be visible on mobile');
      assertEqual(layoutState.navCount, 5, 'five navigation actions');
      assert(
        !layoutState.sidebarVisible && !layoutState.inspectorVisible,
        'sidebar and inspector must be drawers (not columns) on mobile',
      );
      assert(!layoutState.separatorVisible, 'draggable separator hidden below 768px');

      const expectedLabels = viewport.width >= 390 ? 'visible' : 'sr-only';
      assertEqual(
        layoutState.navLabels,
        expectedLabels,
        `nav label mode at ${viewport.width}px`,
      );
    } else {
      assert(!layoutState.navVisible, 'bottom navigation hidden from md upwards');
      assertEqual(layoutState.sidebarVisible, true, 'sidebar column visible on tablet/desktop');
      assertEqual(layoutState.separatorVisible, true, 'draggable separator visible from md upwards');
    }
  });

  const isPhoneLayout = viewport.width < 768;

  const showGraphPane = async () => {
    if (!isPhoneLayout) return;
    await page.click('[data-testid="mobile-nav-graph"]');
    await sleep(600);
  };

  const showEditorPane = async () => {
    if (!isPhoneLayout) return;
    await page.click('[data-testid="mobile-nav-editor"]');
    await sleep(400);
  };

  await list.check(`[${viewport.name}] graph canvas renders nodes`, async () => {
    await showGraphPane();
    const graphState = await page.evaluate((selectors) => {
      const canvas = document.querySelector(selectors.graphCanvas);
      return {
        present: Boolean(canvas),
        nodes: Number(canvas?.dataset.nodeCount ?? 0),
        width: canvas?.width ?? 0,
      };
    }, sel);

    assert(graphState.present, 'graph canvas mounted');
    assert(graphState.nodes > 0, 'graph rendered no nodes');
    assert(graphState.width > 0, 'canvas backing store not sized');
    await showEditorPane();
  });

  await list.check(`[${viewport.name}] graph is framed in the viewport after refresh`, async () => {
    await showGraphPane();

    const painted = await readPaintedPixels(page, sel.graphCanvas);
    assert(painted.total > 0, 'graph canvas painted nodes on first load');

    const centre = await readPaintedPixels(page, sel.graphCanvas, {
      x: painted.width * 0.2,
      y: painted.height * 0.2,
      w: painted.width * 0.6,
      h: painted.height * 0.6,
    });
    assert(centre.total > 0, `nodes must be framed in the viewport centre (${centre.total} painted pixels)`);
    assert(
      centre.total >= painted.total * 0.5,
      `the graph must sit centrally, not in a corner (${centre.total} of ${painted.total})`,
    );

    const zoom = await page.evaluate(
      (selector) => Number(document.querySelector(selector)?.dataset.zoom ?? 0),
      sel.graphCanvas,
    );
    assert(zoom >= 0.5 && zoom <= 1.8, `framing zoom must be within the fit clamp (${zoom})`);

    await showEditorPane();
  });

  await list.check(`[${viewport.name}] pinch and wheel zoom stay smooth and anchored`, async () => {
    await showGraphPane();
    const read = () =>
      page.evaluate((selector) => {
        const canvas = document.querySelector(selector);
        return {
          zoom: Number(canvas?.dataset.zoom ?? 0),
          panX: Number(canvas?.dataset.panX ?? 0),
          panY: Number(canvas?.dataset.panY ?? 0),
        };
      }, sel.graphCanvas);

    const start = await read();

    // A single absurd pinch frame must not multiply zoom (clamped and damped).
    const prevented = await dispatchWheel(page, sel.graphCanvas, { deltaY: -900, ctrlKey: true });
    assertEqual(prevented, true, 'wheel handling cancels the browser scroll');
    await sleep(120);

    const afterPinch = await read();
    assert(afterPinch.zoom > start.zoom, 'pinch-out zooms in');
    assert(
      afterPinch.zoom / start.zoom <= 1.07,
      `pinch must be damped, not exponential (${start.zoom} -> ${afterPinch.zoom})`,
    );

    for (let i = 0; i < 25; i += 1) {
      await dispatchWheel(page, sel.graphCanvas, { deltaY: -15, ctrlKey: true });
    }
    await sleep(150);
    const sustained = await read();
    assert(sustained.zoom <= 4, `pinch must respect the zoom clamp (${sustained.zoom})`);

    for (let i = 0; i < 25; i += 1) {
      await dispatchWheel(page, sel.graphCanvas, { deltaY: 15, ctrlKey: true });
    }
    await sleep(150);
    const recovered = await read();
    assert(recovered.zoom < sustained.zoom, 'pinch-in reduces zoom again');

    // Discrete mouse wheel steps zoom and re-anchor around the pointer.
    const beforeWheel = await read();
    await dispatchWheel(page, sel.graphCanvas, { deltaY: -120 });
    await sleep(150);
    const afterWheel = await read();
    assert(afterWheel.zoom > beforeWheel.zoom, 'mouse wheel steps zoom in');
    assert(
      afterWheel.panX !== beforeWheel.panX || afterWheel.panY !== beforeWheel.panY,
      'wheel zoom must re-anchor the camera around the pointer',
    );

    await showEditorPane();
  });

  if (viewport.width >= 768) {
    await list.check(`[${viewport.name}] editor writes notes and links index`, async () => {
      await page.click(sel.editor);
      await page.type('Automated verification entry with [[Graph Theory]].');
      await sleep(700);

      const stored = await page.evaluate(async () => {
        const request = indexedDB.open('ObsidianKnowledgeBaseDB');
        const db = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const notes = await new Promise((resolve, reject) => {
          const tx = db.transaction('notes', 'readonly');
          const all = tx.objectStore('notes').getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        });

        const links = await new Promise((resolve, reject) => {
          const tx = db.transaction('links', 'readonly');
          const all = tx.objectStore('links').getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        });

        db.close();
        return {
          matching: notes.filter((note) => note.content.includes('Automated verification entry')).length,
          graphLinks: links.filter((link) => link.targetSlug === 'graph-theory-network-thinking').length,
        };
      });

      assertEqual(stored.matching, 1, 'the typed content was persisted exactly once');
      assert(stored.graphLinks > 0, 'the wikilink was indexed');
    });

    await list.check(`[${viewport.name}] selecting a note in the explorer opens it`, async () => {
      await page.click('[data-testid="note-seed-note-3-select"]');
      await sleep(400);

      const title = await page.evaluate(
        (selector) => document.querySelector(selector)?.textContent?.trim() ?? '',
        '[data-testid="header-title"]',
      );
      assert(title.includes('Markdown Syntax Reference'), `expected the markdown note to be active, found "${title}"`);

      const backlinkCount = await page.evaluate(
        (selector) => document.querySelector(selector)?.textContent ?? '0',
        '[data-testid="backlinks-list-count"]',
      );
      assert(Number(backlinkCount) >= 1, `expected backlinks for the selected note, found ${backlinkCount}`);
    });

    await list.check(`[${viewport.name}] Cmd/Ctrl+O opens the quick switcher and navigates`, async () => {
      await page.pressWithModifier('o', 'meta');
      await page.waitForSelector(sel.switcher, { timeout: 10_000 });
      await page.type('[data-testid="quick-switcher-input"]', 'second brain');
      await sleep(300);

      const hasAliasMatch = await page.evaluate(
        () =>
          Array.from(document.querySelectorAll('[data-testid^="quick-switcher-option-"]')).some((option) =>
            option.textContent.includes('Second Brain'),
          ),
      );
      assert(hasAliasMatch, 'alias search did not surface the second brain note');

      await page.click('[data-testid="quick-switcher-option-seed-note-4"]');
      await sleep(400);

      const title = await page.evaluate(
        (selector) => document.querySelector(selector)?.textContent?.trim() ?? '',
        '[data-testid="header-title"]',
      );
      assert(title.includes('Second Brain Architecture'), `switcher did not open the note, title is "${title}"`);
    });

    await list.check(`[${viewport.name}] Cmd/Ctrl+P runs a command from the palette`, async () => {
      const nodesBefore = await page.evaluate(
        (selector) => Number(document.querySelector(selector)?.dataset.nodeCount ?? 0),
        sel.graphCanvas,
      );

      await page.pressWithModifier('p', 'meta');
      await page.waitForSelector(sel.palette, { timeout: 10_000 });
      await page.type('[data-testid="command-palette-input"]', 'tag nodes');
      await sleep(300);


      await page.click('[data-testid="command-palette-row-command-toggle-graph-tags"]');
      await sleep(600);

      const closed = await page.evaluate(
        (selector) => document.querySelector(selector) === null,
        sel.palette,
      );
      assertEqual(closed, true, 'palette closes after running a command');

      const nodesAfter = await page.evaluate(
        (selector) => Number(document.querySelector(selector)?.dataset.nodeCount ?? 0),
        sel.graphCanvas,
      );
      assert(nodesAfter > nodesBefore, `tag nodes should be added (${nodesBefore} -> ${nodesAfter})`);

      // Toggle back so later checks see the default graph.
      await page.pressWithModifier('p', 'meta');
      await page.waitForSelector(sel.palette, { timeout: 10_000 });
      await clearInput(page, '[data-testid="command-palette-input"]');
      await page.type('[data-testid="command-palette-input"]', 'tag nodes');
      await page.waitForSelector('[data-testid="command-palette-row-command-toggle-graph-tags"]', {
        timeout: 10_000,
      });
      await page.click('[data-testid="command-palette-row-command-toggle-graph-tags"]');
      await sleep(400);
    });

    await list.check(`[${viewport.name}] escape closes every overlay`, async () => {
      await page.pressWithModifier('p', 'meta');
      await page.waitForSelector(sel.palette, { timeout: 10_000 });
      await page.press('Escape');
      await sleep(300);

      const paletteClosed = await page.evaluate((selector) => document.querySelector(selector) === null, sel.palette);
      assertEqual(paletteClosed, true, 'escape closed the command palette');
    });

    await list.check(`[${viewport.name}] split separator resizes with the keyboard`, async () => {
      const before = await page.evaluate((selector) => {
        const pane = document.querySelector(selector);
        return pane ? pane.getBoundingClientRect().width : 0;
      }, '[data-testid="split-pane-primary"]');

      await page.focus(sel.separator);
      for (let i = 0; i < 4; i += 1) await page.press('ArrowLeft');
      await sleep(300);

      const after = await page.evaluate((selector) => {
        const pane = document.querySelector(selector);
        return pane ? pane.getBoundingClientRect().width : 0;
      }, '[data-testid="split-pane-primary"]');

      assert(after < before - 10, `primary pane should shrink (${before} -> ${after})`);
    });

    await list.check(`[${viewport.name}] rename cascades wikilinks across notes`, async () => {
      const original = 'Graph Theory & Network Thinking';
      const renamed = 'Graph Theory Primer';

      await page.click('[data-testid="note-seed-note-2-menu"]');
      await sleep(300);
      await page.click('[data-testid="dropdown-menu"] [data-index="0"]');
      await page.waitForSelector('[data-testid="rename-dialog-input"]', { timeout: 10_000 });

      await page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, '[data-testid="rename-dialog-input"]');

      await page.type('[data-testid="rename-dialog-input"]', renamed);
      await page.click('[data-testid="rename-dialog-confirm"]');
      await sleep(800);

      const afterRename = await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('ObsidianKnowledgeBaseDB');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const notes = await new Promise((resolve, reject) => {
          const tx = db.transaction('notes', 'readonly');
          const all = tx.objectStore('notes').getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        });

        const links = await new Promise((resolve, reject) => {
          const tx = db.transaction('links', 'readonly');
          const all = tx.objectStore('links').getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        });

        db.close();
        return {
          renamedNote: notes.find((note) => note.title === 'Graph Theory Primer') ?? null,
          staleReferences: notes.filter((note) => note.content.includes('[[Graph Theory & Network Thinking]')).length,
          newReferences: notes.filter((note) => note.content.includes('[[Graph Theory Primer]')).length,
          linksToOldSlug: links.filter((link) => link.targetSlug === 'graph-theory-network-thinking').length,
        };
      });

      assertEqual(afterRename.renamedNote?.slug, 'graph-theory-primer', 'note renamed and reslugged');
      assertEqual(afterRename.staleReferences, 0, 'no stale [[wikilinks]] remain');
      assert(afterRename.newReferences >= 2, 'referencing notes were rewritten');
      assertEqual(afterRename.linksToOldSlug, 0, 'link index no longer points at the old slug');

      // Restore the original title so later viewports start from the seeded state.
      await page.click('[data-testid="note-seed-note-2-menu"]');
      await sleep(300);
      await page.click('[data-testid="dropdown-menu"] [data-index="0"]');
      await page.waitForSelector('[data-testid="rename-dialog-input"]', { timeout: 10_000 });
      await page.evaluate((selector) => {
        const input = document.querySelector(selector);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, '[data-testid="rename-dialog-input"]');
      await page.type('[data-testid="rename-dialog-input"]', original);
      await page.click('[data-testid="rename-dialog-confirm"]');
      await sleep(700);
    });

  } else {
    await list.check(`[${viewport.name}] bottom navigation switches panes`, async () => {
      await page.click('[data-testid="mobile-nav-graph"]');
      await sleep(500);
      const graphVisible = await page.evaluate((selector) => Boolean(document.querySelector(selector)), sel.graphCanvas);
      assertEqual(graphVisible, true, 'graph pane visible after tapping the nav item');

      await page.click('[data-testid="mobile-nav-editor"]');
      await sleep(500);
      const editorVisible = await page.evaluate((selector) => Boolean(document.querySelector(selector)), sel.editor);
      assertEqual(editorVisible, true, 'editor pane visible after tapping the nav item');
    });

    await list.check(`[${viewport.name}] mobile drawers open and close`, async () => {
      await page.click('[data-testid="mobile-nav-explorer"]');
      await sleep(500);

      const drawerOpen = await page.evaluate(() => {
        const drawer = document.querySelector('[data-testid="mobile-drawer"]');
        return drawer ? { open: drawer.dataset.open, side: drawer.dataset.side } : null;
      });
      assertEqual(drawerOpen?.open, 'true', 'explorer drawer opened');
      assertEqual(drawerOpen?.side, 'left', 'explorer drawer slides from the left');

      await page.click('[data-testid="mobile-drawer-close"]');
      await sleep(400);
      const closed = await page.evaluate(
        () => document.querySelector('[data-testid="mobile-drawer"]') === null,
      );
      assertEqual(closed, true, 'drawer closes via its close button');
    });

    await list.check(`[${viewport.name}] mobile search filters notes`, async () => {
      await page.click('[data-testid="mobile-nav-search"]');
      await sleep(400);
      await page.click('[data-testid="search-bar"]');
      await page.type('[data-testid="search-bar"]', 'markdown');
      await sleep(700);

      const resultCount = await page.evaluate(() => document.querySelectorAll('[data-testid^="search-result-"]').length);
      assert(resultCount >= 1, 'search returned at least one result');

      await page.click('[data-testid="search-clear"]');
      await sleep(300);
      const cleared = await page.evaluate(
        (selector) => (document.querySelector(selector)?.value ?? '').length === 0,
        '[data-testid="search-bar"]',
      );
      assertEqual(cleared, true, 'clear button resets the query');
    });
  }
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message} (expected ${b}, received ${a})`);
}