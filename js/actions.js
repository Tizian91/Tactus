'use strict';
/*
 * Named commands. Toolbar buttons, panel buttons (data-action="name" data-value="…"),
 * menus and keyboard shortcuts all call into TC.actions.
 */
(function (TC) {
  const S = TC.state;
  const A = (TC.actions = {});
  const tr = (s, v) => TC.tr(s, v);
  const selectedIds = () => [...S.selection];

  // ---- Input (what the next click writes) ---------------------------------------------

  /** Note value 1 … 64. With notes selected: they get the new length. */
  A.setValue = function (v) {
    v = Number(v);
    if (!TC.VALUES.includes(v)) return;
    S.input.value = v;
    if (S.input.value <= 1) S.input.triplet = false;
    applyDurationToSelection();
    TC.refresh();
  };
  A.toggleDotted = function () {
    S.input.dotted = !S.input.dotted;
    if (S.input.dotted) S.input.triplet = false;
    applyDurationToSelection();
    TC.refresh();
  };
  A.toggleTriplet = function () {
    S.input.triplet = !S.input.triplet;
    if (S.input.triplet) S.input.dotted = false;
    applyDurationToSelection();
    TC.refresh();
  };
  function applyDurationToSelection() {
    if (!S.selection.size) return;
    TC.score.setDuration(S.doc, selectedIds(), TC.inputTicks(S.input));
    TC.commit();
  }

  /*
   * Note properties: with notes selected they change the selected notes only,
   * otherwise they are the settings for the next notes.
   */

  /** Instrument (selected notes change to it; otherwise the next notes get it). */
  A.setArt = function (id) {
    id = Number(id);
    const art = TC.drums.byId(id);
    if (!art) return;
    if (S.selection.size) {
      forSelected((n) => { n.art = id; });
      TC.commit();
    } else {
      S.input.art = id;
      TC.saveSettings();
      TC.refresh();
    }
    TC.ui.hint(TC.drums.label(art));
  };

  A.setAccent = function (a) {
    a = Number(a);
    if (S.selection.size) {
      forSelected((n) => { n.accent = a; });
      TC.commit();
    } else {
      S.input.accent = a;
      TC.refresh();
    }
  };
  A.toggleAccent = function () {
    if (S.selection.size) {
      const first = TC.score.findNote(S.doc, selectedIds()[0]);
      A.setAccent(first && first.note.accent === 1 ? 0 : 1);
    } else A.setAccent(S.input.accent === 1 ? 0 : 1);
  };
  A.toggleGhost = function () {
    if (S.selection.size) {
      const first = TC.score.findNote(S.doc, selectedIds()[0]);
      const on = !(first && first.note.ghost);
      forSelected((n) => { n.ghost = on; });
      TC.commit();
    } else {
      S.input.ghost = !S.input.ghost;
      TC.refresh();
    }
  };
  A.setHead = function (h) {
    if (h !== 'auto' && !TC.HEADS[h]) return;
    if (S.selection.size) {
      forSelected((n) => { n.head = h; });
      TC.commit();
    } else {
      S.input.head = h;
      TC.refresh();
    }
  };

  function forSelected(fn) {
    for (const id of S.selection) {
      const hit = TC.score.findNote(S.doc, id);
      if (hit) fn(hit.note, hit);
    }
  }

  /** Move the selected notes one instrument up / down (to the next line of the kit). */
  A.moveLine = function (dir) {
    if (!S.selection.size) return;
    const lines = TC.drums.lines(TC.drums.kit());
    forSelected((n) => {
      const art = TC.drums.byId(n.art);
      const next = dir < 0 ? lines.filter(([l]) => l < art.line).pop() : lines.find(([l]) => l > art.line);
      if (next) n.art = (next[1].find((a) => a.def) || next[1][0]).id;
    });
    TC.commit();
  };

  /** Instrument lock: a click anywhere in the column writes the selected instrument. */
  A.toggleLock = function () {
    S.input.lock = !S.input.lock;
    TC.ui.hint(tr(S.input.lock ? 'Instrument lock on: the height no longer matters' : 'Instrument lock off'));
    TC.refresh();
    TC.interaction.refreshHover();
  };

  // ---- Drum kit and drum map ------------------------------------------------------------

  A.setKit = function (kit) {
    if (!TC.KITS[kit]) return;
    if (kit === 'custom' && !S.settings.kitCustom) S.settings.kitCustom = [...TC.drums.kit()];
    S.settings.kit = kit;
    TC.saveSettings();
    TC.refresh();
  };
  /** Instrument in / out of the kit (the kit becomes a custom one). */
  A.toggleKitArt = function (id) {
    id = Number(id);
    const ids = TC.drums.kit();
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    S.settings.kitCustom = [...ids];
    S.settings.kit = 'custom';
    TC.saveSettings();
    TC.refresh();
  };
  A.toggleMapUsed = function () {
    S.settings.mapUsedOnly = !S.settings.mapUsedOnly;
    TC.saveSettings();
    TC.refresh();
  };

  A.deleteSelection = function () {
    if (!S.selection.size) return;
    const n = TC.score.removeNotes(S.doc, selectedIds());
    S.selection.clear();
    TC.commit();
    TC.ui.hint(tr('{n} note(s) deleted', { n }));
  };

  A.selectNone = function () {
    S.selection.clear();
    S.selBar = null;
    TC.refresh();
  };

  // ---- Bars -----------------------------------------------------------------------------

  const curBar = () => (S.selBar !== null ? S.selBar : S.doc.bars.length - 1);

  A.addBar = function () {
    TC.score.insertBars(S.doc, S.doc.bars.length, 1);
    S.selBar = S.doc.bars.length - 1;
    TC.commit();
  };
  A.insertBarBefore = function (i = curBar()) {
    TC.score.insertBars(S.doc, i, 1, S.doc.bars[i].ts);
    S.selBar = i;
    TC.commit();
  };
  A.insertBarAfter = function (i = curBar()) {
    TC.score.insertBars(S.doc, i + 1, 1, S.doc.bars[i].ts);
    S.selBar = i + 1;
    TC.commit();
  };
  A.deleteBar = function (i = curBar()) {
    if (!TC.score.deleteBars(S.doc, i, 1)) return TC.ui.hint(tr('The last bar cannot be deleted'));
    S.selBar = Math.min(i, S.doc.bars.length - 1);
    TC.pruneSelection();
    TC.commit();
  };
  A.clearBar = function (i = curBar()) {
    TC.score.clearBar(S.doc, i);
    TC.pruneSelection();
    TC.commit();
  };
  /** Time signature "n/d" from bar i on (onlyThis: this bar alone). */
  A.setTimeSig = function (value, i = curBar(), onlyThis = false) {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(value));
    if (!m || !TC.score.setTimeSig(S.doc, i, [+m[1], +m[2]], onlyThis)) return TC.ui.hint(tr('Invalid time signature'));
    TC.pruneSelection();
    TC.commit();
  };
  A.customTimeSig = function (i = curBar()) {
    const v = prompt(tr('Time signature (e.g. 7/8, 11/16)'), S.doc.bars[i].ts.join('/'));
    if (v) A.setTimeSig(v, i);
  };

  // ---- View -------------------------------------------------------------------------------

  TC.zoomAt = function (zoom, sx, sy) {
    const v = S.doc.view;
    const z = TC.clamp(zoom, 0.25, 4);
    v.x = sx - (sx - v.x) * (z / v.zoom);
    v.y = sy - (sy - v.y) * (z / v.zoom);
    v.zoom = z;
    TC.render.applyView();
    TC.ui.updateZoom();
  };
  function zoomCenter(factor) {
    const r = document.getElementById('viewport').getBoundingClientRect();
    TC.zoomAt(S.doc.view.zoom * factor, r.width / 2, r.height / 2);
  }
  A.zoomIn = () => zoomCenter(1.25);
  A.zoomOut = () => zoomCenter(1 / 1.25);
  /** Back to the default size (160 %). */
  A.zoomReset = () => zoomCenter(TC.DEFAULT_ZOOM / S.doc.view.zoom);
  /** Back to the start of the piece. */
  A.home = function () {
    const v = S.doc.view;
    v.x = (S.settings.showDrumMap ? 150 : 30) * v.zoom;
    v.y = 140 * v.zoom;
    TC.render.applyView();
  };

  A.toggleDrumMap = function () {
    S.settings.showDrumMap = !S.settings.showDrumMap;
    TC.saveSettings();
    if (S.settings.showDrumMap && S.doc.view.x < 150 * S.doc.view.zoom) A.home();
    TC.refresh();
  };
  /** Show / hide a panel: side 'right' = score settings, otherwise the note panel. */
  A.togglePanel = function (side) {
    const k = side === 'right' ? 'showPanelRight' : 'showPanel';
    S.settings[k] = !S.settings[k];
    TC.saveSettings();
    TC.panel.applyLayout();
  };
  A.togglePanelRight = () => A.togglePanel('right');
  /** Left-handed: the note panel goes to the right, the settings to the left. */
  A.toggleLeftHanded = function () {
    S.settings.leftHanded = !S.settings.leftHanded;
    TC.saveSettings();
    TC.panel.applyLayout();
    TC.refresh();
  };
  A.toggleTheme = function () {
    const order = ['auto', 'light', 'dark'];
    S.settings.theme = order[(order.indexOf(S.settings.theme) + 1) % 3];
    TC.saveSettings();
    TC.applyTheme();
  };
  A.toggleLang = function () {
    TC.setLang(S.settings.lang === 'de' ? 'en' : 'de');
  };
  A.layout = function (mode) {
    if (mode === 'page') return TC.ui.hint(tr('The page view follows in phase 2 (together with the PDF export)'));
    S.settings.layout = 'endless';
  };

  // ---- History, files -----------------------------------------------------------------------

  A.undo = function () {
    if (TC.history.undo()) {
      S.dirty = true;
      TC.storage.scheduleAutosave();
      TC.refresh();
    }
  };
  A.redo = function () {
    if (TC.history.redo()) {
      S.dirty = true;
      TC.storage.scheduleAutosave();
      TC.refresh();
    }
  };
  A.newScore = () => TC.storage.newScore();
  A.open = () => TC.storage.open();
  A.save = () => TC.storage.save(false);
  A.saveAs = () => TC.storage.save(true);
  A.demo = () => TC.storage.loadDemo();

  A.fileMenu = function () {
    const r = document.getElementById('file-btn').getBoundingClientRect();
    TC.menu.open([
      { label: 'New score', action: A.newScore },
      { label: 'Open…', action: A.open, shortcut: 'Ctrl+O' },
      '-',
      { label: 'Save', action: A.save, shortcut: 'Ctrl+S' },
      { label: 'Save as…', action: A.saveAs, shortcut: 'Ctrl+Shift+S' },
      '-',
      { label: 'Load example groove', action: A.demo },
      { label: 'PDF / print (phase 2)', disabled: true },
    ], r.left, r.bottom + 2);
  };
  A.zoomMenu = function () {
    const r = document.getElementById('zoom-label').getBoundingClientRect();
    TC.menu.open([
      { label: 'Zoom in', action: A.zoomIn, shortcut: 'Ctrl++' },
      { label: 'Zoom out', action: A.zoomOut, shortcut: 'Ctrl+-' },
      { label: 'Default size (160 %)', action: A.zoomReset, shortcut: 'Ctrl+0' },
      '-',
      { label: 'To the start', action: A.home, shortcut: 'Home' },
    ], r.left, r.bottom + 2);
  };

  /** Right-click on a bar. */
  A.barMenu = function (i, x, y) {
    const sigs = TC.TIME_SIGS.map((ts) => ({
      label: ts.join('/'), checked: S.doc.bars[i].ts.join('/') === ts.join('/'), action: () => A.setTimeSig(ts.join('/'), i),
    }));
    TC.menu.open([
      { label: 'Time signature from here', submenu: sigs.concat(['-', { label: 'Other…', action: () => A.customTimeSig(i) }]) },
      '-',
      { label: 'Insert bar before', action: () => A.insertBarBefore(i) },
      { label: 'Insert bar after', action: () => A.insertBarAfter(i) },
      { label: 'Clear bar', action: () => A.clearBar(i) },
      { label: 'Delete bar', action: () => A.deleteBar(i), disabled: S.doc.bars.length < 2 },
    ], x, y);
  };
})(window.TC);
