# Authoring guide

Everything in this course is plain HTML, CSS and JavaScript. There is no build step: open any page in a browser and it works, from a local folder or from GitHub Pages.

Two shared files do the heavy lifting:

| File | What it does |
|------|--------------|
| `assets/css/course.css` | Fonts (self-hosted in `assets/fonts/`), design tokens (light + dark), page shell, and the styles for every component |
| `assets/js/course.js` | Course manifest, progress storage, page shell (top bar, sidebar, section footers, favicon), syntax highlighter, and the interactive components |

`tests/` holds the checks that keep pages and engine in step — see [Section 7](#7-tests). Run them before you push.

Open [`docs/components.html`](components.html) in a browser to see every component live.

---

## 1. Page skeleton

A lesson page lives in its own folder (`wk2/index.html`, etc.) and looks like this:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Routing, Middleware & REST APIs · Web Dev II</title>
  <meta name="description" content="One sentence that says what the page teaches.">
  <link rel="stylesheet" href="../assets/css/course.css">
  <script src="../assets/js/course.js"></script>   <!-- NOT deferred -->
  <style>
    /* page-specific styles only; use the tokens (var(--surface), var(--mod), ...) */
  </style>
</head>
<body data-module="wk2">
<main id="main">
  <header class="module-hero">
    <h1>Routing, Middleware & REST APIs</h1>
    <p class="lede">One or two sentences that set up the week.</p>
  </header>

  <section class="lesson" id="s2-1">
    <h2>Routing in Depth: Parameters and Query Strings</h2>
    <p>…</p>
  </section>

  <!-- one <section class="lesson"> per manifest entry, including the review -->
</main>
<script>
  WD1.ready(() => {
    // page-specific widget code
  });
</script>
</body>
</html>
```

The stylesheet and the script are the only two resources a page loads. Fonts are declared in `course.css` and served from `assets/fonts/`; do not add font or CDN `<link>` tags.

What `course.js` adds automatically, so **do not** write these yourself:

- the top bar, the sidebar table of contents, the site footer
- the chapter eyebrow above the `<h1>`, the progress bar and objective chips below the lede
- the section eyebrow above each `<h2>` (number, objectives)
- the "Mark section complete" button and "Next" link at the end of each section
- previous/next module links at the bottom

`<body data-module>` must be one of `wk1`, `wk2`, `wk3`, `wk4`. Each section `id` must match the manifest in `course.js` (`s1-1` … `s1-6`, `s1-review`; `s2-1` … and so on), in the same order. Adding a section means adding it to `WD1.MODULES` too.

---

## 2. Content helpers (CSS only)

| Markup | Result |
|--------|--------|
| `<p class="lede">` | Larger intro paragraph |
| `<aside class="callout">` (+ `tip`, `warn`, `try`, `listen`, `project`) | Callout box. Start with `<strong>Title</strong>` |
| `<details class="reveal"><summary>…</summary>…</details>` | Collapsible answer / aside |
| `<div class="grid-2">`, `<div class="grid-3">` | Responsive columns |
| `<div class="cards">` + `<div class="card">` | Auto-fill card grid |
| `<div class="table-wrap"><table class="data-table">` | Styled, horizontally scrollable table |
| `<span class="pill good|bad|warn|info|visited">` | Status pill |
| `<div class="output">` | Monospace output panel |
| `<div class="seg"><button aria-pressed="true">` | Segmented control |
| `<div class="range-row"><label/><input type=range/><output/></div>` | Slider row |
| `.btn`, `.btn.primary`, `.btn.ghost`, `.btn.small`, `.btn.wrap`, `.btn-row` | Buttons (`.wrap` lets long labels wrap on phones) |
| `.bm-margin`, `.bm-border`, `.bm-padding`, `.bm-content` | DevTools box-model colors |

Useful tokens: `--surface`, `--surface-2`, `--ink`, `--ink-2`, `--ink-3`, `--line`, `--accent`, `--mod` (the current chapter's color), `--good`, `--bad`, `--warn`, `--visited`, `--code-bg`, `--font-mono`, `--font-display`. Never hard-code a color that only works in one theme.

---

## 3. Code samples

Write raw code inside a text script. It is dedented, highlighted and gets a copy button:

```html
<script type="text/plain" class="code" data-lang="html">
  <p>Hello <strong>world</strong></p>
</script>
```

`data-lang` is `html`, `css`, `js`, `json` or `sql` (anything else, such as `text`, is shown without highlighting). `data-title` overrides the label. A literal `</script>` inside the sample must be written `<\/script>`; it is displayed correctly.

---

## 4. Interactive components

All JSON-driven components treat text as **mini-markdown**: `` `code` `` (escaped, so `` `<p>` `` shows the tag), `**bold**`, `[text](url)`. Do not put raw HTML or HTML entities in JSON strings: the text is shown exactly as written, so `&amp;` appears as `&amp;`. Write the character itself (`&`, `<`).

Every component accepts `data-title` (the widget heading) and `data-id` (a stable storage key; optional, auto-generated from the section otherwise).

### Quiz

```html
<div class="quiz" data-title="Quick check">
  <script type="application/json">
  [
    {"q": "Single answer?", "choices": ["A", "B", "C"], "answer": 1, "explain": "Why B."},
    {"q": "Select all that apply.", "choices": ["A", "B", "C"], "answer": [0, 2], "explain": "…"},
    {"q": "True or false: …", "answer": true, "explain": "…"},
    {"q": "Type the port number for HTTP.", "answer": ["80"], "explain": "…"},
    {"q": "Regex-checked text answer", "answer": ["h1"], "pattern": "^h1$", "caseSensitive": false},
    {"q": "Question about a code sample", "code": "<p>Hi</p>", "lang": "html", "choices": ["…"], "answer": 0}
  ]
  </script>
</div>
```

Add `"shuffle": true` to a question to shuffle its choices. Finishing a quiz with 70% or better (`data-pass="0.8"` to change) marks the enclosing section complete.

**Write choices of similar length.** When the right answer is the only long, careful sentence among three short throwaways, students learn to pick the longest. Make each wrong choice a specific, plausible misconception written in the same shape as the answer. The tests fail a page when the keyed answer is the single longest choice in more than 30% of its questions, or when choice lengths in one question are very uneven.

### Flashcards

```html
<div class="flashcards" data-title="Key terms" data-front="Term" data-back="Definition">
  <script type="application/json">[{"front": "DNS", "back": "Domain Name System…"}]</script>
</div>
```

### Playground (live code editor)

```html
<div class="playground" data-title="Try it: …" data-height="280" data-layout="stacked">
  <textarea data-lang="html"><h1>Hello</h1></textarea>
  <textarea data-lang="css">h1 { color: tomato; }</textarea>
  <textarea data-lang="js">console.log('hi');</textarea>
  <script type="application/json" class="checks">
  [
    {"label": "Has an `<h1>`", "test": "return !!$('h1')"},
    {"label": "`<h1>` is navy", "test": "return style('h1', 'color') === 'rgb(0, 0, 128)'"},
    {"label": "Uses a class selector", "test": "return /\\.[a-z]/i.test(code.css)"}
  ]
  </script>
</div>
```

- Include only the tabs you need. A JS tab adds a console panel (`data-console="false"` hides it; `"true"` forces it). For JavaScript-only exercises, `data-preview="false"` hides the rendered preview and gives the console the full column.
- Textarea content is not parsed as HTML, so tags can be written literally. Entities **are** decoded, so write `&amp;copy;` to show `&copy;`.
- The preview intercepts form submits and shows exactly what the browser would send (method, URL/body, name/value table, and a warning for controls without `name`). Links do not navigate; `#id` links scroll.
- Student edits persist in localStorage; **Reset** restores the original.

**The preview is a sandbox.** Student code runs in an `<iframe sandbox="allow-scripts allow-forms allow-modals">` with its own throwaway origin. Scripts, forms and `alert()` work. `localStorage`, `sessionStorage`, `document.cookie` and same-site `fetch` do **not** — they throw or fail — so teach those ideas with in-page data (a cookie *string* to parse, an array standing in for an API). The sandbox is what makes share links and imported progress files safe to open: shared code cannot read this site's storage or touch the lesson page.

**Loops are guarded.** The JS tab is rewritten so `while (c)` becomes `while (__wd2loop() && (c))` (three-part `for` loops likewise). A loop that spins for 1.5 seconds without giving the browser a turn throws "Loop stopped…" into the console instead of freezing the tab. Lines keep their numbers, and console errors cite the line in the JS tab.

**Checks** (`<script type="application/json" class="checks">`) turn a playground into a challenge:

- A test is a function body called with `doc`, `win`, `$` (querySelector), `$$` (querySelectorAll → array), `style(selectorOrNode, prop)` (computed value) and `code` (`{html, css, js}` strings). It runs **inside the preview**, about 60 ms after the page loads, and must `return` something truthy to pass. Throwing counts as a fail. Computed colors come back as `rgb(r, g, b)`.
- **The starter must fail at least one check.** State one clear task in the prose, ship code that is working but incomplete, and let the checks go green when the task is done. A challenge only counts (toast, hub counter) after the student has changed the starter code. The tests fail a page whose starter already passes everything.
- **Test behavior, not text.** Call the student's function with inputs it has not seen: `return win.parseUrl('/a?x=1&x=2').query.x.length === 2`. A check like `code.js.indexOf('/about') > -1` passes on a comment. Only top-level `function name() {}` declarations and `var`s are reachable as `win.name`, so write starters with function declarations.
- Following the prose must never turn a passing check red. If the text says "now name the coupon field", no check may require it to stay unnamed.

### Match

```html
<div class="match" data-title="Match the status code">
  <script type="application/json">
  {"leftTitle": "Code", "rightTitle": "Meaning", "pairs": [["200", "OK"], ["404", "Not found"]]}
  </script>
</div>
```

Left items render in monospace. Add `"monoLeft": false` for prose on the left.

### Order

```html
<div class="order" data-title="Put the steps in order">
  <script type="application/json">
  {"prompt": "Optional instructions", "code": true, "items": ["first", "second", "third"], "explain": "Shown under the list."}
  </script>
</div>
```

Write `items` in the **correct** order; they are shuffled on screen. `"code": true` shows items literally in monospace (no mini-markdown).

### Buckets (sort into categories)

```html
<div class="buckets" data-title="Which layer?">
  <script type="application/json">
  {"buckets": ["Application", "Transport"], "items": [["HTTP", "Application"], ["TCP", "Transport"]], "code": false, "explain": "…"}
  </script>
</div>
```

### Stepper (walkthroughs and animated diagrams)

```html
<div class="stepper" data-title="DNS lookup" data-autoplay="3000">
  <div class="stepper-stage">
    <!-- any HTML or inline SVG -->
    <div data-on="2-5">visible (full opacity) on steps 2 to 5, faded otherwise</div>
    <div data-active="3">outlined only on step 3</div>
  </div>
  <ol class="steps">
    <li><p>Step one text</p></li>
    <li><p>Step two text</p></li>
  </ol>
</div>
```

Specs are 1-based: `"1"`, `"1,3"`, `"2-4"`, `"1,3-5"`. The stepper element fires `stepchange` (`detail.step`, `detail.count`) and sets `data-step`, so custom code and CSS (`.stepper[data-step="3"] .x {}`) can react.

### Fill in the blanks

```html
<div class="fill" data-title="Complete the rule" data-explain="Shown under the activity">
  <script type="text/plain">
h1 [[{]]
  [[color]]: navy[[;]]
[[}]]
  </script>
</div>
```

`[[answer|alternative]]` becomes an input. Add `data-mode="text"` for prose (mini-markdown allowed) and `data-case="sensitive"` for case-sensitive answers.

### Tabs

```html
<div class="tabs">
  <div data-tab="Inline">…</div>
  <div data-tab="External">…</div>
</div>
```

### Custom widgets

Wrap bespoke interactive code in a widget frame so it matches everything else:

```html
<div class="widget" data-kind="Simulator" data-title="URL dissector">
  <!-- content; it is wrapped in .widget-body automatically -->
</div>
```

Then wire it up in the page script inside `WD1.ready(() => { … })`.

---

## 5. JavaScript API

| API | Use |
|-----|-----|
| `WD1.ready(fn)` | Run after the shell and components mount |
| `WD1.$(sel, root)`, `WD1.$$(sel, root)` | Query helpers (`$$` returns an array) |
| `WD1.h(tag, attrs, ...children)` | Create elements. `attrs` supports `class`, `text`, `html`, `onclick`, `dataset`, `style` (object) |
| `WD1.esc(str)` / `WD1.fmt(str)` | Escape HTML / render mini-markdown |
| `WD1.highlight(code, lang)` | Highlighted HTML string for `html`, `css`, `js`, `json` and `sql` |
| `WD1.codeBlock(code, lang)` | A ready-made code block element |
| `WD1.editor(container, {value, lang, height, onInput})` | A highlighted code editor (`get`, `set`, `focus`) |
| `WD1.previewFrame(title, lazy?)` | A sandboxed `<iframe>` for running student code. Always create preview frames with this |
| `WD1.buildPreviewDoc({html, css, js}, id?, checks?)` | Full preview document string (for a preview frame's `srcdoc`), with the console bridge and loop guard |
| `WD1.guardLoops(js)` | The loop-guard rewrite on its own (returns the input untouched if it does not parse) |
| `WD1.flashcards(el, cards)` | Mount flashcards from an array |
| `WD1.init(root)` | Mount components inside dynamically added markup |
| `WD1.toast(msg, 'visited'?)` | Brief status message |
| `WD1.copy(text, button?)` | Copy to the clipboard with fallback |
| `WD1.shuffle(array)` | Shuffled copy |
| `WD1.store.get(ns, id)` / `.set(ns, id, value)` | Saved state. Use `ns = 'custom'` for page widgets |
| `WD1.progress.isDone(id)` / `.setDone(id, bool)` / `.moduleStats(modId)` / `.overall()` | Section progress |
| `WD1.MODULES`, `WD1.OBJECTIVES`, `WD1.section(id)`, `WD1.module(id)` | Course manifest |
| `WD1.url(path)` | Absolute URL from the site root (works from any folder) |

Events: `document` receives `wd2:progress` (`detail.id`, `detail.done`) and `wd2:refresh`. A quiz fires `quizdone`, a playground fires `checks` (`detail.passed`, `detail.total`, `detail.complete`), a stepper fires `stepchange`, and tabs fire `tabchange`.

Saved state lives under the localStorage key `wd2:v1`. The engine namespace is `window.WD1` for historical reasons (the engine began in the Web Development I site, which shares this origin on GitHub Pages) — which is exactly why storage keys and events must say `wd2:`, never `wd1:`.

---

## 6. House style

- Write to the student in second person, plain and direct. Short paragraphs. Explain *why*, then let them try it.
- Every section has at least one interactive element and ends with a short quiz.
- Use real, specific examples (real status codes, real headers, real driver result shapes) rather than placeholders.
- Keep all links relative (`../project/index.html`) and point at `index.html` explicitly so pages also work when opened from disk.
- Nothing the site itself loads may come from a third party, and nothing may require a server or a build tool. (A code *sample* may show students a CDN `<script>` for their own page — pin its exact version.)
- Never signal right or wrong by color alone. The components add a ✓ or ✗ and screen-reader text; custom widgets must do the same.

### Server-side examples

- Node and Express code cannot run in the page. Present it as a code sample plus an output block, and be honest about provenance: caption a block "Real output — captured by running this exact program" only when it truly was captured from the code as printed. If you edit a sample, run it again and paste the new output. Otherwise label the block "Expected output".
- Write for the versions the course names (Node 26, Express 5). Two Express 5 facts that are easy to get wrong from older tutorials: without a body parser `req.body` is `undefined` (not `{}`), and an error thrown in a route handler becomes a 500 response rather than crashing the process.
- Pure-JavaScript teaching examples (parsing, validation, decoding) belong in playgrounds with `data-preview="false"` and checks, so students can run and break them in the browser.
- Each module page opens with an audio-companion block linking `../audio/wkN.mp3` and its transcript. If you change what a page teaches, read the transcript: the recording may now disagree with the page.

---

## 7. Tests

```
npm test
```

runs everything in `tests/` with Node's built-in test runner — no packages to install. It needs Node 22 or newer and, for the browser tests, Chrome or Chromium (set `CHROME_BIN` if it is somewhere unusual). The same command runs on every push (`.github/workflows/test.yml`).

| File | What it guards |
|------|----------------|
| `tests/unit/course.test.mjs` | The engine's pure parts: mini-markdown, highlighter, loop guard, preview document, progress store |
| `tests/unit/content.test.mjs` | Every JSON block parses; quiz keys are in range; answer lengths are balanced; pages match the manifest; links and anchors resolve; nothing loads from a third party; this guide still describes the code |
| `tests/e2e/site.test.mjs` | In a real browser: pages load cleanly; every quiz can be passed with its own key; every challenge starts unsolved; previews are sandboxed; runaway loops are stopped; pages fit a phone; keyboard and screen-reader behavior |

When a test fails, it names the page and line. Fix the page, not the test — the rules it enforces are the ones in this guide.

Two switches for the browser tests: `WD2_BASE_URL=https://example.com/site/ npm run test:e2e` runs them against a deployed copy instead of your working folder, and `WD2_COVERAGE=1 npm run test:e2e` also prints how much of `course.js` they exercise.
