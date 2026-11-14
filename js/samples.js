'use strict';
/*
 * Recorded drum sounds (samples/*.flac, built by tools/build_samples.sh) instead of the
 * synthesized ones (audio.js). Loaded only when switched on (settings.samples); until they are
 * there, and for the few instruments without a recording (clap, reverse cymbal), the synth plays.
 *
 * Sources (see samples/LICENSE.md): MuldjordKit by Lars Muldjord (CC BY 4.0, FreePats version)
 * and Virtuosity Drums by Versilian Studios (CC0).
 *
 * Every sound has 3 strengths (soft / middle / loud): ghost notes take the soft recording,
 * accents the loud one - a drum sounds different when it is hit harder, not only louder.
 */
(function (TC) {
  const SM = (TC.samples = {});
  const S = TC.state;

  // sound: file name, layers: 3 (name-1 … name-3) or 1 (name), mix: level against the other sounds
  const SOUNDS = {
    kick: [3, 1.0], snare: [3, 0.85], rimshot: [3, 0.8], sidestick: [3, 0.6],
    hhClosed: [3, 0.45], hhHalf: [3, 0.45], hhOpen: [3, 0.45], hhPedal: [3, 0.45], hhSplash: [1, 0.45],
    tom1: [3, 0.8], tom2: [3, 0.8], tom3: [3, 0.8], tom4: [3, 0.85],
    crash1: [3, 0.5], crash2: [3, 0.5], china: [3, 0.5], ride1: [3, 0.45], bell1: [3, 0.5], ride2: [3, 0.45], bell2: [3, 0.5],
    cowbell: [3, 0.4], claves: [3, 0.45], tambourine: [1, 0.45], shaker: [1, 0.4],
  };
  // instrument -> [sound, playback rate (pitch), gain]; not listed: the synth plays it
  const MAP = {
    42: ['hhClosed'], 92: ['hhHalf'], 46: ['hhOpen'], 44: ['hhPedal'], 244: ['hhSplash'],
    38: ['snare'], 40: ['snare', 1.15, 0.9], 37: ['sidestick'], 91: ['rimshot'],
    36: ['kick'], 35: ['kick', 0.92],
    50: ['tom1'], 48: ['tom2'], 47: ['tom3'], 45: ['tom3', 0.88], 43: ['tom4'], 41: ['tom4', 1.1],
    51: ['ride1'], 93: ['ride1', 0.97, 1.1], 53: ['bell1'], 94: ['ride1'], 126: ['ride2'], 59: ['ride2', 0.97, 1.1], 127: ['bell2'],
    49: ['crash1'], 97: ['crash1'], 57: ['crash2'], 98: ['crash2'], 55: ['crash1', 1.6, 0.8], 95: ['crash1', 1.6, 0.8],
    52: ['china'], 96: ['china'],
    56: ['cowbell'], 101: ['cowbell', 1.05, 0.8], 99: ['cowbell', 0.85], 100: ['cowbell', 0.87, 0.8], 102: ['cowbell', 1.2], 103: ['cowbell', 1.22, 0.8],
    31: ['claves', 1.35, 0.8], 54: ['tambourine'], 82: ['shaker'], 75: ['claves'],
  };
  // tom rim shot (200 + tom): the tom, a bit brighter and louder; tom rim (300 + tom): a side stick, lower
  for (const t of [50, 48, 47, 45, 43, 41]) {
    MAP[200 + t] = [MAP[t][0], (MAP[t][1] || 1) * 1.04, 1.15];
    MAP[300 + t] = ['sidestick', 0.85];
  }
  const OPEN_HATS = new Set([46, 92, 244]);      // stopped by the next closed / pedal hi-hat
  const CLOSE_HATS = new Set([42, 44, 46, 92, 244]);

  const buffers = {}; // 'snare-2' -> AudioBuffer
  let state = 'off', loading = null; // 'off' | 'loading' | 'ready' | 'failed'
  let openHats = [];

  /** Folder of the samples, next to js/ (also for the UI test in tools/uitest/). */
  function base() {
    const s = document.querySelector('script[src*="samples.js"]');
    return s ? s.src.replace(/js\/samples\.js.*$/, 'samples/') : 'samples/';
  }
  const files = () => Object.entries(SOUNDS).flatMap(([n, [layers]]) => (layers === 1 ? [n] : [1, 2, 3].map((k) => n + '-' + k)));

  SM.state = () => state;
  SM.ready = () => state === 'ready';
  SM.count = () => files().length;
  SM.has = (art) => !!MAP[art];

  /** Loads and decodes all samples (once). Resolves to true when they are there. */
  SM.load = function (ctx) {
    if (state === 'ready') return Promise.resolve(true);
    if (loading) return loading;
    state = 'loading';
    const root = base();
    loading = Promise.all(files().map((f) => fetch(root + f + '.flac')
      .then((r) => { if (!r.ok) throw new Error(f); return r.arrayBuffer(); })
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => { buffers[f] = buf; })))
      .then(() => { state = 'ready'; return true; })
      .catch(() => { state = 'failed'; loading = null; return false; })
      .then((ok) => { if (TC.refresh) TC.refresh(); return ok; });
    return loading;
  };

  /** Recording for a strength: soft below ghost-ish, loud from accents on. */
  const layerOf = (v) => (v < 0.4 ? 1 : v < 0.95 ? 2 : 3);
  const NOMINAL = { 1: 0.3, 2: 0.72, 3: 1.12 };

  /**
   * One stroke from the samples at audio time t; false when there is no sample for it (the synth plays).
   * vel 0 … 1.2, choke: a stopped cymbal (short).
   */
  SM.play = function (ctx, art, t, vel, choke, out) {
    const m = MAP[art];
    if (state !== 'ready' || !m) return false;
    const [name, rate = 1, gain = 1] = m;
    const [layers, mix] = SOUNDS[name];
    const k = layers === 1 ? 0 : layerOf(vel);
    const buf = buffers[k ? name + '-' + k : name];
    if (!buf) return false;
    // a closed / pedal hi-hat stops the open one still ringing
    if (CLOSE_HATS.has(art)) {
      openHats = openHats.filter((h) => h.end > t);
      for (const h of openHats) if (h.start < t) { h.g.gain.setTargetAtTime(0, t, 0.015); h.end = t; }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = mix * gain * TC.clamp(vel / (k ? NOMINAL[k] : 0.72), 0.35, 1.5);
    src.connect(g);
    g.connect(out);
    src.start(t);
    const len = buf.duration / rate;
    if (choke) {
      g.gain.setValueAtTime(g.gain.value, t + 0.12);
      g.gain.linearRampToValueAtTime(0, t + 0.2);
      src.stop(t + 0.25);
    }
    if (OPEN_HATS.has(art)) openHats.push({ g, start: t, end: t + len });
    return true;
  };
})(window.TC);
