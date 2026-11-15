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
  /** Melody: the written sign of a note -> <accidental>. */
  const ACC_NAME = { 2: 'double-sharp', 1: 'sharp', 0: 'natural', '-1': 'flat', '-2': 'flat-flat' };
  /** Melody: <mode> of a key, when the key signature is the scale's own (C major, A minor, D dorian …). */
  const MODES = { major: 'major', minor: 'minor', dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian', mixolydian: 'mixolydian', locrian: 'locrian' };
  function keyMode(scale, fifths) {
    const m = MODES[scale.id];
    if (!m) return '';
    // (the key signature of the scale's own root: e.g. a mode whose signature fits exactly)
    const exact = TC.pitch.lineMap(scale).every((x, l) => x.a === TC.pitch.sigAlter(fifths, l));
    return exact ? `<mode>${m}</mode>` : '';
  }

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

  /** A chord symbol (js/pitch.js) as <harmony>, at tick t of the bar. */
  function harmonyXml(ch, t) {
    const P = TC.pitch, q = P.qual(ch.q);
    const step = (r) => 'CDEFGAB'[r.l];
    const kind = q ? q.xml : 'other', text = P.chordName(Object.assign({}, ch, { root: { l: 0, a: 0 }, bass: null })).slice(1);
    const deg = (q && q.deg ? q.deg : []).map(([v, a, ty]) => `<degree><degree-value>${v}</degree-value><degree-alter>${a}</degree-alter><degree-type>${ty}</degree-type></degree>`).join('');
    return '<harmony>' + `<root><root-step>${step(ch.root)}</root-step>${ch.root.a ? `<root-alter>${ch.root.a}</root-alter>` : ''}</root>` +
      `<kind text="${esc(text)}">${kind}</kind>` +
      (ch.bass ? `<bass><bass-step>${step(ch.bass)}</bass-step>${ch.bass.a ? `<bass-alter>${ch.bass.a}</bass-alter>` : ''}</bass>` : '') +
      deg + (t ? `<offset>${t}</offset>` : '') + '</harmony>';
  }
  X.harmonyXml = harmonyXml;

  X.build = function (doc, opts = {}) {
    const tracks = opts.tracks || doc.tracks;
    // how signs and jumps are written (Guitar Pro reads them its own way - still being tried out):
    //   direction: <sound> inside the <direction> (standard)   measure: <sound> in the bar itself
    //   sign: To Coda with the coda sign as well               gp: the words of Guitar Pro (Da Coda, Dal Segno al Coda …)
    const J = Object.assign({ direction: true, measure: false, sign: true, gp: false }, opts.jumps);
    // (Segno Segno / Double Coda: their own names segno2 / coda2, so a jump finds its sign)
    const SOUND = { segno: 'segno', segnoSegno: 'segno2', coda: 'coda', doubleCoda: 'coda2' };
    const jumpText = (j) => {
      const I = TC.jumpInfo(j);
      const head = J.gp ? { start: 'Da Capo', segno: 'Dal Segno', segnoSegno: 'Dal Segno Segno' }[I.to] : { start: 'D.C.', segno: 'D.S.', segnoSegno: 'D.S.S.' }[I.to];
      return head + ({ fine: ' al Fine', coda: ' al Coda', doubleCoda: ' al Double Coda' }[I.al] || '');
    };
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
      if (t.kind === 'pitched') {
        // melody: one instrument with its channel and General MIDI program
        const ch = (Number.isInteger(t.midiCh) ? t.midiCh : t.channel || 0) + 1;
        o.push(`<score-part id="${pid(k)}"><part-name>${esc(t.name || 'Melody')}</part-name>` +
          `<score-instrument id="${pid(k)}-I1"><instrument-name>${esc(t.name || 'Melody')}</instrument-name></score-instrument>` +
          `<midi-instrument id="${pid(k)}-I1"><midi-channel>${ch}</midi-channel><midi-program>${(t.program || 0) + 1}</midi-program></midi-instrument></score-part>`);
        return;
      }
      o.push(`<score-part id="${pid(k)}"><part-name>${esc(t.name || 'Drums')}</part-name>`);
      instOf[k].forEach((a) => o.push(`<score-instrument id="${pid(k)}-I${a.id}"><instrument-name>${esc(D.label(a))}</instrument-name></score-instrument>`));
      instOf[k].forEach((a) => o.push(`<midi-instrument id="${pid(k)}-I${a.id}"><midi-channel>10</midi-channel><midi-unpitched>${a.midi + 1}</midi-unpitched></midi-instrument>`));
      o.push('</score-part>');
    });
    o.push('</part-list>');

    const bars = doc.bars;
    const vkey = (h) => (h && h.volta ? h.volta.join(',') : '');
    const swing = (meta.swing || 50) !== 50 && TC.render && TC.render.swingName ? (TC.tr ? TC.tr(TC.render.swingName(meta.swing)) : TC.render.swingName(meta.swing)) : '';

    // chord symbols: over the melody track whose scale they follow, else over the first part
    const ht = TC.pitch ? TC.score.harmonyTrack(doc) : null;
    const chordPart = TC.pitch ? (ht && tracks.includes(ht) ? ht : tracks.find((x) => x.kind === 'pitched') || tracks[0]) : null;

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
        const mel = t.kind === 'pitched', P = TC.pitch;
        const scale = mel ? TC.score.scaleAt(t, i) : null, fifths = mel ? P.fifths(scale) : 0;
        if (i === 0) attr.push(`<divisions>${DIV}</divisions>`);
        // key: melody its scale (first bar, changes), drums none
        if (i === 0 || (mel && fifths !== P.fifths(TC.score.scaleAt(t, i - 1)))) attr.push(`<key><fifths>${fifths}</fifths>${mel ? keyMode(scale, fifths) : ''}</key>`);
        if (!ts || ts.join('/') !== h.ts.join('/')) attr.push(`<time><beats>${h.ts[0]}</beats><beat-type>${h.ts[1]}</beat-type></time>`);
        if (i === 0 && mel) attr.push({ treble: '<clef><sign>G</sign><line>2</line></clef>', treble8: '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>', bass: '<clef><sign>F</sign><line>4</line></clef>' }[t.clef] || '<clef><sign>G</sign><line>2</line></clef>');
        else if (i === 0) attr.push('<clef><sign>percussion</sign><line>2</line></clef>' + (one ? '<staff-details><staff-lines>1</staff-lines></staff-details>' : ''));
        if (sim && !simPrev) attr.push('<measure-style><measure-repeat type="start">1</measure-repeat></measure-style>');
        else if (!sim && simPrev) attr.push('<measure-style><measure-repeat type="stop"/></measure-style>');
        if (attr.length) o.push('<attributes>' + attr.join('') + '</attributes>');
        ts = h.ts;
        // above the bar (the first part carries them, as usual): tempo (first bar, changes), swing, bar text, segno / coda
        if (k === 0) {
          const above = (inner, sound = '') => o.push(`<direction placement="above"><direction-type>${inner}</direction-type>${sound}</direction>`);
          const sign = (symbol, sound) => {
            above(symbol, J.direction ? `<sound ${sound}/>` : '');
            if (J.measure) o.push(`<sound ${sound}/>`);
          };
          const bpm = i === 0 ? meta.tempo : h.tempo && h.tempo !== run ? h.tempo : null;
          if (h.tempo) run = h.tempo;
          if (bpm) above(`<metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome>`, `<sound tempo="${bpm}"/>`);
          if (i === 0 && swing) above(`<words>${esc(swing + (meta.swingUnit === 16 ? ' (16)' : ''))}</words>`);
          if (h.marker) above(`<rehearsal>${esc(h.marker)}</rehearsal>`);
          if (/^segno/.test(h.mark)) sign(h.mark === 'segnoSegno' ? '<segno/><segno/>' : '<segno/>', `segno="${SOUND[h.mark]}"`);
          if (h.mark === 'coda' || h.mark === 'doubleCoda') sign(h.mark === 'doubleCoda' ? '<coda/><coda/>' : '<coda/>', `coda="${SOUND[h.mark]}"`);
        }
        // chord symbols: over the melody track the chords follow (else the first part), each at its place in the bar
        if (t === chordPart) TC.score.chordsIn(doc, i).forEach((x) => o.push(harmonyXml(x.ch, x.t)));

        // the notes: those the bar plays (a %-bar: the bar it repeats, for playback), voice by voice
        const src = TC.score.sourceBar(doc, i, t);
        const bar = t.bars[src];
        const voices = bar.voices.map((v) => R.layout(v, h.ts, t.kind === 'drums', h.beam, t.fill));
        const used = voices.map((items) => items.some((it) => it.kind === 'note'));
        // melody: how each note is spelled and which ones carry a sign (as drawn)
        // (a note tied on from before carries no sign again)
        const sb = mel ? P.spellBar([].concat(...voices.map((items, vi) => items.filter((it) => it.kind === 'note')
          .map((it) => it.ev.notes.map((n) => ({ tick: it.tick, n,
            cont: it.cont || (it.tick === it.ev.tick && !!TC.score.tiedFrom(doc, t, src, vi, it.ev, n)) }))))).flat(), scale, t.clef) : null;
        let first = true;
        voices.forEach((items, vi) => {
          if (!used[vi] && (vi > 0 || used.some(Boolean))) return; // an empty voice: left out (voice 1 keeps its whole-bar rest)
          if (!first) o.push(`<backup><duration>${L}</duration></backup>`);
          first = false;
          const voice = vi + 1, stem = vi % 2 === 0 ? 'up' : 'down', two = used.filter(Boolean).length > 1;
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
            if (mel) {
              // melody: pitch (as spelled), its sign, ties within the bar (it.tie / it.cont), accents
              const ns = it.ev.notes.slice().sort((x, y) => x.pitch - y.pitch);
              const bm = beams.get(it), acc = Math.max(...ns.map((n) => n.accent || 0));
              ns.forEach((n, c) => {
                const sp = sb.spell.get(n.id), step = 'CDEFGAB'[((sp.dia % 7) + 7) % 7], oct = Math.floor(sp.dia / 7);
                const sign = sb.acc.get(it.tick + ':' + n.id);
                // tied: inside the note (it.cont / it.tie), or to / from another note (also over the bar line)
                const tStop = it.cont || (it.tick === it.ev.tick && !!TC.score.tiedFrom(doc, t, src, vi, it.ev, n));
                const tStart = it.tie || !!TC.score.tiedTo(doc, t, src, vi, it.ev, n);
                const nots = [];
                if (tStop) nots.push('<tied type="stop"/>');
                if (tStart) nots.push('<tied type="start"/>');
                if (c === 0 && tupN) nots.push(tupN);
                if (c === 0 && acc && !it.cont) nots.push(`<articulations>${acc > 1 ? '<strong-accent type="up"/>' : '<accent/>'}</articulations>`);
                o.push('<note>' + (c ? '<chord/>' : '') + `<pitch><step>${step}</step>${sp.a ? `<alter>${sp.a}</alter>` : ''}<octave>${oct}</octave></pitch>` +
                  `<duration>${it.dur}</duration>` + (tStop ? '<tie type="stop"/>' : '') + (tStart ? '<tie type="start"/>' : '') +
                  `<instrument id="${pid(k)}-I1"/><voice>${voice}</voice><type>${TYPES[it.base] || 'quarter'}</type>` + (it.dots ? '<dot/>' : '') +
                  (sign !== undefined ? `<accidental>${ACC_NAME[sign]}</accidental>` : '') + tm +
                  (two ? `<stem>${stem}</stem>` : '') + // (two voices in the bar: voice 1 up, voice 2 down; one voice: the reader decides)
                  (c === 0 && bm ? bm.map((b, lv) => `<beam number="${lv + 1}">${b}</beam>`).join('') : '') +
                  (nots.length ? `<notations>${nots.join('')}</notations>` : '') + '</note>');
              });
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

        // at the end of the bar: Fine, To Coda, D.C. / D.S. (the text, a sign if it has one - To Coda ⊕ -, its <sound>)
        const end = (words, sound, sign = '') => {
          const sd = J.direction ? `<sound ${sound}/>` : '';
          o.push(`<direction placement="above"><direction-type><words>${esc(words)}</words></direction-type>` +
            (sign && J.sign ? `<direction-type>${sign}</direction-type>` : '') + sd + '</direction>');
          if (J.measure) o.push(`<sound ${sound}/>`);
        };
        if (k === 0 && h.end === 'fine') end('Fine', 'fine="yes"');
        if (k === 0 && h.end === 'toCoda') end(J.gp ? 'Da Coda' : 'To Coda', 'tocoda="coda"', '<coda/>');
        if (k === 0 && h.end === 'toDoubleCoda') end(J.gp ? 'Da Double Coda' : 'To Coda', 'tocoda="coda2"', '<coda/><coda/>');
        if (k === 0 && h.jump) {
          const I = TC.jumpInfo(h.jump);
          end(jumpText(h.jump), I.to === 'start' ? 'dacapo="yes"' : `dalsegno="${SOUND[I.to]}"`);
        }
        // right bar line: :| (n times), the end of an ending, the final bar
        const vEnd = h.volta && vkey(bars[i + 1]) !== vkey(h);
        const closed = vEnd && (h.repeatEnd > 1 || (bars[i + 1] && bars[i + 1].volta));
        const last = i === bars.length - 1;
        // an ending going back without a :| of its own (a later ending waits): written with :|, as other programs need it
        const back = h.repeatEnd > 1 || TC.score.endingGoesBack(doc, i);
        if (back || vEnd || last) {
          o.push('<barline location="right">' + (back || last ? '<bar-style>light-heavy</bar-style>' : '') +
            (vEnd ? `<ending number="${h.volta.join(', ')}" type="${closed ? 'stop' : 'discontinue'}"/>` : '') +
            (back ? `<repeat direction="backward"${h.repeatEnd > 2 ? ` times="${h.repeatEnd}"` : ''}/>` : '') + '</barline>');
        }
        o.push('</measure>');
      });
      o.push('</part>');
    });
    o.push('</score-partwise>');
    return o.join('\n');
  };
})(window.TC);
