'use strict';
/*
 * Kit profiles: which key of a drum VST plays which Tactus instrument.
 *
 * The instruments are fixed (TC.DRUM_ARTS: line and notehead come from the notation layout),
 * a profile only says which input note(s) of the VST's Cubase drum map belong to each one.
 * So no instrument can end up on a wrong line. The first key of an instrument is used for
 * export, the others are recognised on import (e.g. EZDrummer has four keys for "hi-hat closed").
 *
 *   profile = { id, name, mapName, drm, assign: { artId: [inote, …] } }
 *     drm   the vendor's drum map (text of the .drm file): key names, output notes, order
 *
 * Profiles live in the browser (localStorage 'tactus.kits') and can be exported / imported as
 * one file (*.tactus-kits.json). From a profile Tactus writes a Cubase drum map with the
 * notation of Tactus (display note from the line, notehead, instrument / technique).
 */
(function (TC) {
  const K = (TC.kits = {});
  const C = TC.cubase;
  const KEY = 'tactus.kits';

  // ---- Tactus instrument <-> drum map role (js/cubase.js) ---------------------------------

  /** Role (cubase.js) of each Tactus instrument: gives Cubase instrument / technique. */
  K.ART_ROLE = {
    36: 'kick', 35: 'kick2', 38: 'snare', 37: 'sidestick', 91: 'rimshot', 40: 'snare2', 39: 'clap', 54: 'tambourine',
    50: 'tomHigh', 48: 'tomMid', 47: 'tomMidLow', 45: 'tomLow', 43: 'tomFloor', 41: 'tomFloor2',
    42: 'hhClosed', 92: 'hhHalf', 46: 'hhOpen', 44: 'hhPedal',
    51: 'ride', 93: 'rideEdge', 53: 'rideBell', 94: 'ride:muted', 126: 'ride2', 59: 'ride2Edge', 127: 'ride2Bell',
    49: 'crash1', 97: 'crash1:muted', 57: 'crash2', 98: 'crash2:muted',
    52: 'china', 96: 'china:muted', 55: 'splash', 95: 'splash:muted', 56: 'cowbell',
    244: 'hhPedalOpen', 82: 'shaker', 75: 'accent',
    250: 'tomHigh:rimshot', 248: 'tomMid:rimshot', 247: 'tomMidLow:rimshot', 245: 'tomLow:rimshot', 243: 'tomFloor:rimshot', 241: 'tomFloor2:rimshot',
    350: 'tomHigh:rim', 348: 'tomMid:rim', 347: 'tomMidLow:rim', 345: 'tomLow:rim', 343: 'tomFloor:rim', 341: 'tomFloor2:rim',
  };
  /** Role -> Tactus instrument for the automatic assignment (variants join their instrument). */
  K.ROLE_ART = Object.assign({}, ...Object.entries(K.ART_ROLE).map(([id, r]) => ({ [r]: +id })), {
    snareEdge: 38, snare2: 40, snareRim: 37, clapPerc: 39, // rim only ~ side stick; BeatMaker's clap-like FX 1
    // more crashes join the two crash lines (high / low, like crash L / R), so the score stays
    // readable; the keys still sound different in the VST
    crash3: 49, crash4: 57, 'crash3:muted': 97, 'crash4:muted': 98,
  });

  // ---- Staff line <-> pitch (treble clef positions, as Cubase display notes) --------------

  const SEMI = [0, 2, 4, 5, 7, 9, 11];
  const F5 = 5 * 7 + 3; // diatonic index of F5 (top line = line 0)
  K.linePitch = function (line) {
    const d = F5 - line, oct = Math.floor(d / 7), deg = d - oct * 7;
    return 12 * (oct + 1) + SEMI[deg];
  };
  K.lineName = function (line) {
    const d = F5 - line, oct = Math.floor(d / 7), deg = d - oct * 7;
    return 'CDEFGAB'[deg] + oct;
  };
  /** Cubase notehead set of a Tactus notehead (used when the role has none). */
  const CUBASE_HEAD = { normal: 0, x: 34, circleX: 3, circleSlash: 3, heavyX: 34, heavyXHat: 34, diamond: 25, triangle: 28, slashed: 0 };

  /** Cubase notation of a Tactus instrument in the current layout. */
  /**
   * Cubase drum maps always get the Tactus layout, whatever the view shows: in the Guitar Pro
   * layout "crash medium" shares the hi-hat line (only a bolder cross), Cubase would show both alike.
   */
  K.LAYOUT = 'tactus';
  K.place = (a) => TC.drums.inLayout(a, K.LAYOUT);

  /** Cubase notation of a Tactus instrument. */
  K.styleOf = function (a) {
    const pl = K.place(a), role = K.ART_ROLE[a.id];
    const s = (role && C.style(role)) || { head: CUBASE_HEAD[pl.head] || 0, instrument: '', technique: '' };
    return { display: K.linePitch(pl.line), head: s.head, instrument: s.instrument, technique: s.technique };
  };

  // ---- Profiles (pure) ------------------------------------------------------------------

  const parsed = new Map();
  /** The parsed vendor drum map of a profile (cached). */
  K.map = function (p) {
    if (!parsed.has(p.drm)) parsed.set(p.drm, C.parse(p.drm));
    return parsed.get(p.drm);
  };

  /** A key without a real name ("", "-", Cubase's "Sound 12"). */
  K.noName = (e) => !e.name || e.name.trim() === '-' || /^sound \d+$/i.test(e.name);

  /**
   * Keys of a profile's drum map that can be chosen (in Cubase's order): named ones, and unnamed
   * ones that were set up (instrument or display note set) - e.g. UJAM's keys 30 and 34.
   */
  K.keys = function (p) {
    const m = K.map(p), by = new Map(m.entries.map((e) => [e.inote, e]));
    const order = m.order.concat(m.entries.map((e) => e.inote)).filter((n, i, a) => a.indexOf(n) === i);
    return order.map((n) => by.get(n)).filter((e) => e && (!K.noName(e) || e.instrument || (e.display !== 0 && e.display !== e.inote)));
  };

  /** Assignment guessed from the key names (and known misleading names of a map). */
  K.autoAssign = function (map) {
    const known = C.KNOWN[map.name.replace(/\s*\[\d+\]$/, '')] || {};
    const by = new Map(map.entries.map((e) => [e.inote, e]));
    const order = map.order.concat(map.entries.map((e) => e.inote)).filter((n, i, a) => a.indexOf(n) === i);
    const assign = {};
    for (const n of order) {
      const e = by.get(n);
      if (!e) continue;
      const art = K.ROLE_ART[known[n] || C.roleOf(e)];
      if (art && TC.drums.byId(art)) (assign[art] = assign[art] || []).push(n);
    }
    // a key whose output note another instrument's key also sends is probably mislabelled: not first
    const odd = new Set(K.suspicious({ assign }, map).map((e) => e.inote));
    for (const id of Object.keys(assign)) assign[id] = assign[id].filter((n) => !odd.has(n)).concat(assign[id].filter((n) => odd.has(n)));
    return assign;
  };

  /**
   * Assigned keys whose output note (ONote) is also sent by a key of another instrument,
   * e.g. EZDrummer key 40 "Hi-Hat Closed Tip" -> 43, the note of "Floortom 1".
   */
  K.suspicious = function (p, map = K.map(p)) {
    const by = new Map(map.entries.map((e) => [e.inote, e]));
    const arts = new Map(); // onote -> Set of instruments
    for (const [id, notes] of Object.entries(p.assign)) {
      for (const n of notes) {
        const e = by.get(n);
        if (!e) continue;
        if (!arts.has(e.onote)) arts.set(e.onote, new Set());
        arts.get(e.onote).add(+id);
      }
    }
    const out = [];
    for (const [id, notes] of Object.entries(p.assign)) {
      for (const n of notes) {
        const e = by.get(n);
        if (e && arts.get(e.onote).size > 1 && e.inote !== e.onote) out.push(Object.assign({ art: +id }, e));
      }
    }
    return out;
  };

  K.fromDrm = function (text, name) {
    const map = C.parse(text);
    return { id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || map.name.replace(/\s*\[\d+\]$/, ''),
      mapName: map.name, drm: text, assign: K.autoAssign(map) };
  };

  /** Sets the keys of an instrument; a key belongs to one instrument only. */
  K.setKeys = function (p, artId, notes) {
    notes = notes.filter((n, i, a) => Number.isInteger(n) && n >= 0 && n <= 127 && a.indexOf(n) === i);
    delete p.assign[artId];
    for (const id of Object.keys(p.assign)) {
      p.assign[id] = p.assign[id].filter((n) => !notes.includes(n));
      if (!p.assign[id].length) delete p.assign[id];
    }
    if (notes.length) p.assign[artId] = notes;
  };

  /** Instrument a key plays in a profile (null = none). */
  K.artOfKey = function (p, inote) {
    for (const [id, notes] of Object.entries(p.assign)) if (notes.includes(inote)) return +id;
    return null;
  };

  /** Recognised drum keys of the map that no Tactus instrument uses (e.g. tom rim shots, crash 3). */
  K.unassigned = function (p) {
    const known = C.KNOWN[K.map(p).name.replace(/\s*\[\d+\]$/, '')] || {};
    return K.keys(p).filter((e) => K.artOfKey(p, e.inote) === null && (known[e.inote] || C.roleOf(e)));
  };

  /**
   * Assigned instruments of different kinds that would look the same in Cubase (display note and
   * notehead), e.g. hi-hat and a crash. Variants of one kind (ride / ride edge) are fine.
   */
  K.lookalikes = function (p) {
    const groups = new Map();
    for (const a of K.rows()) {
      if (!p.assign[a.id]) continue;
      const s = K.styleOf(a), k = s.display + '|' + s.head;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    return [...groups.values()].filter((g) => new Set(g.map((a) => a.el)).size > 1);
  };

  /** Instruments in the order of the dialog and of the Cubase map: top of the staff first. */
  K.rows = function () {
    return TC.DRUM_ARTS.map((a, i) => [a, i, K.place(a).line]).sort((x, y) => x[2] - y[2] || x[1] - y[1]).map((x) => x[0]);
  };

  /** Cubase drum map of a profile: every assigned key gets the notation of its instrument. */
  K.toDrm = function (p) {
    const styles = {}, order = [];
    for (const a of K.rows()) {
      for (const n of p.assign[a.id] || []) {
        styles[n] = K.styleOf(a);
        const e = K.map(p).entries.find((x) => x.inote === n);
        if (e && K.noName(e)) styles[n].name = TC.drums.label(a); // unnamed key: name it after the instrument
        order.push(n);
      }
    }
    // drum keys without a Tactus instrument: placed like their kind, but no Cubase instrument,
    // so they cannot be mistaken for one of ours
    const known = C.KNOWN[K.map(p).name.replace(/\s*\[\d+\]$/, '')] || {};
    for (const e of K.unassigned(p)) {
      const s = C.style(known[e.inote] || C.roleOf(e));
      if (s) styles[e.inote] = { display: s.display, head: s.head, instrument: '', technique: '' };
    }
    return C.write(p.drm, styles, { name: p.name + ' (Tactus)', order });
  };

  // ---- Storage ----------------------------------------------------------------------------

  K.list = [];
  K.load = function () {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      K.list = d && Array.isArray(d.profiles) ? d.profiles.filter((p) => p && p.drm && p.assign) : [];
    } catch (e) {
      K.list = [];
    }
  };
  /** Keep the profiles in the browser; when connected also in Dropbox (fromSync: they came from there). */
  K.save = function (fromSync) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, profiles: K.list }));
    } catch (e) {
      return false;
    }
    if (!fromSync && TC.dropbox) TC.dropbox.kitsChanged();
    return true;
  };
  K.byId = (id) => K.list.find((p) => p.id === id) || null;

  /** Kit profile of a score (doc.meta.kit; by name when the id is unknown here), null = General MIDI. */
  K.current = function (doc) {
    const m = doc && doc.meta;
    if (!m || (!m.kit && !m.kitName)) return null;
    return K.byId(m.kit) || K.list.find((p) => p.name === m.kitName) || null;
  };

  K.exportText = () => JSON.stringify({ format: 'tactus-kits', version: 1, profiles: K.list }, null, 1);
  /** Adds the profiles of an exported file (same id: replaced). Returns how many. */
  K.importText = function (text) {
    const d = JSON.parse(text);
    if (!d || d.format !== 'tactus-kits' || !Array.isArray(d.profiles)) throw new Error('not a Tactus kit file');
    let n = 0;
    for (const p of d.profiles) {
      if (!p || typeof p.drm !== 'string' || !p.assign) continue;
      const i = K.list.findIndex((q) => q.id === p.id);
      if (i >= 0) K.list[i] = p;
      else K.list.push(p);
      n++;
    }
    return n;
  };

  // ---- Dialog -----------------------------------------------------------------------------

  const tr = (s, v) => TC.tr(s, v);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let root = null, cur = null;

  K.isOpen = () => !!root;

  K.open = function () {
    K.load();
    if (!root) {
      root = document.createElement('div');
      root.className = 'dialog-backdrop';
      root.innerHTML = '<div class="dialog kit-dialog" role="dialog" aria-modal="true"></div>';
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('pointerdown', (e) => { if (e.target === root) K.close(); });
      document.body.appendChild(root);
    }
    if (!K.byId(cur)) cur = K.list.length ? K.list[0].id : null;
    draw();
  };

  K.close = function () {
    if (root) root.remove();
    root = null;
    if (TC.refresh) TC.refresh(); // status bar: name of the kit profile
  };

  function keyLabel(e) {
    return `${e.inote} · ${K.noName(e) ? tr('(no name)') : e.name}` + (e.onote !== e.inote ? ` (→ ${e.onote})` : '');
  }

  function draw() {
    const box = root.querySelector('.dialog');
    const p = K.byId(cur);
    const opts = K.list.map((q) => `<option value="${q.id}"${q.id === cur ? ' selected' : ''}>${esc(q.name)}</option>`).join('');
    let body = '';
    if (!p) {
      body = `<div class="kit-empty"><p>${tr('No kit profile yet.')}</p>
        <p class="hint">${tr('Load the Cubase drum map of your drum VST (.drm). Tactus guesses from the key names which key is which instrument; you only correct what does not fit.')}</p>
        <button type="button" data-k="new">${tr('Load drum map…')}</button></div>`;
    } else {
      const keys = K.keys(p);
      const rows = K.rows().map((a) => {
        const notes = p.assign[a.id] || [];
        const first = notes[0];
        const options = `<option value="">—</option>` + keys.map((e) => {
          const other = K.artOfKey(p, e.inote);
          const mark = other !== null && other !== a.id ? ' ◦' : '';
          return `<option value="${e.inote}"${e.inote === first ? ' selected' : ''}>${esc(keyLabel(e))}${mark}</option>`;
        }).join('');
        const pl = K.place(a), g = TC.HEADS[pl.head] || TC.HEADS.normal;
        return `<tr class="${notes.length ? '' : 'none'}">
          <td class="pos"><span class="mus-head">${g.g[0]}</span> ${K.lineName(pl.line)}</td>
          <td class="name">${esc(TC.drums.label(a))}</td>
          <td><select data-art="${a.id}">${options}</select></td>
          <td><input type="text" data-extra="${a.id}" value="${notes.slice(1).join(', ')}" placeholder="${tr('more keys')}"></td></tr>`;
      }).join('');
      const free = K.unassigned(p), odd = K.suspicious(p), alike = K.lookalikes(p);
      body = `<p class="hint tight">${tr('Line and notehead are fixed per instrument (Tactus notation, also in the Cubase drum map). Choose the key of your drum map for each one; more keys (e.g. 11, 61) are recognised on import.')}</p>
        <table class="kit-table"><thead><tr><th>${tr('Line')}</th><th>${tr('Instrument')}</th><th>${tr('Key in the drum map')}</th><th>${tr('More keys')}</th></tr></thead><tbody>${rows}</tbody></table>
        ${alike.length ? `<p class="hint warn"><b>${tr('Look the same in Cubase (same line and notehead):')}</b> ${alike.map((g) => g.map((a) => esc(TC.drums.label(a))).join(' / ') + ' (' + K.lineName(K.place(g[0]).line) + ')').join(' · ')}</p>` : ''}
        ${odd.length ? `<p class="hint warn"><b>${tr('Please check (same output note as another instrument):')}</b> ${odd.map((e) => esc(keyLabel(e)) + ' = ' + esc(TC.drums.label(TC.drums.byId(e.art)))).join(' · ')}</p>` : ''}
        ${free.length ? `<details class="hint kit-free"><summary>${tr('{n} more keys of the drum map have no Tactus instrument (info)', { n: free.length })}</summary>${free.map((e) => esc(keyLabel(e))).join(' · ')}</details>` : ''}`;
    }
    box.innerHTML = `<header><h2>${tr('Kit profiles')}</h2><button type="button" class="icon" data-k="close" title="${tr('Close')}">✕</button></header>
      <div class="kit-bar">
        ${K.list.length ? `<select data-k="pick">${opts}</select>` : ''}
        <button type="button" data-k="new">${tr('New from drum map…')}</button>
        ${p && TC.state.doc && K.current(TC.state.doc) !== p ? `<button type="button" data-k="use" class="primary">${tr('Use for this score')}</button>` : p ? `<span class="muted">✓ ${tr('used by this score')}</span>` : ''}
        ${p ? `<button type="button" data-k="copy">${tr('Copy')}</button><button type="button" data-k="rename">${tr('Rename…')}</button><button type="button" class="danger" data-k="delete">${tr('Delete')}</button>` : ''}
      </div>
      <div class="kit-body">${body}</div>
      <footer>
        ${p ? `<button type="button" data-k="drm" class="primary">${tr('Save drum map for Cubase')}</button>` : ''}
        <span class="grow"></span>
        <button type="button" data-k="export"${K.list.length ? '' : ' disabled'}>${tr('Export profiles')}</button>
        <button type="button" data-k="import">${tr('Import profiles…')}</button>
      </footer>`;
  }

  function changed() {
    K.save();
    const scroll = root.querySelector('.kit-body').scrollTop;
    draw();
    root.querySelector('.kit-body').scrollTop = scroll;
  }

  function pickFile(accept, done) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => done(String(r.result), f.name);
      r.readAsText(f);
    });
    inp.click();
  }

  function download(text, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  const fileName = (s) => s.replace(/[\\/:*?"<>|]+/g, '-');

  function onClick(e) {
    const b = e.target.closest('[data-k]');
    if (!b || b.tagName === 'SELECT') return;
    const p = K.byId(cur);
    switch (b.dataset.k) {
      case 'close': K.close(); break;
      case 'new':
        pickFile('.drm', (text, fname) => {
          try {
            const q = K.fromDrm(text);
            if (!q.name) q.name = fname.replace(/\.drm$/i, '');
            K.list.push(q);
            cur = q.id;
            changed();
          } catch (err) {
            alert(tr('This is not a Cubase drum map (.drm).'));
          }
        });
        break;
      case 'use':
        TC.actions.setKitProfile(p.id);
        draw();
        break;
      case 'copy': {
        const q = JSON.parse(JSON.stringify(p));
        q.id = 'k' + Date.now().toString(36);
        q.name = tr('{name} (copy)', { name: p.name });
        K.list.push(q);
        cur = q.id;
        changed();
        break;
      }
      case 'rename': {
        const name = prompt(tr('Name of the kit profile:'), p.name);
        if (name && name.trim()) {
          p.name = name.trim();
          if (TC.state.doc && TC.state.doc.meta.kit === p.id) TC.state.doc.meta.kitName = p.name;
          changed();
        }
        break;
      }
      case 'delete':
        if (confirm(tr('Delete the kit profile "{name}"?', { name: p.name }))) {
          K.list = K.list.filter((q) => q !== p);
          cur = null;
          K.save();
          K.open();
        }
        break;
      case 'drm':
        download(K.toDrm(p), fileName(p.name) + ' (Tactus).drm', 'application/xml');
        break;
      case 'export':
        download(K.exportText(), 'Kits.tactus-kits.json', 'application/json');
        break;
      case 'import':
        pickFile('.json', (text) => {
          try {
            const n = K.importText(text);
            K.save();
            K.open();
            TC.ui && TC.ui.status && TC.ui.status(tr('{n} kit profile(s) imported.', { n }));
          } catch (err) {
            alert(tr('This is not a Tactus kit file.'));
          }
        });
        break;
    }
  }

  function onChange(e) {
    const t = e.target, p = K.byId(cur);
    if (t.dataset.k === 'pick') { cur = t.value; draw(); return; }
    if (!p) return;
    if (t.dataset.art) {
      const id = +t.dataset.art, rest = (p.assign[id] || []).slice(1);
      K.setKeys(p, id, t.value === '' ? rest : [+t.value].concat(rest));
      changed();
    } else if (t.dataset.extra) {
      const id = +t.dataset.extra, first = (p.assign[id] || [])[0];
      const more = t.value.split(/[^0-9]+/).filter(Boolean).map(Number);
      K.setKeys(p, id, (first === undefined ? [] : [first]).concat(more));
      changed();
    }
  }
})(window.TC);
