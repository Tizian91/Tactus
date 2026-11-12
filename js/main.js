'use strict';
/* Startup, redraw, toolbar and status bar. */
(function (TC) {
  const S = TC.state;
  const tr = (s, v) => TC.tr(s, v);
  const UI = (TC.ui = {});

  UI.status = function (text) {
    const el = document.getElementById('status-info');
    if (el) el.textContent = text;
  };

  let hintTimer = 0;
  /** Short message in the status bar. */
  UI.hint = function (text) {
    const el = document.getElementById('status-hint');
    el.textContent = text;
    el.classList.add('flash');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      el.classList.remove('flash');
      el.textContent = tr('Click on the staff to write a note · right-click a bar for its menu');
    }, 2600);
  };

  UI.updateZoom = function () {
    const el = document.getElementById('zoom-label');
    if (el) el.textContent = `${Math.round(S.doc.view.zoom * 100)}% ▾`;
  };

  /** Redraw everything after a change. */
  TC.refresh = function () {
    TC.render.draw();
    TC.panel.update();
    const file = document.getElementById('status-file');
    file.textContent = (S.dirty ? '● ' : '') + S.file.name;
    file.title = S.dirty ? tr('Unsaved changes (kept in the browser)') : '';
    document.querySelector('#toolbar [data-action="undo"]').disabled = !TC.history.undoStack.length;
    document.querySelector('#toolbar [data-action="redo"]').disabled = !TC.history.redoStack.length;
    document.querySelector('#toolbar [data-action="toggleDrumMap"]').classList.toggle('active', !!S.settings.showDrumMap);
    document.querySelectorAll('#toolbar [data-action="layout"]').forEach((b) => b.classList.toggle('active', b.dataset.value === (S.settings.layout === 'page' ? 'page' : 'endless')));
    const play = document.getElementById('play-btn');
    play.textContent = TC.player.playing ? '■' : '▶';
    play.classList.toggle('active', TC.player.playing);
    document.getElementById('loop-btn').classList.toggle('active', !!S.settings.loop);
    document.getElementById('metro-btn').classList.toggle('active', !!S.settings.metronome);
    const tempo = document.getElementById('tempo-input');
    if (document.activeElement !== tempo) tempo.value = S.doc.meta.tempo;
    UI.updateZoom();
    document.title = (S.doc.meta.title ? S.doc.meta.title + ' – ' : '') + 'Tactus';
  };

  function initToolbar() {
    document.getElementById('toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-action]');
      if (!b) return;
      const fn = TC.actions[b.dataset.action];
      if (fn) fn(b.dataset.value);
    });
    const tempo = document.getElementById('tempo-input');
    tempo.addEventListener('change', () => {
      S.doc.meta.tempo = TC.clamp(Math.round(Number(tempo.value) || 120), 20, 400);
      TC.commit();
    });
    tempo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') tempo.blur();
    });
  }

  function init() {
    TC.storage.loadSettings();
    TC.drums.setNotation(S.settings.notation);
    const back = TC.storage.restore();
    if (back) {
      S.doc = back.doc;
      S.file.name = back.name || S.file.name;
      S.dirty = back.dirty;
    } else {
      S.doc = TC.storage.demoDoc(); // first start: an example to look at
      S.file.name = 'Example.tactus.json';
    }
    // the default size became 160 %: a score kept from before is enlarged once
    let toStart = !back;
    if (!S.settings.zoomV2) {
      if (S.doc.view.zoom === 1) {
        S.doc.view.zoom = TC.DEFAULT_ZOOM;
        toStart = true;
      }
      S.settings.zoomV2 = true;
      TC.saveSettings();
    }
    // the title moved up (room for bar texts): back to the start once, so it is not cut off
    if (!S.settings.viewV3) {
      S.settings.viewV3 = true;
      toStart = true;
      TC.saveSettings();
    }
    TC.history.reset();
    TC.applyTheme();
    TC.updateUIStrings();
    TC.render.init();
    TC.menu.init();
    TC.panel.init();
    TC.interaction.init();
    initToolbar();
    if (toStart) TC.actions.home();
    TC.refresh();
    UI.hint(tr('Welcome to Tactus'));
    // the music font may arrive a moment later: draw again, so widths fit
    if (document.fonts && document.fonts.load) document.fonts.load('40px Bravura').then(() => TC.refresh());
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline copy is optional */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.TC);
