// Content checks that need no browser: widget data, links, manifest, shared keys, assets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { ROOT, MODULE_PAGES, htmlPages, jsonBlocks, lineAt, loadEngine, markupOnly, read, singleAnswerQuestions, widgets } from '../lib/site.mjs';

const PAGES = htmlPages();
const QUIZ_PAGES = [...MODULE_PAGES, 'project/index.html'];
const { WD1 } = loadEngine();

test('site has the expected pages', () => {
  for (const p of ['index.html', 'glossary.html', 'project/index.html', 'tools/playground.html', 'docs/components.html', ...MODULE_PAGES]) {
    assert.ok(PAGES.includes(p), p);
  }
});

test('every JSON data block parses and contains no HTML entities', () => {
  for (const rel of PAGES) {
    for (const b of jsonBlocks(read(rel))) {
      assert.doesNotThrow(() => JSON.parse(b.raw), `${rel}:${b.line} invalid JSON`);
      // JSON strings are shown as written (then escaped), so an entity such as &amp; would appear literally.
      const entity = b.raw.match(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/i);
      assert.equal(entity, null, `${rel}:${b.line} JSON contains the entity ${entity && entity[0]} — write the character itself`);
    }
  }
});

test('quiz questions are well formed and keyed inside their choices', () => {
  let total = 0;
  for (const rel of PAGES) {
    for (const w of widgets(read(rel), 'quiz', rel)) {
      const qs = Array.isArray(w.data) ? w.data : w.data.questions;
      assert.ok(Array.isArray(qs) && qs.length > 0, `${rel}:${w.line} quiz has questions`);
      qs.forEach((q, i) => {
        const at = `${rel}:${w.line} question ${i + 1}`;
        total++;
        assert.equal(typeof q.q, 'string', at + ' has text');
        assert.ok(q.q.trim().length > 0, at + ' has text');
        assert.ok(typeof q.explain === 'string' && q.explain.trim().length > 0, at + ' has an explanation');
        if (typeof q.answer === 'boolean') { assert.equal(q.choices, undefined, at + ' true/false takes no choices'); return; }
        if (Array.isArray(q.choices)) {
          assert.ok(q.choices.length >= 2, at + ' has at least two choices');
          assert.equal(new Set(q.choices).size, q.choices.length, at + ' has no duplicate choices');
          const keys = Array.isArray(q.answer) ? q.answer : [q.answer];
          assert.ok(keys.length > 0, at + ' has an answer');
          for (const k of keys) assert.ok(Number.isInteger(k) && k >= 0 && k < q.choices.length, `${at} answer index ${k} is out of range`);
          assert.equal(new Set(keys).size, keys.length, at + ' lists each answer once');
          if (Array.isArray(q.answer)) assert.ok(keys.length < q.choices.length, at + ' select-all must leave at least one wrong choice');
          return;
        }
        assert.ok(Array.isArray(q.answer) && q.answer.length > 0 && q.answer.every((a) => typeof a === 'string' && a.length), at + ' typed answer lists accepted strings');
        if (q.pattern) assert.doesNotThrow(() => new RegExp(q.pattern), at + ' pattern is a valid regular expression');
      });
    }
  }
  assert.ok(total > 150, `expected the full question bank, found ${total}`);
});

test('quiz answers cannot be spotted by length', () => {
  // When the keyed choice is usually the longest (or shortest) one, "pick the longest" beats studying.
  for (const rel of QUIZ_PAGES) {
    const qs = singleAnswerQuestions(read(rel), rel);
    assert.ok(qs.length >= 10, rel + ' has single-answer questions');
    let longest = 0, shortest = 0;
    for (const q of qs) {
      const lens = q.choices.map((c) => c.length), key = lens[q.answer];
      const only = (n) => lens.filter((l) => l === n).length === 1;
      if (key === Math.max(...lens) && only(key)) longest++;
      if (key === Math.min(...lens) && only(key)) shortest++;
      assert.ok(Math.min(...lens) >= 0.6 * key && Math.max(...lens) <= 1.6 * key,
        `${rel}:${q.line} "${q.q.slice(0, 50)}…" choice lengths ${lens.join('/')} are too uneven around the answer (${key})`);
    }
    assert.ok(longest / qs.length <= 0.3, `${rel}: the answer is the single longest choice in ${longest} of ${qs.length} questions (limit 30%)`);
    assert.ok(shortest / qs.length <= 0.3, `${rel}: the answer is the single shortest choice in ${shortest} of ${qs.length} questions (limit 30%)`);
  }
});

test('other widget data is well formed', () => {
  for (const rel of PAGES) {
    const src = read(rel);
    for (const w of widgets(src, 'buckets', rel)) {
      const { buckets, items } = w.data;
      assert.ok(Array.isArray(buckets) && buckets.length >= 2, `${rel}:${w.line} buckets`);
      for (const it of items) assert.ok(buckets.includes(it[1]), `${rel}:${w.line} item "${it[0]}" names an unknown bucket "${it[1]}"`);
      for (const b of buckets) assert.ok(items.some((it) => it[1] === b), `${rel}:${w.line} bucket "${b}" has no items`);
    }
    for (const w of widgets(src, 'match', rel)) {
      const pairs = w.data.pairs || w.data;
      assert.ok(pairs.length >= 2, `${rel}:${w.line} match pairs`);
      // The widget grades by pair, so two identical cards on one side would have two right answers.
      for (const side of [0, 1]) assert.equal(new Set(pairs.map((p) => p[side])).size, pairs.length, `${rel}:${w.line} match has duplicate ${side ? 'right' : 'left'}-hand cards`);
    }
    for (const w of widgets(src, 'order', rel)) {
      const items = w.data.items || w.data;
      assert.ok(items.length >= 3, `${rel}:${w.line} order items`);
      assert.equal(new Set(items).size, items.length, `${rel}:${w.line} order has duplicate items`);
    }
    for (const w of widgets(src, 'flashcards', rel)) {
      const cards = Array.isArray(w.data) ? w.data : w.data.cards;
      assert.ok(cards.length > 0 && cards.every((c) => c.front && c.back), `${rel}:${w.line} flashcards`);
    }
    const fillRe = /<div class="fill"[^>]*>\s*<script type="text\/plain">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = fillRe.exec(src))) assert.match(m[1], /\[\[.+?\]\]/, `${rel}:${lineAt(src, m.index)} fill activity has at least one blank`);
    const checkRe = /<script type="application\/json" class="checks">([\s\S]*?)<\/script>/g;
    while ((m = checkRe.exec(src))) {
      const at = `${rel}:${lineAt(src, m.index)}`;
      const checks = JSON.parse(m[1]);
      assert.ok(checks.length > 0, at + ' has checks');
      for (const c of checks) {
        assert.ok(c.label && c.test, at + ' each check has a label and a test');
        assert.doesNotThrow(() => new Function('doc', 'win', '$', '$$', 'style', 'code', c.test), `${at} check "${c.label}" is not valid JavaScript`);
        assert.match(c.test, /\breturn\b/, `${at} check "${c.label}" must return a value`);
      }
    }
  }
});

test('each module page matches the manifest, and every section has a quiz and something to do', () => {
  for (const mod of WD1.MODULES) {
    const src = read(mod.href);
    assert.match(src, new RegExp(`<body data-module="${mod.id}"`), mod.href);
    const found = [...src.matchAll(/<section class="lesson" id="([^"]+)"/g)];
    assert.deepEqual(found.map((m) => m[1]), Array.from(mod.sections, (s) => s.id), mod.href + ' sections match assets/js/course.js');
    found.forEach((m, i) => {
      const body = src.slice(m.index, i + 1 < found.length ? found[i + 1].index : src.length);
      assert.match(body, /<div class="quiz"/, `${mod.href}#${m[1]} ends with a quiz`);
      assert.match(body, /<div class="(?:playground|match|order|buckets|stepper|fill|flashcards|tabs|widget)"/, `${mod.href}#${m[1]} has an interactive element`);
    });
    const n = mod.num;
    assert.ok(src.includes(`../audio/wk${n}.mp3`) && existsSync(join(ROOT, `audio/wk${n}.mp3`)), `week ${n} audio`);
    assert.ok(src.includes(`../audio/wk${n}-transcript.txt`) && existsSync(join(ROOT, `audio/wk${n}-transcript.txt`)), `week ${n} transcript`);
  }
});

test('pages carry the basics: one h1, a title, a description, a language', () => {
  for (const rel of PAGES) {
    const doc = markupOnly(read(rel));
    assert.match(doc, /<html lang="en">/, rel + ' declares its language');
    assert.match(doc, /<title>[^<]{5,}<\/title>/, rel + ' has a title');
    assert.match(doc, /<meta name="description" content="[^"]{40,}"/, rel + ' has a description');
    assert.match(doc, /<meta name="viewport"/, rel + ' has a viewport');
    assert.equal((doc.match(/<h1[\s>]/g) || []).length, 1, rel + ' has exactly one h1');
    assert.equal((doc.match(/<main[\s>]/g) || []).length, 1, rel + ' has exactly one main');
    assert.equal((doc.match(/<img\b(?![^>]*\balt=)[^>]*>/g) || []).length, 0, rel + ' every image has alt text');
  }
});

test('ids are unique, and every internal link and anchor resolves', () => {
  const ids = {};
  for (const rel of PAGES) {
    const doc = markupOnly(read(rel));
    const list = [...doc.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(list).size, list.length, `${rel} has duplicate ids: ${list.filter((x, i) => list.indexOf(x) !== i).join(', ')}`);
    ids[rel] = new Set(list);
  }
  const RUNTIME_IDS = new Set(['top', 'main', 'sidebar']); // added by course.js
  for (const rel of PAGES) {
    const src = read(rel), doc = markupOnly(src);
    for (const m of doc.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const url = m[1], at = `${rel}:${lineAt(doc, m.index)} ${url}`;
      if (/^(?:https?:|mailto:|data:|tel:)/.test(url)) continue;
      const [path, frag] = url.split('#');
      let target = rel;
      if (path) {
        const full = normalize(join(ROOT, dirname(rel), path.split('?')[0]));
        assert.ok(existsSync(full), at + ' points at a missing file');
        assert.ok(!statSync(full).isDirectory(), at + ' must name index.html so the page also works from disk');
        target = full.slice(ROOT.length + 1).split('\\').join('/');
      }
      if (frag && ids[target]) assert.ok(ids[target].has(frag) || RUNTIME_IDS.has(frag), at + ' anchor does not exist');
    }
  }
});

test('nothing on the site is loaded from a third party', () => {
  for (const rel of PAGES) {
    const doc = markupOnly(read(rel));
    const external = [...doc.matchAll(/<(?:link|script|img|iframe|audio|video|source)\b[^>]*\s(?:href|src)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(external, [], rel + ' loads third-party resources');
  }
  const css = read('assets/css/course.css');
  assert.doesNotMatch(css, /url\(\s*["']?https?:/, 'stylesheet loads nothing remote');
  assert.doesNotMatch(css, /@import/, 'stylesheet imports nothing');
  assert.doesNotMatch(read('assets/js/course.js'), /fonts\.googleapis|fonts\.gstatic/, 'engine loads no remote fonts');
});

test('fonts: every @font-face file exists, with its license', () => {
  const css = read('assets/css/course.css');
  const files = [...css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(files.length >= 10, 'font faces are declared');
  for (const f of files) assert.ok(existsSync(join(ROOT, 'assets/fonts', f)), 'missing font file ' + f);
  for (const family of ['Atkinson Hyperlegible', 'Bricolage Grotesque', 'JetBrains Mono']) {
    assert.ok(css.includes(`font-family: "${family}"`), family + ' is declared');
    assert.ok(existsSync(join(ROOT, 'assets/fonts', `OFL-${family.toLowerCase().replace(/ /g, '')}.txt`)), family + ' license file');
  }
});

test('the lesson "Open in playground" handoff uses one storage key on both ends', () => {
  const written = read('assets/js/course.js').match(/localStorage\.setItem\('([^']*handoff[^']*)'/);
  const readBack = read('tools/playground.html').match(/localStorage\.getItem\('([^']*handoff[^']*)'/);
  assert.ok(written && readBack, 'both ends exist');
  assert.equal(readBack[1], written[1]);
  assert.match(written[1], /^wd2:/, 'the key is namespaced to this course, not shared with Web Development I');
});

test('preview frames in page markup are sandboxed', () => {
  for (const rel of PAGES) {
    const doc = markupOnly(read(rel));
    for (const m of doc.matchAll(/<iframe\b[^>]*>/g)) {
      assert.match(m[0], /\ssandbox="allow-scripts allow-forms allow-modals"/, `${rel}:${lineAt(doc, m.index)} iframe must be sandboxed`);
    }
  }
  assert.equal((read('assets/js/course.js').match(/h\('iframe'/g) || []).length, 1, 'the engine creates frames in one place, WD1.previewFrame');
  for (const rel of PAGES) assert.doesNotMatch(read(rel), /h\('iframe'/, rel + ' creates frames through WD1.previewFrame');
});

test('authoring guide describes this course, not the one it was copied from', () => {
  const doc = read('docs/AUTHORING.md');
  assert.doesNotMatch(doc, /wd1:(?:progress|refresh|handoff|v1)/, 'event and storage names');
  assert.match(doc, /wd2:progress/);
  assert.doesNotMatch(doc, /\bch[2-5]\b|levelup|Web Dev I\b/, 'module ids and titles');
  assert.doesNotMatch(doc, /fonts\.googleapis/, 'page skeleton');
  for (const mod of WD1.MODULES) assert.ok(doc.includes('`' + mod.id + '`'), mod.id + ' is listed');
});

test('README objectives match the manifest', () => {
  const readme = read('README.md');
  WD1.OBJECTIVES.forEach((text, i) => assert.ok(readme.includes(`${i + 1}. ${text}`), `objective ${i + 1} wording`));
});
