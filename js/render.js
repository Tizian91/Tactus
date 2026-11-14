'use strict';
/*
 * Draws the score as SVG (music symbols: the Bravura font, SMuFL code points).
 *
 * Endless view: all bars on one long staff. The bars are spaced in proportion to time
 * (like Guitar Pro while editing): a tick is always the same width within a bar, so a click
 * position maps straight to a time. A bar is widened when the chosen grid gets finer, so a
 * grid cell never gets too small to hit (see the plan: "the raster follows the note value,
 * the zoom only changes the size").
 *
 *   #score (svg)
 *     #world    translate(view) scale(zoom): everything below in world units
 *       .static the score, rebuilt by TC.render.draw()
 *       .hover  preview of the note under the pointer, rebuilt by TC.render.drawHover()
 *
 * World units: SP = one staff space at zoom 1 (px). Staff steps ("lines") count half
 * spaces from the top line downwards (0 = top line, 8 = bottom line), as in drummap.js.
 */
(function (TC) {
  const S = TC.state;
  const RD = (TC.render = {});
  const SP = (RD.SP = 10);
  RD.ERASE_R = 1.1 * SP;         // reach of the eraser
  const STEM = 3.5 * SP;
  const MIN_CELL = 2.6 * SP;     // narrowest grid cell
  const QUARTER = 7 * SP;        // width of a quarter when the grid allows
  const HEAD_OFF = 1.1 * SP;     // first note: this far right of the bar start
  const BEAM_T = 0.5 * SP, BEAM_GAP = 0.75 * SP;
  RD.LINE_MIN = -7;
  RD.LINE_MAX = 15;
  const CLEF_W = 4.2 * SP;
  const TS_W = 3.4 * SP;
  const REP_W = 1.5 * SP;        // room of a repeat sign (|: at the bar start, :| at its end)
  const VOLTA_Y = -6.2 * SP;     // line of the ending brackets (1. / 2.)
  const TREM_GAP = 0.6 * SP;     // distance of roll strokes
  const GRACE = 0.6;             // size of grace notes (flam, drag)
  const STICK_Y = 9.6 * SP;      // sticking row under the staff
  const COUNT_Y = 11.2 * SP;     // counting row

  const f = (v) => Math.round(v * 100) / 100;
  const esc = (RD.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const glyph = (ch, x, y, cls = '') => `<text class="mus ${cls}" x="${f(x)}" y="${f(y)}">${ch}</text>`;
  const line = (x1, y1, x2, y2, cls) => `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  const rect = (x, y, w, h, cls) => `<rect class="${cls}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`;
  const stepY = (RD.stepY = (l) => (l * SP) / 2);

  const REST = { 3840: '', 1920: '', 960: '', 480: '', 240: '', 120: '', 60: '' };
  const REST_W = { 3840: 1.13, 1920: 1.13, 960: 1.08, 480: 1, 240: 1.28, 120: 1.45, 60: 1.7 };
  const TS_DIGIT = (d) => String.fromCharCode(0xe080 + d);
  const FLAG_UP = (n) => String.fromCharCode(0xe240 + 2 * (n - 1));
  const FLAG_DOWN = (n) => String.fromCharCode(0xe241 + 2 * (n - 1));
  const ACCENT = { 1: ['', '', 1.356], 2: ['', '', 0.94] };

  let svg, world, stat, hov, play, selg;

  RD.init = function () {
    svg = document.getElementById('score');
    world = document.getElementById('world');
    stat = world.querySelector('.static');
    hov = world.querySelector('.hover');
    play = world.querySelector('.play');
    if (!play) {
      play = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      play.setAttribute('class', 'play');
      world.appendChild(play);
    }
    selg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    selg.setAttribute('class', 'selrect');
    world.appendChild(selg);
  };

  /** Selection frame (select tool) in view coordinates { x1, y1, x2, y2 }; null removes it. */
  RD.drawRect = function (r) {
    if (!r) return void (selg.innerHTML = '');
    const x = Math.min(r.x1, r.x2), y = Math.min(r.y1, r.y2);
    selg.innerHTML = rect(x, y, Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1), 'sel-frame');
  };

  /** The drawn noteheads with their position in view coordinates (all lines of the page view). */
  RD.headsInView = function () {
    const L = RD.layout;
    if (!L) return [];
    return L.heads.map((h) => {
      const s = L.systems[L.bars[h.bar].sys];
      return Object.assign({}, h, { wx: h.x + s.tx, wy: h.y + s.ty });
    });
  };

  /** Group drawn on line s (staff coordinates -> view). */
  const onLine = (s, inner) => `<g transform="translate(${f(s.tx)},${f(s.ty)})">${inner}</g>`;

  /**
   * Playback cursor at (bar, tick); null hides it. loop: [fromBar, toBar] marked while looping.
   * Returns where the cursor is in the view ({ x, y }: y = top line of its staff).
   */
  RD.drawCursor = function (bar, tick, loop) {
    const L = RD.layout;
    if (!L || bar === null || !L.bars[bar]) {
      play.innerHTML = '';
      return null;
    }
    const b = L.bars[bar], s = L.systems[b.sys], x = RD.tickX(b, tick);
    let html = onLine(s, rect(b.x, -3.5 * SP, b.w, 11 * SP, 'play-bar') + rect(x - 1, -3.5 * SP, 2, 11 * SP, 'play-cursor'));
    if (loop && L.bars[loop[0]] && L.bars[loop[1]]) {
      const a = L.bars[loop[0]], z = L.bars[loop[1]];
      for (let k = a.sys; k <= z.sys; k++) {
        const sy = L.systems[k];
        const x1 = k === a.sys ? a.x : L.bars[sy.first].x, x2 = k === z.sys ? z.x + z.w : sy.end;
        html += onLine(sy, rect(x1 + 1, -4 * SP, x2 - x1 - 2, 12 * SP, 'loop-range'));
      }
    }
    play.innerHTML = html;
    return { x: x + s.tx, y: s.ty };
  };

  // ---- Layout -------------------------------------------------------------------------
  //
  // The bars stand in lines ("systems"). The endless view is one long line; the page view breaks
  // the bars into lines that fill the width of an A4 page and stacks the pages downwards.
  // Every bar keeps an x of its own in "staff coordinates": the lines follow each other
  // there without overlapping (each starts with room for the clef and the drum map), and line s
  // is drawn at translate(s.tx, s.ty). So a bar, a tick and a notehead have one x, whatever
  // line they are on; RD.toLocal() turns a point of the view into staff coordinates.

  const PAGE_W = (RD.PAGE_W = 1200), PAGE_H = (RD.PAGE_H = 1697); // A4: one staff space = 1.75 mm
  const PAGE_GAP = 4 * SP;
  /** Page margin in world units (the page is 210 mm wide). */
  const margin = (RD.margin = () => Math.round(((S.doc.page && S.doc.page.margin) || 15) * PAGE_W / 210));
  const PAGE_QUARTER = 5.5 * SP;  // page view: width of a quarter at the least
  const PAGE_NOTE = 1.7 * SP;     // … and of the shortest note of a bar
  const TEXT_Y = -7.6 * SP;       // bar text (Verse, Chorus …) and the tempo
  const SYS_GAP = 30 * SP;        // staff coordinates between two lines

  RD.isPage = () => S.settings.layout === 'page';
  /** Name of a swing amount (%), as written above the first bar. */
  RD.swingName = (a) => (a < 60 ? 'Light swing' : a < 65 ? 'Swing' : a < 71 ? 'Shuffle' : 'Hard shuffle');

  /** Does a bar write sticking under the staff? */
  const hasSticking = (b) => b.voices.some((items) => items.some((it) => it.kind === 'note' && it.ev.notes.some((n) => n.stick)));

  /** Height of the title block on the first page. */
  function headerHeight(meta) {
    let h = 0;
    if (meta.title) h += 3.4 * SP;
    if (meta.subtitle) h += 2.4 * SP;
    if (meta.artist) h += 2.2 * SP;
    return h ? h + 1.5 * SP : 0;
  }

  const MULTI_W = 13 * SP; // width of a multi-bar rest (before the line is justified)
  const SIMILE_W = 5 * SP; // width of a narrow, counted %-bar

  /**
   * Multi-bar rests: runs of at least two bars without a note in any track, as [first bar, count].
   * The first bar may start with a time signature, tempo, text, |: or a new line; a bar with any of
   * those (or an ending, :|, %) inside the run ends it, as in printed parts.
   */
  RD.multiRests = function (doc, bars, simile = false) {
    const plain = (i) => !doc.bars[i].volta && !(doc.bars[i].repeatEnd > 1) && !doc.bars[i].end && !doc.bars[i].jump;
    // simile: runs of %-bars instead (one % with the number of bars above)
    const fits = simile ? (i) => i > 0 && !!doc.bars[i].simile && plain(i)
      : (i) => !doc.bars[i].simile && plain(i) && doc.tracks.every((t) => t.bars[i].voices.every((v) => v.every((ev) => !ev.notes.length)));
    const opens = (i) => bars[i].showTs || bars[i].tempo || doc.bars[i].marker || doc.bars[i].repeatStart || doc.bars[i].lineBreak || doc.bars[i].mark;
    const out = [];
    for (let i = 0; i < doc.bars.length;) {
      if (!fits(i)) { i++; continue; }
      let j = i + 1;
      while (j < doc.bars.length && fits(j) && !opens(j)) j++;
      if (j - i >= 2) out.push([i, j - i]);
      i = j;
    }
    return out;
  };

  /** Positions of all bars and lines, the notation items of every voice. */
  RD.computeLayout = function () {
    const doc = S.doc, track = doc.tracks[0], page = RD.isPage(), MARGIN = margin();
    const grid = TC.gridTicks(S.input);
    const bars = doc.bars.map((h, i) => {
      const L = TC.barTicks(h.ts);
      const showTs = i === 0 || h.ts.join('/') !== doc.bars[i - 1].ts.join('/');
      const simile = !!h.simile && i > 0; // "%": repeats the bar before, no notes of its own
      const voices = simile ? [] : track.bars[i].voices.map((v) => TC.rhythm.layout(v, h.ts, track.kind === 'drums', h.beam, track.fill));
      let finest = L;
      voices.forEach((items) => items.forEach((it) => { if (!it.measure) finest = Math.min(finest, it.dur); }));
      // endless: a finer click grid widens the bar; page: the notes alone decide (as printed)
      const scale = page ? Math.max(PAGE_QUARTER / TC.TPQ, PAGE_NOTE / finest) : Math.max(QUARTER / TC.TPQ, MIN_CELL / grid, (2.4 * SP) / finest);
      const rs = !!h.repeatStart, re = h.repeatEnd > 1 ? h.repeatEnd : 0;
      return { i, L, ts: h.ts, beam: h.beam, simile, scale, showTs, rs, re, volta: h.volta || null,
        tsW: (showTs ? TS_W : 0) + (rs ? REP_W : 0), voices, marker: h.marker || '', mark: h.mark || '', end: h.end || '', jump: h.jump || '' };
    });
    // a tempo change shows "♩ = 140" above its bar
    let run = doc.meta.tempo;
    bars.forEach((b, i) => {
      const t = doc.bars[i].tempo;
      b.tempo = i > 0 && t && t !== run ? t : null;
      if (t) run = t;
    });
    const fixed = (b) => b.tsW + HEAD_OFF + 0.2 * SP + (b.re ? REP_W : 0);
    const width = (b) => fixed(b) + b.L * b.scale;

    // page view: empty bars in a row become one multi-bar rest (▬ with the number above)
    // … and %-bars in a row one % with their number
    // (or each %-bar narrow, counted: the bar it repeats is 1, then 2, 3 …)
    if (page && doc.page.simile === 'count') {
      bars.forEach((b, i) => {
        if (!b.simile) return;
        b.simileN = bars[i - 1].simileN ? bars[i - 1].simileN + 1 : 2;
        b.scale = SIMILE_W / b.L;
      });
    }
    (page && doc.page.multiRest ? RD.multiRests(doc, bars) : []).concat(page && doc.page.simile === 'combine' ? RD.multiRests(doc, bars, true) : []).forEach(([a, n]) => {
      bars[a].multi = n;
      bars[a].scale = MULTI_W / bars[a].L;
      for (let k = a + 1; k < a + n; k++) bars[k].hidden = a;
    });
    const shown = bars.filter((b) => b.hidden === undefined);

    // line breaks: as many bars as fit (or the chosen number), a bar may start a new line
    const lines = [];
    if (!page) lines.push(bars);
    else {
      const avail = PAGE_W - 2 * MARGIN - CLEF_W, per = doc.page.barsPerLine;
      let cur = [], used = 0;
      for (const b of shown) {
        const w = width(b);
        if (cur.length && (doc.bars[b.i].lineBreak || doc.bars[b.i].mark === 'coda' || (per ? cur.length >= per : used + w > avail))) {
          lines.push(cur);
          cur = [];
          used = 0;
        }
        cur.push(b);
        used += w;
      }
      if (cur.length) lines.push(cur);
      // justify: the notes spread over the whole line; the last line is not stretched more than the one before
      let prev = null;
      lines.forEach((ln, k) => {
        // (counted %-bars keep their narrow width)
        const fx = ln.reduce((a, b) => a + fixed(b) + (b.simileN ? b.L * b.scale : 0), 0), mv = ln.reduce((a, b) => a + (b.simileN ? 0 : b.L * b.scale), 0);
        if (!mv) return;
        let k2 = (avail - fx) / mv;
        if (k === lines.length - 1 && k2 > 1) k2 = Math.min(k2, prev || (fx + mv > 0.7 * avail ? k2 : 1));
        ln.forEach((b) => { if (!b.simileN) b.scale *= k2; });
        prev = k2;
      });
    }

    // positions
    const systems = [], pages = [];
    let ux = 0, yRel = MARGIN + headerHeight(doc.meta), pageNo = 0;
    if (page) pages.push({ y: 0 });
    lines.forEach((ln, k) => {
      const s = { i: k, ox: ux, first: ln[0].i, last: ln[ln.length - 1].i };
      ux += CLEF_W;
      for (const b of ln) {
        b.sys = k;
        b.x = ux;
        b.x0 = ux + b.tsW; // content start
        b.w = width(b);
        ux += b.w;
      }
      s.end = ux;
      if (page) {
        const text = k === 0 || ln.some((b) => b.marker || b.tempo || b.mark || b.end || b.jump); // the first line carries the tempo
        const under = S.settings.showCounts || ln.some(hasSticking);
        s.above = (text ? 9.8 : 7.2) * SP;
        s.below = (under ? 12.4 : 8.4) * SP;
        const h = s.above + 4 * SP + s.below;
        if (yRel + h > PAGE_H - MARGIN && yRel > MARGIN + 1) {
          pageNo++;
          pages.push({ y: pageNo * (PAGE_H + PAGE_GAP) });
          yRel = MARGIN;
        }
        s.page = pageNo;
        s.tx = MARGIN - s.ox;
        s.ty = pages[pageNo].y + yRel + s.above;
        yRel += h;
      } else {
        s.tx = 0;
        s.ty = 0;
        s.above = s.below = Infinity;
      }
      systems.push(s);
      ux += SYS_GAP;
    });
    // the bars inside a multi-bar rest share its place (clicks, cursor: the rest stands for each of them)
    for (const b of bars) {
      if (b.hidden === undefined) continue;
      const h = bars[b.hidden];
      Object.assign(b, { sys: h.sys, x: h.x, x0: h.x0, w: h.w, scale: (h.L * h.scale) / b.L });
    }
    const last = systems[systems.length - 1];
    RD.layout = {
      bars, systems, pages, page, grid, margin: MARGIN, heads: [], map: [], mapSys: 0,
      width: page ? PAGE_W : last.end,
      add: { x: last.end + 1.5 * SP, y: 0, w: 3 * SP, h: 4 * SP },
    };
    return RD.layout;
  };

  /**
   * A point of the view (world units) in staff coordinates: { x, y, sys } with y from the top
   * line of that staff - or null away from every line (page view: margins, between lines).
   */
  RD.toLocal = function (p) {
    const L = RD.layout;
    if (!L) return null;
    let best = null, bd = Infinity;
    for (const s of L.systems) {
      const lx = p.x - s.tx, ly = p.y - s.ty;
      if (L.page && (lx < s.ox - 12 * SP || lx > s.end + 6 * SP)) continue;
      const d = ly < -s.above ? -s.above - ly : ly > 4 * SP + s.below ? ly - 4 * SP - s.below : 0;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best || bd > 2 * SP) return null;
    return { x: p.x - best.tx, y: p.y - best.ty, sys: best };
  };

  /** x of a tick in a bar. */
  RD.tickX = (bar, tick) => bar.x0 + HEAD_OFF + tick * bar.scale;

  /** The bar under world x (or null). */
  RD.barAt = function (x) {
    const L = RD.layout;
    if (!L) return null;
    return L.bars.find((b) => x >= b.x && x < b.x + b.w) || null;
  };

  /** Grid position nearest to world x within a bar. */
  RD.snapTick = function (bar, x) {
    const grid = RD.layout.grid;
    const raw = (x - bar.x0 - HEAD_OFF) / bar.scale;
    const t = Math.round(raw / grid) * grid;
    const last = Math.floor((bar.L - 1) / grid) * grid;
    return TC.clamp(t, 0, last);
  };

  /** Staff position (half spaces from the top line, fractional) of world y. */
  RD.posAt = (y) => y / (SP / 2);

  /** The drawn notehead nearest to a world point (within reach), or null. */
  RD.headAt = function (p) {
    let best = null, bd = 0.85 * SP;
    for (const h of RD.layout ? RD.layout.heads : []) {
      const d = Math.hypot((p.x - h.x) * 0.8, p.y - h.y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  };

  // ---- Drawing --------------------------------------------------------------------------

  RD.applyView = function () {
    const v = S.doc.view;
    world.setAttribute('transform', `translate(${f(v.x)},${f(v.y)}) scale(${v.zoom})`);
  };

  RD.draw = function () {
    stat.innerHTML = RD.content(false);
    RD.applyView();
    RD.drawHover();
  };

  const TEMPO_W = 7.5 * SP; // room of "♩ = 120" before the text of bar 1

  /** The score as SVG markup (view coordinates). print: without grid, selection, page shadows and the "+" box. */
  RD.content = function (print) {
    const L = RD.computeLayout();
    const doc = S.doc, page = L.page;
    const out = [];
    const lines = L.systems.map(() => []); // markup of each line, in staff coordinates
    const O = (b) => lines[b.sys];
    const top = -3.5 * SP, bottom = 7.5 * SP;

    // pages, title, tempo
    const meta = doc.meta;
    const MARGIN = L.margin;
    if (page) {
      const n = L.pages.length;
      L.pages.forEach((pg, k) => {
        if (!print) out.push(rect(0, pg.y, PAGE_W, PAGE_H, 'page'));
        if (k === 0) return;
        if (doc.page.header) {
          // running header in the top margin: title · artist left, "Page 2 / 3" right
          const y = pg.y + Math.max(2.4 * SP, MARGIN * 0.55);
          const name = [meta.title, meta.artist].filter(Boolean).join(' · ');
          if (name) out.push(`<text class="runhead" x="${f(MARGIN)}" y="${f(y)}">${esc(name)}</text>`);
          out.push(`<text class="runhead right" x="${f(PAGE_W - MARGIN)}" y="${f(y)}">${esc(TC.tr('Page {k} / {n}', { k: k + 1, n }))}</text>`);
        } else {
          out.push(`<text class="pageno" x="${f(PAGE_W / 2)}" y="${f(pg.y + PAGE_H - MARGIN / 2)}">${k + 1}</text>`);
        }
      });
      let y = MARGIN;
      if (meta.title) {
        y += 3.0 * SP;
        out.push(`<text class="title center" x="${f(PAGE_W / 2)}" y="${f(y)}">${esc(meta.title)}</text>`);
        y += 0.4 * SP;
      }
      if (meta.subtitle) {
        y += 2.2 * SP;
        out.push(`<text class="subtitle center" x="${f(PAGE_W / 2)}" y="${f(y)}">${esc(meta.subtitle)}</text>`);
      }
      if (meta.artist) {
        y += 2.2 * SP;
        out.push(`<text class="subtitle right" x="${f(PAGE_W - MARGIN)}" y="${f(y)}">${esc(meta.artist)}</text>`);
      }
    } else {
      if (meta.title) out.push(`<text class="title" x="0" y="${f(-13 * SP)}">${esc(meta.title)}</text>`);
      const sub = [meta.subtitle, meta.artist].filter(Boolean).join(' · ');
      if (sub) out.push(`<text class="subtitle" x="0" y="${f(-10.6 * SP)}">${esc(sub)}</text>`);
    }
    const s0 = L.systems[0];
    // swing / shuffle next to the tempo ("Shuffle", "Swing (16ths)")
    const swingText = (meta.swing || 50) !== 50 ? TC.tr(RD.swingName(meta.swing)) + (meta.swingUnit === 16 ? ' ' + TC.tr('(16ths)') : '') : '';
    const swingW = swingText ? swingText.length * 7.2 + 1.2 * SP : 0;
    if (swingText) lines[0].push(`<text class="tempo swing" x="${f(s0.ox + 0.4 * SP + TEMPO_W)}" y="${f(TEXT_Y)}">${esc(swingText)}</text>`);
    lines[0].push(`<text class="tempo" x="${f(s0.ox + 0.4 * SP)}" y="${f(TEXT_Y)}"><tspan class="mus-sm"></tspan> = ${esc(meta.tempo)}</text>`);

    // selected bar, selected instrument's line
    const R = !print && TC.barRange();
    if (R) {
      for (let i = R[0]; i <= R[1]; i++) {
        const b = L.bars[i];
        if (b) O(b).push(rect(b.x, top, b.w, bottom - top, 'bar-sel'));
      }
    }
    const selArt = TC.drums.byId(S.input.art);
    if (!print && selArt) L.systems.forEach((s) => lines[s.i].push(rect(s.ox, stepY(selArt.line) - SP / 4, s.end - s.ox, SP / 2, 'line-band')));

    // grid
    for (const b of print ? [] : L.bars) {
      if (b.simile || b.hidden !== undefined) continue;
      const beat = TC.rhythm.beatTicks(b.ts);
      const G = TC.rhythm.groupSpans(b.ts, b.beam);
      const starts = G && new Set(G.map((g) => g[0])); // odd meters: the beam groups are the strong lines
      for (let t = 0; t < b.L; t += L.grid) {
        const x = RD.tickX(b, t);
        O(b).push(line(x, top + SP, x, bottom - SP, (starts ? starts.has(t) : t % beat === 0) ? 'grid beat' : 'grid'));
      }
    }

    // staff: every line starts with the clef
    for (const s of L.systems) {
      for (let k = 0; k < 5; k++) lines[s.i].push(line(s.ox, k * SP, s.end, k * SP, 'staff'));
      lines[s.i].push(glyph('', s.ox + 0.9 * SP, 2 * SP)); // percussion clef
    }
    // bar numbers: endless view every bar (to find your way); page view as chosen
    const numbers = page ? doc.page.barNumbers : 'every';
    L.bars.forEach((b, i) => {
      if (b.hidden !== undefined) return; // inside a multi-bar rest
      const o = O(b), s = L.systems[b.sys], lastOf = b.multi ? i + b.multi - 1 : i;
      if (b.showTs) {
        const num = String(b.ts[0]), den = String(b.ts[1]);
        const put = (str, y) => {
          const w = str.length * 1.9 * SP;
          let x = b.x + (b.rs ? REP_W : 0) + TS_W / 2 - w / 2 + 0.05 * SP;
          for (const d of str) {
            o.push(glyph(TS_DIGIT(+d), x, y));
            x += 1.9 * SP;
          }
        };
        put(num, SP);
        put(den, 3 * SP);
      }
      const end = b.x + b.w;
      const dots = (x) => [1.5, 2.5].map((y) => `<circle class="repeat-dot" cx="${f(x)}" cy="${f(y * SP)}" r="${f(0.22 * SP)}"/>`).join('');
      if (b.rs) {
        // |: thick line, thin line, two dots
        o.push(rect(b.x, 0, 0.5 * SP, 4 * SP, 'barline-thick'), line(b.x + 0.85 * SP, 0, b.x + 0.85 * SP, 4 * SP, 'barline'), dots(b.x + 1.25 * SP));
      }
      if (b.re) {
        // :| two dots, thin line, thick line; played more than twice: "3×" above
        o.push(dots(end - 1.25 * SP), line(end - 0.85 * SP, 0, end - 0.85 * SP, 4 * SP, 'barline'), rect(end - 0.5 * SP, 0, 0.5 * SP, 4 * SP, 'barline-thick'));
        if (b.re > 2) o.push(`<text class="repeat-count" x="${f(end - 0.2 * SP)}" y="${f(-0.8 * SP)}">${b.re}×</text>`);
      } else if (lastOf === L.bars.length - 1) {
        o.push(line(end - 0.75 * SP, 0, end - 0.75 * SP, 4 * SP, 'barline'));
        o.push(rect(end - 0.5 * SP, 0, 0.5 * SP, 4 * SP, 'barline-thick'));
      } else {
        o.push(line(end, 0, end, 4 * SP, 'barline'));
      }
      // page view (not printed): a manual line break after this bar
      if (page && !print && doc.bars[lastOf + 1] && doc.bars[lastOf + 1].lineBreak) {
        o.push(`<text class="break-mark" x="${f(end + 0.5 * SP)}" y="${f(2.6 * SP)}"><title>${esc(TC.tr('manual line break'))}</title>↵</text>`);
      }
      const lineStart = i === s.first;
      if (numbers === 'every' || (numbers === 'system' && lineStart && i > 0)) {
        const nx = page && lineStart ? s.ox + 0.3 * SP : b.x + 0.25 * SP;
        o.push(`<text class="barno" x="${f(nx)}" y="${f(-2.9 * SP)}">${i + 1}</text>`);
      }
      if (b.tempo) o.push(`<text class="tempo" x="${f(b.x + 0.4 * SP)}" y="${f(TEXT_Y)}"><tspan class="mus-sm"></tspan> = ${esc(b.tempo)}</text>`);
      // text above the bar (Verse, Chorus …), in a box
      if (b.marker) {
        const x = b.x + 0.2 * SP + (i === 0 ? TEMPO_W + swingW : b.tempo ? TEMPO_W : 0);
        const w = markerW(b.marker);
        o.push(`<g class="marker">${rect(x, TEXT_Y - 1.4 * SP, w, 1.95 * SP, 'marker-box')}` +
          `<text class="marker-text" x="${f(x + 0.5 * SP)}" y="${f(TEXT_Y)}">${esc(b.marker)}</text></g>`);
      }
      // 𝄋 / ⊕ at the start of the bar (after tempo and text)
      if (b.mark) {
        const prev = L.bars[i - 1], gap = prev && prev.sys === b.sys && (prev.end || prev.jump) ? 1.2 * SP : 0; // clear of "D.S. al Coda" before it
        const x = b.x + 0.2 * SP + gap + (i === 0 ? TEMPO_W + swingW : b.tempo ? TEMPO_W : 0) + (b.marker ? markerW(b.marker) + 0.6 * SP : 0);
        o.push(`<text class="mus-sm jump-sign" x="${f(x)}" y="${f(TEXT_Y + 0.3 * SP)}"><title>${esc(TC.tr(b.mark === 'segno' ? 'Segno' : 'Coda'))}</title>${b.mark === 'segno' ? '' : ''}</text>`);
      }
      // at the end of the bar: D.C. / D.S. …, Fine, To Coda ⊕ (right-aligned, the jump rightmost)
      let ex = end - 0.3 * SP;
      if (b.jump) {
        const t = RD.jumpText(b.jump);
        o.push(`<text class="jump-text" x="${f(ex)}" y="${f(TEXT_Y)}">${esc(t)}</text>`);
        ex -= jumpW(t) + 0.8 * SP;
      }
      if (b.end === 'fine') o.push(`<text class="jump-text" x="${f(ex)}" y="${f(TEXT_Y)}">Fine</text>`);
      if (b.end === 'toCoda') {
        o.push(`<text class="mus-sm jump-sign end" x="${f(ex)}" y="${f(TEXT_Y + 0.3 * SP)}">${''}</text>` +
          `<text class="jump-text" x="${f(ex - 2.3 * SP)}" y="${f(TEXT_Y)}">To Coda</text>`);
      }
    });

    // notes
    L.heads = [];
    const track = doc.tracks[0];
    for (const b of L.bars) {
      if (b.hidden !== undefined) continue;
      if (b.multi && b.simile) {
        // %-bars in a row: one % with the number of bars above
        const cx = b.x0 + (b.x + b.w - b.x0) / 2;
        O(b).push(`<g class="multisimile"><text class="mus mid" x="${f(cx)}" y="${f(2 * SP)}">${''}</text>` +
          `<text class="multirest-n" x="${f(cx)}" y="${f(-1.0 * SP)}">${b.multi}</text></g>`);
        continue;
      }
      if (b.multi) {
        // multi-bar rest: thick bar on the middle line with serifs, the number of bars above
        const x1 = b.x0 + 0.8 * SP, x2 = b.x + b.w - 1.2 * SP, cx = (x1 + x2) / 2;
        O(b).push(`<g class="multirest">${rect(x1, 1.55 * SP, x2 - x1, 0.9 * SP, 'multirest-bar')}` +
          line(x1, SP, x1, 3 * SP, 'multirest-end') + line(x2, SP, x2, 3 * SP, 'multirest-end') +
          `<text class="multirest-n" x="${f(cx)}" y="${f(-1.0 * SP)}">${b.multi}</text></g>`);
        continue;
      }
      if (b.simile) {
        O(b).push(`<text class="mus mid" x="${f(b.x0 + (b.x + b.w - b.x0) / 2)}" y="${f(2 * SP)}"></text>`);
        if (b.simileN) O(b).push(`<text class="simile-n" x="${f(b.x0 + (b.x + b.w - b.x0) / 2)}" y="${f(-1.0 * SP)}">${b.simileN}</text>`);
        continue;
      }
      const used = b.voices.map((items) => items.some((it) => it.kind === 'note'));
      b.top = 0; // highest ink above the staff (drawVoice), for the ending brackets
      b.voices.forEach((items, vi) => drawVoice(O(b), b, items, vi, used, track));
      drawUnder(O(b), b);
    }

    // endings (1. / 2.): a bracket over the bars of one ending, per line; open at the right after the last one
    const vkey = (b) => (b && b.volta ? b.volta.join(',') : '');
    L.bars.forEach((b, i) => {
      if (!b.volta || (i > 0 && vkey(L.bars[i - 1]) === vkey(b) && L.bars[i - 1].sys === b.sys)) return;
      let j = i;
      while (j + 1 < L.bars.length && vkey(L.bars[j + 1]) === vkey(b) && L.bars[j + 1].sys === b.sys) j++;
      const last = L.bars[j], x1 = b.x + 0.3 * SP, x2 = last.x + last.w - 0.4 * SP;
      const more = L.bars[j + 1] && L.bars[j + 1].volta && L.bars[j + 1].sys === b.sys; // another ending follows: closed
      const hook = 1.4 * SP;
      const startsHere = i === 0 || vkey(L.bars[i - 1]) !== vkey(b); // (not a continuation on a new line)
      // above the notes and accents of all endings side by side on this line (one height for 1. and 2.)
      let a = i, z = j;
      while (a > 0 && L.bars[a - 1].volta && L.bars[a - 1].sys === b.sys) a--;
      while (z + 1 < L.bars.length && L.bars[z + 1].volta && L.bars[z + 1].sys === b.sys) z++;
      let top = 0;
      for (let k = a; k <= z; k++) top = Math.min(top, L.bars[k].top || 0);
      const VY = Math.min(VOLTA_Y, top - 1.7 * SP);
      let d = `M${f(x1)},${f(VY + (startsHere ? hook : 0))} L${f(x1)},${f(VY)} L${f(x2)},${f(VY)}`;
      if (more || last.re) d += ` L${f(x2)},${f(VY + hook)}`;
      O(b).push(`<path class="volta" d="${d}"/>`);
      if (startsHere) O(b).push(`<text class="volta-text" x="${f(x1 + 0.4 * SP)}" y="${f(VY + 1.15 * SP)}">${b.volta.join('., ')}.</text>`);
    });

    // "+" after the last bar
    if (!print) {
      const a = L.add;
      lines[lines.length - 1].push(`<g class="add-bar">${rect(a.x, a.y, a.w, a.h, 'add-box')}` +
        `<text class="add-plus" x="${f(a.x + a.w / 2)}" y="${f(a.y + a.h / 2 + 5)}">+</text></g>`);
    }

    L.systems.forEach((s) => out.push(onLine(s, lines[s.i].join(''))));
    return out.join('');
  };

  /** Width of the box of a bar text (12 px bold). */
  const markerW = (s) => s.length * 7.4 + 1.2 * SP;
  /** Width of a jump text (13 px bold italic). */
  const jumpW = (s) => s.length * 7.2;
  /** "D.S. al Coda" … as written above the bar. */
  RD.jumpText = (j) => ({ dc: 'D.C.', dcFine: 'D.C. al Fine', dcCoda: 'D.C. al Coda', ds: 'D.S.', dsFine: 'D.S. al Fine', dsCoda: 'D.S. al Coda' })[j] || '';

  /** One voice of one bar: rests, heads, stems, flags, beams, dots, accents, tuplets. */
  function drawVoice(out, b, items, vi, used, track) {
    const up = vi % 2 === 0;
    const other = used.some((u, k) => u && k !== vi);
    if (items.length === 1 && items[0].measure) {
      if (vi > 0 && !used[vi]) return;            // empty feet voice: nothing
      const y = other ? (up ? 0 : 3 * SP) : SP;
      out.push(glyph(REST[3840], b.x0 + (b.w - (b.x0 - b.x)) / 2 - 0.56 * SP, y, 'rest'));
      return;
    }
    if (!used[vi]) return;
    const beams = TC.rhythm.beams(items, b.ts, b.beam);
    const groupOf = new Map();
    beams.forEach((g) => g.forEach((it) => groupOf.set(it, g)));

    // geometry of each note item first (beams need all of their stems)
    const geo = new Map();
    for (const it of items) {
      if (it.kind !== 'note') continue;
      const x = RD.tickX(b, it.tick);
      const gi = it.base >= 3840 ? 2 : it.base >= 1920 ? 1 : 0;
      const heads = it.ev.notes.map((n) => {
        const art = TC.drums.byId(n.art);
        const head = TC.HEADS[TC.drums.headOf(n)];
        return { n, art, line: art ? art.line : 4, head, w: head.w[gi] * SP, g: head.g[gi], dx: 0 };
      }).sort((a, c) => a.line - c.line);
      // seconds in a chord: one head to the other side of the stem
      if (up) {
        for (let k = heads.length - 2; k >= 0; k--) {
          if (heads[k + 1].line - heads[k].line === 1 && !heads[k + 1].dx) heads[k].dx = heads[k].w - 0.1 * SP;
        }
      } else {
        for (let k = 1; k < heads.length; k++) {
          if (heads[k].line - heads[k - 1].line === 1 && !heads[k - 1].dx) heads[k].dx = -(heads[k].w - 0.1 * SP);
        }
      }
      const hi = heads[0], lo = heads[heads.length - 1];
      const mainW = (up ? lo : hi).w;
      const stemX = up ? x + mainW / 2 - 0.06 * SP : x - mainW / 2 + 0.06 * SP;
      const flags = TC.rhythm.flags(it.base);
      const trem = Math.max(0, ...it.ev.notes.map((n) => n.trem || 0)); // roll strokes need a longer stem
      const extra = Math.max(0, flags - 2) * BEAM_GAP + (trem ? (trem + 0.5) * TREM_GAP : 0);
      const startY = up ? stepY(lo.line) - lo.head.stem * SP : stepY(hi.line) + hi.head.stem * SP;
      const endY = up ? stepY(hi.line) - STEM - extra : stepY(lo.line) + STEM + extra;
      geo.set(it, { x, heads, stemX, startY, endY, flags, trem });
    }
    // beams: flat, at the outermost stem end of the group
    for (const g of beams) {
      const gs = g.map((it) => geo.get(it));
      const maxFlags = Math.max(...gs.map((q) => q.flags));
      const by = up ? Math.min(...gs.map((q) => q.endY)) : Math.max(...gs.map((q) => q.endY));
      gs.forEach((q) => { q.endY = by; });
      const x1 = gs[0].stemX - 0.06 * SP, x2 = gs[gs.length - 1].stemX + 0.06 * SP;
      out.push(beamRect(x1, x2, by, 0, up));
      for (let lev = 2; lev <= maxFlags; lev++) {
        let k = 0;
        while (k < g.length) {
          if (gs[k].flags < lev) {
            k++;
            continue;
          }
          let j = k;
          while (j + 1 < g.length && gs[j + 1].flags >= lev) j++;
          if (j > k) out.push(beamRect(gs[k].stemX - 0.06 * SP, gs[j].stemX + 0.06 * SP, by, lev - 1, up));
          else {
            const left = k > 0 && (k === g.length - 1 || gs[k - 1].flags >= gs[k + 1].flags);
            const sx = gs[k].stemX;
            out.push(beamRect(left ? sx - 1.1 * SP : sx - 0.06 * SP, left ? sx + 0.06 * SP : sx + 1.1 * SP, by, lev - 1, up));
          }
          k = j + 1;
        }
      }
    }

    for (const it of items) {
      if (it.kind === 'rest') {
        const shift = other ? (up ? -SP : 2 * SP) : 0;
        const y = (it.base >= 3840 ? SP : 2 * SP) + shift;
        const x = RD.tickX(b, it.tick) - (REST_W[it.base] * SP) / 2;
        out.push(glyph(REST[it.base], x, y, 'rest'));
        if (it.dots) out.push(glyph('', x + REST_W[it.base] * SP + 0.3 * SP, y - SP / 2, 'rest'));
        continue;
      }
      const q = geo.get(it);
      const sel = it.ev.notes.some((n) => S.selection.has(n.id));
      out.push(`<g class="note${sel ? ' sel' : ''}">`);
      for (const h of q.heads) {
        const cx = q.x + h.dx, y = stepY(h.line);
        // ledger lines
        for (let l = -2; l >= h.line; l -= 2) out.push(line(cx - h.w / 2 - 0.4 * SP, stepY(l), cx + h.w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        for (let l = 10; l <= h.line; l += 2) out.push(line(cx - h.w / 2 - 0.4 * SP, stepY(l), cx + h.w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        const hs = S.selection.has(h.n.id);
        out.push(glyph(h.g, cx - h.w / 2, y, hs ? 'head hsel' : 'head'));
        if (h.n.ghost) {
          out.push(glyph('', cx - h.w / 2 - 0.5 * SP, y, 'head'));
          out.push(glyph('', cx + h.w / 2 + 0.2 * SP, y, 'head'));
        }
        if (it.dots) {
          const dy = h.line % 2 === 0 ? -SP / 2 : 0;
          out.push(glyph('', q.x + Math.max(...q.heads.map((z) => z.dx + z.w / 2)) + 0.35 * SP, y + dy, 'head'));
        }
        RD.layout.heads.push({ x: cx, y, id: h.n.id, bar: b.i, tick: it.tick, line: h.line });
      }
      if (it.base < 3840) {
        out.push(line(q.stemX, q.startY, q.stemX, q.endY, 'stem'));
        if (!groupOf.has(it) && q.flags) {
          out.push(glyph(up ? FLAG_UP(q.flags) : FLAG_DOWN(q.flags), q.stemX - 0.06 * SP, q.endY, 'head'));
        }
      }
      // roll: strokes through the stem (above the head of a whole note)
      if (q.trem) {
        const sx = it.base < 3840 ? q.stemX : q.x;
        const y0 = it.base < 3840 ? q.startY + (up ? -1 : 1) * 1.1 * SP : stepY(q.heads[0].line) - 1.6 * SP;
        for (let k = 0; k < q.trem; k++) {
          const cy = y0 + (up || it.base >= 3840 ? -1 : 1) * k * TREM_GAP;
          out.push(`<path class="beam" d="M${f(sx - 0.6 * SP)},${f(cy + 0.3 * SP)} L${f(sx + 0.6 * SP)},${f(cy - 0.3 * SP)} ` +
            `L${f(sx + 0.6 * SP)},${f(cy + 0.05 * SP)} L${f(sx - 0.6 * SP)},${f(cy + 0.65 * SP)}Z"/>`);
        }
      }
      // flam / drag: small notes just before the head
      const orn = it.ev.notes.find((n) => n.orn);
      if (orn) drawGrace(out, q, orn);
      // accents and techniques: outside, at the stem end
      const marks = [];
      const acc = Math.max(...it.ev.notes.map((n) => n.accent || 0));
      if (acc) marks.push(['acc', acc]);
      it.ev.notes.forEach((n) => {
        const art = TC.drums.byId(n.art);
        if (art && art.tech === 'choke' && !marks.some((m) => m[0] === 'choke')) marks.push(['choke']);
        if (art && art.tech === 'edge' && !marks.some((m) => m[0] === 'edge')) marks.push(['edge']);
      });
      let my = up ? Math.min(q.endY, 0) - 0.9 * SP : Math.max(q.endY, 4 * SP) + 0.9 * SP;
      for (const m of marks) {
        if (m[0] === 'acc') {
          const [ga, gb, w] = ACCENT[m[1]];
          out.push(glyph(up ? ga : gb, q.x - (w * SP) / 2, my, 'head'));
        } else if (m[0] === 'choke') {
          out.push(glyph(up ? '' : '', q.x - 0.17 * SP, my, 'head'));
        } else {
          // cymbal edge pictogram, drawn at 40 % size (class mus-xs)
          out.push(`<text class="mus-xs" x="${f(q.x - 0.97 * SP)}" y="${f(my + (up ? 0 : 0.8 * SP))}"></text>`);
        }
        my += up ? -1.2 * SP : 1.2 * SP;
      }
      q.markY = marks.length ? my + (up ? 0.5 * SP : -0.5 * SP) : null; // outermost mark (tuplet numbers go beyond it)
      if (up) b.top = Math.min(b.top || 0, q.endY - 0.3 * SP, marks.length ? my + 0.4 * SP : 0);
      if (it.tie) {
        const nx = RD.tickX(b, it.tick + it.dur);
        const y = stepY(q.heads[0].line) + (up ? 0.6 * SP : -0.6 * SP);
        out.push(`<path class="tie" d="M${f(q.x + 0.6 * SP)},${f(y)} Q${f((q.x + nx) / 2)},${f(y + (up ? 1 : -1) * SP)} ${f(nx - 0.6 * SP)},${f(y)}"/>`);
      }
      out.push('</g>');
    }

    // triplets: "3" at the beam, or a bracket
    const tups = new Map();
    items.forEach((it) => { if (it.tup) { if (!tups.has(it.tup.s)) tups.set(it.tup.s, []); tups.get(it.tup.s).push(it); } });
    for (const list of tups.values()) {
      const notes = list.filter((it) => it.kind === 'note');
      const x1 = RD.tickX(b, list[0].tick), x2 = RD.tickX(b, list[list.length - 1].tick);
      const g = notes.length && groupOf.get(notes[0]);
      const oneBeam = g && g.length === list.length && notes.every((it) => groupOf.get(it) === g);
      const ends = notes.map((it) => geo.get(it).endY);
      const marks = notes.map((it) => geo.get(it).markY).filter((y) => y !== null);
      let edge = up ? Math.min(0, ...ends) - (oneBeam ? 0.9 * SP : 1.4 * SP) : Math.max(4 * SP, ...ends) + (oneBeam ? 2.2 * SP : 2.4 * SP);
      if (marks.length) edge = up ? Math.min(edge, Math.min(...marks) - 0.3 * SP) : Math.max(edge, Math.max(...marks) + 1.8 * SP);
      const mx = (x1 + x2) / 2 + (up ? 0.6 * SP : -0.6 * SP);
      out.push(glyph('', mx - 0.6 * SP, edge, 'tuplet'));
      if (up) b.top = Math.min(b.top || 0, edge - 1.4 * SP);
      if (!oneBeam) {
        const by = up ? edge - 0.6 * SP : edge - 1 * SP;
        const hook = up ? 0.6 * SP : -0.6 * SP;
        const a = x1 - 0.6 * SP, z = x2 + 0.6 * SP;
        out.push(`<path class="bracket" d="M${f(a)},${f(by + hook)} L${f(a)},${f(by)} L${f(mx - 1.0 * SP)},${f(by)} M${f(mx + 1.0 * SP)},${f(by)} L${f(z)},${f(by)} L${f(z)},${f(by + hook)}"/>`);
      }
    }
  }

  /**
   * Grace notes of a flam (one small slashed eighth) or a drag (two small beamed sixteenths),
   * left of the head of note n, stems up.
   */
  function drawGrace(out, q, n) {
    const h = q.heads.find((z) => z.n === n) || q.heads[0];
    const y = stepY(h.line), gw = 1.18 * SP * GRACE;
    const right = q.x + h.dx - h.w / 2 - 0.35 * SP; // right edge of the graces
    const count = n.orn === 'drag' ? 2 : 1;
    const top = y - 2.5 * SP;
    const stems = [];
    out.push('<g class="grace">');
    for (let k = 0; k < count; k++) {
      const cx = right - gw / 2 - (count - 1 - k) * (gw + 0.25 * SP);
      out.push(`<text class="mus grace" x="${f(cx - gw / 2)}" y="${f(y)}"></text>`);
      const sx = cx + gw / 2 - 0.05 * SP;
      stems.push(sx);
      out.push(line(sx, y - 0.12 * SP, sx, top, 'stem thin'));
      for (let l = -2; l >= h.line; l -= 2) out.push(line(cx - gw / 2 - 0.25 * SP, stepY(l), cx + gw / 2 + 0.25 * SP, stepY(l), 'ledger thin'));
    }
    if (count === 1) {
      out.push(`<text class="mus grace" x="${f(stems[0] - 0.04 * SP)}" y="${f(top)}"></text>`);
      out.push(line(stems[0] - 0.55 * SP, top + 1.6 * SP, stems[0] + 0.75 * SP, top + 0.7 * SP, 'stem thin')); // slash
    } else {
      out.push(rect(stems[0], top, stems[1] - stems[0], 0.3 * SP, 'beam'));
      out.push(rect(stems[0], top + 0.55 * SP, stems[1] - stems[0], 0.3 * SP, 'beam'));
    }
    out.push('</g>');
  }

  /** Under the staff: sticking (R / L) and, if switched on, counting (1 e + a). */
  function drawUnder(out, b) {
    const sticks = new Map();
    b.voices.forEach((items) => items.forEach((it) => {
      if (it.kind !== 'note' || it.cont) return;
      it.ev.notes.forEach((n) => {
        if (!n.stick) return;
        const s = sticks.get(it.tick) || '';
        if (!s.includes(n.stick)) sticks.set(it.tick, s + n.stick);
      });
    }));
    for (const [t, s] of sticks) out.push(`<text class="sticking" x="${f(RD.tickX(b, t))}" y="${f(STICK_Y)}">${esc(s)}</text>`);
    if (!S.settings.showCounts) return;
    const ticks = new Set();
    const beat = (4 * TC.TPQ) / b.ts[1];
    for (let t = 0; t < b.L; t += beat) ticks.add(t);
    b.voices.forEach((items) => items.forEach((it) => { if (it.kind === 'note' && !it.cont) ticks.add(it.tick); }));
    const de = TC.getLang() === 'de';
    const SHORT = { e: 'e', und: '+', '+': '+', a: de ? 'e' : 'a', trip: 'tri', let: 'let' };
    for (const t of ticks) {
      const p = TC.rhythm.countLabel(t, b.ts).split(' ');
      const main = p.length === 1;
      const text = main ? p[0] : SHORT[p[1]] || '·';
      out.push(`<text class="count${main ? ' beat' : ''}" x="${f(RD.tickX(b, t))}" y="${f(COUNT_Y)}">${esc(text)}</text>`);
    }
  }

  /** A beam (level 0 = at the stem ends, higher levels further in). */
  function beamRect(x1, x2, y, level, up) {
    const y0 = up ? y + level * BEAM_GAP : y - level * BEAM_GAP - BEAM_T;
    return rect(x1, y0, x2 - x1, BEAM_T, 'beam');
  }

  /**
   * Drum map: short names (HH, SN, BD …) exactly at the height of their line, left of the
   * staff. Notes on lines in the column next to the staff, notes in spaces in a second column
   * further left - so neighbouring positions never overlap and no slanted leaders are needed.
   * The full names are the tooltip. hl: line to highlight (under the pointer).
   * Fills RD.layout.map with the label boxes (for pointer hits).
   */
  const MAP_FONT = 9;
  const textW = (s) => s.length * MAP_FONT * 0.62 + 2;
  function drawDrumMap(out, hl, ox) {
    const lines = TC.drums.lines(TC.drums.mapIds());
    const rows = lines.map(([l, arts]) => {
      const abs = [];
      arts.forEach((a) => { if (!abs.includes(a.ab)) abs.push(a.ab); });
      const text = abs.join(' · ');
      const names = arts.map((a) => TC.drums.label(a)).join(', ');
      return { line: l, y: stepY(l), text, names, w: textW(text), sel: arts.some((a) => a.id === S.input.art) };
    });
    const near = rows.filter((r) => r.line % 2 === 0), far = rows.filter((r) => r.line % 2 !== 0);
    const xNear = ox - 0.8 * SP;
    const xFar = xNear - Math.max(0, ...near.map((r) => r.w)) - 1.0 * SP;
    near.forEach((r) => { r.x2 = xNear; });
    far.forEach((r) => { r.x2 = xFar; });
    RD.layout.map = rows.map((r) => ({ line: r.line, y: r.y, x1: r.x2 - r.w, x2: ox }));
    out.push('<g class="drummap">');
    for (const r of rows) {
      const cls = (r.sel ? ' sel' : '') + (r.line === hl ? ' hl' : '');
      out.push(`<path class="dm-lead${cls}" d="M${f(r.x2 + 0.25 * SP)},${f(r.y)} L${f(ox)},${f(r.y)}"/>`);
      out.push(`<text class="dm-label${cls}" x="${f(r.x2)}" y="${f(r.y + MAP_FONT * 0.36)}"><title>${esc(r.names)}</title>${esc(r.text)}</text>`);
    }
    out.push('</g>');
  }

  // ---- Live layer: drum map, line under the pointer, preview ---------------------------------

  /** Line of the live layer: under the pointer, else the one of the selected bar, else the first. */
  function hoverLine(h, L) {
    if (h && h.sys !== undefined && L.systems[h.sys]) return L.systems[h.sys];
    if (h && L.bars[h.bar]) return L.systems[L.bars[h.bar].sys];
    if (S.selBar !== null && L.bars[S.selBar]) return L.systems[L.bars[S.selBar].sys];
    return L.systems[0];
  }

  RD.drawHover = function () {
    const h = S.hover, L = RD.layout;
    if (!L) return;
    const out = [], s = hoverLine(h, L);
    const hl = h ? (h.mapLine !== undefined ? h.mapLine : h.line) : null;
    if (hl !== null && hl !== undefined) out.push(rect(s.ox, stepY(hl) - SP / 4, s.end - s.ox, SP / 2, 'hover-band'));
    L.map = [];
    L.mapSys = s.i; // the drum map stands next to this line
    if (S.settings.showDrumMap) drawDrumMap(out, hl, s.ox);
    if (h && h.erase) {
      // eraser: a circle; notes under it are deleted while pressed
      out.push(`<circle class="erase-ring${h.erase.on ? ' on' : ''}" cx="${f(h.erase.x)}" cy="${f(h.erase.y)}" r="${f(RD.ERASE_R)}"/>`);
    }
    if (h && h.ring) {
      out.push(`<circle class="hover-ring" cx="${f(h.ring.x)}" cy="${f(h.ring.y)}" r="${f(0.95 * SP)}"/>`);
    }
    if (h && h.vel) {
      // strength of a held note: the steps (ghost · soft · normal · strong · accent) next to it, the current one named
      const n = h.vel.names.length, x = h.hx + 1.3 * SP, seg = 0.6 * SP, gap = 0.15 * SP, w = 0.75 * SP, base = h.hy + 1.8 * SP;
      out.push(`<circle class="hover-ring" cx="${f(h.hx)}" cy="${f(h.hy)}" r="${f(0.95 * SP)}"/>`);
      out.push(rect(x - 0.2 * SP, base - n * seg - (n - 1) * gap - 0.2 * SP, w + 0.4 * SP, n * seg + (n - 1) * gap + 0.4 * SP, 'vel-box'));
      for (let k = 0; k < n; k++) {
        out.push(rect(x, base - (k + 1) * seg - k * gap, w, seg, k <= h.vel.level ? 'vel-seg on' : 'vel-seg'));
      }
      const text = h.vel.names[h.vel.level], tw = textW(text) + 4, ly = base - (h.vel.level + 0.5) * seg - h.vel.level * gap;
      out.push(`<rect class="hover-label-bg" x="${f(x + w + 0.5 * SP - 3)}" y="${f(ly - 7.5)}" width="${f(tw)}" height="15" rx="3"/>`);
      out.push(`<text class="hover-label" x="${f(x + w + 0.5 * SP)}" y="${f(ly + 3.6)}">${esc(text)}</text>`);
    }
    if (h && h.barHl && L.bars[h.bar]) {
      const b = L.bars[h.bar]; // beside the lines: a tap selects this bar
      out.push(rect(b.x, -3.5 * SP, b.w, 11 * SP, 'hover-bar'));
    }
    if (h && L.bars[h.bar] && h.tick !== undefined) {
      const b = L.bars[h.bar];
      const x = RD.tickX(b, h.tick);
      const cell = L.grid * b.scale;
      out.push(rect(x - cell / 2, -3.5 * SP, cell, 11 * SP, h.lock ? 'hover-col lock' : 'hover-col'));
      let labelX = null, labelY = null;
      if (h.headId) {
        out.push(`<circle class="hover-ring" cx="${f(h.hx)}" cy="${f(h.hy)}" r="${f(0.95 * SP)}"/>`);
        labelX = h.hx + 1.2 * SP;
        labelY = h.hy;
      } else if (h.art) {
        const head = TC.HEADS[S.input.head !== 'auto' && TC.HEADS[S.input.head] ? S.input.head : h.art.head];
        const gi = S.input.value === 1 ? 2 : S.input.value === 2 ? 1 : 0;
        const w = head.w[gi] * SP, y = stepY(h.art.line);
        for (let l = -2; l >= h.art.line; l -= 2) out.push(line(x - w / 2 - 0.4 * SP, stepY(l), x + w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        for (let l = 10; l <= h.art.line; l += 2) out.push(line(x - w / 2 - 0.4 * SP, stepY(l), x + w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        out.push(glyph(head.g[gi], x - w / 2, y, 'ghost'));
        labelX = x + w / 2 + 0.7 * SP;
        labelY = y;
      }
      // name next to the preview: you see what you hit before clicking
      if (h.label && labelX !== null) {
        const text = (h.lock ? '🔒 ' : '') + h.label;
        const w = textW(text) + 4;
        out.push(`<rect class="hover-label-bg" x="${f(labelX - 3)}" y="${f(labelY - 7.5)}" width="${f(w)}" height="15" rx="3"/>`);
        out.push(`<text class="hover-label" x="${f(labelX)}" y="${f(labelY + 3.6)}">${esc(text)}</text>`);
      }
    }
    hov.innerHTML = onLine(s, out.join(''));
  };

  /** The drum map row under point p (staff coordinates, see RD.toLocal), or null. */
  RD.mapLineAt = function (p) {
    const rows = RD.layout && RD.layout.map;
    if (!rows || !rows.length || !p.sys || p.sys.i !== RD.layout.mapSys) return null;
    let best = null, bd = SP / 2;
    for (const r of rows) {
      if (p.x < r.x1 - 4 || p.x > r.x2 + 2) continue;
      const d = Math.abs(p.y - r.y);
      if (d < bd) {
        bd = d;
        best = r.line;
      }
    }
    return best;
  };

  // ---- PDF / print ---------------------------------------------------------------------------

  /**
   * Every page of the page view as an SVG of its own (A4) in #print-root, then the browser's print
   * dialog ("Save as PDF"). css/app.css shows only #print-root on paper, in black on white.
   */
  RD.print = function () {
    const keep = { layout: S.settings.layout, sel: S.selection, bar: S.selBar };
    S.settings.layout = 'page';
    S.selection = new Set();
    S.selBar = null;
    let html = '', pages = [];
    try {
      html = RD.content(true);
      pages = RD.layout.pages;
    } finally {
      S.settings.layout = keep.layout;
      S.selection = keep.sel;
      S.selBar = keep.bar;
      RD.draw();
    }
    let root = document.getElementById('print-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-root';
      document.body.appendChild(root);
    }
    root.innerHTML = pages.map((pg) => `<svg class="score print" xmlns="http://www.w3.org/2000/svg" ` +
      `viewBox="0 ${f(pg.y)} ${PAGE_W} ${PAGE_H}" width="210mm" height="297mm">${html}</svg>`).join('');
    const done = () => {
      root.innerHTML = '';
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    return pages.length;
  };
})(window.TC);
