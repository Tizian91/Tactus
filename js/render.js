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
 *   #overlay (svg, the same size and view; pointer-events none - changing it does not repaint the score)
 *     #world-over  the same transform as #world
 *       .hover  preview of the note under the pointer, rebuilt by TC.render.drawHover()
 *       .play   playback cursor (TC.render.drawCursor) · .selrect  frame of the select tool
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

  let svg, world, stat, hov, play, selg, ovl, world2, dyng;
  let staffNow = null; // the staff drawVoice draws into (its heads remember the track and the staff)
  let signers = new Map(); // track -> signsAt(bar, tick) of its keyswitches (staccato dots, tremolo strokes …)
  const signsOf = (track, bi, tick) => {
    if (!track || !track.ksw || track.kind !== 'pitched' || !TC.ksw) return [];
    if (!signers.has(track)) signers.set(track, TC.ksw.signer(track));
    return signers.get(track)(bi, tick);
  };
  // SMuFL articulations (Bravura): [above, below, width in spaces]
  const ARTIC = { stacc: ['', '', 0.28], staccmo: ['', '', 0.28], ten: ['', '', 1.35], port: ['', '', 1.35] };

  RD.init = function () {
    svg = document.getElementById('score');
    world = document.getElementById('world');
    stat = world.querySelector('.static');
    // what changes while playing or pointing (cursor, note preview, selection frame) lives in a light SVG of its own over
    // the score: changing it does not make the browser paint the whole score again (slow with a fine grid or zoomed in)
    ovl = document.getElementById('overlay');
    if (!ovl) {
      const NS = 'http://www.w3.org/2000/svg';
      ovl = document.createElementNS(NS, 'svg');
      ovl.setAttribute('id', 'overlay');
      ovl.setAttribute('class', 'score overlay');
      ovl.setAttribute('aria-hidden', 'true');
      ovl.appendChild(document.createElementNS(NS, 'g')).setAttribute('id', 'world-over');
      svg.after(ovl);
    }
    world2 = ovl.querySelector('#world-over');
    const layer = (cls) => {
      let g = world2.querySelector('.' + cls) || world.querySelector('.' + cls);
      if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', cls); }
      world2.appendChild(g); // (moved over from the score, where an older page had it)
      return g;
    };
    hov = layer('hover');
    play = layer('play');
    selg = layer('selrect');
    dyng = layer('dyndrag');
  };


  /**
   * Where a dragged handle of a dynamics sign / hairpin would go (js/interaction.js): a dashed line at the place in
   * its bar, with the place written above it ({ bar, x, label }); null removes it. In the overlay: the score is not drawn again.
   */
  RD.drawDynDrag = function (m) {
    const L = RD.layout, b = m && L && L.bars[m.bar];
    if (!b) return void (dyng.innerHTML = '');
    const s = L.systems[b.sys], hh = L.stackH + 7 * SP;
    dyng.innerHTML = onLine(s, line(m.x, -3.5 * SP, m.x, -3.5 * SP + hh, 'dyn-drag') +
      `<text class="dyn-drag-label" x="${f(m.x + 4)}" y="${f(-4 * SP)}">${esc(m.label)}</text>`);
  };
  /**
   * The places a dynamics sign or hairpin end can be dragged to in a track: every note and rest (their start and end, any
   * voice) and every bar start / end - [{ bar, t, abs, x, end }] (end: the end of a bar, drawn before its bar line).
   */
  RD.dynSnaps = function (track) {
    const L = RD.layout, at = TC.score.tickOf(S.doc), out = [];
    if (!L || !track) return out;
    for (const b of L.bars) {
      if (b.hidden !== undefined) continue;
      const ticks = new Set([0]);
      (track.bars[b.i] ? track.bars[b.i].voices : []).forEach((v) => v.forEach((ev) => {
        if (ev.tick < b.L) ticks.add(ev.tick);
        if (ev.tick + ev.dur < b.L) ticks.add(ev.tick + ev.dur);
      }));
      ticks.forEach((t) => out.push({ bar: b.i, t, abs: at(b.i, t), x: RD.tickX(b, t) }));
      out.push({ bar: b.i, t: b.L, abs: at(b.i, b.L), x: b.x + b.w - 0.6 * SP, end: true });
    }
    return out;
  };
  /** Selection frame (select tool) in view coordinates { x1, y1, x2, y2 }; null removes it. */
  RD.drawRect = function (r) {
    if (!r) return void (selg.innerHTML = '');
    const x = Math.min(r.x1, r.x2), y = Math.min(r.y1, r.y2);
    selg.innerHTML = rect(x, y, Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1), 'sel-frame');
  };

  /** The drawn noteheads with their position in view coordinates (all lines of the page view, all staves). */
  RD.headsInView = function () {
    const L = RD.layout;
    if (!L) return [];
    return L.heads.map((h) => {
      const s = L.systems[L.bars[h.bar].sys];
      return Object.assign({}, h, { wx: h.x + s.tx, wy: h.y + (h.dy || 0) + s.ty });
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
      if (cursor.key !== null) play.innerHTML = '';
      cursor.key = null;
      return null;
    }
    const b = L.bars[bar], s = L.systems[b.sys], x = RD.tickX(b, tick), hh = L.stackH + 7 * SP; // over all staves
    // the bar and the loop frame are built only when the cursor comes into another bar (or the drawing / loop changed);
    // each frame only the thin cursor line moves - rebuilding them every frame made the browser paint the whole loop
    // range again and again (slow when zoomed in)
    const key = bar + '|' + (loop ? loop.join('-') : '');
    if (key !== cursor.key || L !== cursor.layout) {
      let html = onLine(s, rect(b.x, -3.5 * SP, b.w, hh, 'play-bar') + rect(x - 1, -3.5 * SP, 2, hh, 'play-cursor'));
      if (loop && L.bars[loop[0]] && L.bars[loop[1]]) {
        const a = L.bars[loop[0]], z = L.bars[loop[1]];
        for (let k = a.sys; k <= z.sys; k++) {
          const sy = L.systems[k];
          const x1 = k === a.sys ? a.x : L.bars[sy.first].x, x2 = k === z.sys ? z.x + z.w : sy.end;
          html += onLine(sy, rect(x1 + 1, -4 * SP, x2 - x1 - 2, hh + SP, 'loop-range'));
        }
      }
      play.innerHTML = html;
      Object.assign(cursor, { key, layout: L, el: play.querySelector('.play-cursor') });
    } else if (cursor.el) cursor.el.setAttribute('x', f(x - 1));
    return { x: x + s.tx, y: s.ty };
  };
  const cursor = { key: null, layout: null, el: null }; // (what drawCursor built: bar, loop, the drawing it was for)
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
  const CHORD_Y = -4.4 * SP;      // chord symbols (higher above high notes)
  const SYS_GAP = 30 * SP;        // staff coordinates between two lines

  RD.isPage = () => S.settings.layout === 'page';
  /** Name of a swing amount (%), as written above the first bar. */
  RD.swingName = (a) => (a < 60 ? 'Light swing' : a < 65 ? 'Swing' : a < 71 ? 'Shuffle' : 'Hard shuffle');

  /** Does a bar (of one track: b.parts[k]) write sticking under the staff? */
  const hasSticking = (p) => p.voices.some((items) => items.some((it) => it.kind === 'note' && it.ev.notes.some((n) => n.stick)));

  // Several tracks: one staff each, under each other in every line ("system"), sharing the bar lines.
  // A staff k is drawn at translate(0, dy) inside its line; its notes keep staff coordinates (y from
  // its own top line), so RD.toLocal() also says which staff a point is on.
  const STAFF_ABOVE = 5 * SP;     // room above a staff under another one (notes and accents above it)
  const staffBelow = (under) => (under ? 12.4 : 8.4) * SP; // … below a staff (with sticking / counting)
  /** Room below staff z: its lyrics (then the counting under them), else staffBelow. */
  const belowOf = (z, under) => (z.lyrRows ? Math.max(staffBelow(under), lyrEnd(z) + (under ? 3.4 : 1.6) * SP) : staffBelow(under));
  /** The tracks with a staff: every shown one (the one being written always). */
  RD.shownTracks = (doc) => doc.tracks.filter((t) => !t.hidden || TC.score.handsOf(doc, t).includes(TC.curTrack()));
  /** The piano brace { (left of the staves of one piano), from y0 to y1 (staff coordinates), its right edge at x. */
  function brace(x, y0, y1) {
    const h = y1 - y0, w = 1.1 * SP, m = y0 + h / 2, P = (a, b) => `${f(a)},${f(b)}`;
    return `<path class="brace" d="M${P(x, y0)} C${P(x - w * 1.15, y0 + h * 0.06)} ${P(x + w * 0.15, y0 + h * 0.44)} ${P(x - w, m)}` +
      ` C${P(x + w * 0.15, y0 + h * 0.56)} ${P(x - w * 1.15, y0 + h * 0.94)} ${P(x, y1)}` +
      ` C${P(x - w * 0.75, y0 + h * 0.93)} ${P(x + w * 0.45, y0 + h * 0.56)} ${P(x - w, m)}` +
      ` C${P(x + w * 0.45, y0 + h * 0.44)} ${P(x - w * 0.75, y0 + h * 0.07)} ${P(x, y0)}Z"/>`;
  }
  /** The staff after z if it is the lower staff (left hand) of z's piano, else null. */
  const lowerOf = (L, z) => { const n = L.staves[z.k + 1]; return n && n.track.lh && !z.track.lh ? n : null; };
  /** The staves of the shown tracks (bars: their parts in the same order). */
  function staves(tracks, bars) {
    // the space between two staves (below the one, above the next): ⚙ → Page, % of the standard
    const gap = ((S.doc.page && S.doc.page.staffGap) || 80) / 100;
    let dy = 0;
    return tracks.map((track, k) => {
      const under = !!S.doc.page.counts || bars.some((b) => hasSticking(b.parts[k]));
      const z = { k, track, dy, one: TC.drums.oneLine(track) };
      // melody: the rows of the lyrics (a verse each; the one being typed counts), under the lowest note of the track
      if (track.kind === 'pitched') {
        const ed = S.lyricEdit && S.lyricEdit.track === track.id ? S.lyricEdit.v + 1 : 0;
        z.lyrRows = RD.lyricsShown(track) ? Math.max(TC.score.lyricVerses(track), ed) : 0;
        z.lyrY = LYR_Y;
        if (z.lyrRows) bars.forEach((b) => z.lyrY = Math.max(z.lyrY, lowestInk(b.parts[k]) + 1.5 * SP));
      }
      z.below = belowOf(z, under);
      // keyswitches (ways of playing: P.M., dead …): a row right under the staff, under its lowest note (as between the
      // staff and the tab of a guitar part) - the lyrics and the dynamics below it
      // (only those with a text: staccato, tremolo … are signs at the notes)
      if (track.ksw && !track.lh && TC.ksw && track.bars.some((b) => (b.ks || []).some((m) => TC.ksw.markText(TC.ksw.keyOf(track, m.k))))) {
        z.ksY = Math.max(6.0 * SP, ...bars.map((b) => lowestInk(b.parts[k]) + 1.6 * SP));
        // a row per group of ways of playing (muting, picking …), then one for slides / stops / release - only the rows
        // used, in the order of the profile: they do not cover each other (nor their lines)
        const rowOf = (x) => (x.kind === 'art' ? 'g:' + (x.group || '') : x.kind === 'once' || x.kind === 'event' ? 'once' : null);
        const used = new Set();
        track.bars.forEach((b) => (b.ks || []).forEach((m) => { const x = TC.ksw.keyOf(track, m.k); if (x && rowOf(x) && TC.ksw.markText(x)) used.add(rowOf(x)); }));
        const rows = [];
        track.ksw.keys.forEach((x) => { const r = rowOf(x); if (r && used.has(r) && !rows.includes(r)) rows.push(r); });
        z.ksRow = new Map(rows.map((r, n) => [r, z.ksY + n * 1.5 * SP]));
        z.ksRowOf = (x) => z.ksRow.get(rowOf(x)) || z.ksY;
        z.ksY2 = z.ksY + Math.max(0, rows.length - 1) * 1.5 * SP; // (the lowest row)
        if (z.lyrRows) z.lyrY = Math.max(z.lyrY, z.ksY2 + 2.2 * SP);
        z.below = Math.max(belowOf(z, under), z.ksY2 + 1.4 * SP);
      }
      // dynamics (ppp … fff, hairpins): a row under the staff - drums between the stems and the counting, a melody
      // under its lowest note or under its lyrics (a piano: once, under the right hand - its left hand has the same)
      if (!track.lh && track.bars.some((b) => b.dyn)) {
        const low = track.kind === 'pitched' ? Math.max(6.8 * SP, ...bars.map((b) => lowestInk(b.parts[k]) + 2.2 * SP)) : 9.6 * SP;
        z.dynY = z.lyrRows ? lyrEnd(z) + 2.4 * SP : z.ksY !== undefined ? Math.max(low, z.ksY2 + 2.4 * SP) : low;
        z.below = Math.max(z.below, z.dynY + 1.6 * SP + (under && track.kind === 'pitched' ? 3.4 * SP : 0));
      }
      dy += 4 * SP + (z.below + STAFF_ABOVE) * gap;
      return z;
    });
  }
  /** The lowest ink of a melody bar (heads, stems of voice 2 pointing down), for the row of the lyrics. */
  function lowestInk(p) {
    let y = 0;
    if (!p.pitch) return y;
    p.voices.forEach((items, vi) => items.forEach((it) => {
      if (it.kind !== 'note') return;
      it.ev.notes.forEach((n) => {
        const sp = p.pitch.spell.get(n.id), l = sp ? sp.line : 4;
        y = Math.max(y, stepY(l) + 0.6 * SP, vi % 2 ? stepY(l) + STEM : 0);
      });
    }));
    return y;
  }

  // ---- Lyrics: under a melody staff, a row per verse, a syllable centred under its note
  /** Lyrics of a melody track drawn: the switch of the score (page.lyrics), and always while they are being typed. */
  RD.lyricsShown = (track) => (S.doc.page && S.doc.page.lyrics !== false) || !!(S.lyricEdit && S.lyricEdit.track === track.id);
  const LYR_Y = 8.0 * SP;   // baseline of the first verse (lower under low notes)
  const LYR_DY = 2.1 * SP;  // from verse to verse
  const LYR_FONT = '14px "Segoe UI", system-ui, -apple-system, sans-serif'; // (as .score .lyric in css/app.css)
  /** Baseline of the last verse of staff z. */
  const lyrEnd = (z) => z.lyrY + (z.lyrRows - 1) * LYR_DY;
  let measure = null;
  const widths = new Map();
  /** Width of a syllable as drawn (measured once; without a canvas, e.g. in the tests: estimated). */
  const lyrW = (RD.lyricWidth = function (text) {
    if (widths.has(text)) return widths.get(text);
    if (measure === null) {
      try {
        measure = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas').getContext('2d') : false;
        if (measure) measure.font = LYR_FONT;
      } catch (e) {
        measure = false;
      }
    }
    const w = measure ? measure.measureText(text).width : text.length * 7.6;
    widths.set(text, w);
    return w;
  });
  /**
   * The syllables of a bar of a melody track (lyricInfo: SC.lyricInfo of the track): the scale the bar needs so they
   * do not run into each other (and the last one stays inside the bar), and the room before the first one (`lead`, in
   * world units at that scale).
   */
  function lyricRoom(info, track, i, L) {
    const verses = new Map();
    (track.bars[i].voices[0] || []).forEach((ev) => (info.get(ev) || []).forEach((y) => {
      if (!verses.has(y.v)) verses.set(y.v, []);
      verses.get(y.v).push({ t: ev.tick, w: lyrW(y.text), hy: y.hyphen });
    }));
    let scale = 0;
    const firsts = [];
    for (const list of verses.values()) {
      list.sort((a, c) => a.t - c.t);
      list.forEach((a, k) => {
        const c = list[k + 1];
        if (c && c.t > a.t) scale = Math.max(scale, ((a.w + c.w) / 2 + (a.hy ? 1.6 : 0.8) * SP) / (c.t - a.t));
        if (!c && L > a.t) scale = Math.max(scale, (a.w / 2 + (a.hy ? 0.6 : 0.2) * SP) / (L - a.t));
      });
      if (list.length) firsts.push(list[0]);
    }
    return { scale, lead: (sc) => Math.max(0, ...firsts.map((a) => a.w / 2 + 0.3 * SP - HEAD_OFF - a.t * sc)) };
  }
  /** Where the syllable of event ev (bar, verse v) of a track is drawn: { x, y } in the view (centre, baseline), or null. */
  RD.lyricPos = function (track, bar, ev, v) {
    const L = RD.layout, b = L && L.bars[bar], z = L && L.staves.find((q) => q.track === track);
    if (!b || !z || z.lyrY === undefined) return null;
    const s = L.systems[b.sys];
    return { x: RD.tickX(b, ev.tick) + s.tx, y: s.ty + z.dy + z.lyrY + v * LYR_DY, zoomed: LYR_DY };
  };
  /**
   * A point of the view (world units) in the lyrics of a melody staff that has some: the note there { track, bar, ev, v }
   * (the syllable under the point, else the nearest note of voice 1 in that bar), or null.
   */
  RD.lyricAt = function (p) {
    const L = RD.layout, q = L && RD.toLocal(p);
    if (!q || !q.staff || !q.staff.lyrRows) return null;
    const z = q.staff, y = q.y - z.lyrY; // (from the baseline of the first verse)
    if (y < -1.2 * SP || y > (z.lyrRows - 1) * LYR_DY + 0.8 * SP) return null;
    const v = TC.clamp(Math.round((y + 0.4 * SP) / LYR_DY), 0, z.lyrRows - 1);
    const b = RD.barAt(q.x);
    if (!b || b.hidden !== undefined || b.parts[z.k].simile) return null;
    const slots = TC.score.lyricSlots(S.doc, z.track).filter((s) => s.bar === b.i);
    let best = null, bd = Infinity;
    for (const s of slots) {
      const d = Math.abs(RD.tickX(b, s.ev.tick) - q.x);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best && bd < 4 * SP ? { track: z.track, bar: b.i, ev: best.ev, v } : null;
  };
  /** Is bar b a %-bar in a track (default: the one being written)? */
  RD.simileAt = (b, track) => {
    const p = track && b.parts ? b.parts.find((q) => q.track === track) : null;
    return p ? p.simile : !!b.simile;
  };

  /** Height of the title block on the first page. */
  function headerHeight(meta) {
    let h = 0;
    if (meta.title) h += 3.4 * SP;
    if (meta.subtitle) h += 2.4 * SP;
    if (meta.artist) h += 2.2 * SP;
    return h ? h + 1.5 * SP : 0;
  }

  // ---- Melody staves (js/pitch.js): clef, key signature, accidentals
  const ACC_ROOM = 1.3 * SP;  // room for an accidental before a note on beat 1
  const KEY_ACC = 1.0 * SP;   // one sharp / flat of a key signature
  const ACC_GLYPH = { 2: '', 1: '', 0: '', '-1': '', '-2': '' };
  const ACC_W = { 2: 1.0, 1: 1.0, 0: 0.68, '-1': 0.9, '-2': 1.65 };
  /**
   * The signs of a key signature in the order they are written: [{ l, a }] (a = 0: a natural). A change
   * to C major or from sharps to flats first cancels the old ones with naturals.
   */
  RD.keySigns = function (to, from = 0) {
    const P = TC.pitch, out = [];
    if (from && (to === 0 || Math.sign(to) !== Math.sign(from))) P.signature(from).forEach((x) => out.push({ l: x.l, a: 0 }));
    return out.concat(P.signature(to));
  };
  /** Width of a key signature { to, from }. */
  const keyWidth = (c) => {
    const n = RD.keySigns(c.to, c.from || 0).length;
    return n ? n * KEY_ACC + 1.2 * SP : 0;
  };
  /** Staff step of a key signature sign: sharps F C G D A E B, flats B E A D G C F at their usual places. */
  const SIG_LINE = { 1: [0, 3, -1, 2, 5, 1, 4], '-1': [4, 1, 5, 2, 6, 3, 7] }; // treble, in the order of P.signature
  function keySigLine(l, sharps, clef) {
    const order = sharps ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3];
    return SIG_LINE[sharps ? 1 : -1][order.indexOf(l)] + (clef === 'bass' || clef === 'bass8' ? 2 : 0);
  }
  /** Key signature { to, from } as SVG, starting at x (naturals stand where the old signs stood). */
  function drawKey(out, x, c, clef) {
    RD.keySigns(c.to, c.from || 0).forEach((s, k) => {
      const ln = keySigLine(s.l, s.a === 0 ? c.from > 0 : s.a > 0, clef);
      out.push(glyph(ACC_GLYPH[s.a], x + k * KEY_ACC, stepY(ln)));
    });
  }

  /**
   * A melody track in bar i: its scale and key signature (change: a new one from this bar), how each
   * note is spelled (spell: note id -> { dia, a, line }) and which notes need an accidental
   * (acc: "tick:note id" -> sign, js/pitch.js P.accidentals).
   */
  function pitchInfo(doc, track, i, voices) {
    const P = TC.pitch, SC = TC.score, scale = SC.scaleAt(track, i);
    // ties: the notes tied on from before (no sign again), and where a tie from a note goes (also into the next bar)
    const tiesIn = new Set(), tiesOut = new Map();
    if (!track.bars[i].simile) {
      track.bars[i].voices.forEach((v, vi) => v.forEach((ev) => ev.notes.forEach((n) => {
        if (SC.tiedFrom(doc, track, i, vi, ev, n)) tiesIn.add(n.id);
        const to = SC.tiedTo(doc, track, i, vi, ev, n);
        if (to) tiesOut.set(n.id, { bar: to.bar, tick: to.ev.tick });
      })));
    }
    const list = [];
    voices.forEach((items) => items.forEach((it) => {
      if (it.kind === 'note') it.ev.notes.forEach((n) => list.push({ tick: it.tick, cont: it.cont || (it.tick === it.ev.tick && tiesIn.has(n.id)), n }));
    }));
    const { spell, acc, fifths } = P.spellBar(list, scale, track.clef);
    const prev = i > 0 ? P.fifths(SC.scaleAt(track, i - 1)) : fifths;
    return { scale, fifths, change: fifths !== prev ? { from: prev, to: fifths } : null, spell, acc, tiesIn, tiesOut,
      accAt0: list.some(({ tick, n }) => tick === 0 && acc.has('0:' + n.id)) };
  }

  const MULTI_W = 13 * SP; // width of a multi-bar rest (before the line is justified)
  const SIMILE_W = 5 * SP; // width of a narrow, counted %-bar

  /**
   * Multi-bar rests: runs of at least two bars without a note in any shown track, as [first bar, count].
   * The first bar may start with a time signature, tempo, text, |: or a new line; a bar with any of
   * those (or an ending, :|, %) inside the run ends it, as in printed parts.
   */
  RD.multiRests = function (doc, bars, simile = false) {
    const plain = (i) => !doc.bars[i].volta && !(doc.bars[i].repeatEnd > 1) && !doc.bars[i].end && !doc.bars[i].jump;
    // simile: runs of %-bars instead (one % with the number of bars above)
    const fits = simile ? (i) => i > 0 && bars[i].parts.every((p) => p.simile) && plain(i) // % in every shown track
      : (i) => plain(i) && bars[i].parts.every(({ track: t }) => !t.bars[i].simile && t.bars[i].voices.every((v) => v.every((ev) => !ev.notes.length)));
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
  /**
   * The scale written above the music (key signatures do not tell most of them): at bar 1 for every melody staff, and
   * where a melody track changes its scale ("d-Moll"; several melody staves: "Vocals: d-Moll · Bass: D-Dorisch").
   */
  function scaleText(doc, parts, i) {
    if (doc.page.scaleNames === false || !TC.pitch) return '';
    const mel = parts.filter((p) => p.pitch && !p.track.lh), de = TC.getLang && TC.getLang() === 'de', P = TC.pitch;
    const out = [];
    mel.forEach((p) => {
      const sc = p.pitch.scale, prev = i > 0 ? TC.score.scaleAt(p.track, i - 1) : null;
      if (prev && prev.l === sc.l && prev.a === sc.a && prev.id === sc.id) return;
      const name = P.scaleTitle(sc, de);
      if (name) out.push({ track: p.track.name, name });
    });
    // (several melody tracks in the same scale: it once; else each with its track's name)
    if (out.length > 1 && out.every((x) => x.name === out[0].name) && out.length === mel.length) return out[0].name;
    return out.map((x) => (mel.length > 1 ? `${x.track}: ${x.name}` : x.name)).join(' · ');
  }

  RD.computeLayout = function () {
    const doc = S.doc, cur = TC.curTrack(), page = RD.isPage(), MARGIN = margin();
    const grid = TC.gridTicks(S.input);
    const tracks = RD.shownTracks(doc);
    // lyrics of the melody tracks (js/model.js SC.lyricInfo): syllables, hyphens, melisma lines
    const lyrInfo = new Map(tracks.filter((t) => RD.lyricsShown(t) && TC.score.lyricVerses(t)).map((t) => [t, TC.score.lyricInfo(doc, t)]));
    const bars = doc.bars.map((h, i) => {
      const L = TC.barTicks(h.ts);
      const showTs = i === 0 || h.ts.join('/') !== doc.bars[i - 1].ts.join('/');
      // every shown track: its notes in this bar, or "%" (repeats its bar before, no notes of its own)
      const parts = tracks.map((track) => {
        const simile = !!track.bars[i].simile && i > 0;
        const voices = simile ? [] : track.bars[i].voices.map((v) => TC.rhythm.layout(v, h.ts, track.kind === 'drums', h.beam, track.fill));
        return { track, simile, voices, pitch: track.kind === 'pitched' ? pitchInfo(doc, track, i, voices) : null };
      });
      let finest = L;
      parts.forEach((p) => p.voices.forEach((items) => items.forEach((it) => { if (!it.measure) finest = Math.min(finest, it.dur); })));
      // endless: a finer click grid widens the bar; page: the notes alone decide (as printed)
      let scale = page ? Math.max(PAGE_QUARTER / TC.TPQ, PAGE_NOTE / finest) : Math.max(QUARTER / TC.TPQ, MIN_CELL / grid, (2.4 * SP) / finest);
      // lyrics: wide enough that the syllables do not run into each other; room before the first one
      const rooms = parts.filter((p) => !p.simile && lyrInfo.has(p.track)).map((p) => lyricRoom(lyrInfo.get(p.track), p.track, i, L));
      rooms.forEach((r) => { scale = Math.max(scale, r.scale); });
      const lyrLead = Math.max(0, ...rooms.map((r) => r.lead(scale)));
      // (an ending going back without a :| of its own - a later ending waits: drawn with :|, js/model.js SC.endingGoesBack)
      const rs = !!h.repeatStart, re = h.repeatEnd > 1 ? h.repeatEnd : TC.score.endingGoesBack(doc, i) ? 2 : 0;
      const own = parts.find((p) => p.track === cur) || parts[0];
      // melody staves: a new key signature at this bar (the width of the widest), an accidental on beat 1
      const ksW = i > 0 ? Math.max(0, ...parts.map((p) => (p.pitch && p.pitch.change ? keyWidth(p.pitch.change) : 0))) : 0;
      const accW = parts.some((p) => p.pitch && p.pitch.accAt0) ? ACC_ROOM : 0;
      // simile / voices: of the track being written; allSimile: "%" in every staff (one % with a number)
      return { i, L, ts: h.ts, beam: h.beam, simile: own.simile, allSimile: parts.every((p) => p.simile), parts, scale, showTs, rs, re, volta: h.volta || null,
        ksW, accW, tsW: (showTs ? TS_W : 0) + (rs ? REP_W : 0) + ksW + Math.max(accW, lyrLead), voices: own.voices, marker: h.marker || '', mark: h.mark || '', end: h.end || '', jump: h.jump || '',
        chords: TC.pitch ? TC.score.chordsIn(doc, i) : [], scaleText: scaleText(doc, parts, i) };
    });
    const sv = staves(tracks, bars), lastSv = sv[sv.length - 1];
    const stackH = lastSv.dy + 4 * SP; // top line of the first staff to the bottom line of the last one
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
        if (!b.allSimile) return;
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
    // melody staves: every line starts with the key signature (after the clef); a change at the start of a line is drawn there
    const lineKey = (b) => Math.max(0, ...b.parts.map((p) => (p.pitch ? keyWidth({ to: p.pitch.fifths }) : 0)));
    const atLineStart = (b) => {
      b.tsW -= b.ksW;
      b.ksW = 0;
    };
    const lines = [];
    if (!page) {
      lines.push(bars);
      atLineStart(bars[0]);
    } else {
      const keyMax = Math.max(0, ...bars.map(lineKey));
      const avail = PAGE_W - 2 * MARGIN - CLEF_W - keyMax, per = doc.page.barsPerLine;
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
      lines.forEach((ln) => atLineStart(ln[0]));
      // justify: the notes spread over the whole line; the last line is not stretched more than the one before
      let prev = null;
      lines.forEach((ln, k) => {
        // (counted %-bars keep their narrow width)
        const fx = ln.reduce((a, b) => a + fixed(b) + (b.simileN ? b.L * b.scale : 0), 0), mv = ln.reduce((a, b) => a + (b.simileN ? 0 : b.L * b.scale), 0);
        if (!mv) return;
        let k2 = (avail + keyMax - lineKey(ln[0]) - fx) / mv;
        // the last line, and a line ended by a forced break (new line, coda), is not stretched more than the one before
        const nx = lines[k + 1] && doc.bars[lines[k + 1][0].i], forced = nx && (nx.lineBreak || nx.mark === 'coda');
        if ((k === lines.length - 1 || forced) && k2 > 1) k2 = Math.min(k2, prev || (fx + mv > 0.7 * avail ? k2 : 1));
        ln.forEach((b) => { if (!b.simileN) b.scale *= k2; });
        prev = k2;
      });
    }

    // positions
    const systems = [], pages = [];
    let ux = 0, yRel = MARGIN + headerHeight(doc.meta), pageNo = 0;
    if (page) pages.push({ y: 0 });
    lines.forEach((ln, k) => {
      const s = { i: k, ox: ux, first: ln[0].i, last: ln[ln.length - 1].i, keyW: lineKey(ln[0]) };
      ux += CLEF_W + s.keyW;
      for (const b of ln) {
        b.sys = k;
        b.x = ux;
        b.x0 = ux + b.tsW; // content start
        b.w = width(b);
        ux += b.w;
      }
      s.end = ux;
      if (page) {
        const text = k === 0 || ln.some((b) => b.marker || b.tempo || b.mark || b.end || b.jump || b.scaleText); // the first line carries the tempo
        const under = S.doc.page.counts || ln.some((b) => hasSticking(b.parts[lastSv.k])); // (of the lowest staff)
        // the space between two lines (above the first staff, below the last one): ⚙ → Page, % of the basic space
        const lg = (doc.page.lineGap || 100) / 100;
        s.above = ((text ? 9.8 : 7.2) + (ln.some((b) => b.chords.length) ? 2.2 : 0)) * SP * lg; // (chord symbols: a row more)
        if (k === 0) s.above = Math.max(s.above, 9.8 * SP); // (the first line: room for the tempo under the title)
        s.below = belowOf(lastSv, under) * lg;
        const h = s.above + stackH + s.below;
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
      bars, systems, pages, page, grid, margin: MARGIN, heads: [], lyrInfo, map: [], mapSys: 0, mapTrack: null, staves: sv, stackH,
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
      const d = ly < -s.above ? -s.above - ly : ly > L.stackH + s.below ? ly - L.stackH - s.below : 0;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best || bd > 2 * SP) return null;
    // the staff: the last one whose top (with the room for notes above it) is above the point
    const ly = p.y - best.ty;
    let st = L.staves[0];
    // (close staves: the gap between them is shared half and half)
    L.staves.forEach((z, k) => { if (k && ly >= z.dy - Math.min(4.2 * SP, (z.dy - L.staves[k - 1].dy - 4 * SP) / 2)) st = z; });
    return { x: p.x - best.tx, y: ly - st.dy, sys: best, staff: st, track: st.track };
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

  /** The drawn notehead nearest to a point in staff coordinates (within reach, on the staff of p.track), or null. */
  RD.headAt = function (p, reach) {
    // reach: { rx, ry } - how far from a head (world units) it is still hit; default for mouse and pen
    const rx = reach ? reach.rx : 0.85 * SP / 0.8, ry = reach ? reach.ry : 0.85 * SP;
    let best = null, bd = 1;
    for (const h of RD.layout ? RD.layout.heads : []) {
      if (p.track && h.track !== p.track) continue;
      const d = Math.hypot((p.x - h.x) / rx, (p.y - h.y) / ry); // < 1: inside the ellipse
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  };
  /**
   * The reach of a finger on a head at point p (staff coordinates): wider than with a mouse - sideways about
   * 26 px on the screen, but never more than half a grid cell (the next place stays free to write); up / down
   * a little more, but under two lines (a third above a note can still be added as a chord).
   */
  RD.fingerReach = function (p) {
    const zoom = (S.doc.view && S.doc.view.zoom) || 1, b = RD.layout && RD.barAt(p.x);
    const cell = b ? RD.layout.grid * b.scale : 3 * SP;
    return { rx: Math.max(0.85 * SP / 0.8, Math.min(26 / zoom, cell / 2)), ry: Math.max(0.85 * SP, Math.min(16 / zoom, 0.95 * SP)) };
  };

  // ---- Drawing --------------------------------------------------------------------------

  // ---- Moving the view -------------------------------------------------------------------
  // #score is one picture the browser keeps as a layer of its own (will-change: transform), larger than the
  // viewport by a margin all around. Panning, pinching, scrolling and the gliding view only move and scale that
  // layer (a CSS transform: nothing is drawn again - smooth also on slow tablets). The picture is drawn for the new
  // place (the SVG transform of #world) once the movement rests, or when it went beyond the margin.
  let shown = null, settle = 0;

  /** Draw the view where S.doc.view says (at once). */
  RD.applyView = function () {
    clearTimeout(settle);
    const v = S.doc.view, vp = svg.parentElement, w = vp.clientWidth, h = vp.clientHeight;
    const mx = Math.min(1600, w), my = Math.min(1600, h);
    if (!shown || shown.w !== w || shown.h !== h) {
      for (const el of [svg, ovl]) {
        el.style.left = -mx + 'px';
        el.style.top = -my + 'px';
        el.style.width = w + 2 * mx + 'px';
        el.style.height = h + 2 * my + 'px';
      }
    }
    const tf = `translate(${f(v.x + mx)},${f(v.y + my)}) scale(${v.zoom})`;
    world.setAttribute('transform', tf);
    world2.setAttribute('transform', tf);
    svg.style.transform = ovl.style.transform = '';
    shown = { x: v.x, y: v.y, zoom: v.zoom, w, h, mx, my };
    if (TC.lyrics && TC.lyrics.isOpen()) TC.lyrics.place(false); // (the field typing lyrics stays under its note)
  };

  /**
   * The view is being moved (finger, mouse wheel, pinch, gliding cursor): move the picture as it is; it is
   * drawn anew when nothing moved for a moment, or when the visible part would leave it.
   */
  RD.moveView = function () {
    const v = S.doc.view, vp = svg.parentElement, w = vp.clientWidth, h = vp.clientHeight, c = shown;
    if (!c || c.w !== w || c.h !== h) return RD.applyView();
    const k = v.zoom / c.zoom;
    const tx = v.x + c.mx - k * (c.mx + c.x), ty = v.y + c.my - k * (c.my + c.y);
    // the visible part, in the picture: it must lie inside it
    const x0 = (c.mx - tx) / k, x1 = (w + c.mx - tx) / k, y0 = (c.my - ty) / k, y1 = (h + c.my - ty) / k;
    if (k < 0.6 || k > 1.6 || x0 < 0 || y0 < 0 || x1 > w + 2 * c.mx || y1 > h + 2 * c.my) return RD.applyView();
    svg.style.transform = ovl.style.transform = k === 1 ? `translate(${f(tx)}px,${f(ty)}px)` : `translate(${f(tx)}px,${f(ty)}px) scale(${k})`;
    // held by the middle button / a finger: a pause does not draw it anew (each drawing is a jolt, the longer the
    // nearer it is zoomed in) - only leaving the picture does, or letting go (RD.settleView)
    if (TC.interaction && TC.interaction.holdingView && TC.interaction.holdingView()) return void clearTimeout(settle);
    RD.settleView();
  };
  /** Draw the view anew once it has rested for a moment (after moving it). */
  RD.settleView = function () {
    clearTimeout(settle);
    settle = setTimeout(RD.applyView, 200);
  };

  RD.draw = function () {
    stat.innerHTML = RD.content(false, document.body.classList.contains('perform')); // (stage view: as printed, on its pages)
    RD.applyView();
    RD.drawHover();
  };

  const TEMPO_W = 7.5 * SP; // room of "♩ = 120" before the text of bar 1

  /** The score as SVG markup (view coordinates). print: without grid, selection, page shadows and the "+" box. */
  RD.content = function (print, stage) {
    const plain = print || stage; // no grid, selection, "+" box (stage view: as printed, but on its pages)
    const L = RD.computeLayout();
    const doc = S.doc, page = L.page;
    const out = [];
    signers = new Map(); // (the signs of the ways of playing at the notes: worked out once per drawing)
    const lines = L.systems.map(() => []); // markup of each line, in staff coordinates (of the first staff)
    const O = (b) => lines[b.sys];
    // … and of each staff of each line, in its own staff coordinates (drawn at translate(0, dy))
    const staffOut = L.systems.map(() => L.staves.map(() => []));
    const OS = (b, z) => staffOut[b.sys][z.k];
    const top = -3.5 * SP, bottom = 7.5 * SP;
    const cur = TC.curTrack(), many = L.staves.length > 1;

    // pages, title, tempo
    const meta = doc.meta;
    const MARGIN = L.margin;
    if (page) {
      const n = L.pages.length;
      L.pages.forEach((pg, k) => {
        if (!print) out.push(rect(1.5, pg.y + 3, PAGE_W, PAGE_H, 'page-shadow'), rect(0, pg.y, PAGE_W, PAGE_H, 'page'));
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
    const R = !plain && TC.barRange();
    if (R) {
      for (let i = R[0]; i <= R[1]; i++) {
        const b = L.bars[i];
        if (b) O(b).push(rect(b.x, top, b.w, L.stackH - 4 * SP + bottom - top, 'bar-sel'));
      }
    }
    // repeats found (panel "Find repeats"): sections that come again - the first time framed, the copies filled,
    // two colours taking turns; bars like the one before: filled in their staff, with "=" and the bar they repeat
    if (!plain && S.analyze && TC.actions.found) {
      const fd = TC.actions.found();
      fd.sections.forEach((sc, k) => {
        for (let i = sc.from; i < sc.from + sc.len * sc.times; i++) {
          const b = L.bars[i];
          if (!b || b.hidden !== undefined) continue;
          const first = i < sc.from + sc.len;
          O(b).push(rect(b.x + 1, top + 0.6 * SP, b.w - 2, L.stackH - 4 * SP + bottom - top - 0.6 * SP, `ana-sec c${k % 2}${first ? ' first' : ''}`));
          if ((i - sc.from) % sc.len === 0) {
            const pass = Math.floor((i - sc.from) / sc.len) + 1;
            O(b).push(`<text class="ana-label c${k % 2}" x="${f(b.x + 0.4 * SP)}" y="${f(top + 0.4 * SP)}">${pass === 1 ? esc(TC.tr('{n} bars', { n: sc.len })) + ' ' : ''}${pass}/${sc.times}</text>`);
          }
        }
      });
      fd.simile.forEach((r) => {
        const z = L.staves.find((q) => q.track === r.track);
        if (!z) return;
        r.bars.forEach((i) => {
          const b = L.bars[i];
          if (!b || b.hidden !== undefined) return;
          OS(b, z).push(rect(b.x + 1, -1.2 * SP, b.w - 2, 6.4 * SP, 'ana-sim') +
            `<text class="ana-label sim" x="${f(b.x + b.w - 0.4 * SP)}" y="${f(-1.5 * SP)}">= ${r.from + 1}</text>`);
        });
      });
    }
    // the line of the selected instrument, in the staff being written
    const selArt = TC.drums.byId(S.input.art), cz = L.staves.find((z) => z.track === cur);
    if (!plain && selArt && cz && cur.kind === 'drums' && TC.drums.clickable(cur).has(selArt.id)) {
      const y = cz.dy + stepY(TC.drums.lineOf(selArt, cur));
      L.systems.forEach((s) => lines[s.i].push(rect(s.ox, y - SP / 4, s.end - s.ox, SP / 2, 'line-band')));
    }

    // grid (every staff, not in its %-bars)
    const hasChords = doc.bars.some((h) => h.chords);
    for (const z of plain ? [] : L.staves) {
      for (const b of L.bars) {
        if (b.parts[z.k].simile || b.hidden !== undefined) continue;
        // melody: the places outside the scale (pentatonic, blues …) are marked pale - they still write their tone
        const pi = b.parts[z.k].pitch, outside = new Set();
        if (pi && TC.pitch.lineMap(pi.scale).some((x) => !x.in)) {
          for (let l = -3; l <= 11; l++) {
            if (TC.pitch.lineTone(TC.pitch.diaAt(l, z.track.clef), pi.scale).in) continue;
            outside.add(l);
            OS(b, z).push(rect(b.x0, stepY(l) - SP / 4, b.x + b.w - b.x0, SP / 2, 'line-out'));
          }
        }
        // chord symbols, writing a melody (the track being written): the chord tones marked; locked: the other lines pale
        const guide = pi && z.track === cur && hasChords ? TC.score.guideAt(doc, b.i, z.track) : 'off';
        if (guide !== 'off') {
          const segs = b.chords.slice();
          if (!segs.length || segs[0].t > 0) {
            const before = TC.score.chordAt(doc, b.i, 0);
            if (before) segs.unshift({ t: 0, ch: before.ch });
          }
          segs.forEach((x, k) => {
            const x1 = k ? RD.tickX(b, x.t) - 0.5 * SP : b.x0, x2 = k + 1 < segs.length ? RD.tickX(b, segs[k + 1].t) - 0.5 * SP : b.x + b.w;
            for (let l = -3; l <= 11; l++) {
              const g = TC.pitch.guideTone(TC.pitch.diaAt(l, z.track.clef), pi.scale, x.ch, guide);
              if (g.chord) OS(b, z).push(rect(x1, stepY(l) - SP / 4, x2 - x1, SP / 2, g.root ? 'line-chord line-root' : 'line-chord'));
              else if (guide === 'lock' && !outside.has(l)) OS(b, z).push(rect(x1, stepY(l) - SP / 4, x2 - x1, SP / 2, 'line-out')); // (pale once: not twice where the scale has it already)
            }
          });
        }
        const beat = TC.rhythm.beatTicks(b.ts);
        const G = TC.rhythm.groupSpans(b.ts, b.beam);
        const starts = G && new Set(G.map((g) => g[0])); // odd meters: the beam groups are the strong lines
        for (let t = 0; t < b.L; t += L.grid) {
          const x = RD.tickX(b, t);
          OS(b, z).push(line(x, top + SP, x, bottom - SP, (starts ? starts.has(t) : t % beat === 0) ? 'grid beat' : 'grid'));
        }
      }
    }

    // staves: every line starts with the clef; one-line tracks: one line (in the middle)
    for (const s of L.systems) {
      for (const z of L.staves) {
        const o = staffOut[s.i][z.k];
        for (let k = z.one ? 2 : 0; k < (z.one ? 3 : 5); k++) o.push(line(s.ox, k * SP, s.end, k * SP, 'staff'));
        if (z.track.kind === 'pitched') {
          // melody: its clef, then the key signature of the first bar of the line
          const c = TC.pitch.clef(z.track.clef), pi = L.bars[s.first].parts[z.k].pitch;
          o.push(glyph(String.fromCharCode(c.glyph), s.ox + 0.9 * SP, stepY(c.line)));
          if (pi) drawKey(o, s.ox + CLEF_W - 0.2 * SP, { to: pi.fifths }, z.track.clef);
        } else o.push(glyph('\uE069', s.ox + 0.9 * SP, 2 * SP)); // percussion clef
        // several staves: the name of the track above its staff (the one being written in colour)
        // (a piano: its name once, over the upper staff; a brace joins its two staves)
        const lower = lowerOf(L, z);
        if (many && !z.track.lh) o.push(`<text class="staff-name${(z.track === cur || (lower && lower.track === cur)) && !plain ? ' cur' : ''}" x="${f(s.ox)}" y="${f((z.one ? 0.4 : -1.0) * SP)}">${esc(z.track.name)}</text>`);
        if (lower) o.push(brace(s.ox - 0.45 * SP, 0, lower.dy - z.dy + 4 * SP));
      }
      if (many) {
        // the staves of a line belong together: a line at the left joins them
        const z0 = L.staves[0], zl = L.staves[L.staves.length - 1];
        lines[s.i].push(line(s.ox, z0.one ? SP : 0, s.ox, zl.dy + (zl.one ? 3 : 4) * SP, 'barline'));
      }
    }
    // bar numbers: endless view every bar (to find your way); page view as chosen
    const numbers = page ? doc.page.barNumbers : 'every';
    L.bars.forEach((b, i) => {
      if (b.hidden !== undefined) return; // inside a multi-bar rest
      const o = O(b), s = L.systems[b.sys], lastOf = b.multi ? i + b.multi - 1 : i;
      const end = b.x + b.w;
      // in every staff: time signature, bar line, repeat signs (one-line staves: shorter lines)
      for (const z of L.staves) {
        const so = OS(b, z), y0 = z.one ? SP : 0, y1 = z.one ? 3 * SP : 4 * SP;
        // melody: a new key signature from this bar (before the time signature)
        const pc = b.parts[z.k].pitch;
        if (b.ksW && pc && pc.change) drawKey(so, b.x + (b.rs ? REP_W : 0) + 0.4 * SP, pc.change, z.track.clef);
        if (b.showTs) {
          const num = String(b.ts[0]), den = String(b.ts[1]);
          const put = (str, y) => {
            const w = str.length * 1.9 * SP;
            let x = b.x + (b.rs ? REP_W : 0) + b.ksW + TS_W / 2 - w / 2 + 0.05 * SP;
            for (const d of str) {
              so.push(glyph(TS_DIGIT(+d), x, y));
              x += 1.9 * SP;
            }
          };
          put(num, SP);
          put(den, 3 * SP);
        }
        const dots = (x) => [1.5, 2.5].map((y) => `<circle class="repeat-dot" cx="${f(x)}" cy="${f(y * SP)}" r="${f(0.22 * SP)}"/>`).join('');
        if (b.rs) {
          // |: thick line, thin line, two dots
          so.push(rect(b.x, y0, 0.5 * SP, y1 - y0, 'barline-thick'), line(b.x + 0.85 * SP, y0, b.x + 0.85 * SP, y1, 'barline'), dots(b.x + 1.25 * SP));
        }
        if (b.re) {
          // :| two dots, thin line, thick line
          so.push(dots(end - 1.25 * SP), line(end - 0.85 * SP, y0, end - 0.85 * SP, y1, 'barline'), rect(end - 0.5 * SP, y0, 0.5 * SP, y1 - y0, 'barline-thick'));
        } else if (lastOf === L.bars.length - 1) {
          so.push(line(end - 0.75 * SP, y0, end - 0.75 * SP, y1, 'barline'));
          so.push(rect(end - 0.5 * SP, y0, 0.5 * SP, y1 - y0, 'barline-thick'));
        } else {
          so.push(line(end, y0, end, y1, 'barline'));
        }
        // a piano: the bar lines go on through the space between its two staves
        const lower = lowerOf(L, z);
        if (lower) {
          const g0 = y1, g1 = lower.dy - z.dy, thin = (x) => so.push(line(x, g0, x, g1, 'barline'));
          if (b.re) { thin(end - 0.85 * SP); so.push(rect(end - 0.5 * SP, g0, 0.5 * SP, g1 - g0, 'barline-thick')); }
          else if (lastOf === L.bars.length - 1) { thin(end - 0.75 * SP); so.push(rect(end - 0.5 * SP, g0, 0.5 * SP, g1 - g0, 'barline-thick')); }
          else thin(end);
          if (b.rs) { so.push(rect(b.x, g0, 0.5 * SP, g1 - g0, 'barline-thick')); thin(b.x + 0.85 * SP); }
        }
      }
      // played more than twice: "3×" above the first staff
      if (b.re > 2) o.push(`<text class="repeat-count" x="${f(end - 0.2 * SP)}" y="${f(-0.8 * SP)}">${b.re}×</text>`);
      // page view (not printed): a manual line break after this bar
      if (page && !plain && doc.bars[lastOf + 1] && doc.bars[lastOf + 1].lineBreak) {
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
        // 𝄋 / ⊕, doubled for Segno Segno / Double Coda
        const g = /^segno/.test(b.mark) ? '' : '', n = b.mark === 'segnoSegno' || b.mark === 'doubleCoda' ? 2 : 1;
        o.push(`<text class="mus-sm jump-sign" x="${f(x)}" y="${f(TEXT_Y + 0.3 * SP)}"><title>${esc(TC.tr(RD.markName(b.mark)))}</title>${n > 1 ? g + `<tspan dx="${f(0.3 * SP)}">${g}</tspan>` : g}</text>`);
      }
      // the scale (bar 1, a change): after tempo, text and 𝄋 / ⊕
      if (b.scaleText) {
        const x = b.x + 0.2 * SP + (i === 0 ? TEMPO_W + swingW : b.tempo ? TEMPO_W : 0) + (b.marker ? markerW(b.marker) + 0.6 * SP : 0) +
          (b.mark ? (b.mark === 'segnoSegno' || b.mark === 'doubleCoda' ? 3.6 : 2.2) * SP : 0);
        o.push(`<text class="scale-name" x="${f(x)}" y="${f(TEXT_Y)}">${esc(b.scaleText)}</text>`);
      }
      // at the end of the bar: D.C. / D.S. …, Fine, To Coda ⊕ (right-aligned, the jump rightmost)
      let ex = end - 0.3 * SP;
      if (b.jump) {
        const t = RD.jumpText(b.jump);
        o.push(`<text class="jump-text" x="${f(ex)}" y="${f(TEXT_Y)}">${esc(t)}</text>`);
        ex -= jumpW(t) + 0.8 * SP;
      }
      if (b.end === 'fine') o.push(`<text class="jump-text" x="${f(ex)}" y="${f(TEXT_Y)}">Fine</text>`);
      if (b.end === 'toCoda' || b.end === 'toDoubleCoda') {
        const two = b.end === 'toDoubleCoda'; // To Coda ⊕⊕: on to the double coda
        o.push(`<text class="mus-sm jump-sign end" x="${f(ex)}" y="${f(TEXT_Y + 0.3 * SP)}">${two ? '' : ''}</text>` +
          `<text class="jump-text" x="${f(ex - (two ? 4.6 : 2.3) * SP)}" y="${f(TEXT_Y)}">To Coda</text>`);
      }
    });

    // notes: every staff, every bar
    L.heads = [];
    for (const z of L.staves) {
      for (const b of L.bars) {
        if (b.hidden !== undefined) continue;
        const o = OS(b, z), part = b.parts[z.k];
        if (b.multi && b.allSimile) {
          // %-bars in a row: one % with the number of bars above
          const cx = b.x0 + (b.x + b.w - b.x0) / 2;
          o.push(`<g class="multisimile"><text class="mus mid" x="${f(cx)}" y="${f(2 * SP)}">${''}</text>` +
            `<text class="multirest-n" x="${f(cx)}" y="${f(-1.0 * SP)}">${b.multi}</text></g>`);
          continue;
        }
        if (b.multi) {
          // multi-bar rest: thick bar on the middle line with serifs, the number of bars above
          const x1 = b.x0 + 0.8 * SP, x2 = b.x + b.w - 1.2 * SP, cx = (x1 + x2) / 2;
          o.push(`<g class="multirest">${rect(x1, 1.55 * SP, x2 - x1, 0.9 * SP, 'multirest-bar')}` +
            line(x1, SP, x1, 3 * SP, 'multirest-end') + line(x2, SP, x2, 3 * SP, 'multirest-end') +
            `<text class="multirest-n" x="${f(cx)}" y="${f(-1.0 * SP)}">${b.multi}</text></g>`);
          continue;
        }
        if (part.simile) {
          o.push(`<text class="mus mid" x="${f(b.x0 + (b.x + b.w - b.x0) / 2)}" y="${f(2 * SP)}"></text>`);
          if (b.simileN) o.push(`<text class="simile-n" x="${f(b.x0 + (b.x + b.w - b.x0) / 2)}" y="${f(-1.0 * SP)}">${b.simileN}</text>`);
          continue;
        }
        // the bar as seen by this staff: its voices; its highest ink (drawVoice) for the ending brackets
        const pb = Object.create(b);
        pb.voices = part.voices;
        pb.top = 0;
        staffNow = z;
        const used = part.voices.map((items) => items.some((it) => it.kind === 'note'));
        part.voices.forEach((items, vi) => drawVoice(o, pb, items, vi, used, z.track, part.pitch));
        drawUnder(o, pb);
        if (z.k === 0) b.top = pb.top;
      }
    }
    staffNow = null;

    // lyrics: under each melody staff a row per verse - the syllable under its note, "-" between the syllables of a
    // word, a line under the notes a word is sung over (melisma); several verses: "1." "2." before the first syllable
    for (const z of L.staves) {
      const info = L.lyrInfo.get(z.track);
      if (!info) continue;
      const firstOf = new Set();
      const many = z.lyrRows > 1;
      for (const b of L.bars) {
        if (b.hidden !== undefined || b.parts[z.k].simile) continue;
        const o = OS(b, z), s = L.systems[b.sys];
        for (const ev of z.track.bars[b.i].voices[0] || []) {
          for (const y of info.get(ev) || []) {
            const x = RD.tickX(b, ev.tick), ly = z.lyrY + y.v * LYR_DY, w = lyrW(y.text);
            // a word sung over several notes: from the note on (left-aligned), else centred under it
            const x1 = y.endNote ? x - 0.65 * SP : x - w / 2, x2 = x1 + w;
            const ed = S.lyricEdit && S.lyricEdit.ev === ev && S.lyricEdit.v === y.v && !plain; // (being typed: the field shows it)
            if (!ed) o.push(`<text class="lyric" x="${f(x1)}" y="${f(ly)}">${esc(y.text)}</text>`);
            if (many && !firstOf.has(y.v)) {
              firstOf.add(y.v);
              o.push(`<text class="lyric-n" x="${f(x1 - 0.5 * SP)}" y="${f(ly)}">${y.v + 1}.</text>`);
            }
            if (y.hyphen && y.next) {
              // the hyphen: in the middle of the gap to the next syllable (on this line), else after the syllable
              const nb = L.bars[y.next.bar], nx = nb && nb.sys === b.sys ? RD.tickX(nb, y.next.ev.tick) : null;
              const ny = (info.get(y.next.ev) || []).find((q) => q.v === y.v);
              const nl = nx === null || !ny ? null : ny.endNote ? nx - 0.65 * SP : nx - lyrW(ny.text) / 2;
              const hx = nl !== null && nl - x2 > 0.5 * SP ? (x2 + nl) / 2 : x2 + 0.7 * SP;
              o.push(`<text class="lyric hyphen" x="${f(hx)}" y="${f(ly)}">-</text>`);
            } else if (y.endNote) {
              // melisma: a line under the notes of the word, to the end of the last of them (on this line)
              const eb = L.bars[y.endNote.bar];
              const ex = eb && eb.sys === b.sys ? RD.tickX(eb, y.endNote.ev.tick) + 0.7 * SP : s.end - 0.6 * SP;
              if (ex - x2 > 0.6 * SP) o.push(line(x2 + 0.25 * SP, ly + 0.15 * SP, ex, ly + 0.15 * SP, 'lyric-ext'));
            }
          }
        }
      }
    }

    // dynamics: the level as a sign (p, mf, ff …) at its place, hairpins as a wedge from their place to their end
    // (over line breaks: a piece in each line, opening as far as it has come). Each can be tapped (data-dyn: track|bar|t|kind,
    // js/interaction.js) - the selected one in the colour of a selection; a hairpin has a wider area to hit than its lines.
    const dsel = !S.selection.size && S.dynSel;
    const dynAttr = (tr, bar, t, k) => ` data-dyn="${esc(tr.id)}|${bar}|${t}|${k}"`;
    const isSel = (tr, bar, t, k) => !!dsel && dsel.track === tr.id && dsel.bar === bar && dsel.t === t && !!dsel.w === (k === 'w');
    // (selected: the sign itself is the handle to drag it - h 'v'; the end level of a hairpin moves its end - h 'e')
    const dynGlyph = (ch, x, y, tr, bar, t, k, h) => `<text class="mus dyn${isSel(tr, bar, t, k) ? ' sel' : ''}"${dynAttr(tr, bar, t, k)}${h && isSel(tr, bar, t, k) ? ` data-dynh="${h}"` : ''} x="${f(x)}" y="${f(y)}">${ch}</text>`;
    // a round handle at an end of the selected hairpin (h 's' start, 'e' end), with a wide area to hit
    const handle = (x, y, h) => `<circle class="dyn-handle-hit" data-dynh="${h}" cx="${f(x)}" cy="${f(y)}" r="${f(1.4 * SP)}"/><circle class="dyn-handle" data-dynh="${h}" cx="${f(x)}" cy="${f(y)}" r="${f(0.45 * SP)}"/>`;
    for (const z of L.staves) {
      if (z.dynY === undefined) continue;
      const tr = z.track, y = z.dynY, H = 1.5 * SP, at = TC.score.tickOf(doc), signW = (v) => v.length * 1.25 * SP + 0.3 * SP;
      const DYN_G = { p: '', m: '', f: '' };
      const levelAt = new Map(); // (abs tick -> level written there: a hairpin starts after it / ends before it)
      for (const b of L.bars) {
        if (b.hidden !== undefined) continue;
        TC.score.dynIn(tr, b.i).forEach((d) => {
          if (!d.v) return;
          levelAt.set(at(b.i, d.t), d.v);
          OS(b, z).push(dynGlyph(d.v.split('').map((c) => DYN_G[c]).join(''), RD.tickX(b, d.t) - 0.5 * SP, y, tr, b.i, d.t, 'v', 'v'));
        });
      }
      const ev = TC.score.dynEvents(doc, tr);
      for (const w of ev.wedges) {
        for (const s of L.systems) {
          const fb = L.bars[s.first], lb = L.bars[s.last];
          const s0 = at(fb.i, 0), s1 = at(lb.i, lb.L);
          let a = Math.max(w.abs, s0), e = Math.min(w.end, s1);
          if (e <= a) continue;
          const xOf = (abs) => {
            for (let i = s.first; i <= s.last; i++) {
              const b = L.bars[i], b0 = at(b.i, 0);
              if (b.hidden === undefined && abs >= b0 && abs <= b0 + b.L) return abs === b0 + b.L ? b.x + b.w - 0.6 * SP : RD.tickX(b, abs - b0);
            }
            return s.end - 0.6 * SP;
          };
          let x0 = xOf(a), x1 = xOf(e);
          const o = staffOut[s.i][z.k];
          if (a === w.abs && levelAt.has(w.abs)) x0 += signW(levelAt.get(w.abs)); // (after the sign it starts from)
          else if (a === w.abs) x0 -= 0.4 * SP;
          if (e === w.end && levelAt.has(w.end)) x1 -= 0.8 * SP; // (before the sign it goes to)
          else if (e === w.end && w.sign) {
            // its own level ("pp < ff"): right after the bar line where it ends (the next bar of this line), else at the end
            // (ending inside a bar - "1 < 2": at the note there, like a level written there)
            const nb = L.bars.find((b) => b.hidden === undefined && b.sys === s.i && at(b.i, 0) === w.end);
            const inBar = L.bars.find((b) => b.hidden === undefined && b.sys === s.i && at(b.i, 0) < w.end && w.end < at(b.i, 0) + b.L);
            const sx = nb ? RD.tickX(nb, 0) - 0.5 * SP : inBar ? RD.tickX(inBar, w.end - at(inBar.i, 0)) - 0.5 * SP : x1 - signW(w.toV) + 0.3 * SP;
            o.push(dynGlyph(w.toV.split('').map((c) => DYN_G[c]).join(''), sx, y, tr, w.bar, w.t, 'w', 'e')); // (tapped: its hairpin)
            x1 = Math.min(x1, sx - 0.5 * SP);
          }
          if (x1 - x0 < SP) continue;
          const p0 = (a - w.abs) / (w.end - w.abs), p1 = (e - w.abs) / (w.end - w.abs);
          const h0 = (w.w === 'cresc' ? p0 : 1 - p0) * H / 2, h1 = (w.w === 'cresc' ? p1 : 1 - p1) * H / 2, yc = y - 0.45 * SP;
          const sel = isSel(tr, w.bar, w.t, 'w'), cls = 'hairpin' + (sel ? ' sel' : '');
          o.push(`<rect class="dyn-hit"${dynAttr(tr, w.bar, w.t, 'w')} x="${f(x0)}" y="${f(yc - H / 2 - 0.5 * SP)}" width="${f(x1 - x0)}" height="${f(H + SP)}"/>`,
            line(x0, yc - h0, x1, yc - h1, cls), line(x0, yc + h0, x1, yc + h1, cls));
          // selected: a handle at its start and at its end (on the line where they are), to drag them
          if (sel && !plain && a === w.abs) o.push(handle(x0, yc, 's'));
          if (sel && !plain && e === w.end) o.push(handle(x1, yc, 'e'));
        }
      }
    }

    // keyswitches (ways of playing of the track's VST, js/keyswitch.js): their short names above the staff; a way of
    // playing that holds ("P.M.") with a dashed line to the next one and a hook at its end ("open": just ends it)
    for (const z of L.staves) {
      const tk = z.track;
      if (!tk.ksw || tk.lh || !TC.ksw) continue;
      if (z.ksY === undefined) continue;
      const y = z.ksY, at = TC.score.tickOf(doc), spans = []; // (under the staff: the stroke marks ⊓ / V stay above it)
      for (const b of L.bars) {
        if (b.hidden !== undefined) continue;
        ((tk.bars[b.i] && tk.bars[b.i].ks) || []).forEach((m) => {
          const k = TC.ksw.keyOf(tk, m.k), txt = TC.ksw.markText(k);
          if (!k || !txt) return; // (staccato, tremolo …: signs at the notes, no text)
          // (a way of playing in the first row - "open" too; a slide, a stop, release in the row under it)
          const x = RD.tickX(b, m.t) - 0.4 * SP;
          OS(b, z).push(`<text class="ks-mark${k.kind === 'art' ? '' : ' once'}" x="${f(x)}" y="${f(z.ksRowOf(k))}">${esc(txt)}</text>`);
        });
      }
      // the lines of the ways of playing: from each to the next (in written order), over line breaks
      const arts = [];
      tk.bars.forEach((bar, bi) => ((bar && bar.ks) || []).forEach((m) => {
        const k = TC.ksw.keyOf(tk, m.k);
        if (k && k.kind === 'art') arts.push({ abs: at(bi, m.t), txt: TC.ksw.markText(k), line: TC.ksw.hasLine(k), g: k.group || '', y: z.ksRowOf(k) });
      }));
      arts.sort((a, b) => a.abs - b.abs);
      // (to the next way of playing of its group - only those that have one: P.M., dead … - not "let ring", "pizz.")
      arts.forEach((a, n) => {
        if (!a.line || !a.txt) return;
        const next = arts.slice(n + 1).find((x) => x.g === a.g);
        spans.push({ a: a.abs, e: next ? next.abs : at(doc.bars.length, 0), w: a.txt.length * 0.6 * SP + 0.4 * SP, y: a.y });
      });
      for (const sp of spans) {
        for (const s of L.systems) {
          const fb = L.bars[s.first], lb = L.bars[s.last], s0 = at(fb.i, 0), s1 = at(lb.i, lb.L);
          const a = Math.max(sp.a, s0), e = Math.min(sp.e, s1);
          if (e <= a) continue;
          const xOf = (abs) => {
            for (let i = s.first; i <= s.last; i++) {
              const b = L.bars[i], b0 = at(b.i, 0);
              if (b.hidden === undefined && abs >= b0 && abs <= b0 + b.L) return abs === b0 + b.L ? b.x + b.w - 0.5 * SP : RD.tickX(b, abs - b0) - 0.6 * SP;
            }
            return s.end - 0.5 * SP;
          };
          const x0 = xOf(a) + (a === sp.a ? sp.w : 0), x1 = xOf(e), o = staffOut[s.i][z.k], ly = sp.y - 0.35 * SP; // (in its own row)
          if (x1 - x0 > 0.5 * SP) o.push(line(x0, ly, x1, ly, 'ks-line'));
          if (e === sp.e) o.push(line(x1, ly - 0.6 * SP, x1, ly, 'ks-end')); // (the hook points up, to the staff)
        }
      }
    }

    // chord symbols above the first staff: one row per line, above its highest note (as in a lead sheet)
    const chordRow = new Map();
    L.systems.forEach((s) => {
      let top = 0, any = false;
      for (let i = s.first; i <= s.last; i++) {
        top = Math.min(top, L.bars[i].top || 0);
        if (L.bars[i].chords.length && L.bars[i].hidden === undefined) any = true;
      }
      if (any) chordRow.set(s.i, Math.min(CHORD_Y, top - 1.1 * SP));
    });
    L.bars.forEach((b, i) => {
      if (!b.chords.length || b.hidden !== undefined) return;
      const y = chordRow.get(b.sys);
      b.chords.forEach((x) => {
        const name = TC.pitch.chordName(x.ch, TC.getLang && TC.getLang() === 'de');
        O(b).push(`<text class="chord-sym" data-bar="${i}" data-t="${x.t}" x="${f(RD.tickX(b, x.t) - 0.4 * SP)}" y="${f(y)}">${esc(name)}</text>`);
      });
    });

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
      // (chord symbols on this line: the bracket above them, its "1." clear of a chord at the bar start)
      const cy = chordRow.get(b.sys);
      const VY = Math.min(VOLTA_Y, top - 1.7 * SP, cy !== undefined ? cy - 2.6 * SP : Infinity);
      let d = `M${f(x1)},${f(VY + (startsHere ? hook : 0))} L${f(x1)},${f(VY)} L${f(x2)},${f(VY)}`;
      if (more || last.re) d += ` L${f(x2)},${f(VY + hook)}`;
      O(b).push(`<path class="volta" d="${d}"/>`);
      if (startsHere) O(b).push(`<text class="volta-text" x="${f(x1 + 0.4 * SP)}" y="${f(VY + 1.15 * SP)}">${b.volta.join('., ')}.</text>`);
    });

    // "+" after the last bar
    if (!plain) {
      const a = L.add;
      lines[lines.length - 1].push(`<g class="add-bar">${rect(a.x, a.y, a.w, a.h, 'add-box')}` +
        `<text class="add-plus" x="${f(a.x + a.w / 2)}" y="${f(a.y + a.h / 2 + 5)}">+</text></g>`);
    }

    // each line: what belongs to it (texts, brackets above), then its staves, each moved down to its place
    L.systems.forEach((s) => out.push(onLine(s, lines[s.i].join('') +
      L.staves.map((z) => `<g class="stave" transform="translate(0,${f(z.dy)})">${staffOut[s.i][z.k].join('')}</g>`).join(''))));
    return out.join('');
  };

  /** Width of the box of a bar text (12 px bold). */
  const markerW = (s) => s.length * 7.4 + 1.2 * SP;
  /** Width of a jump text (13 px bold italic). */
  const jumpW = (s) => s.length * 7.2;
  /** "D.S. al Coda" … as written above the bar. */
  RD.jumpText = (j) => {
    if (!j) return '';
    const J = TC.jumpInfo(j);
    const head = J.to === 'start' ? 'D.C.' : J.to === 'segnoSegno' ? 'D.S.S.' : 'D.S.';
    return head + ({ fine: ' al Fine', coda: ' al Coda', doubleCoda: ' al Double Coda' }[J.al] || '');
  };
  /** Name of a sign at the start of a bar. */
  RD.markName = (m) => ({ segno: 'Segno', segnoSegno: 'Segno Segno', coda: 'Coda', doubleCoda: 'Double Coda' })[m] || '';

  /** One voice of one bar: rests, heads, stems, flags, beams, dots, accents, tuplets. */
  function drawVoice(out, b, items, vi, used, track, pinfo) {
    const voiceUp = vi % 2 === 0;
    let up = voiceUp; // (per note below: a melody alone points its stems away from the middle line)
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

    // the heads of each note item (drums: the line of the instrument; melody: of the pitch as spelled)
    const headsOf = new Map();
    for (const it of items) {
      if (it.kind !== 'note') continue;
      const gi = it.base >= 3840 ? 2 : it.base >= 1920 ? 1 : 0;
      headsOf.set(it, it.ev.notes.map((n) => {
        if (pinfo) {
          const head = TC.HEADS.normal, sp = pinfo.spell.get(n.id);
          const acc = pinfo.acc.get(it.tick + ':' + n.id);
          return { n, art: null, line: sp ? sp.line : 4, head, w: head.w[gi] * SP, g: head.g[gi], dx: 0, acc: acc === undefined ? null : acc };
        }
        const art = TC.drums.byId(n.art);
        const head = TC.HEADS[TC.drums.headOf(n)];
        return { n, art, line: TC.drums.lineOf(art, track), head, w: head.w[gi] * SP, g: head.g[gi], dx: 0 };
      }).sort((a, c) => a.line - c.line));
    }
    // stems: by voice (drums, two voices); a melody alone: away from the middle line - in a beam group the
    // note furthest from it decides for the group
    const upOf = new Map();
    if (pinfo && !other) {
      const decide = (list) => {
        let hi = Infinity, lo = -Infinity;
        list.forEach((it) => headsOf.get(it).forEach((h) => { hi = Math.min(hi, h.line); lo = Math.max(lo, h.line); }));
        return lo - 4 > 4 - hi;
      };
      beams.forEach((g) => { const u = decide(g); g.forEach((it) => upOf.set(it, u)); });
      items.forEach((it) => { if (it.kind === 'note' && !upOf.has(it)) upOf.set(it, decide([it])); });
    }

    // geometry of each note item first (beams need all of their stems)
    const geo = new Map();
    for (const it of items) {
      if (it.kind !== 'note') continue;
      const x = RD.tickX(b, it.tick);
      up = upOf.has(it) ? upOf.get(it) : voiceUp;
      const heads = headsOf.get(it);
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
      // (a melody under a keyswitch "tremolo": three strokes with its flags / beams - an unmeasured tremolo)
      const sg = pinfo ? signsOf(track, b.i, it.ev.tick) : [];
      const trem = Math.max(sg.includes('trem') ? Math.max(1, 3 - flags) : 0, ...it.ev.notes.map((n) => n.trem || 0)); // roll strokes need a longer stem
      const extra = Math.max(0, flags - 2) * BEAM_GAP + (trem ? (trem + 0.5) * TREM_GAP : 0);
      const startY = up ? stepY(lo.line) - lo.head.stem * SP : stepY(hi.line) + hi.head.stem * SP;
      let endY = up ? stepY(hi.line) - STEM - extra : stepY(lo.line) + STEM + extra;
      if (pinfo) endY = up ? Math.min(endY, stepY(4)) : Math.max(endY, stepY(4)); // far off the staff: the stem reaches the middle line
      geo.set(it, { x, heads, stemX, startY, endY, flags, trem, up, sg });
    }
    // beams: flat, at the outermost stem end of the group
    for (const g of beams) {
      const gs = g.map((it) => geo.get(it));
      up = gs[0].up;
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
        up = voiceUp;
        const shift = other ? (up ? -SP : 2 * SP) : 0;
        const y = (it.base >= 3840 ? SP : 2 * SP) + shift;
        const x = RD.tickX(b, it.tick) - (REST_W[it.base] * SP) / 2;
        out.push(glyph(REST[it.base], x, y, 'rest'));
        if (it.dots) out.push(glyph('', x + REST_W[it.base] * SP + 0.3 * SP, y - SP / 2, 'rest'));
        continue;
      }
      const q = geo.get(it);
      up = q.up;
      const sel = it.ev.notes.some((n) => S.selection.has(n.id));
      out.push(`<g class="note${sel ? ' sel' : ''}">`);
      for (const h of q.heads) {
        const cx = q.x + h.dx, y = stepY(h.line);
        // ledger lines
        for (let l = -2; l >= h.line; l -= 2) out.push(line(cx - h.w / 2 - 0.4 * SP, stepY(l), cx + h.w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        for (let l = 10; l <= h.line; l += 2) out.push(line(cx - h.w / 2 - 0.4 * SP, stepY(l), cx + h.w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        const hs = S.selection.has(h.n.id);
        // melody: ♯ ♭ ♮ before the head (left of a head moved to the other side of the stem too)
        if (h.acc !== null && h.acc !== undefined) {
          const left = q.x + Math.min(0, ...q.heads.map((z) => z.dx)) - h.w / 2 - 0.2 * SP;
          out.push(glyph(ACC_GLYPH[h.acc], left - ACC_W[h.acc] * SP, y, hs ? 'head hsel' : 'head'));
        }
        out.push(glyph(h.g, cx - h.w / 2, y, hs ? 'head hsel' : 'head'));
        if (h.line < 0) b.top = Math.min(b.top || 0, stepY(h.line) - 1.2 * SP); // above the staff: the ending brackets go higher
        if (h.n.ghost) {
          out.push(glyph('', cx - h.w / 2 - 0.5 * SP, y, 'head'));
          out.push(glyph('', cx + h.w / 2 + 0.2 * SP, y, 'head'));
        }
        if (it.dots) {
          const dy = h.line % 2 === 0 ? -SP / 2 : 0;
          out.push(glyph('', q.x + Math.max(...q.heads.map((z) => z.dx + z.w / 2)) + 0.35 * SP, y + dy, 'head'));
        }
        RD.layout.heads.push({ x: cx, y, id: h.n.id, bar: b.i, tick: it.tick, line: h.line, track: staffNow ? staffNow.track : track, dy: staffNow ? staffNow.dy : 0 });
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
      // (a keyswitch "accented" / "marcato" holding here: > / ^ at each note, as a written accent)
      const sg = it.cont ? [] : q.sg || [];
      const acc = Math.max(...it.ev.notes.map((n) => n.accent || 0), sg.includes('marc') ? 2 : sg.includes('acc') ? 1 : 0);
      if (acc) marks.push(['acc', acc]);
      // staccato, staccatissimo, tenuto, portato (keyswitches holding here): at the head, away from the stem - in a space
      // when inside the staff
      for (const s of sg.filter((x) => ARTIC[x])) {
        const below = up, [ga, gb, w] = ARTIC[s];
        let y = below ? stepY(q.heads[q.heads.length - 1].line) + 1.0 * SP : stepY(q.heads[0].line) - 1.0 * SP;
        if (y > -0.2 * SP && y < 4.2 * SP) y = below ? (Math.ceil(y / SP - 0.5) + 0.5) * SP : (Math.floor(y / SP + 0.5) - 0.5) * SP;
        out.push(glyph(below ? gb : ga, q.x - (w * SP) / 2, y + (below ? -0.1 * SP : 0.1 * SP), 'head'));
        if (!below) b.top = Math.min(b.top || 0, y - 0.6 * SP);
      }
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
      // a stroke (strummed guitar, js/accomp.js): ⊓ down / V up - above the chord, above its stem and accents
      const strokeN = !it.cont && it.ev.notes.find((n) => n.stroke);
      if (strokeN && q.heads.length) {
        const topHead = Math.min(...q.heads.map((h) => stepY(h.line)));
        const sy = Math.min(up ? q.endY : topHead, 0) - 1.0 * SP - (up && marks.length ? marks.length * 1.2 * SP : 0);
        out.push(glyph(strokeN.stroke === 'u' ? '' : '', q.x - 0.45 * SP, sy, 'head'));
        b.top = Math.min(b.top || 0, sy - 1.3 * SP);
      }
      q.markY = marks.length ? my + (up ? 0.5 * SP : -0.5 * SP) : null; // outermost mark (tuplet numbers go beyond it)
      if (up) b.top = Math.min(b.top || 0, q.endY - 0.3 * SP, marks.length ? my + 0.4 * SP : 0);
      if (it.tie) {
        const nx = RD.tickX(b, it.tick + it.dur);
        q.heads.forEach((h) => tieArc(out, q.x + h.dx + 0.6 * SP, nx - 0.6 * SP, h.line, up));
      }
      if (pinfo && !it.tie) {
        // melody: a tie to the note tied on from this one - in this bar, over the bar line, or (the next bar on
        // another line) to the end of the line; a note tied on from a bar on the line before: a tie from the line start
        const Lb = RD.layout.bars;
        for (const h of q.heads) {
          const to = pinfo.tiesOut.get(h.n.id);
          if (to) {
            const nb = Lb[to.bar];
            const x2 = to.bar === b.i ? RD.tickX(b, to.tick) - 0.6 * SP
              : nb && nb.sys === b.sys && nb.hidden === undefined ? RD.tickX(nb, 0) - 0.6 * SP : b.x + b.w + 0.9 * SP;
            tieArc(out, q.x + h.dx + 0.6 * SP, x2, h.line, up);
          }
          const pv = Lb[b.i - 1];
          if (!it.cont && it.tick === 0 && pinfo.tiesIn.has(h.n.id) && (!pv || pv.sys !== b.sys || pv.hidden !== undefined)) {
            tieArc(out, b.x0 - 0.6 * SP, q.x + h.dx - 0.6 * SP, h.line, up);
          }
        }
      }
      out.push('</g>');
    }

    // triplets: "3" at the beam, or a bracket
    const tups = new Map();
    items.forEach((it) => { if (it.tup) { if (!tups.has(it.tup.s)) tups.set(it.tup.s, []); tups.get(it.tup.s).push(it); } });
    for (const list of tups.values()) {
      const notes = list.filter((it) => it.kind === 'note');
      up = notes.length ? geo.get(notes[0]).up : voiceUp;
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
    if (!S.doc.page.counts) return;
    const ticks = new Set();
    const beat = (4 * TC.TPQ) / b.ts[1];
    const countY = staffNow && staffNow.lyrRows ? lyrEnd(staffNow) + 2.0 * SP : COUNT_Y; // (under the lyrics)
    for (let t = 0; t < b.L; t += beat) ticks.add(t);
    b.voices.forEach((items) => items.forEach((it) => { if (it.kind === 'note' && !it.cont) ticks.add(it.tick); }));
    const syl = TC.rhythm.countSyl(S.doc.page, TC.getLang() === 'de'); // (the score's own syllables: "1 ke ti na", "1 ka ba" …)
    for (const t of ticks) {
      const text = TC.rhythm.countText(t, b.ts, syl);
      const main = /^\d+$/.test(text);
      out.push(`<text class="count${main ? ' beat' : ''}" x="${f(RD.tickX(b, t))}" y="${f(countY)}">${esc(text)}</text>`);
    }
  }

  /** A tie from x1 to x2 at a head on staff step `line`, on the side away from the stem. */
  function tieArc(out, x1, x2, line, up) {
    if (x2 - x1 < 0.4 * SP) return;
    const y = stepY(line) + (up ? 0.6 * SP : -0.6 * SP);
    out.push(`<path class="tie" d="M${f(x1)},${f(y)} Q${f((x1 + x2) / 2)},${f(y + (up ? 1 : -1) * SP)} ${f(x2)},${f(y)}"/>`);
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
  function drawDrumMap(out, hl, ox, track) {
    // a one-line track: one row with all of its instruments
    const lines = TC.drums.oneLine(track) ? [[4, TC.drums.lineArts(4, track)]] : TC.drums.lines(TC.drums.mapIds(track));
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

  /**
   * Melody staves: the names of the tones the lines and spaces mean (in the scale of bar bi), in two
   * columns like the drum map; the places outside the scale pale. Only shown - a tap there chooses nothing.
   */
  function drawPitchMap(out, hl, ox, track, bi) {
    const P = TC.pitch, scale = TC.score.scaleAt(track, bi || 0), de = TC.getLang && TC.getLang() === 'de';
    const rows = [];
    for (let l = -2; l <= 10; l++) {
      const t = P.lineTone(P.diaAt(l, track.clef), scale);
      const text = P.name(((t.dia % 7) + 7) % 7, t.a, de);
      rows.push({ line: l, y: stepY(l), text, w: textW(text), pale: !t.in });
    }
    const near = rows.filter((r) => r.line % 2 === 0), far = rows.filter((r) => r.line % 2 !== 0);
    const xNear = ox - 0.8 * SP, xFar = xNear - Math.max(0, ...near.map((r) => r.w)) - 1.0 * SP;
    near.forEach((r) => { r.x2 = xNear; });
    far.forEach((r) => { r.x2 = xFar; });
    RD.layout.map = [];
    out.push('<g class="drummap">');
    for (const r of rows) {
      const cls = (r.pale ? ' pale' : '') + (r.line === hl ? ' hl' : '');
      out.push(`<path class="dm-lead${cls}" d="M${f(r.x2 + 0.25 * SP)},${f(r.y)} L${f(ox)},${f(r.y)}"/>`);
      out.push(`<text class="dm-label${cls}" x="${f(r.x2)}" y="${f(r.y + MAP_FONT * 0.36)}">${esc(r.text)}</text>`);
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
    if (document.body.classList.contains('perform')) return void (hov.innerHTML = ''); // stage view: no drum map, no preview
    const out = [], s = hoverLine(h, L);
    // the staff: the one under the pointer (h.trk), else the one being written
    const z = (h && h.trk && L.staves.find((q) => q.track.id === h.trk)) || L.staves.find((q) => q.track === TC.curTrack()) || L.staves[0];
    const hl = h ? (h.mapLine !== undefined ? h.mapLine : h.line) : null;
    if (hl !== null && hl !== undefined) out.push(rect(s.ox, stepY(hl) - SP / 4, s.end - s.ox, SP / 2, 'hover-band'));
    L.map = [];
    L.mapSys = s.i; // the drum map stands next to this line, at this staff
    L.mapTrack = z.track;
    if (S.settings.showDrumMap) {
      if (z.track.kind === 'pitched') drawPitchMap(out, hl, s.ox, z.track, h && L.bars[h.bar] ? h.bar : S.selBar !== null && L.bars[S.selBar] ? S.selBar : L.systems[s.i].first);
      else drawDrumMap(out, hl, s.ox, z.track);
    }
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
        const ln = h.line !== undefined ? h.line : h.art.line; // (one-line tracks: the middle line)
        const w = head.w[gi] * SP, y = stepY(ln);
        for (let l = -2; l >= ln; l -= 2) out.push(line(x - w / 2 - 0.4 * SP, stepY(l), x + w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        for (let l = 10; l <= ln; l += 2) out.push(line(x - w / 2 - 0.4 * SP, stepY(l), x + w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        out.push(glyph(head.g[gi], x - w / 2, y, 'ghost'));
        labelX = x + w / 2 + 0.7 * SP;
        labelY = y;
      } else if (h.pitch !== undefined) {
        // melody: the note as it would be written (its sign, if it needs one), and how long it gets (dragged sideways)
        const head = TC.HEADS.normal, gi = h.len >= 3840 ? 2 : h.len >= 1920 ? 1 : 0;
        const ln = h.line, w = head.w[gi] * SP, y = stepY(ln);
        if (h.len) {
          // the length, over the bar lines as far as it goes (bars on this line); stopped by the next note: a stroke there
          let rest = h.len, k = h.bar, t0 = h.tick, x2 = x;
          while (rest > 0 && L.bars[k] && L.bars[k].sys === b.sys) {
            const bk = L.bars[k], seg = Math.min(rest, bk.L - t0);
            const xa = k === h.bar ? x - w / 2 : RD.tickX(bk, 0) - 0.5 * SP;
            x2 = RD.tickX(bk, t0 + seg) - (t0 + seg >= bk.L ? 0 : 0.25 * SP);
            if (t0 + seg >= bk.L) x2 = bk.x + bk.w - 0.2 * SP;
            out.push(rect(xa, y - 0.4 * SP, Math.max(w, x2 - xa), 0.8 * SP, 'len-bar'));
            rest -= seg;
            k++;
            t0 = 0;
          }
          if (h.stop) out.push(rect(x2 - 0.12 * SP, y - 1.1 * SP, 0.24 * SP, 2.2 * SP, 'len-stop'));
          labelX = x2 + 0.4 * SP;
        }
        for (let l = -2; l >= ln; l -= 2) out.push(line(x - w / 2 - 0.4 * SP, stepY(l), x + w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        for (let l = 10; l <= ln; l += 2) out.push(line(x - w / 2 - 0.4 * SP, stepY(l), x + w / 2 + 0.4 * SP, stepY(l), 'ledger'));
        if (h.acc !== null && h.acc !== undefined) out.push(glyph(ACC_GLYPH[h.acc], x - w / 2 - 0.2 * SP - ACC_W[h.acc] * SP, y, 'ghost'));
        out.push(glyph(head.g[gi], x - w / 2, y, 'ghost'));
        if (labelX === null) labelX = x + w / 2 + 0.7 * SP;
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
    hov.innerHTML = onLine(s, `<g transform="translate(0,${f(z.dy)})">${out.join('')}</g>`);
  };

  /** The drum map row under point p (staff coordinates, see RD.toLocal), or null. */
  RD.mapLineAt = function (p) {
    const rows = RD.layout && RD.layout.map;
    if (!rows || !rows.length || !p.sys || p.sys.i !== RD.layout.mapSys || (p.track && p.track !== RD.layout.mapTrack)) return null;
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
  /**
   * The page of every bar as in the page view (0 = first page), whatever view is shown - for page
   * turning (TC.remote, the page turning MIDI file). The shown layout stays as it is.
   */
  RD.pagesOfBars = function () {
    const keep = S.settings.layout, old = RD.layout;
    S.settings.layout = 'page';
    try {
      const L = RD.computeLayout();
      return L.bars.map((b) => L.systems[b.sys].page || 0);
    } finally {
      S.settings.layout = keep;
      RD.layout = old;
    }
  };
  /** Number of pages of the page view. */
  RD.pageCount = () => Math.max(0, ...RD.pagesOfBars()) + 1;

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
