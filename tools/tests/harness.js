'use strict';
/*
 * Tiny test helper: loads files from js/ into a fake browser window (vm) and counts checks.
 *   const T = require('./harness')(repoDir);
 *   const TC = T.load(['state.js', 'model.js']);
 *   T.eq('label', actual, expected);
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

module.exports = function (repo) {
  const results = [];
  const T = {
    load(files) {
      const store = {};
      const ctx = {
        console,
        localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
      };
      ctx.window = ctx;
      vm.createContext(ctx);
      for (const f of files) vm.runInContext(fs.readFileSync(path.join(repo, 'js', f), 'utf8'), ctx, { filename: f });
      return ctx.TC;
    },
    eq(label, actual, expected) {
      const a = JSON.stringify(actual), e = JSON.stringify(expected);
      results.push({ ok: a === e, label, a, e });
    },
    ok(label, cond) {
      results.push({ ok: !!cond, label, a: String(!!cond), e: 'true' });
    },
    results,
  };
  return T;
};
