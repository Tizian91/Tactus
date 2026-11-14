// Screenshots for the manual (hilfe.html): tools/build_help_images.sh opens the app once per picture
// with ?s=<name> and lets Edge take the screenshot. Nothing is stored (autosave and settings off).
TC.storage.autosave = () => {};
TC.storage.scheduleAutosave = () => {};
TC.saveSettings = () => {};
TC.kits.save = () => true;
TC.kits.load = () => {}; // keep the profiles made here (the dialog loads them again when it opens)
setTimeout(() => {
  const S = TC.state, A = TC.actions;
  const vp = document.getElementById('viewport');
  window.confirm = () => true;
  S.settings.theme = 'light';
  TC.applyTheme();
  A.demo();
  A.setNotation('tactus');
  TC.selectBar(null);
  TC.refresh();
  const screenOf = (bar, tick, line) => {
    const L = TC.render.layout, b = L.bars[bar], s = L.systems[b.sys], v = S.doc.view, r = vp.getBoundingClientRect();
    return [r.left + v.x + (TC.render.tickX(b, tick) + s.tx) * v.zoom, r.top + v.y + (TC.render.stepY(line) + s.ty) * v.zoom];
  };
  const finger = (type, x, y) => vp.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 11, pointerType: 'touch', isPrimary: true }));
  const mouse = (type, x, y, o = {}) => vp.dispatchEvent(new PointerEvent(type, Object.assign({ clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, pointerId: 1, pointerType: 'mouse' }, o)));
  const closePanels = () => document.querySelectorAll('.panel-close-btn').forEach((b) => b.click());
  const view = (zoom, x, y) => { Object.assign(S.doc.view, { zoom, x, y }); TC.render.applyView(); };
  const example = (id) => {
    S.dirty = false;
    TC.storage.loadExample(id);
    TC.selectBar(null);
    if (!TC.render.isPage()) A.toggleLayout();
    closePanels();
    setTimeout(() => view(0.8, 30, -40), 100);
  };
  const kit = (id) => { const q = TC.kits.fromTemplate(id); TC.kits.list.push(q); return q; };

  const SHOTS = {
    // the app with both panels: notes (left), bar / playback / score (right)
    ueberblick() {
      TC.selectBar(2);
      TC.refresh();
    },
    // a finger held on the hi-hat and released: instruments of the line, strengths
    notenmenue() {
      const [x, y] = screenOf(0, 480, -1);
      finger('pointerdown', x, y);
      setTimeout(() => finger('pointerup', x, y), 700);
    },
    // held and moved up: the strength steps next to the note
    anschlag() {
      const [x, y] = screenOf(0, 960, 3);
      mouse('pointerdown', x, y, { ctrlKey: true });
      mouse('pointermove', x + 1, y - 22, { ctrlKey: true });
      mouse('pointermove', x + 1, y - 44, { ctrlKey: true });
    },
    // the band-room sheet: page view, repeat with endings, %-bars combined, a jump
    seite() {
      while (S.doc.bars.length < 14) A.addBar();
      A.copyBar(0);
      [9, 10, 12].forEach((k) => A.pasteBar(k));
      A.copyBar(3);
      A.pasteBar(11);
      A.toggleRepeatStart(0); A.setVolta('1', 1); A.setRepeatEnd(2, 1); A.setVolta('2', 2);
      [5, 6, 7, 8].forEach((k) => A.toggleSimile(k));
      A.setMarker('Refrain', 9);
      A.setMark('segno', 3);
      A.setEnd('toCoda', 9);
      A.setJump('dsCoda', 11);
      A.setMark('coda', 12);
      TC.selectBar(null);
      if (!TC.render.isPage()) A.toggleLayout();
      closePanels();
      setTimeout(() => view(0.82, 20, -40), 100);
    },
    // kit profile from the template of a free drum VST
    kitprofil() {
      kit('mt-power-drum-kit-2');
      A.openKits();
    },
    // the score's profile lacks the china and the cowbell: what plays instead
    fehlt() {
      const tr = S.doc.tracks[0];
      TC.score.place(S.doc, tr, 2, 0, 0, 480, TC.newDrumNote(52, {}));
      TC.score.place(S.doc, tr, 2, 0, 960, 480, TC.newDrumNote(56, {}));
      TC.score.place(S.doc, tr, 3, 0, 0, 480, TC.newDrumNote(56, {}));
      TC.score.place(S.doc, tr, 3, 0, 960, 480, TC.newDrumNote(248, {}));
      TC.score.place(S.doc, tr, 3, 1, 1440, 480, TC.newDrumNote(244, {}));
      const q = kit('mt-power-drum-kit-2');
      A.setKitProfile(q.id);
    },
    // the two examples in the page view
    bspwiederholungen() { example('wiederholungen'); },
    bspspruenge() { example('spruenge'); },
    // MIDI import: track, where it comes from, grid, tempo, target
    import() {
      S.settings.importTarget = 'into';
      TC.selectBar(4);
      TC.midiIn.open(TC.midi.build(S.doc, null).bytes, 'Groove aus Cubase.mid');
    },
  };
  const name = new URLSearchParams(location.search).get('s');
  if (SHOTS[name]) SHOTS[name]();
}, 400);
