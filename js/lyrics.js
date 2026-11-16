'use strict';
/*
 * Typing lyrics: a small field under a note of a melody track (voice 1). The data and the rules are in
 * js/model.js (SC.lyricSlots, SC.splitLyrics, SC.spreadLyrics), the drawing in js/render.js.
 *
 *   Space (or "_")      the syllable is done, on to the next note (an empty field: the note is left out - melisma)
 *   -                   the word goes on: hyphen, on to the next note
 *   Tab / Shift+Tab     next / previous note       ← → at the end / start of the text: the same
 *   Backspace (empty)   back to the note before
 *   ↑ ↓                 the verse above / below
 *   Enter               done                       Esc: done, this field unchanged
 *
 * Pasted text spreads over the notes ("Al-le mei-ne Ent-chen"). Everything typed in one go is one undo step.
 * Works with an on-screen keyboard too: the separators are read from the text, not from the keys.
 */
(function (TC) {
  const S = TC.state;
  const LY = (TC.lyrics = {});
  const tr = (s, v) => TC.tr(s, v);
  let field = null, help = null, steps = 0, before = '';

  LY.isOpen = () => !!S.lyricEdit;

  const trackOf = () => S.lyricEdit && S.doc.tracks.find((t) => t.id === S.lyricEdit.track);
  const slotsOf = (t) => TC.score.lyricSlots(S.doc, t);

  /**
   * Start typing in the track being written: at the selected note (voice 1, or the note of voice 1 nearest to it),
   * else at the first note without a syllable in the verse (S.lyricVerse), else at the first note.
   */
  LY.start = function (v) {
    const t = TC.curTrack();
    if (!t || t.kind !== 'pitched') return TC.ui.hint(tr('Lyrics: only in a melody track'));
    const slots = slotsOf(t);
    if (!slots.length) return TC.ui.hint(tr('Lyrics: write the notes first, then their syllables'));
    v = TC.clamp(v === undefined ? S.lyricVerse || 0 : v, 0, TC.score.LYRIC_VERSES - 1);
    let k = -1;
    const sel = [...S.selection].map((id) => TC.score.findNote(S.doc, id)).filter((h) => h && h.track === t);
    if (sel.length) {
      const h = sel.sort((a, b) => a.bar - b.bar || a.ev.tick - b.ev.tick)[0];
      k = slots.findIndex((s) => s.ev === h.ev);
      if (k < 0) k = slots.findIndex((s) => s.bar > h.bar || (s.bar === h.bar && s.ev.tick >= h.ev.tick));
    }
    if (k < 0) k = slots.findIndex((s) => !TC.score.lyricOf(s.ev, v));
    LY.open(t, slots[Math.max(0, k)].ev, v);
  };

  /** Open the field at event ev of track t, verse v. */
  LY.open = function (t, ev, v) {
    if (S.lyricEdit) finish(false);
    steps = 0;
    S.lyricVerse = v;
    S.selection.clear();
    show(t, ev, v);
  };

  function show(t, ev, v) {
    const bar = slotsOf(t).find((s) => s.ev === ev);
    if (!bar) return closeField();
    S.lyricEdit = { track: t.id, ev, v, bar: bar.bar };
    TC.selectBar(bar.bar);
    before = TC.score.lyricOf(ev, v);
    if (!field) make();
    field.value = before;
    TC.refresh(); // (the row of a new verse; the syllable under the field is hidden)
    LY.place(true);
    field.focus({ preventScroll: true });
    field.select();
  }

  function make() {
    const vp = document.getElementById('viewport');
    field = document.createElement('input');
    field.type = 'text';
    field.className = 'lyric-edit';
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('autocorrect', 'off');
    field.setAttribute('autocapitalize', 'off');
    field.spellcheck = false;
    field.setAttribute('enterkeyhint', 'done');
    help = document.createElement('div');
    help.className = 'lyric-help';
    vp.appendChild(field);
    vp.appendChild(help);
    field.addEventListener('keydown', onKey);
    field.addEventListener('input', onInput);
    field.addEventListener('blur', () => { if (S.lyricEdit && !moving) finish(true); });
    field.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  let moving = false; // (refocusing the field while moving to another note: no blur = done)

  /** Put the field under its note (keep it in view: scroll if needed). */
  LY.place = function (reveal) {
    const e = S.lyricEdit, t = trackOf();
    if (!e || !t || !field) return;
    const p = TC.render.lyricPos(t, e.bar, e.ev, e.v);
    if (!p) return;
    const vp = document.getElementById('viewport'), v = S.doc.view, z = v.zoom;
    if (reveal) {
      // the part of the viewport not covered by an on-screen keyboard
      const r = vp.getBoundingClientRect(), vv = window.visualViewport;
      const h = vv ? Math.max(120, Math.min(vp.clientHeight, vv.height + vv.offsetTop - r.top)) : vp.clientHeight, w = vp.clientWidth;
      const sx = v.x + p.x * z, sy = v.y + p.y * z;
      let moved = false;
      if (sx < 60 || sx > w - 90) { v.x = w * 0.3 - p.x * z; moved = true; }
      if (sy < 70 || sy > h - 40) { v.y = h * 0.55 - p.y * z; moved = true; }
      if (moved) TC.render.applyView();
    }
    const fs = Math.max(11, 14 * z);
    field.style.fontSize = fs + 'px';
    const tw = TC.render.lyricWidth(field.value || 'mm') * z;
    const w = Math.max(fs * 2.5, tw + fs);
    field.style.width = w + 'px';
    const sx = v.x + p.x * z, sy = v.y + p.y * z;
    field.style.left = sx - w / 2 - 5 + 'px';
    field.style.top = sy - fs * 1.15 + 'px';
    help.textContent = tr('Space: next note · - : syllable · Enter: done') + (e.v ? ' · ' + tr('Verse {n}', { n: e.v + 1 }) : '');
    help.style.left = Math.max(4, sx - w / 2) + 'px';
    help.style.top = sy + fs * 0.55 + 'px';
  };

  /** Keep the syllable typed so far (no undo step yet). */
  function keep(text) {
    TC.score.setLyric(S.lyricEdit.ev, S.lyricEdit.v, text);
  }

  /** Record what was typed: one undo step for the whole time the field is open. */
  function save() {
    const last = TC.history.last;
    TC.commit(steps ? { merge: true } : undefined);
    if (TC.history.last !== last) steps = 1; // (merged only once something was recorded)
  }

  /** To the note k places on (1 next, -1 before) - in verse v (default: the same). */
  function go(k, v) {
    const e = S.lyricEdit, t = trackOf();
    if (!e || !t) return;
    const slots = slotsOf(t);
    const i = slots.findIndex((s) => s.ev === e.ev) + k;
    save();
    if (i < 0 || i >= slots.length) {
      if (i >= slots.length) TC.ui.hint(tr('Lyrics: that was the last note'));
      return closeField();
    }
    moving = true;
    show(t, slots[i].ev, v === undefined ? e.v : v);
    moving = false;
  }

  function onKey(e) {
    e.stopPropagation(); // (the score's keys are not for here: Space, Del, Ctrl+D …)
    const k = e.key, val = field.value;
    const atEnd = field.selectionStart === val.length && field.selectionEnd === val.length;
    const atStart = field.selectionStart === 0 && field.selectionEnd === 0;
    if (k === 'Enter') { e.preventDefault(); keep(val); save(); closeField(); }
    else if (k === 'Escape') { e.preventDefault(); keep(before); save(); closeField(); }
    else if (k === 'Tab') { e.preventDefault(); keep(val); go(e.shiftKey ? -1 : 1); }
    else if (k === 'ArrowRight' && atEnd && !e.shiftKey) { e.preventDefault(); keep(val); go(1); }
    else if (k === 'ArrowLeft' && atStart && !e.shiftKey) { e.preventDefault(); keep(val); go(-1); }
    else if (k === 'Backspace' && !val) { e.preventDefault(); keep(''); go(-1); }
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      const v = S.lyricEdit.v + (k === 'ArrowDown' ? 1 : -1);
      if (v < 0 || v >= TC.score.LYRIC_VERSES) return;
      keep(val);
      go(0, v);
    } else if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z' || k === 'y' || k === 'Y')) {
      // undo / redo: of the lyrics typed so far (the field closes)
      e.preventDefault();
      keep(val);
      save();
      closeField();
      if (k === 'y' || k === 'Y' || e.shiftKey) TC.actions.redo();
      else TC.actions.undo();
    }
  }

  /** The text changed: a separator (Space, "-", "_" - typed or pasted) writes the syllables and moves on. */
  function onInput() {
    const e = S.lyricEdit, t = trackOf();
    if (!e || !t) return;
    const val = field.value.replace(/[\r\n]+/g, ' ');
    const m = /^([\s\S]*[\s_-])([^\s_-]*)$/.exec(val);
    if (!m) {
      keep(val);
      LY.place(false);
      return;
    }
    const head = m[1], tail = m[2];
    let syl = TC.score.splitLyrics(head);
    if (!syl.length) {
      if (head.includes('-')) { // "-" on an empty field: nothing to join
        field.value = tail;
        return;
      }
      syl = [null]; // Space on an empty field: the note is left out (melisma)
    }
    const slots = slotsOf(t), i = slots.findIndex((s) => s.ev === e.ev);
    keep(''); // (the field replaces the syllable that was there)
    const next = TC.score.spreadLyrics(slots, i, e.v, syl);
    save();
    if (next >= slots.length) {
      TC.ui.hint(tr('Lyrics: that was the last note'));
      return closeField();
    }
    moving = true;
    show(t, slots[next].ev, e.v);
    moving = false;
    if (tail) {
      // (typed on: the next syllable has begun)
      field.value = tail;
      keep(tail);
      field.setSelectionRange(tail.length, tail.length);
      LY.place(false);
    }
  }

  /** Done: keep what is in the field (also when tapped elsewhere). */
  function finish() {
    if (!S.lyricEdit) return;
    keep(field ? field.value.replace(/[\s_]+/g, ' ').trim() : TC.score.lyricOf(S.lyricEdit.ev, S.lyricEdit.v));
    save();
    closeField();
  }
  /** Stop typing: what is in the field is kept (one undo step with what was typed before). */
  LY.close = finish;

  /** Remove the field. */
  function closeField() {
    if (!S.lyricEdit) return;
    S.lyricEdit = null;
    if (field) {
      const f = field;
      field.remove();
      help.remove();
      field = help = null;
      if (document.activeElement === f || document.activeElement === document.body) document.getElementById('viewport').focus({ preventScroll: true });
    }
    TC.refresh();
  }
})(window.TC);
