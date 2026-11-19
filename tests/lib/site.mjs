// Shared helpers for reading the site's source files in tests.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

export const MODULE_PAGES = ['wk1/index.html', 'wk2/index.html', 'wk3/index.html', 'wk4/index.html'];

/** Every .html file in the site (tests/ and dot-folders excluded), as repo-relative paths. */
export function htmlPages(dir = ROOT) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'tests') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlPages(full));
    else if (name.endsWith('.html')) out.push(relative(ROOT, full).split('\\').join('/'));
  }
  return out.sort();
}

/** 1-based line number of a character offset. */
export const lineAt = (src, index) => src.slice(0, index).split('\n').length;

/**
 * The page with everything a browser would not treat as markup blanked out:
 * code samples, widget data, playground starters and inline scripts. What is left
 * is the real document, so scanning it for ids, links and resources is reliable.
 */
export function markupOnly(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => (/^<script\b[^>]*\bsrc=/i.test(m) ? m : blank(m)))
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, blank)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
}

/** Widgets of one kind with their parsed JSON: [{ line, data, raw }]. Throws on invalid JSON. */
export function widgets(src, kind, rel = '') {
  const re = new RegExp('<div class="' + kind + '"[^>]*>\\s*<script type="application/json"[^>]*>([\\s\\S]*?)</script>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const line = lineAt(src, m.index);
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { throw new Error(`${rel}:${line} ${kind} has invalid JSON: ${e.message}`); }
    out.push({ line, data, raw: m[1] });
  }
  return out;
}

/** Every JSON data block on a page: [{ line, raw }]. */
export function jsonBlocks(src) {
  const re = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ line: lineAt(src, m.index), raw: m[1] });
  return out;
}

/** Single-answer multiple-choice questions on a page: [{ line, q, choices, answer }]. */
export function singleAnswerQuestions(src, rel = '') {
  const out = [];
  for (const w of widgets(src, 'quiz', rel)) {
    const qs = Array.isArray(w.data) ? w.data : w.data.questions || [];
    for (const q of qs) {
      if (Array.isArray(q.choices) && typeof q.answer === 'number') out.push({ line: w.line, q: q.q, choices: q.choices, answer: q.answer });
    }
  }
  return out;
}

/**
 * Load assets/js/course.js into a bare JavaScript context with just enough of a fake
 * browser for its top-level code to run. Returns { WD1, storage } so pure functions and
 * the progress store can be tested without a browser.
 */
export function loadEngine(initialStorage = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const el = () => ({
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null, appendChild() {}, append() {}, remove() {},
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    style: { setProperty() {} }, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }
  });
  const document = Object.assign(el(), {
    currentScript: { src: 'https://site.test/assets/js/course.js' },
    documentElement: el(), head: el(), body: el(), readyState: 'loading',
    createElement: el, createTextNode: () => ({}), dispatchEvent() {}
  });
  const window = { document, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); }
  };
  class CustomEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } }
  const context = vm.createContext({ window, document, localStorage, CustomEvent, console, setTimeout, clearTimeout });
  vm.runInContext(read('assets/js/course.js'), context, { filename: 'course.js' });
  return { WD1: window.WD1, storage, context };
}
