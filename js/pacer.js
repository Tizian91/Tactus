'use strict';
/*
 * Turning pages by a timer (to practise): in the stage view ▶ (or Space) starts it on the page shown; it
 * turns the pages in the tempo of the score - repeats, endings, jumps and tempo changes as played
 * (TC.timeline) - `turnLead` bars before a new page begins, with the click and the count-in of the playback if
 * switched on (settings.metronome, settings.countIn - ♩ in the stage bar; loudness: settings.clickVol). It plays
 * nothing else. Turning by hand while it runs: it goes on from the start of that page. Where we are
 * (settings.timerCursor): the bar being played is marked, the cursor stands at its start.
 *
 *   settings.turnMode  'midi' (default: a player of backing tracks turns, js/remote.js) | 'timer'
 *
 *   TC.pacer.plan(tl, pageOf, lead) -> { turns: [ { t, page } ], starts: [ { t, page } ] }   (pure, tested)
 *       turns: when each page is shown (seconds of the timeline; the first page at 0)
 *       starts: where the music of each page begins (a jump to a page goes there)
 */
(function (TC) {
  const Pc = (TC.pacer = {});
  const S = TC.state;
  const AHEAD = 0.15; // the clicks of the next 150 ms go to the audio clock
  const tr = (s, v) => (TC.tr ? TC.tr(s, v) : s);

  Pc.plan = function (tl, pageOf, lead) {
    const bars = tl.bars.filter((b) => b.bar >= 0);
    lead = Math.max(0, lead | 0);
    const turns = [], starts = [];
    let last = -Infinity;
    bars.forEach((b, j) => {
      const page = pageOf[b.bar] || 0;
      if (j && page === (pageOf[bars[j - 1].bar] || 0)) return;
      starts.push({ t: b.t0, page });
      // `lead` bars earlier, but after the turn before (a page of one bar)
      const t = j ? Math.max(last + 0.05, bars[Math.max(0, j - lead)].t0) : 0;
      turns.push({ t, page });
      last = t;
    });
    return { turns, starts };
  };

  let run = null; // { ctx, tl, clicks, ci, turns, starts, ti, t0, cbus, timer }
  Pc.running = () => !!run;

  let cued = null; // (a part chosen while stopped: the next start is at that bar, if its page is still shown)
  /** Stopped: the next start is at bar i (a part chosen; null: forgotten) - marked by the cursor. */
  Pc.cue = function (i) {
    if (run) return;
    cued = Number.isInteger(i) && S.doc.bars[i] ? i : null;
    TC.render.drawCursor(cued !== null && S.settings.timerCursor !== false ? cued : null, 0);
  };

  /** Starts on the page shown, or at bar `fromBar` / the part chosen before (with the count-in, if chosen). */
  Pc.start = function (fromBar) {
    if (!Number.isInteger(fromBar) && cued !== null && (TC.render.pagesOfBars()[cued] || 0) === TC.actions.currentPage()) fromBar = cued;
    cued = null;
    Pc.stop(true);
    const ctx = TC.audio.context();
    if (!ctx) return TC.ui.hint(tr('This browser cannot play sound'));
    if (TC.player.playing) TC.player.stop(true);
    const st = S.settings;
    const pageOf = TC.render.pagesOfBars();
    const at = Number.isInteger(fromBar) && S.doc.bars[fromBar];
    if (at) TC.actions.gotoPage(pageOf[fromBar] || 0);
    const from = at ? fromBar : Math.max(0, pageOf.indexOf(TC.actions.currentPage()));
    const tl = TC.timeline.build(S.doc, { from, metronome: true, countIn: !!st.countIn }); // (the click: heard only while switched on, see step)
    const p = Pc.plan(tl, pageOf, st.turnLead === undefined ? 1 : st.turnLead);
    const first = tl.bars.find((b) => b.bar >= 0);
    run = { ctx, tl, clicks: tl.hits.filter((h) => h.click), ci: 0, plan: p, turns: p.turns, starts: p.starts, ti: 1, t0: ctx.currentTime + 0.1, cbus: TC.audio.clickBus(), first: first ? first.bar : from };
    run.timer = setInterval(step, 25);
    step();
    if (TC.actions.refreshPerformBar) TC.actions.refreshPerformBar();
  };

  /** Stops (quiet: without a word in the status bar). */
  Pc.stop = function (quiet) {
    if (!run) return;
    clearInterval(run.timer);
    fade(run);
    run = null;
    TC.render.drawCursor(null);
    if (!quiet) TC.ui.status(tr('Timer stopped'));
    if (TC.actions.refreshPerformBar) TC.actions.refreshPerformBar();
  };
  Pc.toggle = () => (run ? Pc.stop() : Pc.start());

  /** Turned by hand to page k while running: the music goes on from the start of that page (the nearest one, with repeats). */
  Pc.jumpTo = function (k) {
    if (!run) return;
    const now = run.ctx.currentTime, song = now - run.t0 - TC.audio.outputDelay();
    let best = null;
    for (const s of run.starts) if (s.page === k && (!best || Math.abs(s.t - song) < Math.abs(best.t - song))) best = s;
    if (best) jumpAt(best.t, best.t);
  };

  /**
   * Jump to bar i while running (a part chosen): on from its start (the nearest time it is played; not in the run:
   * started there). With the count-in: started anew there, counted in again.
   */
  Pc.jumpToBar = function (i) {
    if (!run) return;
    if (S.settings.countIn) return Pc.start(i);
    const song = run.ctx.currentTime - run.t0 - TC.audio.outputDelay();
    let best = null;
    for (const b of run.tl.bars) if (b.bar === i && (!best || Math.abs(b.t0 - song) < Math.abs(best.t0 - song))) best = b;
    if (!best) return Pc.start(i);
    jumpAt(best.t0, best.t1);
  };

  /**
   * On from second t of the timeline (a bar ending at `end`): the clicks from there, its page shown, the next turn
   * after it - a turn due earlier (bars before) waits for the end of that bar, so the bar jumped to stays in view.
   */
  function jumpAt(t, end) {
    const r = run, now = r.ctx.currentTime;
    fade(r);
    r.cbus = TC.audio.clickBus();
    r.t0 = now + AHEAD - t;
    r.ci = r.clicks.findIndex((h) => h.t >= t - 1e-6);
    if (r.ci < 0) r.ci = r.clicks.length;
    r.turns = r.plan.turns.map((x) => Object.assign({}, x));
    let k = 0;
    r.starts.forEach((s, j) => { if (s.t <= t + 1e-6) k = j; });
    const next = r.turns[k + 1];
    if (next && next.t <= t + 1e-6) next.t = Math.min(end, r.turns[k + 2] ? r.turns[k + 2].t - 0.05 : end);
    r.ti = k + 1;
    if (r.starts[k] && TC.actions.currentPage() !== r.starts[k].page) TC.actions.gotoPage(r.starts[k].page);
  }

  /** What has already been handed to the audio clock: faded out. */
  function fade(r) {
    if (!r.cbus) return;
    const c = r.cbus, now = r.ctx.currentTime;
    c.gain.setValueAtTime(1, now);
    c.gain.linearRampToValueAtTime(0, now + 0.04);
    setTimeout(() => c.disconnect(), 400);
    r.cbus = null;
  }

  function step() {
    if (!run) return;
    const r = run, now = r.ctx.currentTime;
    // the clicks of the next moment to the audio clock
    const horizon = now - r.t0 + AHEAD;
    while (r.ci < r.clicks.length && r.clicks[r.ci].t <= horizon) {
      const h = r.clicks[r.ci++], when = r.t0 + h.t;
      if (when >= now - 0.01 && (h.t < r.tl.start || S.settings.metronome)) TC.audio.click(when, h.click, h.vel, r.cbus);
    }
    // the page turns that are due (as heard: the sound comes out a little later)
    const song = now - r.t0 - TC.audio.outputDelay();
    let page = null;
    while (r.ti < r.turns.length && r.turns[r.ti].t <= song) page = r.turns[r.ti++].page;
    if (page !== null) TC.actions.gotoPage(page);
    // where we are: the bar being played marked, the cursor at its start (count-in: the first bar)
    if (S.settings.timerCursor !== false) {
      const pos = TC.timeline.position(r.tl, song);
      if (pos || song < r.tl.start) TC.render.drawCursor(pos && pos.bar >= 0 ? pos.bar : r.first, 0);
    }
    if (song > r.tl.end + 0.3) {
      Pc.stop(true);
      TC.ui.status(tr('Timer: the end of the piece'));
    }
  }
})(window.TC);
