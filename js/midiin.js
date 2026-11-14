'use strict';
/*
 * MIDI import: a drum MIDI file (e.g. a part exported from Cubase) becomes a Tactus score.
 *
 *   TC.midiIn.parse(bytes)              -> { tpq, notes: [ {t, note, vel, ch} ], tempos: [ {t, bpm} ],
 *                                            sigs: [ {t, ts} ], markers: [ {t, text} ], names: [] }
 *                                            (all tracks of a type 0 / 1 file, t in the file's ticks)
 *   TC.midiIn.toScore(midi, opts)       -> { doc, notes, unknown: [ {note, count} ], merged }
 *     opts.profile   kit profile (js/kits.js): every key of an instrument counts, also the extra ones;
 *                    null = General MIDI (the MIDI notes of Tactus / Guitar Pro)
 *     opts.grid      finest straight position in ticks (240 = 16th, 120 = 32nd, 480 = 8th)
 *     opts.triplets  a beat may also be a triplet (grid 2/3 of the straight one), when that fits better
 *
 * How the notes are read:
 *   time         per beat: snapped to the straight grid, or to the triplet grid when that fits clearly better
 *   velocity     five steps (TC.STRENGTHS): below 49 ghost, below 81 soft, below 101 normal, below 119 strong, else accent
 *   flam / drag  one / two softer hits of the same instrument shortly before (< 70 ms): grace notes
 *   two hits of one instrument on the same position after snapping: the louder one stays
 *   tempo, time signatures and markers (bar texts) are taken over; the title comes from the file name
 */
(function (TC) {
  const MI = (TC.midiIn = {});

  // ---- reading the file ------------------------------------------------------------------

  MI.parse = function (bytes) {
    const str = (p, n) => String.fromCharCode(...bytes.slice(p, p + n));
    if (str(0, 4) !== 'MThd') throw new Error('not a MIDI file');
    const u16 = (p) => (bytes[p] << 8) | bytes[p + 1];
    const u32 = (p) => ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
    const ntr = u16(10), div = u16(12);
    if (div & 0x8000) throw new Error('SMPTE time is not supported');
    const out = { tpq: div, notes: [], tempos: [], sigs: [], markers: [], names: [], tracks: [] }; // tracks: { name, notes, channels }
    const utf8 = (arr) => {
      try { return decodeURIComponent(escape(String.fromCharCode(...arr))); } catch (e) { return String.fromCharCode(...arr); }
    };
    let p = 8 + u32(4);
    for (let k = 0; k < ntr && p < bytes.length; k++) {
      if (str(p, 4) !== 'MTrk') { p += 8 + u32(p + 4); k--; continue; } // skip unknown chunks
      const end = p + 8 + u32(p + 4);
      p += 8;
      const trk = { name: '', notes: 0, channels: new Set() };
      out.tracks.push(trk);
      let t = 0, status = 0;
      const vl = () => {
        let n = 0, b;
        do { b = bytes[p++]; n = n * 128 + (b & 0x7f); } while (b & 0x80 && p < end);
        return n;
      };
      while (p < end) {
        t += vl();
        let b = bytes[p];
        if (b === 0xff) {
          const type = bytes[p + 1];
          p += 2;
          const len = vl(), data = Array.from(bytes.slice(p, p + len));
          p += len;
          if (type === 0x51 && len === 3) out.tempos.push({ t, bpm: 60000000 / ((data[0] << 16) | (data[1] << 8) | data[2]) });
          else if (type === 0x58 && len >= 2) out.sigs.push({ t, ts: [data[0], Math.pow(2, data[1])] });
          else if (type === 0x06 || type === 0x07) out.markers.push({ t, text: utf8(data).trim() });
          else if (type === 0x03) { out.names.push(utf8(data).trim()); if (!trk.name) trk.name = utf8(data).trim(); }
          else if (type === 0x2f) break;
          continue;
        }
        if (b === 0xf0 || b === 0xf7) { p++; p += vl(); continue; } // sysex
        if (b & 0x80) { status = b; p++; }
        const hi = status & 0xf0;
        const d1 = bytes[p++], d2 = hi === 0xc0 || hi === 0xd0 ? 0 : bytes[p++];
        if (hi === 0x90 && d2 > 0) {
          out.notes.push({ t, note: d1, vel: d2, ch: status & 15, trk: out.tracks.length - 1 });
          trk.notes++;
          trk.channels.add(status & 15);
        }
      }
      p = end;
    }
    out.notes.sort((a, b) => a.t - b.t || a.note - b.note);
    out.tempos.sort((a, b) => a.t - b.t);
    out.sigs.sort((a, b) => a.t - b.t);
    return out;
  };

  // ---- notes -> instruments ----------------------------------------------------------------

  /** General MIDI note -> Tactus instrument (the one whose number is the note, else the first). */
  MI.gmArt = function (note) {
    const own = TC.drums.byId(note);
    if (own && own.midi === note) return own.id;
    const a = TC.DRUM_ARTS.find((x) => x.midi === note);
    return a ? a.id : null;
  };

  const artOf = (note, profile) => (profile ? TC.kits.artOfKey(profile, note) : MI.gmArt(note));

  // ---- building the score -----------------------------------------------------------------

  MI.toScore = function (midi, opts = {}) {
    const TPQ = TC.TPQ, scale = TPQ / midi.tpq;
    const grid = opts.grid || 240, tgrid = (grid * 2) / 3, useT = opts.triplets !== false;
    const bpm0 = opts.tempo || (midi.tempos.length ? midi.tempos[0].bpm : 120);
    const msTicks = (ms) => (ms / 1000) * (bpm0 / 60) * TPQ;

    // instruments, times in Tactus ticks
    const unknown = new Map();
    let hits = [];
    for (const n of midi.notes) {
      if (opts.track !== undefined && opts.track !== null && n.trk !== opts.track) continue;
      const art = artOf(n.note, opts.profile);
      if (art === null || !TC.drums.byId(art)) {
        unknown.set(n.note, (unknown.get(n.note) || 0) + 1);
        continue;
      }
      hits.push({ t: n.t * scale, art, vel: n.vel });
    }
    hits.sort((a, b) => a.t - b.t);

    // flam / drag: softer hits of the same instrument shortly before a main hit
    const graceWin = msTicks(70);
    const gone = new Set();
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const before = [];
      for (let j = i - 1; j >= 0 && h.t - hits[j].t < graceWin; j--) {
        if (hits[j].art === h.art && !gone.has(hits[j]) && hits[j].vel < h.vel && h.t - hits[j].t > 0) before.push(hits[j]);
      }
      if (before.length) {
        before.slice(0, 2).forEach((g) => gone.add(g));
        h.orn = before.length >= 2 ? 'drag' : 'flam';
      }
    }
    hits = hits.filter((h) => !gone.has(h));

    // bars: time signatures from the file (at bar starts), 4/4 otherwise
    const sigs = midi.sigs.map((s) => ({ t: s.t * scale, ts: s.ts })).filter((s) => TC.barTicks && s.ts[0] > 0 && [1, 2, 4, 8, 16, 32].includes(s.ts[1]));
    const last = hits.length ? hits[hits.length - 1].t + 1 : 1;
    const bars = []; // { t0, L, ts }
    let t0 = 0, ts = [4, 4], si = 0;
    while (t0 < last || !bars.length) {
      while (si < sigs.length && sigs[si].t <= t0 + 1) ts = sigs[si++].ts.slice();
      const L = TC.barTicks(ts);
      bars.push({ t0, L, ts: ts.slice() });
      t0 += L;
      if (bars.length > 2000) break;
    }
    const barAt = (t) => {
      for (let i = bars.length - 1; i >= 0; i--) if (t >= bars[i].t0 - 0.5) return i;
      return 0;
    };

    // snapping, beat by beat: straight or triplet grid
    const placed = []; // { bar, tick, art, vel, orn }
    const byBeat = new Map();
    for (const h of hits) {
      const bi = barAt(h.t), b = bars[bi], beat = TC.rhythm.beatTicks(b.ts);
      const k = Math.floor((h.t - b.t0 + grid / 2) / beat); // a hit just before the next beat belongs to it
      const key = bi + ':' + k;
      if (!byBeat.has(key)) byBeat.set(key, { bi, k, beat, list: [] });
      byBeat.get(key).list.push(h);
    }
    for (const g of byBeat.values()) {
      const b = bars[g.bi], base = b.t0 + g.k * g.beat;
      const snap = (t, step) => base + Math.round((t - base) / step) * step;
      const err = (step) => g.list.reduce((s, h) => s + Math.abs(h.t - snap(h.t, step)), 0);
      const eS = err(grid), eT = useT && g.beat % tgrid === 0 ? err(tgrid) : Infinity;
      // triplet only when the straight grid misses clearly and the triplet grid fits much better
      const step = eT < eS * 0.5 && eS > g.list.length * grid * 0.12 ? tgrid : grid;
      for (const h of g.list) {
        let t = snap(h.t, step);
        let bi = barAt(t);
        if (t >= bars[bi].t0 + bars[bi].L) bi++;
        if (bi >= bars.length) bars.push({ t0: t0, L: TC.barTicks(ts), ts: ts.slice() }), (t0 += TC.barTicks(ts));
        placed.push({ bar: bi, tick: Math.round(t - bars[bi].t0), art: h.art, vel: h.vel, orn: h.orn || null });
      }
    }

    // the score
    const doc = TC.emptyScore(bars.length);
    doc.meta.tempo = TC.clamp(Math.round(bpm0), 20, 400);
    if (opts.profile) {
      doc.meta.kit = opts.profile.id;
      doc.meta.kitName = opts.profile.name;
    }
    bars.forEach((b, i) => { doc.bars[i].ts = b.ts.slice(); });
    for (const tm of midi.tempos.slice(1)) {
      const bi = barAt(tm.t * scale), bpm = TC.clamp(Math.round(tm.bpm), 20, 400);
      if (bi > 0 || bpm !== doc.meta.tempo) doc.bars[bi].tempo = bpm;
    }
    for (const m of midi.markers) {
      const bi = barAt(m.t * scale);
      if (m.text) doc.bars[bi].marker = doc.bars[bi].marker ? doc.bars[bi].marker + ' / ' + m.text : m.text;
    }

    // same instrument twice on one position: the louder one
    const best = new Map();
    for (const q of placed) {
      const k = q.bar + ':' + q.tick + ':' + q.art;
      if (!best.has(k) || best.get(k).vel < q.vel) best.set(k, q);
    }
    const track = doc.tracks[0];
    const list = [...best.values()].sort((a, b) => a.bar - b.bar || a.tick - b.tick);
    // length of a note: up to the next one of its voice, at most to the end of its beat
    for (const q of list) {
      const art = TC.drums.byId(q.art), b = bars[q.bar], beat = TC.rhythm.beatTicks(b.ts);
      const next = list.find((x) => x.bar === q.bar && x.tick > q.tick && TC.drums.byId(x.art).voice === art.voice);
      const beatEnd = Math.min(b.L, (Math.floor(q.tick / beat) + 1) * beat);
      const dur = Math.max(1, Math.min(next ? next.tick : b.L, beatEnd) - q.tick);
      const note = TC.newDrumNote(q.art, {});
      TC.setLevel(note, TC.levelOfVelocity(q.vel)); // five steps: ghost · soft · normal · strong · accent
      if (q.orn) note.orn = q.orn;
      TC.score.place(doc, track, q.bar, art.voice, q.tick, dur, note);
    }
    // trailing empty bars (e.g. after the last note) are not needed
    while (doc.bars.length > 1 && track.bars[doc.bars.length - 1].voices.every((v) => !v.length) && !doc.bars[doc.bars.length - 1].marker) {
      doc.bars.pop();
      track.bars.pop();
    }
    return {
      doc, notes: list.length, merged: hits.length - list.length,
      unknown: [...unknown].map(([note, count]) => ({ note, count })).sort((a, b) => a.note - b.note),
    };
  };

  /**
   * Several MIDI tracks, each its own Tactus track: parts [{ track: index in midi.tracks, profile, name }].
   * Every part is read on its own (MI.toScore, with its own drum map); the bars are those of the file,
   * as long as the longest part. The first part's kit profile becomes the score's, another one the
   * track's own. Returns { doc, notes, merged, unknown } like MI.toScore.
   */
  MI.toScoreMulti = function (midi, parts, opts = {}) {
    const res = parts.map((p) => MI.toScore(midi, Object.assign({}, opts, { track: p.track, profile: p.profile })));
    const doc = res[0].doc;
    const longest = res.reduce((a, r) => (r.doc.bars.length > a.doc.bars.length ? r : a)).doc;
    while (doc.bars.length < longest.bars.length) {
      doc.bars.push(TC.clone(longest.bars[doc.bars.length]));
      doc.tracks[0].bars.push(TC.newTrackBar());
    }
    doc.tracks[0].name = parts[0].name || doc.tracks[0].name;
    res.slice(1).forEach((r, k) => {
      const p = parts[k + 1], t = TC.newTrack('drums', 0);
      t.name = p.name || TC.score.freeTrackName(doc, 'Drums');
      t.bars = doc.bars.map((h, i) => (r.doc.tracks[0].bars[i] ? TC.clone(r.doc.tracks[0].bars[i]) : TC.newTrackBar()));
      if ((p.profile || null) !== (parts[0].profile || null)) {
        t.profile = p.profile ? p.profile.id : 'gm';
        t.profileName = p.profile ? p.profile.name : '';
      }
      doc.tracks.push(t);
      doc.bars.forEach((h, i) => TC.score.fitBar(doc, t, i));
    });
    const unknown = new Map();
    res.forEach((r) => r.unknown.forEach((u) => unknown.set(u.note, (unknown.get(u.note) || 0) + u.count)));
    return {
      doc, notes: res.reduce((a, r) => a + r.notes, 0), merged: res.reduce((a, r) => a + r.merged, 0),
      unknown: [...unknown].map(([note, count]) => ({ note, count })).sort((a, b) => a.note - b.note),
    };
  };

  /** The MIDI tracks that look like drums (by name or channel 10); none: the drum track of MI.drumTrack. */
  MI.drumTracks = function (midi) {
    const list = midi.tracks.map((t, i) => Object.assign({ i }, t)).filter((t) => t.notes);
    const drums = list.filter((t) => DRUM_NAME.test(t.name) || t.channels.has(9)).map((t) => t.i);
    if (drums.length) return drums;
    const one = MI.drumTrack(midi);
    return one === null ? [] : [one];
  };

  // ---- dialog -----------------------------------------------------------------------------

  /**
   * Put bars `from` … `to` of an imported score (src) into `doc` from bar `at` on: their notes replace
   * those bars' notes, bars are added at the end if needed; takeTs: those bars get the time
   * signature of the file (otherwise notes beyond a shorter bar are cut); only: the track that gets the
   * notes (default: the first). Returns how many bars.
   */
  MI.insertInto = function (doc, src, at, from = 0, to = src.bars.length - 1, takeTs = true, only = doc.tracks[0]) {
    from = TC.clamp(from, 0, src.bars.length - 1);
    to = TC.clamp(to, from, src.bars.length - 1);
    const clip = TC.score.copyBars(src, from, to);
    if (takeTs) {
      clip.bars.forEach((c, k) => {
        const i = at + k;
        if (i < doc.bars.length && doc.bars[i].ts.join('/') !== c.ts.join('/')) TC.score.setTimeSig(doc, i, c.ts, true);
      });
    }
    return TC.score.pasteBars(doc, at, clip, only);
  };

  const tr = (s, v) => TC.tr(s, v);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const GRIDS = [
    { key: '16t', label: '1/16 + triplets', grid: 240, triplets: true },
    { key: '32t', label: '1/32 + triplets', grid: 120, triplets: true },
    { key: '8t', label: '1/8 + triplets', grid: 480, triplets: true },
    { key: '16', label: '1/16 (no triplets)', grid: 240, triplets: false },
    { key: '32', label: '1/32 (no triplets)', grid: 120, triplets: false },
  ];
  let root = null;

  MI.isOpen = () => !!root;
  MI.close = () => { if (root) root.remove(); root = null; };

  /** Choose a .mid file, then where it comes from and the grid; the result replaces the open score. */
  MI.pick = function () {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.mid,.midi,audio/midi';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => MI.open(new Uint8Array(r.result), f.name);
      r.readAsArrayBuffer(f);
    });
    inp.click();
  };

  /** Names of drum tracks (Drum, EZdrummer, Groove Agent, UJAM …). */
  const DRUM_NAME = /drum|schlag|ezd|groove ?agent|ujam|beat ?maker|superior|addictive|bfd|perc/i;
  /** The drum track of a file: by its name, by channel 10, else the fullest. */
  MI.drumTrack = function (midi) {
    const list = midi.tracks.map((t, i) => Object.assign({ i }, t)).filter((t) => t.notes);
    if (list.length <= 1) return list.length ? list[0].i : null;
    const named = list.filter((t) => DRUM_NAME.test(t.name));
    const ch10 = list.filter((t) => t.channels.has(9));
    const pool = named.length ? named : ch10.length ? ch10 : list;
    return pool.reduce((a, b) => (b.notes > a.notes ? b : a)).i;
  };

  MI.open = function (bytes, fileName) {
    let midi;
    try {
      midi = MI.parse(bytes);
    } catch (e) {
      alert(tr('This is not a MIDI file.'));
      return;
    }
    TC.kits.load();
    const S = TC.state;
    // the MIDI tracks with notes (tracks of automation only have none and are left out); ticked: the drum tracks
    const withNotes = midi.tracks.map((t, i) => Object.assign({ i }, t)).filter((t) => t.notes);
    const trackName = (t) => t.name || tr('Track {n}', { n: t.i + 1 });
    // where it comes from: the kit profile of the open score, else the last import (track names say little:
    // a track called "EZdrummer" may play Groove Agent)
    const cur = TC.kits.current(S.doc);
    const fileBpm = midi.tempos.length ? Math.round(midi.tempos[0].bpm) : 120;
    const st = {
      source: cur ? cur.id : S.settings.importKit && TC.kits.byId(S.settings.importKit) ? S.settings.importKit : '',
      grid: S.settings.importGrid || '16t',
      sel: new Set(MI.drumTracks(midi)), // the MIDI tracks to take, each becomes a Tactus track
      src: {},                          // … where each one comes from (kit profile id, '' = General MIDI)
      tempo: fileBpm,
      // into the open score (from a bar on) or as a new score
      target: S.settings.importTarget === 'into' ? 'into' : 'new',
      at: (S.selBar !== null ? S.selBar : 0) + 1,
      from: 1, to: 0, takeTs: true,
    };
    MI.close();
    root = document.createElement('div');
    root.className = 'dialog-backdrop';
    root.innerHTML = '<div class="dialog midi-dialog" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(root);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) MI.close(); });

    const srcOf = (i) => (st.src[i] !== undefined ? st.src[i] : st.source);
    const readOpts = () => {
      const g = GRIDS.find((x) => x.key === st.grid) || GRIDS[0];
      return { grid: g.grid, triplets: g.triplets, tempo: st.tempo };
    };
    /** The ticked MIDI tracks: [{ track, profile, name }] (a file with one track: that one). */
    const parts = () => (withNotes.length > 1 ? withNotes.filter((t) => st.sel.has(t.i)) : withNotes)
      .map((t) => ({ track: t.i, profile: srcOf(t.i) ? TC.kits.byId(srcOf(t.i)) : null, name: withNotes.length > 1 ? trackName(t) : '' }));
    const result = () => {
      const ps = parts();
      if (!ps.length) return MI.toScore(midi, Object.assign(readOpts(), { track: -1 })); // nothing ticked: empty
      return MI.toScoreMulti(midi, ps, readOpts());
    };
    /** Name of a key in the chosen drum map ("73 Floortom 2 Rimshot"), or just the number. */
    const keyName = (note) => {
      const p = st.source ? TC.kits.byId(st.source) : null;
      const e = p && TC.kits.map(p).entries.find((x) => x.inote === note);
      return e && !TC.kits.noName(e) ? note + ' ' + e.name : String(note);
    };
    const draw = () => {
      const res = result();
      const nb = res.doc.bars.length;
      const sources = [`<option value="">General MIDI (Guitar Pro …)</option>`]
        .concat(TC.kits.list.map((p) => `<option value="${p.id}"${p.id === st.source ? ' selected' : ''}>${esc(tr('Kit profile: {name}', { name: p.name }))}</option>`)).join('');
      const grids = GRIDS.map((g) => `<option value="${g.key}"${g.key === st.grid ? ' selected' : ''}>${esc(tr(g.label))}</option>`).join('');
      const srcOpts = (v) => [`<option value="">General MIDI (Guitar Pro …)</option>`]
        .concat(TC.kits.list.map((p) => `<option value="${p.id}"${p.id === v ? ' selected' : ''}>${esc(p.name)}</option>`)).join('');
      // several tracks: a tick for each (its name, its notes; channel 10 = drums) and where it comes from
      const tracks = withNotes.map((t) => `<div class="export-row">
          <label class="check"><input type="checkbox" data-k="sel" data-i="${t.i}"${st.sel.has(t.i) ? ' checked' : ''}> <b>${esc(trackName(t))}</b>
            <span class="muted">${tr('{n} notes', { n: t.notes })}${t.channels.has(9) ? ' · ' + tr('channel 10') : ''}</span></label>
          <select data-k="src" data-i="${t.i}"${st.sel.has(t.i) ? '' : ' disabled'}>${srcOpts(srcOf(t.i))}</select></div>`).join('');
      const unk = res.unknown.length
        ? `<p class="hint warn"><b>${tr('Keys without an instrument (left out):')}</b> ${res.unknown.map((u) => esc(keyName(u.note)) + ` (${u.count}×)`).join(', ')}</p>` : '';
      root.querySelector('.dialog').innerHTML = `<header><h2>${tr('Import MIDI')} <a class="help-link" href="hilfe.html#midi-import" target="tactus-help" title="${tr('Help: how this works')}">ⓘ</a></h2><button type="button" class="icon" data-k="close" title="${tr('Close')}">✕</button></header>
        <div class="kit-body">
          <p><b>${esc(fileName)}</b></p>
          ${withNotes.length > 1 ? `<p class="hint tight">${tr('Which tracks to take - each becomes a track of its own - and which drum map each comes from:')}</p>
          <div class="export-list">${tracks}</div>
          <div class="row"><label>${tr('All from')}</label><select data-k="source">${sources}</select></div>`
          : `<div class="row"><label>${tr('Comes from')}</label><select data-k="source">${sources}</select></div>`}
          <div class="row"><label>${tr('Grid')}</label><select data-k="grid">${grids}</select></div>
          <div class="row"><label>${tr('Tempo')}</label><input type="number" min="20" max="400" data-k="tempo" value="${st.tempo}"> <span class="muted">BPM${st.tempo !== fileBpm ? ' · ' + tr('in the file: {t}', { t: fileBpm }) : ''}</span></div>
          <p class="hint">${tr('{n} notes in {b} bars.', { n: res.notes, b: res.doc.bars.length })}
            ${res.merged ? tr('{m} hits merged (flam / drag or the same position).', { m: res.merged }) : ''}</p>
          ${unk}
          <div class="row"><label>${tr('Target')}</label><select data-k="target">
            <option value="new"${st.target === 'new' ? ' selected' : ''}>${tr('New score (replaces the open one)')}</option>
            <option value="into"${st.target === 'into' ? ' selected' : ''}>${tr('Into the open score')}</option></select></div>
          ${st.target === 'into' ? `
          <div class="row"><label>${tr('From bar')}</label><input type="number" min="1" max="${S.doc.bars.length + 1}" data-k="at" value="${st.at}">
            <span class="muted">${tr('of the open score')}</span></div>
          <div class="row"><label>${tr('From the file')}</label>${tr('bar')} <input type="number" min="1" max="${nb}" data-k="from" value="${st.from}">
            ${tr('to')} <input type="number" min="1" max="${nb}" data-k="to" value="${st.to || nb}"> <span class="muted">${tr('of {n}', { n: nb })}</span></div>
          <label class="check"><input type="checkbox" data-k="takeTs"${st.takeTs ? ' checked' : ''}> ${tr('Take the time signatures of the file')}</label>
          <p class="hint">${tr('The notes of those bars are replaced, bars are added at the end if needed. One undo step.')}</p>`
          : `<p class="hint">${tr('The import replaces the open score.')}</p>`}
          <p class="hint">${tr('Velocity: soft = ghost note, loud = accent.')}</p>
        </div>
        <footer><span class="grow"></span><button type="button" data-k="close">${tr('Cancel')}</button>
          <button type="button" class="primary" data-k="ok"${parts().length ? '' : ' disabled'}>${tr('Import')}</button></footer>`;
    };
    root.addEventListener('change', (e) => {
      const k = e.target.dataset.k, i = Number(e.target.dataset.i);
      if (k === 'sel') { if (e.target.checked) st.sel.add(i); else st.sel.delete(i); draw(); }
      if (k === 'src') { st.src[i] = e.target.value; draw(); }
      if (k === 'source') { st.source = e.target.value; st.src = {}; draw(); } // (every track)
      if (k === 'grid') { st.grid = e.target.value; draw(); }
      if (k === 'tempo') { st.tempo = TC.clamp(Math.round(Number(e.target.value) || fileBpm), 20, 400); draw(); }
      if (k === 'target') { st.target = e.target.value; draw(); }
      if (k === 'at' || k === 'from' || k === 'to') st[k] = Math.max(1, Math.round(Number(e.target.value) || 1));
      if (k === 'takeTs') st.takeTs = e.target.checked;
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      if (b.dataset.k === 'close') MI.close();
      if (b.dataset.k === 'ok' && st.target === 'into') {
        // into the open score: those bars' notes are replaced - one undo step
        const res = result(), nb = res.doc.bars.length;
        const at = TC.clamp(st.at - 1, 0, S.doc.bars.length);
        const from = TC.clamp(st.from - 1, 0, nb - 1), to = TC.clamp((st.to || nb) - 1, from, nb - 1);
        S.settings.importKit = st.source;
        S.settings.importGrid = st.grid;
        S.settings.importTarget = 'into';
        TC.saveSettings();
        MI.close();
        // one MIDI track: into the track being written; several: each into the track of its name (or a new one)
        const ps = parts();
        let n = 0;
        ps.forEach((p) => {
          const r = MI.toScore(midi, Object.assign(readOpts(), { track: p.track, profile: p.profile }));
          const into = ps.length === 1 ? TC.curTrack() : S.doc.tracks.find((t) => t.name === p.name) || TC.score.addTrack(S.doc, p.name);
          n = Math.max(n, MI.insertInto(S.doc, r.doc, at, from, to, st.takeTs, into));
        });
        S.selection.clear();
        TC.selectBar(at);
        if (n > 1) TC.selectBar(at + n - 1, true);
        TC.commit();
        TC.ui.hint(tr('MIDI bars {a}–{b} imported into bars {c}–{d}', { a: from + 1, b: to + 1, c: at + 1, d: at + n }));
        return;
      }
      if (b.dataset.k === 'ok') {
        if (S.dirty && !confirm(tr('Discard the changes of the open score?'))) return;
        S.settings.importTarget = 'new';
        const res = result();
        const title = fileName.replace(/\.midi?$/i, '');
        res.doc.meta.title = title;
        S.settings.importKit = st.source;
        S.settings.importGrid = st.grid;
        TC.saveSettings();
        MI.close();
        TC.storage.setDoc(res.doc, title + '.tactus.json');
        S.dirty = true;
        TC.actions.home();
        TC.refresh();
        TC.ui.hint(tr('MIDI imported: {n} notes', { n: res.notes }));
      }
    });
    draw();
  };
})(window.TC);
