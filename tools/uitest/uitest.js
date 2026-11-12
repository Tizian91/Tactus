// UI test: simulated clicks and keys on the real app; the result appears in a box at the bottom right.
// Open tools/uitest/index.html in Edge / Chrome (see tools/tests/README.md).
// Nothing is stored: autosave and settings are switched off here, so a score kept in the browser stays as it is.
TC.storage.autosave = () => {};
TC.storage.scheduleAutosave = () => {};
TC.saveSettings = () => {};
setTimeout(() => {
  const S = TC.state, out = [];
  const vp = document.getElementById('viewport');
  const ok = (label, cond) => out.push((cond ? 'ok   ' : 'FAIL ') + label);
  // start from an empty score
  S.dirty = false;
  window.confirm = () => true;
  TC.actions.newScore();
  const click = (bar, tick, line, opts = {}) => {
    const L = TC.render.layout, b = L.bars[bar], v = S.doc.view, r = vp.getBoundingClientRect();
    const wx = TC.render.tickX(b, tick) + (opts.dx || 0), wy = TC.render.stepY(line) + (opts.dy || 0);
    const cx = r.left + v.x + wx * v.zoom, cy = r.top + v.y + wy * v.zoom;
    const init = { clientX: cx, clientY: cy, button: 0, buttons: 1, bubbles: true, pointerId: 1, shiftKey: !!opts.shift };
    vp.dispatchEvent(new PointerEvent('pointermove', init));
    vp.dispatchEvent(new PointerEvent('pointerdown', init));
    vp.dispatchEvent(new PointerEvent('pointerup', init));
  };
  const voice = (bar, v) => S.doc.tracks[0].bars[bar].voices[v].map((e) => e.tick + ':' + e.dur + ':' + e.notes.map((n) => n.art).join('+'));
  TC.actions.setValue(8);
  TC.actions.setArt(42);
  [0, 480, 960, 1440].forEach((t) => click(0, t, -1, { dx: 6 }));   // a bit off the grid: snaps
  ok('4 hi-hat eighths ' + voice(0, 0), voice(0, 0).join() === '0:480:42,480:480:42,960:480:42,1440:480:42');
  click(0, 960, 3);                                                 // snare line while hi-hat selected
  ok('snare joins beat 2 ' + voice(0, 0)[2], voice(0, 0)[2] === '960:480:42+38');
  click(0, 0, 7);                                                   // kick space -> voice 2
  ok('kick in voice 2 ' + voice(0, 1), voice(0, 1).join() === '0:480:36');
  TC.actions.setValue(16);
  click(0, 1680, -1, { dx: -3 });                                   // 16th grid now
  ok('16th at 1680 ' + voice(0, 0).slice(-2), voice(0, 0).slice(-2).join() === '1440:240:42,1680:240:42');
  click(0, 1680, -1);                                               // click the note: select
  ok('selected ' + S.selection.size, S.selection.size === 1);
  TC.actions.setAccent(1);
  ok('accent on selected', TC.score.findNote(S.doc, [...S.selection][0]).note.accent === 1);
  ok('next notes keep no accent', S.input.accent === 0);
  click(0, 1680, -1);                                               // click again: delete
  ok('deleted ' + voice(0, 0).length, voice(0, 0).length === 4);
  TC.actions.undo();
  ok('undo brings it back ' + voice(0, 0).length, voice(0, 0).length === 5);
  TC.actions.redo();
  ok('redo deletes again ' + voice(0, 0).length, voice(0, 0).length === 4);
  TC.actions.setValue(8); TC.actions.toggleTriplet();
  [1920, 2240, 2560].forEach((t) => click(0, t, 3));
  ok('triplets ' + voice(0, 0).slice(-3), voice(0, 0).slice(-3).join() === '1920:320:38,2240:320:38,2560:320:38');
  TC.actions.toggleTriplet();
  // bar menu: 3/4 on bar 2
  TC.actions.setTimeSig('3/4', 1);
  ok('3/4 from bar 2 ' + S.doc.bars.map((b) => b.ts.join('/')).join(' '), S.doc.bars[1].ts.join('/') === '3/4' && S.doc.bars[7].ts.join('/') === '3/4');
  click(1, 0, 3);
  ok('note in 3/4 bar', voice(1, 0).length === 1);
  const n0 = S.doc.bars.length;
  const a = TC.render.layout.add, v = S.doc.view, r = vp.getBoundingClientRect();
  vp.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + v.x + (a.x + 10) * v.zoom, clientY: r.top + v.y + (a.y + 10) * v.zoom, button: 0, bubbles: true }));
  ok('+ adds a bar ' + S.doc.bars.length, S.doc.bars.length === n0 + 1);
  // keyboard
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }));
  ok('key 5 = sixteenth', S.input.value === 16);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
  ok('key k = kick', S.input.art === 36);
  // instrument lock, magnet, Shift, drum map, kits, left-handed mode
  const clickWorld = (wx, wy, opts = {}) => {
    const v = S.doc.view, r = vp.getBoundingClientRect();
    const init = { clientX: r.left + v.x + wx * v.zoom, clientY: r.top + v.y + wy * v.zoom, button: 0, buttons: 1, bubbles: true, pointerId: 1, shiftKey: !!opts.shift };
    vp.dispatchEvent(new PointerEvent('pointermove', init));
    vp.dispatchEvent(new PointerEvent('pointerdown', init));
    vp.dispatchEvent(new PointerEvent('pointerup', init));
  };
  TC.actions.setValue(8); TC.actions.setArt(42); TC.actions.toggleLock();
  click(3, 0, 6);
  ok('lock: hi-hat written at floor tom height ' + voice(3, 0), voice(3, 0).join() === '0:480:42');
  TC.actions.toggleLock();
  click(3, 480, 4.3);
  ok('magnet: between snare and tom 4 -> tom 4 ' + voice(3, 0), voice(3, 0)[1] === '480:480:45');
  click(3, 960, 7, { shift: true });
  ok('Shift held = lock (kick height, hi-hat written) ' + voice(3, 0), voice(3, 0)[2] === '960:480:42');
  ok('drum map: 9 rows with the standard kit', TC.render.layout.map.length === 9);
  const row = TC.render.layout.map.find((m) => m.line === 3);
  clickWorld(row.x1 + 2, row.y);
  ok('drum map click chooses the snare', S.input.art === 38);
  clickWorld(row.x1 + 2, row.y);
  ok('again: next instrument on that line (side stick)', S.input.art === 37);
  TC.actions.setKit('all');
  ok('kit all: ' + document.querySelectorAll('#panel-notes .art').length + ' buttons', document.querySelectorAll('#panel-notes .art').length === TC.DRUM_ARTS.length);
  TC.actions.setKit('standard');
  ok('kit standard: ' + document.querySelectorAll('#panel-notes .art').length + ' buttons', document.querySelectorAll('#panel-notes .art').length === 17);
  TC.actions.toggleLeftHanded();
  const main = document.getElementById('main');
  ok('left-handed: note panel on the right', main.style.gridTemplateAreas === '"sp sr vp nr np"');
  TC.actions.toggleLeftHanded();
  ok('right-handed again', main.style.gridTemplateAreas === '"np nr vp sr sp"');
  // fingers: tap writes, drag scrolls, two fingers zoom
  const finger = (type, id, x, y) => vp.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: id === 11 }));
  const screenOf = (bar, tick, line) => {
    const b = TC.render.layout.bars[bar], v = S.doc.view, r = vp.getBoundingClientRect();
    return [r.left + v.x + TC.render.tickX(b, tick) * v.zoom, r.top + v.y + TC.render.stepY(line) * v.zoom];
  };
  TC.actions.setValue(8); TC.actions.setArt(38);
  let [fx, fy] = screenOf(4, 0, 3);
  finger('pointerdown', 11, fx, fy); finger('pointerup', 11, fx, fy);
  ok('finger tap writes a snare ' + voice(4, 0), voice(4, 0).join() === '0:480:38');
  const n4 = voice(4, 0).length, vx0 = S.doc.view.x, vy0 = S.doc.view.y;
  [fx, fy] = screenOf(4, 960, 3);
  finger('pointerdown', 11, fx, fy);
  for (let k = 1; k <= 5; k++) finger('pointermove', 11, fx - k * 20, fy + k * 4);
  finger('pointerup', 11, fx - 100, fy + 20);
  ok('finger drag scrolls (' + Math.round(S.doc.view.x - vx0) + ', ' + Math.round(S.doc.view.y - vy0) + ') and writes nothing',
    Math.round(S.doc.view.x - vx0) === -100 && Math.round(S.doc.view.y - vy0) === 20 && voice(4, 0).length === n4);
  const z0 = S.doc.view.zoom;
  finger('pointerdown', 11, 300, 300); finger('pointerdown', 12, 400, 300);
  finger('pointermove', 12, 450, 300);  // distance 100 -> 150
  finger('pointerup', 12, 450, 300); finger('pointerup', 11, 300, 300);
  ok('two fingers zoom ' + z0 + ' -> ' + S.doc.view.zoom.toFixed(2), Math.abs(S.doc.view.zoom - Math.min(4, z0 * 1.5)) < 0.01 && voice(4, 0).length === n4);
  TC.actions.zoomReset();
  TC.setLang('en');
  ok('English toolbar', document.getElementById('file-btn').textContent === 'File ▾');
  TC.setLang('de');
  TC.actions.toggleTheme(); TC.actions.toggleTheme();
  ok('dark theme attr ' + document.documentElement.dataset.theme, document.documentElement.dataset.theme === 'dark');
  TC.actions.toggleTheme();
  S.doc.view.x = 190; TC.refresh();
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;right:10px;bottom:30px;background:#fff;color:#000;border:2px solid #333;padding:8px;font:12px monospace;z-index:9999';
  pre.textContent = out.join('\n');
  document.body.appendChild(pre);
}, 500);
window.addEventListener('error', (e) => { document.title = 'ERR ' + e.message; const d = document.createElement('pre'); d.style.cssText='position:fixed;top:0;left:0;background:red;color:#fff;z-index:99999'; d.textContent = e.message + ' ' + e.filename + ':' + e.lineno; document.body.appendChild(d); });
