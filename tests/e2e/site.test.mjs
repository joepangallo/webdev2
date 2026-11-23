// Browser tests: the real pages, served locally, driven in headless Chrome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { serve } from '../lib/serve.mjs';
import { launch } from '../lib/chrome.mjs';
import { ROOT, MODULE_PAGES, htmlPages, lineAt, read } from '../lib/site.mjs';

const PAGES = htmlPages();
const QUIZ_PAGES = [...MODULE_PAGES, 'project/index.html'];
const PHONE = { width: 390, height: 844, mobile: true };

let server, browser, page;

// WD2_COVERAGE=1 npm run test:e2e   also reports how much of course.js these tests execute.
// WD2_BASE_URL=https://…/ npm run test:e2e   runs the same tests against a deployed copy of the site.
const COVERAGE = !!process.env.WD2_COVERAGE;
const DEPLOYED = process.env.WD2_BASE_URL ? process.env.WD2_BASE_URL.replace(/\/?$/, '/') : null;

before(async () => {
  server = DEPLOYED ? { url: DEPLOYED, close: async () => {} } : await serve(ROOT);
  browser = await launch();
  page = await browser.page();
  if (COVERAGE) await page.startCoverage('/assets/js/course.js');
});
after(async () => {
  if (COVERAGE && page) {
    const src = read('assets/js/course.js');
    const c = await page.coverage(src.length);
    console.log(`\ncourse.js coverage from the browser tests: ${c.percent}% (${c.covered} of ${c.total} characters)`);
    const gaps = c.missed.filter(([a, b]) => src.slice(a, b).trim().length > 40).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0])).slice(0, Number(process.env.WD2_COVERAGE) > 1 ? Number(process.env.WD2_COVERAGE) : 12);
    for (const [a, b] of gaps) console.log(`  not run: lines ${lineAt(src, a)}-${lineAt(src, b)}  ${src.slice(a, b).trim().split('\n')[0].slice(0, 90)}`);
  }
  if (browser) await browser.close();
  if (server) await server.close();
});

/** Open a page with empty storage, as a first-time visitor would. */
async function fresh(path, opts) {
  await page.goto(server.url + path, { settle: 100 });
  await page.eval('localStorage.clear()');
  await page.goto(server.url + path, opts);
}

/** Scroll every playground into view (their previews load lazily) and wait for check results. */
async function settlePlaygrounds() {
  await page.eval(`(async () => {
    for (const el of document.querySelectorAll('.playground')) { el.scrollIntoView(); await new Promise((r) => setTimeout(r, 250)); }
  })()`);
  await page.waitFor(`Array.from(document.querySelectorAll('.pg-checks')).every((box) => box.querySelectorAll('li').length > 0)`);
  await sleep(300);
}

const b64 = (code) => encodeURIComponent(Buffer.from(JSON.stringify(code), 'utf8').toString('base64'));

/* ---------- loading ---------- */

test('every page loads cleanly, from this site only', async () => {
  for (const rel of PAGES) {
    await fresh(rel, { settle: 700 });
    assert.deepEqual(page.problems(), [], rel + ' logs errors or failed requests');
    assert.deepEqual(page.hosts(), [new URL(server.url).host], rel + ' contacts another host');
    const info = await page.eval(`(async () => {
      await document.fonts.ready;
      return {
        broken: Array.from(document.querySelectorAll('.feedback.bad')).map((e) => e.textContent).filter((t) => /failed to load|JSON error/.test(t)),
        shell: !!document.querySelector('.topbar') && !!document.querySelector('.site-footer') && !!document.querySelector('.skip-link'),
        icon: !!document.querySelector('link[rel~="icon"]'),
        bodyFont: document.fonts.check('16px "Atkinson Hyperlegible"'),
        displayFont: document.fonts.check('700 24px "Bricolage Grotesque"'),
        monoFont: document.fonts.check('14px "JetBrains Mono"'),
        loadedFaces: Array.from(document.fonts).filter((f) => f.status === 'loaded').length
      };
    })()`);
    assert.deepEqual(info.broken, [], rel + ' has a widget that failed to mount');
    assert.ok(info.shell, rel + ' has the page shell and skip link');
    assert.ok(info.icon, rel + ' has a favicon');
    assert.ok(info.bodyFont && info.displayFont && info.monoFont, rel + ' can use the self-hosted fonts');
    assert.ok(info.loadedFaces >= 1, rel + ' actually loaded a self-hosted font file');
  }
});

/* ---------- quizzes and activities accept their own answers ---------- */

test('every quiz can be passed with its own answer key, and passing completes the section', async () => {
  for (const rel of QUIZ_PAGES) {
    await fresh(rel);
    const r = await page.eval(`(async () => {
      const src = await (await fetch(location.href)).text();
      const blocks = Array.from(src.matchAll(/<div class="quiz"[^>]*>\\s*<script type="application\\/json"[^>]*>([\\s\\S]*?)<\\/script>/g)).map((m) => JSON.parse(m[1]));
      const quizzes = Array.from(document.querySelectorAll('.quiz'));
      const press = (box, label) => Array.from(box.querySelectorAll('button')).find((b) => b.textContent === label).click();
      const out = [];
      quizzes.forEach((el, qi) => {
        const qs = blocks[qi];
        const boxes = el.querySelectorAll('.quiz-q');
        qs.forEach((q, i) => {
          const box = boxes[i];
          const pick = (k) => box.querySelector('.choice[data-k="' + k + '"]').click();
          if (typeof q.answer === 'boolean') pick(q.answer ? 0 : 1);
          else if (Array.isArray(q.choices) && Array.isArray(q.answer)) { q.answer.forEach(pick); press(box, 'Check answer'); }
          else if (Array.isArray(q.choices)) pick(q.answer);
          else { box.querySelector('input').value = q.answer[0]; press(box, 'Check'); }
        });
        out.push({ score: el.querySelector('.quiz-score').textContent, want: 'Score: ' + qs.length + ' / ' + qs.length,
          wrong: el.querySelectorAll('.choice.wrong, .feedback.bad').length, marks: el.querySelectorAll('.choice.correct > .mark-good').length });
      });
      return { quizzes: quizzes.length, blocks: blocks.length, out, done: Object.keys(WD1.store.all().done).sort(), best: Object.values(WD1.store.all().quiz).every((q) => q.best === q.total) };
    })()`);
    assert.equal(r.quizzes, r.blocks, rel + ' mounted every quiz');
    assert.ok(r.quizzes > 0, rel + ' has quizzes');
    r.out.forEach((q, i) => {
      assert.equal(q.score, q.want, `${rel} quiz ${i + 1}`);
      assert.equal(q.wrong, 0, `${rel} quiz ${i + 1} marked a keyed answer wrong`);
      assert.ok(q.marks > 0, `${rel} quiz ${i + 1} marks the chosen answers with a ✓`);
    });
    assert.ok(r.best, rel + ' best scores are saved');
    if (MODULE_PAGES.includes(rel)) assert.equal(r.done.length, 7, rel + ' all seven sections complete after passing every quiz');
  }
});

test('order, sort, match and fill activities accept their own answers', async () => {
  let seen = { order: 0, buckets: 0, match: 0, fill: 0 };
  for (const rel of [...MODULE_PAGES, 'docs/components.html']) {
    await fresh(rel);
    const r = await page.eval(`(() => {
      const press = (el, label) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent === label).click();
      const out = { order: [], buckets: [], match: [], fill: [] };
      for (const el of document.querySelectorAll('.order')) {
        press(el, 'Show answer'); press(el, 'Check order');
        out.order.push({ status: el.querySelector('[role=status]').textContent, marks: el.querySelectorAll('.order-item.right > .mark-good').length, items: el.querySelectorAll('.order-item').length });
      }
      for (const el of document.querySelectorAll('.buckets')) {
        press(el, 'Show answers'); press(el, 'Check');
        out.buckets.push({ status: el.querySelector('[role=status]').textContent, marks: el.querySelectorAll('.bk-chip.right > .mark-good').length, items: el.querySelectorAll('.bk-chip').length });
      }
      for (const el of document.querySelectorAll('.match')) {
        const left = Array.from(el.querySelectorAll('.match-item[data-side=L]'));
        left.forEach((l) => { l.click(); el.querySelector('.match-item[data-side=R][data-k="' + l.dataset.k + '"]').click(); });
        out.match.push({ status: el.querySelector('.widget-foot').textContent, pairs: left.length });
      }
      for (const el of document.querySelectorAll('.fill')) {
        press(el, 'Show answers'); press(el, 'Check');
        out.fill.push({ status: el.querySelector('[role=status]').textContent, marks: el.querySelectorAll('.blank > .mark-good').length, blanks: el.querySelectorAll('.blank input').length });
      }
      return out;
    })()`);
    for (const o of r.order) { assert.equal(o.status, '✓ Perfect order!', rel); assert.equal(o.marks, o.items, rel + ' order marks'); }
    for (const o of r.buckets) { assert.match(o.status, /^✓ All \d+ sorted correctly!$/, rel); assert.equal(o.marks, o.items, rel + ' sort marks'); }
    for (const o of r.match) assert.equal(o.status, 'All matched · 0 misses', rel);
    for (const o of r.fill) { assert.equal(o.status, '✓ All blanks correct!', rel); assert.equal(o.marks, o.blanks, rel + ' fill marks'); assert.ok(o.blanks > 0, rel); }
    for (const k of Object.keys(seen)) seen[k] += r[k].length;
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n >= 3, `expected several ${k} activities across the course, found ${n}`);
});

/* ---------- challenges ---------- */

test('every challenge starts unsolved, and nothing is granted just for opening a page', async () => {
  await fresh('index.html');
  let total = 0;
  for (const rel of MODULE_PAGES) {
    await page.goto(server.url + rel);
    await settlePlaygrounds();
    const pgs = await page.eval(`Array.from(document.querySelectorAll('.playground')).filter((pg) => pg.querySelector('.pg-checks')).map((pg) => ({
      id: pg.dataset.id, checks: pg.querySelectorAll('.pg-checks li').length, failing: pg.querySelectorAll('.pg-checks li.fail').length, complete: !!pg.querySelector('.all-pass') }))`);
    assert.ok(pgs.length >= 2, rel + ' has challenges');
    for (const pg of pgs) {
      assert.ok(pg.failing >= 1, `${rel} ${pg.id}: the starter code already passes all ${pg.checks} checks, so there is nothing to do`);
      assert.equal(pg.complete, false, `${rel} ${pg.id} shows "Challenge complete" on load`);
    }
    total += pgs.length;
  }
  assert.ok(total >= 9, 'all nine lesson challenges were checked');
  await page.goto(server.url + 'index.html');
  const state = await page.eval(`({ stored: Object.keys(WD1.store.all().challenge), shown: document.querySelector('#hub-challenges').textContent })`);
  assert.deepEqual(state.stored, [], 'no challenge is recorded after only viewing the pages');
  assert.equal(state.shown, '0');
});

test('solving a challenge is recorded once, and only after the code was changed', async () => {
  await fresh('docs/components.html');
  await settlePlaygrounds();
  const sel = `document.querySelector('.playground[data-id="demo-pg"]')`;
  assert.deepEqual(await page.eval(`({ fail: ${sel}.querySelectorAll('.pg-checks li.fail').length, done: !!WD1.store.get('challenge', 'demo-pg') })`), { fail: 1, done: false });
  await page.eval(`(() => { window.__events = []; ${sel}.addEventListener('checks', (e) => window.__events.push(e.detail)); ${sel}.wd1.set('css', 'h1 { color: navy; }'); })()`);
  await page.waitFor(`!!${sel}.querySelector('.all-pass')`);
  const solved = await page.eval(`({ done: typeof WD1.store.get('challenge', 'demo-pg'), toast: (document.querySelector('.toast') || {}).textContent, last: window.__events.at(-1), saved: WD1.store.get('pg', 'demo-pg') })`);
  assert.equal(solved.done, 'number');
  assert.equal(solved.toast, 'Challenge complete!');
  assert.deepEqual(solved.last, { passed: 2, total: 2, complete: true });

  // Reset puts the starter back: checks go red again, the earned record stays, and Reset does not re-save or double-load.
  const reset = await page.eval(`(async () => {
    let loads = 0;
    ${sel}.querySelector('iframe').addEventListener('load', () => loads++);
    Array.from(${sel}.querySelectorAll('.widget-actions button')).find((b) => /Reset/.test(b.textContent)).click();
    await new Promise((r) => setTimeout(r, 900));
    return {
      fail: ${sel}.querySelectorAll('.pg-checks li.fail').length,
      complete: !!${sel}.querySelector('.all-pass'),
      done: typeof WD1.store.get('challenge', 'demo-pg'),
      saved: WD1.store.get('pg', 'demo-pg') === undefined,
      loads
    };
  })()`);
  assert.deepEqual(reset, { fail: 1, complete: false, done: 'number', saved: true, loads: 1 });
});

test('all nine lesson challenges can be solved as described', async () => {
  const solutions = [
    ['wk1/index.html', 0, 'js', `function respond(path) {\n  if (path === '/') return 'Home page';\n  if (path === '/about') return 'About page';\n  if (path === '/contact') return 'Contact page';\n  return 'Page not found';\n}`],
    ['wk1/index.html', 1, 'html', `<h1>Sign up</h1><form method="post" action="/signup"><input name="name" value="Ada"><select name="plan"><option value="free" selected>Free</option></select><input name="coupon" value="SAVE10"><button>Sign up</button></form>`],
    ['wk1/index.html', 2, 'js', `function greet(name) { if (!name) throw new Error('A name is required'); return 'Hello, ' + name + '!'; }\nfunction safeGreet(name) { try { return greet(name); } catch (err) { return 'Caught: ' + err.message; } }`],
    ['wk2/index.html', 0, 'js', `function parseUrl(url) { const q = url.indexOf('?'), path = q === -1 ? url : url.slice(0, q), query = {}; if (q !== -1) url.slice(q + 1).split('&').forEach((p) => { const eq = p.indexOf('='); if (eq === -1) return; const k = p.slice(0, eq), v = p.slice(eq + 1); query[k] = k in query ? (Array.isArray(query[k]) ? [...query[k], v] : [query[k], v]) : v; }); return { path, segments: path.split('/').filter(Boolean), query }; }`],
    ['wk2/index.html', 1, 'js', `let books = [], nextId = 1; const list = document.getElementById('book-list'); function loadBooks() { books = [{ id: 1, title: 'Dune', author: 'Frank Herbert' }, { id: 2, title: 'Emma', author: 'Jane Austen' }]; nextId = 3; render(); } function render() { list.replaceChildren(); books.forEach((b) => { const li = document.createElement('li'); li.dataset.id = b.id; const s = document.createElement('strong'); s.textContent = b.title; li.append(s, ' by ' + b.author); list.appendChild(li); }); } function addBook(t, a) { if (!t || !a) return; books.push({ id: nextId++, title: t, author: a }); render(); } loadBooks();`],
    ['wk3/index.html', 0, 'js', `function parseCookies(h) { const c = {}; for (const p of String(h).split(';')) { const eq = p.indexOf('='); if (eq === -1) continue; c[p.slice(0, eq).trim()] = p.slice(eq + 1).trim(); } return c; }`],
    ['wk3/index.html', 1, 'js', `function validateBook(b) { const e = []; if (!b || typeof b !== 'object') return ['Send a book object.']; if (typeof b.title !== 'string' || !b.title.trim()) e.push('Title'); else if (b.title.trim().length > 100) e.push('Title'); if (typeof b.author !== 'string' || !b.author.trim()) e.push('Author'); else if (b.author.trim().length > 60) e.push('Author'); if (!Number.isInteger(b.year)) e.push('Year'); else if (b.year < 1000 || b.year > 2100) e.push('Year'); return e; }`],
    ['wk4/index.html', 0, 'js', `function decodePart(p) { const b = p.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4))); }\nfunction decodeToken(t) { const ps = t.split('.'); if (ps.length !== 3) return null; return { header: decodePart(ps[0]), payload: decodePart(ps[1]) }; }`],
    ['wk4/index.html', 1, 'js', `const PERMISSIONS = { student: ['view courses', 'view grades', 'submit homework'], instructor: ['view courses', 'view grades', 'submit homework', 'edit grades'], admin: ['view courses', 'view grades', 'submit homework', 'edit grades', 'delete course', 'manage users'] };\nfunction can(r, a) { return Array.isArray(PERMISSIONS[r]) && PERMISSIONS[r].includes(a); }`]
  ];
  let loaded = null;
  for (const [rel, idx, lang, code] of solutions) {
    if (loaded !== rel) { await fresh(rel); loaded = rel; }
    await page.eval(`(() => { const pg = document.querySelectorAll('.playground')[${idx}]; pg.scrollIntoView(); pg.wd1.set(${JSON.stringify(lang)}, ${JSON.stringify(code)}); })()`);
    await page.waitFor(`!!document.querySelectorAll('.playground')[${idx}].querySelector('.all-pass')`);
    const r = await page.eval(`(() => { const pg = document.querySelectorAll('.playground')[${idx}]; return { fail: pg.querySelectorAll('.pg-checks li.fail').length, pass: pg.querySelectorAll('.pg-checks li.pass').length }; })()`);
    assert.equal(r.fail, 0, `${rel} challenge ${idx + 1} has failing checks`);
    assert.ok(r.pass >= 4, `${rel} challenge ${idx + 1} passed checks`);
  }
});

/* ---------- playground: handoff, sharing, sandbox ---------- */

test('"Open in playground" carries the lesson code across, once', async () => {
  await fresh('wk1/index.html');
  const lesson = await page.eval(`(() => {
    const pg = document.querySelector('.playground');
    let opened = null; window.open = (u) => { opened = u; return null; };
    Array.from(pg.querySelectorAll('.widget-actions button')).find((b) => /Open in playground/.test(b.textContent)).click();
    localStorage.setItem('wd1:handoff', JSON.stringify({ html: '<p>from the other course</p>', css: '', js: '', title: 'Web Dev I' }));
    return { opened, title: pg.querySelector('.widget-title').textContent, code: pg.wd1.get(), keys: Object.keys(localStorage).filter((k) => /handoff/.test(k)).sort() };
  })()`);
  assert.match(lesson.opened, /tools\/playground\.html#handoff$/);
  assert.deepEqual(lesson.keys, ['wd1:handoff', 'wd2:handoff']);

  await page.goto(server.url + 'tools/playground.html#handoff');
  const tool = await page.eval(`({ status: document.querySelector('#tp-status').textContent, editors: Array.from(document.querySelectorAll('.tp-pane textarea')).map((t) => t.value),
    left: localStorage.getItem('wd2:handoff'), hash: location.hash })`);
  assert.equal(tool.status, 'Opened from “' + lesson.title + '”');
  assert.deepEqual(tool.editors, [lesson.code.html || '', lesson.code.css || '', lesson.code.js || '']);
  assert.equal(tool.left, null, 'the handoff is used once');
  assert.equal(tool.hash, '');

  // With no handoff waiting, the other course's leftover key is ignored.
  await page.goto(server.url + 'tools/playground.html#handoff');
  const again = await page.eval(`({ status: document.querySelector('#tp-status').textContent, html: document.querySelector('.tp-pane textarea').value })`);
  assert.doesNotMatch(again.status, /Opened from/);
  assert.doesNotMatch(again.html, /from the other course/);
});

test('shared code runs in a sandbox and cannot touch the site', async () => {
  await fresh('tools/playground.html');
  await page.eval(`localStorage.setItem('wd2:v1', JSON.stringify({ done: { 's1-1': 1 }, challengeRev: 2 }))`);
  const attack = {
    html: '<p id="shared">shared page</p>',
    css: '',
    js: [
      "const tries = {};",
      "try { parent.document.title = 'changed by shared code'; tries.parentDom = 'reached'; } catch (e) { tries.parentDom = e.name; }",
      "try { parent.localStorage.clear(); tries.parentStorage = 'reached'; } catch (e) { tries.parentStorage = e.name; }",
      "try { localStorage.setItem('x', '1'); tries.ownStorage = 'reached'; } catch (e) { tries.ownStorage = e.name; }",
      "try { document.cookie = 'a=1'; tries.cookie = document.cookie ? 'reached' : 'empty'; } catch (e) { tries.cookie = e.name; }",
      "try { top.location.href = 'https://example.com/'; tries.topNav = 'attempted'; } catch (e) { tries.topNav = e.name; }",
      "tries.popup = window.open('about:blank') ? 'reached' : 'blocked';",
      "console.log(JSON.stringify(tries));"
    ].join('\n')
  };
  await page.goto(server.url + 'tools/playground.html#code=' + b64(attack), { settle: 1500 });
  const r = await page.eval(`({ title: document.title, url: location.pathname, status: document.querySelector('#tp-status').textContent,
    sandbox: document.querySelector('#tp-frame').getAttribute('sandbox'), js: document.querySelectorAll('.tp-pane textarea')[2].value,
    lines: Array.from(document.querySelectorAll('#tp-console .log-line')).map((l) => l.textContent), state: localStorage.getItem('wd2:v1') })`);
  assert.equal(r.status, 'Loaded from a share link');
  assert.equal(r.js, attack.js, 'the shared code is loaded into the editor');
  assert.equal(r.sandbox, 'allow-scripts allow-forms allow-modals');
  assert.equal(r.title, 'Code Playground · Web Dev II', 'the page around the preview is untouched');
  assert.match(r.url, /tools\/playground\.html$/, 'the page was not navigated away');
  assert.ok(JSON.parse(r.state).done['s1-1'], 'saved progress is untouched');
  const tries = JSON.parse(r.lines.find((l) => l.startsWith('{')));
  assert.equal(tries.parentDom, 'SecurityError');
  assert.equal(tries.parentStorage, 'SecurityError');
  assert.equal(tries.ownStorage, 'SecurityError');
  assert.notEqual(tries.cookie, 'reached');
  assert.equal(tries.popup, 'blocked');
});

test('a malformed share link falls back quietly', async () => {
  for (const hash of ['#code=not-base64!!', '#code=' + encodeURIComponent(Buffer.from('[1,2]').toString('base64')), '#code=' + encodeURIComponent(Buffer.from('"text"').toString('base64'))]) {
    await fresh('tools/playground.html' + hash, { settle: 800 });
    const r = await page.eval(`({ status: document.querySelector('#tp-status').textContent, html: document.querySelector('.tp-pane textarea').value })`);
    assert.equal(r.status, 'Example: JavaScript events', hash);
    assert.match(r.html, /Like/);
    assert.deepEqual(page.problems(), [], hash);
  }
  // Values of the wrong type become empty editors instead of "[object Object]".
  await fresh('tools/playground.html#code=' + b64({ html: { a: 1 }, css: 7, js: ['x'] }), { settle: 800 });
  assert.deepEqual(await page.eval(`Array.from(document.querySelectorAll('.tp-pane textarea')).map((t) => t.value)`), ['', '', '']);
});

test('lesson previews are sandboxed, and saved code from an imported file stays inside the sandbox', async () => {
  await fresh('wk2/index.html');
  const hostile = "try { parent.document.body.setAttribute('data-owned', '1'); } catch (e) { console.log('blocked ' + e.name); }";
  await page.eval(`WD1.store.importJSON(JSON.stringify({ done: {}, pg: { 's2-1-pg-1': { js: ${JSON.stringify(hostile)} } }, challengeRev: 2 }))`);
  await page.goto(server.url + 'wk2/index.html');
  await settlePlaygrounds();
  const r = await page.eval(`({ owned: document.body.hasAttribute('data-owned'),
    frames: Array.from(document.querySelectorAll('iframe')).map((f) => f.getAttribute('sandbox')),
    console: document.querySelector('.playground[data-id="s2-1-pg-1"] .pg-console').textContent })`);
  assert.equal(r.owned, false);
  assert.ok(r.frames.length >= 2);
  for (const s of r.frames) assert.equal(s, 'allow-scripts allow-forms allow-modals');
  assert.match(r.console, /blocked SecurityError/);
});

test('a runaway loop is stopped with a message and the page stays responsive', async () => {
  await fresh('docs/components.html');
  await settlePlaygrounds();
  const r = await page.eval(`(async () => {
    const pg = document.querySelector('.playground[data-id="demo-pg"]');
    let maxGap = 0, last = performance.now();
    const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 20);
    pg.wd1.set('js', 'let n = 0;\\nwhile (true) {\\n  n++;\\n}\\nconsole.log("never");');
    await new Promise((r) => setTimeout(r, 3500));
    clearInterval(timer);
    return { maxGap: Math.round(maxGap), lines: Array.from(pg.querySelectorAll('.pg-console .log-line')).map((l) => l.textContent) };
  })()`);
  assert.ok(r.maxGap < 1000, `the lesson page stalled for ${r.maxGap} ms`);
  assert.ok(r.lines.some((l) => /Loop stopped after 1\.5 seconds/.test(l) && /\(JS line 2\)/.test(l)), 'console explains the stop and cites the loop line: ' + JSON.stringify(r.lines));
  assert.ok(!r.lines.includes('never'), 'code after the loop does not run');
});

test('a loop that logs forever cannot bury the page in console lines', async () => {
  await fresh('docs/components.html');
  await settlePlaygrounds();
  const r = await page.eval(`(async () => {
    const pg = document.querySelector('.playground[data-id="demo-pg"]');
    let maxGap = 0, last = performance.now();
    const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 20);
    pg.wd1.set('js', 'let i = 0;\\nwhile (true) { console.log("line " + i++); }');
    await new Promise((r) => setTimeout(r, 4000));
    clearInterval(timer);
    const lines = Array.from(pg.querySelectorAll('.pg-console .log-line')).map((l) => l.textContent);
    return { maxGap: Math.round(maxGap), count: lines.length, first: lines[0], paused: lines.some((l) => /Console paused: more than 500 lines/.test(l)), stopped: lines.some((l) => /Loop stopped/.test(l)) };
  })()`);
  assert.ok(r.maxGap < 1000, `the lesson page stalled for ${r.maxGap} ms`);
  assert.equal(r.first, 'line 0');
  assert.ok(r.count <= 502, `the console shows ${r.count} lines`);
  assert.ok(r.paused, 'the student is told output was cut off');
  assert.ok(r.stopped, 'the loop-stopped error still gets through');

  // Whatever a preview sends, the page never keeps more than its cap.
  const capped = await page.eval(`(async () => {
    const pg = document.querySelector('.playground[data-id="demo-pg"]');
    const frame = pg.querySelector('iframe');
    frame.srcdoc = '<script>for (var i = 0; i < 3000; i++) parent.postMessage({ wd1pg: "demo-pg", type: "log", args: ["raw " + i] }, "*");<\/script>';
    await new Promise((r) => setTimeout(r, 2500));
    const lines = pg.querySelectorAll('.pg-console .log-line');
    return { count: lines.length, last: lines[lines.length - 1].textContent, cap: WD1.MAX_CONSOLE_LINES };
  })()`);
  assert.equal(capped.count, capped.cap);
  assert.equal(capped.last, 'raw 2999');
});

test('a slow loop that waits on timers is left alone', async () => {
  await fresh('docs/components.html');
  await settlePlaygrounds();
  const lines = await page.eval(`(async () => {
    const pg = document.querySelector('.playground[data-id="demo-pg"]');
    pg.wd1.set('js', '(async () => {\\n  let n = 0;\\n  while (n < 5) { await new Promise((r) => setTimeout(r, 450)); n++; }\\n  console.log("finished " + n);\\n})();');
    await new Promise((r) => setTimeout(r, 3600));
    return Array.from(pg.querySelectorAll('.pg-console .log-line')).map((l) => l.textContent);
  })()`);
  assert.deepEqual(lines, ['finished 5']);
});

test('console output, error lines and form reports cross the sandbox as plain text', async () => {
  await fresh('docs/components.html');
  await settlePlaygrounds();
  const js = [
    "console.log('text', 42, { a: [1, 2] }, null, undefined);",
    "console.warn(document.querySelector('h1'));",
    "console.info('<img src=x onerror=alert(1)>');",
    "document.querySelector('form').requestSubmit();",
    "Promise.reject(new Error('async boom'));",
    "undefinedFunction();"
  ].join('\n');
  const r = await page.eval(`(async () => {
    const pg = document.querySelector('.playground[data-id="demo-pg"]');
    pg.wd1.set('js', ${JSON.stringify(js)});
    await new Promise((r) => setTimeout(r, 1500));
    const c = pg.querySelector('.pg-console');
    return { lines: Array.from(c.querySelectorAll('.log-line')).map((l) => ({ cls: l.className, text: l.textContent })), imgs: c.querySelectorAll('img').length };
  })()`);
  const text = r.lines.map((l) => l.text);
  assert.equal(text[0], 'text 42 { "a": [ 1, 2 ] } null undefined');
  assert.equal(text[1], '⚠ <h1>');
  assert.equal(text[2], '› <img src=x onerror=alert(1)>');
  assert.equal(r.imgs, 0, 'console text is never parsed as HTML');
  assert.ok(text.some((t) => /^› Form submitted: GET \/subscribe · email=ana%40example\.com/.test(t)), JSON.stringify(text));
  assert.ok(text.some((t) => /Unhandled promise rejection: Error: async boom/.test(t)), JSON.stringify(text));
  assert.ok(text.some((t) => /^✖ .*undefinedFunction is not defined \(JS line 6\)$/.test(t)), JSON.stringify(text));
  assert.ok(r.lines.find((l) => /undefinedFunction/.test(l.text)).cls.includes('error'));

  // Messages that do not come from the playground's own frame are ignored.
  const forged = await page.eval(`(async () => {
    const pg = document.querySelector('.playground[data-id="demo-pg"]');
    const before = pg.querySelectorAll('.pg-console .log-line').length;
    window.postMessage({ wd1pg: 'demo-pg', type: 'log', args: ['forged'] }, '*');
    window.postMessage({ wd1pg: 'demo-pg', type: 'checks', results: [true, true] }, '*');
    await new Promise((r) => setTimeout(r, 300));
    return { added: pg.querySelectorAll('.pg-console .log-line').length - before, complete: !!pg.querySelector('.all-pass') };
  })()`);
  assert.deepEqual(forged, { added: 0, complete: false });
});

/* ---------- layout ---------- */

test('every page fits a phone without sideways scrolling', async () => {
  for (const rel of PAGES) {
    await fresh(rel, { ...PHONE, settle: 700 });
    const r = await page.eval(`({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, vw: document.documentElement.clientWidth })`);
    assert.equal(r.over, 0, `${rel} is ${r.over}px wider than a ${r.vw}px phone`);
  }
});

test('the hub still fits a phone when "Continue" names the longest section', async () => {
  await fresh('index.html');
  const longest = await page.eval(`WD1.MODULES.flatMap((m) => m.sections).sort((a, b) => b.title.length - a.title.length)[0].id`);
  await page.eval(`localStorage.setItem('wd2:v1', JSON.stringify({ done: {}, last: { module: 'wk2', section: ${JSON.stringify(longest)}, t: 1 }, challengeRev: 2 }))`);
  for (const width of [390, 320]) {
    await page.goto(server.url + 'index.html', { width, height: 800, mobile: true, settle: 700 });
    const r = await page.eval(`({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, label: document.querySelector('#hub-continue').textContent,
      right: Math.round(document.querySelector('#hub-continue').getBoundingClientRect().right) })`);
    assert.match(r.label, /^Continue: /);
    assert.equal(r.over, 0, `hub overflows by ${r.over}px at ${width}px`);
    assert.ok(r.right <= width, 'the Continue button stays on screen');
  }
});

test('the hub reflects saved progress', async () => {
  await fresh('index.html');
  await page.eval(`localStorage.setItem('wd2:v1', JSON.stringify({ done: { 's1-1': 1, 's1-2': 2, 's3-4': 3 }, quiz: { a: { best: 3, total: 4 }, b: { best: 4, total: 4 } }, challenge: { x: 1 }, challengeRev: 2 }))`);
  await page.goto(server.url + 'index.html');
  const r = await page.eval(`({ pct: document.querySelector('#hub-pct').textContent, sections: document.querySelector('#hub-sections').textContent, quizzes: document.querySelector('#hub-quizzes').textContent,
    avg: document.querySelector('#hub-avg').textContent, challenges: document.querySelector('#hub-challenges').textContent, cards: document.querySelectorAll('.hub-mod').length,
    doneRows: document.querySelectorAll('.hub-mod li.done').length, cta: document.querySelector('#hub-continue').textContent, matrixRows: document.querySelectorAll('#hub-matrix tbody tr').length })`);
  assert.deepEqual(r, { pct: '11%', sections: '3 of 28 sections complete', quizzes: '2', avg: '88%', challenges: '1', cards: 4, doneRows: 3, cta: 'Next up: 1.3 npm: Packages and package.json', matrixRows: 8 });
});

/* ---------- keyboard and screen readers ---------- */

test('flashcards are readable by screen readers', async () => {
  await fresh('wk1/index.html');
  const term = await page.eval(`document.querySelector('.fc-card .fc-front .fc-text').textContent`);
  const front = await page.ax('.fc-card');
  assert.equal(front.role, 'button');
  assert.ok(front.name.includes(term), `the button is named by its term, got "${front.name}"`);
  assert.equal(front.description, 'Press to flip the card.');
  const definition = await page.eval(`(() => { const c = document.querySelector('.fc-card'); c.click(); return c.querySelector('.fc-back .fc-text').textContent; })()`);
  const back = await page.ax('.fc-card');
  assert.ok(back.name.includes(definition.slice(0, 40)), `after flipping, the button is named by the definition, got "${back.name}"`);
  assert.ok(!back.name.includes(term) || definition.includes(term), 'the hidden face is not read');
  const live = await page.eval(`(() => { const s = document.querySelector('.flashcards'); const first = s.querySelector('[aria-live]').textContent;
    Array.from(s.querySelectorAll('button')).find((b) => /Next/.test(b.textContent)).click(); return { first, next: s.querySelector('[aria-live]').textContent }; })()`);
  assert.ok(live.first.includes(definition.slice(0, 40)), 'flipping announces the new face');
  assert.match(live.next, /^Card 2 of \d+\. /, 'moving on announces the next card');
});

test('progress import is a real button that opens the file picker', async () => {
  await fresh('index.html');
  const r = await page.eval(`(() => {
    const b = document.querySelector('#hub-import');
    let opened = 0; document.querySelector('#hub-import-file').click = () => { opened++; };
    b.focus(); const focused = document.activeElement === b;
    b.click();
    return { tag: b.tagName, tabIndex: b.tabIndex, focused, opened, labels: document.querySelectorAll('label[for=hub-import-file]').length };
  })()`);
  assert.deepEqual(r, { tag: 'BUTTON', tabIndex: 0, focused: true, opened: 1, labels: 0 });
});

test('progress survives an export and import round trip, and junk files are refused', async () => {
  await fresh('index.html');
  const r = await page.eval(`(async () => {
    WD1.progress.setDone('s2-2', true, true);
    const file = WD1.store.exportJSON();
    WD1.store.reset();
    const empty = WD1.progress.overall().done;
    const give = async (text) => {
      const input = document.querySelector('#hub-import-file');
      const dt = new DataTransfer(); dt.items.add(new File([text], 'p.json', { type: 'application/json' }));
      input.files = dt.files; input.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 300));
      return Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent).at(-1);
    };
    const bad = await give('{"hello": 1}');
    const afterBad = WD1.progress.overall().done;
    const good = await give(file);
    return { empty, bad, afterBad, good, done: WD1.progress.isDone('s2-2'), shown: document.querySelector('#hub-sections').textContent };
  })()`);
  assert.deepEqual(r, { empty: 0, bad: 'That file is not a course progress export.', afterBad: 0, good: 'Progress imported', done: true, shown: '1 of 28 sections complete' });
});

test('right and wrong are shown with marks and words, not color alone', async () => {
  await fresh('wk1/index.html');
  const quiz = await page.eval(`(async () => {
    const src = await (await fetch(location.href)).text();
    const first = JSON.parse(src.match(/<div class="quiz"[^>]*>\\s*<script type="application\\/json"[^>]*>([\\s\\S]*?)<\\/script>/)[1]);
    const qi = first.findIndex((q) => Array.isArray(q.choices) && typeof q.answer === 'number');
    const q = first[qi];
    const box = document.querySelectorAll('.quiz')[0].querySelectorAll('.quiz-q')[qi];
    const wrongK = q.choices.findIndex((_, k) => k !== q.answer);
    box.querySelector('.choice[data-k="' + wrongK + '"]').click();
    const info = (b) => ({ pressed: b.getAttribute('aria-pressed'), mark: (b.querySelector('.mark [aria-hidden]') || {}).textContent, sr: (b.querySelector('.mark .sr-only') || {}).textContent, disabled: b.disabled });
    return { chosen: info(box.querySelector('.choice[data-k="' + wrongK + '"]')), right: info(box.querySelector('.choice[data-k="' + q.answer + '"]')),
      others: Array.from(box.querySelectorAll('.choice')).filter((b) => ![wrongK, q.answer].includes(+b.dataset.k)).map((b) => b.querySelectorAll('.mark').length),
      feedback: box.querySelector('.feedback').textContent.slice(0, 10), live: box.querySelector('.feedback').getAttribute('aria-live') };
  })()`);
  assert.deepEqual(quiz.chosen, { pressed: 'true', mark: '✗', sr: ' (your answer, incorrect)', disabled: true });
  assert.deepEqual(quiz.right, { pressed: 'false', mark: '✓', sr: ' (the correct answer)', disabled: true });
  assert.ok(quiz.others.every((n) => n === 0), 'unchosen wrong answers carry no mark');
  assert.equal(quiz.feedback, 'Not quite.');
  assert.equal(quiz.live, 'polite');

  const acts = await page.eval(`(() => {
    const press = (el, label) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent === label).click();
    const order = document.querySelector('.order'); press(order, 'Check order');
    const o = { wrong: order.querySelectorAll('.order-item.wrong').length, marked: order.querySelectorAll('.order-item.wrong > .mark-bad').length,
      sr: order.querySelector('.order-item.wrong .mark .sr-only').textContent, status: order.querySelector('[role=status]').textContent };
    order.querySelector('.order-item .o-btns button:last-child').click();
    o.clearedOnMove = order.querySelectorAll('.mark').length;

    const fill = document.querySelector('.fill'); const input = fill.querySelector('.blank input');
    input.value = 'definitely wrong'; press(fill, 'Check');
    const f = { invalid: input.getAttribute('aria-invalid'), label: input.getAttribute('aria-label'), mark: (fill.querySelector('.blank > .mark-bad [aria-hidden]') || {}).textContent, height: Math.round(input.getBoundingClientRect().height) };
    input.dispatchEvent(new Event('input'));
    f.cleared = { invalid: input.getAttribute('aria-invalid'), label: input.getAttribute('aria-label'), marks: input.parentNode.querySelectorAll('.mark').length };

    const bk = document.querySelector('.buckets'); const chips = Array.from(bk.querySelectorAll('.bk-chip')); const zones = Array.from(bk.querySelectorAll('.bk-bucket'));
    press(bk, 'Check'); const early = bk.querySelector('[role=status]').textContent;
    chips.forEach((c) => { c.click(); zones[0].click(); }); press(bk, 'Check');
    const b = { early, status: bk.querySelector('[role=status]').textContent, wrong: bk.querySelectorAll('.bk-chip.wrong').length, marked: bk.querySelectorAll('.bk-chip.wrong > .mark-bad').length,
      zoneRole: zones[0].getAttribute('role'), headTag: zones[0].querySelector('.bk-bucket-head').tagName, nestedBtns: bk.querySelectorAll('button button, [role=button] button').length };
    return { o, f, b };
  })()`);
  assert.ok(acts.o.wrong >= 1 && acts.o.marked === acts.o.wrong, 'every misplaced item carries a ✗');
  assert.equal(acts.o.sr, ' (not in the right spot)');
  assert.match(acts.o.status, /^\d+ of \d+ in the right spot\.$/);
  assert.equal(acts.o.clearedOnMove, 0, 'moving an item clears the old verdict');
  assert.equal(acts.f.invalid, 'true');
  assert.equal(acts.f.label, 'Blank 1, incorrect');
  assert.equal(acts.f.mark, '✗');
  assert.ok(acts.f.height >= 24, 'blanks are at least 24px tall');
  assert.deepEqual(acts.f.cleared, { invalid: null, label: 'Blank 1', marks: 0 });
  assert.match(acts.b.early, /^Place every item first/);
  assert.ok(acts.b.wrong >= 1 && acts.b.marked === acts.b.wrong, 'every mis-sorted item carries a ✗');
  assert.match(acts.b.status, /Move the ones marked ✗\.$/, 'the hint does not rely on color');
  assert.deepEqual([acts.b.zoneRole, acts.b.headTag, acts.b.nestedBtns], ['region', 'BUTTON', 0]);
});

test('controls are large enough to tap and the shell is navigable', async () => {
  await fresh('wk2/index.html', { ...PHONE, settle: 700 });
  const r = await page.eval(`(() => {
    const size = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    const small = Array.from(document.querySelectorAll('button, .btn, summary, select')).filter((el) => { const [w, h] = size(el); return w && h && (w < 24 || h < 24); })
      .map((el) => el.className + ' ' + size(el).join('x'));
    const toggle = document.querySelector('.toc-toggle'); toggle.click();
    const open = { expanded: toggle.getAttribute('aria-expanded'), cls: document.body.classList.contains('toc-open') };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return { small, open, closed: toggle.getAttribute('aria-expanded'), skip: document.querySelector('.skip-link').getAttribute('href'), main: document.querySelector('main').id,
      navs: Array.from(document.querySelectorAll('nav')).map((n) => n.getAttribute('aria-label')), dot: size(document.querySelector('.stepper-dots button')),
      current: document.querySelectorAll('.stepper-dots button[aria-current=step]').length > 0 };
  })()`);
  assert.deepEqual(r.small, [], 'tap targets under 24px');
  assert.deepEqual(r.dot, [24, 24]);
  assert.deepEqual(r.open, { expanded: 'true', cls: true });
  assert.equal(r.closed, 'false', 'Escape closes the section list');
  assert.equal(r.skip, '#' + r.main);
  assert.deepEqual(r.navs, ['Course', 'Modules']);
  assert.ok(r.current);
});

test('theme choice is applied, remembered, and kept in sync on import and reset', async () => {
  await fresh('glossary.html');
  const r = await page.eval(`(() => {
    const b = document.querySelector('.theme-toggle'); const before = document.documentElement.getAttribute('data-theme');
    b.click(); const first = document.documentElement.getAttribute('data-theme'); const label = b.getAttribute('aria-label');
    WD1.toast('Done', 'visited');
    const toastColor = getComputedStyle(document.querySelector('.toast.visited')).color;
    return { before, first, label, toastColor, saved: JSON.parse(localStorage.getItem('wd2:v1')).prefs.theme };
  })()`);
  assert.equal(r.before, null);
  assert.ok(['dark', 'light'].includes(r.first));
  assert.equal(r.saved, r.first);
  assert.match(r.label, /^Switch to (light|dark) theme$/);
  if (r.first === 'dark') assert.notEqual(r.toastColor, 'rgb(255, 255, 255)', 'dark-mode visited toast uses dark ink for contrast');
  await page.goto(server.url + 'index.html');
  assert.equal(await page.eval(`document.documentElement.getAttribute('data-theme')`), r.first, 'the choice follows the visitor to other pages');
  const sync = await page.eval(`(() => {
    WD1.store.reset();
    const afterReset = { theme: document.documentElement.getAttribute('data-theme'), label: document.querySelector('.theme-toggle').getAttribute('aria-label') };
    WD1.store.importJSON(JSON.stringify({ done: {}, prefs: { theme: 'dark' }, challengeRev: 2 }));
    const afterImport = { theme: document.documentElement.getAttribute('data-theme'), label: document.querySelector('.theme-toggle').getAttribute('aria-label') };
    return { afterReset, afterImport };
  })()`);
  assert.equal(sync.afterReset.theme, null);
  assert.deepEqual(sync.afterImport, { theme: 'dark', label: 'Switch to light theme' });
});

/* ---------- every widget, by pointer, keyboard and drag ---------- */

test('quiz: wrong answers, select-all, typed answers, Enter and retry', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(async () => {
    const quiz = document.querySelector('.quiz[data-id="demo-quiz"]');
    const press = (el, label) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent === label).click();
    const boxes = () => quiz.querySelectorAll('.quiz-q');
    const out = {};
    let done = null; quiz.addEventListener('quizdone', (e) => { done = e.detail; });

    boxes()[0].querySelector('.choice[data-k="0"]').click();                     // wrong single answer
    const multi = boxes()[1];
    press(multi, 'Check answer');                                               // nothing selected yet
    out.emptyToast = Array.from(document.querySelectorAll('.toast')).at(-1).textContent;
    multi.querySelector('.choice[data-k="0"]').click();
    multi.querySelector('.choice[data-k="1"]').click();                          // one right, one wrong
    multi.querySelector('.choice[data-k="1"]').click(); multi.querySelector('.choice[data-k="1"]').click(); // toggling works
    press(multi, 'Check answer');
    out.multi = Array.from(multi.querySelectorAll('.choice')).map((b) => (b.querySelector('.mark .sr-only') || {}).textContent || '');
    out.multiFeedback = multi.querySelector('.feedback').textContent;
    boxes()[2].querySelector('.choice[data-k="1"]').click();                     // "False" — wrong
    const typed = boxes()[3], input = typed.querySelector('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); // empty: ignored
    out.emptyIgnored = !input.disabled;
    input.value = '80';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    out.typed = { disabled: input.disabled, feedback: typed.querySelector('.feedback').textContent };
    out.score = quiz.querySelector('.quiz-score').textContent;
    out.done = done;
    out.failToast = Array.from(document.querySelectorAll('.toast')).at(-1).textContent;
    out.saved = WD1.store.get('quiz', 'demo-quiz');

    press(quiz, 'Retry quiz');
    out.afterRetry = { score: quiz.querySelector('.quiz-score').textContent, best: quiz.querySelector('.quiz-summary .muted').textContent, locked: quiz.querySelectorAll('.choice:disabled').length };
    boxes()[0].querySelector('.choice[data-k="1"]').click();
    [0, 2, 3].forEach((k) => boxes()[1].querySelector('.choice[data-k="' + k + '"]').click()); press(boxes()[1], 'Check answer');
    boxes()[2].querySelector('.choice[data-k="0"]').click();
    boxes()[3].querySelector('input').value = ' 443 '; press(boxes()[3], 'Check');
    out.second = { score: quiz.querySelector('.quiz-score').textContent, toast: Array.from(document.querySelectorAll('.toast')).at(-1).textContent, best: WD1.store.get('quiz', 'demo-quiz').best };
    return out;
  })()`);
  assert.equal(r.emptyToast, 'Select at least one choice.');
  assert.deepEqual(r.multi, [' (selected, correct)', ' (selected, incorrect)', ' (correct, not selected)', ' (correct, not selected)']);
  assert.match(r.multiFeedback, /^Not quite\. The choices marked ✓ are the full correct set\./);
  assert.ok(r.emptyIgnored, 'Enter on an empty answer does nothing');
  assert.equal(r.typed.disabled, true);
  assert.match(r.typed.feedback, /^Not quite\. Expected: 443/);
  assert.equal(r.score, 'Score: 0 / 4');
  assert.deepEqual(r.done, { correct: 0, total: 4 });
  assert.equal(r.failToast, '0 / 4. Review the explanations, then retry.');
  assert.equal(r.saved.best, 0);
  assert.deepEqual(r.afterRetry, { score: '0 correct · 0 of 4 answered', best: 'Best: 0 / 4', locked: 0 });
  assert.deepEqual(r.second, { score: 'Score: 4 / 4', toast: 'Nice work: 4 / 4', best: 4 });
});

test('quiz: a regex pattern can accept answers the list does not spell out', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(() => {
    const host = document.createElement('div');
    host.className = 'quiz';
    host.innerHTML = '<script type="application/json">' + JSON.stringify([
      { q: 'Name the tag', answer: ['h1'], pattern: '^<?h1>?$', explain: 'x' },
      { q: 'Case matters', answer: ['GET'], caseSensitive: true, explain: 'x' },
      { q: 'Broken pattern is ignored', answer: ['a'], pattern: '([', explain: 'x' }
    ]) + '</scr' + 'ipt>';
    const wrap = document.createElement('div'); wrap.appendChild(host);
    document.querySelector('main').appendChild(wrap);
    WD1.init(wrap);   // mounts components inside markup added after page load
    const boxes = host.querySelectorAll('.quiz-q');
    const answer = (i, text) => { boxes[i].querySelector('input').value = text; Array.from(boxes[i].querySelectorAll('button')).find((b) => b.textContent === 'Check').click(); return boxes[i].querySelector('.feedback').classList.contains('good'); };
    return { pattern: answer(0, '<H1>'), caseWrong: answer(1, 'get'), badPattern: answer(2, 'zzz'), title: host.querySelector('.widget-title').textContent, id: host.dataset.id };
  })()`);
  assert.deepEqual(r, { pattern: true, caseWrong: false, badPattern: false, title: 'Check your understanding', id: 'page-quiz-1' });
});

test('flashcards: flip, move with buttons and arrow keys, track known cards', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(() => {
    const fc = document.querySelector('.flashcards');
    const press = (re) => Array.from(fc.querySelectorAll('button')).find((b) => re.test(b.textContent)).click();
    const counts = () => Array.from(fc.querySelectorAll('.fc-count')).map((c) => c.textContent).join(' ');
    const term = () => fc.querySelector('.fc-front .fc-text').textContent;
    const out = { start: counts(), first: term() };
    press(/I knew it/); out.afterKnown = counts();
    press(/Study again/); out.afterAgain = counts();
    press(/Prev/); press(/Prev/); out.afterPrev = counts();
    fc.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); out.afterRight = counts();
    fc.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); out.afterLeft = counts();
    fc.querySelector('.fc-card').click(); out.flipped = fc.querySelector('.fc-card').classList.contains('flipped');
    press(/Shuffle/); out.afterShuffle = { counts: counts(), flipped: fc.querySelector('.fc-card').classList.contains('flipped'), live: fc.querySelector('[aria-live]').textContent.slice(0, 12) };
    press(/I knew it/); press(/Restart/); out.afterRestart = { counts: counts(), first: term() };
    window.dispatchEvent(new Event('resize'));
    out.height = parseInt(fc.querySelector('.fc-card').style.height, 10) >= 200;
    return out;
  })()`);
  assert.equal(r.start, 'Card 1 / 3 · Known 0 / 3');
  assert.equal(r.first, 'TCP');
  assert.equal(r.afterKnown, 'Card 2 / 3 · Known 1 / 3');
  assert.equal(r.afterAgain, 'Card 3 / 3 · Known 1 / 3');
  assert.equal(r.afterPrev, 'Card 1 / 3 · Known 1 / 3');
  assert.equal(r.afterRight, 'Card 2 / 3 · Known 1 / 3');
  assert.equal(r.afterLeft, 'Card 1 / 3 · Known 1 / 3');
  assert.equal(r.flipped, true);
  assert.deepEqual(r.afterShuffle, { counts: 'Card 1 / 3 · Known 1 / 3', flipped: false, live: 'Card 1 of 3.' });
  assert.deepEqual(r.afterRestart, { counts: 'Card 1 / 3 · Known 0 / 3', first: 'TCP' });
  assert.ok(r.height);
});

test('code samples: highlighted, and copied with a fallback when the clipboard is blocked', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(async () => {
    const block = document.querySelector('.code-block');
    const btn = block.querySelector('.copy-btn');
    let copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { copied = t; return Promise.resolve(); } } });
    btn.click(); await new Promise((r) => setTimeout(r, 50));
    const ok = { label: btn.textContent, firstLine: copied.split(String.fromCharCode(10))[0], hasScriptEnd: copied.includes('</scr' + 'ipt>') };
    // Double-clicking Copy while "Copied" is showing must still restore "Copy".
    btn.click();
    await new Promise((r) => setTimeout(r, 1550));
    ok.restored = btn.textContent;

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    document.execCommand = () => false;
    btn.click(); await new Promise((r) => setTimeout(r, 50));
    const blocked = Array.from(document.querySelectorAll('.toast')).at(-1).textContent;
    document.execCommand = () => true;
    btn.click(); await new Promise((r) => setTimeout(r, 50));
    const fallback = btn.textContent;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    btn.click(); await new Promise((r) => setTimeout(r, 50));
    WD1.copy('no button');
    return { ok, blocked, fallback, noApi: btn.textContent, tokens: block.querySelectorAll('pre .tk-tag, pre .tk-kw, pre .tk-prop, pre .tk-com').length, lang: block.querySelector('.code-lang').textContent };
  })()`);
  assert.deepEqual(r.ok, { label: 'Copied', firstLine: '<!-- A tiny page -->', hasScriptEnd: true, restored: 'Copy' });
  assert.match(r.blocked, /^Copy is blocked here/);
  assert.equal(r.fallback, 'Copied');
  assert.equal(r.noApi, 'Copied');
  assert.ok(r.tokens > 10, 'HTML, CSS and JS inside the sample are all highlighted');
  assert.equal(r.lang, 'html');
});

test('code editor: Tab, Shift+Tab, Enter indentation, and Escape to leave', async () => {
  await fresh('docs/components.html');
  await settlePlaygrounds();
  const r = await page.eval(`(() => {
    const pg = document.querySelector('.playground[data-id="demo-pg"]');
    const NL = String.fromCharCode(10);
    const tabs = Array.from(pg.querySelectorAll('.pg-tab'));
    const panels = Array.from(pg.querySelectorAll('[role=tabpanel]'));
    const tabsWired = tabs.every((t, i) => t.getAttribute('aria-controls') === panels[i].id && panels[i].getAttribute('aria-labelledby') === t.id);
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    const arrowSelected = tabs.map((t) => t.getAttribute('aria-selected'));
    tabs.find((t) => t.textContent === 'CSS').click();
    const shown = Array.from(pg.querySelectorAll('.pg-editor-col textarea')).map((t) => !t.closest('[hidden]'));
    const selected = tabs.map((t) => t.getAttribute('aria-selected'));
    const ta = pg.querySelectorAll('.pg-editor-col textarea')[1];
    const key = (k, extra) => { const e = new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})); ta.dispatchEvent(e); return e.defaultPrevented; };
    const set = (v, at) => { ta.focus(); ta.value = v; ta.setSelectionRange(at == null ? v.length : at, at == null ? v.length : at); };
    const out = { tabsWired, arrowSelected, shown, selected };
    set('h1 {'); key('Enter'); out.afterBrace = ta.value;
    set('h1 {}', 4); key('Enter'); out.between = ta.value; out.caret = ta.selectionStart;
    set('a'); out.tabPrevented = key('Tab'); out.afterTab = ta.value;
    set('  b'); key('Tab', { shiftKey: true }); out.afterShiftTab = ta.value;
    set('c'); key('Tab', { shiftKey: true }); out.shiftTabNoIndent = ta.value;
    set('d'); key('Escape'); out.tabAfterEscape = key('Tab'); out.afterEscapeTab = ta.value;
    set('  x: 1;'); key('Enter'); out.keepsIndent = ta.value;
    set('e'); out.shiftEnter = key('Enter', { shiftKey: true });
    ta.scrollTop = 0; ta.dispatchEvent(new Event('scroll'));
    const html = pg.querySelectorAll('.pg-editor-col textarea')[0];
    tabs.find((t) => t.textContent === 'HTML').click();
    html.focus(); html.value = '<div>'; html.setSelectionRange(5, 5);
    html.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); out.afterTag = html.value;
    html.value = '<br>'; html.setSelectionRange(4, 4);
    html.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); out.afterVoid = html.value;
    out.label = html.getAttribute('aria-label');
    out.painted = pg.querySelector('.code-editor pre').innerHTML.includes('tk-');
    return JSON.parse(JSON.stringify(out).split(NL).join('|'));
  })()`);
  assert.ok(r.tabsWired, 'playground tabs and tabpanels reference each other');
  assert.deepEqual(r.arrowSelected.slice(0, 2), ['false', 'true']);
  assert.deepEqual(r.shown, [false, true, false].slice(0, r.shown.length));
  assert.deepEqual(r.selected.slice(0, 2), ['false', 'true']);
  assert.equal(r.afterBrace, 'h1 {\n  ');
  assert.equal(r.between, 'h1 {\n  \n}');
  assert.equal(r.caret, 7, 'the caret lands on the indented middle line');
  assert.equal(r.tabPrevented, true);
  assert.equal(r.afterTab, 'a  ');
  assert.equal(r.afterShiftTab, 'b');
  assert.equal(r.shiftTabNoIndent, 'c');
  assert.equal(r.tabAfterEscape, false, 'after Escape, Tab leaves the editor instead of indenting');
  assert.equal(r.afterEscapeTab, 'd');
  assert.equal(r.keepsIndent, '  x: 1;\n  ');
  assert.equal(r.shiftEnter, false);
  assert.equal(r.afterTag, '<div>\n  ');
  assert.equal(r.afterVoid, '<br>\n');
  assert.match(r.label, /Press Escape then Tab to leave/);
  assert.ok(r.painted);
});

test('playground: console clear, reset, and lesson handoff keep working together', async () => {
  await fresh('docs/components.html');
  await settlePlaygrounds();
  const r = await page.eval(`(async () => {
    const pg = document.querySelector('.playground[data-id="demo-pg"]');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    pg.wd1.set('js', 'console.log("hello");'); await wait(1200);
    const logged = pg.querySelectorAll('.pg-console .log-line').length;
    Array.from(pg.querySelectorAll('button')).find((b) => b.textContent === 'Clear').click();
    const cleared = { lines: pg.querySelectorAll('.pg-console .log-line').length, empty: pg.querySelector('.pg-console .empty').textContent };
    const saved = WD1.store.get('pg', 'demo-pg').js;
    pg.wd1.run(); await wait(600);
    return { logged, cleared, saved, get: Object.keys(pg.wd1.get()).sort(), rerun: pg.querySelectorAll('.pg-console .log-line').length };
  })()`);
  assert.equal(r.logged, 1);
  assert.deepEqual(r.cleared, { lines: 0, empty: 'console.log() output appears here.' });
  assert.equal(r.saved, 'console.log("hello");');
  assert.deepEqual(r.get, ['css', 'html', 'js']);
  assert.equal(r.rerun, 1);
});

test('stepper: buttons, dots, arrow keys, autoplay and show-all', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(async () => {
    const st = document.querySelector('.stepper');
    const press = (re) => Array.from(st.querySelectorAll('.stepper-controls > button')).find((b) => re.test(b.textContent)).click();
    const state = () => ({ step: st.dataset.step, counter: st.querySelector('.num').textContent, current: st.querySelector('.steps > li.current').dataset.n,
      on: st.querySelectorAll('.stepper-stage .on').length, active: (st.querySelector('.stepper-stage .active') || {}).textContent || null });
    const events = []; st.addEventListener('stepchange', (e) => events.push(e.detail.step));
    const out = { start: state(), backDisabled: st.querySelector('.stepper-controls > button').disabled };
    press(/Next/); out.next = state();
    st.querySelectorAll('.stepper-dots button')[3].click(); out.dot = state();
    out.nextDisabledAtEnd = Array.from(st.querySelectorAll('.stepper-controls > button')).find((b) => /Next/.test(b.textContent)).disabled;
    press(/Back/); out.back = state().step;
    st.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); out.left = state().step;
    st.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); out.right = state().step;
    st.dataset.autoplay = '150';
    st.wd1.go(3); press(/Play/); out.playLabel = Array.from(st.querySelectorAll('.stepper-controls > button')).some((b) => /Pause/.test(b.textContent));
    await new Promise((r) => setTimeout(r, 900));
    out.afterPlay = { step: state().step, stopped: Array.from(st.querySelectorAll('.stepper-controls > button')).some((b) => /Play/.test(b.textContent)) };
    press(/Play/); press(/Pause/); out.pausedAt = state().step;
    press(/Show all/); out.showAll = { cls: st.classList.contains('show-all'), label: Array.from(st.querySelectorAll('.stepper-controls > button')).some((b) => /One step at a time/.test(b.textContent)) };
    out.api = st.wd1.step; out.events = events.length > 5;
    return out;
  })()`);
  assert.deepEqual(r.start, { step: '1', counter: 'Step 1 of 4', current: '1', on: 1, active: null });
  assert.equal(r.backDisabled, true);
  assert.deepEqual(r.next, { step: '2', counter: 'Step 2 of 4', current: '2', on: 2, active: 'Router' });
  assert.deepEqual(r.dot, { step: '4', counter: 'Step 4 of 4', current: '4', on: 4, active: 'Page!' });
  assert.equal(r.nextDisabledAtEnd, true);
  assert.deepEqual([r.back, r.left, r.right], ['3', '2', '3']);
  assert.ok(r.playLabel, 'Play turns into Pause');
  assert.deepEqual(r.afterPlay, { step: '4', stopped: true }, 'autoplay runs to the last step and stops');
  assert.equal(r.pausedAt, '1', 'Play from the end starts over');
  assert.deepEqual(r.showAll, { cls: true, label: true });
  assert.equal(r.api, 1);
  assert.ok(r.events);
});

test('tabs: click and arrow keys move between panels', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(() => {
    const tabs = document.querySelector('.tabs');
    const btns = Array.from(tabs.querySelectorAll('[role=tab]')); const panels = Array.from(tabs.querySelectorAll('[role=tabpanel]'));
    const state = () => ({ selected: btns.map((b) => b.getAttribute('aria-selected')).join(','), visible: panels.map((p) => !p.hidden).join(','), focus: btns.indexOf(document.activeElement), tabbable: btns.map((b) => b.tabIndex).join(',') });
    const events = []; tabs.addEventListener('tabchange', (e) => events.push(e.detail.index));
    const out = { start: state(), wired: btns.every((b, i) => b.getAttribute('aria-controls') === panels[i].id && panels[i].getAttribute('aria-labelledby') === b.id) };
    btns[1].click(); out.click = state();
    btns[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); out.right = state();
    btns[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); out.wrap = state();
    btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); out.left = state();
    out.events = events;
    return out;
  })()`);
  assert.ok(r.wired, 'tabs and panels reference each other');
  assert.deepEqual(r.start, { selected: 'true,false,false', visible: 'true,false,false', focus: -1, tabbable: '0,-1,-1' });
  assert.equal(r.click.visible, 'false,true,false');
  assert.deepEqual(r.right, { selected: 'false,false,true', visible: 'false,false,true', focus: 2, tabbable: '-1,-1,0' });
  assert.equal(r.wrap.focus, 0, 'ArrowRight wraps to the first tab');
  assert.equal(r.left.focus, 2, 'ArrowLeft wraps to the last tab');
  assert.deepEqual(r.events, [1, 2, 0, 2]);
});

test('match: a miss is counted and shown, and Reset starts over', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(() => {
    const m = document.querySelector('.match');
    const L = (k) => m.querySelector('.match-item[data-side=L][data-k="' + k + '"]'), R = (k) => m.querySelector('.match-item[data-side=R][data-k="' + k + '"]');
    const status = () => m.querySelector('.widget-foot').textContent;
    const out = { start: status(), role: m.querySelector('.widget-foot [role=status]').getAttribute('role') };
    L(0).click(); out.selected = L(0).classList.contains('selected') && L(0).getAttribute('aria-pressed') === 'true';
    L(1).click(); out.switched = [L(0).classList.contains('selected'), L(1).classList.contains('selected'), L(0).getAttribute('aria-pressed'), L(1).getAttribute('aria-pressed')];
    L(1).click(); out.deselected = L(1).classList.contains('selected') || L(1).getAttribute('aria-pressed') === 'true';
    L(0).click(); R(2).click(); out.miss = { status: status(), shake: R(2).classList.contains('shake') };
    L(0).click(); R(0).click(); out.hit = { status: status(), disabled: L(0).disabled && R(0).disabled, badge: R(0).querySelector('.m-badge').textContent };
    L(0).click(); out.matchedIgnored = L(0).classList.contains('selected');
    [1, 2, 3].forEach((k) => { R(k).click(); L(k).click(); });
    out.end = { status: status(), cls: m.querySelector('.widget-foot span').className, toast: Array.from(document.querySelectorAll('.toast')).at(-1).textContent };
    Array.from(m.querySelectorAll('.widget-actions button')).find((b) => /Reset/.test(b.textContent)).click();
    out.reset = { status: document.querySelector('.match .widget-foot').textContent, matched: document.querySelectorAll('.match .matched').length };
    return out;
  })()`);
  assert.equal(r.start, '0 of 4 matched');
  assert.equal(r.role, 'status');
  assert.ok(r.selected);
  assert.deepEqual(r.switched, [false, true, 'false', 'true']);
  assert.equal(r.deselected, false);
  assert.deepEqual(r.miss, { status: '0 of 4 matched · 1 miss', shake: true });
  assert.deepEqual(r.hit, { status: '1 of 4 matched', disabled: true, badge: '1' });
  assert.equal(r.matchedIgnored, false);
  assert.deepEqual(r.end, { status: 'All matched · 1 miss', cls: 'pill info', toast: 'All matched with 1 miss' });
  assert.deepEqual(r.reset, { status: '0 of 4 matched', matched: 0 });
});

test('order and sort: arrow buttons, drag and drop, keyboard placement', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(() => {
    const drag = (el, type, y) => { const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientY: y || 0 }); el.dispatchEvent(e); return e.defaultPrevented; };
    const out = {};

    const order = document.querySelector('.order');
    const items = () => Array.from(order.querySelectorAll('.order-item'));
    const ks = () => items().map((li) => li.dataset.k).join('');
    const before = ks();
    let it = items();
    it[1].querySelector('button[aria-label="Move up"]').click(); out.up = ks() === before[1] + before[0] + before.slice(2);
    it = items(); it[0].querySelector('button[aria-label="Move down"]').click(); out.down = ks() === before;
    it = items(); it[0].querySelector('button[aria-label="Move up"]').click(); out.upAtTop = ks() === before;
    it = items();
    const src = it[0], target = it[3], box = target.getBoundingClientRect();
    drag(src, 'dragstart'); out.dragging = src.classList.contains('dragging');
    out.overPrevented = drag(target, 'dragover', box.bottom - 2); out.dropAfter = target.classList.contains('drop-after');
    drag(target, 'dragleave'); out.leftClean = !target.classList.contains('drop-after');
    drag(target, 'dragover', box.top + 2); out.dropBefore = target.classList.contains('drop-before');
    drag(target, 'drop'); drag(src, 'dragend');
    out.moved = ks() === before[1] + before[2] + before[0] + before.slice(3);
    out.cleaned = order.querySelectorAll('.dragging, .drop-before, .drop-after').length;
    out.selfOver = drag(items()[0], 'dragover', 0);
    Array.from(order.querySelectorAll('button')).find((b) => b.textContent === 'Shuffle').click();
    out.reshuffled = document.querySelector('.order').querySelectorAll('.order-item').length;
    out.explain = !!document.querySelector('.order .widget-foot');

    const bk = document.querySelector('.buckets');
    const pool = bk.querySelector('.bk-pool'), zones = Array.from(bk.querySelectorAll('.bk-bucket'));
    const chip = (text) => Array.from(bk.querySelectorAll('.bk-chip')).find((c) => c.textContent.startsWith(text));
    const where = (text) => { const z = chip(text).closest('.bk-bucket'); return z ? z.dataset.bucket : 'pool'; };
    drag(chip('HTTP'), 'dragstart'); out.zoneOver = drag(zones[0], 'dragover'); out.overCls = zones[0].classList.contains('over');
    drag(zones[0], 'dragleave'); out.overCleared = !zones[0].classList.contains('over');
    drag(zones[0], 'dragover'); drag(zones[0], 'drop'); drag(chip('HTTP'), 'dragend'); out.dropped = where('HTTP');
    drag(chip('HTTP'), 'dragstart'); out.poolOver = drag(pool, 'dragover'); drag(pool, 'drop'); drag(chip('HTTP'), 'dragend'); out.backToPool = where('HTTP');
    out.idleOver = drag(zones[1], 'dragover');
    chip('TCP').click(); out.armed = zones.every((z) => z.classList.contains('armed')) && chip('TCP').getAttribute('aria-pressed') === 'true';
    zones[1].querySelector('.bk-bucket-head').click(); out.keyboard = where('TCP');
    chip('UDP').click(); zones[1].querySelector('.bk-bucket-head').click(); out.space = where('UDP');
    chip('UDP').click(); pool.click(); out.returned = where('UDP');
    chip('IP').click(); chip('IP').click(); out.disarmed = !chip('IP').classList.contains('selected') && chip('IP').getAttribute('aria-pressed') === 'false' && !zones[0].classList.contains('armed');
    chip('IP').click();
    Array.from(bk.querySelectorAll('button')).find((b) => b.textContent === 'Show answers').click();
    out.showClearsArmed = !zones.some((z) => z.classList.contains('armed')) && chip('IP').getAttribute('aria-pressed') === 'false';
    Array.from(bk.querySelectorAll('.widget-actions button')).find((b) => /Reset/.test(b.textContent)).click();
    out.reset = document.querySelectorAll('.buckets .bk-pool .bk-chip').length;
    return out;
  })()`);
  assert.deepEqual(r, { up: true, down: true, upAtTop: true, dragging: true, overPrevented: true, dropAfter: true, leftClean: true, dropBefore: true, moved: true, cleaned: 0,
    selfOver: false, reshuffled: 8, explain: true, zoneOver: true, overCls: true, overCleared: true, dropped: 'Application', poolOver: true, backToPool: 'pool', idleOver: false,
    armed: true, keyboard: 'Transport', space: 'Transport', returned: 'pool', disarmed: true, showClearsArmed: true, reset: 7 });
});

test('fill in the blanks: Enter checks, alternatives count, Clear resets', async () => {
  await fresh('docs/components.html');
  const r = await page.eval(`(() => {
    const fills = document.querySelectorAll('.fill'); const code = fills[0], text = fills[1];
    const press = (el, label) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent === label).click();
    const inputs = Array.from(text.querySelectorAll('input'));
    inputs[0].value = 'dns'; inputs[1].value = 'https'; inputs[2].value = '80';
    inputs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const out = { partial: text.querySelector('[role=status]').textContent, alt: inputs[0].classList.contains('right'), wrong: inputs[2].classList.contains('wrong') };
    inputs[2].value = '443'; press(text, 'Check'); out.all = text.querySelector('[role=status]').textContent;
    press(text, 'Clear'); out.cleared = { values: inputs.map((i) => i.value).join(''), marks: text.querySelectorAll('.mark').length, status: text.querySelector('[role=status]').textContent };
    out.codeBlanks = code.querySelectorAll('.fill-code .blank input').length; out.explain = code.querySelector('.widget-foot').textContent;
    const sens = document.createElement('div'); sens.className = 'fill'; sens.dataset.case = 'sensitive';
    sens.innerHTML = '<pre>app.[[GET]]()</pre>';
    const late = document.createElement('div'); late.appendChild(sens);
    late.insertAdjacentHTML('beforeend', '<pre data-title="late.js"><code class="lang-js">const x = 1;</code></pre>');
    document.querySelector('main').appendChild(late); WD1.init(late);
    sens.querySelector('input').value = 'get'; press(sens, 'Check'); out.caseSensitive = sens.querySelector('input').classList.contains('wrong');
    out.lateCode = { label: late.querySelector('.code-block .code-lang').textContent, kw: late.querySelectorAll('.code-block .tk-kw').length };
    return out;
  })()`);
  assert.deepEqual(r, { partial: '2 of 3 correct.', alt: true, wrong: true, all: '✓ All blanks correct!', cleared: { values: '', marks: 0, status: '' }, codeBlanks: 4,
    explain: 'A declaration is property: value; inside braces.', caseSensitive: true, lateCode: { label: 'late.js', kw: 1 } });
});

test('module page shell: complete button, section list, hash links and the modules menu', async () => {
  await fresh('wk3/index.html#s3-4', { settle: 900 });
  const r = await page.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { scrolledToHash: Math.abs(document.getElementById('s3-4').getBoundingClientRect().top) < 200 };
    await wait(300);
    out.last = WD1.progress.last() && WD1.progress.last().section;
    out.current = (document.querySelector('.toc a.current') || {}).dataset.sec;
    const btn = document.querySelector('.btn.complete[data-sec="s3-4"]');
    btn.click();
    out.done = { pressed: btn.getAttribute('aria-pressed'), label: btn.textContent, toc: document.querySelector('.toc a[data-sec="s3-4"]').classList.contains('done'),
      sr: document.querySelector('.toc a[data-sec="s3-4"] .sr-only').textContent, badge: !document.querySelector('.section-eyebrow[data-sec="s3-4"] .s-done').hidden,
      toast: Array.from(document.querySelectorAll('.toast')).at(-1).textContent, count: document.querySelector('.sidebar-foot [data-mod-count]').textContent,
      pill: document.querySelector('.progress-pill .pct').textContent };
    btn.click(); out.undone = { pressed: btn.getAttribute('aria-pressed'), stored: WD1.progress.isDone('s3-4') };
    WD1.progress.setDone('s3-review', true); out.reviewToast = Array.from(document.querySelectorAll('.toast')).at(-1).textContent;
    const menu = document.querySelector('.nav-menu'); menu.open = true; document.querySelector('main h1').click(); out.menuClosed = !menu.open;
    out.menuLinks = menu.querySelectorAll('a').length; out.currentPage = menu.querySelector('[aria-current=page]').textContent.includes('State');
    out.eyebrow = document.querySelector('.module-hero .eyebrow').textContent; out.chips = document.querySelectorAll('.obj-chips .chip').length;
    out.next = document.querySelector('#s3-4 .next-link').getAttribute('href'); out.foot = Array.from(document.querySelectorAll('.module-foot a')).map((a) => a.getAttribute('href').split('/').slice(-2).join('/'));
    document.querySelector('.toc-toggle').click(); document.querySelector('.toc a[data-sec="s3-5"]').click(); out.tocClosedOnPick = !document.body.classList.contains('toc-open');
    return out;
  })()`);
  assert.ok(r.scrolledToHash, 'a #section link lands on the section');
  assert.equal(r.last, 's3-4');
  assert.equal(r.current, 's3-4');
  assert.deepEqual(r.done, { pressed: 'true', label: 'Section complete', toc: true, sr: ' (complete)', badge: true, toast: '3.4 MongoDB CRUD with Node complete · 1 of 7 in this module', count: '1 of 7 sections complete', pill: '4%' });
  assert.deepEqual(r.undone, { pressed: 'false', stored: false });
  assert.equal(r.reviewToast, 'Week 3 Review complete · 1 of 7 in this module');
  assert.ok(r.menuClosed, 'clicking elsewhere closes the modules menu');
  assert.equal(r.menuLinks, 8);
  assert.ok(r.currentPage);
  assert.equal(r.eyebrow, 'Week 37 sections');
  assert.equal(r.chips, 2);
  assert.equal(r.next, '#s3-5');
  assert.deepEqual(r.foot, ['wk2/index.html', 'wk4/index.html']);
  assert.ok(r.tocClosedOnPick);
});

test('hub: objectives matrix, live demo and reset', async () => {
  await fresh('index.html');
  const r = await page.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    const rows = document.querySelectorAll('#hub-matrix tbody tr');
    rows[5].querySelector('button').click();
    out.objective = { selected: rows[5].classList.contains('sel'), pressed: rows[5].querySelector('button').getAttribute('aria-pressed'), title: document.querySelector('#hub-obj-detail h3').textContent.slice(0, 20),
      sections: document.querySelectorAll('#hub-obj-detail li').length, first: rows[0].classList.contains('sel') };
    const frame = document.querySelector('#hub-try iframe'); out.sandbox = frame.getAttribute('sandbox');
    const ta = document.querySelector('#hub-try textarea'); ta.value = '<h1>Mine</h1><ul id="list"></ul>'; ta.dispatchEvent(new Event('input')); await wait(500);
    out.saved = WD1.store.get('custom', 'hub-try');
    WD1.store.importJSON(JSON.stringify({ done: { 's1-1': 1 }, last: { module: 'wk1', section: 's1-2', t: 1 }, quiz: { bad: { best: 1, total: 0 } }, prefs: { theme: 'dark' }, challengeRev: 2 }));
    out.badQuizAvg = document.querySelector('#hub-avg').textContent;
    let downloaded = null; const realClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { downloaded = this.download; };
    document.querySelector('#hub-export').click(); HTMLAnchorElement.prototype.click = realClick; out.exportName = /^webdev2-progress-\\d{4}-\\d{2}-\\d{2}\\.json$/.test(downloaded);
    document.querySelector('#hub-reset').click(); out.confirm = document.querySelector('#hub-reset-wrap').textContent.slice(0, 30);
    Array.from(document.querySelectorAll('#hub-reset-wrap button')).find((b) => b.textContent === 'Cancel').click(); out.cancelled = WD1.progress.isDone('s1-1');
    Array.from(document.querySelectorAll('#hub-reset-wrap button')).find((b) => /Reset all/.test(b.textContent)).click();
    Array.from(document.querySelectorAll('#hub-reset-wrap button')).find((b) => b.textContent === 'Yes, erase').click();
    out.erased = {
      done: WD1.progress.isDone('s1-1'),
      shown: document.querySelector('#hub-sections').textContent,
      button: document.querySelector('#hub-reset-wrap').textContent,
      cta: document.querySelector('#hub-continue').textContent,
      meta: document.querySelector('#hub-continue-meta').textContent,
      theme: document.documentElement.getAttribute('data-theme'),
      editorReset: document.querySelector('#hub-try textarea').value.includes('Course books')
    };
    return out;
  })()`);
  assert.deepEqual(r.objective, { selected: true, pressed: 'true', title: 'Apply authentication', sections: 6, first: false });
  assert.equal(r.sandbox, 'allow-scripts allow-forms allow-modals');
  assert.equal(r.saved, '<h1>Mine</h1><ul id="list"></ul>');
  assert.equal(r.badQuizAvg, '–', 'malformed quiz entries are ignored instead of showing NaN% or Infinity%');
  assert.ok(r.exportName, 'export offers a dated file');
  assert.equal(r.confirm, 'Erase all progress, scores and');
  assert.equal(r.cancelled, true, 'Cancel keeps progress');
  assert.deepEqual(r.erased, {
    done: false,
    shown: '0 of 28 sections complete',
    button: 'Reset all progress',
    cta: 'Start with Week 1',
    meta: 'Your progress saves in this browser automatically.',
    theme: null,
    editorReset: true
  });
});

test('full-page playground: templates, layout switches, download and share link', async () => {
  await fresh('tools/playground.html');
  const r = await page.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const $ = (s) => document.querySelector(s); const out = {};
    const editors = () => Array.from(document.querySelectorAll('.tp-pane textarea')).map((t) => t.value);
    const sel = $('#tp-template');
    let templateLoads = 0;
    $('#tp-frame').addEventListener('load', () => templateLoads++);
    sel.value = 'grid'; sel.dispatchEvent(new Event('change'));
    await wait(850);
    out.template = { status: $('#tp-status').textContent, html: editors()[0].slice(0, 20), reset: sel.value, loads: templateLoads };
    const tpTabs = Array.from(document.querySelectorAll('#tp-tabs .pg-tab'));
    const tpPanels = Array.from(document.querySelectorAll('.tp-pane[role=tabpanel]'));
    out.tpTabsWired = tpTabs.every((t, i) => t.getAttribute('aria-controls') === tpPanels[i].id && tpPanels[i].getAttribute('aria-labelledby') === t.id);
    tpTabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    out.tpArrow = tpTabs.map((t) => t.getAttribute('aria-selected')).join(',');
    const wd2Errors = [];
    for (const key of ['spaApi', 'restValidator', 'jwtCookie']) {
      sel.value = key; sel.dispatchEvent(new Event('change'));
      await wait(450);
      wd2Errors.push(...Array.from(document.querySelectorAll('#tp-console .log-line.error')).map((l) => key + ': ' + l.textContent));
    }
    out.wd2Template = { status: $('#tp-status').textContent, errors: wd2Errors };
    sel.value = ''; sel.dispatchEvent(new Event('change'));
    Array.from(document.querySelectorAll('.seg button')).find((b) => b.dataset.w === '390').click();
    out.width = { frame: $('#tp-frame').style.width, label: $('#tp-size').textContent, fixed: $('#tp-stage').classList.contains('fixed') };
    Array.from(document.querySelectorAll('.seg button')).find((b) => b.dataset.w === '0').click(); out.fill = $('#tp-frame').style.width;
    $('#tp-layout').click(); out.stacked = $('#tp-work').classList.contains('stacked');
    $('#tp-console-toggle').click(); out.consoleHidden = $('#tp-console').hidden; $('#tp-console-toggle').click(); out.consoleBack = !$('#tp-console').hidden;
    Array.from(document.querySelectorAll('#tp-tabs .pg-tab')).find((t) => t.textContent === 'JS').click();
    const js = document.querySelectorAll('.tp-pane textarea')[2]; js.value = 'console.log("from the tool"); console.warn("careful"); nope();'; js.dispatchEvent(new Event('input'));
    out.saving = $('#tp-status').textContent; await wait(1300);
    out.saved = { status: $('#tp-status').textContent, stored: WD1.store.get('custom', 'playground').js.slice(0, 11) };
    out.console = Array.from(document.querySelectorAll('#tp-console .log-line')).map((l) => l.textContent);
    $('#tp-clear').click(); out.cleared = document.querySelectorAll('#tp-console .log-line').length;
    let copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { copied = t; return Promise.resolve(); } } });
    $('#tp-share').click(); await wait(50); out.share = copied.split('#code=').length === 2 && copied.startsWith(location.origin);
    out.shareRoundTrip = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(copied.split('#code=')[1]))))).js === js.value;
    $('#tp-copy').click(); await wait(50); out.copyDoc = { doctype: copied.startsWith('<!DOCTYPE html>'), noHelper: !copied.includes('__wd2loop') && !copied.includes('previewHelper'), script: copied.includes('nope();') };
    let file = null; const realClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { file = this.download; };
    $('#tp-download').click(); HTMLAnchorElement.prototype.click = realClick; out.download = file;
    sel.value = 'skeleton'; sel.dispatchEvent(new Event('change')); $('#tp-copy').click(); await wait(50);
    out.fullDoc = { one: copied.split('<html').length === 2, title: copied.includes('<title>My Page</title>') };
    return out;
  })()`);
  assert.deepEqual(r.template, { status: 'Loaded template: Grid page layout', html: '<div class="layout">', reset: '', loads: 1 });
  assert.ok(r.tpTabsWired, 'standalone playground tabs and tabpanels reference each other');
  assert.equal(r.tpArrow, 'false,true,false');
  assert.deepEqual(r.wd2Template, { status: 'Loaded template: JWT & Cookie inspector', errors: [] });
  assert.deepEqual(r.width, { frame: '390px', label: '390px wide', fixed: true });
  assert.equal(r.fill, '100%');
  assert.ok(r.stacked);
  assert.ok(r.consoleHidden && r.consoleBack);
  assert.equal(r.saving, 'Saving…');
  assert.deepEqual(r.saved, { status: 'Saved in this browser', stored: 'console.log' });
  assert.equal(r.console[0], 'from the tool');
  assert.equal(r.console[1], '⚠ careful');
  assert.match(r.console[2], /^✖ .*nope is not defined/);
  assert.equal(r.cleared, 0);
  assert.ok(r.share && r.shareRoundTrip, 'the share link carries the code');
  assert.deepEqual(r.copyDoc, { doctype: true, noHelper: true, script: true }, 'exported pages are clean, with no playground helpers');
  assert.equal(r.download, 'index.html');
  assert.deepEqual(r.fullDoc, { one: true, title: true });
});

test('glossary: search, letter filter and flashcard mode', async () => {
  await fresh('glossary.html');
  const r = await page.eval(`(async () => {
    const out = {
      total: document.querySelector('#gl-total').textContent,
      all: document.querySelectorAll('dt').length,
      hashLink: !!document.querySelector('#gl-letters a[href="#gl-num"]'),
      hashTarget: !!document.getElementById('gl-num')
    };
    const q = document.querySelector('input[type=search], #gl-q, .gl-controls input'); q.value = 'injection'; q.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 200));
    out.search = { count: document.querySelector('#gl-count').textContent, terms: Array.from(document.querySelectorAll('dt')).map((d) => d.textContent) };
    document.querySelector('#gl-study').click();
    q.value = 'zzzz-no-match'; q.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 200));
    out.none = document.querySelectorAll('dt').length;
    out.cardsHiddenOnEmpty = document.querySelector('#gl-cards').hidden && document.querySelector('#gl-study').disabled;
    q.value = ''; q.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 200));
    document.querySelector('#gl-study').click();
    out.study = { cards: !!document.querySelector('.fc-card'), label: document.querySelector('#gl-study').textContent };
    document.querySelector('#gl-study').click(); out.closed = !document.querySelector('.fc-card');
    return out;
  })()`);
  assert.match(r.total, /^\d+ terms$/);
  assert.ok(r.all >= 90, 'the whole glossary is listed');
  assert.ok(r.hashLink && r.hashTarget, 'the # group for status codes is reachable from the jump bar');
  assert.deepEqual(r.search.terms.sort(), ['NoSQL injection', 'SQL injection']);
  assert.match(r.search.count, /^2 of \d+ terms$/);
  assert.equal(r.none, 0);
  assert.ok(r.cardsHiddenOnEmpty, 'flashcards hide and the Study button disables when no terms match');
  assert.deepEqual(r.study, { cards: true, label: 'Hide flashcards' });
  assert.ok(r.closed);
});

/* ---------- in-browser live runner & SQLite WASM ---------- */

test('live runner: Node scripts, Express servers, cookies/sessions, MongoDB, SQLite WASM SQL, JWT and SQLi demo', async () => {
  const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. Week 1: nonblocking-order.js, node -e, and http-html-server with sandboxed HTML preview
  await fresh('wk1/index.html');
  const wk1 = await page.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const findBlock = (title) => Array.from(document.querySelectorAll('.code-block[data-run]'))
      .find((b) => (b.querySelector('.code-lang')?.textContent || '').includes(title));

    const nb = findBlock('nonblocking-order.js');
    nb.querySelector('.run-trigger').click();
    await wait(120);
    const nbLogs = Array.from(nb.querySelectorAll('.runner-console .log-line')).map((l) => l.textContent);

    const oneLiner = Array.from(document.querySelectorAll('.code-block[data-run="node"]'))
      .find((b) => b._wdCode && b._wdCode.includes('node -e'));
    oneLiner.querySelector('.run-trigger').click();
    await wait(80);
    const oneLineLogs = Array.from(oneLiner.querySelectorAll('.runner-console .log-line')).map((l) => l.textContent);

    const srv = findBlock('http-html-server.js');
    srv.querySelector('.run-trigger').click();
    await wait(80);
    srv.querySelector('.runner-preset').click();
    await wait(80);
    const previewBtn = Array.from(srv.querySelectorAll('.runner-resp-head button')).find((b) => b.textContent.includes('Preview'));
    previewBtn.click();
    await wait(120);
    const frame = srv.querySelector('.runner-preview-wrap iframe');
    return {
      nbLogs,
      oneLineLogs,
      srvStatus: srv.querySelector('.runner-resp-head .pill').textContent,
      sandbox: frame ? frame.getAttribute('sandbox') : null,
      inlinedCss: frame ? frame.srcdoc.includes('<style>') : false
    };
  })()`);
  assert.deepEqual(wk1.nbLogs, ['1', '3', '2']);
  assert.deepEqual(wk1.oneLineLogs, ['4']);
  assert.equal(wk1.srvStatus, '200 OK');
  assert.equal(wk1.sandbox, 'allow-scripts allow-forms allow-modals');
  assert.equal(wk1.inlinedCss, true);

  // 2. Week 2: rest-api.js full CRUD + hang detection on broken middleware
  await fresh('wk2/index.html');
  const wk2 = await page.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const findBlock = (title) => Array.from(document.querySelectorAll('.code-block[data-run]'))
      .find((b) => (b.querySelector('.code-lang')?.textContent || '').includes(title));

    const api = findBlock('rest-api.js');
    api.querySelector('.run-trigger').click();
    await wait(80);
    const clickPreset = async (label) => {
      Array.from(api.querySelectorAll('.runner-preset')).find((b) => b.textContent.includes(label)).click();
      await wait(80);
      return {
        status: api.querySelector('.runner-resp-head .pill').textContent,
        body: api.querySelector('.runner-resp-body').textContent
      };
    };
    const rList = await clickPreset('List books');
    const rAdd = await clickPreset('Add book (201)');
    const equivCurl = api.querySelectorAll('.runner-equiv-code')[0]?.textContent || '';
    const equivFetch = api.querySelectorAll('.runner-equiv-code')[1]?.textContent || '';
    const rMiss = await clickPreset('Book #99');
    const rAfter = await clickPreset('List books');

    const hang = findBlock('Broken: hangs forever');
    hang.querySelector('.run-trigger').click();
    await wait(60);
    hang.querySelector('.runner-preset').click();
    await wait(2200);
    return {
      rList: JSON.parse(rList.body).length,
      rAddStatus: rAdd.status,
      rAddId: JSON.parse(rAdd.body).id,
      equivCurl,
      equivFetch,
      rMissStatus: rMiss.status,
      rAfter: JSON.parse(rAfter.body).length,
      hangStatus: hang.querySelector('.runner-resp-head .pill').textContent
    };
  })()`);
  assert.equal(wk2.rList, 2);
  assert.equal(wk2.rAddStatus, '201 Created');
  assert.equal(wk2.rAddId, 3);
  assert.match(wk2.equivCurl, /curl -i[\s\S]*-X POST[\s\S]*Content-Type: application\/json/);
  assert.match(wk2.equivFetch, /fetch\('\/api\/books'[\s\S]*method: 'POST'/);
  assert.equal(wk2.rMissStatus, '404 Not Found');
  assert.equal(wk2.rAfter, 3);
  assert.match(wk2.hangStatus, /Hung/);

  // 3. Week 3: session cookie jar, real SQLite WASM SQL + FK error, mysql2/promise, MongoDB ObjectId 400/404/200
  await fresh('wk3/index.html');
  const wk3 = await page.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const findBlock = (title) => Array.from(document.querySelectorAll('.code-block[data-run]'))
      .find((b) => (b.querySelector('.code-lang')?.textContent || '').includes(title));

    // Session visits + cookie jar clear
    const sess = findBlock('session-demo.js');
    sess.querySelector('.run-trigger').click();
    await wait(60);
    sess.querySelector('.runner-preset').click(); await wait(60);
    const v1 = sess.querySelector('.runner-resp-body').textContent;
    const cookiesCount = sess.querySelectorAll('.runner-cookie-chip').length;
    sess.querySelector('.runner-preset').click(); await wait(60);
    const v2 = sess.querySelector('.runner-resp-body').textContent;
    Array.from(sess.querySelectorAll('.runner-cookies button')).find((b) => b.textContent === 'Clear cookies').click();
    sess.querySelector('.runner-preset').click(); await wait(60);
    const v3 = sess.querySelector('.runner-resp-body').textContent;

    // Real SQLite WASM SELECT
    const sqlSel = findBlock('SQL — SELECT');
    sqlSel.querySelector('.run-trigger').click();
    for (let i = 0; i < 40 && !sqlSel.querySelectorAll('.runner-sql-out table').length; i++) await wait(100);
    const tables = sqlSel.querySelectorAll('.runner-sql-out table').length;
    const firstTableText = sqlSel.querySelector('.runner-sql-out table')?.textContent || '';

    // Real SQLite WASM FOREIGN KEY constraint error
    const sqlFk = findBlock('linking authors and books');
    sqlFk.querySelector('.run-trigger').click();
    await wait(250);
    Array.from(sqlFk.querySelectorAll('.runner-preset')).find((b) => b.textContent.includes('broken FOREIGN KEY')).click();
    await wait(250);
    const fkErr = sqlFk.querySelector('.runner-sql-out .feedback.bad')?.textContent || '';

    // mysql2/promise backed by real SQLite WASM
    const my = findBlock('MySQL CRUD from Node');
    my.querySelector('.run-trigger').click();
    for (let i = 0; i < 30 && !my.querySelector('.runner-console').textContent.includes('Rows deleted'); i++) await wait(100);
    const myOut = my.querySelector('.runner-console').textContent;

    // MongoDB ObjectId route (200 / 404 / 400)
    const mg = findBlock('GET /api/books/:id — bad id');
    mg.querySelector('.run-trigger').click();
    await wait(80);
    const mgPres = Array.from(mg.querySelectorAll('.runner-preset'));
    mgPres[0].click(); await wait(60); const mg200 = mg.querySelector('.runner-resp-head .pill').textContent;
    mgPres[1].click(); await wait(60); const mg404 = mg.querySelector('.runner-resp-head .pill').textContent;
    mgPres[2].click(); await wait(60); const mg400 = mg.querySelector('.runner-resp-head .pill').textContent;

    return { v1, v2, v3, cookiesCount, tables, firstTableText, fkErr, myOut, mg200, mg404, mg400 };
  })()`);
  assert.equal(wk3.v1, 'Visit number 1');
  assert.equal(wk3.v2, 'Visit number 2');
  assert.equal(wk3.v3, 'Visit number 1');
  assert.equal(wk3.cookiesCount, 1);
  assert.equal(wk3.tables, 3);
  assert.match(wk3.firstTableText, /Frank Herbert/);
  assert.match(wk3.fkErr, /FOREIGN KEY constraint failed/i);
  assert.match(wk3.myOut, /New book id: 4/);
  assert.match(wk3.myOut, /Rows deleted: 1/);
  assert.equal(wk3.mg200, '200 OK');
  assert.equal(wk3.mg404, '404 Not Found');
  assert.equal(wk3.mg400, '400 Bad Request');
  // Confirm sql.js WASM loaded strictly from this site, zero third-party hosts or console errors!
  assert.deepEqual(page.problems(), [], 'wk3 WASM SQL + runners produced zero console/network errors');
  assert.deepEqual(page.hosts(), [new URL(server.url).host], 'wk3 WASM SQL loaded from this site only');

  // 4. Week 4: hash-demo, full session login/logout flow, jwt-demo, SQL injection WASM demo + 390px phone overflow check
  await fresh('wk4/index.html');
  const wk4 = await page.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const findBlock = (title) => Array.from(document.querySelectorAll('.code-block[data-run]'))
      .find((b) => (b.querySelector('.code-lang')?.textContent || '').includes(title));

    const hash = findBlock('hash-demo.js');
    hash.querySelector('.run-trigger').click();
    await wait(120);
    const hashOut = hash.querySelector('.runner-console').textContent;

    const jwtB = findBlock('jwt-demo.js');
    jwtB.querySelector('.run-trigger').click();
    await wait(120);
    const jwtOut = jwtB.querySelector('.runner-console').textContent;

    const login = findBlock('login route');
    login.querySelector('.run-trigger').click();
    await wait(200);
    const press = async (label) => {
      Array.from(login.querySelectorAll('.runner-preset')).find((b) => b.textContent.includes(label)).click();
      await wait(140);
      return { status: login.querySelector('.runner-resp-head .pill').textContent, body: login.querySelector('.runner-resp-body').textContent };
    };
    const dashBefore = await press('Visit /dashboard');
    const badLogin = await press('Wrong password');
    const goodLogin = await press('Login as ada');
    const dashAfter = await press('Visit /dashboard');
    const logout = await press('Logout');
    const dashFinal = await press('Visit /dashboard');

    const sqli = findBlock('Vulnerable vs safe');
    sqli.querySelector('.run-trigger').click();
    for (let i = 0; i < 30 && !sqli.querySelector('.runner-console').textContent.includes('Rows returned'); i++) await wait(100);
    const sqliOut = sqli.querySelector('.runner-console').textContent;

    return { hashOut, jwtOut, dashBefore, badLogin, goodLogin, dashAfter, logout, dashFinal, sqliOut };
  })()`);
  assert.match(wk4.hashOut, /161 chars total/);
  assert.match(wk4.hashOut, /Right password accepted: true/);
  assert.match(wk4.hashOut, /Wrong password accepted: false/);
  assert.match(wk4.jwtOut, /Subject: user-42 \| Role: student/);
  assert.match(wk4.jwtOut, /Wrong secret rejected: invalid signature/);
  assert.equal(wk4.dashBefore.status, '401 Unauthorized');
  assert.equal(wk4.badLogin.status, '401 Unauthorized');
  assert.equal(wk4.goodLogin.status, '302 Found');
  assert.equal(wk4.dashAfter.status, '200 OK');
  assert.match(wk4.dashAfter.body, /"userId": 42/);
  assert.equal(wk4.logout.status, '302 Found');
  assert.equal(wk4.dashFinal.status, '401 Unauthorized');
  assert.match(wk4.sqliOut, /Rows leaked \(3\)/);
  assert.match(wk4.sqliOut, /Rows returned \(0\)/);
  assert.deepEqual(page.problems(), [], 'wk4 runners produced zero console/network errors');
  assert.deepEqual(page.hosts(), [new URL(server.url).host], 'wk4 runners contacted this site only');

  // 5. Phone 390px viewport with open server + SQL runner panels must have 0px horizontal overflow
  await fresh('wk4/index.html', { ...PHONE, settle: 400 });
  const phoneOverflow = await page.eval(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const login = Array.from(document.querySelectorAll('.code-block[data-run="server"]'))
      .find((b) => (b.querySelector('.code-lang')?.textContent || '').includes('login route'));
    login.querySelector('.run-trigger').click();
    await wait(200);
    login.querySelector('.runner-preset').click();
    await wait(150);
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  })()`);
  assert.equal(phoneOverflow, 0, 'open server runner panel does not cause horizontal overflow on a 390px phone');
});

test('line-by-line code inspector: numbered lines, Who/What/Where/When/Why, glossary chips and phone fit', async () => {
  await fresh('wk2/index.html');
  const r = await page.eval(`(() => {
    const blocks = Array.from(document.querySelectorAll('.code-block.has-inspector'));
    const rest = blocks.find((b) => (b.querySelector('.code-lang')?.textContent || '').includes('rest-api.js'));
    const rows = rest.querySelectorAll('.code-ln-row');
    // Click line 1 (require('express'))
    rows[0].click();
    const open = !rest.querySelector('.line-inspector').hidden;
    const labels = Array.from(rest.querySelectorAll('.five dt')).map((d) => d.textContent);
    const what1 = rest.querySelector('.five-what dd').textContent;
    // Click Next button to advance to line 2
    rest.querySelector('.insp-next').click();
    const head2 = rest.querySelector('.insp-line').textContent;
    // Click a glossary term chip on line 2 (express)
    const termBtn = rest.querySelector('.insp-term');
    if (termBtn) termBtn.click();
    const defText = rest.querySelector('.insp-term-def')?.textContent || '';
    // Click a closing brace line to verify opener pairing
    const closerRow = Array.from(rows).find((r) => r.querySelector('.code-ln-src').textContent.trim() === '});');
    closerRow.click();
    const closerWhat = rest.querySelector('.five-what dd').textContent;
    // Hide inspector
    rest.querySelector('.insp-close').click();
    const closed = rest.querySelector('.line-inspector').hidden;
    // Verify SQL block on wk3 later, and verify button sizes while open on a block
    rows[0].click();
    const smallBtns = Array.from(rest.querySelectorAll('.line-inspector button')).filter((b) => {
      const box = b.getBoundingClientRect();
      return box.width < 24 || box.height < 24;
    }).length;
    return { count: blocks.length, rows: rows.length, open, labels, what1, head2, defText, closerWhat, closed, smallBtns };
  })()`);
  assert.ok(r.count >= 60, 'every code block on wk2 mounts the line inspector');
  assert.ok(r.rows > 20);
  assert.equal(r.open, true);
  assert.deepEqual(r.labels, ['Who', 'What', 'Where', 'When', 'Why']);
  assert.match(r.what1, /express/i);
  assert.match(r.head2, /^Line 2 of /);
  assert.ok(r.defText.length > 20, 'clicking a glossary chip shows its definition');
  assert.match(r.closerWhat, /Closes what line \d+ opened/);
  assert.equal(r.closed, true);
  assert.equal(r.smallBtns, 0, 'all inspector buttons meet >= 24px tap target size');

  // Verify open inspector on a 390px phone has 0px horizontal overflow
  await fresh('wk3/index.html', { ...PHONE, settle: 400 });
  const over = await page.eval(`(() => {
    const sql = Array.from(document.querySelectorAll('.code-block.has-inspector'))
      .find((b) => (b.querySelector('.code-lang')?.textContent || '').includes('linking authors and books'));
    sql.querySelector('.insp-trigger').click();
    return {
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      what: sql.querySelector('.five-what dd').textContent
    };
  })()`);
  assert.equal(over.over, 0, 'open line inspector does not overflow a 390px phone');
  assert.match(over.what, /authors/i);
});
