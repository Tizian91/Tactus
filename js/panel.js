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
    const inp = S.input;
    const vals = TC.VALUES.map((v, k) => btn('setValue', v, `<span class="mus-btn">${NOTE_GLYPH[v]}</span>`, inp.value === v,
      `${tr(VALUE_NAME[v])} (${k + 1})`)).join('');
    const grid = TC.gridTicks(inp);
    const gridName = inp.triplet ? `1/${inp.value} ${tr('triplet')}` : inp.dotted ? `1/${inp.value * 2}` : `1/${inp.value}`;
    return `<section><h3>${tr('Note value')}</h3>
      <div class="values">${vals}</div>
      <div class="btn-row two">
        ${btn('toggleDotted', undefined, `<span class="mus-btn sm"></span> ${tr('Dotted')}`, inp.dotted, tr('Dotted (.)'))}
        ${btn('toggleTriplet', undefined, `<b>3</b>&nbsp;${tr('Triplet')}`, inp.triplet, tr('Triplet (T)'))}
      </div>
      <p class="hint">${tr('Click grid')}: <b>${gridName}</b> (${grid} ticks)${S.selection.size ? ' · ' + tr('changes the selected notes') : ''}</p>
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
      <p class="hint">${tr('Other instruments: drum kit in the settings (⚙).')}</p></section>`;
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
      ${beamRow}
      <p class="hint">${tr('Applies from this bar up to the next change.')}</p>
      <div class="row"><label>${tr('Repeat')}</label>
        ${btn('toggleRepeatStart', undefined, '|:', !!h.repeatStart, tr('Repeat starts here |:'))}
        <select data-action="setRepeatEnd" title="${esc(tr('Repeat ends here :|'))}">${[0, 2, 3, 4, 5, 6].map((n) =>
          `<option value="${n}"${(h.repeatEnd || 0) === n ? ' selected' : ''}>${n ? ':| ' + tr('{n} times', { n }) : ':| –'}</option>`).join('')}</select>
        <select data-action="setVolta" title="${esc(tr('Ending (1st / 2nd time bar)'))}">${TC.actions.VOLTAS.map(([v, l]) =>
          `<option value="${v}"${(h.volta || []).join(',') === v ? ' selected' : ''}>${v ? '⌐ ' + l : '⌐ –'}</option>`).join('')}</select></div>
      ${R && R[1] > R[0] ? `<div class="btn-row">${btn('repeatSelection', 2, tr('Repeat bars {a}–{b}', { a: R[0] + 1, b: R[1] + 1 }))}</div>` : ''}
      <div class="row"><label>${tr('Tempo')}</label><input type="number" min="20" max="400" data-bartempo value="${i === 0 ? S.doc.meta.tempo : h.tempo || ''}" placeholder="${TC.timeline.tempoAt(S.doc, i)}"> <span class="muted">${tr(i === 0 ? 'BPM' : 'from here')}</span></div>
      <div class="row"><label>${tr('Text')}</label><input type="text" data-marker maxlength="40" value="${esc(h.marker || '')}" placeholder="${esc(tr('e.g. Verse, Chorus'))}"></div>
      ${i > 0 ? check('toggleLineBreak', !!h.lineBreak, tr('New line from this bar (page view)')) : ''}
      ${S.doc.bars[i + 1] ? check('toggleBreakAfter', !!S.doc.bars[i + 1].lineBreak, tr('Line break after this bar (page view)')) : ''}
      <div class="btn-row">
        ${btn('copyBar', undefined, tr('Copy'), false, (many ? tr('Copy bars {a}–{b}', ab) : tr('Copy bar')) + ' (Ctrl+C)')}
        ${btn('pasteBar', undefined, tr('Paste'), false, tr('Paste into this bar') + ' (Ctrl+V)', S.clipboard ? '' : 'off')}
        ${btn('duplicateBar', undefined, tr('Duplicate'), false, (many ? tr('Duplicate bars {a}–{b}', ab) : tr('Duplicate bar')) + ' (Ctrl+D)')}
        ${i > 0 ? btn('toggleSimile', undefined, '%', !!h.simile, tr('Repeat the bar before (%)')) : ''}
      </div>
      <div class="btn-row">
        ${btn('insertBarBefore', undefined, tr('+ before'), false, tr('Insert bar before'))}
        ${btn('insertBarAfter', undefined, tr('+ after'), false, tr('Insert bar after'))}
        ${btn('clearBar', undefined, tr('Clear'), false, many ? tr('Clear bars {a}–{b}', ab) : tr('Clear bar'))}
        ${btn('deleteBar', undefined, tr('Delete'), false, many ? tr('Delete bars {a}–{b}', ab) : tr('Delete bar'), 'danger')}
      </div></section>`;
  }

  function scoreSection() {
    const m = S.doc.meta;
    const field = (k, label) => `<div class="row"><label>${tr(label)}</label><input type="text" data-meta="${k}" value="${esc(m[k])}"></div>`;
    return `<section><h3>${tr('Score')}</h3>
      ${field('title', 'Title')}${field('subtitle', 'Subtitle')}${field('artist', 'Artist')}
      <div class="row"><label>${tr('Tempo')}</label><input type="number" min="20" max="400" data-meta="tempo" value="${m.tempo}"> <span class="muted">BPM</span></div>
      <div class="row"><label>${tr('Swing')}</label><select data-action="setSwing">${TC.SWINGS.map(([v, l]) => `<option value="${v}"${v === (m.swing || 50) ? ' selected' : ''}>${esc(tr(l))}</option>`).join('')}</select>
        <select data-action="setSwingUnit"${(m.swing || 50) === 50 ? ' disabled' : ''}><option value="8"${m.swingUnit !== 16 ? ' selected' : ''}>${tr('8ths')}</option><option value="16"${m.swingUnit === 16 ? ' selected' : ''}>${tr('16ths')}</option></select></div>
      ${(m.swing || 50) !== 50 ? check('toggleSwingMidi', S.settings.swingMidi !== false, tr('Swing in the MIDI export too (off: straight, to swing it in the DAW)')) : ''}
    </section>`;
  }

  function kitSection() {
    const kit = S.settings.kit;
    const opts = Object.keys(TC.KITS).map((k) => `<option value="${k}"${k === kit ? ' selected' : ''}>${esc(de() ? TC.KITS[k].de : TC.KITS[k].en)}</option>`).join('');
    const notationOpts = Object.keys(TC.NOTATIONS).map((k) => `<option value="${k}"${k === TC.drums.notation ? ' selected' : ''}>${esc(de() ? TC.NOTATIONS[k].de : TC.NOTATIONS[k].en)}</option>`).join('');
    const ids = TC.drums.kit();
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
      ${check('toggleFollowPlay', st.followPlay !== false, tr('The view follows the playback'))}
      ${check('toggleCountIn', st.countIn, tr('Count-in (one bar)'))}
      ${check('toggleLoop', st.loop, tr('Loop (the selected bar, otherwise everything)'))}
      ${check('toggleSound', st.sound, tr('Sound when writing a note'))}
      <div class="row"><label>${tr('Volume')}</label><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-volume></div>
      ${soundRow()}
      <p class="hint">${tr('Space: play / stop · plays from the selected bar.')}</p>
    </section>`;
  }

  /** Where the playback sounds: Tactus' own sounds or a MIDI output (Cubase plays them, js/midiout.js). */
  function soundRow() {
    const MO = TC.midiOut;
    if (!MO || !MO.supported()) return '';
    const st = S.settings, outs = MO.outputs();
    if (st.midiOut && !outs.includes(st.midiOut)) outs.unshift(st.midiOut);
    const opts = [`<option value="">${tr('Tactus sounds')}</option>`]
      .concat(outs.map((n) => `<option value="${esc(n)}"${n === st.midiOut ? ' selected' : ''}>MIDI: ${esc(n)}</option>`))
      .concat(`<option value="?">${tr(outs.length ? 'Look for MIDI outputs again…' : 'MIDI output (Cubase …)…')}</option>`).join('');
    const p = TC.kits && TC.kits.current(S.doc);
    let more = '';
    if (st.midiOut) {
      more = MO.missing()
        ? `<p class="hint warn">${tr('"{name}" is not connected.', { name: st.midiOut })}</p>`
        : `<p class="hint tight">${tr('Keys of the kit profile: {name}', { name: p ? p.name : 'General MIDI' })}</p>`;
      more += `<div class="row"><label>${tr('Lead')}</label><input type="number" min="0" max="500" step="10" data-midilead value="${Number(st.midiLead) || 0}"> <span class="muted">ms</span></div>
        <p class="hint tight">${tr('Sends the notes earlier, as much as the drum VST is late (its audio buffer). Set it with the metronome on until both sound together.')}</p>`;
      more += check('toggleMidiSynth', !!st.midiOutSynth, tr('Tactus sounds as well'));
    }
    return `<div class="row"><label>${tr('Sound')}</label><select data-action="setMidiOut">${opts}</select></div>${more}`;
  }

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
      ${check('togglePageHeader', pg.header, tr('Title and page number on the following pages'))}
      <div class="btn-row">
        ${btn('toggleLayout', undefined, tr(S.settings.layout === 'page' ? 'Endless view' : 'Page view'), false)}
        ${btn('print', undefined, tr('PDF / print…'), false, 'Ctrl+P')}
      </div>
      <p class="hint">${tr('PDF: choose "Save as PDF" as the printer. Bar menu: text above a bar, new line.')}</p>
    </section>`;
  }

  function viewSection() {
    const fill = S.doc.tracks[0].fill;
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
    const k = [
      ['1 … 7', tr('Whole … 64th note')], ['.', tr('Dotted')], ['T', tr('Triplet')],
      ['L / Shift', tr('Lock instrument (switch / while held)')],
      ['H O S K', tr('Hi-hat closed / open, snare, kick')], ['R C F P', tr('Ride, crash, floor tom, pedal hi-hat')],
      ['A / G', tr('Accent / ghost note')], ['↑ ↓', tr('Selected notes to the next instrument')],
      [tr('Press, drag, release'), tr('A new note follows; release writes it')],
      [tr('Drag a note'), tr('Move it (sideways: time, up / down: instrument)')],
      [tr('Hold a note, drag'), tr('Row of notes (mouse: Ctrl + drag)')],
      [tr('Hold a note, up / down'), tr('Strength: ghost · soft · normal · strong · accent')],
      [tr('Hold a note, release'), tr('Menu: instruments of the line (hi-hat closed / open …), ghost / accent')],
      ['W / V / E', tr('Write / select / erase')], [tr('Ctrl+A'), tr('Select all notes (or those of the selected bars)')],
      ['← →', tr('Selected notes one grid step earlier / later')],
      [tr('Beside the lines'), tr('Tap: select the bar · drag: scroll')],
      [tr('Two fingers'), tr('Scroll and zoom')],
      [tr('Shift + click beside the lines'), tr('Select bars up to there')],
      [tr('Ctrl+click'), tr('Select several notes')],
      [tr('Space'), tr('Play / stop')], ['Ctrl+C / V / D', tr('Copy / paste / duplicate the bar')],
      [tr('Del'), tr('Delete selected notes')], ['Ctrl+Z / Y', tr('Undo / redo')],
      [tr('Wheel'), tr('Scroll (Ctrl: zoom, Shift: up/down)')], [tr('Space+drag'), tr('Move the view')],
    ];
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
    const keyN = JSON.stringify([S.tool, S.input, hit && hit.note, S.selection.size, lang, S.settings.kit, S.settings.kitCustom, S.settings.kit === 'profile' && [...TC.drums.kit()].join()]);
    if ((force || keyN !== lastNotes) && !(!force && typing(notesRoot))) {
      lastNotes = keyN;
      const cur = hit ? hit.note.art : S.input.art;
      const scroll = notesRoot.scrollTop;
      notesRoot.innerHTML = head(tr('Notes'), 'left') + toolSection() + valueSection() + instrumentSection(cur) + noteSection(hit);
      notesRoot.scrollTop = scroll;
    }
    const keyS = JSON.stringify([S.selBar, S.selBarEnd, S.selBar !== null && S.doc.bars[S.selBar], S.selBar !== null && !!(S.doc.bars[S.selBar + 1] || {}).lineBreak, S.doc.meta, lang,
      S.settings, !!S.clipboard, S.doc.bars.length, TC.midiOut && TC.midiOut.outputs().join(), TC.midiOut && TC.midiOut.active()]);
    if ((force || keyS !== lastSet) && !(!force && typing(setRoot))) {
      lastSet = keyS;
      const scroll = setRoot.scrollTop;
      // what is needed while writing; the rest is in the settings window (⚙)
      setRoot.innerHTML = head(tr('Bar · score'), 'right') + barSection() + playSection() + scoreSection() +
        `<section>${btn('openSettings', undefined, '⚙ ' + tr('More settings…'), false, tr('Drum kit, notation, page, view, keyboard shortcuts'), 'wide')}</section>`;
      setRoot.scrollTop = scroll;
    }
    if (dlg) {
      const body = dlg.querySelector('.settings-body');
      const keyD = JSON.stringify([S.settings, S.doc.page, S.doc.tracks[0].fill, lang, TC.drums.notation, TC.kits && TC.kits.list.length]);
      if ((force || keyD !== lastDlg) && !(!force && typing(body))) {
        lastDlg = keyD;
        const scroll = body.scrollTop;
        const open = body.querySelector('details.kit-list[open]') !== null;
        const keys = body.querySelector('details.keys-list[open]') !== null;
        body.innerHTML = kitSection() + pageSection() + viewSection() + keysSection();
        if (open) body.querySelector('details.kit-list').open = true;
        if (keys) body.querySelector('details.keys-list').open = true;
        body.scrollTop = scroll;
      }
    }
  };

  // ---- Settings window (⚙ in the toolbar): drum kit, notation, page, view, keys ----------------
  // set once and then rarely touched - kept out of the panel, so the panel stays short

  let dlg = null, lastDlg = '';
  P.isSettingsOpen = () => !!dlg;
  P.openSettings = function () {
    if (dlg) return P.closeSettings();
    dlg = document.createElement('div');
    dlg.className = 'dialog-backdrop';
    dlg.innerHTML = `<div class="dialog settings-dialog" role="dialog" aria-modal="true">
      <header><h2>⚙ ${esc(tr('Settings'))}</h2><button type="button" class="icon" data-close title="${esc(tr('Close'))}">✕</button></header>
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
    document.getElementById('settings-btn').classList.add('active');
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
    } else if (el.matches('input[data-volume]')) {
      TC.actions.setVolume(el.value);
    } else if (el.matches('input[data-bartempo]')) {
      el.blur();
      TC.actions.setBarTempo(el.value);
    } else if (el.matches('input[data-marker]')) {
      el.blur();
      TC.actions.setMarker(el.value);
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
        if (e.key === 'Enter' && e.target.matches('input[data-meta], input[data-bartempo]')) e.target.blur();
      });
    }
    document.querySelectorAll('.panel-expand').forEach((b) => b.addEventListener('click', () => {
      TC.actions.togglePanel(b.dataset.panel === 'settings' ? 'right' : 'left');
    }));
    document.querySelectorAll('.panel-resizer').forEach(initResizer);
    P.applyLayout();
  };
})(window.TC);
