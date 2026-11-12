'use strict';
/*
 * Mouse, pen and keyboard on the score.
 *
 *   move           preview of the note a click would write (grid position + line), with its name
 *   click          on an empty grid position: write the note. The nearest line that carries an
 *                  instrument of the kit decides ("magnet"); the selected instrument if it sits there.
 *   instrument lock  (panel switch or key L; while Shift is held): the height does not matter,
 *                  a click anywhere in the column writes the selected instrument
 *   click a note   select it; click it again: delete it; Ctrl + click: add to the selection
 *   drum map       pointer on a short name: its line lights up; click: choose that instrument
 *                  (again: the next one on that line)
 *   right-click    bar menu (time signature, insert / delete bars)
 *   wheel          scroll sideways; Shift + wheel: up / down; Ctrl + wheel: zoom
 *   middle button or Space + drag: move the view
 *   fingers        one finger drag: scroll · tap: like a click · hold: bar menu · two fingers: zoom
 */
(function (TC) {
  const S = TC.state;
  const I = (TC.interaction = {});
  const A = () => TC.actions;
  const tr = (s, v) => TC.tr(s, v);
  let vp, spaceDown = false, shiftDown = false, raf = 0, lastMove = null;

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

  /** What a click at world point p would do. */
  function target(p, e) {
    const RD = TC.render, L = RD.layout;
    if (!L) return null;
    const a = L.add;
    if (p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y - 10 && p.y <= a.y + a.h + 10) return { kind: 'add' };
    if (p.x < 0) {
      const ml = RD.mapLineAt(p);
      return ml === null ? null : { kind: 'map', line: ml };
    }
    if (p.y < RD.stepY(RD.LINE_MIN) - 5 || p.y > RD.stepY(RD.LINE_MAX) + 5) return null;
    const bar = RD.barAt(p.x);
    if (!bar) return null;
    if (I.locked(e)) {
      // the height does not matter: the selected instrument at this grid position
      if (p.x < bar.x0) return { kind: 'bar', bar: bar.i };
      const art = TC.drums.byId(S.input.art);
      const tick = RD.snapTick(bar, p.x);
      const n = noteAt(bar.i, tick, art.id);
      if (n) {
        return { kind: 'head', bar: bar.i, tick, line: art.line, lock: true,
          head: { id: n.id, x: RD.tickX(bar, tick), y: RD.stepY(art.line), bar: bar.i, tick, line: art.line } };
      }
      return { kind: 'place', bar: bar.i, tick, line: art.line, art, lock: true };
    }
    const head = RD.headAt(p);
    if (head) return { kind: 'head', bar: head.bar, head, tick: head.tick, line: head.line };
    if (p.x < bar.x0) return { kind: 'bar', bar: bar.i }; // time signature area
    const tick = RD.snapTick(bar, p.x);
    const art = TC.drums.resolve(RD.posAt(p.y), S.input.art, TC.drums.clickable());
    return art ? { kind: 'place', bar: bar.i, tick, line: art.line, art } : { kind: 'bar', bar: bar.i };
  }

  function where(t) {
    const ts = S.doc.bars[t.bar].ts;
    return `${tr('Bar')} ${t.bar + 1} · ${TC.rhythm.countLabel(t.tick, ts)}`;
  }

  // ---- Pointer --------------------------------------------------------------------------------

  function updateHover() {
    raf = 0;
    const e = lastMove;
    if (!e || S.drag) return;
    const t = target(I.toWorld(e.clientX, e.clientY), e);
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
        TC.ui.status(`${where(t)} · ${name} – ${what}`);
      } else {
        h.label = TC.drums.label(t.art, true);
        TC.ui.status(`${where(t)} · ${TC.drums.label(t.art)}${t.lock ? ' · ' + tr('instrument lock') : ''}`);
      }
    } else if (t && t.kind === 'map') {
      h = { mapLine: t.line };
      TC.ui.status(TC.drums.lines(TC.drums.mapIds()).filter(([l]) => l === t.line).map(([, arts]) => arts.map((a) => TC.drums.label(a)).join(', '))[0] +
        ' – ' + tr('click: choose'));
    } else if (t && t.kind === 'add') {
      TC.ui.status(tr('Add a bar'));
    } else {
      TC.ui.status('');
    }
    const key = JSON.stringify(h);
    if (key !== I.hoverKey) {
      I.hoverKey = key;
      S.hover = h;
      TC.render.drawHover();
    }
    vp.style.cursor = t && (t.kind === 'place' || t.kind === 'head' || t.kind === 'add' || t.kind === 'map') ? 'pointer' : '';
  }

  /** Redraw the preview (e.g. Shift pressed / released, lock switched). */
  I.refreshHover = function () {
    I.hoverKey = null;
    if (lastMove) updateHover();
  };

  function onPointerMove(e) {
    if (e.pointerType === 'touch') return touchMove(e);
    if (S.drag && S.drag.mode === 'pan') {
      const v = S.doc.view;
      v.x = S.drag.vx + e.clientX - S.drag.sx;
      v.y = S.drag.vy + e.clientY - S.drag.sy;
      TC.render.applyView();
      return;
    }
    lastMove = e;
    if (!raf) raf = requestAnimationFrame(updateHover);
  }

  function onPointerDown(e) {
    vp.focus({ preventScroll: true });
    if (e.pointerType === 'touch') return touchDown(e);
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      const v = S.doc.view;
      S.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
      vp.setPointerCapture(e.pointerId);
      vp.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;
    press(e);
  }

  // ---- Fingers (tablet / phone) ---------------------------------------------------------------
  // one finger: drag = scroll, tap = like a click, hold = bar menu; two fingers: zoom + move.
  // A pen or mouse works as before (the pen writes notes).

  const touches = new Map(); // pointerId -> {x, y}
  let gesture = null, holdTimer = 0, lastTouch = 0;
  const TAP_MOVE = 10, HOLD_MS = 550;

  function startPan(x, y) {
    const v = S.doc.view;
    gesture = { mode: 'pan', sx: x, sy: y, vx: v.x, vy: v.y };
  }
  function startPinch() {
    const [a, b] = [...touches.values()], v = S.doc.view;
    gesture = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: v.x, vy: v.y, z0: v.zoom };
  }
  function clearHover() {
    lastMove = null;
    if (S.hover) {
      S.hover = null;
      I.hoverKey = null;
      TC.render.drawHover();
    }
  }

  function touchDown(e) {
    e.preventDefault();
    lastTouch = Date.now();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    clearTimeout(holdTimer);
    if (touches.size === 1) {
      gesture = { mode: 'tap', sx: e.clientX, sy: e.clientY, down: e };
      holdTimer = setTimeout(() => {
        if (!gesture || gesture.mode !== 'tap') return;
        const d = gesture.down;
        gesture = { mode: 'none' };
        onContextMenu({ clientX: d.clientX, clientY: d.clientY, preventDefault() {}, fromHold: true });
      }, HOLD_MS);
    } else if (touches.size === 2) {
      startPinch();
    }
  }

  function touchMove(e) {
    const p = touches.get(e.pointerId);
    if (!p || !gesture) return;
    p.x = e.clientX;
    p.y = e.clientY;
    lastTouch = Date.now();
    const v = S.doc.view;
    if (gesture.mode === 'tap') {
      if (Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) < TAP_MOVE) return;
      clearTimeout(holdTimer);
      startPan(gesture.sx, gesture.sy);
      vp.classList.add('panning');
      clearHover();
    }
    if (gesture.mode === 'pan') {
      v.x = gesture.vx + e.clientX - gesture.sx;
      v.y = gesture.vy + e.clientY - gesture.sy;
      TC.render.applyView();
    } else if (gesture.mode === 'pinch' && touches.size >= 2) {
      const [a, b] = [...touches.values()], r = vp.getBoundingClientRect(), g = gesture;
      const z = TC.clamp(g.z0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, 0.25, 4);
      // the point of the score that was between the fingers stays between them
      const wx = (g.mx - r.left - g.vx) / g.z0, wy = (g.my - r.top - g.vy) / g.z0;
      v.zoom = z;
      v.x = (a.x + b.x) / 2 - r.left - wx * z;
      v.y = (a.y + b.y) / 2 - r.top - wy * z;
      TC.render.applyView();
      TC.ui.updateZoom();
    }
  }

  function touchUp(e, cancelled) {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    lastTouch = Date.now();
    clearTimeout(holdTimer);
    const g = gesture;
    if (touches.size === 0) {
      gesture = null;
      vp.classList.remove('panning');
      if (g && g.mode === 'tap' && !cancelled) {
        press(g.down);
        clearHover(); // no pointer stays above the score
      }
    } else if (touches.size === 1 && g && g.mode === 'pinch') {
      const [p] = [...touches.values()];
      startPan(p.x, p.y); // one finger left: keep moving
    }
  }

  /** Mouse click, pen tap or finger tap at the position of event e. */
  function press(e) {
    const t = target(I.toWorld(e.clientX, e.clientY), e);
    if (!t) {
      if (S.selection.size || S.selBar !== null) A().selectNone();
      return;
    }
    if (t.kind === 'add') return A().addBar();
    if (t.kind === 'map') {
      // choose an instrument of that line; clicking again goes to the next one there
      const arts = TC.drums.atLine(t.line).filter((a) => TC.drums.mapIds().has(a.id));
      const k = arts.findIndex((a) => a.id === S.input.art);
      if (arts.length) A().setArt(arts[(k + 1) % arts.length].id);
      return;
    }
    S.selBar = t.bar;
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
      return;
    }
    // write a note
    S.selection.clear();
    const art = t.art;
    const note = TC.newDrumNote(art.id, S.input);
    const res = TC.score.place(S.doc, S.doc.tracks[0], t.bar, art.voice, t.tick, TC.inputTicks(S.input), note);
    if (res.status === 'exists') {
      S.selection = new Set([res.note.id]);
      TC.refresh();
      return;
    }
    TC.commit();
    TC.ui.status(`${where(t)} · ${TC.drums.label(art)}`);
    I.hoverKey = null;
    lastMove = e;
    updateHover();
  }

  function onPointerUp(e) {
    if (e.pointerType === 'touch') return touchUp(e, e.type === 'pointercancel');
    if (S.drag) {
      S.drag = null;
      vp.classList.remove('panning');
      try { vp.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * scale, dy = e.deltaY * scale;
    if (e.ctrlKey) {
      const r = vp.getBoundingClientRect();
      TC.zoomAt(S.doc.view.zoom * Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
    } else if (e.shiftKey) {
      S.doc.view.y -= dy;
      TC.render.applyView();
    } else {
      S.doc.view.x -= dx + dy; // the endless staff runs sideways
      TC.render.applyView();
    }
    lastMove = e;
    if (!raf) raf = requestAnimationFrame(updateHover);
  }

  function onContextMenu(e) {
    e.preventDefault();
    // a finger held down opens the menu by itself (above); the browser's own long-press menu is ignored
    if (!e.fromHold && (touches.size || Date.now() - lastTouch < 1000)) return;
    const p = I.toWorld(e.clientX, e.clientY);
    const bar = TC.render.barAt(p.x);
    if (!bar) return;
    S.selBar = bar.i;
    TC.refresh();
    A().barMenu(bar.i, e.clientX, e.clientY);
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
    if (TC.menu.isOpen()) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) A().undo();
      else if (lk === 'y' || (lk === 'z' && e.shiftKey)) A().redo();
      else if (lk === 's') e.shiftKey ? A().saveAs() : A().save();
      else if (lk === 'o') A().open();
      else if (k === '+' || k === '=') A().zoomIn();
      else if (k === '-') A().zoomOut();
      else if (k === '0') A().zoomReset();
      else return;
      e.preventDefault();
      return;
    }
    if (isTyping(e)) return;
    if (k === ' ') {
      spaceDown = true;
      vp.classList.add('space-pan');
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
    else if (k === 'l' || k === 'L') A().toggleLock();
    else if (ART_KEYS[k.toLowerCase()] && !e.altKey) {
      const id = ART_KEYS[k.toLowerCase()];
      A().setArt(typeof id === 'function' ? id() : id);
    } else return;
    e.preventDefault();
  }

  function onKeyUp(e) {
    if (e.key === ' ') {
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
