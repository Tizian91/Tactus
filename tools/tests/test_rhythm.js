'use strict';
// Note values, rests, triplets and beams from events (js/rhythm.js).
module.exports = function (T) {
  const TC = T.load(['state.js', 'model.js', 'drummap.js', 'rhythm.js']);
  const R = TC.rhythm;
  const ev = (tick, dur) => ({ tick, dur, notes: [{ art: 38 }] });
  // compact form: n|r + tick + ':' + written value + '.' (dotted) + 't' (triplet) + '~' (tied) ; M = whole-bar rest
  const show = (items) => items.map((it) => it.measure ? 'M' :
    (it.kind === 'note' ? 'n' : 'r') + it.tick + ':' + it.base + (it.dots ? '.' : '') + (it.tup ? 't' : '') + (it.tie ? '~' : ''));
  const lay = (evs, ts = [4, 4], drums = true) => show(R.layout(evs, ts, drums));

  T.eq('empty bar: whole-bar rest', lay([]), ['M']);
  T.eq('eight eighths', lay([0, 480, 960, 1440, 1920, 2400, 2880, 3360].map((t) => ev(t, 480))),
    ['n0:480', 'n480:480', 'n960:480', 'n1440:480', 'n1920:480', 'n2400:480', 'n2880:480', 'n3360:480']);
  T.eq('quarters on 1 and 3', lay([ev(0, 960), ev(1920, 960)]), ['n0:960', 'r960:960', 'n1920:960', 'r2880:960']);
  T.eq('one eighth: rests do not hide beats', lay([ev(0, 480)]), ['n0:480', 'r480:480', 'r960:960', 'r1920:1920']);
  T.eq('rest from beat 2 to 4: two quarters, no half across the middle', lay([ev(0, 960), ev(2880, 960)]),
    ['n0:960', 'r960:960', 'r1920:960', 'n2880:960']);
  T.eq('16th + dotted 8th (scotch snap)', lay([ev(0, 240), ev(240, 720), ev(960, 960)]).slice(0, 3), ['n0:240', 'n240:480.', 'n960:960']);
  T.eq('dotted 8th + 16th', lay([ev(0, 720), ev(720, 240)]).slice(0, 2), ['n0:480.', 'n720:240']);
  T.eq('dotted eighths in a row keep their dots', lay([0, 720, 1440, 2160, 2880].map((t) => ev(t, 720)).concat([ev(3600, 240)])),
    ['n0:480.', 'n720:480.', 'n1440:480.', 'n2160:480.', 'n2880:480.', 'n3600:240']);
  T.eq('dotted quarter on 1+', lay([ev(480, 1440), ev(1920, 960)]).slice(0, 3), ['r0:480', 'n480:960.', 'n1920:960']);
  T.eq('a quarter cut on 1 a stays an eighth + rest', lay([ev(720, 960)]).slice(2, 4), ['n720:480', 'r1200:240']);
  T.eq('syncopated quarter on 1+', lay([ev(0, 480), ev(480, 960), ev(1440, 480)]).slice(0, 3), ['n0:480', 'n480:960', 'n1440:480']);
  T.eq('eighth triplets on beat 1', lay([ev(0, 320), ev(320, 320), ev(640, 320)]),
    ['n0:480t', 'n320:480t', 'n640:480t', 'r960:960', 'r1920:1920']);
  T.eq('triplet with a rest in the middle', lay([ev(0, 320), ev(640, 320)]).slice(0, 3), ['n0:480t', 'r320:480t', 'n640:480t']);
  T.eq('16th triplets on beat 2', lay([ev(960, 160), ev(1120, 160), ev(1280, 160)]).slice(0, 5),
    ['r0:960', 'n960:240t', 'n1120:240t', 'n1280:240t', 'r1440:480']);
  T.eq('six 16th triplets: two triplet groups', lay([0, 160, 320, 480, 640, 800].map((t) => ev(t, 160))).map((s) => s.endsWith('t')),
    [true, true, true, true, true, true, false, false]);
  T.eq('triplet sixteenths then plain eighth', lay([ev(0, 160), ev(160, 160), ev(320, 160), ev(480, 480)]).slice(0, 4),
    ['n0:240t', 'n160:240t', 'n320:240t', 'n480:480']);
  T.eq('quarter triplets over beats 1-2', lay([ev(0, 640), ev(640, 640), ev(1280, 640)]),
    ['n0:960t', 'n640:960t', 'n1280:960t', 'r1920:1920']);
  T.eq('drums: too long a note becomes note + rest', lay([ev(0, 1200)]).slice(0, 3), ['n0:960', 'r960:240', 'r1200:240']);
  T.eq('other instruments: tied instead', lay([ev(0, 1200)], [4, 4], false).slice(0, 2), ['n0:960~', 'n960:240']);
  T.eq('other instruments: dotted half', lay([ev(0, 2880)], [4, 4], false), ['n0:1920.', 'r2880:960']);
  T.eq('other instruments: whole note', lay([ev(0, 3840)], [4, 4], false), ['n0:3840']);
  T.eq('6/8: rests by dotted quarters', lay([ev(0, 480), ev(1440, 480)], [6, 8]),
    ['n0:480', 'r480:480', 'r960:480', 'n1440:480', 'r1920:960']);
  T.eq('6/8: empty second half = dotted quarter rest', lay([ev(0, 1440)], [6, 8]), ['n0:960.', 'r1440:960.']);
  T.eq('3/4: notes on every beat', lay([ev(0, 960), ev(960, 960), ev(1920, 960)], [3, 4]), ['n0:960', 'n960:960', 'n1920:960']);
  T.eq('7/8: dotted sixteenth at the end', lay([ev(3000, 360)], [7, 8]).slice(-2), ['r2880:120', 'n3000:240.']);
  T.eq('7/8: last eighth', lay([ev(2880, 480)], [7, 8]).slice(-2), ['r1920:960', 'n2880:480']);
  T.eq('event longer than the bar is cut', lay([ev(2880, 9999)]), ['r0:1920', 'r1920:960', 'n2880:960']);

  // rest cleanup (fill): notes grow up to the next one, the saved durations stay
  const fl = (evs, fill, ts = [4, 4], beam = null) => show(R.layout(evs, ts, true, beam, fill));
  const e8 = (ticks) => ticks.map((t) => ev(t, 480));
  T.eq('fill beat: kick on 1 and 3 = quarter + quarter rest', fl(e8([0, 1920]), 'beat'), ['n0:960', 'r960:960', 'n1920:960', 'r2880:960']);
  T.eq('fill next: kick on 1 and 3 = two halves', fl(e8([0, 1920]), 'next'), ['n0:1920', 'n1920:960', 'r2880:960']);
  T.eq('fill off: as written', fl(e8([0, 1920]), 'off'), ['n0:480', 'r480:480', 'r960:960', 'n1920:480', 'r2400:480', 'r2880:960']);
  T.eq('fill beat: 1 and 2+ = quarter, eighth rest, eighth', fl(e8([0, 1440]), 'beat').slice(0, 3), ['n0:960', 'r960:480', 'n1440:480']);
  T.eq('fill next: 1 and 2+ = dotted quarter', fl(e8([0, 1440]), 'next').slice(0, 2), ['n0:960.', 'n1440:480']);
  T.eq('fill beat: 16ths 1 and 1+ = two eighths', fl([ev(0, 240), ev(480, 240)], 'beat').slice(0, 2), ['n0:480', 'n480:480']);
  T.eq('fill beat: a note written longer stays longer', fl([ev(480, 960), ev(1440, 480)], 'beat').slice(0, 3), ['r0:480', 'n480:960', 'n1440:480']);
  T.eq('fill beat: triplet with a gap = quarter + eighth in the triplet', fl([ev(0, 320), ev(640, 320)], 'beat').slice(0, 2), ['n0:960t', 'n640:480t']);
  T.eq('fill next: 16th triplet stays in its triplet', fl([ev(960, 160), ev(1120, 160), ev(1280, 160), ev(1920, 480)], 'next').slice(1, 5),
    ['n960:240t', 'n1120:240t', 'n1280:240t', 'r1440:480']);
  T.eq('fill beat: 7/8 by beam groups 2+2+3', fl(e8([0, 960, 1920]), 'beat', [7, 8]), ['n0:960', 'n960:960', 'n1920:960.']);
  T.eq('fill beat: 6/8 by dotted quarters', fl(e8([0, 1440]), 'beat', [6, 8]), ['n0:960.', 'n1440:960.']);
  T.eq('fill: other instruments are never filled', show(R.layout(e8([0, 1920]), [4, 4], false, null, 'next')).slice(0, 2), ['n0:480', 'r480:480']);
  const evs = e8([0, 1920]);
  R.layout(evs, [4, 4], true, null, 'next');
  T.eq('fill: saved durations unchanged', evs.map((e) => e.dur), [480, 480]);

  // beams
  const beams = (evs, ts = [4, 4]) => R.beams(R.layout(evs, ts), ts).map((g) => g.map((it) => it.tick));
  T.eq('eighths: beamed per beat', beams([0, 480, 960, 1440].map((t) => ev(t, 480))), [[0, 480], [960, 1440]]);
  T.eq('sixteenths: four per beam', beams([0, 240, 480, 720, 960, 1200].map((t) => ev(t, 240))), [[0, 240, 480, 720], [960, 1200]]);
  T.eq('a rest breaks the beam', beams([ev(0, 240), ev(480, 240), ev(720, 240)]), [[480, 720]]);
  T.eq('triplets: one beam', beams([ev(0, 320), ev(320, 320), ev(640, 320)]), [[0, 320, 640]]);
  T.eq('6/8: three eighths per beam', beams([0, 480, 960, 1440, 1920, 2400].map((t) => ev(t, 480)), [6, 8]),
    [[0, 480, 960], [1440, 1920, 2400]]);
  T.eq('dotted eighths in a row: beamed 3+3+2', beams([0, 720, 1440, 2160, 2880].map((t) => ev(t, 720)).concat([ev(3600, 240)])),
    [[0, 720, 1440, 2160], [2880, 3600]]);
  T.eq('3/4 dotted eighths: one beam', beams([0, 720, 1440, 2160].map((t) => ev(t, 720)), [3, 4]), [[0, 720, 1440, 2160]]);
  T.eq('flags',[480, 240, 120, 60, 960].map(R.flags), [1, 2, 3, 4, 0]);

  T.eq('count labels', [0, 240, 480, 720, 960, 320].map((t) => R.countLabel(t, [4, 4])), ['1', '1 e', '1 +', '1 a', '2', '1 trip']);
};
