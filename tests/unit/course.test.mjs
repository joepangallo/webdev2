// Unit tests for the pure parts of assets/js/course.js (no browser needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadEngine } from '../lib/site.mjs';

const { WD1 } = loadEngine();
const KEY = 'wd2:v1';
// The engine runs in its own context, so its objects are compared by value.
const plain = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/* ---------- manifest ---------- */

test('manifest: four modules, seven sections each, unique ids, valid objectives', () => {
  assert.equal(WD1.MODULES.length, 4);
  const ids = WD1.MODULES.flatMap((m) => m.sections.map((s) => s.id));
  assert.equal(ids.length, 28);
  assert.equal(new Set(ids).size, ids.length, 'section ids are unique');
  for (const m of WD1.MODULES) {
    assert.equal(m.sections.length, 7, m.id);
    assert.equal(m.sections.at(-1).num, 'R', m.id + ' ends with its review');
    for (const s of m.sections) {
      assert.ok(s.obj.length > 0, s.id + ' maps to an objective');
      for (const n of s.obj) assert.ok(Number.isInteger(n) && n >= 1 && n <= WD1.OBJECTIVES.length, `${s.id} objective ${n}`);
    }
  }
  for (let n = 1; n <= WD1.OBJECTIVES.length; n++) {
    assert.ok(ids.some((id) => WD1.section(id).obj.includes(n)), `objective ${n} is covered by a section`);
    assert.doesNotMatch(WD1.OBJECTIVES[n - 1], /\.$/, 'objectives are written without a trailing period');
  }
  assert.equal(WD1.section('s3-4').module.id, 'wk3');
  assert.equal(WD1.section('nope'), null);
  assert.equal(WD1.module('nope'), null);
});

/* ---------- text helpers ---------- */

test('esc: escapes the five HTML-significant characters', () => {
  assert.equal(WD1.esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(WD1.esc(null), '');
  assert.equal(WD1.esc(42), '42');
});

test('fmt: mini-markdown renders code, bold and links, and escapes everything else', () => {
  assert.equal(WD1.fmt('Use `<p>` here'), 'Use <code>&lt;p&gt;</code> here');
  assert.equal(WD1.fmt('**bold** move'), '<strong>bold</strong> move');
  assert.equal(WD1.fmt('a\nb'), 'a<br>b');
  assert.equal(WD1.fmt('[docs](https://example.com/a?b=1)'), '<a href="https://example.com/a?b=1">docs</a>');
  assert.equal(WD1.fmt('[next](../wk2/index.html#s2-1)'), '<a href="../wk2/index.html#s2-1">next</a>');
  assert.equal(WD1.fmt('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(WD1.fmt('a & b'), 'a &amp; b', 'a bare ampersand is escaped once');
  assert.equal(WD1.fmt(null), '');
});

test('fmt: never produces a script-capable link', () => {
  for (const bad of ['[x](javascript:alert(1))', '[x](JaVaScRiPt:alert(1))', '[x](data:text/html,<script>)', '[x](vbscript:x)']) {
    assert.doesNotMatch(WD1.fmt(bad), /<a /, bad);
  }
});

test('dedent: strips common indentation and blank edge lines, keeps relative indentation', () => {
  assert.equal(WD1.dedent('\n    a\n      b\n    c\n  '), 'a\n  b\nc');
  assert.equal(WD1.dedent('\tx\n\t\ty'), 'x\n  y');
  assert.equal(WD1.dedent(''), '');
  assert.equal(WD1.dedent('a\r\nb'), 'a\nb');
});

test('highlight: adds markup but never changes the code text', () => {
  const samples = {
    html: '<!DOCTYPE html>\n<!-- note -->\n<a href="x.html" class=\'k\' hidden>A &amp; B</a>\n<style>p { color: red; }</style>\n<script>const a = 1 < 2;</script>\n<br/>',
    css: '@media (min-width: 40em) {\n  .a > b::before { content: "x"; color: #fff !important; margin: -1.5px calc(1em + 2%); }\n}\n/* done */\n@import "x.css";\na[href^="http"], .b/**/c { background: url(\'i.png\') no-repeat; --gap: 4px; width: var(--gap) }\n@font-face { font-family: "F"; }',
    js: "const re = /a\\/b[/]c/gi; // regex\nlet s = `t ${1 + 2}` + 'q' + \"d\";\nfunction f(x) { return x / 2 > 0x1F ? null : await g(); }\n/* block */",
    json: '{"a": [1, 2.5, true, null], "b": "c"}',
    sql: "-- fetch one book\nSELECT title, author FROM books WHERE id = ? AND title <> 'O''Brien' /* ok */ LIMIT 1;",
    text: 'plain <text> & more'
  };
  const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  for (const [lang, code] of Object.entries(samples)) {
    const out = WD1.highlight(code, lang);
    assert.equal(strip(out), code, lang);
    if (lang !== 'text') assert.match(out, /<span class="tk-/, lang + ' gets token spans');
  }
  assert.equal(WD1.highlight('<b>', 'unknown-language'), '&lt;b&gt;');
  assert.match(WD1.highlight('<p>', undefined), /tk-tag/, 'defaults to HTML');
});

test('shuffle: returns a permutation and leaves the input alone', () => {
  const src = [1, 2, 3, 4, 5, 6];
  const out = WD1.shuffle(src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...out].sort(), src);
  assert.notEqual(out, src);
});

test('url: resolves paths from the site root', () => {
  assert.equal(WD1.url('project/index.html'), 'https://site.test/project/index.html');
});

/* ---------- loop guard ---------- */

const g = WD1.guardLoops;
const G = '__wd2loop()';

test('guardLoops: rewrites while, do…while and three-part for conditions', () => {
  assert.equal(g('while (i < 3) { i++; }'), `while ( ${G} && (i < 3)) { i++; }`);
  assert.equal(g('do { i++; } while (i < 3);'), `do { i++; } while ( ${G} && (i < 3));`);
  assert.equal(g('for (let i = 0; i < 3; i++) {}'), `for (let i = 0; ${G} && ( i < 3); i++) {}`);
  assert.equal(g('for (;;) { break; }'), `for (; ${G};) { break; }`);
  assert.equal(g('while (true) x();'), `while ( ${G} && (true)) x();`, 'single-statement bodies work');
  assert.equal(g('a: while (x) { while (y) { break a; } }'), `a: while ( ${G} && (x)) { while ( ${G} && (y)) { break a; } }`);
  assert.equal(g('while (f(a, (b))) {}'), `while ( ${G} && (f(a, (b)))) {}`, 'nested parentheses');
});

test('guardLoops: leaves everything else exactly as written', () => {
  const untouched = [
    'for (const x of xs) { use(x); }',
    'for (const k in obj) { use(k); }',
    'const s = "while (true) {}";',
    "const s = 'for (;;) {}';",
    'const s = `while (${n}) {}`;',
    'const s = `${ list.map((i) => `while (${i})`) }`;',
    '// while (true) {}\nlet a = 1;',
    '/* for (;;) {} */ let b = 2;',
    'obj.while(1); obj.for(2);',
    'const re = /while (x)/; re.test(s);',
    'const o = { for: 1, while: 2 };',
    'let whileLoop = 1, forEach = 2; fn(whileLoop, forEach);',
    'const total = [1, 2].reduce((a, b) => a + b, 0);',
    ''
  ];
  for (const code of untouched) assert.equal(g(code), code, code);
});

test('guardLoops: keeps every line on its original line', () => {
  const code = 'let i = 0;\nwhile (\n  i < 10 // keep going\n) {\n  i++;\n}\nfor (let j = 0;\n     j < 2;\n     j++) {}\n';
  const out = g(code);
  assert.notEqual(out, code);
  const before = code.split('\n'), after = out.split('\n');
  assert.equal(after.length, before.length);
  for (const marker of ['i < 10', 'i++;', 'j < 2', 'j++) {}']) {
    assert.equal(after.findIndex((l) => l.includes(marker)), before.findIndex((l) => l.includes(marker)), marker);
  }
});

test('guardLoops: returns the original when the code does not parse, or would stop parsing', () => {
  const broken = 'while (true { }';
  assert.equal(g(broken), broken, 'syntax errors reach the student untouched');
  const method = 'class A { while (x) { return x; } }\nnew A();';
  assert.equal(g(method), method, 'a method that happens to be named like a loop is left alone');
});

test('guardLoops: guarded code computes the same results as the original', () => {
  const programs = [
    'let s = 0; for (let i = 0; i < 100; i++) { if (i % 3 === 0) continue; s += i; } s',
    'let n = 27, steps = 0; while (n !== 1) { n = n % 2 ? 3 * n + 1 : n / 2; steps++; } steps',
    'let i = 0, out = []; do { out.push(i * i); } while (++i < 5); out.join(",")',
    'let c = 0; outer: for (let a = 0; a < 5; a++) { for (let b = 0; b < 5; b++) { if (b === 3) continue outer; c++; } } c',
    'let k = 10; for (; k > 0; ) k -= 3; k',
    'let w = 0; for (let i = 0, j = 10; i < j; i++, j--) w += j - i; w',
    'const xs = []; for (const x of [1, 2, 3]) xs.push(x * 2); let t = 0; while (xs.length) t += xs.pop(); t',
    'let m = 0; while (m < 3) m++; m'
  ];
  for (const code of programs) {
    const guarded = g(code);
    assert.notEqual(guarded, code, code);
    const expected = vm.runInNewContext(code);
    const withGuard = vm.runInNewContext(guarded, { __wd2loop: () => true });
    assert.deepEqual(withGuard, expected, code);
  }
});

test('guardLoops: a runaway loop is stopped by the guard, wherever it hides', () => {
  const runaways = [
    'while (true) {}',
    'for (;;) {}',
    'let i = 0; do { i++; } while (i > 0);',
    'for (let i = 0; i < 10; i--) {}',
    'function spin() { while (1) { } } spin();',
    'try { while (true) {} } catch (e) { /* swallowed */ } while (true) {}'
  ];
  for (const code of runaways) {
    let calls = 0, tripped = false;
    const guard = () => { if (tripped || ++calls > 5000) { tripped = true; throw new Error('Loop stopped'); } return true; };
    assert.throws(() => vm.runInNewContext(g(code), { __wd2loop: guard }, { timeout: 2000 }), /Loop stopped/, code);
  }
});

/* ---------- preview document ---------- */

test('buildPreviewDoc: wraps a fragment in a full document with helper, style and guarded script', () => {
  const doc = WD1.buildPreviewDoc({ html: '<h1>Hi</h1>', css: 'h1 { color: navy; }', js: 'while (go()) {}' }, 'pg-1');
  assert.match(doc, /^<!DOCTYPE html><html lang="en"><head>/);
  assert.ok(doc.includes('<h1>Hi</h1>'));
  assert.ok(doc.includes('<style>\nh1 { color: navy; }\n</style>'));
  assert.ok(doc.includes(`while ( ${G} && (go())) {}`), 'the JS tab is loop-guarded');
  assert.ok(doc.includes('__wd2loop = function'), 'the guard itself is defined in the preview');
  assert.ok(doc.includes('"pg-1"'));
  assert.doesNotMatch(doc, /__WD2_JS_LINE__/, 'the line placeholder is filled in');
});

test('buildPreviewDoc: tells the preview which document line the JS tab starts on', () => {
  const doc = WD1.buildPreviewDoc({ html: '<p>a</p>\n<p>b</p>', js: 'first();\nsecond();' }, 'x');
  const lines = doc.split('\n');
  const tagLine = lines.findIndex((l) => l.includes('<script data-wd2-js>')) + 1;
  assert.equal(lines[tagLine], 'first();');
  const passed = Number(doc.match(/,(\d+)\);<\/script>/)[1]);
  assert.equal(passed, tagLine + 1, 'JS line 1 is the line after the script tag');
  assert.match(WD1.buildPreviewDoc({ html: '<p>a</p>' }, 'x'), /,0\);<\/script>/, 'no JS tab means no offset');
});

test('buildPreviewDoc: student code cannot end the script elements early', () => {
  const nasty = '</script><script>alert(1)</script><!--';
  const doc = WD1.buildPreviewDoc({ html: nasty, css: '', js: 'const s = "</script>";' }, 'x', [{ label: 'a', test: 'return "</script>" === 0' }]);
  const helperEnd = doc.indexOf(');<\/script>');
  assert.ok(helperEnd > 0);
  const helper = doc.slice(0, helperEnd);
  assert.doesNotMatch(helper.slice(helper.indexOf('<script>') + 8), /<\/script/i, 'checks and code are embedded without a literal closing tag');
  assert.ok(helper.includes('\\u003c/script>'), 'embedded JSON escapes "<"');
  assert.ok(doc.includes('const s = "<\\/script>";'), 'the JS tab escapes its own closing tag');
});

test('buildPreviewDoc: embeds checks and code only when the playground has checks', () => {
  const plain = WD1.buildPreviewDoc({ html: '<p>x</p>' }, 'x');
  assert.match(plain, /\("x",null,null,/);
  const withChecks = WD1.buildPreviewDoc({ html: '<p>x</p>', js: 'let a = 1;' }, 'x', [{ label: 'has p', test: "return !!$('p')" }]);
  assert.ok(withChecks.includes(`["return !!$('p')"]`));
  assert.ok(withChecks.includes('"js":"let a = 1;"'));
  assert.match(WD1.buildPreviewDoc({ html: 'x' }, 'x', []), /\("x",null,null,/, 'an empty check list means no checks');
});

test('buildPreviewDoc: a full HTML document keeps its own structure', () => {
  const full = '<!DOCTYPE html>\n<html>\n<head><title>T</title></head>\n<body><p>x</p></body>\n</html>';
  const doc = WD1.buildPreviewDoc({ html: full, css: 'p{}', js: 'go();' }, 'x');
  assert.equal((doc.match(/<html/g) || []).length, 1);
  assert.match(doc, /<head><script>\(function previewHelper/);
  assert.match(doc, /go\(\);\n<\/script><\/body>/);
  const noHead = WD1.buildPreviewDoc({ html: '<html><body>x</body></html>', css: 'p{}' }, 'x');
  assert.match(noHead, /<html><head><script>/);
  const doctypeOnly = WD1.buildPreviewDoc({ html: '<!doctype html><p>x</p>', js: 'go();' }, 'x');
  assert.match(doctypeOnly, /^<!doctype html><script>/);
  assert.ok(doctypeOnly.trimEnd().endsWith('</script>'));
});

test('previewFrame: previews are sandboxed without same-origin access', () => {
  const tokens = WD1.PREVIEW_SANDBOX.split(' ');
  assert.ok(tokens.includes('allow-scripts'));
  for (const risky of ['allow-same-origin', 'allow-top-navigation', 'allow-popups', 'allow-downloads', 'allow-top-navigation-by-user-activation']) {
    assert.ok(!tokens.includes(risky), risky + ' must stay off');
  }
});

/* ---------- progress store ---------- */

test('store: get/set/delete and progress stats', () => {
  const { WD1: w, storage } = loadEngine();
  assert.equal(w.store.get('custom', 'a'), undefined);
  w.store.set('custom', 'a', { n: 1 });
  assert.deepEqual(plain(w.store.get('custom', 'a')), { n: 1 });
  assert.deepEqual(JSON.parse(storage.get(KEY)).custom.a, { n: 1 }, 'saved to localStorage');
  w.store.set('custom', 'a', undefined);
  assert.equal(w.store.get('custom', 'a'), undefined);
  w.store.set('brand-new-namespace', 'k', 1);
  assert.equal(w.store.get('brand-new-namespace', 'k'), 1);
  assert.equal(w.store.get('missing-namespace', 'k'), undefined);

  assert.deepEqual(plain(w.progress.overall()), { done: 0, total: 28, pct: 0 });
  w.progress.setDone('s1-1', true, true);
  w.progress.setDone('s1-2', true);
  assert.equal(w.progress.isDone('s1-1'), true);
  assert.deepEqual(plain(w.progress.moduleStats('wk1')), { done: 2, total: 7, pct: 29 });
  assert.deepEqual(plain(w.progress.overall()), { done: 2, total: 28, pct: 7 });
  w.progress.setDone('s1-1', false);
  assert.equal(w.progress.isDone('s1-1'), false);
  assert.deepEqual(plain(w.progress.moduleStats('nope')), { done: 0, total: 0, pct: 0 });
  assert.equal(w.progress.last(), null);
});

test('store: saved state is restored, and its shape is not trusted', () => {
  const good = { done: { 's1-1': 5 }, quiz: { q: { best: 2, total: 3 } }, pg: {}, challenge: { c: 1 }, custom: {}, prefs: { theme: 'dark' }, last: { module: 'wk1', section: 's1-1', t: 1 }, challengeRev: 2 };
  let w = loadEngine({ [KEY]: JSON.stringify(good) }).WD1;
  assert.equal(w.progress.isDone('s1-1'), true);
  assert.deepEqual(plain(w.store.all().challenge), { c: 1 });
  assert.deepEqual(plain(w.progress.last()), good.last);

  const hostile = { done: 'yes', quiz: [1, 2], pg: null, challenge: 7, custom: 'x', prefs: [], last: 'here', challengeRev: 2 };
  w = loadEngine({ [KEY]: JSON.stringify(hostile) }).WD1;
  const s = w.store.all();
  for (const ns of ['done', 'quiz', 'pg', 'challenge', 'custom', 'prefs']) assert.deepEqual(plain(s[ns]), {}, ns);
  assert.equal(s.last, null);

  for (const junk of ['not json', '[]', '"text"', 'null', '42']) {
    w = loadEngine({ [KEY]: junk }).WD1;
    assert.deepEqual(plain(w.progress.overall()), { done: 0, total: 28, pct: 0 }, junk);
  }
});

test('store: challenge records and saved code from before revision 2 are dropped once', () => {
  const old = { done: { 's1-1': 5 }, challenge: { 's1-2-pg-1': 123 }, quiz: { q: { best: 3, total: 4 } }, pg: { 's1-2-pg-1': { js: 'old task' } }, custom: { playground: { html: 'mine' } }, prefs: {} };
  const { WD1: w, storage } = loadEngine({ [KEY]: JSON.stringify(old) });
  assert.deepEqual(plain(w.store.all().challenge), {}, 'auto-granted challenges are cleared');
  assert.deepEqual(plain(w.store.all().pg), {}, 'code saved for the old tasks is cleared');
  assert.equal(w.progress.isDone('s1-1'), true, 'section progress is kept');
  assert.deepEqual(plain(w.store.get('quiz', 'q')), { best: 3, total: 4 }, 'quiz scores are kept');
  assert.deepEqual(plain(w.store.get('custom', 'playground')), { html: 'mine' }, 'the full-page playground is kept');
  w.store.set('challenge', 'earned', 1);
  const again = loadEngine({ [KEY]: storage.get(KEY) }).WD1;
  assert.deepEqual(plain(again.store.all().challenge), { earned: 1 }, 'records made after the migration survive');
});

test('store: export, import and reset', () => {
  const a = loadEngine().WD1;
  a.progress.setDone('s2-3', true, true);
  a.store.set('pg', 's2-1-pg-1', { js: 'x' });
  const file = a.store.exportJSON();

  const b = loadEngine().WD1;
  b.store.importJSON(file);
  assert.equal(b.progress.isDone('s2-3'), true);
  assert.deepEqual(plain(b.store.get('pg', 's2-1-pg-1')), { js: 'x' });

  for (const bad of ['', 'nope', '[]', '{"quiz":{}}', '{"done":[]}', 'null', '{"done":"x"}']) {
    assert.throws(() => b.store.importJSON(bad), /not a course progress export/, JSON.stringify(bad));
  }
  assert.equal(b.progress.isDone('s2-3'), true, 'a rejected import changes nothing');

  b.store.importJSON(JSON.stringify({ done: {}, pg: 'x', prefs: { theme: 'neon' } }));
  assert.deepEqual(plain(b.store.all().pg), {}, 'a namespace with the wrong type is replaced with an empty one');

  b.store.reset();
  assert.deepEqual(plain(b.progress.overall()), { done: 0, total: 28, pct: 0 });
});

test('store: keeps working when localStorage is blocked', () => {
  const { context } = loadEngine();
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const w2 = (() => {
    const fresh = loadEngine();
    fresh.context.localStorage = blocked;
    return fresh.WD1;
  })();
  assert.doesNotThrow(() => w2.store.set('custom', 'a', 1));
  assert.equal(w2.store.get('custom', 'a'), 1, 'state lives in memory for the visit');
  assert.ok(context);
});
