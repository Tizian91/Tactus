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
  /** Is the view held by a pointer now (dragged with the middle button / a finger, or pinched)? Then a pause does not draw it anew. */
  I.holdingView = () => !!pinch || !!(S.drag && S.drag.mode === 'pan');
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

  /**
   * A handle of the selected dynamics sign / hairpin being dragged (S.drag.mode 'dynh'): the place nearest to the pointer
   * among the notes, rests and bar ends of its track - a hairpin's start stays before its end, its end after its start.
   * Shown as a dashed line with the place (js/render.js drawDynDrag); set when released (A.moveDynSel).
   */
  function dynHandleMove(e) {
    const d = S.drag, p = I.toLocal(e.clientX, e.clientY);
    if (!p || !moved(d, e)) return;
    let best = null;
    for (const s of d.snaps) {
      if (d.which === 'e' ? s.abs <= d.a0 : s.end || (d.which === 's' && s.abs >= d.e0)) continue;
      if (!best || Math.abs(s.x - p.x) < Math.abs(best.x - p.x)) best = s;
    }
    d.to = best;
    if (!best) return TC.render.drawDynDrag(null);
    const ts = S.doc.bars[best.bar].ts;
    const label = best.end ? tr('end of bar {n}', { n: best.bar + 1 }) : tr('Bar {n}', { n: best.bar + 1 }) + ', ' + TC.rhythm.countLabel(best.t, ts);
    TC.render.drawDynDrag({ bar: best.bar, x: best.x, label });
    TC.ui.status(label);
  }

  /** Select the notes of a track from the first one selected up to note `id` (both ways, over bar lines, every voice). */
  function selectNotesUpTo(id) {
    const to = TC.score.findNote(S.doc, id);
    if (!to) return;
    const at = TC.score.tickOf(S.doc), b = at(to.bar, to.ev.tick);
    let a = null;
    for (const x of S.selection) {
      const h = TC.score.findNote(S.doc, x);
      if (h && h.track === to.track) a = a === null ? at(h.bar, h.ev.tick) : Math.min(a, at(h.bar, h.ev.tick));
    }
    if (a === null) { S.selection = new Set([id]); return; }
    const lo = Math.min(a, b), hi = Math.max(a, b), ids = new Set();
    to.track.bars.forEach((bar, bi) => bar.voices.forEach((v) => v.forEach((ev) => {
      const x = at(bi, ev.tick);
      if (x >= lo && x <= hi) ev.notes.forEach((n) => ids.add(n.id));
    })));
    S.selection = ids;
    TC.selectBar(to.bar);
  }

  /** The note of instrument `art` (melody: of pitch `pitch`) at `tick` in a bar of a track (any voice), or null. */
  function noteAt(bi, tick, art, track = TC.curTrack(), pitch) {
    for (const voice of track.bars[bi].voices) {
      for (const ev of voice) {
        if (ev.tick !== tick) continue;
        const n = ev.notes.find((x) => (pitch !== undefined ? x.pitch === pitch : x.art === art));
        if (n) return n;
      }
    }
    return null;
  }

  /** The instrument whose line is near staff point p (the "magnet"), or null beside the lines. */
  const lineArt = (p) => TC.drums.resolveIn(TC.render.posAt(p.y), p.track || TC.curTrack());
  const isMelody = (track) => !!track && track.kind === 'pitched';
  /** Melody: the voice notes are written into (panel: voice 1 / 2). */
  const melVoice = () => (S.input.voice === 1 ? 1 : 0);
  const de = () => TC.getLang && TC.getLang() === 'de';

  /**
   * Melody: the tone at staff point p in bar bi - the tone of the scale on the nearest line / space:
   * { line, pitch, dia, a, pale (outside the scale), acc (the sign it is written with, null: none) }.
   */
  function pitchAt(p, track, bi, tick, from) {
    const RD = TC.render, P = TC.pitch, raw = Math.round(RD.posAt(p.y));
    if (raw < RD.LINE_MIN || raw > RD.LINE_MAX) return null;
    const scale = TC.score.scaleAt(track, bi);
    // chord symbols: locked - only chord tones (the nearest one; dragging: from the side it comes from); marked - just said
    // scale locked ("Only scale tones"): a place outside the scale moves to the nearest one inside (the chords lead)
    const guide = TC.score.guideAt(S.doc, bi, track), at = tick !== undefined && guide !== 'off' ? TC.score.chordAt(S.doc, bi, tick) : null;
    const h = P.helpedTone(raw, (k) => P.diaAt(k, track.clef), scale, at && at.ch, guide, TC.score.scaleGuideOf(S.doc, track), from);
    const l = h.line, t = h.tone;
    if (t.pitch < 0 || t.pitch > 127) return null;
    const sig = P.sigAlter(P.fifths(scale), ((t.dia % 7) + 7) % 7);
    return { line: l, raw, pitch: t.pitch, dia: t.dia, a: t.a, pale: !t.in, acc: t.a !== sig ? t.a : null, chord: at && t.chord ? P.chordName(at.ch, de()) : '' };
  }
  /** Name of a melody note ("F♯4" / "Fis4"). */
  function toneName(n, track, bi) {
    const sp = TC.pitch.noteSpell(n, TC.score.scaleAt(track, bi));
    return TC.pitch.fullName(sp.dia, sp.a, de());
  }
  /** What a target writes / is: instrument or tone name (short: for the label at the note). */
  function targetName(t, short) {
    if (t.pitch !== undefined) return TC.pitch.fullName(t.dia, t.a, de()) + (t.pale ? ' · ' + tr('outside the scale') : '') + (t.chord && !short ? ' · ' + tr('in {chord}', { chord: t.chord }) : '');
    return TC.drums.label(t.art, short);
  }
  /** Name of the note of a hit (findNote). */
  const hitName = (hit, short) => (hit && hit.note.pitch !== undefined ? toneName(hit.note, hit.track, hit.bar) : TC.drums.label(hit && TC.drums.byId(hit.note.art), short));

  /**
   * Where a note would go at point p: { kind: 'place', bar, tick, line, art, lock } or null
   * (beside the lines, bar start, %-bar). keepArt: the instrument stays (lock, moving with lock).
   */
  function placeAt(p, e, keepArt, free) {
    const RD = TC.render;
    if (!p || p.x < p.sys.ox) return null;
    if (p.y < RD.stepY(RD.LINE_MIN) - 5 || p.y > RD.stepY(RD.LINE_MAX) + 5) return null;
    const track = p.track || TC.curTrack();
    if (S.drag && track !== TC.curTrack()) return null; // a note being aimed / moved stays in its track
    const bar = RD.barAt(p.x);
    if (!bar || RD.simileAt(bar, track) || p.x < bar.x0) return null;
    if (isMelody(track)) {
      // melody: every line and space (and the ledger lines around) holds a tone of the scale
      // (free: moving a note - the chords do not lock it)
      const tick = RD.snapTick(bar, p.x), pt = pitchAt(p, track, bar.i, free ? undefined : tick, S.drag && S.drag.t ? S.drag.t.raw : undefined);
      return pt && Object.assign({ kind: 'place', bar: bar.i, tick, track, len: TC.inputTicks(S.input) }, pt);
    }
    const near = lineArt(p);
    if (!near) return null; // beside the lines (also with the lock): that is where bars are chosen
    const tick = RD.snapTick(bar, p.x);
    const lock = I.locked(e);
    const own = TC.drums.ownKit(track) && !TC.drums.kit(track).has(S.input.art); // the lock keeps to the track's instruments
    const art = keepArt || (lock && !own ? TC.drums.byId(S.input.art) : near);
    return { kind: 'place', bar: bar.i, tick, line: TC.drums.lineOf(art, track), art, lock, track };
  }

  /** What a tap at point p (staff coordinates, null: off every line) would do. */
  function target(p, e) {
    const RD = TC.render, L = RD.layout;
    if (!L || !p) return null;
    const a = L.add;
    if (p.sys === L.systems[L.systems.length - 1] && (!p.staff || p.staff.k === 0) && p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y - 10 && p.y <= a.y + a.h + 10) return { kind: 'add' };
    if (p.x < p.sys.ox) {
      const ml = RD.mapLineAt(p);
      return ml === null ? null : { kind: 'map', line: ml, sys: p.sys.i, track: p.track };
    }
    const bar = RD.barAt(p.x);
    if (!bar) return null;
    const track = p.track || TC.curTrack();
    if (RD.simileAt(bar, track)) return { kind: 'bar', bar: bar.i, simile: true }; // "%" bar: nothing to write into
    if (!isMelody(track) && I.locked(e) && lineArt(p) && p.x >= bar.x0) {
      // the height does not matter: the selected instrument at this grid position
      const art = TC.drums.byId(S.input.art);
      const tick = RD.snapTick(bar, p.x);
      const n = noteAt(bar.i, tick, art.id, track);
      if (n) {
        const ln = TC.drums.lineOf(art, track);
        return { kind: 'head', bar: bar.i, tick, line: ln, lock: true,
          head: { id: n.id, x: RD.tickX(bar, tick), y: RD.stepY(ln), bar: bar.i, tick, line: ln, track } };
      }
    }
    if (!I.locked(e) || isMelody(track)) {
      const head = RD.headAt(p, e && e.pointerType === 'touch' ? RD.fingerReach(p) : null); // (a finger reaches further)
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
    const p = I.toLocal(e.clientX, e.clientY);
    const t = target(p, e);
    let h = null;
    if (t && (t.kind === 'place' || t.kind === 'head')) {
      h = { bar: t.bar, tick: t.tick, line: t.line, art: t.art || null, lock: !!t.lock };
      if (t.kind === 'head') {
        h.headId = t.head.id;
        h.hx = t.head.x;
        h.hy = t.head.y;
        const hit = TC.score.findNote(S.doc, t.head.id);
        const name = hitName(hit, true);
        const what = tr(S.selection.has(t.head.id) && S.selection.size === 1 ? 'click: delete' : 'click: select');
        h.label = `${name} – ${what}`;
        const hold = hit && hit.note.pitch !== undefined ? tr('drag: move · hold, then up / down: ♯ / ♭, sideways: length') : tr('drag: move · hold, then drag: row');
        TC.ui.status(`${where(t)} · ${name} – ${what} · ${hold}`);
      } else if (t.pitch !== undefined) {
        Object.assign(h, { pitch: t.pitch, acc: t.acc, len: 0, label: targetName(t, true) });
        TC.ui.status(`${where(t)} · ${targetName(t)} · ${tr('drag sideways while pressing: longer')}`);
      } else {
        h.label = TC.drums.label(t.art, true);
        TC.ui.status(`${where(t)} · ${TC.drums.label(t.art)}${t.lock ? ' · ' + tr('instrument lock') : ''}`);
      }
    } else if (t && t.kind === 'map') {
      h = { mapLine: t.line, sys: t.sys };
      TC.ui.status(TC.drums.lineArts(t.line, t.track).map((a) => TC.drums.label(a)).join(', ') +
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
    if (h && p && p.track) h.trk = p.track.id; // the staff under the pointer
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
  // holding still: on a note (row, strength, its menu) the hold is short; on an empty place of the lines
  // (bar menu instead of a note) longer, so a finger that takes a moment to aim still writes its note
  const NOTE_HOLD_MS = 350;
  const HOLD_MS = 500;
  const moveMin = (e) => (e.pointerType === 'touch' ? 10 : 6); // px before a press becomes a drag
  const fingerWrites = (e) => e.pointerType !== 'touch' || S.settings.fingerWrites !== false;
  const moved = (d, e) => Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= moveMin(e);
  /**
   * A finger / pen on a note has gone up / down by more than half a line - on a phone the lines lie closer
   * together than the drag threshold, so one line up would else count as holding the note.
   */
  function stepped(d, e) {
    if (e.pointerType === 'mouse' || d.row || d.pos0 === null || d.pos0 === undefined) return false;
    const q = I.toLocal(e.clientX, e.clientY);
    return !!q && Math.abs(TC.render.posAt(q.y) - d.pos0) >= 0.6 && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= 3;
  }

  function onPointerDown(e) {
    // lyrics (js/lyrics.js): a tap on a syllable (or under a note, in the rows of the lyrics) types there; while
    // typing, a tap elsewhere only ends it
    if ((e.button === 0 || e.pointerType === 'touch') && !touches.size && !S.drag && !A().isPerforming()) {
      const ly = TC.render.lyricAt(I.toWorld(e.clientX, e.clientY));
      if (ly) {
        e.preventDefault();
        if (TC.curTrack() !== ly.track) A().selectTrack(ly.track.id);
        return TC.lyrics.open(ly.track, ly.ev, ly.v);
      }
      if (TC.lyrics.isOpen()) {
        e.preventDefault();
        return TC.lyrics.close();
      }
    }
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
    // a handle of the selected dynamics sign / hairpin: dragged, it snaps to the notes and rests of its track
    const hz = !A().isPerforming() && toolOf(e) !== 'erase' && e.target && e.target.closest ? e.target.closest('[data-dynh]') : null;
    const dsel = hz && A().dynSelected();
    if (dsel) {
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
      const a0 = TC.score.absTick(S.doc, dsel.bar, dsel.t);
      S.drag = { mode: 'dynh', id: e.pointerId, sx: e.clientX, sy: e.clientY, down: e, which: hz.getAttribute('data-dynh'), a0, e0: dsel.w ? a0 + dsel.d.len : null, snaps: TC.render.dynSnaps(dsel.track), to: null };
      return;
    }
    // a dynamics sign or hairpin tapped: selected (changed in the panel); the eraser removes it - a note head under the
    // pointer wins (a sign right below a low note, a hairpin over it: the note is tapped, the sign beside it)
    let dz = !A().isPerforming() && e.target && e.target.closest ? e.target.closest('[data-dyn]') : null;
    if (dz) {
      const tp = target(I.toLocal(e.clientX, e.clientY), e);
      if (tp && tp.kind === 'head') dz = null;
    }
    if (dz) {
      const [tid, bar, t, kind] = dz.getAttribute('data-dyn').split('|');
      A().selectDyn(tid, Number(bar), Number(t), kind);
      if (toolOf(e) === 'erase') A().clearDyn();
      return;
    }
    try { vp.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
    // stage view: nothing is written; a tap in the right / left third turns the page, dragging moves it
    if (A().isPerforming()) return startPan(e);
    clearTimeout(holdTimer);
    // tools (note panel): select / eraser - a pen's eraser end always erases
    const tool = toolOf(e);
    if (tool === 'erase') return startErase(e);
    if (tool === 'select') return startSelect(e);
    let p = I.toLocal(e.clientX, e.clientY);
    if (p && p.track && p.track !== TC.curTrack()) {
      // pressed in the staff of another track: from now on it is the one being written
      A().selectTrack(p.track.id);
      p = I.toLocal(e.clientX, e.clientY);
    }
    let t = target(p, e);
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
      S.drag = Object.assign(base, { mode: 'note', t, hit, row: !touch && (e.ctrlKey || e.metaKey), pos0: p ? TC.render.posAt(p.y) : null });
      holdTimer = setTimeout(armRow, NOTE_HOLD_MS);
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
        TC.render.moveView();
        return;
      }
      case 'aim': return aimMove(e);
      case 'move': return moveMove(e);
      case 'write': return dragWrite(e);
      case 'dynh': return dynHandleMove(e);
      case 'note':
        if (!moved(d, e) && !stepped(d, e)) return;
        clearTimeout(holdTimer);
        // held (or Ctrl): the first movement decides - sideways a row, up / down the strength
        // (melody: up / down ♯ / ♭, sideways its length)
        if (d.row && d.hit.note.pitch !== undefined) return Math.abs(e.clientY - d.sy) > Math.abs(e.clientX - d.sx) ? beginAlter(e) : beginLen(e);
        if (d.row) return Math.abs(e.clientY - d.sy) > Math.abs(e.clientX - d.sx) ? beginVel(e) : beginRow(e);
        d.mode = 'move';
        return moveMove(e);
      case 'vel': return velMove(e);
      case 'alter': return alterMove(e);
      case 'len': return lenMove(e);
      case 'erase': return eraseMove(e);
      case 'rect': return rectMove(e);
      case 'sel':
        if (!moved(d, e) && !stepped(d, e)) return;
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
        TC.render.settleView(); // (released: drawn anew once it rests)
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
    if (d.mode === 'pan') TC.render.settleView(); // (the view was held while moved: drawn anew now)
    if (A().isPerforming() && d.mode === 'pan' && !cancelled && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < moveMin(e)) {
      const r = vp.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      if (x > 2 / 3) A().nextPage();
      else if (x < 1 / 3) A().prevPage();
      return;
    }
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
    if (d.mode === 'alter' || d.mode === 'len') finishMelodyEdit(d);
    if (d.mode === 'dynh') {
      TC.render.drawDynDrag(null);
      if (!cancelled && d.to && moved(d, e)) A().moveDynSel(d.which, d.to.abs);
    }
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
    if (S.drag && (S.drag.mode === 'alter' || S.drag.mode === 'len')) finishMelodyEdit(S.drag);
    if (S.drag && S.drag.mode === 'erase') finishErase(S.drag);
    if (S.drag && S.drag.mode === 'smove') finishSelMove(S.drag, true);
    if (S.drag && S.drag.mode === 'dynh') TC.render.drawDynDrag(null);
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
    TC.render.moveView();
    TC.ui.updateZoom();
  }

  /** Esc while a note is held: it is not written / moved. */
  I.cancelDrag = function () {
    const d = S.drag;
    if (!d || !['aim', 'note', 'move', 'vel', 'alter', 'len', 'smove', 'rect', 'sel'].includes(d.mode)) return false;
    if (d.mode === 'alter' || d.mode === 'len') {
      // the tone / length goes back to what it was
      d.undo();
      S.rev++;
      TC.render.draw();
    }
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
    if (t.pitch !== undefined) {
      S.hover = { bar: t.bar, tick: t.tick, line: t.line, pitch: t.pitch, acc: t.acc, len: t.len, stop: !!t.stop, label: targetName(t, true) };
      I.hoverKey = null;
      TC.render.drawHover();
      TC.ui.status(`${where(t)} · ${targetName(t)} · ${lengthName(t.len, t.bar)}${t.stop ? ' · ' + tr('up to the next note') : ''} · ${tr('sideways: longer · release: write')}`);
      if (sound && S.settings.sound) TC.audio.previewTone(t.pitch, TC.curTrack());
      return;
    }
    S.hover = { bar: t.bar, tick: t.tick, line: t.line, art: t.art, lock: !!t.lock, label: TC.drums.label(t.art, true) };
    I.hoverKey = null;
    TC.render.drawHover();
    TC.ui.status(`${where(t)} · ${TC.drums.label(t.art)} · ${tr('release: write')}`);
    if (sound && S.settings.sound) TC.audio.preview(TC.newDrumNote(t.art.id, S.input));
  }

  /**
   * Melody: the note being aimed at keeps its place in time; up / down chooses its tone, dragging
   * sideways makes it longer (up to the grid cell under the pointer, at most to the end of its bar).
   */
  function aimMelody(e) {
    const d = S.drag, RD = TC.render, p = I.toLocal(e.clientX, e.clientY);
    const start = d.start || (d.start = { bar: d.t.bar, tick: d.t.tick });
    const track = TC.curTrack(), pt = p && (!p.track || p.track === track) ? pitchAt(p, track, start.bar, start.tick, d.t ? d.t.raw : undefined) : null;
    if (!pt) {
      if (d.t) {
        d.t = null;
        clearHover();
        TC.ui.status(tr('release here: no note'));
      }
      return;
    }
    const len = dragLength(track, start.bar, start.tick, p);
    const t = Object.assign({ kind: 'place', bar: start.bar, tick: start.tick, track }, len, pt);
    if (d.t && d.t.line === t.line && d.t.len === t.len && !!d.t.stop === t.stop) return;
    const newSound = !d.t || d.t.pitch !== t.pitch;
    d.t = t;
    showAim(t, newSound);
  }

  /**
   * Melody: how long a note from (bar bi, tick) gets when dragged to point p: up to the grid cell under the
   * pointer (also in a later bar: tied across the bar lines), at least the note value of the panel - but it
   * stops at the next note of its voice (stop: true, the preview shows where). { len, stop }.
   */
  function dragLength(track, bi, tick, p) {
    const RD = TC.render, SC = TC.score, grid = RD.layout.grid;
    let len = TC.inputTicks(S.input);
    const bar = p && RD.barAt(p.x);
    if (bar && bar.i >= bi) len = Math.max(len, SC.absTick(S.doc, bar.i, RD.snapTick(bar, p.x)) + grid - SC.absTick(S.doc, bi, tick));
    const room = SC.melodyRoom(S.doc, track, bi, melVoice(), tick);
    return len > room ? { len: room, stop: true } : { len, stop: false };
  }

  /** "2 quarters", "1 bar + 1 quarter" … for the status bar. */
  function lengthName(ticks, bi) {
    const L = TC.barTicks(S.doc.bars[bi].ts);
    const q = (t) => (t % 960 === 0 ? `${t / 960} ${tr(t === 960 ? 'quarter' : 'quarters')}` : `${t / 480} ${tr(t === 480 ? 'eighth' : 'eighths')}`);
    if (ticks < L || ticks % 240) return ticks % 240 ? `${ticks} ${tr('ticks')}` : q(ticks);
    const bars = Math.floor(ticks / L), rest = ticks - bars * L;
    return `${bars} ${tr(bars === 1 ? 'bar' : 'bars')}${rest ? ' + ' + q(rest) : ''}`;
  }

  function aimMove(e) {
    const d = S.drag;
    if (moved(d, e)) clearTimeout(holdTimer); // aiming: no bar menu
    if ((d.t && d.t.pitch !== undefined) || d.start) return aimMelody(e);
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
   * Melody, writing chords (note panel "Write: chord / ↓ / ↑"): the chord of the chord symbols at that place, as long as
   * the note value - a guitar: a grip; else close from the tapped tone up (higher: an inversion higher). With a stroke
   * ↓ / ↑ when chosen. No chord there: said, nothing written.
   */
  function writeChord(t, sound) {
    const track = TC.curTrack(), at = TC.score.chordAt(S.doc, t.bar, t.tick);
    if (!at) {
      TC.ui.hint(tr('No chord here yet - set one in the panel "Bar · score" → Chords (or write single tones: "Tone").'));
      TC.refresh();
      return false;
    }
    const len = t.len || TC.inputTicks(S.input), stroke = S.input.chordMode === 'd' || S.input.chordMode === 'u' ? S.input.chordMode : null;
    // (the size chosen in the panel: as the symbol, a triad, a four-note chord, a power chord)
    const size = S.input.chordSize || '', ch = TC.accomp.resize(at.ch, size, TC.score.harmonyScale(S.doc, t.bar));
    // (a VST playing at most four tones - Iron: its profile says so - gets the tight grips)
    const tight = !!S.input.chordTight || !!(track.ksw && track.ksw.poly && track.ksw.poly <= 4);
    const notes = TC.accomp.chordNotes(ch, track, t.pitch, size, { tight });
    let n = 0;
    notes.forEach((x) => {
      const note = TC.newPitchNote(x.pitch, x.dia, S.input);
      note.chordNote = true; // (written as a chord: held + down / up gives its stroke)
      if (stroke) note.stroke = stroke;
      const res = TC.score.place(S.doc, track, t.bar, melVoice(), t.tick, len, note);
      if (res.status === 'added' || res.status === 'chord') n++;
      if (res.status === 'added' && len > res.ev.dur) TC.score.setMelodyLength(S.doc, track, t.bar, melVoice(), res.ev, len);
    });
    if (!n) { TC.refresh(); return false; }
    TC.commit();
    if (sound && S.settings.sound) notes.forEach((x, k) => TC.audio.previewTone(x.pitch, track, stroke ? (stroke === 'u' ? notes.length - 1 - k : k) * 0.012 : 0));
    TC.ui.status(`${where(t)} · ${TC.pitch.chordName(at.ch, de())}${size ? ' · ' + tr({ 3: 'Triad', 4: 'Four-note chord', 5: 'Power chord' }[size]) : ''}${stroke ? ' ' + (stroke === 'd' ? '↓' : '↑') : ''}`);
    return true;
  }

  /**
   * Write the note of target t (kind 'place'). Already there: it is selected instead.
   * Returns true when the score changed (one undo step).
   */
  function writeNote(t, sound) {
    S.selection.clear();
    TC.selectBar(t.bar);
    if (t.pitch !== undefined && S.input.chordMode) return writeChord(t, sound);
    if (t.pitch !== undefined) {
      // melody: the tone of that line, as long as chosen (dragged sideways), in the voice chosen in the panel
      const note = TC.newPitchNote(t.pitch, t.dia, S.input), len = t.len || TC.inputTicks(S.input);
      const res = TC.score.place(S.doc, TC.curTrack(), t.bar, melVoice(), t.tick, len, note);
      if (res.status === 'exists') {
        S.selection = new Set([res.note.id]);
        TC.refresh();
        return false;
      }
      // longer than its bar: tied on into the next bars
      if (res.status === 'added' && len > res.ev.dur) TC.score.setMelodyLength(S.doc, TC.curTrack(), t.bar, melVoice(), res.ev, len);
      TC.commit();
      if (sound && S.settings.sound) TC.audio.previewTone(t.pitch, TC.curTrack());
      TC.ui.status(`${where(t)} · ${targetName(t)}`);
      return true;
    }
    const art = t.art;
    const note = TC.newDrumNote(art.id, S.input);
    const res = TC.score.place(S.doc, TC.curTrack(), t.bar, art.voice, t.tick, TC.inputTicks(S.input), note);
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
      const arts = TC.drums.lineArts(t.line);
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
    S.dynSel = null;
    if (t.kind === 'head' && e.shiftKey && S.selection.size) {
      // Shift + tap a note: the notes from the one selected before up to this one (e.g. a hairpin to its target note)
      selectNotesUpTo(t.head.id);
      TC.refresh();
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
    if (n.pitch !== undefined) return moveMelody(e);
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

  /**
   * Melody: a note being dragged - sideways in time, up / down to the tone of the scale on that line; the chords /
   * the scale locked: their tones only, as a tap writes them (Shift held: free - ♯ / ♭ in the note menu alter it too).
   */
  function moveMelody(e) {
    const d = S.drag, n = d.hit.note;
    let to = placeAt(I.toLocal(e.clientX, e.clientY), e, null, !!e.shiftKey);
    if (to && to.track !== d.hit.track) to = null;
    if (to && d.to && to.bar === d.to.bar && to.tick === d.to.tick && to.pitch === d.to.pitch) return;
    const newSound = to && (!d.to || to.pitch !== d.to.pitch);
    d.to = to;
    if (!to) {
      S.hover = { bar: d.t.bar, tick: d.t.tick, line: d.t.line, headId: n.id, hx: d.t.head.x, hy: d.t.head.y, label: tr('release here: stays') };
    } else {
      S.hover = { bar: to.bar, tick: to.tick, line: to.line, pitch: to.pitch, acc: to.acc, len: 0, label: targetName(to, true) + ' ← ' + tr('move') };
      TC.ui.status(`${where(to)} · ${targetName(to)} · ${tr('release: move here')}`);
      if (newSound && S.settings.sound) TC.audio.previewTone(to.pitch, d.hit.track);
    }
    I.hoverKey = null;
    TC.render.drawHover();
  }

  function dropMove(d) {
    const to = d.to, n = d.hit.note;
    if (to && n.pitch !== undefined && n.chordNote && d.hit.ev.notes.length > 1) return dropChord(d, to);
    if (to && n.pitch !== undefined) {
      if (to.bar === d.hit.bar && to.tick === d.hit.ev.tick && to.pitch === n.pitch) return;
      if (noteAt(to.bar, to.tick, null, d.hit.track, to.pitch)) return TC.ui.hint(tr('There is already such a note'));
      // the note with the notes tied on from it: as long as before, from its new place (tied again if it needs to)
      const SC = TC.score, chain = SC.tieChain(S.doc, n.id).filter((c, k, all) => k >= all.findIndex((x) => x.note.id === n.id));
      const total = SC.chainTicks(chain);
      SC.removeNotes(S.doc, chain.map((c) => c.note.id));
      const moved = Object.assign({}, n, { pitch: to.pitch, dia: to.dia });
      delete moved.tie;
      const res = SC.place(S.doc, d.hit.track, to.bar, d.hit.voice, to.tick, total, moved);
      if (res.status === 'added' && total > res.ev.dur) SC.setMelodyLength(S.doc, d.hit.track, to.bar, d.hit.voice, res.ev, total);
      S.selection = new Set([res.note ? res.note.id : n.id]);
      TC.selectBar(to.bar);
      TC.commit();
      TC.ui.status(`${where(to)} · ${targetName(to)} · ${tr('moved')}`);
      return;
    }
    if (!to || (to.bar === d.hit.bar && to.tick === d.hit.ev.tick && to.art.id === n.art)) return;
    const doc = S.doc, track = TC.curTrack();
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

  /**
   * A chord written as a chord, dragged: the whole chord moves (with the notes tied on from it) - sideways in time,
   * up / down every tone by as many lines (tones of the scale) as the dragged one. One undo step.
   */
  function dropChord(d, to) {
    const SC = TC.score, P = TC.pitch, ids = d.hit.ev.notes.map((x) => x.id);
    const all = [...new Set(ids.concat(SC.tiedOn(S.doc, ids)))];
    const delta = SC.absTick(S.doc, to.bar, to.tick) - SC.absTick(S.doc, d.hit.bar, d.hit.ev.tick), k = to.line - d.t.line;
    if (!delta && !k) return;
    const barOf = new Map(all.map((id) => [id, (SC.findNote(S.doc, id) || { bar: 0 }).bar]));
    const lines = (x) => {
      const sc = SC.scaleAt(d.hit.track, barOf.get(x.id) || 0), t = P.lineTone(P.noteSpell(x, sc).dia - k, sc);
      return t.pitch >= 0 && t.pitch <= 127 ? { pitch: t.pitch, dia: t.dia } : null;
    };
    if (!SC.moveNotes(S.doc, all, delta, null, k ? lines : null)) return TC.ui.hint(tr('The chord does not fit there (another note in the way)'));
    S.selection = new Set(ids);
    TC.selectBar(to.bar);
    TC.commit();
    TC.ui.status(`${where(to)} · ${tr('chord moved')}`);
  }

  // ---- A row of notes (hold a note, then drag; mouse: Ctrl + drag) ------------------------------

  /** Held long enough on a note: dragging now writes a row of its instrument. */
  function armRow() {
    const d = S.drag;
    if (!d || d.mode !== 'note') return;
    d.row = true;
    d.held = true; // released without moving: the menu with the instruments of this line
    if (navigator.vibrate) navigator.vibrate(15);
    if (d.hit.note.pitch !== undefined) {
      const name = hitName(d.hit, true);
      S.hover = { bar: d.t.bar, tick: d.t.tick, line: d.t.line, headId: d.t.head.id, hx: d.t.head.x, hy: d.t.head.y,
        label: `${name} – ${tr('up / down: ♯ / ♭ · sideways: length · release: menu')}` };
      I.hoverKey = null;
      TC.render.drawHover();
      TC.ui.status(`${where(d.t)} · ${name} · ${tr('up / down: a semitone higher / lower (♯ / ♭) · sideways: how long · release: menu')}`);
      return;
    }
    const art = TC.drums.byId(d.hit.note.art);
    S.hover = { bar: d.t.bar, tick: d.t.tick, line: d.t.line, headId: d.t.head.id, hx: d.t.head.x, hy: d.t.head.y,
      label: `${TC.drums.label(art, true)} – ${tr('sideways: row · up / down: strength · release: instrument')}` };
    I.hoverKey = null;
    TC.render.drawHover();
    TC.ui.status(`${where(d.t)} · ${TC.drums.label(art)} · ${tr('sideways: row of notes · up / down: strength (ghost … accent) · release: choose the instrument of the line')}`);
  }

  // ---- Strength: hold a note, then up / down (ghost · soft · normal · strong · accent) ------------------------
  // the held note - or all selected notes, if it is one of them; one undo step on release

  const VEL_STEP = 22; // px per step
  const LEVELS = TC.STRENGTHS.map((s) => s.label); // ghost · soft · normal · strong · accent (model.js)
  const levelOf = TC.levelOf;
  const setLevel = TC.setLevel;

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
    const lv = TC.clamp(d.level0 + Math.round((d.sy - e.clientY) / VEL_STEP), 0, LEVELS.length - 1); // up: stronger
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
    if (d.hit.note.pitch !== undefined) return melodyMenu(d, e);
    const n = d.hit.note, a = TC.drums.byId(n.art);
    if (!a) return;
    const ids = S.selection.has(n.id) && S.selection.size > 1 ? [...S.selection] : [n.id];
    const arts = TC.drums.lineArts(TC.drums.lineOf(a, d.hit.track), d.hit.track, n.art);
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
      setHover(p ? { sys: p.sys.i, trk: p.track.id, erase: { x: p.x, y: p.y } } : null);
      TC.ui.status(tr('Eraser: tap or wipe over notes'));
      vp.style.cursor = 'crosshair';
      return;
    }
    const head = p && TC.render.headAt(p);
    setHover(head ? { bar: head.bar, trk: head.track.id, ring: { x: head.x, y: head.y } } : null);
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
    setHover(p ? { sys: p.sys.i, trk: p.track.id, erase: { x: p.x, y: p.y, on: true } } : null);
  }
  function finishErase(d) {
    if (d.n) TC.commit();
    else TC.refresh();
  }

  // select

  function startSelect(e) {
    const p = I.toLocal(e.clientX, e.clientY), head = p && TC.render.headAt(p, e.pointerType === 'touch' ? TC.render.fingerReach(p) : null);
    const add = !!(e.shiftKey || e.ctrlKey || e.metaKey);
    const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, down: e, add, pos0: p ? TC.render.posAt(p.y) : null };
    if (head) {
      const hit = TC.score.findNote(S.doc, head.id);
      if (!hit) return;
      S.drag = Object.assign(base, { mode: 'sel', hit, head, t: { bar: head.bar, tick: head.tick, line: head.line, head } });
      holdTimer = setTimeout(() => {
        const d = S.drag;
        if (!d || d.mode !== 'sel') return;
        d.held = true; // released without moving: the menu (instrument / strength) for the selection
        if (navigator.vibrate) navigator.vibrate(15);
      }, NOTE_HOLD_MS);
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
    const d = S.drag, SC = TC.score;
    if (!d.orig) {
      if (!S.selection.has(d.head.id)) S.selection = d.add ? new Set([...S.selection, d.head.id]) : new Set([d.head.id]);
      d.ids = [...S.selection];
      d.mel = d.hit.note.pitch !== undefined;
      if (d.mel) {
        // melody: the tied notes go along; up / down: by lines (tones of the scale of each note's bar)
        // (a chord written as a chord: all its tones go along)
        d.ids.slice().forEach((id) => { const h = SC.findNote(S.doc, id); if (h && h.note.chordNote) h.ev.notes.forEach((x) => { if (!d.ids.includes(x.id)) d.ids.push(x.id); }); });
        d.ids = [...new Set(d.ids.concat(SC.tiedOn(S.doc, d.ids)))];
        d.barOf = new Map(d.ids.map((id) => [id, (SC.findNote(S.doc, id) || { bar: 0 }).bar]));
        // (chords locked: where each note lands; a tied note follows the first note of its chain)
        d.absOf = new Map(d.ids.map((id) => { const h = SC.findNote(S.doc, id); return [id, h ? SC.absTick(S.doc, h.bar, h.ev.tick) : 0]; }));
        const moving = new Set(d.ids);
        d.rootOf = new Map(d.ids.map((id) => { const c = SC.tieChain(S.doc, id)[0]; return [id, c && moving.has(c.note.id) ? c.note.id : id]; }));
      }
      d.orig = JSON.stringify(S.doc.tracks);
      d.from = SC.absTick(S.doc, d.head.bar, d.head.tick);
      const arts = new Set(d.ids.map((id) => (SC.findNote(S.doc, id) || { note: {} }).note.art));
      d.oneArt = arts.size === 1 ? [...arts][0] : null; // up / down only for one instrument
      d.good = { delta: 0, art: null, dl: 0 };
    }
    const p = I.toLocal(e.clientX, e.clientY);
    const bar = p && TC.render.barAt(p.x);
    if (!bar || TC.render.simileAt(bar, d.hit.track) || p.x < bar.x0) return;
    const delta = SC.absTick(S.doc, bar.i, TC.render.snapTick(bar, p.x)) - d.from;
    let art = null, dl = 0;
    if (d.mel) {
      if (p.track && p.track.id === d.hit.track.id) dl = Math.round(TC.render.posAt(p.y)) - d.head.line;
    } else if (d.oneArt && !I.locked(e) && p.track && p.track.id === d.hit.track.id) { // (by id: the tracks are rebuilt while moving)
      const a = lineArt(p);
      if (a && a.id !== d.oneArt) art = a.id;
    }
    if (delta === d.good.delta && art === d.good.art && dl === d.good.dl) return;
    // up / down by k lines: the tone of the scale there - chords locked ("Only chord tones") where the note lands:
    // the nearest chord tone (equally near: the one on the side it comes from), as a tap writes it (pitchAt)
    const lines = (k, dt) => (n) => {
      const P = TC.pitch, sc = SC.scaleAt(d.hit.track, d.barOf.get(n.id) || 0), dia0 = P.noteSpell(n, sc).dia;
      let t = P.lineTone(dia0 - k, sc);
      const pos = SC.atAbs(S.doc, d.absOf.get(d.rootOf.get(n.id)) + dt);
      const at = pos && SC.guideAt(S.doc, pos.bar, d.hit.track) === 'lock' ? SC.chordAt(S.doc, pos.bar, pos.tick) : null;
      const sg = SC.scaleGuideOf(S.doc, d.hit.track);
      if (at || sg === 'lock') {
        // (x = -dia: like lines, larger is lower)
        const sct = pos ? SC.scaleAt(d.hit.track, pos.bar) : sc;
        t = P.helpedTone(-(dia0 - k), (x) => -x, sct, at && at.ch, at ? 'lock' : 'off', sg, -dia0).tone;
      }
      return t.pitch >= 0 && t.pitch <= 127 ? { pitch: t.pitch, dia: t.dia } : null;
    };
    const apply = (dt, a, k) => {
      S.doc.tracks = JSON.parse(d.orig);
      return (!dt && !a && !k) || SC.moveNotes(S.doc, d.ids, dt, a, k ? lines(k, dt) : null);
    };
    if (apply(delta, art, dl)) d.good = { delta, art, dl };
    else apply(d.good.delta, d.good.art, d.good.dl);
    S.rev++;
    TC.render.draw();
    const pos = SC.atAbs(S.doc, d.from + d.good.delta);
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
    if (d.good.delta || d.good.art || d.good.dl) TC.commit();
    else TC.refresh();
  }

  function finishVel(d) {
    const changed = d.notes.some((n, k) => n.ghost !== d.before[k].ghost || n.accent !== d.before[k].accent || n.vel !== d.before[k].vel);
    if (changed) TC.commit();
    else TC.refresh();
  }

  // ---- Melody: hold a note, then up / down (♯ / ♭) or sideways (its length) ---------------------------
  // the held note - for ♯ / ♭ all selected notes, if it is one of them; one undo step on release, Esc: back

  /**
   * The held note's selection (or the held note alone) with the notes tied on from them: [{ hit, sp }] -
   * sp: the spelling of the first note of its tied chain (the tied ones change with it).
   */
  function heldNotes(d) {
    const held = d.hit.note, seen = new Set(), out = [];
    const ids = S.selection.has(held.id) && S.selection.size > 1 ? [...S.selection] : [held.id];
    ids.forEach((id) => {
      const ch = TC.score.tieChain(S.doc, id);
      if (!ch.length || ch[0].note.pitch === undefined || seen.has(ch[0].note.id)) return;
      const sp = TC.pitch.noteSpell(ch[0].note, TC.score.scaleAt(ch[0].track, ch[0].bar));
      ch.forEach((c) => { seen.add(c.note.id); out.push({ hit: c, sp }); });
    });
    return out;
  }

  function beginAlter(e) {
    const d = S.drag, list = heldNotes(d);
    // a chord written as a chord (note.chordNote): held and moved down - a down stroke ↓, up - an up stroke ↑ (its tones stay)
    if (d.hit.note.chordNote) {
      const evs = [...new Set([d.hit.ev].concat(list.filter((x) => x.hit.note.chordNote).map((x) => x.hit.ev)))];
      const notes = [].concat(...evs.map((ev) => ev.notes)), was = notes.map((n) => n.stroke || '');
      S.drag = { mode: 'alter', strum: true, id: d.id, sx: d.sx, sy: d.sy, t: d.t, hit: d.hit, notes, k: null,
        undo: () => notes.forEach((n, j) => { if (was[j]) n.stroke = was[j]; else delete n.stroke; }),
        changed: () => notes.some((n, j) => (n.stroke || '') !== was[j]) };
      return alterMove(e);
    }
    const before = list.map((x) => ({ pitch: x.hit.note.pitch, dia: x.hit.note.dia }));
    S.drag = { mode: 'alter', id: d.id, sx: d.sx, sy: d.sy, t: d.t, hit: d.hit, list, k: null,
      undo: () => list.forEach((x, j) => Object.assign(x.hit.note, before[j])),
      changed: () => list.some((x, j) => x.hit.note.pitch !== before[j].pitch || x.hit.note.dia !== before[j].dia) };
    alterMove(e);
  }
  function alterMove(e) {
    const d = S.drag;
    if (d.strum) {
      // the stroke of the chord: up ↑ / down ↓ (back to the middle: as it was)
      const k = Math.sign(Math.round((d.sy - e.clientY) / VEL_STEP));
      if (k === d.k) return;
      d.k = k;
      d.undo();
      if (k) d.notes.forEach((n) => { n.stroke = k > 0 ? 'u' : 'd'; });
      S.rev++;
      TC.render.draw();
      const label = k > 0 ? '↑ ' + tr('Up stroke') : k < 0 ? '↓ ' + tr('Down stroke') : tr('as it was');
      S.hover = { bar: d.t.bar, headId: d.t.head.id, hx: d.t.head.x, hy: d.t.head.y, label: `${label} – ${tr('Esc: back')}` };
      I.hoverKey = null;
      TC.render.drawHover();
      TC.ui.status(`${where(d.t)} · ${label}`);
      return;
    }
    // a semitone per step up / down, on the note's own line (at most a double sharp / flat)
    const k = TC.clamp(Math.round((d.sy - e.clientY) / VEL_STEP), -4, 4);
    if (k === d.k) return;
    d.k = k;
    d.list.forEach(({ hit, sp }) => {
      const to = TC.pitch.alter(sp, TC.clamp(k, -2 - sp.a, 2 - sp.a));
      if (to) Object.assign(hit.note, to);
    });
    S.rev++;
    TC.render.draw();
    const name = hitName(d.hit, true);
    if (S.settings.sound) TC.audio.previewTone(d.hit.note.pitch, d.hit.track);
    S.hover = { bar: d.t.bar, headId: d.t.head.id, hx: d.t.head.x, hy: d.t.head.y, label: `${name} – ${tr('Esc: back')}` };
    I.hoverKey = null;
    TC.render.drawHover();
    const n = new Set(d.list.map((x) => x.sp)).size;
    TC.ui.status(`${where(d.t)} · ${name}${n > 1 ? ' · ' + tr('{n} notes', { n }) : ''}`);
  }

  /**
   * Hold a melody note, then sideways: its length - up to the grid cell under the pointer, tied on into
   * the next bars, stopping at the next note. Every step starts again from the score as it was.
   */
  function beginLen(e) {
    const d = S.drag, orig = JSON.stringify(S.doc.tracks);
    S.drag = { mode: 'len', id: d.id, sx: d.sx, sy: d.sy, t: d.t, hit: d.hit, noteId: d.hit.note.id, len: null, orig,
      undo: () => { S.doc.tracks = JSON.parse(orig); }, changed: () => JSON.stringify(S.doc.tracks) !== orig };
    lenMove(e);
  }
  function lenMove(e) {
    const d = S.drag, p = I.toLocal(e.clientX, e.clientY), SC = TC.score;
    d.undo(); // start again from the score as it was
    const h = SC.tieChain(S.doc, d.noteId)[0]; // (from the first note of its chain)
    if (!h) return;
    SC.removeNotes(S.doc, SC.tiedOn(S.doc, h.ev.notes.map((n) => n.id))); // its tied notes do not stop it
    const want = dragLength(h.track, h.bar, h.ev.tick, p);
    d.len = want.len;
    d.hit = Object.assign({}, d.hit, h);
    const got = SC.setMelodyLength(S.doc, h.track, h.bar, h.voice, h.ev, want.len);
    S.rev++;
    TC.render.draw();
    S.hover = { bar: d.t.bar, headId: d.t.head.id, hx: d.t.head.x, hy: d.t.head.y, label: `${hitName(h, true)} – ${tr('Esc: back')}` };
    I.hoverKey = null;
    TC.render.drawHover();
    TC.ui.status(`${where(d.t)} · ${tr('Length')}: ${lengthName(got, h.bar)}${want.stop ? ' · ' + tr('up to the next note') : ''}`);
  }
  function finishMelodyEdit(d) {
    if (d.changed()) TC.commit();
    else TC.refresh();
  }

  /** A melody note held and released without moving: ♯ / ♭, written the other way, strength, delete. */
  function melodyMenu(d, e) {
    const n = d.hit.note, P = TC.pitch;
    const ids = S.selection.has(n.id) && S.selection.size > 1 ? [...S.selection] : [n.id];
    const choose = (fn) => () => {
      S.selection = new Set(ids);
      TC.selectBar(d.t.bar);
      fn();
      if (S.settings.sound) TC.audio.previewTone(n.pitch, d.hit.track);
    };
    const sp = P.noteSpell(n, TC.score.scaleAt(d.hit.track, d.hit.bar));
    const alt = P.enharmonics(n.pitch, sp.dia)[0];
    const items = [
      { label: '♯ ' + tr('a semitone higher'), action: choose(() => A().alterSelection(1)) },
      { label: '♭ ' + tr('a semitone lower'), action: choose(() => A().alterSelection(-1)) },
    ];
    if (alt) items.push({ label: tr('Write as {name}', { name: P.name(((alt.dia % 7) + 7) % 7, alt.a, de()) }), action: choose(() => A().respell()) });
    // found by "Check notes" (does not fit the chord): to the nearest chord tone
    const found = A().checking() && A().checked().byNote.get(n.id);
    if (found && found.includes('chord')) items.push({ label: '◎ ' + tr('To the nearest chord tone'), action: choose(() => A().noteToChord(n.id)) });
    // a tie to the next note, when it is the same tone and starts where this one ends (also in the next bar) - or after
    // a rest: this note then fills it
    const next = TC.score.chordTies(S.doc, d.hit.track, d.hit.bar, d.hit.voice, d.hit.ev); // (a chord: all its tones the next one has)
    if (next) {
      items.push({ label: '⁀ ' + tr(next.gap ? 'Tie to the next note (fills the rest)' : 'Tie to the next note'), checked: next.all, action: () => {
        TC.score.tieChord(S.doc, d.hit.track, d.hit.bar, d.hit.voice, d.hit.ev, !next.all);
        TC.commit();
      } });
      const one = next.targets.length > 1 && TC.score.tieTarget(S.doc, d.hit.track, d.hit.bar, d.hit.voice, d.hit.ev, n);
      if (one) items.push({ label: '⁀ ' + tr('Tie only this tone'), checked: !one.gap && !!one.note.tie && !next.all, action: () => {
        if (one.gap) d.hit.ev.dur += one.gap;
        if (one.note.tie && !one.gap) delete one.note.tie;
        else one.note.tie = true;
        TC.commit();
      } });
    }
    items.push('-');
    const lv = levelOf(n);
    LEVELS.forEach((s, k) => items.push({
      label: tr(s), checked: lv === k,
      action: choose(() => {
        ids.forEach((id) => { const h = TC.score.findNote(S.doc, id); if (h) setLevel(h.note, k); });
        TC.commit();
      }),
    }));
    // a stroke (strummed chord): down / up / none - for the whole chord
    const sk = (d.hit.ev.notes.find((x) => x.stroke) || {}).stroke || '';
    items.push('-', ...[['d', '↓ ' + tr('Down stroke')], ['u', '↑ ' + tr('Up stroke')], ['', '– ' + tr('No stroke')]].map(([v, l]) => ({
      label: l, checked: sk === v, action: choose(() => { S.selection = new Set(ids); A().setStroke(v); }),
    })));
    // lyrics: type the syllable of this note (and on from there)
    items.push('-', { label: '✎ ' + tr('Lyrics (Ctrl+L)'), action: () => {
      S.selection = new Set([n.id]);
      A().startLyrics();
    } });
    items.push('-', { label: '🗑 ' + tr('Delete'), action: () => { S.selection = new Set(ids); A().deleteSelection(); } });
    TC.menu.open(items, e.clientX + 14, e.clientY - 24);
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
      if (!TC.curTrack().bars[b].simile) out.push([b, t]);
      t += step;
    }
    return out;
  }

  function dragWrite(e) {
    const d = S.drag, RD = TC.render;
    const p = I.toLocal(e.clientX, e.clientY);
    const bar = p && RD.barAt(p.x);
    if (!bar || RD.simileAt(bar, TC.curTrack()) || p.x < bar.x0) return;
    const tick = RD.snapTick(bar, p.x);
    const row = between(d.bar, d.tick, bar.i, tick);
    if (!row.length) return;
    let added = 0;
    for (const [bi, tk] of row) {
      const note = TC.newDrumNote(d.art.id, S.input);
      const res = TC.score.place(S.doc, TC.curTrack(), bi, d.art.voice, tk, TC.inputTicks(S.input), note);
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
      TC.render.moveView();
    } else {
      S.doc.view.x -= dx + dy; // the endless staff runs sideways (Shift: up / down)
      TC.render.moveView();
    }
    lastMove = e;
    if (!raf) raf = requestAnimationFrame(updateHover);
  }

  function onContextMenu(e) {
    e.preventDefault();
    // a finger held down opens the menu by itself (above); the browser's own long-press menu is ignored
    if (!e.fromHold && (touches.size || Date.now() - lastTouch < 1000)) return;
    let p = I.toLocal(e.clientX, e.clientY);
    if (p && p.track && p.track !== TC.curTrack()) {
      A().selectTrack(p.track.id); // the bar menu acts on the track of that staff (%, clear)
      p = I.toLocal(e.clientX, e.clientY);
    }
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
    const checkOpen = TC.kits && TC.kits.isCheckOpen(), kitsOpen = TC.kits && TC.kits.isOpen(), midiOpen = TC.midiIn && TC.midiIn.isOpen();
    const dbOpen = TC.dropbox && TC.dropbox.isOpen(), setOpen = TC.panel.isSettingsOpen();
    if (checkOpen || kitsOpen || midiOpen || dbOpen || setOpen) {
      if (e.key === 'Escape') {
        if (checkOpen) TC.kits.closeCheck();
        else if (kitsOpen) TC.kits.close();
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
      else if (lk === 'c' && e.altKey && !isTyping(e)) A().copyTrackBar(); // (only the track being written; Ctrl+Shift+C: the browser's inspector)
      else if (lk === 'c' && !isTyping(e)) A().copyBar();
      else if (lk === 'v' && !isTyping(e)) A().pasteBar();
      else if (lk === 'd') A().duplicateBar();
      else if (lk === 'l' && e.shiftKey) A().toggleLyrics();
      else if (lk === 'l' && TC.curTrack() && TC.curTrack().kind === 'pitched') A().startLyrics(); // lyrics (as in MuseScore)
      else if (lk === 'a' && !isTyping(e)) A().selectAll();
      else if ((k === 'ArrowUp' || k === 'ArrowDown') && S.selection.size && !isTyping(e)) A().octaveSelection(k === 'ArrowUp' ? 1 : -1); // melody: an octave
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
    // pages: Page Down / Up (also what page turning pedals send); stage view: the arrows too, Esc leaves it
    const stage = A().isPerforming();
    if (k === 'PageDown' || (stage && (k === 'ArrowRight' || k === 'ArrowDown'))) { A().nextPage(); e.preventDefault(); return; }
    if (k === 'PageUp' || (stage && (k === 'ArrowLeft' || k === 'ArrowUp'))) { A().prevPage(); e.preventDefault(); return; }
    if (stage && k === 'Escape') { A().togglePerform(); e.preventDefault(); return; }
    if (stage) return; // nothing else is written on stage
    if (/^[1-7]$/.test(k)) A().setValue(TC.VALUES[+k - 1]);
    else if (k === '.') A().toggleDotted();
    else if (k === 't' || k === 'T') A().toggleTriplet();
    else if (k === 'a' || k === 'A') A().toggleAccent();
    else if (k === 'g' || k === 'G') A().toggleGhost();
    else if (k === 'Delete' || k === 'Backspace') A().deleteSelection();
    else if (k === 'Escape') A().selectNone();
    else if (k === 'Home') A().home();
    else if ((k === 'ArrowUp' || k === 'ArrowDown') && S.selection.size && e.altKey) A().alterSelection(k === 'ArrowUp' ? 1 : -1); // melody: ♯ / ♭
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
