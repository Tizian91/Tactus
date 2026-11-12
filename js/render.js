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
  const STEM = 3.5 * SP;
  const MIN_CELL = 2.6 * SP;     // narrowest grid cell
  const QUARTER = 7 * SP;        // width of a quarter when the grid allows
  const HEAD_OFF = 1.1 * SP;     // first note: this far right of the bar start
  const BEAM_T = 0.5 * SP, BEAM_GAP = 0.75 * SP;
  RD.LINE_MIN = -7;
  RD.LINE_MAX = 15;
  const CLEF_W = 4.2 * SP;
  const TS_W = 3.4 * SP;
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

  let svg, world, stat, hov, play;

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
  };

  /** Playback cursor at (bar, tick); null hides it. loop: [fromBar, toBar] marked while looping. */
  RD.drawCursor = function (bar, tick, loop) {
    const L = RD.layout;
    if (!L || bar === null || !L.bars[bar]) {
      play.innerHTML = '';
      return null;
    }
    const b = L.bars[bar], x = RD.tickX(b, tick);
    let s = rect(b.x, -3.5 * SP, b.w, 11 * SP, 'play-bar') + rect(x - 1, -3.5 * SP, 2, 11 * SP, 'play-cursor');
    if (loop && L.bars[loop[0]] && L.bars[loop[1]]) {
      const a = L.bars[loop[0]], z = L.bars[loop[1]];
      s += rect(a.x + 1, -4 * SP, z.x + z.w - a.x - 2, 12 * SP, 'loop-range');
    }
    play.innerHTML = s;
    return x;
  };

  // ---- Layout -------------------------------------------------------------------------

  /** Positions of all bars and the notation items of every voice. */
  RD.computeLayout = function () {
    const doc = S.doc, track = doc.tracks[0];
    const grid = TC.gridTicks(S.input);
    const bars = [];
    let x = CLEF_W;
    doc.bars.forEach((h, i) => {
      const L = TC.barTicks(h.ts);
      const showTs = i === 0 || h.ts.join('/') !== doc.bars[i - 1].ts.join('/');
      const simile = !!h.simile && i > 0; // "%": repeats the bar before, no notes of its own
      const voices = simile ? [] : track.bars[i].voices.map((v) => TC.rhythm.layout(v, h.ts, track.kind === 'drums', h.beam));
      let finest = L;
      voices.forEach((items) => items.forEach((it) => { if (!it.measure) finest = Math.min(finest, it.dur); }));
      const scale = Math.max(QUARTER / TC.TPQ, MIN_CELL / grid, (2.4 * SP) / finest);
      const tsW = showTs ? TS_W : 0;
      const x0 = x + tsW; // content start
      const w = tsW + HEAD_OFF + L * scale + 0.2 * SP;
      bars.push({ i, x, x0, w, L, ts: h.ts, beam: h.beam, simile, scale, showTs, voices });
      x += w;
    });
    RD.layout = { bars, width: x, grid, heads: [], add: { x: x + 1.5 * SP, y: 0, w: 3 * SP, h: 4 * SP } };
    return RD.layout;
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
    const L = RD.computeLayout();
    const doc = S.doc;
    const out = [];
    const top = -3.5 * SP, bottom = 7.5 * SP;

    // title, tempo
    const meta = doc.meta;
    if (meta.title) out.push(`<text class="title" x="0" y="${f(-11 * SP)}">${esc(meta.title)}</text>`);
    const sub = [meta.subtitle, meta.artist].filter(Boolean).join(' · ');
    if (sub) out.push(`<text class="subtitle" x="0" y="${f(-8.6 * SP)}">${esc(sub)}</text>`);
    out.push(`<text class="tempo" x="${f(0.4 * SP)}" y="${f(-5.6 * SP)}"><tspan class="mus-sm"></tspan> = ${esc(meta.tempo)}</text>`);

    // selected bar, selected instrument's line
    if (S.selBar !== null && L.bars[S.selBar]) {
      const b = L.bars[S.selBar];
      out.push(rect(b.x, top, b.w, bottom - top, 'bar-sel'));
    }
    const selArt = TC.drums.byId(S.input.art);
    if (selArt) out.push(rect(0, stepY(selArt.line) - SP / 4, L.width, SP / 2, 'line-band'));

    // grid
    for (const b of L.bars) {
      if (b.simile) continue;
      const beat = TC.rhythm.beatTicks(b.ts);
      const G = TC.rhythm.groupSpans(b.ts, b.beam);
      const starts = G && new Set(G.map((g) => g[0])); // odd meters: the beam groups are the strong lines
      for (let t = 0; t < b.L; t += L.grid) {
        const x = RD.tickX(b, t);
        out.push(line(x, top + SP, x, bottom - SP, (starts ? starts.has(t) : t % beat === 0) ? 'grid beat' : 'grid'));
      }
    }

    // staff
    for (let k = 0; k < 5; k++) out.push(line(0, k * SP, L.width, k * SP, 'staff'));
    out.push(glyph('', 0.9 * SP, 2 * SP)); // percussion clef
    L.bars.forEach((b, i) => {
      if (b.showTs) {
        const num = String(b.ts[0]), den = String(b.ts[1]);
        const put = (s, y) => {
          const w = s.length * 1.9 * SP;
          let x = b.x + TS_W / 2 - w / 2 + 0.05 * SP;
          for (const d of s) {
            out.push(glyph(TS_DIGIT(+d), x, y));
            x += 1.9 * SP;
          }
        };
        put(num, SP);
        put(den, 3 * SP);
      }
      const end = b.x + b.w;
      if (i === L.bars.length - 1) {
        out.push(line(end - 0.75 * SP, 0, end - 0.75 * SP, 4 * SP, 'barline'));
        out.push(rect(end - 0.5 * SP, 0, 0.5 * SP, 4 * SP, 'barline-thick'));
      } else {
        out.push(line(end, 0, end, 4 * SP, 'barline'));
      }
      out.push(`<text class="barno" x="${f(b.x + 0.25 * SP)}" y="${f(-2.9 * SP)}">${i + 1}</text>`);
    });

    // notes
    L.heads = [];
    const track = doc.tracks[0];
    for (const b of L.bars) {
      if (b.simile) {
        out.push(`<text class="mus mid" x="${f(b.x0 + (b.x + b.w - b.x0) / 2)}" y="${f(2 * SP)}"></text>`);
        continue;
      }
      const used = b.voices.map((items) => items.some((it) => it.kind === 'note'));
      b.voices.forEach((items, vi) => drawVoice(out, b, items, vi, used, track));
      drawUnder(out, b);
    }

    // "+" after the last bar
    const a = L.add;
    out.push(`<g class="add-bar">${rect(a.x, a.y, a.w, a.h, 'add-box')}` +
      `<text class="add-plus" x="${f(a.x + a.w / 2)}" y="${f(a.y + a.h / 2 + 5)}">+</text></g>`);

    stat.innerHTML = out.join('');
    RD.applyView();
    RD.drawHover();
  };

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
  function drawDrumMap(out, hl) {
    const lines = TC.drums.lines(TC.drums.mapIds());
    const rows = lines.map(([l, arts]) => {
      const abs = [];
      arts.forEach((a) => { if (!abs.includes(a.ab)) abs.push(a.ab); });
      const text = abs.join(' · ');
      const names = arts.map((a) => TC.drums.label(a)).join(', ');
      return { line: l, y: stepY(l), text, names, w: textW(text), sel: arts.some((a) => a.id === S.input.art) };
    });
    const near = rows.filter((r) => r.line % 2 === 0), far = rows.filter((r) => r.line % 2 !== 0);
    const xNear = -0.8 * SP;
    const xFar = xNear - Math.max(0, ...near.map((r) => r.w)) - 1.0 * SP;
    near.forEach((r) => { r.x2 = xNear; });
    far.forEach((r) => { r.x2 = xFar; });
    RD.layout.map = rows.map((r) => ({ line: r.line, y: r.y, x1: r.x2 - r.w, x2: 0 }));
    out.push('<g class="drummap">');
    for (const r of rows) {
      const cls = (r.sel ? ' sel' : '') + (r.line === hl ? ' hl' : '');
      out.push(`<path class="dm-lead${cls}" d="M${f(r.x2 + 0.25 * SP)},${f(r.y)} L${f(0)},${f(r.y)}"/>`);
      out.push(`<text class="dm-label${cls}" x="${f(r.x2)}" y="${f(r.y + MAP_FONT * 0.36)}"><title>${esc(r.names)}</title>${esc(r.text)}</text>`);
    }
    out.push('</g>');
  }

  // ---- Live layer: drum map, line under the pointer, preview ---------------------------------

  RD.drawHover = function () {
    const h = S.hover, L = RD.layout;
    if (!L) return;
    const out = [];
    const hl = h ? (h.mapLine !== undefined ? h.mapLine : h.line) : null;
    if (hl !== null && hl !== undefined) out.push(rect(0, stepY(hl) - SP / 4, L.width, SP / 2, 'hover-band'));
    L.map = [];
    if (S.settings.showDrumMap) drawDrumMap(out, hl);
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
    hov.innerHTML = out.join('');
  };

  /** The drum map row under world point p (its line), or null. */
  RD.mapLineAt = function (p) {
    const rows = RD.layout && RD.layout.map;
    if (!rows || !rows.length) return null;
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
})(window.TC);
