// Measuring tool (tools/perf/run.js): builds a test score in the real app and offers the scenarios that run.js drives
// from outside (mouse moves, dragging the view, the playback cursor, a full drawing). Nothing is stored.
// Options come in the address: ?bars=16&tracks=4&grid=16&zoom=1.5&sel=1 (sel: a bar selected).
TC.storage.autosave = () => {};
TC.storage.scheduleAutosave = () => {};
TC.saveSettings = () => {};
setTimeout(() => {
  const S = TC.state, SC = TC.score, q = new URLSearchParams(location.search);
  const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
  const bars = num('bars', 16), tracks = num('tracks', 4), zoom = num('zoom', 1.5), grid = q.get('grid') || '16', sel = num('sel', 1);
  window.confirm = () => true;
  TC.actions.newScore();
  while (S.doc.bars.length < bars) TC.actions.addBar();
  // drums: sixteenth hi-hats, kick and snare on the beats
  const dr = S.doc.tracks[0];
  for (let i = 0; i < bars; i++) for (let t = 0; t < 3840; t += 240) {
    SC.place(S.doc, dr, i, 0, t, 240, TC.newDrumNote(42, {}));
    if (t % 960 === 0) SC.place(S.doc, dr, i, 1, t, 960, TC.newDrumNote(t % 1920 ? 38 : 36, {}));
  }
  // melody tracks: eighths in a line (1), quarter chords (2), a bass in halves (3)
  const kinds = [
    { name: 'Melodie', fill: (tk, i) => { for (let t = 0; t < 3840; t += 480) SC.place(S.doc, tk, i, 0, t, 480, TC.newPitchNote(67 + ((i + t / 480) % 5), null, {})); } },
    { name: 'Gitarre', fill: (tk, i) => { for (let t = 0; t < 3840; t += 960) [60, 64, 67].forEach((p) => SC.place(S.doc, tk, i, 0, t, 960, TC.newPitchNote(p, null, {}))); } },
    { name: 'Bass', fill: (tk, i) => { for (let t = 0; t < 3840; t += 1920) SC.place(S.doc, tk, i, 0, t, 1920, TC.newPitchNote(36 + (i % 4) * 2, null, {})); } },
  ];
  for (let k = 0; k < tracks - 1; k++) {
    const kind = kinds[k % kinds.length], tk = SC.addTrack(S.doc, kind.name, null, 'pitched');
    for (let i = 0; i < bars; i++) kind.fill(tk, i);
    // dynamics: a level and a hairpin now and then
    for (let i = 0; i < bars; i += 4) {
      SC.setDyn(S.doc, tk, i, 0, { v: 'p' });
      SC.setDyn(S.doc, tk, i, 0, { w: 'cresc', len: 3840, to: 'f' });
    }
  }
  TC.commit();
  S.trackId = dr.id;
  S.input.grid = grid;
  S.settings.showDrumMap = true;
  TC.selectBar(sel ? 1 : null);
  S.doc.view.zoom = zoom;
  TC.refresh();
  // the view: bar 2 near the left edge, the first staff in the upper part
  const L = TC.render.layout, b = L.bars[1];
  S.doc.view.x = 120 - b.x * zoom;
  S.doc.view.y = 140;
  TC.render.applyView();

  // ---- what run.js uses -------------------------------------------------------------------------------------------
  const vp = document.getElementById('viewport');
  /** Screen points over bar 2 of the drum staff: along the lines and spaces, moving sideways (mouse moves). */
  window.__hoverPoints = (n) => {
    const r = vp.getBoundingClientRect(), v = S.doc.view, lay = TC.render.layout, bb = lay.bars[1], out = [];
    for (let k = 0; k < n; k++) {
      const tick = (k * 120) % 3840, line = k % 9;
      out.push([Math.round(r.left + v.x + TC.render.tickX(bb, tick) * v.zoom), Math.round(r.top + v.y + TC.render.stepY(line) * v.zoom)]);
    }
    return out;
  };
  /** A point beside the lines (over the bar, under the staves): where dragging the view starts. */
  window.__panStart = () => {
    const r = vp.getBoundingClientRect();
    return [Math.round(r.left + r.width / 2), Math.round(r.bottom - 40)];
  };
  /** The playback cursor over bars 2-4 with a loop frame, one step per frame: resolves after n frames. */
  window.__cursorRun = (n) => new Promise((res) => {
    let k = 0;
    const step = () => {
      TC.render.drawCursor(1 + (Math.floor(k / 32) % 3), (k % 32) * 120, [1, 3]);
      if (++k < n) requestAnimationFrame(step);
      else { TC.render.drawCursor(null); res(); }
    };
    requestAnimationFrame(step);
  });
  /** A full drawing of the score, n times: the mean in ms (JavaScript and building the SVG; painting comes after). */
  window.__drawMs = (n) => {
    const t0 = performance.now();
    for (let k = 0; k < n; k++) TC.render.draw();
    return (performance.now() - t0) / n;
  };
  window.__info = () => ({ bars: S.doc.bars.length, tracks: S.doc.tracks.length, grid, zoom, selected: S.selBar, elements: document.querySelectorAll('#world .static *').length });
  window.__ready = true;
}, 500);
