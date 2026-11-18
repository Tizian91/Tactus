'use strict';
/*
 * Measuring tool: how fast the score reacts - in the real app, in Edge (or Chrome) without a window, driven over the
 * DevTools protocol. It builds a test score (tools/perf/perf.js), moves the mouse over the lines (the note preview),
 * drags the view with the middle button, lets the playback cursor run over a loop, and draws the score anew - and
 * records with the browser's own tracing where the time goes.
 *
 *   ELECTRON_RUN_AS_NODE=1 ".../Code.exe" tools/perf/run.js "<path of the repo>" [options]
 *     (no score options: two cases - 4 tracks · 16 bars · 1/16, and a long piece: 1 track · 64 bars · 1/32)
 *     --bars=16 --tracks=4 --grid=16 --zoom=1.5 --sel=1     one test score of your own (sel=0: no bar selected)
 *     --edge="C:\...\msedge.exe"                            the browser (default: Edge in Program Files (x86); env EDGE)
 *     --out=perf-results.txt                                also write the result there
 *
 * Each scenario says how long the browser's main thread was busy per step (ms), what took most of it, and OK / SLOW
 * against a budget (a frame at 60 Hz is 16.7 ms - the budgets leave room for slower machines). Exit code 1: something
 * is SLOW. The numbers depend on the computer: compare them with each other (before / after a change), not across machines.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = /^--([^=]+)=?(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '']; }));
const repo = path.resolve(process.argv[2] || '.');
const edge = args.edge || process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const own = ['bars', 'tracks', 'grid', 'zoom', 'sel'].some((k) => args[k] !== undefined);
const CASES = own
  ? [{ bars: args.bars || 16, tracks: args.tracks || 4, grid: args.grid || 16, zoom: args.zoom || 1.5, sel: args.sel === undefined ? 1 : args.sel }]
  : [{ bars: 16, tracks: 4, grid: 16, zoom: 1.5, sel: 1 }, { bars: 64, tracks: 1, grid: 32, zoom: 1.5, sel: 1 }];

// budgets: ms of main-thread work per step
const BUDGET = { hover: 8, pan: 6, cursor: 6, draw: 250 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const say = (s) => { lines.push(s); try { console.log(s); } catch (e) { /* output closed */ } };

// the page: the click test's copy of index.html (all scripts of the app), with perf.js instead of uitest.js
const page = path.join(repo, 'tools', 'perf', '.page.html');
const html = fs.readFileSync(path.join(repo, 'tools', 'uitest', 'index.html'), 'utf8').replace(/<script src="uitest\.js"><\/script>/, '<script src="perf.js"></script>');
if (!/perf\.js/.test(html)) throw new Error('tools/uitest/index.html: no uitest.js to replace');

/** One test score: start the browser, measure, close it. Resolves to true when nothing was SLOW. */
async function measure(opt) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const url = 'file:///' + page.replace(/\\/g, '/') + '?' + new URLSearchParams(opt);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tactus-perf-'));
  const browser = spawn(edge, ['--headless', '--disable-gpu', '--allow-file-access-from-files', '--no-first-run', `--remote-debugging-port=${port}`,
    '--window-size=1600,900', `--user-data-dir=${profile}`, url], { stdio: 'ignore' });
  let ws = null;
  try {
    for (let i = 0; i < 60 && !ws; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const pg = list.find((x) => x.type === 'page');
        if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl);
      } catch (e) { /* not up yet */ }
      if (!ws) await sleep(250);
    }
    if (!ws) throw new Error('the browser did not answer: ' + edge);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0, onTrace = null;
    const wait = new Map(), events = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
      if (d.method === 'Tracing.dataCollected') events.push(...d.params.value);
      if (d.method === 'Tracing.tracingComplete' && onTrace) onTrace();
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr, awaitPromise) => {
      const d = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise });
      if (d.result && d.result.exceptionDetails) throw new Error(expr + ': ' + d.result.exceptionDetails.text + ' ' + JSON.stringify(d.result.exceptionDetails.exception || ''));
      return d.result && d.result.result ? d.result.result.value : undefined;
    };
    for (let i = 0; i < 100 && !(await ev('!!window.__ready')); i++) await sleep(200);
    if (!(await ev('!!window.__ready'))) throw new Error('the test score was not built (error in the app?)');
    const info = JSON.parse(await ev('JSON.stringify(window.__info())'));
    say(`-- ${info.tracks} tracks · ${info.bars} bars · grid 1/${info.grid} · zoom ${Math.round(info.zoom * 100)} % · ${info.selected !== null ? 'bar ' + (info.selected + 1) + ' selected' : 'no bar selected'} · ${info.elements} elements`);

    /** Run `act` while tracing: the busy time of the page's main thread (ms) and the costliest steps in it. */
    const traced = async (act) => {
      events.length = 0;
      await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
      await act();
      await sleep(200);
      const done = new Promise((r) => { onTrace = r; });
      await send('Tracing.end');
      await done;
      const main = events.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain');
      let busy = 0;
      const by = {};
      for (const e of events) {
        if (!main || e.pid !== main.pid || e.tid !== main.tid || e.ph !== 'X' || !e.dur) continue;
        if (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') busy += e.dur / 1000;
        else if (/^(Layerize|Paint|PrePaint|Layout|UpdateLayoutTree|FunctionCall|EventDispatch|Commit|HitTest|UpdateLayer)$/.test(e.name)) by[e.name] = (by[e.name] || 0) + e.dur / 1000;
      }
      return { busy, by };
    };
    const report = (name, steps, unit, r) => {
      const per = r.busy / steps, ok = per <= BUDGET[name];
      const top = Object.entries(r.by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v / steps).toFixed(1)}`).join(', ');
      say(`${ok ? 'OK  ' : 'SLOW'} ${name.padEnd(7)} ${per.toFixed(1).padStart(7)} ms ${unit.padEnd(15)} (budget ${BUDGET[name]})   ${top}`);
      return ok;
    };
    let ok = true;

    // 1. the note preview: the mouse over the lines of bar 2
    const pts = await ev('window.__hoverPoints(60)');
    await sleep(300);
    ok = report('hover', pts.length, 'per mouse move', await traced(async () => {
      for (const [x, y] of pts) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(16); }
    })) && ok;

    // 2. dragging the view with the middle button (held: the picture only moves)
    const [px, py] = await ev('window.__panStart()');
    const panSteps = 60;
    ok = report('pan', panSteps, 'per move', await traced(async () => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'middle', buttons: 4, clickCount: 1 });
      for (let k = 1; k <= panSteps; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px - k * 6, y: py, button: 'middle', buttons: 4 }); await sleep(16); }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px - panSteps * 6, y: py, button: 'middle', buttons: 0, clickCount: 1 });
    })) && ok;
    await sleep(400); // (the drawing after letting go)

    // 3. the playback cursor over a loop of three bars
    const frames = 120;
    ok = report('cursor', frames, 'per frame', await traced(() => ev(`window.__cursorRun(${frames})`, true))) && ok;

    // 4. a full drawing (JavaScript + SVG), the mean of 5
    const drawMs = await ev('window.__drawMs(5)'), okDraw = drawMs <= BUDGET.draw;
    say(`${okDraw ? 'OK  ' : 'SLOW'} ${'draw'.padEnd(7)} ${drawMs.toFixed(1).padStart(7)} ms ${'per drawing'.padEnd(15)} (budget ${BUDGET.draw})`);
    return ok && okDraw;
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* gone */ }
    try { browser.kill(); } catch (e) { /* gone */ }
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked: the system cleans up */ }
  }
}

const finish = (code) => {
  try { fs.unlinkSync(page); } catch (e) { /* gone */ }
  if (args.out) fs.writeFileSync(path.resolve(repo, args.out), lines.join('\n') + '\n');
  process.exit(code);
};
setTimeout(() => { say('TIMEOUT'); finish(2); }, 150000 * CASES.length);

(async () => {
  fs.writeFileSync(page, html);
  say(`Tactus perf · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  let allOk = true;
  for (const c of CASES) allOk = (await measure(c)) && allOk;
  say(allOk ? 'ALL OK' : 'SOMETHING IS SLOW');
  finish(allOk ? 0 : 1);
})().catch((e) => { say('ERROR ' + (e && e.message ? e.message : e)); finish(2); });
