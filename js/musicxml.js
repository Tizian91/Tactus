'use strict';
/*
 * MusicXML export (score-partwise 3.1): for Guitar Pro, MuseScore, Sibelius, Dorico, Finale.
 *
 *   TC.musicxml.build(doc, { tracks }) -> string (the .musicxml file)
 *
 * Every track becomes a part: a percussion staff (one line for a one-line track) whose instruments
 * each name their General MIDI key (<midi-unpitched>), so the importing program finds the sound. The
 * notes are written as Tactus draws them (js/rhythm.js layout: values, rests, dots, triplets, beams,
 * the rest cleanup), in two voices (stems up / down), with:
 *   notehead (x, ⊗, diamond …), ghost note (in brackets), accent / strong accent, flam / drag (grace
 *   notes), roll (tremolo strokes), sticking (R / L as text under the note), %-bars (measure repeat,
 *   with the notes written for playback), time signatures, tempo and tempo changes, swing as text,
 *   bar texts (rehearsal marks), repeats (|: :| n×), endings (1. / 2.), segno / coda / Fine / To Coda /
 *   D.C. / D.S. (with their <sound> for playback), line breaks of the page view.
 */
(function (TC) {
  const X = (TC.musicxml = {});
  const DIV = TC.TPQ; // divisions per quarter: the Tactus ticks themselves (960)
  const TYPES = { 3840: 'whole', 1920: 'half', 960: 'quarter', 480: 'eighth', 240: '16th', 120: '32nd', 60: '64th' };
  /** Tactus noteheads -> MusicXML <notehead>. */
  const HEADS = { normal: 'normal', x: 'x', circleX: 'circle-x', circleSlash: 'slashed', heavyX: 'x', heavyXHat: 'x', diamond: 'diamond', triangle: 'triangle', slashed: 'slashed' };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Display position of a staff line (0 = top line, half spaces down) as in a treble clef: F5 is the top line. */
  X.display = function (line) {
    const v = 38 - line; // F5 = 5 * 7 + 3
    return { step: 'CDEFGAB'[((v % 7) + 7) % 7], octave: Math.floor(v / 7) };
  };

  /** Beam levels of the note items of a voice: Map item -> ['begin' | 'continue' | 'end' | 'forward hook' | 'backward hook', …]. */
  function beamsOf(items, ts, beam) {
    const out = new Map();
    for (const g of TC.rhythm.beams(items, ts, beam)) {
      const fl = g.map((it) => TC.rhythm.flags(it.base));
      g.forEach((it, k) => out.set(it, [k === 0 ? 'begin' : k === g.length - 1 ? 'end' : 'continue']));
      for (let lev = 2; lev <= Math.max(...fl); lev++) {
        let k = 0;
        while (k < g.length) {
          if (fl[k] < lev) { k++; continue; }
          let j = k;
          while (j + 1 < g.length && fl[j + 1] >= lev) j++;
          if (j > k) for (let m = k; m <= j; m++) out.get(g[m])[lev - 1] = m === k ? 'begin' : m === j ? 'end' : 'continue';
          else out.get(g[k])[lev - 1] = k > 0 && (k === g.length - 1 || fl[k - 1] >= fl[k + 1]) ? 'backward hook' : 'forward hook';
          k = j + 1;
        }
      }
    }
    return out;
  }

  X.build = function (doc, opts = {}) {
    const tracks = opts.tracks || doc.tracks;
    const D = TC.drums, R = TC.rhythm;
    const meta = doc.meta || {};
    const o = [];
    o.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
    o.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
    o.push('<score-partwise version="3.1">');
    if (meta.title) o.push(`<work><work-title>${esc(meta.title)}</work-title></work>`);
    if (meta.subtitle) o.push(`<movement-title>${esc(meta.subtitle)}</movement-title>`);
    o.push('<identification>');
    if (meta.artist) o.push(`<creator type="artist">${esc(meta.artist)}</creator>`);
    o.push('<encoding><software>Tactus</software>' + (opts.date ? `<encoding-date>${opts.date}</encoding-date>` : '') + '</encoding></identification>');

    // the instruments of each part: every one it plays (and, for a track of its own instruments, those)
    const pid = (k) => 'P' + (k + 1);
    const instOf = tracks.map((t) => {
      const ids = new Set();
      t.bars.forEach((b) => b.voices.forEach((v) => v.forEach((ev) => ev.notes.forEach((n) => ids.add(n.art)))));
      if (D.ownKit(t)) t.kit.forEach((id) => ids.add(id));
      return [...ids].map((id) => D.byId(id)).filter(Boolean).sort((a, b) => a.midi - b.midi);
    });
    o.push('<part-list>');
    tracks.forEach((t, k) => {
      o.push(`<score-part id="${pid(k)}"><part-name>${esc(t.name || 'Drums')}</part-name>`);
      instOf[k].forEach((a) => o.push(`<score-instrument id="${pid(k)}-I${a.id}"><instrument-name>${esc(D.label(a))}</instrument-name></score-instrument>`));
      instOf[k].forEach((a) => o.push(`<midi-instrument id="${pid(k)}-I${a.id}"><midi-channel>10</midi-channel><midi-unpitched>${a.midi + 1}</midi-unpitched></midi-instrument>`));
      o.push('</score-part>');
    });
    o.push('</part-list>');

    const bars = doc.bars;
    const vkey = (h) => (h && h.volta ? h.volta.join(',') : '');
    const swing = (meta.swing || 50) !== 50 && TC.render && TC.render.swingName ? (TC.tr ? TC.tr(TC.render.swingName(meta.swing)) : TC.render.swingName(meta.swing)) : '';

    tracks.forEach((t, k) => {
      o.push(`<part id="${pid(k)}">`);
      const one = D.oneLine(t);
      let ts = null, run = meta.tempo;
      bars.forEach((h, i) => {
        const L = TC.barTicks(h.ts);
        o.push(`<measure number="${i + 1}">`);
        if (h.lineBreak && i > 0) o.push('<print new-system="yes"/>');
        // left bar line: |: and the start of an ending
        const vStart = h.volta && vkey(bars[i - 1]) !== vkey(h);
        if (h.repeatStart || vStart) {
          o.push('<barline location="left">' + (h.repeatStart ? '<bar-style>heavy-light</bar-style>' : '') +
            (vStart ? `<ending number="${h.volta.join(', ')}" type="start">${h.volta.join('., ')}.</ending>` : '') +
            (h.repeatStart ? '<repeat direction="forward"/>' : '') + '</barline>');
        }
        // attributes: divisions, clef, staff lines (first bar), time signature (when it changes), %-bars
        const sim = !!t.bars[i].simile && i > 0, simPrev = i > 0 && !!t.bars[i - 1].simile && i > 1;
        const attr = [];
        if (i === 0) attr.push(`<divisions>${DIV}</divisions><key><fifths>0</fifths></key>`);
        if (!ts || ts.join('/') !== h.ts.join('/')) attr.push(`<time><beats>${h.ts[0]}</beats><beat-type>${h.ts[1]}</beat-type></time>`);
        if (i === 0) attr.push('<clef><sign>percussion</sign><line>2</line></clef>' + (one ? '<staff-details><staff-lines>1</staff-lines></staff-details>' : ''));
        if (sim && !simPrev) attr.push('<measure-style><measure-repeat type="start">1</measure-repeat></measure-style>');
        else if (!sim && simPrev) attr.push('<measure-style><measure-repeat type="stop"/></measure-style>');
        if (attr.length) o.push('<attributes>' + attr.join('') + '</attributes>');
        ts = h.ts;
        // above the bar (the first part carries them, as usual): tempo (first bar, changes), swing, bar text, segno / coda
        if (k === 0) {
          const above = (inner, sound = '') => o.push(`<direction placement="above"><direction-type>${inner}</direction-type>${sound}</direction>`);
          const bpm = i === 0 ? meta.tempo : h.tempo && h.tempo !== run ? h.tempo : null;
          if (h.tempo) run = h.tempo;
          if (bpm) above(`<metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome>`, `<sound tempo="${bpm}"/>`);
          if (i === 0 && swing) above(`<words>${esc(swing + (meta.swingUnit === 16 ? ' (16)' : ''))}</words>`);
          if (h.marker) above(`<rehearsal>${esc(h.marker)}</rehearsal>`);
          if (h.mark === 'segno') above('<segno/>', '<sound segno="segno"/>');
          if (h.mark === 'coda') above('<coda/>', '<sound coda="coda"/>');
        }

        // the notes: those the bar plays (a %-bar: the bar it repeats, for playback), voice by voice
        const src = TC.score.sourceBar(doc, i, t);
        const bar = t.bars[src];
        const voices = bar.voices.map((v) => R.layout(v, h.ts, t.kind === 'drums', h.beam, t.fill));
        const used = voices.map((items) => items.some((it) => it.kind === 'note'));
        let first = true;
        voices.forEach((items, vi) => {
          if (!used[vi] && (vi > 0 || used.some(Boolean))) return; // an empty voice: left out (voice 1 keeps its whole-bar rest)
          if (!first) o.push(`<backup><duration>${L}</duration></backup>`);
          first = false;
          const voice = vi + 1, stem = vi % 2 === 0 ? 'up' : 'down';
          const beams = beamsOf(items, h.ts, h.beam);
          const tupFirst = new Set(), tupLast = new Set();
          const tups = new Map();
          items.forEach((it) => { if (it.tup) { if (!tups.has(it.tup.s)) tups.set(it.tup.s, []); tups.get(it.tup.s).push(it); } });
          tups.forEach((list) => { tupFirst.add(list[0]); tupLast.add(list[list.length - 1]); });
          for (const it of items) {
            const tm = it.tup ? `<time-modification><actual-notes>${it.tup.n || 3}</actual-notes><normal-notes>${it.tup.m || 2}</normal-notes></time-modification>` : '';
            const tupN = (tupFirst.has(it) ? '<tuplet type="start" bracket="no"/>' : '') + (tupLast.has(it) ? '<tuplet type="stop"/>' : '');
            if (it.kind === 'rest') {
              if (it.measure) {
                o.push(`<note><rest measure="yes"/><duration>${L}</duration><voice>${voice}</voice></note>`);
                continue;
              }
              o.push(`<note><rest/><duration>${it.dur}</duration><voice>${voice}</voice><type>${TYPES[it.base] || 'quarter'}</type>` +
                (it.dots ? '<dot/>' : '') + tm + (tupN ? `<notations>${tupN}</notations>` : '') + '</note>');
              continue;
            }
            const notes = it.ev.notes.slice().map((n) => ({ n, a: D.byId(n.art) })).filter((x) => x.a)
              .sort((x, y) => D.lineOf(x.a, t) - D.lineOf(y.a, t));
            if (!notes.length) continue;
            const unp = (x) => {
              const p = X.display(D.lineOf(x.a, t));
              return `<unpitched><display-step>${p.step}</display-step><display-octave>${p.octave}</display-octave></unpitched>`;
            };
            const head = (x) => `<notehead${x.n.ghost ? ' parentheses="yes"' : ''}>${HEADS[D.headOf(x.n)] || 'normal'}</notehead>`;
            const inst = (x) => `<instrument id="${pid(k)}-I${x.a.id}"/>`;
            // flam / drag: grace notes before the note (on its instrument)
            if (!it.cont) {
              notes.forEach((x) => {
                if (!x.n.orn) return;
                const cnt = x.n.orn === 'drag' ? 2 : 1;
                for (let g = 0; g < cnt; g++) {
                  o.push(`<note><grace${cnt === 1 ? ' slash="yes"' : ''}/>${unp(x)}${inst(x)}<voice>${voice}</voice><type>${cnt === 1 ? 'eighth' : '16th'}</type>` +
                    `<stem>up</stem><notehead>${HEADS[D.headOf(x.n)] || 'normal'}</notehead>` +
                    (cnt === 2 ? `<beam number="1">${g ? 'end' : 'begin'}</beam><beam number="2">${g ? 'end' : 'begin'}</beam>` : '') + '</note>');
                }
              });
            }
            const acc = Math.max(...notes.map((x) => x.n.accent || 0));
            const trem = Math.max(...notes.map((x) => x.n.trem || 0));
            const stick = it.cont ? '' : [...new Set(notes.map((x) => x.n.stick).filter(Boolean))].join('');
            const bm = beams.get(it);
            notes.forEach((x, c) => {
              const nots = [];
              if (c === 0) {
                if (tupN) nots.push(tupN);
                if (acc && !it.cont) nots.push(`<articulations>${acc > 1 ? '<strong-accent type="up"/>' : '<accent/>'}</articulations>`);
                if (trem) nots.push(`<ornaments><tremolo type="single">${trem}</tremolo></ornaments>`);
              }
              o.push('<note>' + (c ? '<chord/>' : '') + unp(x) + `<duration>${it.dur}</duration>` + inst(x) + `<voice>${voice}</voice>` +
                `<type>${TYPES[it.base] || 'quarter'}</type>` + (it.dots ? '<dot/>' : '') + tm + `<stem>${stem}</stem>` + head(x) +
                (c === 0 && bm ? bm.map((b, lv) => `<beam number="${lv + 1}">${b}</beam>`).join('') : '') +
                (nots.length ? `<notations>${nots.join('')}</notations>` : '') +
                (c === 0 && stick ? `<lyric number="1" placement="below"><syllabic>single</syllabic><text>${esc(stick)}</text></lyric>` : '') + '</note>');
            });
          }
        });

        // at the end of the bar: Fine, To Coda, D.C. / D.S.
        const end = (words, sound) => o.push(`<direction placement="above"><direction-type><words>${esc(words)}</words></direction-type><sound ${sound}/></direction>`);
        if (k === 0 && h.end === 'fine') end('Fine', 'fine="yes"');
        if (k === 0 && h.end === 'toCoda') end('To Coda', 'tocoda="coda"');
        if (k === 0 && h.jump) {
          const txt = { dc: 'D.C.', dcFine: 'D.C. al Fine', dcCoda: 'D.C. al Coda', ds: 'D.S.', dsFine: 'D.S. al Fine', dsCoda: 'D.S. al Coda' }[h.jump];
          end(txt, h.jump.startsWith('dc') ? 'dacapo="yes"' : 'dalsegno="segno"');
        }
        // right bar line: :| (n times), the end of an ending, the final bar
        const vEnd = h.volta && vkey(bars[i + 1]) !== vkey(h);
        const closed = vEnd && (h.repeatEnd > 1 || (bars[i + 1] && bars[i + 1].volta));
        const last = i === bars.length - 1;
        if (h.repeatEnd > 1 || vEnd || last) {
          o.push('<barline location="right">' + (h.repeatEnd > 1 || last ? '<bar-style>light-heavy</bar-style>' : '') +
            (vEnd ? `<ending number="${h.volta.join(', ')}" type="${closed ? 'stop' : 'discontinue'}"/>` : '') +
            (h.repeatEnd > 1 ? `<repeat direction="backward"${h.repeatEnd > 2 ? ` times="${h.repeatEnd}"` : ''}/>` : '') + '</barline>');
        }
        o.push('</measure>');
      });
      o.push('</part>');
    });
    o.push('</score-partwise>');
    return o.join('\n');
  };
})(window.TC);
