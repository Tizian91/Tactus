'use strict';
/*
 * Manual (hilfe.html): the parts taken from the program itself, so they never go stale -
 * which line is which instrument (js/drummap.js) and the gestures / shortcuts (js/shortcuts.js);
 * light / dark as set in Tactus; the table of contents follows the reading position.
 */
(function (TC) {
  // language and theme as in Tactus (its settings in this browser)
  let settings = {};
  try { settings = (JSON.parse(localStorage.getItem('tactus.settings') || 'null') || {}).settings || {}; } catch (e) { /* none */ }
  TC.state.settings.lang = 'de';
  if (settings.theme === 'dark' || settings.theme === 'light') document.documentElement.setAttribute('data-theme', settings.theme);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // which line is which instrument: a small staff with the notehead per instrument
  const D = TC.drums;
  D.setNotation('tactus');
  const SP = 8, top = 30;
  const staff = (a) => {
    const y = (line) => top + line * SP / 2;
    let s = '';
    for (let k = 0; k < 5; k++) s += `<line class="staffline" x1="2" x2="70" y1="${top + k * SP}" y2="${top + k * SP}"/>`;
    for (let l = -2; l >= a.line; l -= 2) s += `<line class="staffline" x1="24" x2="48" y1="${y(l)}" y2="${y(l)}"/>`;
    for (let l = 10; l <= a.line; l += 2) s += `<line class="staffline" x1="24" x2="48" y1="${y(l)}" y2="${y(l)}"/>`;
    const head = TC.HEADS[a.head] || TC.HEADS.normal;
    s += `<text class="head" x="${36 - head.w[0] * SP / 2}" y="${y(a.line)}" style="font-size:${SP * 4}px">${head.g[0]}</text>`;
    return `<svg width="72" height="${top * 2 + 4 * SP}" viewBox="0 0 72 ${top * 2 + 4 * SP}" aria-hidden="true">${s}</svg>`;
  };
  // position on the staff, counted from the top line (line 0 = top line, odd = space)
  const LINE = (l) => {
    if (l >= 0 && l <= 8) return l % 2 ? `Zwischenraum ${(l + 1) / 2} (unter Linie ${(l + 1) / 2})` : `Linie ${l / 2 + 1}${l === 0 ? ' (oberste)' : l === 8 ? ' (unterste)' : ''}`;
    if (l < 0) return l % 2 ? `über ${l === -1 ? 'der obersten Linie' : `der ${(-l - 1) / 2}. Hilfslinie oben`}` : `${-l / 2}. Hilfslinie oben`;
    return l % 2 ? `unter ${l === 9 ? 'der untersten Linie' : `der ${(l - 9) / 2}. Hilfslinie unten`}` : `${(l - 8) / 2}. Hilfslinie unten`;
  };
  const arts = TC.DRUM_ARTS.map((a, i) => [a, i]).sort((x, y) => x[0].line - y[0].line || x[1] - y[1]).map((x) => x[0]);
  const rows = arts.map((a) => `<tr><td class="staff">${staff(a)}</td><td>${esc(D.label(a))}</td><td><code>${esc(a.ab)}</code></td>` +
    `<td>${esc(LINE(a.line))}${a.voice === 1 ? ' · Fuß' : ''}</td></tr>`).join('');
  const table = document.getElementById('lines-table');
  if (table) table.innerHTML = `<tr><th></th><th>Instrument</th><th>Kürzel</th><th>Position (von oben)</th></tr>${rows}`;

  // gestures and keyboard shortcuts, as in the settings window
  const keys = document.getElementById('keys-list');
  if (keys) keys.innerHTML = TC.SHORTCUTS.map(([k, d]) => `<dt>${esc(TC.tr(k))}</dt><dd>${esc(TC.tr(d))}</dd>`).join('');

  // table of contents: mark the chapter being read
  const links = [...document.querySelectorAll('nav.toc a[href^="#"]')];
  const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const mark = () => {
    let cur = targets[0];
    for (const t of targets) if (t.getBoundingClientRect().top < 120) cur = t;
    links.forEach((a) => a.classList.toggle('on', cur && a.getAttribute('href') === '#' + cur.id));
  };
  document.addEventListener('scroll', mark, { passive: true });
  mark();
})(window.TC);
