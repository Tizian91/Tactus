'use strict';
/*
 * Mouse, pen, fingers and keyboard on the score. One rule for every kind of pointer:
 *
 *   where you press             tap                       drag                        hold (½ s), then drag
 *   empty place on the lines    write the note            the preview follows         held still (finger / pen):
 *                                                                                     bar menu, no note
 *                                                         (column and line), release
 *                                                         writes it; off the lines:
 *                                                         nothing
 *   on a note                   select (again: delete;    move the note: sideways     a row of that
 *                               Ctrl: add to selection)   in time, up / down to       instrument
 *                                                         another instrument          (mouse: Ctrl + drag)
 *   beside the lines (above,    select the bar (far       scroll the view             finger: bar menu
 *   below, bar start)           away: deselect)
 *   two fingers                 -                         scroll + zoom
 *
 *   "On the lines" = within reach of a line that carries an instrument of the kit ("magnet"); the
 *   selected instrument if it sits on that line. Instrument lock (panel switch, L, Shift held): the
 *   height within that band does not matter, the selected instrument is written.
 *   Hover (mouse, pen above the screen): preview of what a tap would do, with its name.
 *   Setting "fingers write notes" off: a finger only selects and scrolls (pen / mouse write).
 *   drum map       short name: its line lights up; tap: choose that instrument (again: the next one)
 *   right-click    bar menu · wheel: scroll (Shift: the other way, Ctrl: zoom)
 *   middle button or Space + drag: move the view · Space tapped: play / stop · Esc: drop the note held
 */
(function (TC) {
  const S = TC.state;
  const I = (TC.interaction = {});
  const A = () => TC.actions;
  const tr = (s, v) => TC.tr(s, v);
  let vp, spaceDown = false, spaceUsed = false, shiftDown = false, raf = 0, lastMove = null;

  /** A pointer position in staff coordinates ({ x, y, sys }, see TC.render.toLocal), or null. */
  I.toLocal = (clientX, clientY) => TC.render.toLocal(I.toWorld(clientX, clientY));

  I.toWorld = function (clientX, clientY) {
    const r = vp.getBoundingClientRect(), v = S.doc.view;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  };

  /** Is the instrument lock on (switch, or Shift held)? */
  I.locked = (e) => !!(S.input.lock || shiftDown || (e && e.shiftKey));

  /** The note of instrument `art` at `tick` in a bar (any voice), or null. */
  function noteAt(bi, tick, art) {
    for (const voice of S.doc.tracks[0].bars[bi].voices) {
      for (const ev of voice) {
        if (ev.tick !== tick) continue;
        const n = ev.notes.find((x) => x.art === art);
        if (n) return n;
      }
    }
    return null;
  }

  /** The instrument whose line is near staff point p (the "magnet"), or null beside the lines. */
  const lineArt = (p) => TC.drums.resolve(TC.render.posAt(p.y), S.input.art, TC.drums.clickable());

  /**
   * Where a note would go at point p: { kind: 'place', bar, tick, line, art, lock } or null
   * (beside the lines, bar start, %-bar). keepArt: the instrument stays (lock, moving with lock).
   */
  function placeAt(p, e, keepArt) {
    const RD = TC.render;
    if (!p || p.x < p.sys.ox) return null;
    if (p.y < RD.stepY(RD.LINE_MIN) - 5 || p.y > RD.stepY(RD.LINE_MAX) + 5) return null;
    const bar = RD.barAt(p.x);
    if (!bar || bar.simile || p.x < bar.x0) return null;
    const near = lineArt(p);
    if (!near) return null; // beside the lines (also with the lock): that is where bars are chosen
    const tick = RD.snapTick(bar, p.x);
    const lock = I.locked(e);
    const art = keepArt || (lock ? TC.drums.byId(S.input.art) : near);
    return { kind: 'place', bar: bar.i, tick, line: art.line, art, lock };
  }

  /** What a tap at point p (staff coordinates, null: off every line) would do. */
  function target(p, e) {
    const RD = TC.render, L = RD.layout;
    if (!L || !p) return null;
    const a = L.add;
    if (p.sys === L.systems[L.systems.length - 1] && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y - 10 && p.y <= a.y + a.h + 10) return { kind: 'add' };
    if (p.x < p.sys.ox) {
      const ml = RD.mapLineAt(p);
      return ml === null ? null : { kind: 'map', line: ml, sys: p.sys.i };
    }
    const bar = RD.barAt(p.x);
    if (!bar) return null;
    if (bar.simile) return { kind: 'bar', bar: bar.i, simile: true }; // "%" bar: nothing to write into
    if (I.locked(e) && lineArt(p) && p.x >= bar.x0) {
      // the height does not matter: the selected instrument at this grid position
      const art = TC.drums.byId(S.input.art);
      const tick = RD.snapTick(bar, p.x);
      const n = noteAt(bar.i, tick, art.id);
      if (n) {
        return { kind: 'head', bar: bar.i, tick, line: art.line, lock: true,
          head: { id: n.id, x: RD.tickX(bar, tick), y: RD.stepY(art.line), bar: bar.i, tick, line: art.line } };
      }
    }
    if (!I.locked(e)) {
      const head = RD.headAt(p);
      if (head) return { kind: 'head', bar: head.bar, head, tick: head.tick, line: head.line };
    }
    return placeAt(p, e) || { kind: 'bar', bar: bar.i };
  }

  function where(t) {
    const ts = S.doc.bars[t.bar].ts;
    return `${tr('Bar')} ${t.bar + 1} · ${TC.rhythm.countLabel(t.tick, ts)}`;
  }

  // ---- Hover (mouse, pen above the screen) ------------------------------------------------------

  function updateHover() {
    raf = 0;
    const e = lastMove;
    if (!e || S.drag) return;
    if (toolOf(e) !== 'write') return toolHover(e);
    const t = target(I.toLocal(e.clientX, e.clientY), e);
    let h = null;
    if (t && (t.kind === 'place' || t.kind === 'head')) {
      h = { bar: t.bar, tick: t.tick, line: t.line, art: t.art || null, lock: !!t.lock };
      if (t.kind === 'head') {
        h.headId = t.head.id;
        h.hx = t.head.x;
        h.hy = t.head.y;
        const hit = TC.score.findNote(S.doc, t.head.id);
        const name = TC.drums.label(hit && TC.drums.byId(hit.note.art), true);
        const what = tr(S.selection.has(t.head.id) && S.selection.size === 1 ? 'click: delete' : 'click: select');
        h.label = `${name} – ${what}`;
        TC.ui.status(`${where(t)} · ${name} – ${what} · ${tr('drag: move · hold, then drag: row')}`);
      } else {
        h.label = TC.drums.label(t.art, true);
        TC.ui.status(`${where(t)} · ${TC.drums.label(t.art)}${t.lock ? ' · ' + tr('instrument lock') : ''}`);
      }
    } else if (t && t.kind === 'map') {
      h = { mapLine: t.line, sys: t.sys };
      TC.ui.status(TC.drums.lines(TC.drums.mapIds()).filter(([l]) => l === t.line).map(([, arts]) => arts.map((a) => TC.drums.label(a)).join(', '))[0] +
        ' – ' + tr('click: choose'));
    } else if (t && t.kind === 'add') {
      TC.ui.status(tr('Add a bar'));
    } else if (t && t.simile) {
      h = { bar: t.bar, barHl: true };
      TC.ui.status(`${tr('Bar')} ${t.bar + 1} · ${tr('repeats the bar before (%) – bar menu: write it out')}`);
    } else if (t && t.kind === 'bar') {
      h = { bar: t.bar, barHl: true };
      TC.ui.status(`${tr('Bar')} ${t.bar + 1} · ${tr('click: select the bar · drag: scroll')}`);
    } else {
      TC.ui.status('');
    }
    const key = JSON.stringify(h);
    if (key !== I.hoverKey) {
      I.hoverKey = key;
      S.hover = h;
      TC.render.drawHover();
    }
    vp.style.cursor = !t ? '' : t.kind === 'bar' ? 'grab' : 'pointer';
  }

  /** Redraw the preview (e.g. Shift pressed / released, lock switched). */
  I.refreshHover = function () {
    I.hoverKey = null;
    if (lastMove) updateHover();
  };

  function clearHover() {
    lastMove = null;
    if (S.hover) {
      S.hover = null;
      I.hoverKey = null;
      TC.render.drawHover();
    }
  }

  // ---- Pointer -------------------------------------------------------------------------------
  // S.drag while a pointer is down: { mode, id (pointerId), sx, sy, down (the pointerdown event), … }
  //   aim    a new note follows the pointer (t: where it goes, null = off the lines)
  //   note   pressed on a note (t); moving turns it into 'move', holding arms a row ('row')
  //   move   an existing note follows the pointer (to: where it goes)
  //   write  a row is being written (dragWrite)
  //   tap    pressed beside the lines; moving turns it into 'pan'
  //   pan    the view follows the pointer

  const touches = new Map(); // fingers on the screen: pointerId -> { x, y }
  let pinch = null, holdTimer = 0, lastTouch = 0;
  const HOLD_MS = 500;
  const moveMin = (e) => (e.pointerType === 'touch' ? 10 : 6); // px before a press becomes a drag
  const fingerWrites = (e) => e.pointerType !== 'touch' || S.settings.fingerWrites !== false;
  const moved = (d, e) => Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= moveMin(e);

  function onPointerDown(e) {
    vp.focus({ preventScroll: true });
    const touch = e.pointerType === 'touch';
    if (touch) {
      e.preventDefault();
      lastTouch = Date.now();
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
      if (touches.size >= 2) return startPinch();
    } else if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      if (spaceDown) spaceUsed = true;
      startPan(e);
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
      return;
    } else if (e.button !== 0) {
      return;
    }
    if (S.drag) return; // another pointer is busy (pen and finger at once)
    try { vp.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
    clearTimeout(holdTimer);
    // tools (note panel): select / eraser - a pen's eraser end always erases
    const tool = toolOf(e);
    if (tool === 'erase') return startErase(e);
    if (tool === 'select') return startSelect(e);
    let t = target(I.toLocal(e.clientX, e.clientY), e);
    const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, down: e };
    if (e.pointerType === 'pen') lastTouch = Date.now(); // a pen's own long-press menu is ignored too
    const holdMenu = touch || e.pointerType === 'pen'; // finger / pen held still: bar menu (mouse: right-click)
    if (t && t.kind === 'place' && fingerWrites(e)) {
      S.drag = Object.assign(base, { mode: 'aim', t });
      showAim(t, true);
      if (holdMenu) holdTimer = setTimeout(() => menuOnHold(e.pointerId, 'aim'), HOLD_MS);
      return;
    }
    if (t && t.kind === 'head' && fingerWrites(e)) {
      const hit = TC.score.findNote(S.doc, t.head.id);
      if (!hit) return;
      S.drag = Object.assign(base, { mode: 'note', t, hit, row: !touch && (e.ctrlKey || e.metaKey) });
      holdTimer = setTimeout(armRow, HOLD_MS);
      return;
    }
    // a finger that does not write: a tap chooses the bar (or selects the note), dragging scrolls
    if (t && t.kind === 'place') t = { kind: 'bar', bar: t.bar };
    S.drag = Object.assign(base, { mode: 'tap', t });
    if (holdMenu) holdTimer = setTimeout(() => menuOnHold(e.pointerId, 'tap'), HOLD_MS);
  }

  /**
   * Finger / pen held still: the bar menu instead of a note (a new note being aimed at is dropped).
   * Once the pointer has moved (aiming, scrolling) the timer is cleared and nothing happens here.
   */
  function menuOnHold(id, mode) {
    const d = S.drag;
    if (!d || d.mode !== mode || d.id !== id) return;
    d.mode = 'done';
    clearHover();
    if (navigator.vibrate) navigator.vibrate(15);
    onContextMenu({ clientX: d.sx, clientY: d.sy, preventDefault() {}, fromHold: true });
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch') {
      const f = touches.get(e.pointerId);
      if (f) {
        f.x = e.clientX;
        f.y = e.clientY;
        lastTouch = Date.now();
      }
      if (pinch) return pinchMove();
    }
    const d = S.drag;
    if (d && d.id !== undefined && d.id !== e.pointerId) return; // only the pointer that pressed
    if (!d) {
      if (e.pointerType === 'touch') return;
      lastMove = e;
      if (!raf) raf = requestAnimationFrame(updateHover);
      return;
    }
    switch (d.mode) {
      case 'pan': {
        const v = S.doc.view;
        v.x = d.vx + e.clientX - d.sx;
        v.y = d.vy + e.clientY - d.sy;
        TC.render.applyView();
        return;
      }
      case 'aim': return aimMove(e);
      case 'move': return moveMove(e);
      case 'write': return dragWrite(e);
      case 'note':
        if (!moved(d, e)) return;
        clearTimeout(holdTimer);
        // held (or Ctrl): the first movement decides - sideways a row, up / down the strength
        if (d.row) return Math.abs(e.clientY - d.sy) > Math.abs(e.clientX - d.sx) ? beginVel(e) : beginRow(e);
        d.mode = 'move';
        return moveMove(e);
      case 'vel': return velMove(e);
      case 'erase': return eraseMove(e);
      case 'rect': return rectMove(e);
      case 'sel':
        if (!moved(d, e)) return;
        clearTimeout(holdTimer);
        d.mode = 'smove';
        return selMove(e);
      case 'smove': return selMove(e);
      case 'tap':
        if (!moved(d, e)) return;
        clearTimeout(holdTimer);
        startPan(e, d);
        return onPointerMove(e);
      default:
    }
  }

  function onPointerUp(e) {
    const cancelled = e.type === 'pointercancel';
    if (e.pointerType === 'pen') lastTouch = Date.now();
    if (e.pointerType === 'touch') {
      if (!touches.has(e.pointerId)) return;
      touches.delete(e.pointerId);
      lastTouch = Date.now();
      if (pinch) {
        pinch = null;
        if (touches.size === 1) {
          const [[id, f]] = [...touches];
          startPan({ pointerId: id, clientX: f.x, clientY: f.y }); // one finger left: keep moving
        } else S.drag = null;
        return;
      }
    }
    const d = S.drag;
    if (!d || (d.id !== undefined && d.id !== e.pointerId)) return;
    clearTimeout(holdTimer);
    S.drag = null;
    try { vp.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    vp.classList.remove('panning');
    if (!cancelled) {
      if (d.mode === 'aim' && d.t) writeNote(d.t, false);
      else if (d.mode === 'note') d.held ? noteMenu(d, e) : act(d.t, e); // held and released: instruments of the line
      else if (d.mode === 'move') dropMove(d);
      else if (d.mode === 'tap') act(d.t, d.down);
      else if (d.mode === 'sel') d.held ? noteMenu(d, e) : selTap(d);
      else if (d.mode === 'rect') rectDone(d);
    }
    if (d.mode === 'rect') TC.render.drawRect(null);
    if (d.mode === 'erase') finishErase(d);
    if (d.mode === 'smove') finishSelMove(d, cancelled);
    if (d.mode === 'write' || d.mode === 'row') {
      S.drag = d;
      finishRow();
    }
    if (d.mode === 'vel') finishVel(d);
    if (e.pointerType === 'touch') clearHover();
    else {
      I.hoverKey = null;
      lastMove = e;
      updateHover();
    }
  }

  function startPan(e, d) {
    const v = S.doc.view;
    S.drag = { mode: 'pan', id: e.pointerId, sx: d ? d.sx : e.clientX, sy: d ? d.sy : e.clientY, vx: v.x, vy: v.y };
    vp.classList.add('panning');
    clearHover();
  }

  /** Two fingers: whatever one finger was doing is dropped (a row is kept), then zoom + scroll. */
  function startPinch() {
    clearTimeout(holdTimer);
    if (S.drag && (S.drag.mode === 'write' || S.drag.mode === 'row')) finishRow();
    if (S.drag && S.drag.mode === 'vel') finishVel(S.drag);
    if (S.drag && S.drag.mode === 'erase') finishErase(S.drag);
    if (S.drag && S.drag.mode === 'smove') finishSelMove(S.drag, true);
    TC.render.drawRect(null);
    S.drag = null;
    clearHover();
    const [a, b] = [...touches.values()], v = S.doc.view;
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: v.x, vy: v.y, z0: v.zoom };
  }
  function pinchMove() {
    if (touches.size < 2) return;
    const [a, b] = [...touches.values()], r = vp.getBoundingClientRect(), g = pinch, v = S.doc.view;
    const z = TC.clamp(g.z0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, 0.25, 4);
    // the point of the score that was between the fingers stays between them
    const wx = (g.mx - r.left - g.vx) / g.z0, wy = (g.my - r.top - g.vy) / g.z0;
    v.zoom = z;
    v.x = (a.x + b.x) / 2 - r.left - wx * z;
    v.y = (a.y + b.y) / 2 - r.top - wy * z;
    TC.render.applyView();
    TC.ui.updateZoom();
  }

  /** Esc while a note is held: it is not written / moved. */
  I.cancelDrag = function () {
    const d = S.drag;
    if (!d || !['aim', 'note', 'move', 'vel', 'smove', 'rect', 'sel'].includes(d.mode)) return false;
    clearTimeout(holdTimer);
    if (d.mode === 'smove') finishSelMove(d, true); // the notes go back
    if (d.mode === 'rect') {
      S.selection = new Set(d.keep);
      TC.render.drawRect(null);
      TC.render.draw();
    }
    if (d.mode === 'vel') {
      // the strength goes back to what it was
      d.notes.forEach((n, k) => Object.assign(n, d.before[k]));
      S.rev++;
      TC.render.draw();
    }
    d.mode = 'done';
    clearHover();
    TC.ui.status(tr('Dropped'));
    return true;
  };

  // ---- A new note: aim, then release ----------------------------------------------------------

  function showAim(t, sound) {
    S.hover = { bar: t.bar, tick: t.tick, line: t.line, art: t.art, lock: !!t.lock, label: TC.drums.label(t.art, true) };
    I.hoverKey = null;
    TC.render.drawHover();
    TC.ui.status(`${where(t)} · ${TC.drums.label(t.art)} · ${tr('release: write')}`);
    if (sound && S.settings.sound) TC.audio.preview(TC.newDrumNote(t.art.id, S.input));
  }

  function aimMove(e) {
    const d = S.drag;
    if (moved(d, e)) clearTimeout(holdTimer); // aiming: no bar menu
    const t = placeAt(I.toLocal(e.clientX, e.clientY), e);
    if (!t) {
      if (d.t) {
        d.t = null;
        clearHover();
        TC.ui.status(tr('release here: no note'));
      }
      return;
    }
    if (d.t && t.bar === d.t.bar && t.tick === d.t.tick && t.art.id === d.t.art.id) return;
    const newSound = !d.t || t.art.id !== d.t.art.id;
    d.t = t;
    showAim(t, newSound);
  }

  /**
   * Write the note of target t (kind 'place'). Already there: it is selected instead.
   * Returns true when the score changed (one undo step).
   */
  function writeNote(t, sound) {
    S.selection.clear();
    TC.selectBar(t.bar);
    const art = t.art;
    const note = TC.newDrumNote(art.id, S.input);
    const res = TC.score.place(S.doc, S.doc.tracks[0], t.bar, art.voice, t.tick, TC.inputTicks(S.input), note);
    if (res.status === 'exists') {
      S.selection = new Set([res.note.id]);
      TC.refresh();
      return false;
    }
    TC.commit();
    if (sound && S.settings.sound) TC.audio.preview(note);
    TC.ui.status(`${where(t)} · ${TC.drums.label(art)}`);
    return true;
  }

  // ---- A tap: select, delete, choose, add -------------------------------------------------------

  /** What a tap on target t does (e: the event, for Ctrl). */
  function act(t, e) {
    if (!t) {
      if (S.selection.size || S.selBar !== null) A().selectNone();
      return;
    }
    if (t.kind === 'add') return A().addBar();
    if (t.kind === 'map') {
      // choose an instrument of that line; tapping again goes to the next one there
      const arts = TC.drums.atLine(t.line).filter((a) => TC.drums.mapIds().has(a.id));
      const k = arts.findIndex((a) => a.id === S.input.art);
      if (arts.length) {
        A().setArt(arts[(k + 1) % arts.length].id);
        if (S.settings.sound && !S.selection.size) TC.audio.preview(TC.newDrumNote(S.input.art, S.input));
      }
      return;
    }
    if (t.kind === 'bar' && e.shiftKey && S.selBar !== null) {
      // Shift + tap beside the lines: the bars from the one selected before up to this one
      TC.selectBar(t.bar, true);
      S.selection.clear();
      TC.refresh();
      const [a, b] = TC.barRange();
      TC.ui.hint(tr('Bars {a}–{b} selected', { a: a + 1, b: b + 1 }));
      return;
    }
    TC.selectBar(t.bar);
    if (t.kind === 'head') {
      const id = t.head.id;
      if (e.ctrlKey || e.metaKey) {
        if (S.selection.has(id)) S.selection.delete(id);
        else S.selection.add(id);
      } else if (S.selection.size === 1 && S.selection.has(id)) {
        return A().deleteSelection();
      } else {
        S.selection = new Set([id]);
      }
      TC.refresh();
      return;
    }
    if (t.kind === 'bar') {
      S.selection.clear();
      TC.refresh();
      TC.ui.hint(tr('Bar {n} selected', { n: t.bar + 1 }));
      return;
    }
    writeNote(t, e.pointerType === 'touch');
  }

  // ---- Moving a note ---------------------------------------------------------------------------
  // sideways: to another grid position (any bar); up / down: to another instrument (the magnet;
  // with the lock the instrument stays). The note keeps its value; released, it is selected.

  function moveMove(e) {
    const d = S.drag, n = d.hit.note;
    const keep = I.locked(e) ? TC.drums.byId(n.art) : null;
    const to = placeAt(I.toLocal(e.clientX, e.clientY), e, keep);
    if (to && d.to && to.bar === d.to.bar && to.tick === d.to.tick && to.art.id === d.to.art.id) return;
    const newSound = to && (!d.to || to.art.id !== d.to.art.id);
    d.to = to;
    if (!to) {
      S.hover = { bar: d.t.bar, tick: d.t.tick, line: d.t.line, headId: n.id, hx: d.t.head.x, hy: d.t.head.y, label: tr('release here: stays') };
    } else {
      S.hover = { bar: to.bar, tick: to.tick, line: to.line, art: to.art, label: TC.drums.label(to.art, true) + ' ← ' + tr('move') };
      TC.ui.status(`${where(to)} · ${TC.drums.label(to.art)} · ${tr('release: move here')}`);
      if (newSound && S.settings.sound) TC.audio.preview(Object.assign({}, n, { art: to.art.id }));
    }
    I.hoverKey = null;
    TC.render.drawHover();
  }

  function dropMove(d) {
    const to = d.to, n = d.hit.note;
    if (!to || (to.bar === d.hit.bar && to.tick === d.hit.ev.tick && to.art.id === n.art)) return;
    const doc = S.doc, track = doc.tracks[0];
    if (noteAt(to.bar, to.tick, to.art.id)) return TC.ui.hint(tr('There is already such a note'));
    const dur = d.hit.ev.dur;
    TC.score.removeNotes(doc, [n.id]);
    const moved = Object.assign({}, n, { art: to.art.id });
    const res = TC.score.place(doc, track, to.bar, to.art.voice, to.tick, dur, moved);
    S.selection = new Set([res.note ? res.note.id : n.id]);
    TC.selectBar(to.bar);
    TC.commit();
    TC.ui.status(`${where(to)} · ${TC.drums.label(to.art)} · ${tr('moved')}`);
  }

  // ---- A row of notes (hold a note, then drag; mouse: Ctrl + drag) ------------------------------

  /** Held long enough on a note: dragging now writes a row of its instrument. */
  function armRow() {
    const d = S.drag;
    if (!d || d.mode !== 'note') return;
    d.row = true;
    d.held = true; // released without moving: the menu with the instruments of this line
    if (navigator.vibrate) navigator.vibrate(15);
    const art = TC.drums.byId(d.hit.note.art);
    S.hover = { bar: d.t.bar, tick: d.t.tick, line: d.t.line, headId: d.t.head.id, hx: d.t.head.x, hy: d.t.head.y,
      label: `${TC.drums.label(art, true)} – ${tr('sideways: row · up / down: strength · release: instrument')}` };
    I.hoverKey = null;
    TC.render.drawHover();
    TC.ui.status(`${where(d.t)} · ${TC.drums.label(art)} · ${tr('sideways: row of notes · up / down: ghost / normal / accent · release: choose the instrument of the line')}`);
  }

  // ---- Strength: hold a note, then up / down (ghost · normal · accent) ---------------------------
  // the held note - or all selected notes, if it is one of them; one undo step on release

  const VEL_STEP = 28; // px per step
  const LEVELS = ['Ghost', 'normal', 'Accent'];
  const levelOf = (n) => (n.ghost ? 0 : n.accent ? 2 : 1);
  function setLevel(n, lv) {
    n.ghost = lv === 0;
    if (lv === 2) n.accent = n.accent || 1; // a marcato stays a marcato
    else n.accent = 0;
    n.vel = null;
  }

  function beginVel(e) {
    const d = S.drag, held = d.hit.note;
    const ids = S.selection.has(held.id) && S.selection.size > 1 ? [...S.selection] : [held.id];
    const notes = ids.map((id) => TC.score.findNote(S.doc, id)).filter(Boolean).map((h) => h.note);
    S.drag = { mode: 'vel', id: d.id, sx: d.sx, sy: d.sy, t: d.t, notes, before: notes.map((n) => ({ ghost: n.ghost, accent: n.accent, vel: n.vel })),
      level0: levelOf(held), level: levelOf(held) };
    velMove(e, true);
  }

  function velMove(e, first) {
    const d = S.drag;
    const lv = TC.clamp(d.level0 + Math.round((d.sy - e.clientY) / VEL_STEP), 0, 2); // up: stronger
    if (lv !== d.level || first) {
      d.level = lv;
      d.notes.forEach((n) => setLevel(n, lv));
      S.rev++;
      TC.render.draw();
      if (S.settings.sound) TC.audio.preview(d.notes[0]);
    }
    S.hover = { bar: d.t.bar, headId: d.t.head.id, hx: d.t.head.x, hy: d.t.head.y, vel: { level: d.level, names: LEVELS.map((s) => tr(s)) } };
    I.hoverKey = null;
    TC.render.drawHover();
    TC.ui.status(`${where(d.t)} · ${tr('Strength')}: ${tr(LEVELS[d.level])}${d.notes.length > 1 ? ' · ' + tr('{n} notes', { n: d.notes.length }) : ''}`);
  }

  /**
   * A note held and released without moving: a small menu next to it with the instruments of its
   * line (hi-hat closed / half / open, snare / rimshot / side stick …) and ghost / normal / accent.
   * Changes the held note - or all selected notes, if it is one of them.
   */
  function noteMenu(d, e) {
    const n = d.hit.note, a = TC.drums.byId(n.art);
    if (!a) return;
    const ids = S.selection.has(n.id) && S.selection.size > 1 ? [...S.selection] : [n.id];
    const offer = TC.drums.clickable();
    offer.add(n.art);
    const arts = TC.drums.atLine(a.line).filter((x) => offer.has(x.id));
    const choose = (fn) => () => {
      S.selection = new Set(ids);
      TC.selectBar(d.t.bar);
      fn();
    };
    const items = arts.length > 1 ? arts.map((x) => ({
      label: TC.drums.label(x), checked: x.id === n.art,
      action: choose(() => {
        A().setArt(x.id);
        if (S.settings.sound) TC.audio.preview(n);
      }),
    })).concat('-') : [];
    const lv = levelOf(n);
    LEVELS.forEach((s, k) => items.push({
      label: tr(s), checked: lv === k,
      action: choose(() => {
        ids.forEach((id) => { const h = TC.score.findNote(S.doc, id); if (h) setLevel(h.note, k); });
        TC.commit();
        if (S.settings.sound) TC.audio.preview(n);
      }),
    }));
    TC.menu.open(items, e.clientX + 14, e.clientY - 24);
  }

  // ---- Tools: select and eraser (note panel, keys W / V / E) ---------------------------------------
  //   select   tap a note: select it (Shift / Ctrl: add / remove) · drag on an empty place: frame ·
  //            drag a note: move the selection (sideways in time; up / down if all are one instrument) ·
  //            hold a note and release: menu (instrument / strength) for the selection
  //   eraser   tap or wipe: the notes under the circle are deleted (one undo step)
  //   two fingers scroll and zoom in every tool; a pen's eraser end always erases

  /** The tool for this pointer: the pen's eraser end erases, otherwise the chosen one. */
  function toolOf(e) {
    if (e && e.pointerType === 'pen' && ((e.buttons & 32) || e.button === 5)) return 'erase';
    return S.tool || 'write';
  }

  function setHover(h) {
    const key = JSON.stringify(h);
    if (key === I.hoverKey) return;
    I.hoverKey = key;
    S.hover = h;
    TC.render.drawHover();
  }

  /** Hover (mouse / pen above the screen) with the select tool or the eraser. */
  function toolHover(e) {
    const p = I.toLocal(e.clientX, e.clientY);
    if (toolOf(e) === 'erase') {
      setHover(p ? { sys: p.sys.i, erase: { x: p.x, y: p.y } } : null);
      TC.ui.status(tr('Eraser: tap or wipe over notes'));
      vp.style.cursor = 'crosshair';
      return;
    }
    const head = p && TC.render.headAt(p);
    setHover(head ? { bar: head.bar, ring: { x: head.x, y: head.y } } : null);
    TC.ui.status(tr(head ? 'click: select (Shift: add) · drag: move the selection · hold: instrument / strength' : 'drag: selection frame · click: deselect, choose the bar'));
    vp.style.cursor = head ? 'move' : 'crosshair';
  }

  // eraser

  function startErase(e) {
    S.drag = { mode: 'erase', id: e.pointerId, n: 0, last: I.toWorld(e.clientX, e.clientY) };
    eraseMove(e);
  }
  function eraseMove(e) {
    const d = S.drag, w = I.toWorld(e.clientX, e.clientY), R = TC.render.ERASE_R;
    // the whole way since the last point: a fast wipe misses nothing
    const steps = Math.max(1, Math.ceil(Math.hypot(w.x - d.last.x, w.y - d.last.y) / (R / 2)));
    const heads = TC.render.headsInView(), ids = new Set();
    for (let k = 1; k <= steps; k++) {
      const x = d.last.x + ((w.x - d.last.x) * k) / steps, y = d.last.y + ((w.y - d.last.y) * k) / steps;
      heads.forEach((h) => { if (Math.hypot(h.wx - x, h.wy - y) <= R) ids.add(h.id); });
    }
    d.last = w;
    if (ids.size) {
      d.n += TC.score.removeNotes(S.doc, [...ids]);
      ids.forEach((id) => S.selection.delete(id));
      S.rev++;
      TC.render.draw();
      TC.ui.status(tr('{n} note(s) deleted', { n: d.n }));
    }
    const p = I.toLocal(e.clientX, e.clientY);
    I.hoverKey = null;
    setHover(p ? { sys: p.sys.i, erase: { x: p.x, y: p.y, on: true } } : null);
  }
  function finishErase(d) {
    if (d.n) TC.commit();
    else TC.refresh();
  }

  // select

  function startSelect(e) {
    const p = I.toLocal(e.clientX, e.clientY), head = p && TC.render.headAt(p);
    const add = !!(e.shiftKey || e.ctrlKey || e.metaKey);
    const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, down: e, add };
    if (head) {
      const hit = TC.score.findNote(S.doc, head.id);
      if (!hit) return;
      S.drag = Object.assign(base, { mode: 'sel', hit, head, t: { bar: head.bar, tick: head.tick, line: head.line, head } });
      holdTimer = setTimeout(() => {
        const d = S.drag;
        if (!d || d.mode !== 'sel') return;
        d.held = true; // released without moving: the menu (instrument / strength) for the selection
        if (navigator.vibrate) navigator.vibrate(15);
      }, HOLD_MS);
      return;
    }
    S.drag = Object.assign(base, { mode: 'rect', w0: I.toWorld(e.clientX, e.clientY), keep: add ? new Set(S.selection) : new Set(), p });
  }

  /** A tap on a note: select it alone, or (Shift / Ctrl) add / remove it. */
  function selTap(d) {
    const id = d.head.id;
    if (d.add) {
      if (S.selection.has(id)) S.selection.delete(id);
      else S.selection.add(id);
    } else S.selection = new Set([id]);
    TC.selectBar(d.head.bar);
    TC.refresh();
  }

  function rectMove(e) {
    const d = S.drag;
    if (!d.started && !moved(d, e)) return;
    d.started = true;
    const w = I.toWorld(e.clientX, e.clientY);
    TC.render.drawRect({ x1: d.w0.x, y1: d.w0.y, x2: w.x, y2: w.y });
    const x1 = Math.min(d.w0.x, w.x), x2 = Math.max(d.w0.x, w.x), y1 = Math.min(d.w0.y, w.y), y2 = Math.max(d.w0.y, w.y);
    const sel = new Set(d.keep);
    TC.render.headsInView().forEach((h) => { if (h.wx >= x1 && h.wx <= x2 && h.wy >= y1 && h.wy <= y2) sel.add(h.id); });
    const key = [...sel].sort().join();
    if (key === d.key) return;
    d.key = key;
    S.selection = sel;
    TC.render.draw();
    TC.ui.status(tr('{n} note(s) selected', { n: sel.size }));
  }
  function rectDone(d) {
    if (!d.started) {
      // a tap on an empty place: the selection goes (Shift / Ctrl: it stays); the bar there is chosen
      if (!d.add) S.selection.clear();
      const bar = d.p && TC.render.barAt(d.p.x);
      TC.selectBar(bar ? bar.i : null);
    }
    TC.refresh();
  }

  /**
   * Dragging a note with the select tool: the whole selection moves along (the note pressed
   * joins it). Every step starts again from the notes as they were, so a blocked place
   * (a note of the same instrument there) just keeps the last good one.
   */
  function selMove(e) {
    const d = S.drag;
    if (!d.orig) {
      if (!S.selection.has(d.head.id)) S.selection = d.add ? new Set([...S.selection, d.head.id]) : new Set([d.head.id]);
      d.ids = [...S.selection];
      d.orig = JSON.stringify(S.doc.tracks);
      d.from = TC.score.absTick(S.doc, d.head.bar, d.head.tick);
      const arts = new Set(d.ids.map((id) => (TC.score.findNote(S.doc, id) || { note: {} }).note.art));
      d.oneArt = arts.size === 1 ? [...arts][0] : null; // up / down only for one instrument
      d.good = { delta: 0, art: null };
    }
    const p = I.toLocal(e.clientX, e.clientY);
    const bar = p && TC.render.barAt(p.x);
    if (!bar || bar.simile || p.x < bar.x0) return;
    const delta = TC.score.absTick(S.doc, bar.i, TC.render.snapTick(bar, p.x)) - d.from;
    let art = null;
    if (d.oneArt && !I.locked(e)) {
      const a = lineArt(p);
      if (a && a.id !== d.oneArt) art = a.id;
    }
    if (delta === d.good.delta && art === d.good.art) return;
    const apply = (dl, a) => {
      S.doc.tracks = JSON.parse(d.orig);
      return (!dl && !a) || TC.score.moveNotes(S.doc, d.ids, dl, a);
    };
    if (apply(delta, art)) d.good = { delta, art };
    else apply(d.good.delta, d.good.art);
    S.rev++;
    TC.render.draw();
    const pos = TC.score.atAbs(S.doc, d.from + d.good.delta);
    if (pos) TC.ui.status(`${where(pos)} · ${tr('{n} note(s) selected', { n: d.ids.length })} · ${tr('release: move here')}`);
  }
  function finishSelMove(d, cancelled) {
    if (!d.orig) return;
    if (cancelled) {
      S.doc.tracks = JSON.parse(d.orig);
      S.rev++;
      TC.refresh();
      return;
    }
    if (d.good.delta || d.good.art) TC.commit();
    else TC.refresh();
  }

  function finishVel(d) {
    const changed = d.notes.some((n, k) => n.ghost !== d.before[k].ghost || n.accent !== d.before[k].accent || n.vel !== d.before[k].vel);
    if (changed) TC.commit();
    else TC.refresh();
  }

  function beginRow(e) {
    const d = S.drag, art = TC.drums.byId(d.hit.note.art);
    S.drag = { mode: 'write', id: d.id, art, bar: d.t.bar, tick: d.t.tick, n: 0 };
    dragWrite(e);
  }

  /** The row is done: one undo step. */
  function finishRow() {
    const d = S.drag;
    S.drag = null;
    if (d && d.n) TC.commit();
  }

  /**
   * Positions of the row after the note at (bar, tick) up to the pointer at (bar2, tick2).
   * The row steps by the length of the note (not by the click grid): dotted eighths follow each
   * other every three sixteenths, triplets every triplet. In a new bar the row starts on beat 1.
   * Backwards: nothing.
   */
  function between(bar, tick, bar2, tick2) {
    const step = TC.inputTicks(S.input), out = [];
    let b = bar, t = tick + step;
    while (b < bar2 || (b === bar2 && t <= tick2)) {
      if (t >= TC.barTicks(S.doc.bars[b].ts)) {
        b++;
        t = 0;
        continue;
      }
      if (!S.doc.bars[b].simile) out.push([b, t]);
      t += step;
    }
    return out;
  }

  function dragWrite(e) {
    const d = S.drag, RD = TC.render;
    const p = I.toLocal(e.clientX, e.clientY);
    const bar = p && RD.barAt(p.x);
    if (!bar || bar.simile || p.x < bar.x0) return;
    const tick = RD.snapTick(bar, p.x);
    const row = between(d.bar, d.tick, bar.i, tick);
    if (!row.length) return;
    let added = 0;
    for (const [bi, tk] of row) {
      const note = TC.newDrumNote(d.art.id, S.input);
      const res = TC.score.place(S.doc, S.doc.tracks[0], bi, d.art.voice, tk, TC.inputTicks(S.input), note);
      if (res.status !== 'exists' && res.status !== 'outside') added++;
    }
    [d.bar, d.tick] = row[row.length - 1]; // the row goes on from its last note
    if (!added) return;
    d.n += added;
    S.rev++;
    TC.render.draw();
    if (S.settings.sound) TC.audio.preview(TC.newDrumNote(d.art.id, S.input));
    TC.ui.status(`${tr('Bar')} ${bar.i + 1} · ${TC.rhythm.countLabel(tick, S.doc.bars[bar.i].ts)} · ${TC.drums.label(d.art)} · ${tr('{n} more', { n: d.n })}`);
  }

  function onWheel(e) {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * scale, dy = e.deltaY * scale;
    if (e.ctrlKey) {
      const r = vp.getBoundingClientRect();
      TC.zoomAt(S.doc.view.zoom * Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
    } else if (TC.render.isPage() !== !!e.shiftKey) {
      // page view: the pages run downwards (Shift: sideways)
      S.doc.view.y -= dy;
      S.doc.view.x -= dx;
      TC.render.applyView();
    } else {
      S.doc.view.x -= dx + dy; // the endless staff runs sideways (Shift: up / down)
      TC.render.applyView();
    }
    lastMove = e;
    if (!raf) raf = requestAnimationFrame(updateHover);
  }

  function onContextMenu(e) {
    e.preventDefault();
    // a finger held down opens the menu by itself (above); the browser's own long-press menu is ignored
    if (!e.fromHold && (touches.size || Date.now() - lastTouch < 1000)) return;
    const p = I.toLocal(e.clientX, e.clientY);
    const bar = p && TC.render.barAt(p.x);
    if (!bar) return;
    // inside the selected bars: they stay selected; otherwise this bar (the menu can extend to it)
    const R = TC.barRange(), before = S.selBar;
    if (!R || bar.i < R[0] || bar.i > R[1]) TC.selectBar(bar.i);
    TC.refresh();
    A().barMenu(bar.i, e.clientX, e.clientY, before);
  }

  // ---- Keyboard ---------------------------------------------------------------------------------

  const isTyping = (e) => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  };

  /** Single keys for the instruments used most (floor tom: the one of the kit). */
  const ART_KEYS = { h: 42, o: 46, s: 38, k: 36, r: 51, c: 49, f: () => (TC.drums.kit().has(43) ? 43 : 45), p: 44 };

  function onKeyDown(e) {
    if (e.key === 'Shift' && !shiftDown) {
      shiftDown = true;
      I.refreshHover();
    }
    // a window is open: Esc closes the top one (kit profiles may be open above the settings)
    const kitsOpen = TC.kits && TC.kits.isOpen(), midiOpen = TC.midiIn && TC.midiIn.isOpen();
    const dbOpen = TC.dropbox && TC.dropbox.isOpen(), setOpen = TC.panel.isSettingsOpen();
    if (kitsOpen || midiOpen || dbOpen || setOpen) {
      if (e.key === 'Escape') {
        if (kitsOpen) TC.kits.close();
        else if (midiOpen) TC.midiIn.close();
        else if (dbOpen) TC.dropbox.close();
        else TC.panel.closeSettings();
      }
      return;
    }
    if (TC.menu.isOpen()) return;
    if (e.key === 'Escape' && I.cancelDrag()) return void e.preventDefault();
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) A().undo();
      else if (lk === 'y' || (lk === 'z' && e.shiftKey)) A().redo();
      else if (lk === 's') e.shiftKey ? A().saveAs() : A().save();
      else if (lk === 'o') A().open();
      else if (lk === 'p') A().print();
      else if (lk === 'e') A().exportMidiCurrent();
      else if (lk === 'c' && !isTyping(e)) A().copyBar();
      else if (lk === 'v' && !isTyping(e)) A().pasteBar();
      else if (lk === 'd') A().duplicateBar();
      else if (lk === 'a' && !isTyping(e)) A().selectAll();
      else if (k === '+' || k === '=') A().zoomIn();
      else if (k === '-') A().zoomOut();
      else if (k === '0') A().zoomReset();
      else return;
      e.preventDefault();
      return;
    }
    if (isTyping(e)) return;
    if (k === ' ') {
      // a focused button would also react to Space (e.g. ▶ after a click): Space is ours
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
      if (!spaceDown) spaceUsed = false;
      spaceDown = true;
      vp.classList.add('space-pan');
      e.preventDefault();
      return;
    }
    if (k === 'Escape' && TC.player.playing) {
      TC.player.stop();
      e.preventDefault();
      return;
    }
    if (/^[1-7]$/.test(k)) A().setValue(TC.VALUES[+k - 1]);
    else if (k === '.') A().toggleDotted();
    else if (k === 't' || k === 'T') A().toggleTriplet();
    else if (k === 'a' || k === 'A') A().toggleAccent();
    else if (k === 'g' || k === 'G') A().toggleGhost();
    else if (k === 'Delete' || k === 'Backspace') A().deleteSelection();
    else if (k === 'Escape') A().selectNone();
    else if (k === 'Home') A().home();
    else if (k === 'ArrowUp' && S.selection.size) A().moveLine(-1);
    else if (k === 'ArrowDown' && S.selection.size) A().moveLine(1);
    else if (k === 'ArrowLeft' && S.selection.size) A().shiftSelection(-1);
    else if (k === 'ArrowRight' && S.selection.size) A().shiftSelection(1);
    else if (k === 'w' || k === 'W') A().setTool('write');
    else if (k === 'v' || k === 'V') A().setTool('select');
    else if (k === 'e' || k === 'E') A().setTool('erase');
    else if (k === 'l' || k === 'L') A().toggleLock();
    else if (ART_KEYS[k.toLowerCase()] && !e.altKey) {
      const id = ART_KEYS[k.toLowerCase()];
      A().setArt(typeof id === 'function' ? id() : id);
    } else return;
    e.preventDefault();
  }

  function onKeyUp(e) {
    if (e.key === ' ') {
      // Space tapped (not held to move the view): play / stop
      if (spaceDown && !spaceUsed && !isTyping(e) && !TC.menu.isOpen()) {
        e.preventDefault();
        A().togglePlay();
      }
      spaceDown = false;
      vp.classList.remove('space-pan');
    }
    if (e.key === 'Shift') {
      shiftDown = false;
      I.refreshHover();
    }
  }

  I.init = function () {
    vp = document.getElementById('viewport');
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    vp.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      lastMove = null;
      S.hover = null;
      I.hoverKey = null;
      TC.render.drawHover();
      TC.ui.status('');
    });
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('contextmenu', onContextMenu);
    vp.addEventListener('auxclick', (e) => e.preventDefault());
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => {
      spaceDown = false;
      shiftDown = false;
    });
  };
})(window.TC);
