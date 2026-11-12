'use strict';
/*
 * Saving and loading (simplified from MindMapper's storage.js).
 *  - Files: readable JSON (*.tactus.json). In Chrome / Edge the File System Access API
 *    is used, so "Save" writes back into the same file; other browsers download / upload.
 *  - Autosave: the open score is kept in the browser (localStorage) and comes back on start.
 */
(function (TC) {
  const S = TC.state;
  const ST = (TC.storage = {});
  const AUTOSAVE_KEY = 'tactus.autosave';
  const SETTINGS_KEY = 'tactus.settings';
  const FILE_TYPES = [{ description: 'Tactus score', accept: { 'application/json': ['.json'] } }];
  const tr = (s, v) => TC.tr(s, v);

  // the program was called NoteWriter at first: what it kept in the browser is read once
  const OLD_KEYS = { [AUTOSAVE_KEY]: 'notewriter.autosave', [SETTINGS_KEY]: 'notewriter.settings' };

  function safeGet(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null && OLD_KEYS[key] ? localStorage.getItem(OLD_KEYS[key]) : v;
    } catch (e) {
      return null;
    }
  }
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false; // storage unavailable (private mode, full …)
    }
  }

  // ---- Settings ----------------------------------------------------------------------

  TC.saveSettings = function () {
    safeSet(SETTINGS_KEY, JSON.stringify({ settings: S.settings, input: S.input }));
  };

  ST.loadSettings = function () {
    try {
      const data = JSON.parse(safeGet(SETTINGS_KEY) || 'null');
      if (data) {
        Object.assign(S.settings, data.settings || {});
        const inp = data.input || {};
        if (TC.VALUES.includes(inp.value)) S.input.value = inp.value;
        if (TC.drums.byId(inp.art)) S.input.art = inp.art;
        S.input.dotted = !!inp.dotted;
        S.input.triplet = !!inp.triplet && !S.input.dotted;
      }
    } catch (e) {
      /* ignore corrupt settings */
    }
  };

  // ---- Autosave into the browser --------------------------------------------------------

  let timer = 0;
  ST.scheduleAutosave = function () {
    clearTimeout(timer);
    timer = setTimeout(ST.autosave, 600);
  };
  ST.autosave = function () {
    clearTimeout(timer);
    safeSet(AUTOSAVE_KEY, JSON.stringify({ doc: S.doc, file: { name: S.file.name, saved: S.file.saved }, dirty: S.dirty }));
    TC.saveSettings();
  };
  /** The score of the last session, or null. */
  ST.restore = function () {
    try {
      const data = JSON.parse(safeGet(AUTOSAVE_KEY) || 'null');
      if (!data || !data.doc) return null;
      return { doc: TC.normalizeDoc(data.doc), name: data.file && String(data.file.name || '').replace(/\.notewriter\.json$/, '.tactus.json'), dirty: !!data.dirty };
    } catch (e) {
      return null;
    }
  };
  window.addEventListener('beforeunload', (e) => {
    ST.autosave();
    if (S.dirty && S.file.handle) {
      e.preventDefault(); // unsaved changes in a file: the browser asks
      e.returnValue = '';
    }
  });

  // ---- Files ------------------------------------------------------------------------------

  function setDoc(doc, name, handle) {
    S.doc = doc;
    S.selection.clear();
    S.selBar = null;
    S.hover = null;
    S.file = { handle: handle || null, name: name || 'Untitled.tactus.json', saved: !!handle };
    S.dirty = false;
    TC.history.reset();
    S.rev++;
    ST.autosave();
    TC.refresh();
  }

  ST.newScore = function () {
    if (S.dirty && !confirm(tr('Discard the changes of the open score?'))) return;
    setDoc(TC.emptyScore(8));
    TC.actions.home();
    TC.ui.hint(tr('New score'));
  };

  ST.loadDemo = function () {
    if (S.dirty && !confirm(tr('Discard the changes of the open score?'))) return;
    setDoc(ST.demoDoc(), 'Example.tactus.json');
    TC.actions.home();
  };

  const toText = () => JSON.stringify(S.doc, null, 1);

  const suggestName = () => {
    if (S.file.saved) return S.file.name;
    const t = (S.doc.meta.title || '').replace(/[\\/:*?"<>|]+/g, '').trim();
    return (t || 'Untitled') + '.tactus.json';
  };

  ST.save = async function (saveAs) {
    const text = toText();
    try {
      if (window.showSaveFilePicker) {
        let handle = S.file.handle;
        if (!handle || saveAs) {
          handle = await window.showSaveFilePicker({ suggestedName: suggestName(), types: FILE_TYPES });
        }
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
        S.file = { handle, name: handle.name, saved: true };
      } else {
        const name = saveAs || !S.file.saved ? prompt(tr('File name'), suggestName()) : S.file.name;
        if (!name) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = /\.json$/i.test(name) ? name : name + '.tactus.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        S.file = { handle: null, name: a.download, saved: true };
      }
      S.dirty = false;
      ST.autosave();
      TC.refresh();
      TC.ui.hint(tr('Saved: {name}', { name: S.file.name }));
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      alert(tr('Could not save: {msg}', { msg: e && e.message }));
    }
  };

  async function readFile(file, handle) {
    try {
      const doc = TC.normalizeDoc(JSON.parse(await file.text()));
      setDoc(doc, file.name, handle);
      TC.ui.hint(tr('Opened: {name}', { name: file.name }));
    } catch (e) {
      alert(tr('This file cannot be opened: {msg}', { msg: e && e.message }));
    }
  }

  ST.open = async function () {
    if (S.dirty && !confirm(tr('Discard the changes of the open score?'))) return;
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES });
        await readFile(await handle.getFile(), handle);
      } catch (e) {
        if (!e || e.name !== 'AbortError') alert(tr('This file cannot be opened: {msg}', { msg: e && e.message }));
      }
      return;
    }
    const input = document.getElementById('file-input');
    input.value = '';
    input.onchange = () => input.files[0] && readFile(input.files[0], null);
    input.click();
  };

  // ---- Example -----------------------------------------------------------------------------

  /** A rock groove with a fill, shown on the very first start. */
  ST.demoDoc = function () {
    const doc = TC.emptyScore(4);
    doc.meta.title = 'Beispiel-Groove';
    doc.meta.artist = 'Tactus';
    doc.meta.tempo = 100;
    const tr0 = doc.tracks[0];
    const put = (bar, tick, dur, art, extra) => {
      const a = TC.drums.byId(art);
      TC.score.place(doc, tr0, bar, a.voice, tick, dur, Object.assign(TC.newDrumNote(art, {}), extra || {}));
    };
    for (let bar = 0; bar < 2; bar++) {
      for (let t = 0; t < 3840; t += 480) put(bar, t, 480, bar === 0 && t === 0 ? 49 : 42, t % 960 === 0 ? { accent: 1 } : null);
      put(bar, 960, 480, 38);
      put(bar, 2880, 480, 38);
      put(bar, 0, 480, 36);
      put(bar, 1920, 480, 36);
      put(bar, 2400, 480, 36);
    }
    put(1, 3360, 480, 46);
    put(1, 2160, 240, 38, { ghost: true });
    // bar 3: sixteenths and triplets
    for (let t = 0; t < 1920; t += 240) put(2, t, 240, 42);
    put(2, 960, 240, 38);
    put(2, 0, 960, 36);
    [1920, 2240, 2560].forEach((t) => put(2, t, 320, 38));
    [2880, 3200, 3520].forEach((t, k) => put(2, t, 320, [48, 47, 43][k]));
    put(2, 1920, 960, 44);
    put(2, 2880, 960, 44);
    // bar 4: crash and kick on 1
    put(3, 0, 3840, 49, { accent: 1 });
    put(3, 0, 3840, 36);
    return doc;
  };
})(window.TC);
