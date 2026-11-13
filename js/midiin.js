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
 *   velocity     below 64: ghost note, above 108: accent (as played back: ghost 38, normal 91, accent 127)
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
      if (q.vel < 64) note.ghost = true;
      else if (q.vel > 108) note.accent = 1;
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

  // ---- dialog -----------------------------------------------------------------------------

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

  /** The drum track of a file: by its name (Drum, EZdrummer, Groove Agent, UJAM …), by channel 10, else the fullest. */
  MI.drumTrack = function (midi) {
    const list = midi.tracks.map((t, i) => Object.assign({ i }, t)).filter((t) => t.notes);
    if (list.length <= 1) return list.length ? list[0].i : null;
    const named = list.filter((t) => /drum|schlag|ezd|groove ?agent|ujam|beat ?maker|superior|addictive|bfd|perc/i.test(t.name));
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
    const track = MI.drumTrack(midi);
    // where it comes from: the kit profile of the open score, else the last import (track names say little:
    // a track called "EZdrummer" may play Groove Agent)
    const cur = TC.kits.current(S.doc);
    const fileBpm = midi.tempos.length ? Math.round(midi.tempos[0].bpm) : 120;
    const st = {
      source: cur ? cur.id : S.settings.importKit && TC.kits.byId(S.settings.importKit) ? S.settings.importKit : '',
      grid: S.settings.importGrid || '16t',
      track: track === null ? 'all' : String(track),
      tempo: fileBpm,
    };
    MI.close();
    root = document.createElement('div');
    root.className = 'dialog-backdrop';
    root.innerHTML = '<div class="dialog midi-dialog" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(root);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) MI.close(); });

    const result = () => {
      const g = GRIDS.find((x) => x.key === st.grid) || GRIDS[0];
      return MI.toScore(midi, { profile: st.source ? TC.kits.byId(st.source) : null, grid: g.grid, triplets: g.triplets,
        track: st.track === 'all' ? null : +st.track, tempo: st.tempo });
    };
    /** Name of a key in the chosen drum map ("73 Floortom 2 Rimshot"), or just the number. */
    const keyName = (note) => {
      const p = st.source ? TC.kits.byId(st.source) : null;
      const e = p && TC.kits.map(p).entries.find((x) => x.inote === note);
      return e && !TC.kits.noName(e) ? note + ' ' + e.name : String(note);
    };
    const draw = () => {
      const res = result();
      const sources = [`<option value="">General MIDI (Guitar Pro …)</option>`]
        .concat(TC.kits.list.map((p) => `<option value="${p.id}"${p.id === st.source ? ' selected' : ''}>${esc(tr('Kit profile: {name}', { name: p.name }))}</option>`)).join('');
      const grids = GRIDS.map((g) => `<option value="${g.key}"${g.key === st.grid ? ' selected' : ''}>${esc(tr(g.label))}</option>`).join('');
      const withNotes = midi.tracks.map((t, i) => Object.assign({ i }, t)).filter((t) => t.notes);
      const tracks = (withNotes.length > 1 ? [`<option value="all"${st.track === 'all' ? ' selected' : ''}>${tr('All tracks')}</option>`] : [])
        .concat(withNotes.map((t) => `<option value="${t.i}"${String(t.i) === st.track ? ' selected' : ''}>${esc(t.name || tr('Track {n}', { n: t.i + 1 }))} (${tr('{n} notes', { n: t.notes })})</option>`)).join('');
      const unk = res.unknown.length
        ? `<p class="hint warn"><b>${tr('Keys without an instrument (left out):')}</b> ${res.unknown.map((u) => esc(keyName(u.note)) + ` (${u.count}×)`).join(', ')}</p>` : '';
      root.querySelector('.dialog').innerHTML = `<header><h2>${tr('Import MIDI')}</h2><button type="button" class="icon" data-k="close" title="${tr('Close')}">✕</button></header>
        <div class="kit-body">
          <p><b>${esc(fileName)}</b></p>
          ${withNotes.length > 1 ? `<div class="row"><label>${tr('Track')}</label><select data-k="track">${tracks}</select></div>` : ''}
          <div class="row"><label>${tr('Comes from')}</label><select data-k="source">${sources}</select></div>
          <div class="row"><label>${tr('Grid')}</label><select data-k="grid">${grids}</select></div>
          <div class="row"><label>${tr('Tempo')}</label><input type="number" min="20" max="400" data-k="tempo" value="${st.tempo}"> <span class="muted">BPM${st.tempo !== fileBpm ? ' · ' + tr('in the file: {t}', { t: fileBpm }) : ''}</span></div>
          <p class="hint">${tr('{n} notes in {b} bars.', { n: res.notes, b: res.doc.bars.length })}
            ${res.merged ? tr('{m} hits merged (flam / drag or the same position).', { m: res.merged }) : ''}</p>
          ${unk}
          <p class="hint">${tr('The import replaces the open score. Velocity: soft = ghost note, loud = accent.')}</p>
        </div>
        <footer><span class="grow"></span><button type="button" data-k="close">${tr('Cancel')}</button>
          <button type="button" class="primary" data-k="ok">${tr('Import')}</button></footer>`;
    };
    root.addEventListener('change', (e) => {
      const k = e.target.dataset.k;
      if (k === 'source' || k === 'grid' || k === 'track') { st[k] = e.target.value; draw(); }
      if (k === 'tempo') { st.tempo = TC.clamp(Math.round(Number(e.target.value) || fileBpm), 20, 400); draw(); }
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      if (b.dataset.k === 'close') MI.close();
      if (b.dataset.k === 'ok') {
        if (S.dirty && !confirm(tr('Discard the changes of the open score?'))) return;
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
