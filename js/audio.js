'use strict';
/*
 * Sound: drum sounds made with the Web Audio API (no sample files needed), and the player.
 *
 *   TC.audio.hit(art, time, vel, choke)   one drum stroke (art = drum map id) at AudioContext time
 *   TC.audio.preview(note)                 play a note right now (when it is written)
 *   TC.player.play(fromBar) / stop() / toggle()
 *
 * The player plays a timeline (playback.js) with a look-ahead scheduler: every 25 ms it hands
 * the strokes of the next 150 ms to the audio clock, which plays them sample-exact.
 * Changes to the score while it plays are heard from the next stroke on (the timeline is
 * rebuilt); the cursor runs along and the view follows it.
 *
 * The sounds are synthesized: kick = falling sine, snare = noise + tone, toms = falling sines,
 * hi-hats / cymbals = filtered noise + six "metallic" square waves (like the TR-808).
 * Real samples could replace them later (phase 3+).
 */
(function (TC) {
  const S = TC.state;
  const AU = (TC.audio = {});
  let ctx = null, master = null, noise = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = S.settings.volume === undefined ? 0.8 : S.settings.volume;
    master.connect(comp);
    comp.connect(ctx.destination);
    // two seconds of white noise, shared by all noisy sounds
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  AU.context = () => ensure();
  AU.now = () => (ctx ? ctx.currentTime : 0);
  AU.setVolume = (v) => { if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); };

  // ---- Building blocks -------------------------------------------------------------------

  /** Gain with a quick attack and an exponential decay to silence. */
  function env(out, t, peak, decay, attack = 0.001) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }
  function noiseSrc(t, len) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.start(t, Math.random() * 1.5);
    s.stop(t + len);
    return s;
  }
  function filter(type, freq, q = 0.7) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }
  /** Sine / triangle falling from f1 to f2. */
  function tone(out, t, type, f1, f2, glide, peak, decay) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + glide);
    o.connect(env(out, t, peak, decay));
    o.start(t);
    o.stop(t + decay + 0.05);
  }
  /** Filtered noise burst. */
  function hiss(out, t, type, freq, q, peak, decay, attack) {
    const f = filter(type, freq, q);
    f.connect(env(out, t, peak, decay, attack));
    noiseSrc(t, decay + 0.1).connect(f);
    return f;
  }
  /** Six detuned square waves (cymbal / hi-hat colour) through a band and a high pass. */
  function metal(out, t, base, band, peak, decay, attack = 0.001) {
    const hp = filter('highpass', band * 0.7);
    const bp = filter('bandpass', band, 0.8);
    bp.connect(hp);
    hp.connect(env(out, t, peak, decay, attack));
    [2, 3, 4.16, 5.43, 6.79, 8.21].forEach((r) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = base * r;
      o.connect(bp);
      o.start(t);
      o.stop(t + attack + decay + 0.05);
    });
  }

  const TOM_HZ = { 50: 190, 48: 160, 47: 135, 45: 115, 41: 92, 43: 82 };

  /** One drum stroke. art: drum map id; vel 0 … 1; choke: stopped cymbal (short). */
  AU.hit = function (art, t, vel = 0.72, choke = false, dest = null) {
    if (!ensure()) return;
    const a = TC.drums.byId(art);
    if (!a) return;
    const out = dest || master, v = Math.max(0.05, Math.min(1.2, vel));
    const cut = (d) => (choke ? Math.min(d, 0.12) : d);
    switch (a.id) {
      case 36: case 35: // kick
        tone(out, t, 'sine', a.id === 35 ? 130 : 150, 42, 0.11, 1.0 * v, 0.42);
        hiss(out, t, 'lowpass', 2500, 0.7, 0.25 * v, 0.012);
        break;
      case 38: case 40: // snare
        tone(out, t, 'triangle', 220, 165, 0.05, 0.55 * v, 0.1);
        hiss(out, t, 'highpass', 1400, 0.6, 0.6 * v, a.id === 40 ? 0.14 : 0.2);
        hiss(out, t, 'bandpass', 4200, 0.9, 0.25 * v, 0.12);
        break;
      case 91: // rimshot
        tone(out, t, 'triangle', 420, 330, 0.03, 0.55 * v, 0.06);
        hiss(out, t, 'highpass', 1600, 0.6, 0.8 * v, 0.22);
        hiss(out, t, 'bandpass', 2800, 4, 0.6 * v, 0.03);
        break;
      case 37: // side stick
        tone(out, t, 'square', 1250, 900, 0.01, 0.25 * v, 0.03);
        hiss(out, t, 'bandpass', 2100, 3, 0.7 * v, 0.045);
        break;
      case 31: // sticks
        hiss(out, t, 'bandpass', 3200, 4, 0.9 * v, 0.035);
        break;
      case 39: // clap: three quick bursts and a tail
        [0, 0.011, 0.023].forEach((dt) => hiss(out, t + dt, 'bandpass', 1300, 1.2, 0.6 * v, 0.02));
        hiss(out, t + 0.03, 'bandpass', 1200, 1, 0.45 * v, 0.16);
        break;
      case 42: // hi-hat closed
        metal(out, t, 40, 10000, 0.35 * v, 0.045);
        hiss(out, t, 'highpass', 7500, 0.7, 0.35 * v, 0.04);
        break;
      case 44: // pedal hi-hat
        metal(out, t, 40, 9000, 0.25 * v, 0.03, 0.004);
        hiss(out, t, 'highpass', 6000, 0.7, 0.22 * v, 0.03, 0.004);
        break;
      case 92: case 46: { // half open / open hi-hat
        const d = cut(a.id === 92 ? 0.16 : 0.42);
        metal(out, t, 40, 10000, 0.33 * v, d);
        hiss(out, t, 'highpass', 7000, 0.7, 0.35 * v, d);
        break;
      }
      case 51: case 93: case 94: case 126: case 59: { // ride
        const d = cut(a.id === 93 || a.id === 59 ? 1.1 : 0.9);
        metal(out, t, TC.drums.base(a).line === 2 ? 52 : 60, 6000, 0.22 * v, d);
        hiss(out, t, 'bandpass', 8500, 1.5, 0.12 * v, d * 0.7);
        tone(out, t, 'sine', 3100, 3000, 0.1, 0.05 * v, 0.6);
        break;
      }
      case 53: case 127: // ride bell
        metal(out, t, 80, 4000, 0.22 * v, cut(1.0));
        tone(out, t, 'sine', 1580, 1560, 0.1, 0.18 * v, 0.9);
        tone(out, t, 'sine', 2370, 2350, 0.1, 0.1 * v, 0.6);
        break;
      case 49: case 97: case 57: case 98: { // crash
        const d = cut(a.id === 57 || a.id === 98 ? 1.2 : 1.5);
        hiss(out, t, 'highpass', 4500, 0.5, 0.55 * v, d, 0.004);
        metal(out, t, a.id === 57 || a.id === 98 ? 48 : 55, 7500, 0.3 * v, d * 0.8, 0.004);
        break;
      }
      case 55: case 95: // splash
        hiss(out, t, 'highpass', 6000, 0.5, 0.5 * v, cut(0.55), 0.002);
        metal(out, t, 70, 9000, 0.25 * v, cut(0.45));
        break;
      case 52: case 96: // china
        hiss(out, t, 'bandpass', 3800, 0.8, 0.6 * v, cut(1.1), 0.003);
        metal(out, t, 37, 5000, 0.35 * v, cut(0.9), 0.003);
        break;
      case 30: // reverse cymbal: swells up
        hiss(out, t, 'highpass', 4000, 0.5, 0.5 * v, 0.05, 0.9);
        break;
      case 54: // tambourine
        [0, 0.012, 0.03].forEach((dt, k) => metal(out, t + dt, 110, 9500, (0.3 - k * 0.07) * v, 0.12));
        hiss(out, t, 'highpass', 8000, 0.7, 0.3 * v, 0.18);
        break;
      default:
        if (a.el === 'tom') {
          const f = TOM_HZ[a.id] || 120;
          tone(out, t, 'sine', f * 1.6, f, 0.06, 0.9 * v, 0.45);
          tone(out, t, 'triangle', f * 2.2, f * 1.5, 0.05, 0.12 * v, 0.12);
          hiss(out, t, 'lowpass', 3000, 0.7, 0.18 * v, 0.05);
        } else if (a.el === 'cowbell') {
          const gl = TC.drums.base(a).line, f = gl === 1 ? 480 : gl === -1 ? 640 : 560;
          const bp = filter('bandpass', f * 1.5, 2);
          bp.connect(env(out, t, 0.35 * v, TC.drums.base(a).head === 'x' ? 0.08 : 0.28));
          [f, f * 1.48].forEach((hz) => {
            const o = ctx.createOscillator();
            o.type = 'square';
            o.frequency.value = hz;
            o.connect(bp);
            o.start(t);
            o.stop(t + 0.35);
          });
        } else {
          hiss(out, t, 'bandpass', 2000, 1, 0.5 * v, 0.1);
        }
    }
  };

  /** Metronome click (2 = first beat of the bar). */
  AU.click = function (t, strong, vel = 0.8, dest = null) {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = strong === 2 ? 1760 : 1320;
    o.connect(env(dest || master, t, 0.45 * vel, 0.035));
    o.start(t);
    o.stop(t + 0.06);
  };

  /** Play a note now (when it is written or chosen). */
  AU.preview = function (note) {
    if (!ensure() || TC.player.playing) return;
    const t = ctx.currentTime + 0.01;
    const vel = TC.timeline.velocity(note);
    const a = TC.drums.byId(note.art);
    if (note.orn === 'flam') AU.hit(note.art, t, 0.35);
    if (note.orn === 'drag') {
      AU.hit(note.art, t, 0.33);
      AU.hit(note.art, t + 0.03, 0.38);
    }
    AU.hit(note.art, t + (note.orn === 'flam' ? 0.03 : note.orn === 'drag' ? 0.06 : 0), vel, a && a.tech === 'choke');
  };

  // ---- Player ------------------------------------------------------------------------------

  const P = (TC.player = { playing: false });
  const AHEAD = 0.15;
  let shownN = 0, tl = null, idx = 0, t0 = 0, timer = 0, raf = 0, rev = -1, tempo = 0, range = null, loopLen = 0, lap = 0, until = -1, bus = null;

  function build() {
    tl = TC.timeline.build(S.doc, { from: range[0], to: range[1], metronome: S.settings.metronome, countIn: S.settings.countIn && lap === 0 });
    rev = S.rev;
    tempo = S.doc.meta.tempo;
    loopLen = tl.end - tl.start;
  }

  /** Time in the timeline now (with loops folded back). */
  function songTime() {
    const el = ctx.currentTime - t0;
    if (!S.settings.loop || el < tl.start) return el;
    return tl.start + ((el - tl.start) % loopLen);
  }

  function schedule() {
    if (S.rev !== rev) {
      if (S.doc.meta.tempo !== tempo || range[1] >= S.doc.bars.length) return P.restartHere();
      // the score was changed: rebuild, keep the place (strokes already handed over stay)
      const keepLap = lap;
      build();
      lap = keepLap;
      idx = tl.hits.findIndex((h) => h.t > until);
      if (idx < 0) idx = tl.hits.length;
    }
    const horizon = ctx.currentTime - t0 + AHEAD;
    for (;;) {
      if (idx >= tl.hits.length) {
        if (!S.settings.loop) break;
        const lapEnd = tl.end + lap * loopLen;
        if (horizon < lapEnd) break;
        // next round of the loop (without the count-in)
        lap++;
        if (tl.start > TC.timeline.LEAD) {
          const s = tl.start;
          build();
          t0 += s - tl.start;
        }
        idx = tl.hits.findIndex((h) => h.t >= tl.start);
        if (idx < 0) break;
        continue;
      }
      const h = tl.hits[idx];
      const at = h.t + lap * loopLen;
      if (at > horizon) break;
      const when = t0 + at;
      if (when >= ctx.currentTime - 0.01) {
        if (h.click) AU.click(when, h.click, h.vel, bus);
        else AU.hit(h.art, when, h.vel, h.choke, bus);
      }
      until = h.t;
      idx++;
    }
    if (!S.settings.loop && ctx.currentTime - t0 > tl.end + 0.3) P.stop();
  }

  function follow() {
    raf = requestAnimationFrame(follow);
    const pos = TC.timeline.position(tl, songTime());
    if (!pos || pos.bar < 0) {
      TC.render.drawCursor(pos && pos.bar < 0 ? range[0] : null, 0, S.settings.loop ? range : null);
      return;
    }
    const c = TC.render.drawCursor(pos.bar, pos.tick, S.settings.loop ? range : null);
    // status bar: the written bar, its pass through a repeat, and the played bar number (as in Cubase)
    if (pos.n && pos.n !== shownN) {
      shownN = pos.n;
      TC.ui.status(`${TC.tr('Bar')} ${pos.bar + 1}${pos.pass > 1 ? ` (${pos.pass}.)` : ''}` +
        (TC.score.hasRepeats(S.doc) ? ` · ${TC.tr('played bar {n}', { n: pos.n })}` : ''));
    }
    if (!c) return;
    // keep the cursor in view: sideways (endless view), its line downwards (page view)
    const vp = document.getElementById('viewport');
    const v = S.doc.view;
    if (TC.render.isPage()) {
      const sy = v.y + c.y * v.zoom, h = vp.clientHeight;
      if (sy > h * 0.75 || sy < 60) {
        v.y = h * 0.3 - c.y * v.zoom;
        TC.render.applyView();
      }
    } else {
      const sx = v.x + c.x * v.zoom, w = vp.clientWidth;
      if (sx > w * 0.85 || sx < 0) {
        v.x = w * 0.15 - c.x * v.zoom;
        TC.render.applyView();
      }
    }
  }

  /**
   * Play from bar `from` (default: the selected bar, else the start). Several bars selected:
   * just those (loop: over and over); one bar selected and loop: that bar.
   */
  P.play = function (from) {
    if (!ensure()) return TC.ui.hint(TC.tr('This browser cannot play sound'));
    P.stop(true);
    const n = S.doc.bars.length;
    const has = from !== undefined && from !== null;
    const R = TC.barRange();
    let start = has ? from : S.selBar !== null ? S.selBar : 0;
    start = TC.clamp(start, 0, n - 1);
    if (R && R[1] > R[0] && (!has || (from >= R[0] && from <= R[1]))) {
      range = S.settings.loop || !has ? [R[0], R[1]] : [start, R[1]];
    } else {
      range = S.settings.loop && S.selBar !== null && (!has || from === S.selBar) ? [S.selBar, S.selBar] : [start, n - 1];
    }
    lap = 0;
    build();
    idx = 0;
    until = -1;
    t0 = ctx.currentTime + 0.05;
    bus = ctx.createGain(); // this run's own output: stop() fades it without touching the next run
    bus.connect(master);
    P.playing = true;
    schedule();
    timer = setInterval(schedule, 25);
    follow();
    TC.refresh();
  };

  P.stop = function (quiet) {
    if (!P.playing) return;
    P.playing = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    TC.render.drawCursor(null);
    if (bus) {
      // fade out what was already handed to the audio clock
      const b = bus, now = ctx.currentTime;
      b.gain.setValueAtTime(1, now);
      b.gain.linearRampToValueAtTime(0, now + 0.04);
      setTimeout(() => b.disconnect(), 400);
      bus = null;
    }
    if (!quiet) TC.refresh();
  };

  P.toggle = () => (P.playing ? P.stop() : P.play());
  /** The bars being played [first, last] (for the tests). */
  P.range = () => range;

  /** Start again at the bar that is playing now (after a tempo or loop change). */
  P.restartHere = function () {
    if (!P.playing) return;
    const pos = TC.timeline.position(tl, songTime());
    P.play(pos && pos.bar >= 0 ? pos.bar : range[0]);
  };
})(window.TC);
