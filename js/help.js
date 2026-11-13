'use strict';
/*
 * Help window: a short explanation (HTML) in a dialog, e.g. "How jumps work" (ⓘ in the panel).
 * Later the place for the chapters of the manual. Esc / ✕ / a click beside it closes it.
 */
(function (TC) {
  const H = (TC.help = {});
  let root = null;

  H.isOpen = () => !!root;

  H.open = function (title, html) {
    H.close();
    root = document.createElement('div');
    root.className = 'dialog-backdrop';
    root.innerHTML = `<div class="dialog help-dialog" role="dialog" aria-modal="true">
      <header><h2></h2><button type="button" class="icon" data-k="close" title="${TC.tr('Close')}">✕</button></header>
      <div class="help-body">${html}</div></div>`;
    root.querySelector('h2').textContent = title;
    root.addEventListener('pointerdown', (e) => { if (e.target === root) H.close(); });
    root.addEventListener('click', (e) => { if (e.target.closest('[data-k="close"]')) H.close(); });
    document.body.appendChild(root);
  };

  H.close = function () {
    if (root) root.remove();
    root = null;
  };
})(window.TC);
