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
    const z = L.staves.find((q) => q.track === (opts.track || TC.curTrack())) || L.staves[0]; // the staff of the track being written
    const wx = TC.render.tickX(b, tick) + (opts.dx || 0), wy = z.dy + TC.render.stepY(line) + (opts.dy || 0);
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
  // the window "Tracks & sound" (tracks, playback): opened when needed, closed after each block
  const W = (sel) => { if (!TC.panel.isSettingsOpen()) TC.actions.openTracks(); return document.querySelector('.settings-dialog ' + sel); };
  const WA = (sel) => { if (!TC.panel.isSettingsOpen()) TC.actions.openTracks(); return document.querySelectorAll('.settings-dialog ' + sel); };
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
  {
    // a note selected: the value buttons change it only, the setting for the next notes stays
    const v9 = S.doc.tracks[0].bars[9].voices[0], last = v9[v9.length - 1], before = JSON.stringify(S.input);
    S.selection = new Set([last.notes[0].id]);
    TC.actions.setValue(32);
    TC.actions.toggleDotted();
    const now = S.doc.tracks[0].bars[9].voices[0].slice(-1)[0];
    ok('selected note: value buttons change it only (dotted 32nd = ' + now.dur + '), the next notes keep theirs', now.dur === 180 && JSON.stringify(S.input) === before);
    TC.actions.undo();
    TC.actions.undo();
    S.selection.clear();
    TC.refresh();
  }
  // copy / paste / simile
  TC.actions.copyBar(5);
  TC.actions.pasteBar(7);
  ok('paste: bar 8 = bar 6', voice(7, 0).join() === voice(5, 0).join());
  TC.actions.toggleSimile(6);
  ok('% bar: flagged and empty', S.doc.tracks[0].bars[6].simile && voice(6, 0).length === 0 && document.querySelector('#score .static').innerHTML.includes(''));
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
  // the playback cursor: inside a bar only its line moves (the bar and the loop frame are not built again every frame)
  TC.render.drawCursor(1, 0, [1, 3]);
  const curEl = document.querySelector('#overlay .play-cursor'), x0c = curEl && curEl.getAttribute('x');
  TC.render.drawCursor(1, 480, [1, 3]);
  const sameEl = document.querySelector('#overlay .play-cursor') === curEl && curEl.getAttribute('x') !== x0c && document.querySelectorAll('#overlay .loop-range').length >= 1;
  TC.render.drawCursor(2, 0, [1, 3]);
  ok('cursor: moved inside the bar (same line, loop frame kept), built again in the next bar', !!curEl && sameEl && document.querySelector('#overlay .play-cursor') !== curEl);
  TC.render.drawCursor(null);
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
  ok('bar menu: time signature of this bar only / notes move along', /Taktart nur für diesen Takt/.test(document.getElementById('context-menu').textContent) && /Noten danach rücken nach/.test(document.getElementById('context-menu').textContent));
  ok('bar panel: "Gilt" choice', !!document.querySelector('#panel-settings select[data-action="setTsMode"]'));
  TC.menu.close();
  ok('panel: repeat controls', !!document.querySelector('#panel-settings select[data-action="setRepeatEnd"]') && !!document.querySelector('#panel-settings select[data-action="setVolta"]'));
  TC.actions.undo(); TC.actions.undo();
  ok('undo: no repeats left', !TC.score.hasRepeats(S.doc));
  // jumps: panel section, signs drawn, warning, the manual
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
  const realOpen = window.open, opened = [];
  window.open = (url, name) => { opened.push(url + ' ' + name); return {}; };
  document.querySelector('#panel-settings [data-action="jumpHelp"]').click();
  document.getElementById('help-btn').click();
  ok('ⓘ jumps and ? in the toolbar open the manual in its own tab ' + opened.join(', '), opened.join() === 'hilfe.html#spruenge tactus-help,hilfe.html tactus-help');
  window.open = realOpen;
  TC.actions.undo(); TC.actions.undo();
  ok('undo: no jumps left', !S.doc.bars.some((b) => b.jump || b.mark));
  // examples: File → Examples, and the links of the manual (index.html?beispiel=…)
  TC.actions.fileMenu();
  ok('File menu: examples', /Beispiele/.test(document.getElementById('context-menu').textContent) && /Sprünge \(D\.S\. al Coda\)/.test(document.getElementById('context-menu').textContent));
  TC.menu.close();
  const keepDoc = S.doc, keepDirty = S.dirty;
  S.dirty = false;
  TC.storage.loadExample('spruenge');
  const po = TC.score.playOrder(S.doc).map((o) => o.bar + 1).join(' ');
  ok('example "jumps": D.S. al Coda played ' + po, po === '1 2 3 4 5 6 7 8 3 4 5 9 10' && TC.score.jumpProblems(S.doc).length === 0);
  S.dirty = false;
  TC.storage.loadExample('wiederholungen');
  const pr = TC.score.playOrder(S.doc).map((o) => o.bar + 1).join(' ');
  ok('example "repeats": endings, %, chorus 3× ' + pr, pr === '1 2 3 4 5 2 3 4 6 7 8 9 10 7 8 9 10 7 8 9 10 11 12 13 14');
  TC.storage.setDoc(keepDoc, 'Untitled.tactus.json'); S.dirty = keepDirty;
  TC.refresh();
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
  ok('strength meter shown while held', !!document.querySelector('#overlay .vel-seg.on'));
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
  ok('frame drawn while dragging', !!document.querySelector('#overlay .sel-frame'));
  mouse('pointerup', at(nb3, 600, 1));
  ok('frame selects the hi-hats at 1 and 1+ ' + S.selection.size, S.selection.size === 2 && !document.querySelector('#overlay .sel-frame'));
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
  // a note selected, another instrument chosen: the note changes - and the next notes (and the lock) get it too
  S.selection = new Set([S.doc.tracks[0].bars[nb3].voices.flat().find((ev) => ev.tick === 960 && ev.notes.some((n) => n.art === 38)).notes.find((n) => n.art === 38).id]);
  TC.actions.setArt(40);
  ok('instrument chosen with a note selected: the note changes, the next notes get it too ' + voice(nb3, 0).join(' '), S.input.art === 40 && voice(nb3, 0).join().includes('960:480:42+40'));
  TC.actions.undo();
  S.selection.clear();
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
  TC.actions.setSimileMode('count');
  ok('… narrow and counted: 2 3 4 5, narrower than a bar with notes ' + [...document.querySelectorAll('#score .simile-n')].map((t) => t.textContent).join(' ') + ' w ' + Math.round(PL().bars[2].w) + '/' + Math.round(PL().bars[1].w), [...document.querySelectorAll('#score .simile-n')].map((t) => t.textContent).join(' ') === '2 3 4 5' &&
    PL().bars[2].w < PL().bars[1].w / 2);
  TC.actions.setSimileMode('single');
  ok('… each one as it is: no numbers', !document.querySelector('#score .simile-n') && !PL().bars[2].multi);
  TC.actions.undo(); TC.actions.undo(); [0, 1, 2, 3].forEach(() => TC.actions.undo());
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
    ok('samples: switched on in the panel, credits shown', S.settings.samples && !!W('input[data-action="toggleSamples"]:checked') &&
      /MuldjordKit/.test(document.querySelector('.settings-dialog').textContent));
    TC.audio.preview(TC.newDrumNote(38, {}));
    ok('samples not loaded yet: a written note still sounds (synth), no error', TC.samples.state() !== 'ready');
    TC.actions.toggleSamples();
    TC.actions.setAudioDelay(150);
    ok('output delay 150 ms: in the panel, the cursor waits for it', W('input[data-audiodelay]').value === '150' && TC.audio.outputDelay() >= 0.15);
    TC.actions.setAudioDelay(0);
    TC.panel.closeSettings();
    // tempo changes listed in the panel: click goes to the bar, ✕ removes the change
    TC.actions.setBarTempo(140, 1);
    const ti = document.querySelector('#panel-settings .tempo-item [data-action="gotoBar"]');
    ok('tempo list: bar 2 ♩ = 140 ' + (ti && ti.textContent), !!ti && /2: ♩ = 140/.test(ti.textContent));
    ti.click();
    ok('tempo list: click selects bar 2', S.selBar === 1);
    document.querySelector('#panel-settings .tempo-item [data-action="clearBarTempo"]').click();
    ok('tempo list: ✕ removes the change', !S.doc.bars[1].tempo && !document.querySelector('#panel-settings .tempo-item'));
    // tracks: add one, write into it, switch back, delete it
    const st = document.getElementById('status-track');
    ok('tracks: one track, listed in "Tracks & sound", nothing in the status bar', WA('.track-item').length === 1 && st.hidden);
    const first = S.doc.tracks[0], before = JSON.stringify(first.bars);
    const savePrompt = window.prompt; window.prompt = () => 'Snare';
    TC.actions.addTrack();
    window.prompt = savePrompt;
    const sn = TC.curTrack();
    ok('tracks: added "Snare", writing into it, status bar shows it', S.doc.tracks.length === 2 && sn.name === 'Snare' && sn !== first &&
      WA('.track-item').length === 2 && !st.hidden && /Snare/.test(st.textContent));
    TC.selectBar(0);
    TC.refresh();
    click(0, 0, 3);
    ok('tracks: a click writes into the new track only', sn.bars[0].voices.flat().length === 1 && JSON.stringify(first.bars) === before);
    ok('tracks: the view shows the new track (one note head)', TC.render.layout.bars[0].voices.flat().filter((it) => it.kind === 'note').length === 1);
    st.click();
    ok('tracks: status bar click goes to the next track', TC.curTrack() === first && /Drums/.test(st.textContent));
    W(`.track-item [data-action="deleteTrack"][data-value="${sn.id}"]`).click();
    ok('tracks: ✕ deletes the track (asked first: it has a note)', S.doc.tracks.length === 1 && st.hidden && JSON.stringify(first.bars) === before);
    TC.actions.undo();
    ok('tracks: undo brings it back with its note', S.doc.tracks.length === 2 && S.doc.tracks[1].bars[0].voices.flat().length === 1);
    TC.actions.undo();
    TC.actions.undo();
    ok('tracks: undo back to one track', S.doc.tracks.length === 1 && TC.curTrack() === S.doc.tracks[0]);
    TC.panel.closeSettings();
    // several staves: a track only for the snare (one line), click into the other staff, hide / show
    const drums = S.doc.tracks[0], drumsBefore = JSON.stringify(drums.bars);
    TC.actions.setArt(38);
    TC.actions.addTrackFor();
    const sn2 = TC.curTrack();
    ok('staves: "+ track for snare": own kit [snare], one line, two staves', sn2.kit.join() === '38' && sn2.oneLine && TC.render.layout.staves.length === 2 &&
      TC.render.layout.staves[1].dy > 0 && TC.render.layout.staves[1].one);
    ok('staves: names above the staves', document.querySelectorAll('#score .staff-name').length === 2);
    click(1, 0, 4);
    ok('staves: a click on the one line writes the snare into its track', sn2.bars[1].voices.flat().map((e) => e.notes[0].art).join() === '38' && JSON.stringify(drums.bars) === drumsBefore);
    ok('staves: its head sits on the middle line of the lower staff', TC.render.layout.heads.some((h) => h.track === sn2 && h.line === 4 && h.dy === TC.render.layout.staves[1].dy));
    const d1 = drums.bars[1].voices.flat().length;
    click(1, 960, 3, { track: drums });
    ok('staves: a click into the upper staff makes it the track being written and writes there ' + [TC.curTrack().name, drums.bars[1].voices.flat().length, sn2.bars[1].voices.flat().length], TC.curTrack() === drums && drums.bars[1].voices.flat().length === d1 + 1 && sn2.bars[1].voices.flat().length === 1);
    TC.actions.toggleTrackHidden(sn2.id);
    ok('staves: hidden track: one staff, still in the score', TC.render.layout.staves.length === 1 && S.doc.tracks.length === 2);
    TC.actions.toggleTrackHidden(drums.id);
    ok('staves: the last visible track cannot be hidden', !drums.hidden);
    TC.actions.toggleTrackHidden(sn2.id);
    ok('staves: shown again', TC.render.layout.staves.length === 2);
    TC.actions.toggleLayout();
    ok('page view: both staves in every line', TC.render.layout.page && TC.render.layout.systems.every((s) => s.above && TC.render.layout.stackH > 8 * TC.render.SP));
    const sysGap = () => { const ss = TC.render.layout.systems; return ss.length > 1 ? ss[1].ty - ss[0].ty : 0; };
    const g100 = sysGap();
    TC.actions.setLineGap(50);
    ok('line spacing 50 %: the lines of the page view move closer (' + [Math.round(sysGap()), Math.round(g100)] + ')', g100 > 0 && sysGap() < g100);
    TC.actions.setLineGap(100);
    const dy100 = TC.render.layout.staves[1].dy;
    TC.actions.setStaffGap(60);
    const dy60 = TC.render.layout.staves[1].dy;
    TC.actions.setStaffGap(160);
    ok('staff spacing 60 % / 160 %: the lower staff moves up / down (' + [dy60, dy100, TC.render.layout.staves[1].dy].map(Math.round) + ')', dy60 < dy100 && TC.render.layout.staves[1].dy > dy100);
    TC.actions.setStaffGap(100);
    TC.actions.toggleLayout();
    for (let k = 0; k < 6; k++) TC.actions.undo();
    ok('staves: undo back to one track (' + S.doc.tracks.length + ')', S.doc.tracks.length === 1 && JSON.stringify(S.doc.tracks[0].bars) === drumsBefore);
    // tracks and MIDI: mute / solo in the panel, the export dialog, the sound rows of a track
    TC.actions.setArt(38);
    TC.actions.addTrackFor();
    const sn3 = TC.curTrack();
    const msBtn = (a) => W(`.track-item [data-action="${a}"][data-value="${sn3.id}"]`);
    msBtn('toggleMute').click();
    ok('M: the track is muted, the button lit, not in the playback', sn3.mute && msBtn('toggleMute').classList.contains('active') &&
      !TC.timeline.build(S.doc).hits.some((h) => h.trk === sn3));
    msBtn('toggleSolo').click();
    ok('S: solo, the button lit', sn3.solo && msBtn('toggleSolo').classList.contains('active'));
    ok('the track being written: a kit profile row', !!W('select[data-action="setTrackProfile"]'));
    TC.panel.closeSettings();
    TC.actions.exportMidiCurrent();
    const exd = document.querySelector('.midi-export-backdrop');
    ok('Ctrl+E with two tracks: the export dialog, a row each, one file per track', !!exd && exd.querySelectorAll('.export-row').length === 2 &&
      exd.querySelector('select[data-k="mode"]').value === 'files' && /2/.test(exd.querySelector('[data-k="ok"]').textContent));
    const cb = exd.querySelector('input[data-k="on"]');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    ok('one track unticked: its drum map greyed, "Export" one file', exd.querySelector('select[data-k="target"]').disabled && !/2/.test(exd.querySelector('[data-k="ok"]').textContent));
    exd.querySelector('[data-k="close"]').click();
    ok('export dialog: closed', !document.querySelector('.midi-export-backdrop'));
    TC.actions.undo(); TC.actions.undo(); TC.actions.undo();
    ok('tracks and MIDI: undo back to one track', S.doc.tracks.length === 1);
    // following the playback smoothly: the view glides part of the way, not all at once
    const vw = S.doc.view, vx0 = vw.x;
    TC.player.keepInView({ x: 3000, y: 0 }, true);
    const vx1 = vw.x;
    TC.player.keepInView({ x: 3000, y: 0 }, false);
    ok('follow smooth: a part of the way; jumping: all of it (' + [vx0, vx1, vw.x].map(Math.round) + ')', vx1 < vx0 && vw.x < vx1);
    vw.x = vx0;
    TC.render.applyView();
    // stage view: only the pages; Page Down, a tap at the side and MIDI (gotoPage) turn; nothing is written
    TC.score.insertBars(S.doc, S.doc.bars.length, 40);
    TC.commit();
    const wasEndless = !TC.render.isPage();
    const keepLayout = TC.render.layout;
    const pob = TC.render.pagesOfBars();
    ok('pages of the bars (' + (Math.max(...pob) + 1) + ' pages), the view stays as it is', pob.length === S.doc.bars.length && Math.max(...pob) >= 2 && TC.render.layout === keepLayout);
    TC.actions.togglePerform();
    const pbar = document.getElementById('perform-bar');
    ok('stage view: page view, toolbar hidden, "1 / n" (' + (pbar && pbar.textContent) + ')', document.body.classList.contains('perform') && TC.render.isPage() &&
      getComputedStyle(document.getElementById('toolbar')).display === 'none' && /^‹1 \//.test(pbar.textContent) && TC.actions.currentPage() === 0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    ok('Page Down: page 2', TC.actions.currentPage() === 1);
    const notesBefore = JSON.stringify(S.doc.tracks);
    const vr = vp.getBoundingClientRect(), tap = (x) => {
      const init = { clientX: vr.left + vr.width * x, clientY: vr.top + vr.height / 2, button: 0, buttons: 1, bubbles: true, pointerId: 3, pointerType: 'touch', isPrimary: true };
      vp.dispatchEvent(new PointerEvent('pointerdown', init));
      vp.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, init, { buttons: 0 })));
    };
    tap(0.9);
    ok('a tap in the right third: page 3, no note written', TC.actions.currentPage() === 2 && JSON.stringify(S.doc.tracks) === notesBefore);
    tap(0.1);
    ok('a tap in the left third: page 2 again', TC.actions.currentPage() === 1);
    TC.actions.gotoPage(0);
    ok('MIDI "page 1" (gotoPage): the first page', TC.actions.currentPage() === 0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('Esc: the stage view ends, the bar goes', !document.body.classList.contains('perform') && !document.getElementById('perform-bar'));
    if (wasEndless) TC.actions.layout('endless');
    TC.actions.undo();
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
          const sent2 = [], port2 = { name: 'Test Port 2', send: (m) => sent2.push(Array.from(m)), clear: () => sent2.push('clear') };
          Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve({ outputs: new Map([['p', port], ['q', port2]]) }) });
          return TC.midiOut.init().then(() => {
            // every track its own output (one VST per instrument): chosen in the playback list or at the track
            const dr = S.doc.tracks.find((t) => t.kind === 'drums');
            TC.actions.selectTrack(dr.id);
            TC.actions.openTracks();
            TC.panel.update(true);
            ok('MIDI output: the track lists the outputs ("Plays on")', !!document.querySelector('select[data-action="setTrackMidiOut"] option[value="Test Port"]') && !TC.midiOut.active());
            TC.actions.setTrackMidiOut('Test Port');
            TC.panel.update(true);
            ok('MIDI output: the drum track plays there (its track settings show it)', dr.midiOut === 'Test Port' && TC.midiOut.active() &&
              [...document.querySelectorAll('select[data-action="setTrackMidiOut"] option')].some((o) => o.value === 'Test Port' && o.selected));
            sent.length = 0;
            const testBtn = W('[data-action="testTrackOut"]');
            const test = TC.midiOut.test(dr);
            ok('MIDI output: ▶ test at the track - the snare on channel 10 at once ' + JSON.stringify(sent), !!testBtn && !!test && sent.length === 2 && sent[0].join() === [0x99, 38, 100].join());
            sent.length = 0;
            TC.audio.preview(TC.newDrumNote(38, { accent: 1 }));
            const noteMsgs = sent.filter((m) => (m[0] & 0xf0) !== 0xb0); // (the fader: CC 7 once before)
            ok('MIDI output: a written note goes to the port (General MIDI: channel 10, 38, accent 127) ' + JSON.stringify(sent),
              noteMsgs.length === 2 && noteMsgs[0].join() === [0x99, 38, 127].join() && noteMsgs[1][0] === 0x89);
            dr.volume = 64;
            sent.length = 0;
            TC.audio.preview(TC.newDrumNote(38, {}));
            ok('MIDI output: the fader of a drum track (64) - softer strength, no CC 7 (drum VSTs ignore it) ' + JSON.stringify(sent), sent.length === 2 && sent[0][2] === Math.round(0.72 * 0.64 * 127));
            dr.volume = 100;
            TC.actions.setMidiLead(200);
            ok('MIDI output: lead 200 ms set in the panel', TC.midiOut.lead() === 0.2 && document.querySelector('input[data-midilead]').value === '200');
            // two outputs: a melody track on its own (Test Port 2), the drums on theirs, a track without one: Tactus' sounds
            const mt2 = TC.score.addTrack(S.doc, 'Synth', null, 'pitched');
            mt2.midiOut = 'Test Port 2';
            const plain = TC.score.addTrack(S.doc, 'Shaker', null, 'drums');
            sent.length = 0; sent2.length = 0;
            TC.audio.tone(60, 0.1, 0.3, 0.7, null, mt2);
            TC.audio.hit(38, 0.1, 0.7, false, null, dr);
            TC.audio.hit(42, 0.1, 0.7, false, null, plain);
            ok('MIDI output: melody on its output, drums on theirs, a track without one not on MIDI ' + JSON.stringify(sent2) + ' ' + JSON.stringify(sent),
              sent2.some((m) => m[0] === 0x90 && m[1] === 60) && sent.some((m) => m[1] === 38) && !sent.some((m) => m[1] === 60 || m[1] === 42));
            // stopped while a note (a held keyswitch) still sounds: a real release for it, not only "all notes off"
            sent2.length = 0;
            TC.midiOut.note(64, 0, 10, 0.8, null, mt2);
            TC.midiOut.stop();
            const ci = sent2.indexOf('clear');
            ok('MIDI output: on stop a held note gets a real note off ' + JSON.stringify(sent2), ci >= 0 && sent2.slice(ci).some((m) => Array.isArray(m) && m[0] === 0x80 && m[1] === 64));
            S.doc.tracks = S.doc.tracks.filter((t) => t !== mt2 && t !== plain);
            TC.actions.setMidiLead(0);
            TC.panel.closeSettings();
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
            document.querySelector('.kit-dialog [data-k="template"]').click();
            const tm = [...document.querySelectorAll('#context-menu .menu-label')].find((x) => x.textContent === 'MT Power Drum Kit 2');
            ok('templates: menu with MT Power Drum Kit 2', !!tm);
            tm.closest('[data-path]').click();
            ok('template chosen: a new profile with its keys, shown in the dialog', TC.kits.list.some((q) => q.template === 'mt-power-drum-kit-2' && q.assign[44][0] === 65) &&
              document.querySelector('.kit-dialog select[data-k="pick"]').selectedOptions[0].textContent === 'MT Power Drum Kit 2');
            TC.kits.list = TC.kits.list.filter((q) => q.template !== 'mt-power-drum-kit-2');
            TC.kits.close();
            TC.kits.list = TC.kits.list.filter((q) => q.name !== 'Test-Kit');
            TC.kits.save = realSave;
            window.prompt = realPrompt;
            const sb = document.getElementById('sound-btn');
            ok('toolbar: sound switch shows MIDI', !sb.hidden && sb.textContent === 'MIDI' && sb.classList.contains('active'));
            sb.click();
            ok('toolbar: click → MIDI off, Tactus sounds (the output of the track stays)', !TC.midiOut.active() && sb.textContent === 'Tactus' && !sb.hidden && dr.midiOut === 'Test Port');
            sb.click();
            return new Promise((r) => setTimeout(r, 50)).then(() => {
              ok('toolbar: click again → MIDI on', TC.midiOut.active() && sb.textContent === 'MIDI');
              TC.actions.setTrackMidiOut('', dr);
              ok('track back on Tactus sounds: nothing on MIDI, the switch goes', !TC.midiOut.active() && document.getElementById('sound-btn').hidden);
            });
          }).catch((e) => ok('MIDI output: ' + e.message, false));
        }).then(() => {
          // chord symbols: a tap in the chord bar of the panel, typed, shown above the staff, removed (undo restores)
          TC.selectBar(0);
          TC.panel.update(true);
          const cb = document.querySelector('#panel-settings .chord-btn');
          if (cb) cb.click();
          ok('chords: the chord bar of the panel sets a chord above bar 1', !!cb && !!S.doc.bars[0].chords && !!document.querySelector('.chord-sym'));
          TC.actions.typeChord('F#m7/C#', 0, 0);
          ok('chords: a typed chord is shown', [...document.querySelectorAll('.chord-sym')].some((e) => e.textContent === 'F♯m7/C♯'));
          TC.actions.clearBarChords(0);
          ok('chords: removed', !S.doc.bars[0].chords && !document.querySelector('.chord-sym'));
          // dynamics: the notes are the help to find the place - p at a tapped note, a hairpin from the first selected note to
          // the target note (its start or its end), signs and hairpins tapped in the score and changed in the panel
          const undoDyn = TC.history.undoStack.length, dt = TC.curTrack();
          const evs0 = dt.bars[0].voices.flat().filter((ev) => ev.notes.length).sort((a, b) => a.tick - b.tick);
          const ticks0 = [...new Set(evs0.map((ev) => ev.tick))];
          const evAt = (tk) => evs0.find((ev) => ev.tick === tk);
          TC.selectBar(0);
          S.selection = new Set([evAt(ticks0[0]).notes[0].id]);
          TC.panel.update(true);
          const pBtn = document.querySelector('#panel-notes [data-action="setDyn"][data-value="p"]'); // (the note panel)
          if (pBtn) pBtn.click();
          ok('dynamics: p at the tapped note - in the track, drawn under the staff', !!pBtn && JSON.stringify(dt.bars[0].dyn) === JSON.stringify([{ t: ticks0[0], v: 'p' }]) && !!document.querySelector('.score .mus.dyn'));
          ok('dynamics: no beats to choose any more in the panel', !document.querySelector('#panel-notes .chord-slots [data-action="setChordSlot"]') || !/Dynami/.test(document.querySelector('#panel-notes .chord-slots').closest('section').textContent));
          // a hairpin: the first note, then the target note (Shift) - up to its start (the target note has the new level)
          const k2 = ticks0[Math.min(2, ticks0.length - 1)];
          S.selection = new Set([evAt(ticks0[0]).notes[0].id, evAt(k2).notes[0].id]);
          TC.panel.update(true);
          const selIn = (a, v) => { const el = document.querySelector(`#panel-notes select[data-action="${a}"]`); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
          selIn('setWedgeTo', 'f');
          document.querySelector('#panel-notes [data-action="makeWedge"]').click();
          const wd0 = (dt.bars[0].dyn || []).find((d) => d.w);
          ok('dynamics: hairpin "p < f" from the first selected note up to the start of the target note ' + JSON.stringify(dt.bars[0].dyn),
            !!wd0 && wd0.t === ticks0[0] && wd0.len === k2 - ticks0[0] && wd0.to === 'f' && TC.score.levelAt(S.doc, dt, 0, k2) === 5 && document.querySelectorAll('.score .hairpin').length === 2);
          // tapped in the score: selected (coloured), the panel shows it on top; the switch: up to the end of the target note
          const hitRect = document.querySelector('.score .dyn-hit');
          if (hitRect) hitRect.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 7, pointerType: 'mouse', clientX: 1, clientY: 1 }));
          ok('dynamics: the hairpin tapped in the score - selected, its section on top of the panel', !!hitRect && !!S.dynSel && S.dynSel.w && document.querySelectorAll('.score .hairpin.sel').length === 2 &&
            !!document.querySelector('#panel-notes section.has-sel [data-action="setWedgeToEnd"]'));
          const endBtn = document.querySelector('#panel-notes [data-action="setWedgeToEnd"][data-value="1"]');
          if (endBtn) endBtn.click();
          const k2end = Math.min(TC.barTicks(S.doc.bars[0].ts), k2 + evAt(k2).dur);
          ok('dynamics: switched to the end of the target note ' + JSON.stringify(dt.bars[0].dyn), (dt.bars[0].dyn || []).some((d) => d.w && d.len === k2end - ticks0[0]));
          selIn('setWedgeTo', 'ff');
          ok('dynamics: its end level changed in the panel', (dt.bars[0].dyn || []).some((d) => d.w && d.to === 'ff'));
          // its handles dragged: they snap to the notes - the start (the p at it goes along), then the end; each undone
          const dragHandle = (h, tick, css) => {
            const el = document.querySelector(css || `#score .dyn-handle[data-dynh="${h}"]`);
            if (!el) return false;
            const r0 = el.getBoundingClientRect(), y = r0.top + r0.height / 2, vr = vp.getBoundingClientRect(), v = S.doc.view;
            const x = vr.left + v.x + TC.render.tickX(TC.render.layout.bars[0], tick) * v.zoom;
            const ev = (type, cx) => new PointerEvent(type, { clientX: cx, clientY: y, button: 0, buttons: 1, bubbles: true, pointerId: 9, pointerType: 'mouse' });
            el.dispatchEvent(ev('pointerdown', r0.left + r0.width / 2));
            vp.dispatchEvent(ev('pointermove', x));
            const shown = !!document.querySelector('#overlay .dyn-drag');
            vp.dispatchEvent(ev('pointerup', x));
            return shown;
          };
          const wEnd = ticks0[0] + (dt.bars[0].dyn.find((d) => d.w) || {}).len;
          const shownS = dragHandle('s', ticks0[1]);
          const ws = (dt.bars[0].dyn || []).find((d) => d.w);
          ok('dynamics: the start handle dragged to the 2nd note - the hairpin starts there, its end stays, the p went along ' + JSON.stringify(dt.bars[0].dyn),
            shownS && !!ws && ws.t === ticks0[1] && ws.t + ws.len === wEnd && (dt.bars[0].dyn || []).some((d) => d.v === 'p' && d.t === ticks0[1]) && !!S.dynSel && S.dynSel.t === ticks0[1]);
          dragHandle('s', ticks0[0]);
          ok('dynamics: … dragged back - as before, the p too', (dt.bars[0].dyn || []).some((d) => d.w && d.t === ticks0[0] && ticks0[0] + d.len === wEnd) && (dt.bars[0].dyn || []).some((d) => d.v === 'p' && d.t === ticks0[0]));
          dragHandle('e', ticks0[1]);
          ok('dynamics: the end handle dragged to the 2nd note ' + JSON.stringify(dt.bars[0].dyn), (dt.bars[0].dyn || []).some((d) => d.w && d.t === ticks0[0] && d.len === ticks0[1] - ticks0[0]));
          dragHandle('e', wEnd >= TC.barTicks(S.doc.bars[0].ts) ? TC.barTicks(S.doc.bars[0].ts) : wEnd);
          ok('dynamics: … and back to where it ended ' + JSON.stringify(dt.bars[0].dyn), (dt.bars[0].dyn || []).some((d) => d.w && d.t === ticks0[0] && ticks0[0] + d.len === wEnd));
          TC.actions.selectDyn(dt.id, 0, ticks0[0], 'w');
          // a sign tapped: another level
          const sign = document.querySelector('.score .mus.dyn[data-dyn$="|v"]');
          if (sign) sign.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 8, pointerType: 'mouse', clientX: 1, clientY: 1 }));
          const mpBtn = document.querySelector('#panel-notes section.has-sel [data-action="setDyn"][data-value="mp"]');
          if (mpBtn) mpBtn.click();
          ok('dynamics: the p tapped in the score becomes mp from the panel', !!sign && !!mpBtn && (dt.bars[0].dyn || []).some((d) => d.v === 'mp' && d.t === ticks0[0]));
          dragHandle('v', ticks0[1], '#score .mus.dyn.sel[data-dynh="v"]');
          ok('dynamics: the selected mp dragged to the 2nd note - it stands there, the hairpin stays ' + JSON.stringify(dt.bars[0].dyn),
            (dt.bars[0].dyn || []).some((d) => d.v === 'mp' && d.t === ticks0[1]) && !(dt.bars[0].dyn || []).some((d) => d.v && d.t === ticks0[0]) && (dt.bars[0].dyn || []).some((d) => d.w && d.t === ticks0[0]));
          dragHandle('v', ticks0[0], '#score .mus.dyn.sel[data-dynh="v"]');
          ok('dynamics: … and back', (dt.bars[0].dyn || []).some((d) => d.v === 'mp' && d.t === ticks0[0]));
          TC.actions.selectNone();
          ok('dynamics: the notes stay as written', dt.bars[0].voices.flat().every((ev) => ev.notes.every((n) => !n.ghost || n.ghost === true)));
          S.selection = new Set([evAt(ticks0[0]).notes[0].id]);
          TC.actions.setDyn('mp');
          ok('dynamics: mp once more - it goes, the hairpin stays', JSON.stringify(dt.bars[0].dyn.map((d) => d.w || d.v)) === '["cresc"]');
          TC.actions.toggleDynAll();
          TC.actions.setDyn('ff');
          ok('dynamics: "for all tracks" - every track gets it', S.doc.tracks.every((t) => (t.bars[0].dyn || []).some((d) => d.v === 'ff')));
          TC.actions.toggleDynAll();
          W('input[data-trackvol]').value = '64';
          W('input[data-trackvol]').dispatchEvent(new Event('change', { bubbles: true }));
          ok('fader: the track volume set in "Tracks & sound"', TC.curTrack().volume === 64);
          TC.panel.closeSettings();
          while (TC.history.undoStack.length > undoDyn) TC.actions.undo();
          ok('dynamics and fader: undone', S.doc.tracks.every((t) => t.bars.every((b) => !b.dyn) && t.volume === 100));
          // melody in two voices: voice 2 chosen in the panel, a tap writes there (stems down), the voice 1 note stays
          TC.actions.addMelody();
          const mt = S.doc.tracks.find((t) => t.kind === 'pitched');
          TC.actions.selectTrack(mt.id);
          TC.actions.setTool && TC.actions.setTool('write');
          S.selection.clear(); TC.panel.update(true);
          click(2, 0, 6, { track: mt });
          S.selection.clear(); TC.panel.update(true);
          const v2 = document.querySelector('#panel-notes [data-action="setMelodyVoice"][data-value="1"]');
          if (v2) v2.click();
          click(2, 0, 9, { track: mt });
          ok('melody: voice 2 from the panel, a tap writes there ' + mt.bars[2].voices.map((v) => v.length).join('/'), !!v2 && mt.bars[2].voices[0].length === 1 && (mt.bars[2].voices[1] || []).length === 1);
          TC.actions.setMelodyVoice(0);
          // lyrics: typed into the field under the notes - Space / "-" move on, pasted text spreads, one undo step
          [0, 960, 1920, 2880].forEach((t) => click(3, t, 7, { track: mt }));
          S.selection.clear();
          const undoBefore = TC.history.undoStack.length;
          TC.actions.startLyrics();
          const lf = () => document.querySelector('.lyric-edit');
          const type = (s) => { lf().value = s; lf().dispatchEvent(new Event('input')); };
          ok('lyrics: Ctrl+L / panel opens the field under the first note', !!lf() && S.lyricEdit && S.lyricEdit.ev === mt.bars[2].voices[0][0]);
          type('Hal-');
          ok('lyrics: "-" moves on to the next note', S.lyricEdit && S.lyricEdit.ev !== mt.bars[2].voices[0][0] && lf().value === '');
          type('lo Welt, wie geht');
          const syl = TC.score.lyricSlots(S.doc, mt).map((s) => TC.score.lyricOf(s.ev, 0));
          ok('lyrics: typed / pasted text spreads over the notes ' + syl.join('|'), syl.slice(0, 4).join('|') === 'Hal-|lo|Welt,|wie' && lf().value === 'geht');
          lf().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          const drawn = [...document.querySelectorAll('.score .lyric')].map((e) => e.textContent).join(' ');
          ok('lyrics: Enter closes, drawn under the notes ' + drawn, !lf() && !S.lyricEdit && /Hal - lo Welt, wie geht/.test(drawn));
          ok('lyrics: one undo step', TC.history.undoStack.length === undoBefore + 1);
          TC.actions.toggleLyrics();
          ok('lyrics: hidden - nothing drawn, no room taken (bar width, row)', !document.querySelector('.score .lyric') && !TC.render.layout.lyrInfo.size &&
            !TC.render.layout.staves.some((z) => z.lyrRows) && S.doc.page.lyrics === false && TC.score.lyricVerses(S.doc.tracks.find((t) => t.id === mt.id)) === 1);
          TC.actions.startLyrics();
          ok('lyrics: hidden, but shown while typing', !!lf() && !!document.querySelector('.score .lyric'));
          lf().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          ok('lyrics: hidden again after typing', !lf() && !document.querySelector('.score .lyric'));
          TC.actions.toggleLyrics();
          ok('lyrics: shown again', S.doc.page.lyrics !== false && !!document.querySelector('.score .lyric'));
          TC.actions.undo();
          ok('lyrics: undone at once', TC.score.lyricVerses(S.doc.tracks.find((t) => t.id === mt.id)) === 0);
          // only chord tones (chords locked): a note dragged up / down lands on a chord tone, as a tap writes it
          const undoChord = TC.history.undoStack.length;
          TC.actions.typeChord('C', 3, 0);
          TC.actions.setGuide('lock', 3);
          TC.actions.setTool('select');
          const mat = (bar, tick, line) => { const [x, y] = at(bar, tick, line), z = TC.render.layout.staves.find((q) => q.track.id === mt.id); return [x, y + z.dy * S.doc.view.zoom]; };
          const pitch0 = () => S.doc.tracks.find((t) => t.id === mt.id).bars[3].voices[0][0].notes[0].pitch;
          const startPitch = pitch0(), got = [];
          [1, 2, 3, -1, -2].forEach((k) => {
            S.selection.clear();
            mouse('pointerdown', mat(3, 0, 7));
            mouse('pointermove', mat(3, 0, 7 - k / 2));
            mouse('pointermove', mat(3, 0, 7 - k));
            mouse('pointerup', mat(3, 0, 7 - k));
            got.push(pitch0());
            if (pitch0() !== startPitch) TC.actions.undo();
          });
          ok('chords locked: dragged up / down onto chord tones only ' + got.join(' '), got.every((p) => [0, 4, 7].includes(p % 12)) && new Set(got).size >= 3);
          S.selection.clear();
          mouse('pointerdown', mat(3, 960, 7));
          mouse('pointermove', mat(3, 1440, 7));
          mouse('pointerup', mat(3, 1440, 7));
          ok('chords locked: moved sideways only, the tone stays', S.doc.tracks.find((t) => t.id === mt.id).bars[3].voices[0].some((ev) => ev.tick === 1440 && ev.notes[0].pitch === 65));
          S.selection = new Set([S.doc.tracks.find((t) => t.id === mt.id).bars[3].voices[0][0].notes[0].id]);
          const keys = [];
          ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown'].forEach((key) => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
            keys.push(pitch0());
          });
          ok('chords locked: ↑ ↓ go from chord tone to chord tone (from F: G C G E C) ' + keys.join(' '), keys.join() === '67,72,67,64,60');
          TC.actions.setTool('write');
          while (TC.history.undoStack.length > undoChord) TC.actions.undo();
          // piano: "+ Piano" in the panel - two staves with a brace, one entry in the list; a tap into the lower staff writes the left hand
          const undoPiano = TC.history.undoStack.length;
          S.selection.clear(); TC.panel.update(true);
          const pb = W('[data-action="addPiano"]');
          if (pb) pb.click();
          const pianoListed = [...WA('.track-item [data-action="selectTrack"]')].map((b) => b.dataset.value);
          TC.panel.closeSettings();
          const pf = TC.curTrack(), plh = TC.score.leftHand(S.doc, pf);
          ok('piano: added from the panel - two staves (treble, bass), a brace, one entry in the track list',
            !!pb && !!plh && pf.clef === 'treble' && plh.clef === 'bass' && !!document.querySelector('.score .brace') &&
            pianoListed.includes(pf.id) && !pianoListed.includes(plh.id));
          click(1, 0, 3, { track: plh });
          ok('piano: a tap into the lower staff writes the left hand', TC.curTrack() === plh && plh.bars[1].voices[0].length === 1 && pf.bars[1].voices[0].length === 0);
          click(1, 0, 3, { track: pf });
          ok('piano: … into the upper staff the right hand', TC.curTrack() === pf && pf.bars[1].voices[0].length === 1);
          const lowPitch = plh.bars[1].voices[0][0].notes[0].pitch, highPitch = pf.bars[1].voices[0][0].notes[0].pitch;
          ok('piano: the same place on the staff is lower in the bass clef ' + highPitch + ' / ' + lowPitch, highPitch - lowPitch > 12);
          TC.actions.toggleMute(pf.id);
          ok('piano: mute holds for both hands', pf.mute && plh.mute);
          TC.actions.toggleMute(pf.id);
          TC.actions.selectTrack(plh.id);
          TC.actions.togglePiano();
          ok('piano: one staff again - the left hand is gone (asked: it had a note), no brace, writing the upper staff',
            !S.doc.tracks.includes(plh) && !TC.score.isPiano(S.doc, pf) && !document.querySelector('.score .brace') && TC.curTrack() === pf);
          TC.actions.togglePiano();
          ok('piano: on again - one left hand, empty', S.doc.tracks.filter((t) => t.lh).length === 1 && TC.score.leftHand(S.doc, pf).bars.every((b) => !b.voices.flat().length));
          while (TC.history.undoStack.length > undoPiano) TC.actions.undo();
          ok('piano: undone', !S.doc.tracks.some((t) => t.lh) && S.doc.tracks.every((t) => t.name !== pf.name));
          // chords written like notes: a guitar track, a chord in bar 1, "↓" in the note panel, a tap - the grip struck down
          const undoAcc = TC.history.undoStack.length;
          const gtr = TC.score.addTrack(S.doc, 'Gitarre', null, 'pitched');
          gtr.program = 25;
          gtr.inst = 'guitar';
          TC.score.setChord(S.doc, 0, 0, { name: 'C' });
          TC.commit();
          TC.actions.selectTrack(gtr.id);
          S.selection.clear();
          TC.selectBar(0);
          TC.refresh();
          const modeBtn = document.querySelector('#panel-notes [data-action="setChordMode"][data-value="d"]');
          if (modeBtn) modeBtn.click();
          click(0, 0, 4, { track: gtr });
          const gev = gtr.bars[0].voices[0];
          ok('chords: "↓" in the note panel, a tap - the C grip struck down, drawn ⊓ ' + (gev[0] ? gev[0].notes.map((n) => n.pitch).join(',') : '-'),
            !!modeBtn && gev.length === 1 && gev[0].notes.map((n) => n.pitch).sort((a, b) => a - b).join() === '48,52,55,60,64' &&
            gev[0].notes.every((n) => n.stroke === 'd' && n.chordNote) && [...document.querySelectorAll('.score text.mus')].some((x) => x.textContent === ''));
          S.selection = new Set([gev[0].notes[0].id]);
          TC.refresh();
          const upBtn = document.querySelector('#panel-notes [data-action="setStroke"][data-value="u"]');
          if (upBtn) upBtn.click();
          ok('chords: the selected chord - its stroke ↑ in the panel', !!upBtn && gev[0].notes.every((n) => n.stroke === 'u'));
          S.selection.clear();
          TC.refresh();
          // held (Ctrl) and moved down: a down stroke - its tones stay
          const gh = TC.render.headsInView().find((h) => h.track && h.track.id === gtr.id), vw = S.doc.view, vr = vp.getBoundingClientRect();
          const [hx, hy] = [vr.left + vw.x + gh.wx * vw.zoom, vr.top + vw.y + gh.wy * vw.zoom];
          mouse('pointerdown', [hx, hy], { ctrlKey: true });
          mouse('pointermove', [hx, hy + 20], { ctrlKey: true });
          mouse('pointermove', [hx, hy + 45], { ctrlKey: true });
          mouse('pointerup', [hx, hy + 45], { ctrlKey: true });
          ok('chords: a chord held and moved down - a down stroke, the tones stay', gev[0].notes.every((n) => n.stroke === 'd') && gev[0].notes.map((n) => n.pitch).sort((a, b) => a - b).join() === '48,52,55,60,64');
          // dragged (no hold): the whole chord moves - all its tones to beat 3
          S.selection.clear();
          TC.refresh();
          const gh2 = TC.render.headsInView().find((h) => h.track && h.track.id === gtr.id), sx3 = vr.left + vw.x + (TC.render.tickX(TC.render.layout.bars[0], 1920) + (gh2.wx - TC.render.tickX(TC.render.layout.bars[0], 0))) * vw.zoom, sy3 = vr.top + vw.y + gh2.wy * vw.zoom;
          mouse('pointerdown', [vr.left + vw.x + gh2.wx * vw.zoom, sy3]);
          mouse('pointermove', [sx3 - 20, sy3]);
          mouse('pointermove', [sx3, sy3]);
          mouse('pointerup', [sx3, sy3]);
          const movedEv = gtr.bars[0].voices[0].find((e) => e.tick === 1920);
          ok('chords: a chord dragged - all its tones move to beat 3 ' + gtr.bars[0].voices[0].map((e) => e.tick + ':' + e.notes.length).join(' '), !!movedEv && movedEv.notes.length === 5 && !gtr.bars[0].voices[0].some((e) => e.tick === 0));
          const G = () => S.doc.tracks.find((t) => t.id === gtr.id); // (dragging a length rebuilds the tracks: look the track up again)
          // held (Ctrl) and dragged sideways: the whole chord longer - to the end of the bar
          const sx4 = vr.left + vw.x + (TC.render.tickX(TC.render.layout.bars[0], 3360) + (gh2.wx - TC.render.tickX(TC.render.layout.bars[0], 0))) * vw.zoom;
          mouse('pointerdown', [sx3, sy3], { ctrlKey: true });
          mouse('pointermove', [sx3 + 25, sy3], { ctrlKey: true });
          mouse('pointermove', [sx4, sy3], { ctrlKey: true });
          const lenMode = S.drag ? S.drag.mode : 'none';
          mouse('pointerup', [sx4, sy3], { ctrlKey: true });
          const longEv = G().bars[0].voices[0].find((e) => e.tick === 1920);
          ok('chords: held and dragged sideways - the whole chord longer (' + (longEv && longEv.dur) + ' ' + lenMode + ')', !!longEv && longEv.notes.length === 5 && longEv.dur > 480);
          S.selection.clear();
          TC.actions.setChordMode('d');
          TC.refresh();
          const pwBtn = document.querySelector('#panel-notes [data-action="setChordSize"][data-value="5"]');
          if (pwBtn) pwBtn.click();
          click(0, 2880, 4, { track: G() });
          const pwEv = G().bars[0].voices[0].find((e) => e.tick === 2880);
          ok('chords: "Power" in the panel - root, fifth, octave on the A string (C3 G3 C4)', !!pwBtn && !!pwEv && pwEv.notes.map((x) => x.pitch).sort((a, b) => a - b).join() === '48,55,60');
          TC.actions.setChordSize('');
          // a grid of its own: quarter chords on the second sixteenth
          TC.actions.setValue(4);
          TC.refresh();
          const gsel = document.querySelector('#panel-notes select[data-action="setGrid"]');
          if (gsel) { gsel.value = '16'; gsel.dispatchEvent(new Event('change', { bubbles: true })); }
          TC.actions.setChordMode('n');
          click(1, 240, 4, { track: G() });
          const g16 = G().bars[1].voices[0].find((e) => e.tick === 240);
          ok('grid 1/16 (note panel) with quarters: a chord on the second sixteenth, a quarter long', !!gsel && !!g16 && g16.dur === 960);
          TC.actions.setGrid('');
          TC.actions.setValue(8);
          TC.actions.setChordMode('');
          TC.score.setChord(S.doc, 1, 0, null);
          ok('chords: no chord symbol there - nothing written, said', (() => { TC.actions.setChordMode('n'); const before = G().bars[1].voices[0].length; click(1, 0, 4, { track: G() }); TC.actions.setChordMode(''); return G().bars[1].voices[0].length === before || !!TC.score.chordAt(S.doc, 1, 0); })());
          while (TC.history.undoStack.length > undoAcc) TC.actions.undo();
          ok('chords: undone', !S.doc.tracks.some((t) => t.name === 'Gitarre') && !S.doc.bars[0].chords);
          // the instrument (Tracks & sound): "Bass" - a bass sound and the bass clef suggested, a tapped chord: one tone
          const undoInst = TC.history.undoStack.length, bt = TC.score.addTrack(S.doc, 'Bass', null, 'pitched');
          TC.score.setChord(S.doc, 0, 0, { name: 'C' });
          TC.commit();
          TC.actions.selectTrack(bt.id);
          const instSel = W('select[data-action="setTrackInstrument"]');
          if (instSel) { instSel.value = 'bass'; instSel.dispatchEvent(new Event('change', { bubbles: true })); }
          TC.panel.closeSettings();
          ok('instrument: Bass chosen - a bass sound and the bass clef suggested', !!instSel && bt.inst === 'bass' && bt.program === 33 && bt.clef === 'bass');
          TC.actions.setChordMode('n');
          TC.selectBar(0);
          TC.refresh();
          click(0, 0, 6, { track: bt });
          ok('instrument: a chord tapped on a bass - one tone, the root', bt.bars[0].voices[0].length === 1 && bt.bars[0].voices[0][0].notes.length === 1 && bt.bars[0].voices[0][0].notes[0].pitch % 12 === 0);
          TC.actions.setChordMode('');
          while (TC.history.undoStack.length > undoInst) TC.actions.undo();
          // keyswitches: UJAM Iron 2 chosen at the track (Tracks & sound), P.M. set in the note panel - drawn above the staff
          const undoKs = TC.history.undoStack.length, it = TC.score.addTrack(S.doc, 'Iron', null, 'pitched');
          TC.commit();
          TC.actions.selectTrack(it.id);
          const kswSel = W('select[data-action="setTrackKsw"]');
          if (kswSel) { kswSel.value = 'ujam-iron2'; kswSel.dispatchEvent(new Event('change', { bubbles: true })); }
          ok('keyswitches: the Iron profile at the track, its keys listed with ▶', !!kswSel && !!it.ksw && WA('[data-action="testKsw"]').length === it.ksw.keys.length);
          TC.panel.closeSettings();
          TC.selectBar(0);
          S.chordSlot = 0;
          TC.refresh();
          const pmBtn = document.querySelector('#panel-notes [data-action="setKs"][data-value="muted"]');
          if (pmBtn) pmBtn.click();
          ok('keyswitches: P.M. from the note panel - in the bar, written above the staff with its line', !!pmBtn && JSON.stringify(it.bars[0].ks) === '[{"t":0,"k":"muted"}]' &&
            [...document.querySelectorAll('.score .ks-mark')].some((x) => x.textContent === 'P.M.') && !!document.querySelector('.score .ks-line'));
          while (TC.history.undoStack.length > undoKs) TC.actions.undo();
          S.trackId = S.doc.tracks[0].id;
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
