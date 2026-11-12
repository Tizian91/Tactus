'use strict';
/*
 * Drop-down / right-click menus (taken over from MindMapper's contextmenu.js).
 *
 * A menu is a list of entries:
 *   { label, action, shortcut?, checked?, disabled?, submenu?: [...] }
 *   '-'  -> separator
 *   falsy entries are skipped, so `cond && {...}` works.
 * Labels are English and translated with TC.tr.
 */
(function (TC) {
  const M = (TC.menu = {});
  const esc = (s) => TC.render.esc(s);
  let root;
  let entries = [];

  M.init = function () {
    root = document.getElementById('context-menu');
    root.addEventListener('click', onClick);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('mouseover', onHover);
    document.addEventListener('pointerdown', (e) => {
      if (!root.hidden && !root.contains(e.target) && !e.target.closest('#file-btn, #zoom-label')) M.close();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !root.hidden) {
        e.stopPropagation();
        M.close();
      }
    }, true);
    window.addEventListener('blur', () => M.close());
  };

  M.isOpen = () => root && !root.hidden;

  function build(list, path) {
    let h = '';
    list.forEach((it, i) => {
      if (!it) return;
      if (it === '-') {
        h += '<div class="menu-sep"></div>';
        return;
      }
      const p = path.concat(i).join('.');
      const cls = ['menu-item'];
      if (it.disabled) cls.push('disabled');
      if (it.submenu) cls.push('has-sub');
      h += `<div class="${cls.join(' ')}" data-path="${p}">` +
        `<span class="menu-check">${it.checked ? '✓' : ''}</span>` +
        `<span class="menu-label">${esc(TC.tr(it.label))}</span>` +
        `<span class="menu-shortcut">${it.submenu ? '▸' : esc(it.shortcut || '')}</span>`;
      if (it.submenu) h += `<div class="menu menu-sub">${build(it.submenu, path.concat(i))}</div>`;
      h += '</div>';
    });
    return h;
  }

  /** Open a menu at screen position (x, y). */
  M.open = function (list, x, y) {
    entries = list;
    root.innerHTML = build(list, []);
    root.hidden = false;
    const r = root.getBoundingClientRect();
    root.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    root.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
  };

  M.close = function () {
    if (root) root.hidden = true;
    entries = [];
  };

  function entryAt(path) {
    let list = entries, it = null;
    for (const i of path.split('.').map(Number)) {
      it = list[i];
      list = (it && it.submenu) || [];
    }
    return it;
  }

  function onClick(e) {
    const el = e.target.closest('.menu-item');
    if (!el || el.classList.contains('disabled') || el.classList.contains('has-sub')) return;
    const it = entryAt(el.dataset.path);
    M.close();
    if (it && it.action) it.action();
  }

  // flip submenus that would leave the window
  function onHover(e) {
    const el = e.target.closest('.menu-item.has-sub');
    if (!el) return;
    const sub = el.querySelector(':scope > .menu-sub');
    sub.classList.remove('flip-x');
    sub.style.top = '';
    const r = sub.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) sub.classList.add('flip-x');
    if (r.bottom > window.innerHeight - 4) sub.style.top = `${window.innerHeight - 4 - r.bottom - 4}px`;
  }
})(window.TC);
