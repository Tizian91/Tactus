'use strict';
/*
 * Gives Cubase drum maps the notation of a reference layout (TC.cubase.ROLES, the Tactus layout):
 * display note, notehead, instrument and technique. Sounds (INote / ONote) and names stay.
 *
 *   ELECTRON_RUN_AS_NODE=1 "<VS Code>/Code.exe" tools/restyle_drummaps.js <in.drm> [...]
 *
 * Writes "<name> (Tactus).drm" next to each file and prints what changed.
 */
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '..', 'js', 'cubase.js'));
const C = globalThis.TC.cubase;
const log = [];
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const map = C.parse(src);
  const res = C.restyle(src, { roles: C.KNOWN[map.name], name: map.name.replace(/\s*\[\d+\]$/, '') + ' (Tactus)' });
  const out = path.join(path.dirname(file), path.basename(file, '.drm') + ' (Tactus).drm');
  fs.writeFileSync(out, res.text, 'utf8');
  log.push(`=== ${path.basename(file)} -> ${path.basename(out)}  (${res.changes.length} entries)`);
  for (const c of res.changes) log.push(`  ${c.inote}>${c.onote}\t${c.name}\t${c.role}\t${c.from.display}/${c.from.head} -> ${c.to.display}/${c.to.head}`);
  for (const k of res.collisions) log.push(`  COLLISION ${k.key}: ${k.a.role} (${k.a.notes}) / ${k.b.role} (${k.b.inote})`);
  const skipped = map.entries.filter((e) => e.name && !C.roleOf(e) && !/^sound \d+$/i.test(e.name) && e.name !== '-');
  log.push('  not recognised: ' + skipped.map((e) => `${e.inote} ${e.name}`).join(', '));
}
console.log(log.join('\n'));
