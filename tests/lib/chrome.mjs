// Headless Chrome driver over the raw DevTools protocol. No dependencies.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) candidates.push(r.stdout.trim());
  }
  return candidates.find((c) => c && existsSync(c)) || null;
}

/** Launch headless Chrome. Returns { page(), close() }. */
export async function launch() {
  const bin = findChrome();
  if (!bin) throw new Error('Chrome not found. Set CHROME_BIN to a Chrome or Chromium binary.');
  const profile = await mkdtemp(join(tmpdir(), 'wd2-chrome-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--mute-audio', '--disable-background-networking', 'about:blank'];
  // CI containers cannot use Chrome's own sandbox. The browser only ever loads this repo's pages.
  if (process.env.CI || process.env.CHROME_NO_SANDBOX) args.unshift('--no-sandbox');
  const proc = spawn(bin, args, { stdio: 'ignore' });

  let port = null;
  for (let i = 0; i < 120 && !port; i++) {
    const text = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
    if (text) port = parseInt(text.split('\n')[0], 10);
    else await sleep(100);
  }
  if (!port) { proc.kill(); throw new Error('Chrome did not open a debugging port.'); }

  async function page() {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = list.find((t) => t.type === 'page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
    let seq = 0;
    const pending = new Map();
    const listeners = new Set();
    let events = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) {
        const { res, rej } = pending.get(d.id);
        pending.delete(d.id);
        if (d.error) rej(new Error(d.error.message)); else res(d.result);
      } else if (d.method) { events.push(d); listeners.forEach((fn) => fn(d)); }
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');

    // Optional JavaScript coverage for one script, merged across page loads (see startCoverage).
    let coverFor = null, covered = null;
    async function collectCoverage() {
      if (!coverFor) return;
      const { result } = await send('Profiler.takePreciseCoverage');
      for (const script of result) {
        if (!script.url.endsWith(coverFor)) continue;
        const end = Math.max(...script.functions.flatMap((f) => f.ranges.map((r) => r.endOffset)));
        const hit = new Uint8Array(end);
        // Ranges come outermost first; inner blocks and functions overwrite the outer verdict.
        for (const fn of script.functions) for (const r of fn.ranges) hit.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
        if (!covered || covered.length < end) { const grown = new Uint8Array(end); if (covered) grown.set(covered); covered = grown; }
        for (let i = 0; i < end; i++) if (hit[i]) covered[i] = 1;
      }
    }

    const api = {
      send,
      /** Navigate and wait for load. Always a fresh document, even when only the #fragment differs. */
      async goto(url, { width = 1280, height = 900, mobile = false, settle = 600 } = {}) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
        const nav = async (u) => {
          const loaded = new Promise((r) => { const fn = (d) => { if (d.method === 'Page.loadEventFired') { listeners.delete(fn); r(); } }; listeners.add(fn); });
          await send('Page.navigate', { url: u });
          await Promise.race([loaded, sleep(20000)]);
        };
        await collectCoverage();
        await nav('about:blank');
        events = [];
        await nav(url);
        await sleep(settle);
      },
      /** Evaluate an expression (may be an async IIFE) and return its JSON value. */
      async eval(expression) {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error('page eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result.value;
      },
      /** Poll an expression until it is truthy. */
      async waitFor(expression, { timeout = 8000, every = 100 } = {}) {
        const end = Date.now() + timeout;
        for (;;) {
          const v = await api.eval(expression);
          if (v) return v;
          if (Date.now() > end) throw new Error('timed out waiting for: ' + expression.slice(0, 120));
          await sleep(every);
        }
      },
      /** Console errors, uncaught exceptions and failed requests since the last goto(). */
      problems() {
        const out = [];
        for (const d of events) {
          if (d.method === 'Runtime.exceptionThrown') out.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n')[0]);
          if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') out.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
          if (d.method === 'Network.loadingFailed' && !d.params.canceled) out.push('request failed: ' + d.params.errorText);
          if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) out.push('HTTP ' + d.params.response.status + ' ' + d.params.response.url);
        }
        return out;
      },
      /** Hosts contacted since the last goto(). */
      hosts() {
        const set = new Set();
        for (const d of events) {
          if (d.method === 'Network.requestWillBeSent') { try { const u = new URL(d.params.request.url); if (u.protocol.startsWith('http')) set.add(u.host); } catch (e) { /* data: etc. */ } }
        }
        return [...set];
      },
      /** Start recording which parts of the script whose URL ends with `suffix` actually run. */
      async startCoverage(suffix) {
        coverFor = suffix;
        await send('Profiler.enable');
        await send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
      },
      /** { total, covered, percent, missed: [[start, end], …] } in characters of the script, across every page loaded. */
      async coverage(sourceLength) {
        await collectCoverage();
        const total = sourceLength || (covered ? covered.length : 0);
        let n = 0;
        const missed = [];
        for (let i = 0, from = -1; i <= total; i++) {
          const on = i < total && covered && covered[i];
          if (on) n++;
          if (!on && i < total && from < 0) from = i;
          if ((on || i === total) && from >= 0) { missed.push([from, i]); from = -1; }
        }
        return { total, covered: n, percent: total ? Math.round((n / total) * 1000) / 10 : 0, missed };
      },
      /** Accessible role and name of the first element matching a selector. */
      async ax(selector) {
        await send('DOM.enable'); await send('Accessibility.enable');
        const { root } = await send('DOM.getDocument', { depth: 0 });
        const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
        if (!nodeId) return null;
        const r = await send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
        const n = r.nodes[0];
        return { role: n.role?.value, name: n.name?.value, description: n.description?.value };
      }
    };
    return api;
  }

  async function close() {
    proc.kill();
    await new Promise((r) => { proc.once('exit', r); setTimeout(r, 3000); });
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }

  return { page, close };
}
