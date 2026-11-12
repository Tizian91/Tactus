'use strict';
// Cubase drum maps (js/cubase.js): read, recognise instruments, restyle to the Tactus layout.
module.exports = function (T) {
  const C = T.load(['cubase.js']).cubase;
  const item = (i, o, d, head, name, ins = '', tech = '') => `      <item>
         <int name="INote" value="${i}"/>
         <int name="ONote" value="${o}"/>
         <int name="Channel" value="9"/>
         <float name="Length" value="200"/>
         <int name="DisplayNote" value="${d}"/>
         <int name="Voice" value="0"/>
         <string name="Name" value="${name}" wide="true"/>
         <int name="NoteheadSet" value="${head}"/>
         <string name="InstrumentEntityID" value="${ins}"/>
         <string name="TechniqueEntityID" value="${tech}"/>
      </item>`;
  const drm = `<?xml version="1.0" encoding="utf-8"?>
<DrumMap>
   <string name="Name" value="Test" wide="true"/>
   <list name="Map" type="list">
${[item(20, 20, 0, 0, 'Intro'), item(28, 28, 0, 0, 'Kick A'), item(36, 36, 62, 0, 'Kick'), item(44, 41, 67, 0, 'Floortom 2 Center'),
    item(38, 38, 79, 0, 'Snare Center'), item(37, 37, 72, 15, 'Snare Sidestick'), item(46, 46, 46, 33, 'Hi-Hat Open Edge 2'),
    item(12, 12, 77, 33, 'Hi-Hat Open Tip 0'), item(50, 50, 50, 34, 'Crash 2 Muted Hit'), item(53, 53, 53, 5, 'Ride Bell'),
    item(73, 73, 73, 0, 'Floortom 2 Rimshot'), item(60, 60, 0, 0, '-')].join('\n')}
   </list>
   <list name="Order" type="int">
      <item value="36"/>
      <item value="38"/>
   </list>
</DrumMap>
`;
  const m = C.parse(drm);
  T.eq('parse: name, entries, order', [m.name, m.entries.length, m.order], ['Test', 12, [36, 38]]);
  T.eq('parse: input / output note', [m.entries[3].inote, m.entries[3].onote, m.entries[3].name], [44, 41, 'Floortom 2 Center']);
  T.eq('roles', m.entries.map(C.roleOf), [null, null, 'kick', 'tomFloor', 'snare', 'sidestick', 'hhOpen', 'hhHalf', 'crash2:muted', 'rideBell', 'tomFloor:rimshot', null]);

  const r = C.restyle(drm, { name: 'Test (Tactus)' });
  const n = C.parse(r.text);
  T.eq('restyle: new name', n.name, 'Test (Tactus)');
  T.eq('restyle: display notes', n.entries.map((e) => e.display), [0, 0, 64, 65, 72, 72, 79, 79, 81, 77, 65, 0]);
  T.eq('restyle: noteheads', n.entries.map((e) => e.head), [0, 0, 0, 0, 0, 23, 3, 3, 34, 25, 2, 0]);
  T.eq('restyle: techniques', n.entries.map((e) => e.technique), ['', '', '', '', 'pt.centre', 'pt.sideStick', 'pt.open2', 'pt.halfOpen', 'pt.muted', 'pt.bell', 'pt.rimShot', '']);
  T.eq('restyle: sounds stay', n.entries.map((e) => e.inote + '>' + e.onote), m.entries.map((e) => e.inote + '>' + e.onote));
  T.eq('restyle: no collisions', r.collisions, []);
  T.eq('restyle: only notation lines change',
    r.text.split('\n').filter((l) => !/DisplayNote|NoteheadSet|EntityID|name="Name"/.test(l)).join('\n'),
    drm.split('\n').filter((l) => !/DisplayNote|NoteheadSet|EntityID|name="Name"/.test(l)).join('\n'));

  const role = (name) => C.roleOf({ name, inote: 50, display: 50, instrument: '' });
  T.eq('BeatMaker slots', ['Kick 1', 'Kick 2', 'Snare 2', 'Snare 3, Clap', 'HiHat 1', 'HiHat 2', 'HiHat 3', 'Tom L', 'Tom H, Fx, Perc', 'FX 1, Bass, Perc', 'FX 2, Perc', 'Cym 1', 'Cym 2', 'Cym 3', 'Verse 1', 'Fill 2'].map(role),
    ['kick', 'kick2', 'snare2', 'clap', 'hhClosed', 'hhHalf', 'hhOpen', 'tomLow', 'tomHigh', 'clapPerc', 'tambourine', 'crash1', 'ride', 'crash2', null, null]);
};
