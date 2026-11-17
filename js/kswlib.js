'use strict';
/*
 * Own keyswitch profiles (a library, like the kit profiles): the keyswitches of any instrument VST - a UJAM guitarist
 * or bassist, an orchestral library (staccato, tremolo, pizz. …) - made once, then chosen at a track like a template.
 *
 *   profile = { id, name, c3, noteShift, poly, init, keys }   (keys as in js/keyswitch.js)
 *
 * They live in the browser (localStorage 'tactus.ksw'), are exported / imported as one file (*.tactus-keyswitches.json)
 * and, when Dropbox is connected, kept there in step (js/dropbox.js: /Keyswitch-Profile/).
 * A track takes a copy (track.ksw, with lib = the id): the score keeps playing on a computer without the profile.
 * Changing a profile here brings the tracks of the open score that use it along (when the dialog is closed).
 */
(function (TC) {
  const L = (TC.kswLib = {});
  const KS = TC.ksw;
  const KEY = 'tactus.ksw';
  const tr = (s, v) => (TC.tr ? TC.tr(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const newId = () => 'ks' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---- Profiles ---------------------------------------------------------------------------

  /** A profile of the library cleaned (keys as a track's, may have none yet), or null. */
  L.clean = function (p) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) return null;
    // (tpl '': an own profile is never replaced by a newer version of a template it was copied from)
    const c = KS.clean(Object.assign({}, p, { tpl: '', lib: '', keys: Array.isArray(p.keys) ? p.keys : [] }), true);
    if (!c) return null;
    delete c.lib;
    return Object.assign({ id: p.id.slice(0, 40) }, c);
  };
  /** An empty profile (C3 = 60, notes as written). */
  L.blank = (name) => ({ id: newId(), tpl: '', v: 1, name: String(name || tr('New profile')).slice(0, 60), c3: 60, noteShift: 0, poly: 0, init: [], keys: [] });
  /** A profile from a built-in template (Iron 2, Rowdy …) - to change into another VST of the same maker. */
  L.fromTemplate = function (tplId, name) {
    const t = KS.fromTemplate(tplId);
    return t ? L.clean(Object.assign(t, { id: newId(), name: name || t.name })) : null;
  };
  /** A profile from the keyswitches of a track (as they were corrected there). */
  L.fromTrack = (ksw, name) => L.clean(Object.assign(JSON.parse(JSON.stringify(ksw)), { id: newId(), name: name || ksw.name }));
  /** The copy a track takes (lib: where it came from). null if the profile has no keys yet. */
  L.toTrack = function (id) {
    const p = L.byId(id);
    if (!p || !p.keys.length) return null;
    const c = JSON.parse(JSON.stringify(p));
    delete c.id;
    return Object.assign(c, { tpl: '', lib: p.id });
  };
  /** A new key for a profile: the key after the last one (a free one), a way of playing. */
  L.newKey = function (p) {
    const used = new Set(p.keys.map((k) => KS.noteOf(k.note, p.c3)));
    let n = p.keys.length ? Math.max(...used) + 1 : KS.noteOf('C0', p.c3);
    while (used.has(n) && n < 127) n++;
    const ids = new Set(p.keys.map((k) => k.id));
    let i = p.keys.length + 1;
    while (ids.has('key' + i)) i++;
    return { id: 'key' + i, name: tr('Way of playing {n}', { n: i }), short: '', note: KS.nameOf(Math.min(127, n), p.c3), kind: 'art' };
  };
  /** The tracks of a score that use an own profile take it as it is now; how many changed. */
  L.syncScore = function (doc) {
    let n = 0;
    for (const t of (doc && doc.tracks) || []) {
      if (!t.ksw || !t.ksw.lib || !L.byId(t.ksw.lib)) continue;
      const now = L.toTrack(t.ksw.lib);
      if (now && JSON.stringify(now) !== JSON.stringify(t.ksw)) { t.ksw = now; n++; }
    }
    return n;
  };

  // ---- Storage ----------------------------------------------------------------------------

  L.list = [];
  L.load = function () {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      L.list = d && Array.isArray(d.profiles) ? d.profiles.map(L.clean).filter(Boolean) : [];
    } catch (e) {
      L.list = [];
    }
  };
  /** Keep the profiles in the browser; when connected also in Dropbox (fromSync: they came from there). */
  L.save = function (fromSync) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, profiles: L.list }));
    } catch (e) {
      return false;
    }
    if (!fromSync && TC.dropbox && TC.dropbox.kswChanged) TC.dropbox.kswChanged();
    return true;
  };
  L.byId = (id) => L.list.find((p) => p.id === id) || null;
  L.exportText = (list) => JSON.stringify({ format: 'tactus-keyswitches', version: 1, profiles: list || L.list }, null, 1);
  /** Adds the profiles of an exported file (same id: replaced). Returns how many. */
  L.importText = function (text) {
    const d = JSON.parse(text);
    if (!d || d.format !== 'tactus-keyswitches' || !Array.isArray(d.profiles)) throw new Error('not a Tactus keyswitch file');
    let n = 0;
    for (const raw of d.profiles) {
      const p = L.clean(raw);
      if (!p) continue;
      const i = L.list.findIndex((q) => q.id === p.id);
      if (i >= 0) L.list[i] = p;
      else L.list.push(p);
      n++;
    }
    return n;
  };

  // ---- Dialog -----------------------------------------------------------------------------

  let root = null, cur = null, touched = false;
  L.isOpen = () => !!root;

  /** The dialog; id: the profile shown first. */
  L.open = function (id) {
    if (!root) {
      L.load();
      touched = false;
      root = document.createElement('div');
      root.className = 'dialog-backdrop';
      root.innerHTML = '<div class="dialog kit-dialog ksw-dialog" role="dialog" aria-modal="true"></div>';
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('pointerdown', (e) => { if (e.target === root) L.close(); });
      root.addEventListener('keydown', (e) => { if (e.key === 'Escape') L.close(); e.stopPropagation(); });
      document.body.appendChild(root);
    }
    if (id) cur = id;
    if (!L.byId(cur)) cur = L.list.length ? L.list[0].id : null;
    draw();
  };

  /** Closed: the tracks of the open score that use a changed profile take it (one undo step). */
  L.close = function () {
    if (root) root.remove();
    root = null;
    const doc = TC.state && TC.state.doc;
    if (touched && doc) {
      const n = L.syncScore(doc);
      if (n) {
        TC.commit();
        TC.ui.hint(tr('{n} track(s) of this score took the changed keyswitches', { n }));
      }
    }
    touched = false;
    if (TC.refresh) TC.refresh();
  };

  const KINDS = () => [
    ['art', tr('Way of playing (holds until the next)')], ['once', tr('Before a note (slide …)')], ['event', tr('At its place (stop …)')],
    ['down', tr('Down stroke ↓')], ['up', tr('Up stroke ↑')], ['mode', tr('Switch (only ▶, at the start)')],
  ];

  function extraCell(p, k) {
    if (k.kind === 'art') {
      return `<input type="text" data-f="group" data-id="${esc(k.id)}" value="${esc(k.group || '')}" maxlength="20" placeholder="${esc(tr('group'))}"
        title="${esc(tr('Ways of playing of one group replace each other (e.g. "mute": open / muted / dead). Empty: all without a group are one group.'))}">`;
    }
    if (k.kind === 'once') {
      return `<select data-f="span" data-id="${esc(k.id)}" title="${esc(tr('How long the key is held'))}">
        <option value="">${esc(tr('this and the next note'))}</option><option value="note"${k.span === 'note' ? ' selected' : ''}>${esc(tr('this note only'))}</option></select>`;
    }
    if (k.kind === 'mode') {
      return `<label class="check" title="${esc(tr('Sent unseen when playing starts (e.g. a trigger mode the VST needs)'))}"><input type="checkbox" data-f="init" data-id="${esc(k.id)}"${p.init.includes(k.id) ? ' checked' : ''}> ${esc(tr('at the start'))}</label>`;
    }
    return '';
  }

  function draw() {
    const box = root.querySelector('.dialog');
    const p = L.byId(cur), t = TC.curTrack && TC.curTrack();
    const opts = L.list.map((q) => `<option value="${esc(q.id)}"${q.id === cur ? ' selected' : ''}>${esc(q.name)}</option>`).join('');
    const uses = !!(p && t && t.ksw && t.ksw.lib === p.id);
    let body;
    if (!p) {
      body = `<div class="kit-empty"><p>${tr('No own keyswitch profile yet.')}</p>
        <p class="hint">${tr('A profile says which low key of an instrument VST plays which way of playing (muted, slide, staccato, pizz. …). Tactus writes them as directions in the score and sends the keys before the notes.')}</p>
        <p class="hint">${tr('Start empty and add the keys of the VST\'s key chart, or copy a template of a similar VST and correct it.')}</p>
        <button type="button" data-k="blank">${tr('New, empty…')}</button> <button type="button" data-k="template">${tr('New from template…')}</button>
        ${t && t.ksw ? ` <button type="button" data-k="fromTrack">${tr('From this track…')}</button>` : ''}</div>`;
    } else {
      const kinds = KINDS();
      const rows = p.keys.map((k) => `<tr>
          <td><button type="button" class="icon play" data-k="play" data-id="${esc(k.id)}" title="${esc(tr('Send this key now'))}">▶</button></td>
          <td><input type="text" data-f="name" data-id="${esc(k.id)}" value="${esc(k.name)}" maxlength="60"></td>
          <td><input type="text" class="ksw-short" data-f="short" data-id="${esc(k.id)}" value="${esc(k.short)}" maxlength="12" placeholder="—"></td>
          <td><input type="text" class="ksw-note" data-f="note" data-id="${esc(k.id)}" value="${esc(k.note)}" maxlength="4"></td>
          <td><select data-f="kind" data-id="${esc(k.id)}">${kinds.map(([v, l]) => `<option value="${v}"${v === k.kind ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
          <td>${extraCell(p, k)}</td>
          <td><button type="button" class="icon" data-k="delKey" data-id="${esc(k.id)}" title="${esc(tr('Remove this key'))}">✕</button></td></tr>`).join('');
      const midiHint = t && TC.midiOut && TC.midiOut.trackActive(t) ? ''
        : `<p class="hint tight">${tr('▶ sends a key to the MIDI output of the track being written - it has none now (at the track: "Plays on").')}</p>`;
      body = `<div class="ksw-head">
          <label>C3 = <select data-f="c3"><option value="60"${p.c3 !== 48 ? ' selected' : ''}>MIDI 60</option><option value="48"${p.c3 === 48 ? ' selected' : ''}>MIDI 48</option></select></label>
          <label>${tr('Shift notes')} <select data-f="noteShift">${[-24, -12, 0, 12, 24, 36].map((n) => `<option value="${n}"${n === p.noteShift ? ' selected' : ''}>${n > 0 ? '+' : ''}${n}</option>`).join('')}</select></label>
          <label title="${esc(tr('How many tones the VST plays at a time (a tapped chord is written for it); empty: any'))}">${tr('Tones at a time')} <input type="number" data-f="poly" min="0" max="16" value="${p.poly || ''}" placeholder="–"></label>
        </div>
        <p class="hint tight">${tr('Key: as the VST names it (C0, F#1, Bb2 - counted from its C3). Text: written in the score (empty: not written, e.g. "open"). Ways of playing hold until the next one of their group; a key "before a note" is held over the note; one "at its place" is struck there.')}</p>${midiHint}
        ${p.keys.length ? `<table class="kit-table ksw-table"><thead><tr><th></th><th>${tr('Name')}</th><th>${tr('Text in the score')}</th><th>${tr('Key')}</th><th>${tr('Kind')}</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p>${tr('No keys yet.')}</p>`}
        <p><button type="button" data-k="addKey">+ ${tr('Key')}</button></p>`;
    }
    box.innerHTML = `<header><h2>${tr('Keyswitch profiles')} <a class="help-link" href="hilfe.html#keyswitch-profile" target="tactus-help" title="${tr('Help: how this works')}">ⓘ</a></h2><button type="button" class="icon" data-k="close" title="${tr('Close')}">✕</button></header>
      <div class="kit-bar">
        ${L.list.length ? `<select data-k="pick">${opts}</select>` : ''}
        <button type="button" data-k="blank">${tr('New, empty…')}</button>
        <button type="button" data-k="template">${tr('New from template…')}</button>
        ${t && t.ksw ? `<button type="button" data-k="fromTrack" title="${esc(tr('The keyswitches of the track being written, as corrected there'))}">${tr('From this track…')}</button>` : ''}
        ${p && t && t.kind === 'pitched' ? (uses ? `<span class="muted">✓ ${tr('used by this track')}</span>` : `<button type="button" data-k="use" class="primary">${tr('Use for this track')}</button>`) : ''}
        ${p ? `<button type="button" data-k="copy">${tr('Copy')}</button><button type="button" data-k="rename">${tr('Rename…')}</button><button type="button" class="danger" data-k="delete">${tr('Delete')}</button>` : ''}
      </div>
      <div class="kit-body">${body}</div>
      <footer>
        <span class="hint">${TC.dropbox && TC.dropbox.signedIn && TC.dropbox.signedIn() ? '☁ ' + tr('Kept in Dropbox (Keyswitch-Profile)') : tr('Kept in this browser - connect Dropbox to have them everywhere')}</span>
        <span class="grow"></span>
        <button type="button" data-k="exportOne"${p ? '' : ' disabled'}>${tr('Export this one')}</button>
        <button type="button" data-k="export"${L.list.length ? '' : ' disabled'}>${tr('Export profiles')}</button>
        <button type="button" data-k="import">${tr('Import profiles…')}</button>
      </footer>`;
  }

  /** Saved; drawn again when the table changes (not for a typed name: the focus stays where it went). */
  function changed(redraw) {
    touched = true;
    L.save();
    if (!redraw) return;
    const body = root.querySelector('.kit-body'), scroll = body.scrollTop;
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
  function download(text, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const fileName = (s) => s.replace(/[\\/:*?"<>|]+/g, '-');

  function add(q) {
    L.list.push(q);
    cur = q.id;
    changed(true);
  }

  function onClick(e) {
    const b = e.target.closest('[data-k]');
    if (!b || b.tagName === 'SELECT') return;
    const p = L.byId(cur), t = TC.curTrack && TC.curTrack();
    switch (b.dataset.k) {
      case 'close': L.close(); break;
      case 'blank': {
        const name = prompt(tr('Name of the VST (e.g. "UJAM Virtual Guitarist Carbon", "Iconica Sketch Strings"):'), '');
        if (name && name.trim()) add(L.blank(name.trim()));
        break;
      }
      case 'template': {
        const r = b.getBoundingClientRect();
        TC.menu.open(KS.TEMPLATES.map((x) => ({ label: x.name, action: () => {
          const name = prompt(tr('Name of the VST (e.g. "UJAM Virtual Guitarist Carbon", "Iconica Sketch Strings"):'), tr('{name} (copy)', { name: x.name }));
          if (name && name.trim()) add(L.fromTemplate(x.tpl, name.trim()));
        } })), r.left, r.bottom + 2);
        break;
      }
      case 'fromTrack': {
        if (!t || !t.ksw) break;
        const name = prompt(tr('Name of the keyswitch profile:'), t.ksw.name);
        if (name && name.trim()) add(L.fromTrack(t.ksw, name.trim()));
        break;
      }
      case 'use':
        if (!p.keys.length) { TC.ui.hint(tr('The profile has no keys yet.')); break; }
        TC.actions.setTrackKsw('lib:' + p.id);
        draw();
        break;
      case 'copy': {
        const q = JSON.parse(JSON.stringify(p));
        q.id = newId();
        q.name = tr('{name} (copy)', { name: p.name });
        add(q);
        break;
      }
      case 'rename': {
        const name = prompt(tr('Name of the keyswitch profile:'), p.name);
        if (name && name.trim()) { p.name = name.trim().slice(0, 60); changed(true); }
        break;
      }
      case 'delete':
        if (confirm(tr('Delete the keyswitch profile "{name}"? Scores keep their copy.', { name: p.name }))) {
          L.list = L.list.filter((q) => q !== p);
          cur = null;
          L.save();
          L.open();
        }
        break;
      case 'addKey':
        p.keys.push(L.newKey(p));
        changed(true);
        { const ins = root.querySelectorAll('input[data-f="name"]'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); } }
        break;
      case 'delKey':
        p.keys = p.keys.filter((k) => k.id !== b.dataset.id);
        p.init = p.init.filter((id) => id !== b.dataset.id);
        changed(true);
        break;
      case 'play': {
        const k = p && p.keys.find((x) => x.id === b.dataset.id), n = k && KS.noteOf(k.note, p.c3);
        if (n === null || n === undefined) break;
        TC.midiOut.init().then(() => {
          if (!t || !TC.midiOut.trackActive(t)) return TC.ui.hint(tr('▶ sends a key to the MIDI output of the track being written - it has none now (at the track: "Plays on").'));
          TC.midiOut.note(n, 0, 0.3, 0.8, null, t, true);
          TC.ui.hint(tr('{name}: {key} (MIDI {n}) sent', { name: k.name, key: k.note, n }));
        });
        break;
      }
      case 'exportOne':
        download(L.exportText([p]), fileName(p.name) + '.tactus-keyswitches.json');
        break;
      case 'export':
        download(L.exportText(), 'Keyswitches.tactus-keyswitches.json');
        break;
      case 'import':
        pickFile('.json', (text) => {
          try {
            const n = L.importText(text);
            touched = true;
            L.save();
            L.open();
            TC.ui.hint(tr('{n} keyswitch profile(s) imported.', { n }));
          } catch (err) {
            alert(tr('This is not a Tactus keyswitch file.'));
          }
        });
        break;
    }
  }

  function onChange(e) {
    const el = e.target, p = L.byId(cur);
    if (el.dataset.k === 'pick') { cur = el.value; draw(); return; }
    if (!p || !el.dataset.f) return;
    const f = el.dataset.f, k = el.dataset.id && p.keys.find((x) => x.id === el.dataset.id);
    if (f === 'c3') { p.c3 = Number(el.value) === 48 ? 48 : 60; return changed(false); }
    if (f === 'noteShift') { p.noteShift = Math.max(-36, Math.min(36, parseInt(el.value, 10) || 0)); return changed(false); }
    if (f === 'poly') { const n = parseInt(el.value, 10); p.poly = n > 0 ? Math.min(16, n) : 0; return changed(false); }
    if (!k) return;
    if (f === 'name') { k.name = el.value.trim().slice(0, 60) || k.id; return changed(false); }
    if (f === 'short') { k.short = el.value.trim().slice(0, 12); return changed(false); }
    if (f === 'group') { if (el.value.trim()) k.group = el.value.trim().slice(0, 20); else delete k.group; return changed(false); }
    if (f === 'span') { if (el.value === 'note') k.span = 'note'; else delete k.span; return changed(false); }
    if (f === 'init') {
      p.init = p.init.filter((id) => id !== k.id).concat(el.checked ? [k.id] : []);
      return changed(false);
    }
    if (f === 'note') {
      const name = el.value.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
      if (KS.noteOf(name, p.c3) === null) {
        TC.ui.hint(tr('"{name}" is no key - e.g. F#2, Bb2, C1', { name }));
        el.value = k.note;
        return;
      }
      k.note = name.charAt(0).toUpperCase() + name.slice(1);
      el.value = k.note;
      return changed(false);
    }
    if (f === 'kind' && KS.KINDS.includes(el.value)) {
      k.kind = el.value;
      if (k.kind !== 'art') delete k.group;
      if (k.kind !== 'once') delete k.span;
      if (k.kind !== 'mode') p.init = p.init.filter((id) => id !== k.id);
      changed(true);
    }
  }
})(window.TC);
