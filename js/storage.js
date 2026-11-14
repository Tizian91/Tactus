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
    safeSet(AUTOSAVE_KEY, JSON.stringify({ doc: S.doc, file: { name: S.file.name, saved: S.file.saved, dropbox: S.file.dropbox || null }, dirty: S.dirty }));
    TC.saveSettings();
  };
  /** The score of the last session, or null. */
  ST.restore = function () {
    try {
      const data = JSON.parse(safeGet(AUTOSAVE_KEY) || 'null');
      if (!data || !data.doc) return null;
      const db = data.file && data.file.dropbox;
      return {
        doc: TC.normalizeDoc(data.doc), name: data.file && String(data.file.name || '').replace(/\.notewriter\.json$/, '.tactus.json'), dirty: !!data.dirty,
        dropbox: db && typeof db.path === 'string' ? { path: db.path, rev: db.rev || null } : null,
      };
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

  /** Show a score. handle: local file (File System Access API); dropbox: { path, rev } of a Dropbox file. */
  function setDoc(doc, name, handle, dropbox) {
    S.doc = doc;
    TC.score.revoice(doc); // into the voices of the stem setting (TC.drums.setStems)
    S.selection.clear();
    S.selBar = null;
    S.hover = null;
    S.file = { handle: handle || null, name: name || 'Untitled.tactus.json', saved: !!(handle || dropbox), dropbox: dropbox || null };
    S.dirty = false;
    TC.history.reset();
    S.rev++;
    ST.autosave();
    TC.refresh();
  }

  ST.setDoc = setDoc;

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
    // a song from Dropbox goes back there ("Save as…" saves a copy on this device)
    if (!saveAs && S.file.dropbox && TC.dropbox && TC.dropbox.allowed) return TC.dropbox.saveSong(false);
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
    // bar 3: sixteenths and triplets with sticking, a flam on 2
    for (let t = 0; t < 1920; t += 240) put(2, t, 240, 42);
    put(2, 960, 240, 38, { orn: 'flam' });
    put(2, 0, 960, 36);
    [1920, 2240, 2560].forEach((t, k) => put(2, t, 320, 38, { stick: 'RLR'[k] }));
    [2880, 3200, 3520].forEach((t, k) => put(2, t, 320, [48, 47, 43][k], { stick: 'LRL'[k] }));
    put(2, 1920, 960, 44);
    put(2, 2880, 960, 44);
    // bar 4: the groove of bar 2 again, bar 5: "%" (repeats bar 4)
    doc.bars.splice(3, 0, TC.newBarHeader(), TC.newBarHeader());
    doc.tracks[0].bars.splice(3, 0, TC.newTrackBar(), TC.newTrackBar());
    TC.score.pasteBar(doc, 3, TC.score.copyBar(doc, 1));
    doc.tracks[0].bars[4].simile = true;
    // bar 6: snare roll, a drag, crash and kick on 4
    put(5, 0, 1920, 38, { trem: 3 });
    put(5, 1920, 960, 38, { accent: 1, orn: 'drag' });
    put(5, 2880, 960, 49, { accent: 1 });
    put(5, 2880, 960, 36);
    return doc;
  };

  /** Building blocks of the other examples: a score of n bars and grooves to fill a bar. */
  function builder(n, title, tempo) {
    const doc = TC.emptyScore(n);
    Object.assign(doc.meta, { title, artist: 'Tactus – Beispiel', tempo });
    const tr0 = doc.tracks[0];
    const put = (bar, tick, dur, art, extra) => {
      const a = TC.drums.byId(art);
      TC.score.place(doc, tr0, bar, a.voice, tick, dur, Object.assign(TC.newDrumNote(art, {}), extra || {}));
    };
    const B = {
      doc, put,
      // rock: hi-hat eighths, snare on 2 and 4, kick on 1, 3, 3+ (crash on 1 if wanted)
      rock(bar, crash) {
        for (let t = 0; t < 3840; t += 480) put(bar, t, 480, crash && t === 0 ? 49 : 42);
        [960, 2880].forEach((t) => put(bar, t, 480, 38));
        [0, 1920, 2400].forEach((t) => put(bar, t, 480, 36));
      },
      // chorus: ride eighths (bell on the beats), snare 2 and 4 with a ghost note, kick 1, 2+, 3
      ride(bar, crash) {
        for (let t = 0; t < 3840; t += 480) put(bar, t, 480, crash && t === 0 ? 49 : t % 960 ? 51 : 53);
        [960, 2880].forEach((t) => put(bar, t, 480, 38, { accent: 1 }));
        put(bar, 2160, 240, 38, { ghost: true });
        [0, 1440, 1920].forEach((t) => put(bar, t, 480, 36));
      },
      // fill: groove on 1 and 2, then sixteenths over snare and toms
      fill(bar, toms) {
        [0, 480].forEach((t) => put(bar, t, 480, 42));
        put(bar, 0, 480, 36);
        put(bar, 960, 480, 38);
        put(bar, 960, 480, 36);
        const arts = toms ? [38, 38, 50, 50, 48, 48, 47, 47] : [38, 38, 38, 38, 38, 38, 38, 38];
        arts.forEach((a, k) => put(bar, 1920 + k * 240, 240, a, { stick: 'RL'[k % 2] }));
      },
      // triplet fill over the toms with a flam to start
      triplets(bar) {
        put(bar, 0, 960, 42);
        put(bar, 0, 960, 36);
        put(bar, 960, 960, 38);
        [38, 50, 50, 48, 48, 47].forEach((a, k) => put(bar, 1920 + k * 320, 320, a, k === 0 ? { orn: 'flam' } : null));
      },
      // ending: crash and kick on 1, ringing
      end(bar) {
        put(bar, 0, 3840, 49, { accent: 1 });
        put(bar, 0, 3840, 36);
      },
    };
    return B;
  }

  /** Example: repeats with endings (1st / 2nd time bars), %-bars, a repeat played 3×, a multi-bar rest. */
  ST.repeatsDoc = function () {
    const B = builder(14, 'Beispiel: Wiederholungen & Häuser', 112), b = B.doc.bars;
    B.rock(0, true);
    b[0].marker = 'Intro';
    // verse: |: groove % % [1. fill :| [2. other fill
    B.rock(1);
    b[1].marker = 'Strophe';
    b[1].repeatStart = true;
    B.doc.tracks[0].bars[2].simile = B.doc.tracks[0].bars[3].simile = true;
    B.fill(4, false);
    b[4].volta = [1];
    b[4].repeatEnd = 2;
    B.fill(5, true);
    b[5].volta = [2];
    // chorus: |: ride groove % % fill :| three times
    B.ride(6, true);
    b[6].marker = 'Refrain';
    b[6].repeatStart = true;
    B.doc.tracks[0].bars[7].simile = B.doc.tracks[0].bars[8].simile = true;
    B.triplets(9);
    b[9].repeatEnd = 3;
    // break: two bars rest (a multi-bar rest on the sheet), then the ending
    b[10].marker = 'Break';
    B.rock(12);
    b[12].marker = 'Schluss';
    B.end(13);
    return B.doc;
  };

  /** Example: D.S. al Coda - segno, To Coda, jump back, coda. */
  ST.jumpsDoc = function () {
    const B = builder(10, 'Beispiel: Sprünge (D.S. al Coda)', 104), b = B.doc.bars;
    B.rock(0, true);
    b[0].marker = 'Intro';
    B.doc.tracks[0].bars[1].simile = true;
    // verse from the segno; "To Coda" after it
    B.rock(2);
    b[2].marker = 'Strophe';
    b[2].mark = 'segno';
    B.doc.tracks[0].bars[3].simile = true;
    B.fill(4, false);
    b[4].end = 'toCoda';
    // chorus, then back to the segno
    B.ride(5, true);
    b[5].marker = 'Refrain';
    B.doc.tracks[0].bars[6].simile = true;
    B.fill(7, true);
    b[7].jump = 'dsCoda';
    // coda
    B.ride(8, true);
    b[8].mark = 'coda';
    b[8].marker = 'Outro';
    B.end(9);
    return B.doc;
  };

  /** The examples (File → Examples, and links of the manual: index.html?beispiel=…). */
  ST.EXAMPLES = [
    { id: 'groove', label: 'Example groove', make: () => ST.demoDoc(), file: 'Example.tactus.json' },
    { id: 'wiederholungen', label: 'Repeats & endings', make: () => ST.repeatsDoc(), file: 'Wiederholungen.tactus.json' },
    { id: 'spruenge', label: 'Jumps (D.S. al Coda)', make: () => ST.jumpsDoc(), file: 'Spruenge.tactus.json' },
  ];
  ST.loadExample = function (id) {
    const ex = ST.EXAMPLES.find((e) => e.id === id);
    if (!ex) return false;
    if (S.dirty && !confirm(tr('Discard the changes of the open score?'))) return false;
    setDoc(ex.make(), ex.file);
    TC.actions.home();
    return true;
  };
})(window.TC);
