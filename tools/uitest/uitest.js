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
  const plus = { clientX: r.left + v.x + (a.x + 10) * v.zoom, clientY: r.top + v.y + (a.y + 10) * v.zoom, button: 0, bubbles: true };
  vp.dispatchEvent(new PointerEvent('pointerdown', plus)); vp.dispatchEvent(new PointerEvent('pointerup', plus));
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
  [fx, fy] = screenOf(4, 960, 14); // beside the lines: a finger scrolls
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
  const mouse = (type, [x, y], o = {}) => vp.dispatchEvent(new PointerEvent(type, Object.assign({ clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1, pointerType: 'mouse' }, o)));
  // a row: write the first note, then Ctrl + drag from it (hold + drag works too, see the finger test)
  const drawRow = (bar, ticks, line) => { click(bar, 0, line); const c = { ctrlKey: true }; mouse('pointerdown', at(bar, 0, line), c); ticks.forEach((t) => mouse('pointermove', at(bar, t, line), c)); mouse('pointerup', at(bar, ticks[ticks.length - 1], line), c); };
  drawRow(5, [480, 960, 1440, 1920, 2400], -1);
  ok('Ctrl + drag from a note writes 6 hi-hat eighths (3/4) ' + voice(5, 0).length, voice(5, 0).length === 6 && voice(5, 0).every((s) => s.endsWith(':42')));
  TC.actions.undo();
  ok('one undo removes the whole row (the first note stays)', voice(5, 0).length === 1);
  TC.actions.redo();
  // dotted eighths and triplets: the row steps by the note length, the pointer passes every grid position
  TC.actions.toggleDotted();
  drawRow(8, [240, 480, 720, 960, 1200, 1440, 1680, 1920, 2160, 2400], -1);
  TC.actions.toggleDotted();
  ok('drag dotted eighths (3/4) ' + voice(8, 0).join(' '), voice(8, 0).join() === '0:720:42,720:720:42,1440:720:42,2160:720:42');
  TC.actions.addBar();
  TC.actions.toggleTriplet();
  drawRow(9, [320, 640, 960, 1280, 1600, 1920, 2240, 2560], -1);
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
  // "Follow" off: the view stays while the cursor runs
  TC.actions.toggleFollowPlay();
  ok('follow off: button not active', S.settings.followPlay === false && !document.getElementById('follow-btn').classList.contains('active'));
  const fv = S.doc.view.x;
  S.doc.view.x = 5000; TC.render.applyView(); // the cursor of bar 1 is far out of view
  TC.player.play(0); // places the cursor at once (with "follow" it would scroll there)
  TC.player.stop();
  ok('follow off: the view did not jump to the cursor', S.doc.view.x === 5000);
  S.doc.view.x = fv; TC.render.applyView();
  TC.actions.toggleFollowPlay();
  ok('follow on again', S.settings.followPlay === true && document.getElementById('follow-btn').classList.contains('active'));
  // several bars: Shift + click beside the lines, the panel field, the bar menu; playback plays them
  click(1, 480, 11.5);
  click(3, 480, 11.5, { shift: true });
  ok('Shift + click beside the lines: bars 2-4 ' + JSON.stringify(TC.barRange()), JSON.stringify(TC.barRange()) === '[1,3]' && document.querySelectorAll('#score .bar-sel').length === 3);
  TC.player.play();
  ok('play: only bars 2-4 ' + JSON.stringify(TC.player.range()), JSON.stringify(TC.player.range()) === '[1,3]');
  TC.player.stop();
  S.settings.loop = true; TC.player.play();
  ok('loop: bars 2-4', JSON.stringify(TC.player.range()) === '[1,3]');
  TC.player.stop(); S.settings.loop = false;
  // ran to the end without loop: the next start is from bar 1, the whole piece; with loop the selection again
  TC.player.play(); TC.player.finish(); TC.player.play();
  ok('after the end (no loop): from bar 1, the whole piece ' + JSON.stringify(TC.player.range()), JSON.stringify(TC.player.range()) === JSON.stringify([0, S.doc.bars.length - 1]));
  TC.player.stop(); TC.player.play();
  ok('stopped by hand: the selected bars again', JSON.stringify(TC.player.range()) === '[1,3]');
  TC.player.finish(); TC.selectBar(2); TC.player.play();
  ok('after the end, another bar chosen: from that bar ' + JSON.stringify(TC.player.range()), TC.player.range()[0] === 2);
  TC.player.stop(); TC.selectBar(1); TC.selectBar(3, true); TC.refresh();
  const toSel = document.querySelector('#panel-settings select[data-action="selectBarsTo"]');
  ok('panel: to bar field shows bar 4', !!toSel && toSel.value === '3');
  TC.actions.selectBarsTo(1);
  ok('to bar = the same bar: one bar again', JSON.stringify(TC.barRange()) === '[1,1]');
  TC.actions.barMenu(4, 300, 300, 1);
  const bm = document.getElementById('context-menu').textContent;
  TC.menu.close();
  ok('bar menu offers bars 2-5', /Takte 2–5 auswählen/.test(bm));
  TC.actions.selectBarsTo(4, 1);
  ok('bar menu: bars 2-5 selected', JSON.stringify(TC.barRange()) === '[1,4]');
  // repeats: the selection as a repeat, an ending, the play order, the bar menu
  TC.actions.repeatSelection(2);
  ok('repeat bars 2-5: |: and :| drawn', S.doc.bars[1].repeatStart && S.doc.bars[4].repeatEnd === 2 && document.querySelectorAll('#score .repeat-dot').length === 4);
  TC.actions.setVolta('1', 4);
  ok('ending "1." drawn', !!document.querySelector('#score .volta') && document.querySelector('#score .volta-text').textContent === '1.');
  ok('played: 2 3 4 5 2 3 4 (bar 5 only the first time) ' + TC.timeline.build(S.doc, { from: 1, to: 4 }).bars.map((b) => b.bar + 1).join(' '),
    TC.timeline.build(S.doc, { from: 1, to: 4 }).bars.map((b) => b.bar + 1).join(' ') === '2 3 4 5 2 3 4');
  TC.actions.barMenu(1, 300, 300);
  ok('bar menu: Repeat submenu', /Wiederholung beginnt hier/.test(document.getElementById('context-menu').textContent));
  TC.menu.close();
  ok('panel: repeat controls', !!document.querySelector('#panel-settings select[data-action="setRepeatEnd"]') && !!document.querySelector('#panel-settings select[data-action="setVolta"]'));
  TC.actions.undo(); TC.actions.undo();
  ok('undo: no repeats left', !TC.score.hasRepeats(S.doc));
  // jumps: panel section, signs drawn, warning, the help window
  TC.selectBar(S.doc.bars.length - 1); TC.refresh();
  ok('panel: section "Repeats & jumps"', [...document.querySelectorAll('#panel-settings h3')].some((h) => h.textContent === 'Wiederholungen & Sprünge') &&
    !!document.querySelector('#panel-settings select[data-action="setJump"]'));
  TC.actions.setJump('dsCoda');
  ok('D.S. al Coda drawn, missing segno / coda reported in the panel', [...document.querySelectorAll('#score .jump-text')].some((t) => t.textContent === 'D.S. al Coda') &&
    /Segno/.test(document.querySelector('#panel-settings .hint.warn').textContent));
  TC.actions.setMark('segno', 1);
  ok('segno drawn on bar 2', !!document.querySelector('#score .jump-sign') && S.doc.bars[1].mark === 'segno');
  ok('played: … then from bar 2 again ' + TC.score.playOrder(S.doc).map((o) => o.bar + 1).join(' '),
    TC.score.playOrder(S.doc).filter((o) => o.via === 'ds').length === 1 && TC.score.playOrder(S.doc).find((o) => o.via).bar === 1);
  document.querySelector('#panel-settings [data-action="jumpHelp"]').click();
  ok('help window "How jumps work" opens', TC.help.isOpen() && /Da Capo/.test(document.querySelector('.help-dialog').textContent));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('help window: Escape closes it', !TC.help.isOpen());
  TC.actions.undo(); TC.actions.undo();
  ok('undo: no jumps left', !S.doc.bars.some((b) => b.jump || b.mark));
  // several bars: duplicate / delete the selected bars; tempo from a bar on
  const nBars = S.doc.bars.length;
  TC.selectBar(1); TC.selectBar(2, true); TC.refresh();
  TC.actions.barMenu(1, 300, 300);
  ok('bar menu names the range', /Takte 2–3 kopieren/.test(document.getElementById('context-menu').textContent));
  TC.menu.close();
  TC.actions.duplicateBar(1);
  ok('duplicate bars 2-3: two more bars, the copies selected ' + JSON.stringify(TC.barRange()), S.doc.bars.length === nBars + 2 && JSON.stringify(TC.barRange()) === '[3,4]');
  TC.actions.deleteBar(3);
  ok('delete bars 4-5 (the selection): as many bars as before', S.doc.bars.length === nBars);
  TC.actions.setBarTempo(140, 2);
  ok('tempo 140 from bar 3: drawn above it', S.doc.bars[2].tempo === 140 && [...document.querySelectorAll('#score .tempo')].some((t) => t.textContent.includes('140')));
  TC.selectBar(2); TC.refresh();
  ok('bar panel: tempo field', !!document.querySelector('#panel-settings input[data-bartempo]') && document.querySelector('#panel-settings input[data-bartempo]').value === '140');
  TC.actions.undo(); TC.actions.undo(); TC.actions.undo();
  ok('undo: tempo and bars as before', !S.doc.bars[2].tempo && S.doc.bars.length === nBars);
  // swing / shuffle: panel, label above the first bar, MIDI option
  TC.actions.setSwing(67);
  ok('shuffle: written above the music, panel shows it', [...document.querySelectorAll('#score .tempo.swing')].some((t) => t.textContent === 'Shuffle') &&
    document.querySelector('#panel-settings select[data-action="setSwing"]').value === '67' && !!document.querySelector('#panel-settings [data-action="toggleSwingMidi"]'));
  TC.actions.undo();
  ok('undo: straight again', S.doc.meta.swing === 50 && !document.querySelector('#score .tempo.swing'));
  TC.actions.selectNone();
  // file menu: Dropbox entry (as a file page: only the hint that it needs the online version)
  TC.actions.fileMenu();
  const menuText = document.getElementById('context-menu').textContent;
  TC.menu.close();
  ok('file menu has the Dropbox entry', /Dropbox/.test(menuText) && /Öffnen/.test(menuText));
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
  mouse('pointermove', at(nb, 0, 14));
  mouse('pointerup', at(nb, 0, 14));
  ok('note dragged off the lines and released: stays, not deleted', voice(nb, 0).join() === '0:480:38');
  // aim: the new note follows the pointer sideways too; moving and choosing bars
  const nb2 = S.doc.bars.length;
  TC.actions.addBar();
  mouse('pointerdown', at(nb2, 0, 3));
  mouse('pointermove', at(nb2, 480, 3));
  mouse('pointermove', at(nb2, 960, 3));
  ok('aiming: nothing written while held', voice(nb2, 0).length === 0);
  mouse('pointerup', at(nb2, 960, 3));
  ok('aim moved sideways: written where released ' + voice(nb2, 0).join(' '), voice(nb2, 0).join() === '960:480:38');
  mouse('pointerdown', at(nb2, 0, 3));
  mouse('pointermove', at(nb2, 0, 14));
  mouse('pointerup', at(nb2, 0, 14));
  ok('aim released off the lines: no note', voice(nb2, 0).length === 1);
  mouse('pointerdown', at(nb2, 960, 3));
  mouse('pointermove', at(nb2, 1440, 3));
  mouse('pointerup', at(nb2, 1440, 3));
  ok('drag a note sideways: moved in time ' + voice(nb2, 0).join(' '), voice(nb2, 0).join() === '1440:480:38' && S.selection.size === 1);
  mouse('pointerdown', at(nb2, 1440, 3));
  mouse('pointermove', at(nb2, 1440, -1));
  mouse('pointerup', at(nb2, 1440, -1));
  ok('drag a note up: other instrument (hi-hat) ' + voice(nb2, 0).join(' '), voice(nb2, 0).join() === '1440:480:42');
  TC.actions.undo();
  ok('move: one undo step', voice(nb2, 0).join() === '1440:480:38');
  // strength: hold (here: Ctrl) a note, then up = accent, down = ghost; sideways would be a row
  const vn = () => S.doc.tracks[0].bars[nb2].voices[0][0].notes[0];
  const [vx, vy] = at(nb2, 1440, 3), cK = { ctrlKey: true };
  mouse('pointerdown', [vx, vy], cK);
  mouse('pointermove', [vx + 1, vy - 20], cK);
  ok('strength meter shown while held', !!document.querySelector('#score .vel-seg.on'));
  mouse('pointermove', [vx + 1, vy - 40], cK);
  mouse('pointerup', [vx + 1, vy - 40], cK);
  ok('up: accent ' + JSON.stringify([vn().accent, vn().ghost]), vn().accent === 1 && !vn().ghost && voice(nb2, 0).join() === '1440:480:38');
  mouse('pointerdown', [vx, vy], cK);
  mouse('pointermove', [vx, vy + 30], cK);
  mouse('pointermove', [vx, vy + 95], cK);
  mouse('pointerup', [vx, vy + 95], cK);
  ok('down (four steps): ghost', vn().ghost && !vn().accent);
  TC.actions.undo();
  ok('strength: one undo step per drag (accent again)', vn().accent === 1 && !vn().ghost);
  TC.actions.undo();
  ok('… and normal again', !vn().accent && !vn().ghost);
  // tools: select (frame, Shift + click, move several, arrow keys), eraser (wipe)
  TC.actions.selectNone(); // (a selected note would take the instrument chosen next)
  const nb3 = S.doc.bars.length;
  TC.actions.addBar();
  TC.actions.setValue(8); TC.actions.setArt(42);
  [0, 480, 960, 1440].forEach((t) => click(nb3, t, -1));
  click(nb3, 960, 3);
  TC.actions.setTool('select');
  ok('select tool active', S.tool === 'select' && document.querySelector('#panel-notes [data-action="setTool"][data-value="select"]').classList.contains('active'));
  mouse('pointerdown', at(nb3, -150, -5));
  mouse('pointermove', at(nb3, 300, 1));
  mouse('pointermove', at(nb3, 600, 1));
  ok('frame drawn while dragging', !!document.querySelector('#score .sel-frame'));
  mouse('pointerup', at(nb3, 600, 1));
  ok('frame selects the hi-hats at 1 and 1+ ' + S.selection.size, S.selection.size === 2 && !document.querySelector('#score .sel-frame'));
  mouse('pointerdown', at(nb3, 0, -1));
  mouse('pointermove', at(nb3, 960, -1));
  mouse('pointermove', at(nb3, 1920, -1));
  mouse('pointerup', at(nb3, 1920, -1));
  ok('drag a selected note: both move by two beats ' + voice(nb3, 0).join(' '), voice(nb3, 0).join() === '960:480:42+38,1440:480:42,1920:480:42,2400:480:42');
  click(nb3, 1440, -1, { shift: true });
  ok('Shift + click adds a note', S.selection.size === 3);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ok('→ blocked at the end of the score (3/4, last bar): nothing moves', voice(nb3, 0).join() === '960:480:42+38,1440:480:42,1920:480:42,2400:480:42');
  click(nb3, 960, 3);
  ok('a click selects the snare alone', S.selection.size === 1);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ok('→ moves the snare one step later ' + voice(nb3, 0).join(' '), voice(nb3, 0).join() === '960:480:42,1440:480:42+38,1920:480:42,2400:480:42');
  TC.actions.undo(); TC.actions.undo();
  ok('undo: back where they were', voice(nb3, 0).join() === '0:480:42,480:480:42,960:480:42+38,1440:480:42');
  TC.actions.setTool('erase');
  mouse('pointerdown', at(nb3, 0, -1));
  [480, 960, 1440, 1920].forEach((t) => mouse('pointermove', at(nb3, t, -1)));
  mouse('pointerup', at(nb3, 1920, -1));
  ok('eraser wiped the hi-hats, the snare stays ' + voice(nb3, 0).join(' '), voice(nb3, 0).join() === '960:480:38');
  TC.actions.undo();
  ok('eraser: one undo step', voice(nb3, 0).length === 4);
  TC.actions.setTool('write');
  S.selection.clear();
  TC.actions.deleteBar(nb3); // the bar of these tests goes again
  TC.actions.setArt(38); // as before these tests
  S.selBar = 0; TC.refresh();
  click(nb2, 480, 11.5);
  ok('tap below the lines: the bar is selected, no note', S.selBar === nb2 && voice(nb2, 0).length === 1 && voice(nb2, 1).length === 0);
  S.selBar = 0; TC.actions.toggleLock();
  click(nb2, 2400, 11.5);
  ok('instrument lock: below the lines still selects the bar', S.selBar === nb2 && voice(nb2, 0).length === 1);
  click(nb2, 2400, 6);
  ok('instrument lock: on the lines writes the snare anywhere ' + voice(nb2, 0).join(' '), voice(nb2, 0).join() === '1440:480:38,2400:480:38');
  TC.actions.toggleLock();
  const fp = screenOf(nb2, 0, 3);
  finger('pointerdown', 11, fp[0], fp[1]);
  const fq = screenOf(nb2, 480, 3);
  finger('pointermove', 11, fq[0], fq[1]);
  finger('pointerup', 11, fq[0], fq[1]);
  ok('finger: aim and release writes where released ' + voice(nb2, 0).join(' '), voice(nb2, 0)[0] === '480:480:38');
  TC.actions.toggleFingerWrites();
  const fr = screenOf(nb2, 2880, 3);
  finger('pointerdown', 11, fr[0], fr[1]); finger('pointerup', 11, fr[0], fr[1]);
  ok('fingers do not write (setting off): a tap selects the bar', !voice(nb2, 0).some((s) => s.startsWith('2880')) && S.selBar === nb2);
  TC.actions.toggleFingerWrites();
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
  // margins and the running header on the following pages
  const m15 = PL().systems[0].tx + PL().systems[0].ox;
  TC.actions.setMargin(25);
  const m25 = PL().systems[0].tx + PL().systems[0].ox;
  ok('margin 25 mm: lines start further in ' + m15 + ' → ' + m25, S.doc.page.margin === 25 && m25 === Math.round(25 * 1200 / 210) && m25 > m15);
  TC.actions.undo();
  while (S.doc.bars.length < 40) TC.actions.addBar();
  // multi-bar rest: the empty bars at the end become one ▬ with their number
  const mr = PL().bars.filter((b) => b.multi);
  const mrLast = mr[mr.length - 1];
  ok('multi-bar rest over the empty bars at the end: ' + mr.map((b) => (b.i + 1) + '+' + b.multi).join(' '),
    mrLast && mrLast.i + mrLast.multi === 40 && [...document.querySelectorAll('#score .multirest-n')].some((t) => t.textContent === String(mrLast.multi)));
  ok('bars inside it share its place', PL().bars[39].x === mrLast.x && PL().bars[39].sys === mrLast.sys);
  mouse('pointerdown', onPage(mrLast.i, 0, 3));
  mouse('pointerup', onPage(mrLast.i, 0, 3));
  ok('writing into the multi-bar rest fills its first bar, the rest stays combined ' + voice(mrLast.i, 0).join(' '),
    voice(mrLast.i, 0).length > 0 && PL().bars[mrLast.i].multi === undefined && PL().bars[mrLast.i + 1].multi === mrLast.multi - 1);
  TC.actions.undo();
  TC.actions.toggleMultiRest();
  ok('combining switched off: every bar of its own', !PL().bars.some((b) => b.multi) && !document.querySelector('#score .multirest'));
  [2, 3, 4, 5].forEach((k) => TC.actions.toggleSimile(k));
  ok('%-bars 3-6: one % with "4" above', PL().bars[2].multi === 4 && PL().bars[2].simile && (document.querySelector('#score .multisimile .multirest-n') || {}).textContent === '4');
  TC.actions.toggleMultiSimile();
  ok('… switched off: four % bars again', !PL().bars[2].multi && document.querySelectorAll('#score .multisimile').length === 0);
  TC.actions.undo(); [0, 1, 2, 3].forEach(() => TC.actions.undo());
  TC.actions.setBarsPerLine(2);
  const heads = [...document.querySelectorAll('#score .runhead.right')].map((t) => t.textContent);
  ok('running header on every page after the first: ' + heads.join(', '), PL().pages.length > 1 && heads.length === PL().pages.length - 1 && heads[0] === 'Seite 2 / ' + PL().pages.length);
  TC.actions.togglePageHeader();
  ok('without running header: only the page number at the bottom', !document.querySelector('#score .runhead') && document.querySelectorAll('#score .pageno').length === PL().pages.length - 1);
  TC.actions.undo(); TC.actions.undo();
  while (S.doc.bars.length > lastBar + 1) TC.actions.undo();
  const realPrint = window.print;
  window.print = () => {};
  const np = TC.render.print();
  ok('print: ' + np + ' A4 page(s) as SVG', np >= 1 && document.querySelectorAll('#print-root svg').length === np && !document.querySelector('#print-root .grid'));
  window.print = realPrint;
  window.dispatchEvent(new Event('afterprint'));
  ok('print: emptied afterwards, page view kept', !document.querySelector('#print-root svg') && TC.render.isPage());
  // page view, zoomed in: the view follows the cursor sideways and down to its line
  const pv = S.doc.view, vw = vp.clientWidth, vh = vp.clientHeight;
  Object.assign(pv, { zoom: 3, x: 0, y: 0 }); TC.render.applyView();
  const endBar = PL().systems[0].last;
  let c = TC.render.drawCursor(endBar, 0);
  ok('(cursor at the end of line 1 is out of view)', pv.x + c.x * pv.zoom > vw);
  TC.player.keepInView(c);
  ok('page view zoomed in: follows sideways', pv.x + c.x * pv.zoom > 0 && pv.x + c.x * pv.zoom < vw);
  const lastLineBar = PL().systems[PL().systems.length - 1].first;
  c = TC.render.drawCursor(lastLineBar, 0);
  TC.player.keepInView(c);
  const cy = pv.y + c.y * pv.zoom, cx = pv.x + c.x * pv.zoom;
  ok('page view zoomed in: follows down to a later line (' + Math.round(cx) + ', ' + Math.round(cy) + ')', cy > 0 && cy < vh && cx > 0 && cx < vw);
  TC.render.drawCursor(null);
  TC.actions.zoomReset();
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
    ok('right panel is short: no drum kit, page, view there', !document.querySelector('#panel-settings select[data-action="setNotation"]') && !document.querySelector('#panel-settings select[data-action="setKit"]') && !!document.querySelector('#panel-settings [data-action="openSettings"]'));
    TC.actions.openSettings();
    ok('notation: the settings window offers it', !!document.querySelector('.settings-dialog select[data-action="setNotation"] option[value="tactus"][selected]') && document.getElementById('settings-btn').classList.contains('active'));
    TC.actions.setKit('all');
    ok('settings window: changes apply and it stays open', TC.panel.isSettingsOpen() && document.querySelector('.settings-dialog select[data-action="setKit"]').value === 'all');
    TC.actions.setKit('standard');
    TC.actions.setStems('up');
    ok('stems all up: the kick of bar 1 joins the upper voice', voice(0, 1).length === 0 && voice(0, 0)[0].includes('36'));
    TC.actions.setStems('low');
    ok('stems low: kick down again, choice of toms shown', voice(0, 1).join() === '0:480:36' && !!document.querySelector('.settings-dialog .stem-toms'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('settings window: Escape closes it', !TC.panel.isSettingsOpen() && !document.querySelector('.settings-dialog'));
    // recorded sounds: switch in the panel; here (file://) they cannot load, the synth plays on
    TC.actions.toggleSamples();
    ok('samples: switched on in the panel, credits shown', S.settings.samples && !!document.querySelector('#panel-settings input[data-action="toggleSamples"]:checked') &&
      /MuldjordKit/.test(document.getElementById('panel-settings').textContent));
    TC.audio.preview(TC.newDrumNote(38, {}));
    ok('samples not loaded yet: a written note still sounds (synth), no error', TC.samples.state() !== 'ready');
    TC.actions.toggleSamples();
    TC.actions.setAudioDelay(150);
    ok('output delay 150 ms: in the panel, the cursor waits for it', document.querySelector('#panel-settings input[data-audiodelay]').value === '150' && TC.audio.outputDelay() >= 0.15);
    TC.actions.setAudioDelay(0);
    // tempo changes listed in the panel: click goes to the bar, ✕ removes the change
    TC.actions.setBarTempo(140, 1);
    const ti = document.querySelector('#panel-settings .tempo-item [data-action="gotoBar"]');
    ok('tempo list: bar 2 ♩ = 140 ' + (ti && ti.textContent), !!ti && /2: ♩ = 140/.test(ti.textContent));
    ti.click();
    ok('tempo list: click selects bar 2', S.selBar === 1);
    document.querySelector('#panel-settings .tempo-item [data-action="clearBarTempo"]').click();
    ok('tempo list: ✕ removes the change', !S.doc.bars[1].tempo && !document.querySelector('#panel-settings .tempo-item'));
    const sk = document.getElementById('status-kit');
    ok('status bar: kit General MIDI for a new score (' + sk.textContent + ')', /General MIDI/.test(sk.textContent));
    const saveKits = TC.kits.save; TC.kits.save = () => true;
    TC.kits.list.push({ id: 'ui-test', name: 'UI-Kit', drm: '<DrumMap><list name="Map"></list></DrumMap>', assign: {} });
    TC.actions.setKitProfile('ui-test');
    ok('status bar shows the kit profile of the score', /UI-Kit/.test(sk.textContent) && S.doc.meta.kitName === 'UI-Kit');
    ok('kit profile lacks instruments: the check opens by itself, ⚠ in the status bar (' + document.querySelectorAll('.kit-check .check-row').length + ' rows)',
      TC.kits.isCheckOpen() && document.querySelectorAll('.kit-check .check-row').length === TC.kits.check(S.doc, TC.kits.byId('ui-test')).length && /⚠/.test(sk.textContent));
    const csel = document.querySelector('.kit-check select[data-k="subst"]');
    csel.value = 'off';
    csel.dispatchEvent(new Event('change', { bubbles: true }));
    ok('check: "do not play" is kept in the profile', Object.values(TC.kits.byId('ui-test').subst || {}).includes(0));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('check: Escape closes it', !TC.kits.isCheckOpen());
    TC.actions.undo();
    ok('kit profile: undo', /General MIDI/.test(sk.textContent));
    TC.kits.list = TC.kits.list.filter((p) => p.id !== 'ui-test'); TC.kits.save = saveKits;
    const mt = TC.actions.midiTargets();
    ok('MIDI export: General MIDI and kit profiles in the menu', mt[0].label.startsWith('General MIDI') && mt.some((x) => x.label === 'Kit profiles (Cubase)…'));
    const mb = TC.midi.build(S.doc, null).bytes;
    ok('MIDI export: a MIDI file (' + mb.length + ' bytes)', String.fromCharCode(...mb.slice(0, 4)) === 'MThd' && mb.length > 40);
    TC.midiIn.open(TC.midi.build(S.doc, null).bytes, 'Test.mid');
    ok('MIDI import: dialog with source, grid and a preview', !!document.querySelector('.midi-dialog select[data-k="source"]') && /Takten|bars/.test(document.querySelector('.midi-dialog').textContent));
    document.querySelector('.midi-dialog [data-k="close"]').click();
    ok('MIDI import: cancel closes it, score unchanged', !TC.midiIn.isOpen() && voice(nb, 0).join() === '0:480:38');
    // into the open score: behind its last bar (bars are added), one undo step
    const barsNow = S.doc.bars.length;
    TC.midiIn.open(TC.midi.build(S.doc, null).bytes, 'Part.mid');
    const md = () => document.querySelector('.midi-dialog');
    const tgt = md().querySelector('select[data-k="target"]');
    tgt.value = 'into'; tgt.dispatchEvent(new Event('change', { bubbles: true }));
    const atIn = md().querySelector('input[data-k="at"]'), fromIn = md().querySelector('input[data-k="from"]'), toIn = md().querySelector('input[data-k="to"]');
    ok('MIDI import: target "into the open score" with from bar / file bars', !!atIn && !!fromIn && !!toIn);
    atIn.value = String(barsNow + 1); atIn.dispatchEvent(new Event('change', { bubbles: true }));
    fromIn.value = '1'; fromIn.dispatchEvent(new Event('change', { bubbles: true }));
    toIn.value = '2'; toIn.dispatchEvent(new Event('change', { bubbles: true }));
    md().querySelector('[data-k="ok"]').click();
    ok('MIDI import into: 2 bars added after the last one ' + (S.doc.bars.length - barsNow), S.doc.bars.length === barsNow + 2 && !TC.midiIn.isOpen());
    const tickArt = (bi) => voice(bi, 0).map((s) => s.split(':')[0] + ':' + s.split(':')[2].split('+').sort().join('+')).join(' ');
    ok('… with the notes of bar 1 of the file (' + tickArt(barsNow) + ')', tickArt(barsNow) === tickArt(0));
    TC.actions.undo();
    ok('… one undo step', S.doc.bars.length === barsNow);
    S.settings.importTarget = 'new';
    TC.actions.openKits();
    ok('kit profiles: dialog opens', !!document.querySelector('.kit-dialog') && TC.kits.isOpen());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('kit profiles: Escape closes it', !document.querySelector('.kit-dialog') && !TC.kits.isOpen());
    TC.actions.setNotation('gp');
    ok('notation gp: kick back on F4, score unchanged', TC.drums.byId(36).line === 7 && voice(nb, 0).join() === '0:480:38');
    // finger held still on an empty place of the lines: the bar menu, no note
    const [ex, ey] = screenOf(nb, 1920, 3);
    finger('pointerdown', 11, ex, ey);
    setTimeout(() => {
      ok('finger held on the lines: bar menu opens', TC.menu.isOpen());
      finger('pointerup', 11, ex, ey);
      ok('… and no note is written on release ' + voice(nb, 0).join(' '), voice(nb, 0).join() === '0:480:38');
      TC.menu.close();
      // finger held on the hi-hat of bar 1 and released: menu with the instruments of its line
      const [hhx, hhy] = screenOf(0, 0, -1);
      finger('pointerdown', 11, hhx, hhy);
      setTimeout(() => {
        finger('pointerup', 11, hhx, hhy);
        const menu = document.getElementById('context-menu');
        const open = [...menu.querySelectorAll('.menu-item')].find((el) => el.textContent.trim() === TC.drums.label(TC.drums.byId(46)));
        ok('hold + release a hi-hat: menu with closed / half / open and ghost / accent', TC.menu.isOpen() && !!open && /Akzent/.test(menu.textContent));
        if (open) open.click();
        ok('menu: open hi-hat chosen ' + voice(0, 0)[0], voice(0, 0)[0].startsWith('0:') && voice(0, 0)[0].includes('46') && !TC.menu.isOpen());
        TC.actions.undo();
        ok('… one undo step: closed again', voice(0, 0)[0].includes('42'));
        // share link: packed and compressed, opened again from the address
        (async () => {
          const countNotes = (d) => { let n = 0; TC.score.eachNote(d, () => n++); return n; };
          const before = countNotes(S.doc), bars = S.doc.bars.length;
          const url = await TC.share.link(S.doc);
          ok('share link: compressed (' + url.length + ' characters)', /#s=z[A-Za-z0-9_-]+$/.test(url) && url.length < 6000);
          S.dirty = false;
          history.replaceState(null, '', location.pathname + '#s=' + url.split('#s=')[1]);
          await TC.share.openFromHash();
          ok('share link opened: same notes and bars, address cleaned', countNotes(S.doc) === before && S.doc.bars.length === bars && !location.hash);
          ok('menu entry', (() => { TC.actions.fileMenu(); const t = document.getElementById('context-menu').textContent; TC.menu.close(); return /Link zum Teilen kopieren/.test(t); })());
        })().catch((e) => ok('share link: ' + e.message, false)).then(() => {
          // MIDI output (Web MIDI stubbed): the strokes go to the port with the keys of the kit profile
          const sent = [];
          const port = { name: 'Test Port', send: (m) => sent.push(Array.from(m)), clear: () => sent.push('clear') };
          Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve({ outputs: new Map([['p', port]]) }) });
          return TC.midiOut.init().then(() => {
            TC.actions.setMidiOut('Test Port');
            ok('MIDI output: chosen in the panel', [...document.querySelectorAll('select[data-action="setMidiOut"] option')].some((o) => o.value === 'Test Port' && o.selected) && TC.midiOut.active());
            TC.audio.preview(TC.newDrumNote(38, { accent: 1 }));
            ok('MIDI output: a written note goes to the port (General MIDI: channel 10, 38, accent 127) ' + JSON.stringify(sent[0]),
              sent.length === 2 && sent[0].join() === [0x99, 38, 127].join() && sent[1][0] === 0x89);
            TC.actions.setMidiLead(200);
            ok('MIDI output: lead 200 ms set in the panel', TC.midiOut.lead() === 0.2 && document.querySelector('input[data-midilead]').value === '200');
            TC.actions.setMidiLead(0);
            // own kit profile (no drum map from the maker): key view, ▶ plays the key on the MIDI output
            const realSave = TC.kits.save, realPrompt = window.prompt;
            TC.kits.save = () => true;
            window.prompt = () => 'Test-Kit';
            TC.actions.openKits();
            document.querySelector('.kit-dialog [data-k="blank"]').click();
            ok('own kit profile: key view with all 128 keys', document.querySelectorAll('.kit-dialog select[data-keyart]').length === 128);
            sent.length = 0;
            document.querySelector('.kit-dialog [data-k="play"][data-note="38"]').click();
            ok('▶ plays the key on the MIDI output ' + JSON.stringify(sent[0]), sent.length === 2 && sent[0][1] === 38 && sent[0][0] === 0x99);
            const sel = document.querySelector('.kit-dialog select[data-keyart="47"]');
            sel.value = '48';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            ok('key view: key 47 becomes tom 2', TC.kits.list.find((q) => q.name === 'Test-Kit').assign[48].includes(47));
            TC.kits.close();
            TC.kits.list = TC.kits.list.filter((q) => q.name !== 'Test-Kit');
            TC.kits.save = realSave;
            window.prompt = realPrompt;
            const sb = document.getElementById('sound-btn');
            ok('toolbar: sound switch shows MIDI', !sb.hidden && sb.textContent === 'MIDI' && sb.classList.contains('active'));
            sb.click();
            ok('toolbar: click → Tactus sounds', !TC.midiOut.active() && sb.textContent === 'Tactus' && !sb.hidden);
            sb.click();
            return new Promise((r) => setTimeout(r, 50)).then(() => {
              ok('toolbar: click again → the MIDI output chosen last', TC.midiOut.active() && sb.textContent === 'MIDI');
              TC.actions.setMidiOut('');
              ok('MIDI output off: Tactus sounds again', !TC.midiOut.active());
            });
          }).catch((e) => ok('MIDI output: ' + e.message, false));
        }).then(() => {
          S.doc.view.x = 190; TC.refresh();
          const pre = document.createElement('pre');
          pre.style.cssText = 'position:fixed;right:10px;bottom:30px;background:#fff;color:#000;border:2px solid #333;padding:8px;font:12px monospace;z-index:9999';
          pre.textContent = out.join('\n');
          document.body.appendChild(pre);
        });
      }, 700);
    }, 700);
  }, 700);
}, 500);
window.addEventListener('error', (e) => { document.title = 'ERR ' + e.message; const d = document.createElement('pre'); d.style.cssText='position:fixed;top:0;left:0;background:red;color:#fff;z-index:99999'; d.textContent = e.message + ' ' + e.filename + ':' + e.lineno; document.body.appendChild(d); });
