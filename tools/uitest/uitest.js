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
  TC.actions.setNotation('gp');                                // positions below are Guitar Pro lines
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
  // drag: a row of hi-hat eighths in one go, one undo step
  TC.actions.setValue(8); TC.actions.setArt(42);
  const at = (bar, tick, line) => screenOf(bar, tick, line);
  const mouse = (type, [x, y]) => vp.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1, pointerType: 'mouse' }));
  mouse('pointerdown', at(5, 0, -1));
  [480, 960, 1440, 1920, 2400].forEach((t) => mouse('pointermove', at(5, t, -1)));
  mouse('pointerup', at(5, 2400, -1));
  ok('drag writes 6 hi-hat eighths (3/4) ' + voice(5, 0).length, voice(5, 0).length === 6 && voice(5, 0).every((s) => s.endsWith(':42')));
  TC.actions.undo();
  ok('one undo removes the whole row', voice(5, 0).length === 0);
  TC.actions.redo();
  // dotted eighths and triplets: the row steps by the note length, the pointer passes every grid position
  TC.actions.toggleDotted();
  mouse('pointerdown', at(8, 0, -1));
  for (let t = 240; t <= 2400; t += 240) mouse('pointermove', at(8, t, -1));
  mouse('pointerup', at(8, 2400, -1));
  TC.actions.toggleDotted();
  ok('drag dotted eighths (3/4) ' + voice(8, 0).join(' '), voice(8, 0).join() === '0:720:42,720:720:42,1440:720:42,2160:720:42');
  TC.actions.addBar();
  TC.actions.toggleTriplet();
  mouse('pointerdown', at(9, 0, -1));
  for (let t = 320; t <= 2560; t += 320) mouse('pointermove', at(9, t, -1));
  mouse('pointerup', at(9, 2560, -1));
  TC.actions.toggleTriplet();
  ok('drag triplet eighths (3/4): 9 ' + voice(9, 0).length, voice(9, 0).length === 9 && voice(9, 0).every((s) => s.split(':')[1] === '320'));
  // copy / paste / simile
  TC.actions.copyBar(5);
  TC.actions.pasteBar(7);
  ok('paste: bar 8 = bar 6', voice(7, 0).join() === voice(5, 0).join());
  TC.actions.toggleSimile(6);
  ok('% bar: flagged and empty', S.doc.bars[6].simile && voice(6, 0).length === 0 && document.querySelector('#score .static').innerHTML.includes(''));
  click(6, 960, 3);
  ok('click into a % bar writes nothing', voice(6, 0).length === 0);
  TC.actions.toggleSimile(6);
  ok('% off: the notes are written out', voice(6, 0).join() === voice(5, 0).join());
  // flam, roll, sticking on a selected note; counting
  click(5, 0, -1);
  TC.actions.setOrn('flam'); TC.actions.setTrem(2); TC.actions.setStick('R');
  const sn = TC.score.findNote(S.doc, [...S.selection][0]).note;
  ok('flam, roll, sticking on the selected note', sn.orn === 'flam' && sn.trem === 2 && sn.stick === 'R');
  ok('drawn: grace note and sticking ' + document.querySelectorAll('#score g.grace').length + ' ' + (document.querySelector('#score .sticking') || {}).textContent, document.querySelectorAll('#score g.grace').length === 1 && document.querySelector('#score .sticking').textContent === 'R');
  ok('next notes stay plain', !S.input.orn && !S.input.trem && !S.input.stick);
  TC.actions.selectNone();
  TC.actions.toggleCounts();
  ok('counting under the staff ' + document.querySelectorAll('#score .count').length, document.querySelectorAll('#score .count').length > 20);
  TC.actions.toggleCounts();
  // 7/8 with beam groups
  S.selBar = 7; TC.actions.setTimeSig('7/8', 7, true);
  ok('7/8: beam choice in the panel', !!document.querySelector('#panel-settings select[data-action="setBeam"]'));
  TC.actions.setBeam('3+2+2', 7);
  ok('beam groups 3+2+2', S.doc.bars[7].beam.join('+') === '3+2+2');
  // every instrument makes a sound without errors; playback starts and stops
  let bad = '';
  TC.DRUM_ARTS.forEach((a) => { try { TC.audio.hit(a.id, TC.audio.context().currentTime + 0.05, 0.5, a.tech === 'choke'); } catch (e) { bad += a.id + ':' + e.message + ' '; } });
  try { TC.audio.click(TC.audio.context().currentTime + 0.05, 2); } catch (e) { bad += 'click:' + e.message; }
  ok('all ' + TC.DRUM_ARTS.length + ' instruments + click sound ' + bad, !bad);
  TC.player.play(0);
  ok('playing ' + document.getElementById('play-btn').textContent, TC.player.playing && document.getElementById('play-btn').textContent === '■');
  TC.player.stop();
  ok('stopped', !TC.player.playing && document.getElementById('play-btn').textContent === '▶');
  TC.setLang('en');
  ok('English toolbar', document.getElementById('file-btn').textContent === 'File ▾');
  TC.setLang('de');
  TC.actions.toggleTheme(); TC.actions.toggleTheme();
  ok('dark theme attr ' + document.documentElement.dataset.theme, document.documentElement.dataset.theme === 'dark');
  TC.actions.toggleTheme();
  // aim: the note is written on release, on the line the pointer reached
  const nb = S.doc.bars.length;
  TC.actions.addBar();
  TC.actions.setValue(8); TC.actions.setArt(38);
  mouse('pointerdown', at(nb, 0, -1));
  ok('press writes nothing yet', voice(nb, 0).length === 0);
  mouse('pointermove', at(nb, 0, 1));
  mouse('pointermove', at(nb, 0, 3));
  mouse('pointerup', at(nb, 0, 3));
  ok('released on the snare line: snare written ' + voice(nb, 0).join(' '), voice(nb, 0).join() === '0:480:38');
  click(nb, 0, 3);
  mouse('pointerdown', at(nb, 0, 3));
  mouse('pointermove', at(nb, 0, 8));
  mouse('pointerup', at(nb, 0, 8));
  ok('released away from the selected note: not deleted', voice(nb, 0).length === 1);
  // rest cleanup: kick on 1 and 3 drawn as quarters, setting saved in the score and undoable
  ok('rest cleanup default: beat', S.doc.tracks[0].fill === 'beat');
  TC.actions.setFill('next');
  ok('rest cleanup: next', S.doc.tracks[0].fill === 'next');
  TC.actions.undo();
  ok('rest cleanup: undo', S.doc.tracks[0].fill === 'beat');
  // page view: lines, a click on a later line, bar text, line break, bars per line, print
  TC.actions.layout('page');
  const PL = () => TC.render.layout;
  ok('page view: ' + PL().systems.length + ' lines on ' + PL().pages.length + ' page(s)', PL().page && PL().systems.length >= 2);
  const onPage = (bar, tick, line) => {
    const b = PL().bars[bar], s = PL().systems[b.sys], v = S.doc.view, r = vp.getBoundingClientRect();
    return [r.left + v.x + (TC.render.tickX(b, tick) + s.tx) * v.zoom, r.top + v.y + (TC.render.stepY(line) + s.ty) * v.zoom];
  };
  const lastBar = S.doc.bars.length - 1;
  ok('the last bar is on a later line', PL().bars[lastBar].sys > 0);
  TC.actions.setArt(38);
  mouse('pointerdown', onPage(lastBar, 960, 3));
  mouse('pointerup', onPage(lastBar, 960, 3));
  ok('page view: click writes into a bar of a later line ' + voice(lastBar, 0).join(' '), voice(lastBar, 0).some((s) => s.startsWith('960:') && s.endsWith(':38')));
  TC.actions.setMarker('Chorus', 2);
  ok('bar text drawn ' + (document.querySelector('#score .marker-text') || {}).textContent, S.doc.bars[2].marker === 'Chorus' && document.querySelector('#score .marker-text').textContent === 'Chorus');
  TC.actions.toggleBreakAfter(1);
  ok('line break after bar 2: bar 3 starts a line, marked', PL().systems.some((s) => s.first === 2) && S.doc.bars[2].lineBreak && !!document.querySelector('#score .break-mark'));
  TC.actions.undo();
  TC.actions.toggleLineBreak(2);
  ok('new line from bar 3', PL().systems.some((s) => s.first === 2));
  TC.actions.undo();
  TC.actions.setBarsPerLine(2);
  ok('2 bars per line', PL().systems.every((s) => s.last - s.first + 1 <= 2) && PL().systems[0].last === 1);
  TC.actions.setBarNumbers('every');
  ok('bar numbers on every bar ' + document.querySelectorAll('#score .barno').length, document.querySelectorAll('#score .barno').length === S.doc.bars.length);
  TC.actions.undo(); TC.actions.undo();
  const realPrint = window.print;
  window.print = () => {};
  const np = TC.render.print();
  ok('print: ' + np + ' A4 page(s) as SVG', np >= 1 && document.querySelectorAll('#print-root svg').length === np && !document.querySelector('#print-root .grid'));
  window.print = realPrint;
  window.dispatchEvent(new Event('afterprint'));
  ok('print: emptied afterwards, page view kept', !document.querySelector('#print-root svg') && TC.render.isPage());
  TC.actions.layout('endless');
  ok('back to the endless view: one line', PL().systems.length === 1 && !PL().page);
  // finger: hold a note, then drag = a row of its instrument (waits for the hold)
  const [hx, hy] = screenOf(nb, 0, 3);
  finger('pointerdown', 11, hx, hy);
  setTimeout(() => {
    [480, 960, 1440].forEach((t) => { const [x, y] = screenOf(nb, t, 3); finger('pointermove', 11, x, y); });
    const [ux, uy] = screenOf(nb, 1440, 3);
    finger('pointerup', 11, ux, uy);
    ok('finger: hold a note + drag writes a snare row ' + voice(nb, 0).join(' '),
      voice(nb, 0).join() === '0:480:38,480:480:38,960:480:38,1440:480:38' && !TC.menu.isOpen());
    TC.actions.undo();
    ok('finger row: one undo step', voice(nb, 0).join() === '0:480:38');
    // notation layout: Tactus puts kick and pedal hi-hat on the bottom line, toms from the top line down
    TC.actions.setNotation('tactus');
    ok('notation tactus: kick on the bottom line, floor tom on G4, crash 2 above', TC.drums.byId(36).line === 8 && TC.drums.byId(45).line === 6 && TC.drums.byId(57).line === -3);
    ok('notation tactus: a click on the bottom line writes the kick (not the pedal)', TC.drums.resolve(8, 42, TC.drums.kit()).id === 36);
    ok('notation tactus: a click on the top line writes the ride (not tom 1)', TC.drums.resolve(0, 42, TC.drums.kit()).id === 51);
    ok('notation: panel offers it', !!document.querySelector('select[data-action="setNotation"] option[value="tactus"][selected]'));
    const mt = TC.actions.midiTargets();
    ok('MIDI export: General MIDI and kit profiles in the menu', mt[0].label.startsWith('General MIDI') && mt.some((x) => x.label === 'Kit profiles (Cubase)…'));
    const mb = TC.midi.build(S.doc, null).bytes;
    ok('MIDI export: a MIDI file (' + mb.length + ' bytes)', String.fromCharCode(...mb.slice(0, 4)) === 'MThd' && mb.length > 40);
    TC.actions.openKits();
    ok('kit profiles: dialog opens', !!document.querySelector('.kit-dialog') && TC.kits.isOpen());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('kit profiles: Escape closes it', !document.querySelector('.kit-dialog') && !TC.kits.isOpen());
    TC.actions.setNotation('gp');
    ok('notation gp: kick back on F4, score unchanged', TC.drums.byId(36).line === 7 && voice(nb, 0).join() === '0:480:38');
    S.doc.view.x = 190; TC.refresh();
    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;right:10px;bottom:30px;background:#fff;color:#000;border:2px solid #333;padding:8px;font:12px monospace;z-index:9999';
    pre.textContent = out.join('\n');
    document.body.appendChild(pre);
  }, 700);
}, 500);
window.addEventListener('error', (e) => { document.title = 'ERR ' + e.message; const d = document.createElement('pre'); d.style.cssText='position:fixed;top:0;left:0;background:red;color:#fff;z-index:99999'; d.textContent = e.message + ' ' + e.filename + ':' + e.lineno; document.body.appendChild(d); });
