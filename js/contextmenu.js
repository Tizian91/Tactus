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

  let at = { x: 0, y: 0 }, timer = 0;
  /** Keep the menu inside the window (inline: as high as the window at most, it scrolls). */
  /** The part of the page on the screen (a phone: the page may be wider than the display, or zoomed in). */
  const screenBox = () => {
    const v = window.visualViewport;
    return v ? { x: v.offsetLeft, y: v.offsetTop, w: Math.min(v.width, window.innerWidth), h: Math.min(v.height, window.innerHeight) }
      : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  };
  function place() {
    const b = screenBox(), inline = root.classList.contains('inline');
    root.style.maxHeight = inline ? b.h - 8 + 'px' : '';
    root.style.maxWidth = inline ? b.w - 8 + 'px' : '';
    const r = root.getBoundingClientRect();
    root.style.left = Math.max(b.x + 4, Math.min(at.x, b.x + b.w - r.width - 4)) + 'px';
    root.style.top = Math.max(b.y + 4, Math.min(at.y, b.y + b.h - r.height - 4)) + 'px';
  }

  /**
   * Open a menu at screen position (x, y). Fingers, a narrow window or a menu taller than the window: submenus
   * fold out downwards (tap opens them) and the menu scrolls - nothing ends up off the screen.
   */
  M.open = function (list, x, y) {
    entries = list;
    clearTimeout(timer);
    root.innerHTML = build(list, []);
    root.classList.remove('inline');
    root.style.maxHeight = '';
    root.hidden = false;
    at = { x, y };
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const sb = screenBox();
    if (coarse || sb.w < 640 || root.getBoundingClientRect().height > sb.h - 8 || root.getBoundingClientRect().width > sb.w - 8) root.classList.add('inline');
    place();
  };

  M.close = function () {
    clearTimeout(timer);
    if (root) root.hidden = true;
    entries = [];
  };

  /** Close an opened row and everything opened below it. */
  const shut = (item) => {
    item.classList.remove('open');
    item.querySelectorAll('.menu-item.open').forEach((x) => x.classList.remove('open'));
  };
  /** Open a row's submenu: beside it, flipped to the left / moved up when it would leave the window, scrolling if too tall. */
  function openSub(item) {
    item.classList.add('open');
    const sub = item.querySelector(':scope > .menu-sub');
    if (!sub || root.classList.contains('inline')) return;
    sub.classList.remove('flip-x', 'scroll');
    sub.style.top = '';
    sub.style.maxHeight = '';
    let r = sub.getBoundingClientRect();
    const b = screenBox();
    if (r.right > b.x + b.w - 4) sub.classList.add('flip-x');
    if (r.height > b.h - 8) {
      sub.style.maxHeight = b.h - 8 + 'px';
      sub.classList.add('scroll');
      r = sub.getBoundingClientRect();
    }
    if (r.bottom > b.y + b.h - 4) sub.style.top = `${b.y + b.h - 4 - r.bottom - 5}px`;
    if (r.top < b.y + 4) sub.style.top = `${b.y + 4 - r.top - 5}px`;
  }

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
    if (!el || el.classList.contains('disabled')) return;
    if (el.classList.contains('has-sub')) {
      // a tap on a row with a submenu: open / close it (inline: below the row; else beside it, e.g. a finger on a wide screen)
      const sub = el.querySelector(':scope > .menu-sub');
      if (sub && sub.contains(e.target)) return; // (a tap on the edge of its open submenu, between rows)
      clearTimeout(timer);
      if (el.classList.contains('open')) {
        if (root.classList.contains('inline')) shut(el); // (beside: opened by the mouse already - a click keeps it)
      } else {
        [...el.parentElement.children].forEach((x) => { if (x !== el && x.classList.contains('open')) shut(x); });
        openSub(el);
      }
      if (root.classList.contains('inline')) place();
      return;
    }
    const it = entryAt(el.dataset.path);
    M.close();
    if (it && it.action) it.action();
  }

  /**
   * Mouse over a row: its submenu opens, another one open at this level closes - with a short delay when one is
   * open already, so moving slowly or slanted towards a submenu (over other rows, over the gap) does not lose it.
   */
  function onHover(e) {
    if (root.classList.contains('inline')) return;
    const el = e.target.closest('.menu-item');
    if (!el) return;
    clearTimeout(timer);
    const other = [...el.parentElement.children].find((x) => x !== el && x.classList.contains('open'));
    const go = () => {
      if (other) shut(other);
      if (el.classList.contains('has-sub') && !el.classList.contains('disabled') && !el.classList.contains('open')) openSub(el);
    };
    if (other) timer = setTimeout(go, 300);
    else go();
  }
})(window.TC);
