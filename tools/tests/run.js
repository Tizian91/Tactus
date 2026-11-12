'use strict';
/*
 * Runs every tools/tests/test_*.js and writes the result into a text file.
 * Node is not needed - VS Code's own Electron runs it (see README.md in this folder):
 *
 *   ELECTRON_RUN_AS_NODE=1 "<VS Code>/Code.exe" tools/tests/run.js "<repo>" "<output>.txt"
 */
const fs = require('fs'), path = require('path');
const repo = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const outFile = process.argv[3] || path.join(repo, 'test-results.txt');
const lines = [];
let pass = 0, fail = 0;

for (const f of fs.readdirSync(__dirname).filter((x) => /^test_.*\.js$/.test(x)).sort()) {
  const T = require('./harness')(repo);
  try {
    require(path.join(__dirname, f))(T);
  } catch (e) {
    T.results.push({ ok: false, label: 'crashed: ' + (e && e.stack || e), a: '', e: '' });
  }
  lines.push(`== ${f}`);
  for (const r of T.results) {
    if (r.ok) pass++;
    else fail++;
    lines.push(r.ok ? `  ok    ${r.label}` : `  FAIL  ${r.label}\n        got      ${r.a}\n        expected ${r.e}`);
  }
}
lines.unshift(`${fail ? 'FAILED' : 'ALL OK'}: ${pass} passed, ${fail} failed`, '');
fs.writeFileSync(outFile, lines.join('\n') + '\n');
process.exitCode = fail ? 1 : 0;
