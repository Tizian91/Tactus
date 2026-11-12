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
      <p class="hint">${tr('Other instruments: drum kit in the settings panel.')}</p></section>`;
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
    const cur = S.doc.bars[i].ts.join('/');
    const known = TC.TIME_SIGS.map((t) => t.join('/'));
    const opts = (known.includes(cur) ? known : [cur].concat(known)).map((t) => `<option${t === cur ? ' selected' : ''}>${t}</option>`).join('');
    return `<section><h3>${tr('Bar')} ${i + 1}</h3>
      <div class="row"><label>${tr('Time sig.')}</label><select data-ts>${opts}<option value="other">${tr('Other…')}</option></select></div>
      <p class="hint">${tr('Applies from this bar up to the next change.')}</p>
      <div class="btn-row">
        ${btn('insertBarBefore', undefined, tr('+ before'), false, tr('Insert bar before'))}
        ${btn('insertBarAfter', undefined, tr('+ after'), false, tr('Insert bar after'))}
        ${btn('clearBar', undefined, tr('Clear'), false, tr('Clear bar'))}
        ${btn('deleteBar', undefined, tr('Delete'), false, tr('Delete bar'), 'danger')}
      </div></section>`;
  }

  function scoreSection() {
    const m = S.doc.meta;
    const field = (k, label) => `<div class="row"><label>${tr(label)}</label><input type="text" data-meta="${k}" value="${esc(m[k])}"></div>`;
    return `<section><h3>${tr('Score')}</h3>
      ${field('title', 'Title')}${field('subtitle', 'Subtitle')}${field('artist', 'Artist')}
      <div class="row"><label>${tr('Tempo')}</label><input type="number" min="20" max="400" data-meta="tempo" value="${m.tempo}"> <span class="muted">BPM</span></div>
    </section>`;
  }

  function kitSection() {
    const kit = S.settings.kit;
    const opts = Object.keys(TC.KITS).map((k) => `<option value="${k}"${k === kit ? ' selected' : ''}>${esc(de() ? TC.KITS[k].de : TC.KITS[k].en)}</option>`).join('');
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
      <h3 class="sub">${tr('Drum map')}</h3>
      ${check('toggleDrumMap', S.settings.showDrumMap, tr('Show next to the staff'))}
      ${check('toggleMapUsed', S.settings.mapUsedOnly, tr('Only instruments used in the score'))}
      <p class="hint">${tr('Pointer on a short name: its line lights up. Click: choose the instrument.')}</p>
    </section>`;
  }

  function viewSection() {
    return `<section><h3>${tr('View')}</h3>
      ${check('toggleLeftHanded', S.settings.leftHanded, tr('Left-handed mode (swap the panels)'))}
    </section>`;
  }

  function keysSection() {
    const k = [
      ['1 … 7', tr('Whole … 64th note')], ['.', tr('Dotted')], ['T', tr('Triplet')],
      ['L / Shift', tr('Lock instrument (switch / while held)')],
      ['H O S K', tr('Hi-hat closed / open, snare, kick')], ['R C F P', tr('Ride, crash, floor tom, pedal hi-hat')],
      ['A / G', tr('Accent / ghost note')], ['↑ ↓', tr('Selected notes to the next instrument')],
      [tr('Ctrl+click'), tr('Select several notes')],
      [tr('Del'), tr('Delete selected notes')], ['Ctrl+Z / Y', tr('Undo / redo')],
      [tr('Wheel'), tr('Scroll (Ctrl: zoom, Shift: up/down)')], [tr('Space+drag'), tr('Move the view')],
    ];
    return `<section><details><summary><h3 class="inline">${tr('Keyboard shortcuts')}</h3></summary>
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
    const keyN = JSON.stringify([S.input, hit && hit.note, S.selection.size, lang, S.settings.kit, S.settings.kitCustom]);
    if ((force || keyN !== lastNotes) && !(!force && typing(notesRoot))) {
      lastNotes = keyN;
      const cur = hit ? hit.note.art : S.input.art;
      const scroll = notesRoot.scrollTop;
      notesRoot.innerHTML = head(tr('Notes'), 'left') + valueSection() + instrumentSection(cur) + noteSection(hit);
      notesRoot.scrollTop = scroll;
    }
    const keyS = JSON.stringify([S.selBar, S.selBar !== null && S.doc.bars[S.selBar] && S.doc.bars[S.selBar].ts, S.doc.meta, lang,
      S.settings.showDrumMap, S.settings.mapUsedOnly, S.settings.kit, S.settings.kitCustom, S.settings.leftHanded, S.doc.bars.length]);
    if ((force || keyS !== lastSet) && !(!force && typing(setRoot))) {
      lastSet = keyS;
      const scroll = setRoot.scrollTop;
      const open = setRoot.querySelector('details.kit-list[open]') !== null;
      setRoot.innerHTML = head(tr('Settings'), 'right') + barSection() + scoreSection() + kitSection() + viewSection() + keysSection();
      if (open) setRoot.querySelector('details.kit-list').open = true;
      setRoot.scrollTop = scroll;
    }
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
        if (e.key === 'Enter' && e.target.matches('input[data-meta]')) e.target.blur();
      });
    }
    document.querySelectorAll('.panel-expand').forEach((b) => b.addEventListener('click', () => {
      TC.actions.togglePanel(b.dataset.panel === 'settings' ? 'right' : 'left');
    }));
    document.querySelectorAll('.panel-resizer').forEach(initResizer);
    P.applyLayout();
  };
})(window.TC);
