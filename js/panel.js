'use strict';
/*
 * The two panels.
 *
 *   Note panel (left; right in left-handed mode) - what every note needs, made to be
 *   operated with the other hand while the pen / mouse writes:
 *     note value (+ dotted, triplet = also the click grid), instrument lock,
 *     instrument (only the drum kit), accent, ghost note, notehead, delete
 *   Settings panel (the other side) - things set once or rarely:
 *     bar (time signature, insert / delete), score (title, tempo), drum kit and drum map,
 *     view (left-handed mode), keyboard shortcuts
 *
 * With notes selected, the note panel shows and changes their values.
 * Controls carry data attributes and are handled by event delegation:
 *   data-action="name" data-value="…"  -> TC.actions[name](value)
 *   data-meta="title|…"                -> score info (on change)
 *   data-ts                            -> time signature of the selected bar
 * Width handles and collapse buttons as in MindMapper (panel.js there).
 */
(function (TC) {
  const S = TC.state;
  const P = (TC.panel = {});
  const tr = (s, v) => TC.tr(s, v);
  const esc = (s) => TC.render.esc(s);
  const PANEL_MIN = 210, PANEL_MAX = 480, PANEL_DEFAULT = 270;
  const NOTE_GLYPH = { 1: '', 2: '', 4: '', 8: '', 16: '', 32: '', 64: '' };
  const VALUE_NAME = { 1: 'Whole', 2: 'Half', 4: 'Quarter', 8: 'Eighth', 16: 'Sixteenth', 32: '32nd', 64: '64th' };
  const de = () => TC.getLang() === 'de';
  let notesRoot, setRoot, lastNotes = '', lastSet = '';

  const btn = (action, value, label, active, title, cls = '') =>
    `<button type="button" class="${cls}${active ? ' active' : ''}" data-action="${action}"${value !== undefined ? ` data-value="${esc(value)}"` : ''}` +
    `${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
  const check = (action, on, label, value) =>
    `<label class="check"><input type="checkbox" data-action="${action}"${value !== undefined ? ` data-value="${value}"` : ''}${on ? ' checked' : ''}> ${label}</label>`;
  const head = (title, side) => `<div class="panel-head-row top"><span class="panel-title">${esc(title)}</span>
    <button type="button" class="panel-close-btn" data-action="${side === 'right' ? 'togglePanelRight' : 'togglePanel'}" title="${esc(tr('Collapse panel'))}">×</button></div>`;

  /** The first selected note (the note panel shows its values), or null. */
  function selectedNote() {
    for (const id of S.selection) {
      const hit = TC.score.findNote(S.doc, id);
      if (hit) return hit;
    }
    return null;
  }

  // ---- Note panel ------------------------------------------------------------------------------

  /** Tools: write / select / eraser (keys W / V / E). */
  function toolSection() {
    const t = S.tool || 'write';
    const hint = { select: 'Frame: drag on an empty place · Shift + click: add · drag a note: move the selection',
      erase: 'Tap or wipe over notes · two fingers: scroll' }[t];
    return `<section class="tools"><div class="seg tool-seg">
        ${btn('setTool', 'write', '✏ ' + tr('Write'), t === 'write', tr('Write notes (W)'))}
        ${btn('setTool', 'select', '⬚ ' + tr('Select'), t === 'select', tr('Select and move several notes (V)'))}
        ${btn('setTool', 'erase', '⌫ ' + tr('Erase'), t === 'erase', tr('Eraser: tap or wipe over notes (E)'))}
      </div>${hint ? `<p class="hint tight">${tr(hint)}</p>` : ''}</section>`;
  }

  function valueSection() {
    // notes selected: their value (the buttons change them only); otherwise the setting for the next notes
    const sel = S.selection.size ? TC.actions.selectedValue() : null;
    const inp = sel || S.input, inpNext = S.input;
    const vals = TC.VALUES.map((v, k) => btn('setValue', v, `<span class="mus-btn">${NOTE_GLYPH[v]}</span>`, inp.value === v,
      `${tr(VALUE_NAME[v])} (${k + 1})`)).join('');
    const grid = TC.gridTicks(inpNext), own = inpNext.grid;
    const gridName = own ? `1/${parseInt(own, 10)}${/t$/.test(own) ? ' ' + tr('triplet') : ''}` : inpNext.triplet ? `1/${inpNext.value} ${tr('triplet')}` : inpNext.dotted ? `1/${inpNext.value * 2}` : `1/${inpNext.value}`;
    // the grid: that of the note value, or one of its own (a quarter chord on every sixteenth)
    const grids = TC.GRIDS.map((g) => `<option value="${g}"${g === (own || '') ? ' selected' : ''}>${g ? `1/${parseInt(g, 10)}${/t$/.test(g) ? ' ' + esc(tr('triplet')) : ''}` : esc(tr('Auto (note value)'))}</option>`).join('');
    return `<section><h3>${tr('Note value')}</h3>
      <div class="values">${vals}</div>
      <div class="btn-row two">
        ${btn('toggleDotted', undefined, `<span class="mus-btn sm"></span> ${tr('Dotted')}`, inp.dotted, tr('Dotted (.)'))}
        ${btn('toggleTriplet', undefined, `<b>3</b>&nbsp;${tr('Triplet')}`, inp.triplet, tr('Triplet (T)'))}
      </div>
      <div class="row"><label>${tr('Click grid')}</label><select data-action="setGrid">${grids}</select></div>
      <p class="hint">${tr('Click grid')}: <b>${gridName}</b> (${grid} ticks)${own ? ' · ' + tr('notes as long as the note value, on every place of the grid') : ''}${S.selection.size ? ' · ' + tr('the buttons change only the selected notes') : ''}</p>
    </section>`;
  }

  function instrumentSection(cur) {
    const show = TC.drums.kit();
    show.add(cur);
    const groups = Object.keys(TC.DRUM_ELEMENTS).map((el) => {
      const arts = TC.DRUM_ARTS.filter((a) => a.el === el && show.has(a.id));
      if (!arts.length) return '';
      const name = de() ? TC.DRUM_ELEMENTS[el].de : TC.DRUM_ELEMENTS[el].en;
      const items = arts.map((a) => {
        const label = de() ? a.de : a.en;
        return `<button type="button" class="art${a.id === cur ? ' active' : ''}" data-action="setArt" data-value="${a.id}" ` +
          `title="${esc(TC.drums.label(a))} · MIDI ${a.midi}"><span class="mus-head">${TC.HEADS[a.head].g[0]}</span>` +
          `<span class="art-name">${esc(label)}</span><span class="art-ab">${esc(a.ab)}</span></button>`;
      }).join('');
      return `<div class="el-group"><div class="el-name">${esc(name)}</div><div class="arts">${items}</div></div>`;
    }).join('');
    const lock = S.input.lock;
    return `<section><h3>${tr('Instrument')}</h3>
      ${btn('toggleLock', undefined, `🔒 ${tr('Lock instrument')}`, lock, tr('A click anywhere in the column writes the selected instrument (L, or hold Shift)'), 'lock-btn')}
      <p class="hint tight">${lock ? tr('On: the height no longer matters.') : tr('Hold Shift: lock while held · L: switch')}</p>
      ${groups}
      <p class="hint">${TC.drums.ownKit(TC.curTrack()) ? tr('Instruments of this track: "Tracks & sound…" (panel "Bar · score").') : tr('Other instruments: drum kit in the settings (⚙).')}</p></section>`;
  }

  function noteSection(hit) {
    const src = hit ? hit.note : S.input;
    const headSel = hit ? hit.note.head || 'auto' : S.input.head;
    const heads = ['auto'].concat(Object.keys(TC.HEADS)).map((h) =>
      `<option value="${h}"${h === headSel ? ' selected' : ''}>${esc(h === 'auto' ? tr('As the drum map') : tr(TC.HEADS[h].label))}</option>`).join('');
    const title = hit ? tr('Selected notes ({n})', { n: S.selection.size }) : tr('Next note');
    return `<section${hit ? ' class="has-sel"' : ''}><h3>${esc(title)}</h3>
      <div class="row"><label>${tr('Accent')}</label><div class="seg">
        ${btn('setAccent', 0, '–', src.accent === 0, tr('No accent'))}
        ${btn('setAccent', 1, '<span class="mus-btn sm"></span>', src.accent === 1, tr('Accent (A)'))}
        ${btn('setAccent', 2, '<span class="mus-btn sm"></span>', src.accent === 2, tr('Marcato'))}
      </div></div>
      <div class="row"><label>${tr('Ghost note')}</label>${btn('toggleGhost', undefined, '( ● )', !!src.ghost, tr('Ghost note: head in brackets, played softly (G)'))}</div>
      <div class="row"><label>${tr('Grace')}</label><div class="seg">
        ${btn('setOrn', '', '–', !src.orn, tr('No grace note'))}
        ${btn('setOrn', 'flam', 'Flam', src.orn === 'flam', tr('Flam: one grace note just before'))}
        ${btn('setOrn', 'drag', 'Drag', src.orn === 'drag', tr('Drag (ruff): two grace notes just before'))}
      </div></div>
      <div class="row"><label>${tr('Roll')}</label><div class="seg">
        ${[0, 1, 2, 3].map((k) => btn('setTrem', k, k ? '<span class="trem">' + '⁄'.repeat(k) + '</span>' : '–', (src.trem || 0) === k,
          k ? tr('{n} stroke(s) through the stem: the note is played as a roll', { n: k }) : tr('No roll'))).join('')}
      </div></div>
      <div class="row"><label>${tr('Sticking')}</label><div class="seg">
        ${btn('setStick', '', '–', !src.stick, tr('No sticking'))}
        ${btn('setStick', 'R', 'R', src.stick === 'R', tr('Right hand (written under the staff)'))}
        ${btn('setStick', 'L', 'L', src.stick === 'L', tr('Left hand (written under the staff)'))}
      </div></div>
      <div class="row"><label>${tr('Notehead')}</label><select data-action="setHead">${heads}</select></div>
      ${hit ? `<div class="btn-row">${btn('deleteSelection', undefined, '🗑 ' + tr('Delete'), false, tr('Delete (Del)'), 'danger')}
        ${btn('selectNone', undefined, tr('Deselect'), false, 'Esc')}</div>` : ''}
    </section>`;
  }

  /** Melody track: how to write, and the selected notes (♯ / ♭, written the other way, accent). */
  function melodyNoteSection(hit) {
    const P = TC.pitch;
    // accent: of the selected notes, or for the next notes
    const accentRow = (a) => `<div class="row"><label>${tr('Accent')}</label><div class="seg">
        ${btn('setAccent', 0, '–', a === 0, tr('No accent'))}
        ${btn('setAccent', 1, '<span class="mus-btn sm"></span>', a === 1, tr('Accent (A)'))}
        ${btn('setAccent', 2, '<span class="mus-btn sm"></span>', a === 2, tr('Marcato'))}
      </div></div>`;
    // two voices: a held tone under a moving melody (voice 2: its own rhythm, stems down)
    const vi = hit ? hit.voice : S.input.voice === 1 ? 1 : 0;
    const voiceRow = `<div class="row"><label>${tr('Voice (part)')}</label><div class="seg">
        ${btn('setMelodyVoice', 0, '1', vi === 0, tr(hit ? 'Move into voice 1 (stems up)' : 'Write in voice 1 (stems up when there are two)'))}
        ${btn('setMelodyVoice', 1, '2', vi === 1, tr(hit ? 'Move into voice 2 (stems down)' : 'Write in voice 2: its own rhythm, stems down - e.g. a held tone under the melody'))}
      </div></div>`;
    if (!hit) {
      return `<section><h3>${tr('Next note')}</h3>${voiceRow}${S.input.voice === 1 ? `<p class="hint tight">${tr('Voice 2: its own rhythm under voice 1 (stems down) - for a held tone or a second part.')}</p>` : ''}${accentRow(S.input.accent || 0)}</section>
        <section><h3>${tr('Melody')}</h3>
        <p class="hint">${tr('Tap a line or space: the tone of the scale there. Drag sideways while pressing: a longer note.')}</p>
        <p class="hint">${tr('Hold a note, then up / down: ♯ / ♭ · then sideways: its length · drag a note: move it.')}</p>
        <p class="hint tight">${tr('Scale: panel "Bar · score". Clef, voice, sound: "Tracks & sound…".')}</p></section>${accompSection(null)}${ksSection()}${dynSection()}${lyricsSection(false)}`;
    }
    const sp = P.noteSpell(hit.note, TC.score.scaleAt(hit.track, hit.bar));
    const alt = P.enharmonics(hit.note.pitch, sp.dia)[0];
    // a tie to the next note: only to the same tone right after it
    const next = TC.score.chordTies(S.doc, hit.track, hit.bar, hit.voice, hit.ev);
    const tie = next && next.gap ? btn('toggleTie', undefined, '⁀ ' + tr('Tie to the next note (fills the rest)'), false, tr('This note becomes longer up to the next one (the same tone), which is not struck again'))
      : next ? btn('toggleTie', undefined, '⁀ ' + tr('Tie to the next note'), next.all, tr('The next note (the same tone) is not struck again'))
      : `<p class="hint tight">${tr('Tie: only to the same tone right after it - or drag the note longer over the bar line.')}</p>`;
    // a chord: the whole chord is tied; one tone alone too (a held tone while the others move on)
    const one = next && next.targets.length > 1 && TC.score.tieTarget(S.doc, hit.track, hit.bar, hit.voice, hit.ev, hit.note);
    const tieOne = one ? btn('toggleTieOne', undefined, '⁀ ' + tr('Only this tone ({name})', { name: P.fullName(sp.dia, sp.a, de()) }), !one.gap && !!one.note.tie && !next.all,
      tr('Ties only this tone of the chord; the other tones are struck again')) : '';
    return `<section class="has-sel"><h3>${esc(tr('Selected notes ({n})', { n: S.selection.size }))}</h3>
      <p class="hint tight"><b>${esc(P.fullName(sp.dia, sp.a, de()))}</b></p>
      <div class="btn-row two">${btn('alterSelection', 1, '♯ ' + tr('Raise'), false, tr('A semitone up (hold the note, then up)'))}
        ${btn('alterSelection', -1, '♭ ' + tr('Lower'), false, tr('A semitone down (hold the note, then down)'))}</div>
      <div class="btn-row two">${btn('octaveSelection', 1, '8↑ ' + tr('Octave up'), false, tr('An octave higher (Ctrl+↑)'))}
        ${btn('octaveSelection', -1, '8↓ ' + tr('Octave down'), false, tr('An octave lower (Ctrl+↓)'))}</div>
      <p class="hint tight">${tr('↑ ↓: next line (tone of the scale) · Alt+↑ ↓: semitone · Ctrl+↑ ↓: octave')}</p>
      ${alt ? `<div class="btn-row">${btn('respell', undefined, esc(tr('Write as {name}', { name: P.name(((alt.dia % 7) + 7) % 7, alt.a, de()) })), false, tr('Same tone, written the other way'))}</div>` : ''}
      ${voiceRow}
      <div class="btn-row">${tie}</div>
      ${tieOne ? `<div class="btn-row">${tieOne}</div>` : ''}
      ${accentRow(hit.note.accent || 0)}
      <div class="btn-row">${btn('deleteSelection', undefined, '🗑 ' + tr('Delete'), false, tr('Delete (Del)'), 'danger')}
        ${btn('selectNone', undefined, tr('Deselect'), false, 'Esc')}</div>
    </section>${accompSection(hit)}${ksSection()}${dynSection()}${lyricsSection(true)}`;
  }

  /** Lyrics of the melody track being written: the verse, start typing (at the selected note), delete a verse. */
  function lyricsSection(sel) {
    const t = TC.curTrack(), n = TC.score.lyricVerses(t), cur = Math.min(S.lyricVerse || 0, n);
    const verses = Array.from({ length: Math.min(TC.score.LYRIC_VERSES, n + 1) }, (_, v) =>
      btn('setLyricVerse', v, n === v ? '+' : String(v + 1), v === cur, n === v ? tr('A new verse') : tr('Verse {n}', { n: v + 1 }))).join('');
    const shown = S.doc.page.lyrics !== false;
    return `<section><h3>${tr('Lyrics')}</h3>
      ${n ? check('toggleLyrics', shown, tr('Show lyrics (Ctrl+Shift+L)')) : ''}
      ${n && !shown ? `<p class="hint tight">${tr('Hidden: the bars are narrow again. While typing, the lyrics show.')}</p>` : ''}
      ${n ? `<div class="row"><label>${tr('Verse')}</label><div class="seg">${verses}</div></div>` : ''}
      <div class="btn-row">${btn('startLyrics', undefined, '✎ ' + tr(sel ? 'Type lyrics from this note' : n ? 'Type lyrics' : 'Type lyrics under the notes'), false, tr('Ctrl+L · or tap a syllable'), 'wide')}</div>
      <p class="hint tight">${tr('Space: next note · "-" between the syllables of a word (Son-ne) · Space on an empty field: the syllable goes on over this note. Pasted text spreads over the notes.')}</p>
      ${cur < n ? `<div class="btn-row">${btn('deleteLyricVerse', cur, '🗑 ' + tr('Delete verse {n}', { n: cur + 1 }), false, tr('The verses after it move up'), 'danger')}</div>` : ''}
    </section>`;
  }

  /** A scale in a list: its name, a second name (Aeolian, Gypsy minor …) and how it sounds. */
  const scaleLabel = (s) => {
    const al = (s.alias || []).filter((x, k) => k % 2 === (de() ? 1 : 0))[0];
    const d = s.desc ? (de() ? s.desc[1] : s.desc[0]) : '';
    return (de() ? s.de : s.en) + (al && !d.toLowerCase().includes(al.toLowerCase()) ? ' / ' + al : '') + (d ? ' – ' + d : '');
  };

  /**
   * Melody track being written: sound, piano, voice, clef (its scale: scaleRows, at the top of the panel).
   */
  function melodyTrackRows(t) {
    const P = TC.pitch;
    const opt = (v, l, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(l)}</option>`;
    const voices = [opt('', tr('Any (no range)'), !t.voice)].concat(Object.keys(P.VOICES).map((k) => opt(k, de() ? P.VOICES[k].de : P.VOICES[k].en, t.voice === k))).join('');
    const clefs = Object.keys(P.CLEFS).map((k) => opt(k, de() ? P.CLEFS[k].de : P.CLEFS[k].en, t.clef === k)).join('');
    const listed = TC.MELODY_SOUNDS.some(([, , l]) => l.some(([p]) => p === t.program));
    const sounds = (listed ? '' : opt(t.program, TC.soundName(t.program, de()), true)) + TC.MELODY_SOUNDS.map(([en, dname, list]) =>
      `<optgroup label="${esc(de() ? dname : en)}">` + list.map(([p, sen, sde]) => opt(p, de() ? sde : sen, p === t.program)).join('') + '</optgroup>').join('');
    // piano (two staves): no voice range; the clef is the one of the staff being written
    const piano = TC.score.isPiano(S.doc, t);
    // the instrument: how chords are written for it (its sound below is free)
    const insts = (TC.accomp ? TC.accomp.INSTRUMENTS : []).map((x) => opt(x.id, de() ? x.de : x.en, (t.inst || 'voice') === x.id)).join('');
    return `<div class="row"><label>${tr('Instrument')}</label><select data-action="setTrackInstrument">${insts}</select></div>
      <p class="hint tight">${tr('How chords are written for it (guitar: grips, bass: the root …). The sound is free.')}</p>
      <div class="row"><label>${tr('Sound')}</label><select data-action="setTrackProgram">${sounds}</select></div>
      ${check('togglePiano', piano, tr('Two staves (piano: right and left hand)'))}
      ${piano ? `<p class="hint tight">${tr(t.lh ? 'You are writing the left hand (lower staff). Tap the upper staff for the right hand.' : 'You are writing the right hand (upper staff). Tap the lower staff for the left hand.')}</p>` : ''}
      ${piano || (t.inst && t.inst !== 'voice') ? '' : `<div class="row"><label>${tr('Voice')}</label><select data-action="setTrackVoice">${voices}</select></div>`}
      <div class="row"><label>${tr(piano ? (t.lh ? 'Clef (lower staff)' : 'Clef (upper staff)') : 'Clef')}</label><select data-action="setTrackClef">${clefs}</select></div>`;
  }
  /** Melody track: its scale from the selected bar on (a change here) - in the panel, next to the bar it belongs to. */
  function scaleRows(t) {
    const P = TC.pitch, bi = S.selBar !== null ? S.selBar : 0, sc = TC.score.scaleAt(t, bi), pc = P.pc(sc.l, sc.a);
    const opt = (v, l, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(l)}</option>`;
    const roots = (de() ? P.ROOTS_DE : P.ROOTS).map(([v, l]) => opt(v, l, v === pc)).join('');
    const scales = P.GROUPS.map(([g, en, dname]) => `<optgroup label="${esc(de() ? dname : en)}">` +
      P.SCALES.filter((s) => s.group === g).map((s) => opt(s.id, scaleLabel(s), s.id === sc.id)).join('') + '</optgroup>').join('');
    const change = bi > 0 && t.bars[bi] && t.bars[bi].scale;
    return `<div class="row"><label>${tr('Scale')}</label><select data-action="setTrackScaleRoot" class="narrow">${roots}</select>
        <select data-action="setTrackScaleId">${scales}</select>${btn('previewScale', undefined, '▶', false, tr('Hear the scale'), 'icon')}</div>
      <p class="hint tight">${esc(P.scaleName(sc, de()))}${bi > 0 ? ' · ' + esc(change ? tr('changes at bar {n}', { n: bi + 1 }) : tr('bar {n}: a change here applies from it on', { n: bi + 1 })) : ''}</p>
      ${change ? `<div class="btn-row">${btn('clearScaleChange', undefined, tr('Remove the change'), false, tr('The scale before it goes on'))}</div>` : ''}`;
  }

  /**
   * Top of the panel: the track being written (a list - a tap into a staff chooses too), a melody's scale from this
   * bar on, and "Tracks & sound…" (the window with the tracks and the playback: set up once, rarely touched).
   */
  function trackBarSection() {
    const cur = TC.curTrack(), curI = TC.score.instrumentOf(S.doc, cur), insts = TC.score.instruments(S.doc);
    const opts = insts.map((t) => `<option value="${esc(t.id)}"${t === curI ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    const out = TC.midiOut && TC.midiOut.supported() ? TC.midiOut.outputOf(cur) : '';
    return `<section class="track-bar">
      <div class="row"><label>${tr('Track')}</label><select data-action="selectTrack">${opts}</select></div>
      ${cur.kind === 'pitched' ? scaleRows(cur) : ''}
      <div class="btn-row">${btn('openTracks', undefined, tr('Tracks & sound…'), false, tr('Tracks (add, order, mute / solo), the sound of each track (Tactus or a MIDI output), playback'), 'wide')}</div>
      ${out ? `<p class="hint tight">${esc(tr('Plays on {name}', { name: out }))}</p>` : ''}
    </section>`;
  }

  // ---- Settings panel ----------------------------------------------------------------------------

  function barSection() {
    const i = S.selBar;
    if (i === null || !S.doc.bars[i]) {
      return `<section><h3>${tr('Bar')}</h3><p class="hint">${tr('Click a bar or right-click it: time signature, insert, delete.')}</p></section>`;
    }
    const h = S.doc.bars[i];
    const cur = h.ts.join('/');
    const known = TC.TIME_SIGS.map((t) => t.join('/'));
    const opts = (known.includes(cur) ? known : [cur].concat(known)).map((t) => `<option${t === cur ? ' selected' : ''}>${t}</option>`).join('');
    const choices = TC.beamChoices(h.ts);
    const curBeam = (TC.beamGroups(h.ts, h.beam) || []).join('+');
    const beamRow = choices.length ? `<div class="row"><label>${tr('Beams')}</label><select data-action="setBeam">${choices.map((g, k) =>
      `<option value="${k === 0 ? 'default' : g.join('+')}"${g.join('+') === curBeam ? ' selected' : ''}>${g.join('+')}${k === 0 ? ' ' + tr('(default)') : ''}</option>`).join('')}</select></div>` : '';
    // several bars: from the selected one up to … (for playing / looping them)
    const [ra, rb] = TC.actions.rangeAt(i), many = rb > ra, ab = { a: ra + 1, b: rb + 1 };
    const R = TC.barRange(), end = S.selBarEnd !== null && S.doc.bars[S.selBarEnd] ? S.selBarEnd : i;
    const toOpts = S.doc.bars.map((_, k) => `<option value="${k}"${k === end ? ' selected' : ''}>${k === i ? '– ' + tr('only this one') : k + 1}</option>`).join('');
    const title = R && R[1] > R[0] ? `${tr('Bars')} ${R[0] + 1}–${R[1] + 1}` : `${tr('Bar')} ${i + 1}`;
    return `<section><h3>${title}</h3>
      <div class="row"><label>${tr('to bar')}</label><select data-action="selectBarsTo">${toOpts}</select></div>
      ${R && R[1] > R[0] ? `<p class="hint tight">${tr('Play / loop plays these bars. The settings below apply to bar {n}.', { n: i + 1 })}</p>` : ''}
      <div class="row"><label>${tr('Time sig.')}</label><select data-ts>${opts}<option value="other">${tr('Other…')}</option></select></div>
      <div class="row"><label>${tr('Applies')}</label><select data-action="setTsMode">${[['from', 'from here up to the next change'], ['only', 'to this bar only'], ['shift', 'to this bar only, the notes after it move along']].map(([v, l]) =>
        `<option value="${v}"${(S.tsMode || 'from') === v ? ' selected' : ''}>${tr(l)}</option>`).join('')}</select></div>
      ${beamRow}
      <div class="row"><label>${tr('Tempo')}</label><input type="number" min="20" max="400" data-bartempo value="${i === 0 ? S.doc.meta.tempo : h.tempo || ''}" placeholder="${TC.timeline.tempoAt(S.doc, i)}"> <span class="muted">${tr(i === 0 ? 'BPM' : 'from here')}</span></div>
      <div class="row"><label>${tr('Text')}</label><input type="text" data-marker maxlength="40" value="${esc(h.marker || '')}" placeholder="${esc(tr('e.g. Verse, Chorus'))}"></div>
      ${i > 0 ? check('toggleLineBreak', !!h.lineBreak, tr('New line from this bar (page view)')) : ''}
      ${S.doc.bars[i + 1] ? check('toggleBreakAfter', !!S.doc.bars[i + 1].lineBreak, tr('Line break after this bar (page view)')) : ''}
      <div class="btn-row">
        ${btn('copyBar', undefined, tr('Copy'), false, (many ? tr('Copy bars {a}–{b}', ab) : tr('Copy bar')) + ' (Ctrl+C)')}
        ${btn('pasteBar', undefined, tr('Paste'), false, tr('Paste into this bar') + ' (Ctrl+V)', S.clipboard ? '' : 'off')}
        ${btn('duplicateBar', undefined, tr('Duplicate'), false, (many ? tr('Duplicate bars {a}–{b}', ab) : tr('Duplicate bar')) + ' (Ctrl+D)')}
        ${i > 0 ? btn('toggleSimile', undefined, '%', !!TC.curTrack().bars[i].simile, tr('Repeat the bar before (%)')) : ''}
      </div>
      <div class="btn-row">
        ${btn('insertBarBefore', undefined, tr('+ before'), false, tr('Insert bar before'))}
        ${btn('insertBarAfter', undefined, tr('+ after'), false, tr('Insert bar after'))}
        ${btn('clearBar', undefined, tr('Clear'), false, many ? tr('Clear bars {a}–{b}', ab) : tr('Clear bar'))}
        ${btn('deleteBar', undefined, tr('Delete'), false, many ? tr('Delete bars {a}–{b}', ab) : tr('Delete bar'), 'danger')}
      </div></section>`;
  }

  /**
   * Chord symbols of the selected bar (for all tracks): where (a beat), the scale-degree chords of the scale
   * that applies here (tap = set), seventh chords, typing one; the key (without a melody track); the pad.
   */
  function chordSection() {
    const i = S.selBar, Pi = TC.pitch;
    // where the pad sounds: Tactus' synth (default), or a MIDI output of its own (a synth VST) with a channel
    const hm = S.doc.harmony, MO = TC.midiOut;
    const outs = MO && MO.supported() ? MO.outputs().slice() : [];
    if (hm.midiOut && !outs.includes(hm.midiOut)) outs.push(hm.midiOut);
    const outRow = hm.pad && outs.length ? `<div class="row"><label>${tr('Sound')}</label><select data-action="setChordOut">
        <option value=""${hm.midiOut ? '' : ' selected'}>${tr('Tactus sounds')}</option>${outs.map((o) =>
          `<option value="${esc(o)}"${o === hm.midiOut ? ' selected' : ''}>MIDI: ${esc(o)}${MO.connected(o) ? '' : ' ' + tr('(missing)')}</option>`).join('')}</select></div>
      ${hm.midiOut ? `<div class="row"><label>${tr('Channel')}</label><select data-action="setChordCh" class="narrow">${Array.from({ length: 16 }, (_, k) =>
          `<option value="${k + 1}"${k === hm.midiCh ? ' selected' : ''}>${k + 1}</option>`).join('')}</select></div>
        <p class="hint tight">${tr('Choose the output of a synth VST - not the one of the drum VST: it would play the chords as drum hits.')}</p>` : ''}` : '';
    const pad = `${check('toggleChordPad', !!hm.pad, tr('Play the chords along (soft pad)'))}
      ${hm.pad ? `<div class="row"><label>${tr('Volume')}</label><input type="range" min="0" max="100" step="5" data-chordvol value="${hm.vol}"></div>` : ''}
      ${outRow}`;
    if (i === null || !S.doc.bars[i]) {
      return `<section><h3>${tr('Chords')}</h3><p class="hint">${tr('Tap a bar (above or below the lines): set its chords here.')}</p>${pad}</section>`;
    }
    const sc = TC.score.harmonyScale(S.doc, i), sev = !!S.settings.chordSev, list = TC.score.chordsIn(S.doc, i);
    const ts = S.doc.bars[i].ts, slots = TC.score.chordSlots(S.doc, i, TC.gridTicks(S.input)), slot = slots.includes(S.chordSlot) ? S.chordSlot : 0;
    const at = (t) => list.find((x) => x.t === t), here = at(slot);
    const name = (ch) => Pi.chordName(ch, de());
    // where: the places of the click grid (note value of the panel: eighths 1 + 2 + …), each with its chord;
    // more than 8: two rows (sixteenths)
    const short = (t) => { const c = TC.rhythm.countLabel(t, ts).split(' '); return c.length > 1 ? c[1] : c[0]; }; // 1 · e · + · a
    const where = slots.length > 1 ? `<div class="chord-slots" style="grid-template-columns: repeat(${Math.min(8, slots.length)}, 1fr)">${slots.map((t) =>
      btn('setChordSlot', t, `<small>${esc(short(t))}</small>${at(t) ? esc(name(at(t).ch)) : '·'}`, t === slot, TC.rhythm.countLabel(t, ts), TC.rhythm.countLabel(t, ts).includes(' ') ? 'off-beat' : '')).join('')}</div>
      <p class="hint tight">${tr('Places in the bar: like the click grid (note value in the note panel).')}</p>` : '';
    const borrow = Pi.borrowsChords(sc);
    const chords = Pi.degreeChords(sc, sev).map((c) => btn('setChordDeg', c.deg, `<b>${esc(name(c))}</b><small>${esc(c.roman)}</small>`,
      !!(here && here.c.deg === c.deg && !!here.c.sev === sev), borrow && !c.inScale ? tr('Not only tones of the scale') : '', 'chord-btn' + (borrow && !c.inScale ? ' pale' : ''))).join('');
    const typed = here && !here.c.deg ? name(here.ch).replace(/♯/g, '#').replace(/♭/g, 'b') : '';
    const mt = TC.score.harmonyTrack(S.doc);
    let key;
    if (mt) {
      // writing a melody: chord tones marked / only chord tones (from this bar on)
      const g = TC.score.guideAt(S.doc, i), A = TC.actions;
      key = `<p class="hint tight">${esc(tr('Chords of {scale} (scale of "{track}" in bar {n})', { scale: Pi.scaleName(sc, de()), track: mt.name, n: i + 1 }))}</p>
        <div class="row"><label>${tr('Melody')}</label><select data-action="setGuide">${TC.GUIDES.map((v) =>
          `<option value="${v}"${v === g ? ' selected' : ''}>${esc(tr(A.GUIDE_NAMES[v]))}</option>`).join('')}</select></div>
        <p class="hint tight">${tr(g === 'lock' ? 'Tapping or moving a note: the nearest chord tone; hold + up / down still leaves it.' : g === 'mark' ? 'The tones of the chord sounding are marked on the lines; every tone can be written.' : 'Only the scale.')}${i > 0 ? ' ' + esc(tr('Applies from bar {n} on.', { n: i + 1 })) : ''}</p>`;
    }
    else {
      const opt = (v, l, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(l)}</option>`, pc = Pi.pc(sc.l, sc.a);
      const roots = (de() ? Pi.ROOTS_DE : Pi.ROOTS).map(([v, l]) => opt(v, l, v === pc)).join('');
      const scales = Pi.GROUPS.map(([g, en, dname]) => `<optgroup label="${esc(de() ? dname : en)}">` +
        Pi.SCALES.filter((s) => s.group === g).map((s) => opt(s.id, scaleLabel(s), s.id === sc.id)).join('') + '</optgroup>').join('');
      key = `<div class="row"><label>${tr('Musical key')}</label><select data-action="setHarmonyKeyRoot" class="narrow">${roots}</select>
        <select data-action="setHarmonyKeyId">${scales}</select>${btn('previewScale', undefined, '▶', false, tr('Hear the scale'), 'icon')}</div>`;
    }
    return `<section><h3>${tr('Chords')} · ${tr('Bar {n}', { n: i + 1 })}</h3>
      ${where}
      <div class="chord-pal">${chords}</div>
      <div class="btn-row">${btn('toggleChordSev', undefined, '7 ' + tr('Seventh chords'), sev, tr('Four-note chords: Cmaj7, Dm7, G7 …'))}
        ${here ? btn('clearChord', slot, '✕ ' + tr('Remove'), false, tr('Remove this chord')) : ''}</div>
      <div class="row"><label>${tr('Own')}</label><input type="text" data-chord maxlength="16" value="${esc(typed)}" placeholder="${esc(tr('e.g. C7, Fadd9, G/B'))}"></div>
      ${key}
      ${pad}</section>`;
  }

  /**
   * Chords written like notes: what a tap writes - a tone, or the chord of the chord symbols there (with a stroke ↓ / ↑);
   * a selected chord: its stroke. (Held and moved down / up, a chord written as a chord gets its stroke too.)
   */
  function accompSection(hit) {
    const t = TC.curTrack();
    if (t.kind !== 'pitched') return '';
    if (hit) {
      // the selected chord: its stroke (a chord - more than one tone, or written as a chord)
      if (hit.ev.notes.length < 2 && !hit.note.chordNote) return '';
      const sk = (hit.ev.notes.find((n) => n.stroke) || {}).stroke || '';
      return `<section><h3>${tr('Chord')}</h3><div class="row"><label>${tr('Stroke')}</label><div class="seg">
          ${btn('setStroke', '', '–', sk === '', tr('No stroke: all tones at once'))}
          ${btn('setStroke', 'd', '↓', sk === 'd', tr('Down stroke: from the lowest string up'))}
          ${btn('setStroke', 'u', '↑', sk === 'u', tr('Up stroke: from the highest string down'))}</div></div>
        <p class="hint tight">${tr('Or hold the chord and move down / up.')}</p></section>`;
    }
    const m = S.input.chordMode || '';
    return `<section><h3>${tr('Chords')}</h3><div class="row"><label>${tr('A tap sets')}</label><div class="seg">
        ${btn('setChordMode', '', tr('Tone'), m === '', tr('A tap writes one tone'))}
        ${btn('setChordMode', 'n', tr('Chord'), m === 'n', tr('A tap writes the chord of the chord symbols there'))}
        ${btn('setChordMode', 'd', '↓', m === 'd', tr('A chord struck down'))}
        ${btn('setChordMode', 'u', '↑', m === 'u', tr('A chord struck up'))}</div></div>
      ${m && TC.accomp.isGuitar(t) ? `<div class="row"><label>${tr('Grip')}</label><div class="seg">
        ${btn('setChordTight', 'false', tr('Full'), !S.input.chordTight, tr('All strings from the bass up - full, for strumming'))}
        ${btn('setChordTight', 'true', tr('Tight (4 strings)'), !!S.input.chordTight, tr('Four strings in the middle, one tone each - slim, for picking or short chords'))}</div></div>` : ''}
      ${m ? `<div class="row"><label>${tr('Tones')}</label><div class="seg">${[['', 'As written', 'The chord of the symbol as it is'], ['3', 'Triad', 'Root, third, fifth (7, 6, add9 … left out)'],
        ['4', 'Four-note chord', 'With the seventh: its own, else the one of the scale (C in C major: Cmaj7, G: G7)'], ['5', 'Power', 'Root, fifth, octave (a guitar: on its E or A string)']]
        .map(([v, l, h]) => btn('setChordSize', v, tr(l), (S.input.chordSize || '') === v, tr(h))).join('')}</div></div>` : ''}
      <p class="hint tight">${tr(m ? 'Tap: the chord of the chord symbols there (panel "Bar · score" → Chords) - a guitar: a grip; else from the tapped tone up. Hold it, then down / up: its stroke.' : 'Chord: a tap writes the whole chord of the chord symbols there.')}</p>
    </section>`;
  }

  /**
   * Ways of playing (keyswitches of the track's VST, js/keyswitch.js) at a place of the selected bar - muted, dead notes,
   * a slide, a stop … (the same places as the chords and the dynamics). The same once more: it goes.
   */
  function ksSection() {
    const t = TC.curTrack(), i = S.selBar, KS = TC.ksw;
    if (!KS || !t.ksw) return '';
    if (i === null || !S.doc.bars[i]) return `<section><h3>${tr('Way of playing')}</h3><p class="hint">${tr('Tap a bar: muted, dead notes, a slide … from a place in it.')}</p></section>`;
    const ts = S.doc.bars[i].ts, slots = TC.score.chordSlots(S.doc, i, TC.gridTicks(S.input)), slot = slots.includes(S.chordSlot) ? S.chordSlot : 0;
    const list = (t.bars[i] && t.bars[i].ks) || [], at = (x) => list.filter((m) => m.t === x);
    const label = (m) => { const k = KS.keyOf(t, m.k); return k ? KS.label(k) : '?'; };
    const short = (x) => { const c = TC.rhythm.countLabel(x, ts).split(' '); return c.length > 1 ? c[1] : c[0]; };
    const where = slots.length > 1 ? `<div class="chord-slots" style="grid-template-columns: repeat(${Math.min(8, slots.length)}, 1fr)">${slots.map((x) =>
      btn('setChordSlot', x, `<small>${esc(short(x))}</small><i>${esc(at(x).map(label).join(' ') || '·')}</i>`, x === slot, TC.rhythm.countLabel(x, ts), TC.rhythm.countLabel(x, ts).includes(' ') ? 'off-beat' : '')).join('')}</div>` : '';
    const here = new Set(at(slot).map((m) => m.k));
    const group = (kind, title, g) => {
      const keys = KS.scoreKeys(t).filter((k) => k.kind === kind && (g === undefined || (k.group || '') === g));
      return keys.length ? `<div class="row"><label>${tr(title)}</label></div><div class="ks-pal">${keys.map((k) => btn('setKs', k.id, esc(KS.label(k)), here.has(k.id), tr(k.name))).join('')}</div>` : '';
    };
    // the ways of playing by their group (one of a group holds at a time; picking is its own)
    const groups = [...new Set(KS.scoreKeys(t).filter((k) => k.kind === 'art').map((k) => k.group || ''))];
    const GROUP = { mute: 'Muting (one holds)', pick: 'Picking', legato: 'Legato', art: 'Ways of playing (one holds until the next)', sord: 'Mute (sordino)', '': 'Holds until the next' };
    return `<section><h3>${tr('Way of playing')} · ${tr('Bar {n}', { n: i + 1 })}</h3>
      ${where}
      ${groups.map((g) => group('art', GROUP[g] || g, g)).join('')}${group('once', 'Before the note here')}${group('event', 'Here')}
      <p class="hint tight">${esc(tr('Keyswitches of {name} - written under the staff, sent to the VST before the notes. ↓ / ↑ strokes: its own stroke keys.', { name: t.ksw.name }))}</p>
    </section>`;
  }

  /**
   * Dynamics: a level (ppp … fff) or a hairpin (cresc. / dim.) - placed with the notes as the help (the first selected
   * note: its place; a hairpin up to the last one), or a sign / hairpin tapped in the score and changed here. For the
   * track being written (a piano: both hands) or all tracks. They play the notes softer / louder; the notes stay as written.
   */
  function dynSection(top) {
    const SC = TC.score, AC = TC.actions, L = SC.DYN_LEVELS, t = TC.curTrack();
    const sel = AC.dynSelected(), p = sel ? null : AC.dynPlace();
    if (!!sel !== !!top) return ''; // (a sign / hairpin selected in the score: this section on top of the panel)
    const where = (bar, tick) => tr('Bar {n}', { n: bar + 1 }) + ', ' + TC.rhythm.countLabel(tick, S.doc.bars[bar].ts);
    const whereAbs = (abs) => { const q = SC.atAbs(S.doc, abs); return q ? where(q.bar, q.tick) : tr('the end'); };
    const lvOpts = (cur) => L.map((v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`).join('');
    const sign = (w) => (w === 'cresc' ? '&lt;' : '&gt;');
    const all = `${check('toggleDynAll', !!S.dynAll, tr('For all tracks'))}
      <p class="hint tight">${esc(S.dynAll ? tr('Plays all tracks softer / louder from here on.') : tr('Plays "{track}" softer / louder from here on.', { track: SC.instrumentOf(S.doc, t).name }))} ${tr('The notes stay as written (ghost, accent).')}</p>`;
    // the switch: up to the start of the target note or its end
    const targetSeg = (atEnd, title) => `<div class="row"><label>${tr('up to')}</label><div class="seg">
        ${btn('setWedgeToEnd', 0, tr('start of the target note'), !atEnd, title)}${btn('setWedgeToEnd', 1, tr('end of the target note'), atEnd, title)}</div></div>`;

    // a sign tapped in the score: another level, or remove it
    if (sel && !sel.w) {
      return `<section class="has-sel"><h3>${tr('Dynamics')} · <span class="dyn-txt">${esc(sel.d.v)}</span></h3>
        <p class="hint tight">${esc(where(sel.bar, sel.t))} · ${tr('drag the sign in the score to move it (it snaps to the notes)')}</p>
        <div class="dyn-pal">${L.map((v) => btn('setDyn', v, `<span class="dyn-txt">${v}</span>`, sel.d.v === v, tr('{v} from here on', { v }))).join('')}</div>
        <div class="btn-row">${btn('clearDyn', 'v', '🗑 ' + tr('Remove'), false, tr('Remove'), 'danger')}${btn('selectNone', undefined, tr('Deselect'), false, 'Esc')}</div>
        ${all}</section>`;
    }
    // a hairpin tapped in the score: its levels, where it ends, remove it
    if (sel && sel.w) {
      const w = SC.dynEvents(S.doc, sel.track).wedges.find((x) => x.bar === sel.bar && x.t === sel.t);
      const from = L[SC.levelAt(S.doc, sel.track, sel.bar, sel.t)], to = sel.d.to || (w ? L[w.to] : from);
      const a = SC.absTick(S.doc, sel.bar, sel.t), g = AC.wedgeTargetOf(sel);
      return `<section class="has-sel"><h3>${tr('Hairpin')} · <span class="dyn-txt">${esc(from)}</span> ${sign(sel.d.w)} <span class="dyn-txt">${esc(to)}</span></h3>
        <p class="hint tight">${esc(where(sel.bar, sel.t))} → ${esc(whereAbs(a + sel.d.len))} · ${tr('drag the round handles in the score: start and end snap to the notes')}</p>
        <div class="row wedge-row"><label>${tr('Hairpin')}</label><select data-action="setWedgeFrom" class="dyn-sel">${lvOpts(from)}</select>
          <span class="wedge-sign">${sign(sel.d.w)}</span><select data-action="setWedgeTo" class="dyn-sel">${lvOpts(to)}</select></div>
        ${g ? targetSeg(g.atEnd, tr('Where the hairpin ends: when its target note begins (it already has the new level), or when it ends')) : ''}
        <div class="btn-row">${btn('clearDyn', 'w', '🗑 ' + tr('Remove'), false, tr('Remove'), 'danger')}${btn('selectNone', undefined, tr('Deselect'), false, 'Esc')}</div>
        ${all}</section>`;
    }
    if (!p) return `<section><h3>${tr('Dynamics')}</h3><p class="hint">${tr('Tap a note: p, f … go there. For a hairpin select its notes (Shift + tap: up to the target note). A sign or hairpin in the score: tap it to change it.')}</p></section>`;
    // levels at the place (the first selected note, else the start of the bar)
    const list = SC.dynIn(t, p.bar), here = list.find((d) => d.t === p.t && d.v), wedge = list.find((d) => d.t === p.t && d.w);
    const levels = L.map((v) => btn('setDyn', v, `<span class="dyn-txt">${v}</span>`, !!here && here.v === v, tr('{v} from here on', { v }))).join('');
    let wedgeRows = `<p class="hint tight">${tr('Hairpin: select its notes - the first one, then Shift + tap the target note (or the select tool).')}</p>`;
    const d = AC.wedgeDraft();
    if (d) {
      const up = L.indexOf(d.to) > L.indexOf(d.from);
      wedgeRows = `<div class="row wedge-row"><label>${tr('Hairpin')}</label><select data-action="setWedgeFrom" class="dyn-sel">${lvOpts(d.from)}</select>
          <span class="wedge-sign">${up ? '&lt;' : '&gt;'}</span><select data-action="setWedgeTo" class="dyn-sel">${lvOpts(d.to)}</select></div>
        ${d.one ? `<p class="hint tight">${tr('Over this note (select more notes: up to the last one).')}</p>` : targetSeg(d.toEnd, tr('Where the hairpin ends: when the last selected note begins (it already has the new level), or when it ends'))}
        <div class="btn-row">${btn('makeWedge', undefined, `<span class="dyn-txt">${esc(d.from)}</span> ${up ? '&lt;' : '&gt;'} <span class="dyn-txt">${esc(d.to)}</span> ${tr('set')}`, false,
          tr(up ? 'Louder and louder from {from} to {to}' : 'Softer and softer from {from} to {to}', { from: d.from, to: d.to }) + ' – ' + whereAbs(d.abs) + ' → ' + whereAbs(d.end), 'wide')}</div>`;
    }
    return `<section><h3>${tr('Dynamics')} · ${esc(where(p.bar, p.t))}</h3>
      ${p.bare ? `<p class="hint tight">${tr('At the start of the bar - tap a note for another place.')}</p>` : ''}
      <div class="dyn-pal">${levels}</div>
      ${here ? `<div class="btn-row">${btn('clearDyn', 'v', '✕ ' + esc(here.v), false, tr('Remove'))}</div>` : ''}
      ${wedgeRows}
      ${wedge ? `<p class="hint tight">${tr('Here')}: ${sign(wedge.w)} ${btn('clearDyn', 'w', '✕ ' + sign(wedge.w), false, tr('Remove'))}</p>` : ''}
      ${all}</section>`;
  }

  /**
   * Find repeats (e.g. after a MIDI import from a DAW, where everything is written out): bars that play the bar
   * before them (-> %), sections that come again right after themselves (-> |: :| n×) - marked in colour in the
   * score, listed here with a button each; or all at once.
   */
  function findSection() {
    const on = !!S.analyze, A = TC.actions;
    let body = '';
    if (on) {
      const f = A.found(), MAX = 30;
      const secs = f.sections.slice(0, MAX).map((s, k) => `<div class="found-item"><span class="found-dot sec${k % 2}"></span>` +
        btn('showFound', 's:' + k, esc(tr('Bars {a}–{b}', { a: s.from + 1, b: s.from + s.len })) + ` <span class="muted">${s.times}×</span>`, false, tr('Show these bars'), 'link') +
        btn('foldSection', k, `|: :| ${s.times}×`, false, tr('Write it once with a repeat sign (the copies go)')) + '</div>').join('');
      const many = S.doc.tracks.length > 1;
      const sims = f.simile.slice(0, MAX).map((r, k) => `<div class="found-item"><span class="found-dot sim"></span>` +
        btn('showFound', 'm:' + k, esc((many ? r.track.name + ': ' : '') + (r.bars.length > 1 ? tr('bars {a}–{b} like {c}', { a: r.bars[0] + 1, b: r.bars[r.bars.length - 1] + 1, c: r.from + 1 }) : tr('bar {a} like {c}', { a: r.bars[0] + 1, c: r.from + 1 }))), false, tr('Show these bars'), 'link') +
        btn('applySimile', k, '%', false, tr('As %-bars (repeat the bar before)')) + '</div>').join('');
      const none = !f.sections.length && !f.simile.length;
      body = `${check('toggleAnalyzeLoose', !!S.settings.analyzeLoose, tr('Ignore the strength (ghost, accent, velocity)'))}
        ${none ? `<p class="hint">${tr('No bars found that play the same as right before them.')}</p>` : ''}
        ${secs ? `<p class="hint tight"><b>${tr('Sections that come again (all tracks)')}</b></p><div class="found-list">${secs}</div>` : ''}
        ${sims ? `<p class="hint tight"><b>${tr('The same bar again')}</b></p><div class="found-list">${sims}</div>` : ''}
        ${!none ? `<div class="btn-row">${f.simile.length > 1 ? btn('applyAllSimile', undefined, tr('All as %'), false, tr('Every run found as %-bars')) : ''}
          ${btn('autoRepeats', undefined, tr('Set all'), false, tr('Sections with |: :|, then %-bars'))}</div>` : ''}
        <p class="hint tight">${tr('Back to the notes: right-click a bar (finger: hold it) → "Show the notes instead of %" / "Write this repeat out".')}</p>`;
    }
    return `<section><h3>${tr('Find repeats')}</h3>
      ${btn('toggleAnalyze', undefined, '🔍 ' + tr('Mark bars that play the same'), on, tr('In colour: sections that come again, bars like the one before (e.g. after a MIDI import)'), 'wide')}
      ${body}</section>`;
  }

  /** Repeats and jumps of the selected bar: |: :| endings, 𝄋 / ⊕, Fine / To Coda, D.C. / D.S. */
  function repeatSection() {
    const i = S.selBar;
    if (i === null || !S.doc.bars[i]) return '';
    const h = S.doc.bars[i], R = TC.barRange();
    const sel = (action, list, cur) => `<select data-action="${action}">${list.map(([v, l]) =>
      `<option value="${v}"${(cur || '') === v ? ' selected' : ''}>${esc(tr(l))}</option>`).join('')}</select>`;
    const problems = TC.score.jumpProblems(S.doc);
    return `<section><h3>${tr('Repeats & jumps')}</h3>
      <div class="row"><label>${tr('Repeat')}</label>
        ${btn('toggleRepeatStart', undefined, '|:', !!h.repeatStart, tr('Repeat starts here |:'))}
        <select data-action="setRepeatEnd" title="${esc(tr('Repeat ends here :|'))}">${[0, 2, 3, 4, 5, 6].map((n) =>
          `<option value="${n}"${(h.repeatEnd || 0) === n ? ' selected' : ''}>${n ? ':| ' + tr('{n} times', { n }) : ':| –'}</option>`).join('')}</select>
        <select data-action="setVolta" title="${esc(tr('Ending (1st / 2nd time bar)'))}">${TC.actions.VOLTAS.map(([v, l]) =>
          `<option value="${v}"${(h.volta || []).join(',') === v ? ' selected' : ''}>${v ? '⌐ ' + l : '⌐ –'}</option>`).join('')}</select></div>
      ${R && R[1] > R[0] ? `<div class="btn-row">${btn('repeatSelection', 2, tr('Repeat bars {a}–{b}', { a: R[0] + 1, b: R[1] + 1 }))}</div>` : ''}
      <div class="row"><label>${tr('Sign')}</label>${sel('setMark', [['', '–'], ['segno', '𝄋 Segno (D.S. jumps here)'], ['segnoSegno', '𝄋𝄋 Segno Segno (D.S.S. jumps here)'],
        ['coda', '⊕ Coda (the coda starts here)'], ['doubleCoda', '⊕⊕ Double Coda (the double coda starts here)']], h.mark)}</div>
      <div class="row"><label>${tr('At the end')}</label>${sel('setEnd', [['', '–'], ['fine', 'Fine'], ['toCoda', 'To Coda ⊕'], ['toDoubleCoda', 'To Coda ⊕⊕ (Double Coda)']], h.end)}</div>
      <div class="row"><label>${tr('Jump')}</label>${sel('setJump', TC.actions.JUMP_LABELS, h.jump)}</div>
      ${h.jump ? check('toggleJumpRep', !!h.jumpRep, tr('Play the repeats after the jump (con rip.)')) : ''}
      ${problems.map((p) => `<p class="hint warn tight">${tr('Bar {n}', { n: p.bar + 1 })}: ${esc(TC.actions.jumpProblemText(p))}</p>`).join('')}
      <div class="btn-row">${btn('jumpHelp', undefined, 'ⓘ ' + tr('How jumps work'), false, '', 'link')}
        ${btn('unfoldRepeats', undefined, tr('Write out…'), false, tr('Write the repeats out (bar numbers as in Cubase)…'), TC.score.hasRepeats(S.doc) ? '' : 'off')}</div>
    </section>`;
  }

  /**
   * The tracks: click = write into it, 👁 show / hide, ✎ rename, ↑ ↓ order, ⧉ duplicate, ✕ delete.
   * They share the bars (time signature, tempo, repeats, jumps); notes and %-bars are their own.
   * Below: the instruments of the track being written (those of the drum kit, or its own; one line).
   */
  function tracksSection() {
    // (a piano is one entry: its two staves are one instrument)
    const cur = TC.curTrack(), ts = TC.score.instruments(S.doc), many = ts.length > 1, curI = TC.score.instrumentOf(S.doc, cur);
    const rows = ts.map((t, k) => `<div class="track-item${t.hidden ? ' hidden-track' : ''}">` +
      (many ? btn('toggleTrackHidden', t.id, t.hidden ? '◌' : '◉', false, tr(t.hidden ? 'Hidden – click: show' : 'Shown – click: hide'), 'icon eye') : '') +
      btn('selectTrack', t.id, esc(t.name), t === curI, tr(TC.score.isPiano(S.doc, t) ? 'Write into this track (two staves: tap the lower one for the left hand)' : 'Write into this track'), 'link') +
      (many ? btn('toggleMute', t.id, 'M', !!t.mute, tr(t.mute ? 'Muted – click: play' : 'Mute (not played)'), 'icon ms mute') +
        btn('toggleSolo', t.id, 'S', !!t.solo, tr('Solo: only the solo tracks are played'), 'icon ms solo') : '') +
      btn('renameTrack', t.id, '✎', false, tr('Rename'), 'icon') +
      (many ? btn('moveTrackUp', t.id, '↑', false, tr('Up'), 'icon' + (k ? '' : ' off')) +
        btn('moveTrackDown', t.id, '↓', false, tr('Down'), 'icon' + (k < ts.length - 1 ? '' : ' off')) : '') +
      btn('duplicateTrack', t.id, '⧉', false, tr('Duplicate track'), 'icon') +
      (many ? btn('deleteTrack', t.id, '✕', false, tr('Delete track'), 'icon') : '') + '</div>').join('');
    const art = TC.drums.byId(S.input.art);
    const own = TC.drums.ownKit(cur), ids = TC.drums.kit(cur);
    const list = own ? Object.keys(TC.DRUM_ELEMENTS).map((el) => {
      const arts = TC.DRUM_ARTS.filter((a) => a.el === el);
      const name = de() ? TC.DRUM_ELEMENTS[el].de : TC.DRUM_ELEMENTS[el].en;
      return `<div class="kit-group"><div class="el-name">${esc(name)}</div>` +
        arts.map((a) => check('toggleTrackArt', ids.has(a.id), `${esc(de() ? a.de : a.en)} <span class="muted">${esc(a.ab)}</span>`, a.id)).join('') + '</div>';
    }).join('') : '';
    return `<section><h3>${tr('Tracks')}</h3>
      <div class="track-list">${rows}</div>
      <div class="btn-row">${btn('addTrack', undefined, '+ ' + tr('Track'), false, tr('Add a track with the whole drum kit'))}
        ${art ? btn('addTrackFor', undefined, '+ ' + esc(tr('Track for {name}', { name: TC.drums.elName(art) })), false, tr('A track only for the selected instrument, on one line')) : ''}
        ${btn('addMelody', undefined, '+ ' + tr('Melody'), false, tr('A melody track (singing voice): notes with pitches, a scale'))}
        ${btn('addPiano', undefined, '+ ' + tr('Piano'), false, tr('Two staves: right hand (treble clef), left hand (bass clef)'))}</div>
      ${cur.kind === 'pitched' ? melodyTrackRows(cur) : `<div class="row"><label>${tr('Instruments')}</label><select data-action="setTrackKit">
        <option value="kit"${own ? '' : ' selected'}>${tr('Drum kit (⚙)')}</option><option value="own"${own ? ' selected' : ''}>${tr('Own selection ({n})', { n: own ? ids.size : '…' })}</option></select></div>
      ${own ? `${check('toggleTrackOneLine', !!cur.oneLine, tr('One staff line (every note on it)'))}
        <details class="kit-list"><summary>${tr('Choose instruments of "{name}"', { name: esc(cur.name) })}</summary>${list}</details>` : ''}`}
      ${trackSoundRows(cur)}
      ${many ? `<p class="hint tight">${tr('Click into a staff or on a name: you write into that track. Playback plays all tracks (hidden ones too) except the muted ones.')}</p>` : ''}
    </section>`;
  }

  /**
   * Sound of the track being written: its kit profile (keys for MIDI playback and export), and while
   * playing through MIDI its own output and channel (e.g. one loopMIDI port per drum VST in Cubase).
   */
  function trackSoundRows(t) {
    const scoreP = TC.kits.current(S.doc);
    const missing = TC.kits.trackMissing(S.doc, t);
    const profiles = [['', tr('Like the score ({name})', { name: scoreP ? scoreP.name : 'General MIDI' })], ['gm', 'General MIDI (Guitar Pro …)']]
      .concat(TC.kits.list.map((p) => [p.id, p.name]))
      .concat(missing ? [[t.profile, t.profileName + ' ' + tr('(missing)')]] : [])
      .map(([v, l]) => `<option value="${esc(v)}"${v === (t.profile || '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
    let midi = '';
    // where the track sounds: Tactus' sounds or its own MIDI output (+ channel)
    if (TC.midiOut && TC.midiOut.supported()) {
      // (drums: the channel the kit profile puts its keys on - the one of the snare - shown, e.g. to filter a VST to it)
      const kitK = t.kind === 'drums' && TC.midi.keyFor(TC.drums.byId(38), TC.kits.ofTrack(S.doc, t), { replaced: new Map(), missing: new Set() });
      const chs = [['', t.kind === 'pitched' ? tr('Channel {n} (default)', { n: (t.channel || 0) + 1 }) : tr('From the kit profile') + (kitK ? ' (' + tr('Channel {n}', { n: kitK.ch + 1 }) + ')' : '')]]
        .concat(Array.from({ length: 16 }, (_, k) => [String(k + 1), tr('Channel {n}', { n: k + 1 })]));
      const curCh = Number.isInteger(t.midiCh) ? String(t.midiCh + 1) : '';
      midi = `<div class="row"><label>${tr('Sound output')}</label><select data-action="setTrackMidiOut">${outputOptions(t)}</select>` +
        (t.midiOut ? btn('testTrackOut', undefined, '▶', false, tr('Test: one note to this output now'), 'icon') : '') + '</div>' +
        (t.midiOut ? `<div class="row"><label>${tr('Channel')}</label><select data-action="setTrackMidiCh">${chs.map(([v, l]) =>
          `<option value="${v}"${v === curCh ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : '');
    }
    const vol = Number.isInteger(t.volume) ? t.volume : 100;
    return `<div class="row"><label>${tr('Volume')}</label><input type="range" min="0" max="127" step="1" value="${vol}" data-trackvol title="${esc(tr('Fader of this track ({n}) - Tactus sounds softer / louder, through MIDI the channel volume (CC 7)', { n: vol }))}"></div>
      ${t.kind === 'pitched' ? '' : `<div class="row"><label>${tr('Kit profile')}</label><select data-action="setTrackProfile">${profiles}</select></div>
        <div class="btn-row">${btn('openKits', undefined, tr('Kit profiles (Cubase)…'), false, tr('Which key of your drum VST is which instrument; drum maps for Cubase'))}</div>`}${midi}${kswRows(t)}`;
  }

  /**
   * Keyswitches of a melody track's VST (js/keyswitch.js): the profile, which MIDI note the VST calls C3, and its keys -
   * each with ▶ (sends it now: the VST shows which it is) and its key to correct.
   */
  function kswRows(t) {
    if (t.kind !== 'pitched' || !TC.ksw) return '';
    // the built-in templates, then the own profiles (js/kswlib.js); a profile from another computer: as the track has it
    const p = t.ksw, own = TC.kswLib ? TC.kswLib.list : [];
    const sel = !p ? '' : p.lib && own.some((q) => q.id === p.lib) ? 'lib:' + p.lib : !p.lib && TC.ksw.template(p.tpl) ? p.tpl : 'cur';
    const opt = ([v, l]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`;
    const opts = opt(['', tr('None')]) + (sel === 'cur' ? opt(['cur', tr('{name} (in this score)', { name: p.name })]) : '') +
      `<optgroup label="${esc(tr('Templates'))}">${TC.ksw.TEMPLATES.map((x) => opt([x.tpl, x.name])).join('')}</optgroup>` +
      (own.length ? `<optgroup label="${esc(tr('Own profiles'))}">${own.map((q) => opt(['lib:' + q.id, q.name])).join('')}</optgroup>` : '');
    const libRow = `<div class="btn-row">${btn('openKswLib', undefined, tr('Keyswitch profiles…'), false, tr('Make your own (any instrument VST: UJAM, orchestral …), kept in Dropbox'))}${p ? btn('saveKswPreset', undefined, tr('Keep as own profile…'), false, tr('The keyswitches of this track, as corrected here, as an own profile - for other tracks and songs')) : ''}</div>`;
    let more = '';
    if (p) {
      const KIND = { art: 'way of playing', once: 'before a note', event: 'at its place', down: 'down stroke', up: 'up stroke', mode: 'switch' };
      const rows = p.keys.map((k) => `<div class="ksw-row">${btn('testKsw', k.id, '▶', false, tr('Send this key now'), 'icon')}
          <span class="ksw-name">${esc(tr(k.name))} <span class="muted">${esc(tr(KIND[k.kind]))}</span></span>
          <input type="text" class="ksw-note" data-kswnote data-id="${esc(k.id)}" value="${esc(k.note)}" maxlength="4" title="${esc(tr('Its key, as the VST names it (C3 = {n})', { n: p.c3 }))}"></div>`).join('');
      more = `<div class="row"><label>C3 =</label><div class="seg">${btn('setKswC3', 60, 'MIDI 60', p.c3 !== 48, tr('C3 is middle C (Cubase, most VSTs)'))}${btn('setKswC3', 48, 'MIDI 48', p.c3 === 48, tr('C3 an octave lower'))}</div></div>
        <div class="row"><label>${tr('Shift notes')}</label><select data-action="setKswShift">${[-12, 0, 12, 24, 36].map((n) => `<option value="${n}"${n === p.noteShift ? ' selected' : ''}>${n > 0 ? '+' : ''}${n}</option>`).join('')}</select></div>
        <p class="hint tight">${esc(tr('Notes go to the VST {n} semitones higher (check: a low note must sound as the VST\'s lowest string); at most {p} tones at a time.', { n: p.noteShift, p: p.poly || '–' }))}</p>
        <details class="ksw-list"><summary>${tr('Check / change the keys ({n})', { n: p.keys.length })}</summary>${rows}
          <p class="hint tight">${tr('▶ sends the key: the VST should show that way of playing. Wrong everywhere: switch C3 above.')}</p></details>`;
    }
    return `<div class="row"><label>${tr('Keyswitches')}</label><select data-action="setTrackKsw">${opts}</select></div>${more}${libRow}`;
  }

  /** All tempo changes of the score: click = go to the bar, ✕ = remove the change. */
  function tempoList() {
    const changes = [];
    let run = S.doc.meta.tempo;
    S.doc.bars.forEach((h, i) => {
      if (i > 0 && h.tempo && h.tempo !== run) changes.push([i, h.tempo]);
      if (i > 0 && h.tempo) run = h.tempo;
    });
    if (!changes.length) return `<p class="hint tight">${tr('Tempo changes: bar panel or bar menu, "Tempo from here".')}</p>`;
    return `<div class="tempo-list"><div class="muted">${tr('Tempo changes')}</div>` + changes.map(([i, t]) =>
      `<div class="tempo-item">${btn('gotoBar', i, `${tr('Bar')} ${i + 1}: ♩ = ${t}`, S.selBar === i, tr('Go to bar {n}', { n: i + 1 }), 'link')}` +
      `${btn('clearBarTempo', i, '✕', false, tr('Remove this tempo change'), 'icon')}</div>`).join('') + '</div>';
  }

  function scoreSection() {
    const m = S.doc.meta;
    const field = (k, label) => `<div class="row"><label>${tr(label)}</label><input type="text" data-meta="${k}" value="${esc(m[k])}"></div>`;
    return `<section><h3>${tr('Score')}</h3>
      ${field('title', 'Title')}${field('subtitle', 'Subtitle')}${field('artist', 'Artist')}
      <div class="row"><label>${tr('Tempo')}</label><input type="number" min="20" max="400" data-meta="tempo" value="${m.tempo}"> <span class="muted">BPM</span></div>
      ${tempoList()}
      <div class="row"><label>${tr('Swing')}</label><select data-action="setSwing">${TC.SWINGS.map(([v, l]) => `<option value="${v}"${v === (m.swing || 50) ? ' selected' : ''}>${esc(tr(l))}</option>`).join('')}</select>
        <select data-action="setSwingUnit"${(m.swing || 50) === 50 ? ' disabled' : ''}><option value="8"${m.swingUnit !== 16 ? ' selected' : ''}>${tr('8ths')}</option><option value="16"${m.swingUnit === 16 ? ' selected' : ''}>${tr('16ths')}</option></select></div>
      ${(m.swing || 50) !== 50 ? check('toggleSwingMidi', S.settings.swingMidi !== false, tr('Swing in the MIDI export too (off: straight, to swing it in the DAW)')) : ''}
    </section>`;
  }

  /** Own keyswitch profiles (js/kswlib.js) - next to the kit profiles; chosen at a melody track in "Tracks & sound". */
  function kswSection() {
    if (!TC.kswLib) return '';
    const n = TC.kswLib.list.length;
    return `<section><h3>${tr('Keyswitches')}</h3>
      <p class="hint tight">${n ? tr('{n} own keyswitch profile(s) - chosen at a melody track in "Tracks & sound".', { n }) : tr('Ways of playing of an instrument VST (UJAM, orchestral …): make a profile once, choose it at a melody track in "Tracks & sound".')}</p>
      <div class="btn-row">${btn('openKswLib', undefined, tr('Keyswitch profiles…'), false, tr('Make your own (any instrument VST: UJAM, orchestral …), kept in Dropbox'))}</div></section>`;
  }

  function kitSection() {
    const kit = S.settings.kit;
    const opts = Object.keys(TC.KITS).map((k) => `<option value="${k}"${k === kit ? ' selected' : ''}>${esc(de() ? TC.KITS[k].de : TC.KITS[k].en)}</option>`).join('');
    const notationOpts = Object.keys(TC.NOTATIONS).map((k) => `<option value="${k}"${k === TC.drums.notation ? ' selected' : ''}>${esc(de() ? TC.NOTATIONS[k].de : TC.NOTATIONS[k].en)}</option>`).join('');
    const ids = TC.drums.globalKit();
    const list = Object.keys(TC.DRUM_ELEMENTS).map((el) => {
      const arts = TC.DRUM_ARTS.filter((a) => a.el === el);
      const name = de() ? TC.DRUM_ELEMENTS[el].de : TC.DRUM_ELEMENTS[el].en;
      return `<div class="kit-group"><div class="el-name">${esc(name)}</div>` +
        arts.map((a) => check('toggleKitArt', ids.has(a.id), `${esc(de() ? a.de : a.en)} <span class="muted">${esc(a.ab)}</span>`, a.id)).join('') + '</div>';
    }).join('');
    return `<section><h3>${tr('Drum kit')}</h3>
      <div class="row"><label>${tr('Kit')}</label><select data-action="setKit">${opts}</select></div>
      <p class="hint tight">${tr('{n} instruments – only these appear in the note panel and the drum map.', { n: ids.size })}</p>
      <details class="kit-list"><summary>${tr('Choose instruments')}</summary>${list}</details>
      <div class="row"><label>${tr('Notation')}</label><select data-action="setNotation">${notationOpts}</select></div>
      <p class="hint tight">${tr('Where the instruments sit on the staff. Only the display changes.')}</p>
      ${stemsRows()}
      <div class="btn-row">${btn('openKits', undefined, tr('Kit profiles (Cubase)…'), false, tr('Which key of your drum VST is which instrument; drum maps for Cubase'))}</div>
      <h3 class="sub">${tr('Drum map')}</h3>
      ${check('toggleDrumMap', S.settings.showDrumMap, tr('Show next to the staff'))}
      ${check('toggleMapUsed', S.settings.mapUsedOnly, tr('Only instruments used in the score'))}
      <p class="hint">${tr('Pointer on a short name: its line lights up. Click: choose the instrument.')}</p>
    </section>`;
  }

  /** Stems: all up / feet down / feet + low toms down (with the toms to choose). */
  function stemsRows() {
    const mode = TC.drums.stems;
    const modes = [['up', 'All up (one voice)'], ['feet', 'Feet down (kick, pedal)'], ['low', 'Feet and low toms down']]
      .map(([k, label]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${esc(tr(label))}</option>`).join('');
    const low = new Set(Array.isArray(S.settings.stemsLow) ? S.settings.stemsLow : TC.drums.DEFAULT_LOW);
    const toms = mode === 'low' ? `<div class="stem-toms">${TC.DRUM_ARTS.filter((a) => a.el === 'tom')
      .map((a) => check('toggleStemLow', low.has(a.id), esc(de() ? a.de : a.en), a.id)).join('')}</div>` : '';
    return `<div class="row"><label>${tr('Stems')}</label><select data-action="setStems">${modes}</select></div>
      ${toms}
      <p class="hint tight">${tr('Lower voice: stems down, rests of its own. Only the notation changes, not the sound or the MIDI.')}</p>`;
  }

  function playSection() {
    const st = S.settings;
    return `<section><h3>${tr('Playback')}</h3>
      ${check('toggleMetronome', st.metronome, tr('Metronome'))}
      <div class="row"><label>${tr('Click')}</label><input type="range" min="0" max="2" step="0.05" value="${Number.isFinite(st.clickVol) ? st.clickVol : 1}" data-clickvol title="${tr('Loudness of the metronome and the count-in')}"></div>
      ${check('toggleFollowPlay', st.followPlay !== false, tr('The view follows the playback'))}
      ${st.followPlay !== false ? `<div class="row"><label>${tr('Following')}</label><select data-action="setFollowMode">
        <option value="jump"${st.followMode !== 'smooth' ? ' selected' : ''}>${tr('Jumping (at the edge)')}</option>
        <option value="smooth"${st.followMode === 'smooth' ? ' selected' : ''}>${tr('Smooth (glides along)')}</option></select></div>` : ''}
      ${check('toggleCountIn', st.countIn, tr('Count-in (one bar)'))}
      ${check('toggleLoop', st.loop, tr('Loop (the selected bar, otherwise everything)'))}
      ${check('toggleSound', st.sound, tr('Sound when writing a note'))}
      <div class="row"><label>${tr('Volume')}</label><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-volume></div>
      ${TC.wake.supported() ? `<div class="row"><label>${tr('Screen on')}</label><select data-action="setWake" title="${tr('Keeps the screen of a tablet or phone from turning off')}">${[['play', 'while playing and on stage'], ['always', 'while Tactus is open'], ['off', 'as the device does it']].map(([v, l]) =>
        `<option value="${v}"${(st.wake || 'play') === v ? ' selected' : ''}>${tr(l)}</option>`).join('')}</select></div>` : ''}
      ${soundRow()}${samplesRow()}
      <p class="hint">${tr('Space: play / stop · plays from the selected bar.')}</p>
    </section>`;
  }

  /**
   * The options of a track's output: Tactus' sounds, the MIDI outputs (one missing: marked), look for outputs.
   * val(output) -> the option value (the playback list puts the track's id in front).
   */
  function outputOptions(t, val = (v) => v) {
    const MO = TC.midiOut, outs = MO.outputs();
    return [['', tr('Tactus sounds')]].concat(outs.map((o) => [o, 'MIDI: ' + o]))
      .concat(t.midiOut && !outs.includes(t.midiOut) ? [[t.midiOut, 'MIDI: ' + t.midiOut + ' ' + tr('(missing)')]] : [])
      .map(([v, l]) => `<option value="${esc(val(v))}"${v === (t.midiOut || '') ? ' selected' : ''}>${esc(l)}</option>`).join('') +
      `<option value="${esc(val('?'))}">${tr(outs.length ? 'Look for MIDI outputs again…' : 'MIDI output (Cubase, a VST)…')}</option>`;
  }

  /**
   * Playback through MIDI: what holds for all tracks (lead, Tactus as well, MIDI off for now). The output itself is
   * chosen at each track ("Plays on") - one VST plays one instrument, e.g. EZDrummer the drums, Falcon the melody.
   */
  function soundRow() {
    const MO = TC.midiOut;
    if (!MO || !MO.supported()) return '';
    const st = S.settings, chosen = MO.chosen();
    let more = '';
    if (chosen) {
      if (MO.missing()) more += `<p class="hint warn">${tr('A MIDI output is not connected - is the virtual MIDI cable (e.g. loopMIDI) running?')}</p>`;
      more += check('toggleSoundOut', !!st.midiOff, tr('MIDI off for now: all with Tactus sounds'));
      more += `<div class="row"><label>${tr('Lead')}</label><input type="number" min="0" max="500" step="10" data-midilead value="${Number(st.midiLead) || 0}"> <span class="muted">ms</span></div>
        <p class="hint tight">${tr('Sends the notes earlier, as much as the drum VST is late (its audio buffer). Set it with the metronome on until both sound together.')} <a class="help-link" href="hilfe.html#vst-wiedergabe" target="tactus-help" title="${tr('Help: how this works')}">ⓘ</a></p>`;
      more += check('toggleMidiSynth', !!st.midiOutSynth, tr('Tactus sounds as well'));
    }
    // (the output itself: at each track, "Plays on" - here only what holds for all of them)
    return chosen ? more : `<p class="hint tight">${tr('MIDI (Cubase, a VST): at each track, "Plays on".')}</p>`;
  }

  /** Tactus' own sounds: synthesized or recorded (js/samples.js). */
  function samplesRow() {
    const st = S.settings;
    if (!st.midiOutSynth && TC.midiOut && S.doc.tracks.some((t) => t.kind === 'drums') && S.doc.tracks.filter((t) => t.kind === 'drums').every((t) => TC.midiOut.trackActive(t))) return ''; // (every drum track plays on a VST)
    const sm = TC.samples, state = sm ? sm.state() : 'off';
    const note = !st.samples ? '' : state === 'loading' ? `<p class="hint tight">${tr('Loading the recordings… (about 3.5 MB, once)')}</p>`
      : state === 'failed' ? `<p class="hint warn tight">${tr('The recordings could not be loaded (offline, or opened as a file) – the synthesizer plays.')}</p>` : '';
    const credit = st.samples ? `<p class="hint tight">${tr('Recordings: MuldjordKit by Lars Muldjord (CC BY 4.0) and Virtuosity Drums by Versilian Studios (CC0).')}</p>` : '';
    const rep = Math.round(TC.audio.reportedDelay() * 1000);
    const delay = `<div class="row"><label>${tr('Output delay')}</label><input type="number" min="0" max="500" step="10" data-audiodelay value="${Number(st.audioDelay) || 0}"> <span class="muted">ms</span></div>
      <p class="hint tight">${tr('The cursor runs ahead of the sound (e.g. Bluetooth headphones)? Enter the difference; the browser reports {n} ms itself, already allowed for.', { n: rep })} <a class="help-link" href="hilfe.html#verzoegerung" target="tactus-help" title="${tr('Help: how this works')}">ⓘ</a></p>`;
    return check('toggleSamples', !!st.samples, tr('Recorded drum sounds (samples) instead of the synthesizer')) + note + credit + delay;
  }

  /** Options of a spacing in % (std: marked as the standard). */
  const gapOpts = (list, cur, std) => list.map((p) =>
    `<option value="${p}"${p === cur ? ' selected' : ''}>${p} %${p === std ? ' (' + esc(tr('standard')) + ')' : ''}</option>`).join('');

  function pageSection() {
    const pg = S.doc.page;
    const per = [0, 2, 3, 4, 5, 6, 8].map((n) => `<option value="${n}"${n === pg.barsPerLine ? ' selected' : ''}>${n ? n : esc(tr('Automatic'))}</option>`).join('');
    const nums = [['system', 'At the start of each line'], ['every', 'Every bar'], ['off', 'None']]
      .map(([k, label]) => `<option value="${k}"${k === pg.barNumbers ? ' selected' : ''}>${esc(tr(label))}</option>`).join('');
    const margins = TC.MARGINS.map((mm) => `<option value="${mm}"${mm === pg.margin ? ' selected' : ''}>${mm} mm${mm === 15 ? ' (' + esc(tr('standard')) + ')' : ''}</option>`).join('');
    return `<section><h3>${tr('Page')}</h3>
      <div class="row"><label>${tr('Bars per line')}</label><select data-action="setBarsPerLine">${per}</select></div>
      <div class="row"><label>${tr('Bar numbers')}</label><select data-action="setBarNumbers">${nums}</select></div>
      <div class="row"><label>${tr('Margins')}</label><select data-action="setMargin">${margins}</select></div>
      <div class="row"><label>${tr('Staff spacing')}</label><select data-action="setStaffGap">${gapOpts(TC.STAFF_GAPS, pg.staffGap || 80, 80)}</select></div>
      <p class="hint tight">${tr('Space between the staves of several tracks (screen and PDF). Below 60 %, notes of full drum kits may touch.')}</p>
      <div class="row"><label>${tr('Line spacing')}</label><select data-action="setLineGap">${gapOpts(TC.LINE_GAPS, pg.lineGap || 100, 100)}</select></div>
      <p class="hint tight">${tr('Space between the lines of the page view, where a line breaks (PDF too).')}</p>
      ${check('togglePageHeader', pg.header, tr('Title and page number on the following pages'))}
      ${S.doc.tracks.some((t) => t.kind === 'pitched') ? check('toggleScaleNames', pg.scaleNames !== false, tr('Write the scale above the music ("D minor", "In-Sen on D")')) : ''}
      ${S.doc.tracks.some((t) => TC.score.lyricVerses(t)) ? check('toggleLyrics', pg.lyrics !== false, tr('Show lyrics (Ctrl+Shift+L)')) : ''}
      ${check('toggleMultiRest', pg.multiRest, tr('Combine empty bars (multi-bar rest)'))}
      <div class="row"><label>${tr('%-bars')}</label><select data-action="setSimileMode">${[['single', 'Each one as it is'], ['count', 'Narrow, counted (2, 3, 4 …)'], ['combine', 'One % with the number']]
        .map(([k, l]) => `<option value="${k}"${k === pg.simile ? ' selected' : ''}>${esc(tr(l))}</option>`).join('')}</select></div>
      <div class="btn-row">
        ${btn('toggleLayout', undefined, tr(S.settings.layout === 'page' ? 'Endless view' : 'Page view'), false)}
        ${btn('print', undefined, tr('PDF / print…'), false, 'Ctrl+P')}
      </div>
      <p class="hint">${tr('PDF: choose "Save as PDF" as the printer. Bar menu: text above a bar, new line.')}</p>
    </section>`;
  }

  /**
   * Turning pages: the stage view, and by MIDI from a player of backing tracks (js/remote.js): input,
   * what a message means (note n = page n, or learnt next / before), channel, the page turning MIDI file.
   */
  function turnSection() {
    const st = S.settings, R = TC.remote;
    let midi;
    if (!R || !R.supported()) {
      midi = `<p class="hint">${tr('Turning pages by MIDI needs Chrome or Edge (also on Android, with a USB MIDI interface) over https.')}</p>`;
    } else if (!R.inputs().length && !R.active()) {
      midi = `<div class="btn-row">${btn('remoteInit', undefined, tr('Show MIDI inputs…'), false, tr('The browser asks once whether Tactus may use MIDI'))}</div>
        ${st.remoteIn ? `<p class="hint warn">${tr('Input "{name}" is not connected.', { name: esc(st.remoteIn) })}</p>` : ''}`;
    } else {
      const ins = [['', tr('Off')]].concat(R.inputs().map((n) => [n, n]))
        .concat(st.remoteIn && !R.inputs().includes(st.remoteIn) ? [[st.remoteIn, st.remoteIn + ' ' + tr('(missing)')]] : []);
      const chs = [['all', tr('All channels')]].concat(Array.from({ length: 16 }, (_, k) => [String(k + 1), String(k + 1)]));
      const curCh = st.remoteCh === 'all' || st.remoteCh === undefined ? 'all' : String(Number(st.remoteCh) + 1);
      const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
      midi = `<div class="row"><label>${tr('MIDI input')}</label><select data-action="setRemoteIn">${opt(ins, st.remoteIn || '')}</select></div>
        <div class="row"><label>${tr('Message')}</label><select data-action="setRemoteMode">${opt([['page', tr('Note n = page n')], ['step', tr('Learnt: next / page before')]], st.remoteMode === 'step' ? 'step' : 'page')}</select></div>
        ${st.remoteMode === 'step' ? `<div class="row"><label>${tr('Next page')}</label><span class="muted">${esc(R.describe(st.remoteNext))}</span> ${btn('learnNext', undefined, tr('Learn'), R.isLearning() === 'next')}</div>
        <div class="row"><label>${tr('Page before')}</label><span class="muted">${esc(R.describe(st.remotePrev))}</span> ${btn('learnPrev', undefined, tr('Learn'), R.isLearning() === 'prev')}</div>`
          : `<p class="hint tight">${tr('Note 1 = page 1, note 2 = page 2 … (a program change: 0 = page 1). A lost message does not matter: the next one names its page.')}</p>`}
        <div class="row"><label>${tr('Channel')}</label><select data-action="setRemoteCh">${opt(chs, curCh)}</select></div>`;
    }
    const leads = [0, 1, 2].map((n) => [String(n), n ? tr(n === 1 ? '{n} bar before' : '{n} bars before', { n }) : tr('at the new page')]);
    const lead = String(st.turnLead === undefined ? 1 : st.turnLead);
    return `<section><h3>${tr('Turning pages')}</h3>
      <div class="btn-row">${btn('togglePerform', undefined, tr('Stage view'), false, tr('Only the pages, full screen; tap the right / left third, Page Down / Up or MIDI turns (Esc: back)'))}</div>
      ${midi}
      <h3 class="sub">${tr('Page turning MIDI file')}</h3>
      <p class="hint tight">${tr('A MIDI track for your player of backing tracks: a note when a new page comes (note n = page n, channel 16), with the tempo and the repeats of the score. Put it next to the backing tracks; Tactus turns when it hears it.')}</p>
      <div class="row"><label>${tr('Turn')}</label><select data-action="setTurnLead">${leads.map(([v, l]) => `<option value="${v}"${v === lead ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="btn-row">${btn('exportPageTurns', undefined, tr('Export page turning MIDI…'), false)}</div>
    </section>`;
  }

  function viewSection() {
    const fill = TC.curTrack().fill;
    const fills = [['beat', 'Up to the end of the beat'], ['next', 'Up to the next note'], ['off', 'As written']];
    const opts = fills.map(([k, label]) => `<option value="${k}"${k === fill ? ' selected' : ''}>${esc(tr(label))}</option>`).join('');
    return `<section><h3>${tr('View')}</h3>
      <div class="row"><label>${tr('Note values')}</label><select data-action="setFill">${opts}</select></div>
      <p class="hint tight">${tr('Rest cleanup: a note lasts until the next one instead of leaving rests (saved with the score).')}</p>
      ${check('toggleCounts', S.settings.showCounts, tr('Counting under the staff (1 e + a)'))}
      ${check('toggleLeftHanded', S.settings.leftHanded, tr('Left-handed mode (swap the panels)'))}
      ${check('toggleFingerWrites', S.settings.fingerWrites !== false, tr('Fingers write notes (off: only pen and mouse; a finger selects and scrolls)'))}
    </section>`;
  }

  function keysSection() {
    const k = TC.SHORTCUTS.map(([a, b]) => [tr(a), tr(b)]);
    return `<section><details class="keys-list"><summary><h3 class="inline">${tr('Keyboard shortcuts')}</h3></summary>
      <dl class="keys">${k.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></details></section>`;
  }

  // ---- Update -----------------------------------------------------------------------------------

  const typing = (root) => {
    const a = document.activeElement;
    return root.contains(a) && a.tagName === 'INPUT' && a.type !== 'checkbox';
  };

  P.update = function (force) {
    const hit = selectedNote();
    const lang = S.settings.lang;
    const keyN = JSON.stringify([S.tool, S.input, hit && hit.note, hit && hit.ev.dur, hit && hit.note.pitch !== undefined && JSON.stringify(TC.score.chordTies(S.doc, hit.track, hit.bar, hit.voice, hit.ev) || {}, ['gap', 'all', 'targets']), S.selection.size && TC.actions.selectedValue(), lang, S.settings.kit, S.settings.kitCustom, S.settings.kit === 'profile' && [...TC.drums.kit()].join(), TC.curTrack().id, TC.curTrack().kit, TC.curTrack().kind, TC.curTrack().inst, TC.curTrack().ksw && TC.curTrack().ksw.keys.length, S.selBar !== null && JSON.stringify((TC.curTrack().bars[S.selBar] || {}).ks || 0),
      // (dynamics: the selected bar, its places and what the track has there)
      S.selBar, S.selBarEnd, S.chordSlot, S.dynAll, S.wedgeDraft, S.dynSel, [...S.selection].join(), hit && hit.ev.notes.map((n) => n.stroke || '').join(), TC.gridTicks(S.input), S.selBar !== null && S.doc.bars[S.selBar] && S.doc.bars[S.selBar].ts, JSON.stringify(TC.curTrack().bars.map((b) => b.dyn || 0))]); // (a hairpin ends in a later bar)
    if ((force || keyN !== lastNotes) && !(!force && typing(notesRoot))) {
      lastNotes = keyN;
      const cur = hit ? hit.note.art : S.input.art;
      const scroll = notesRoot.scrollTop;
      // a melody track: no instruments - the tones come from the lines (and its scale)
      notesRoot.innerHTML = head(tr('Notes'), 'left') + dynSection(true) + toolSection() + valueSection() +
        (TC.curTrack().kind === 'pitched' ? melodyNoteSection(hit && hit.note.pitch !== undefined ? hit : null) : instrumentSection(cur) + noteSection(hit) + dynSection());
      notesRoot.scrollTop = TC.actions.dynSelected() ? 0 : scroll; // (a sign tapped in the score: its section on top)
    }
    const cur = TC.curTrack(), curBar = S.selBar !== null && cur.bars[S.selBar];
    const keyS = JSON.stringify([S.selBar, S.selBarEnd, S.selBar !== null && S.doc.bars[S.selBar], S.selBar !== null && !!(S.doc.bars[S.selBar + 1] || {}).lineBreak, S.doc.meta, lang,
      cur.id, !!(curBar && curBar.simile), S.input.art, JSON.stringify(S.doc.tracks.map((t) => [t.id, t.name, t.hidden, t.kit, t.oneLine, t.mute, t.solo, t.profile, t.midiOut, t.midiCh, t.kind, t.clef, t.voice, t.scale, t.program, t.volume, t.inst, t.ksw, S.selBar !== null && t.bars[S.selBar] && t.bars[S.selBar].dyn])), S.dynAll, cur.kind === 'pitched' && JSON.stringify([TC.score.scaleAt(cur, S.selBar || 0), curBar && curBar.scale]), TC.kits.list.map((p) => p.id + p.name).join(), TC.kswLib && TC.kswLib.list.map((p) => p.id + p.name).join(),
      S.settings, S.tsMode, !!S.clipboard, S.doc.bars.length, S.chordSlot, TC.gridTicks(S.input), !!S.analyze && S.rev, S.doc.harmony, TC.score.harmonyScale(S.doc, S.selBar || 0), S.doc.bars.map((b) => (b.guide || '') + (b.chords ? b.chords.length : '')).join(), TC.samples && TC.samples.state(), Math.round(TC.audio.reportedDelay() * 1000), S.doc.bars.map((b) => [b.tempo || 0, b.mark, b.end, b.jump, b.repeatStart ? 1 : 0, b.repeatEnd, b.volta].join(":")).join(), TC.midiOut && TC.midiOut.outputs().join(), TC.midiOut && TC.midiOut.active()]);
    if ((force || keyS !== lastSet) && !(!force && typing(setRoot))) {
      lastSet = keyS;
      const scroll = setRoot.scrollTop;
      const kitOpen = setRoot.querySelector('details.kit-list[open]') !== null; // (instruments of the track: stays open)
      // what is needed while writing: the track (and a melody's scale), the bar and what belongs to it, the score -
      // tracks and playback in their own window ("Tracks & sound…"), the rest in the settings window (⚙)
      setRoot.innerHTML = head(tr('Bar · score'), 'right') + trackBarSection() + barSection() + chordSection() + repeatSection() + findSection() + scoreSection() +
        `<section>${btn('openSettings', undefined, '⚙ ' + tr('More settings…'), false, tr('Drum kit, notation, page, view, keyboard shortcuts'), 'wide')}</section>`;
      if (kitOpen && setRoot.querySelector('details.kit-list')) setRoot.querySelector('details.kit-list').open = true;
      setRoot.scrollTop = scroll;
    }
    if (dlg && dlgMode === 'tracks') {
      // the window "Tracks & sound": the tracks and the playback (as the panel had them)
      const body = dlg.querySelector('.settings-body'), keyT = 'T' + keyS + JSON.stringify(TC.midiOut && TC.midiOut.failed());
      if ((force || keyT !== lastDlg) && !(!force && typing(body))) {
        lastDlg = keyT;
        const scroll = body.scrollTop, open = body.querySelector('details.kit-list[open]') !== null;
        body.innerHTML = tracksSection() + playSection();
        if (open && body.querySelector('details.kit-list')) body.querySelector('details.kit-list').open = true;
        body.scrollTop = scroll;
      }
    } else if (dlg) {
      const body = dlg.querySelector('.settings-body');
      const keyD = JSON.stringify([S.settings, S.doc.page, TC.curTrack().fill, lang, TC.drums.notation, TC.kits && TC.kits.list.length, TC.kswLib && TC.kswLib.list.length, TC.remote && [TC.remote.inputs().join(), TC.remote.isLearning(), TC.remote.active()]]);
      if ((force || keyD !== lastDlg) && !(!force && typing(body))) {
        lastDlg = keyD;
        const scroll = body.scrollTop;
        const open = body.querySelector('details.kit-list[open]') !== null;
        const keys = body.querySelector('details.keys-list[open]') !== null;
        body.innerHTML = kitSection() + kswSection() + pageSection() + turnSection() + viewSection() + keysSection();
        if (open) body.querySelector('details.kit-list').open = true;
        if (keys) body.querySelector('details.keys-list').open = true;
        body.scrollTop = scroll;
      }
    }
  };

  // ---- Settings window (⚙ in the toolbar): drum kit, notation, page, view, keys ----------------
  // set once and then rarely touched - kept out of the panel, so the panel stays short

  // the same window shows "Tracks & sound" (mode 'tracks'): the tracks and the playback - set up, then rarely touched
  let dlg = null, lastDlg = '', dlgMode = 'settings';
  P.isSettingsOpen = () => !!dlg;
  P.openSettings = function (mode) {
    mode = mode === 'tracks' ? 'tracks' : 'settings';
    if (dlg && dlgMode === mode) return P.closeSettings();
    if (dlg) P.closeSettings();
    dlgMode = mode;
    dlg = document.createElement('div');
    dlg.className = 'dialog-backdrop';
    dlg.innerHTML = `<div class="dialog settings-dialog" role="dialog" aria-modal="true">
      <header><h2>${mode === 'tracks' ? esc(tr('Tracks & sound')) : '⚙ ' + esc(tr('Settings'))}</h2><button type="button" class="icon" data-close title="${esc(tr('Close'))}">✕</button></header>
      <div class="settings-body"></div></div>`;
    dlg.addEventListener('pointerdown', (e) => { if (e.target === dlg) P.closeSettings(); });
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return P.closeSettings();
      onClick(e);
    });
    dlg.addEventListener('change', onChange);
    document.body.appendChild(dlg);
    lastDlg = '';
    P.update(true);
    if (mode === 'settings') document.getElementById('settings-btn').classList.add('active');
  };
  P.closeSettings = function () {
    if (dlg) dlg.remove();
    dlg = null;
    document.getElementById('settings-btn').classList.remove('active');
  };

  P.rebuild = () => P.update(true);

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
    const fn = TC.actions[el.dataset.action];
    if (fn) fn(el.dataset.value);
  }

  function onChange(e) {
    const el = e.target;
    if (el.matches('select[data-action]')) {
      TC.actions[el.dataset.action](el.value);
    } else if (el.matches('select[data-ts]')) {
      if (el.value === 'other') TC.actions.customTimeSig();
      else TC.actions.setTimeSig(el.value);
    } else if (el.matches('input[data-midilead]')) {
      TC.actions.setMidiLead(el.value);
    } else if (el.matches('input[data-audiodelay]')) {
      TC.actions.setAudioDelay(el.value);
    } else if (el.matches('input[data-clickvol]')) {
      TC.actions.setClickVol(el.value);
    } else if (el.matches('input[data-kswnote]')) {
      TC.actions.setKswNote(el.dataset.id + '|' + el.value);
    } else if (el.matches('input[data-trackvol]')) {
      TC.actions.setTrackVolume(el.value);
    } else if (el.matches('input[data-volume]')) {
      TC.actions.setVolume(el.value);
    } else if (el.matches('input[data-bartempo]')) {
      el.blur();
      TC.actions.setBarTempo(el.value);
    } else if (el.matches('input[data-marker]')) {
      el.blur();
      TC.actions.setMarker(el.value);
    } else if (el.matches('input[data-chord]')) {
      el.blur();
      TC.actions.typeChord(el.value);
    } else if (el.matches('input[data-chordvol]')) {
      TC.actions.setChordVol(el.value);
    } else if (el.matches('input[data-meta]')) {
      const k = el.dataset.meta;
      S.doc.meta[k] = k === 'tempo' ? TC.clamp(Math.round(Number(el.value) || 120), 20, 400) : el.value;
      el.blur();
      TC.commit();
    }
  }

  // ---- Layout: which panel on which side, widths, collapsing -----------------------------------

  P.applyLayout = function () {
    const st = S.settings;
    const main = document.getElementById('main');
    const wN = st.showPanel ? `${st.panelWidth || PANEL_DEFAULT}px` : '0px';
    const wS = st.showPanelRight ? `${st.panelRightWidth || PANEL_DEFAULT}px` : '0px';
    const rN = st.showPanel ? '5px' : '0px', rS = st.showPanelRight ? '5px' : '0px';
    if (st.leftHanded) {
      main.style.gridTemplateAreas = '"sp sr vp nr np"';
      main.style.gridTemplateColumns = `${wS} ${rS} minmax(0, 1fr) ${rN} ${wN}`;
    } else {
      main.style.gridTemplateAreas = '"np nr vp sr sp"';
      main.style.gridTemplateColumns = `${wN} ${rN} minmax(0, 1fr) ${rS} ${wS}`;
    }
    main.classList.toggle('left-handed', !!st.leftHanded);
    main.classList.toggle('no-notes', !st.showPanel);
    main.classList.toggle('no-settings', !st.showPanelRight);
    const set = (sel, on) => {
      const b = document.querySelector(sel);
      if (b) b.classList.toggle('active', on);
    };
    set('#toolbar [data-action="togglePanel"]', !!st.showPanel);
    set('#toolbar [data-action="togglePanelRight"]', !!st.showPanelRight);
  };

  /** Width handle of a panel ('notes' or 'settings'); dragging away from the score widens it. */
  function initResizer(resizer) {
    const isNotes = resizer.dataset.panel === 'notes';
    const key = isNotes ? 'panelWidth' : 'panelRightWidth';
    let startX = 0, startW = PANEL_DEFAULT, dragging = false, dir = 1;
    resizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      resizer.setPointerCapture(e.pointerId);
      resizer.classList.add('dragging');
      startX = e.clientX;
      startW = S.settings[key] || PANEL_DEFAULT;
      const panelLeft = isNotes !== !!S.settings.leftHanded; // the panel sits left of the score
      dir = panelLeft ? 1 : -1;
    });
    resizer.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const maxW = Math.min(PANEL_MAX, Math.max(260, window.innerWidth - 400));
      S.settings[key] = Math.round(Math.max(PANEL_MIN, Math.min(maxW, startW + dir * (e.clientX - startX))));
      P.applyLayout();
    });
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('dragging');
      TC.saveSettings();
    };
    resizer.addEventListener('pointerup', stop);
    resizer.addEventListener('pointercancel', stop);
    resizer.addEventListener('dblclick', () => {
      S.settings[key] = PANEL_DEFAULT;
      P.applyLayout();
      TC.saveSettings();
    });
  }

  P.init = function () {
    notesRoot = document.getElementById('panel-notes');
    setRoot = document.getElementById('panel-settings');
    for (const root of [notesRoot, setRoot]) {
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('input[data-meta], input[data-bartempo], input[data-chord]')) e.target.blur();
      });
    }
    document.querySelectorAll('.panel-expand').forEach((b) => b.addEventListener('click', () => {
      TC.actions.togglePanel(b.dataset.panel === 'settings' ? 'right' : 'left');
    }));
    document.querySelectorAll('.panel-resizer').forEach(initResizer);
    P.applyLayout();
  };
})(window.TC);
