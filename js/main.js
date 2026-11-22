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
    file.textContent = (S.dirty ? '● ' : '') + (S.file.dropbox ? '☁ ' : '') + S.file.name;
    file.title = (S.file.dropbox ? tr('In Dropbox: {path}', { path: S.file.dropbox.path }) + ' · ' : '') +
      (S.dirty ? tr('Unsaved changes (kept in the browser)') : '');
    document.querySelector('#toolbar [data-action="undo"]').disabled = !TC.history.undoStack.length;
    document.querySelector('#toolbar [data-action="redo"]').disabled = !TC.history.redoStack.length;
    document.querySelector('#toolbar [data-action="toggleDrumMap"]').classList.toggle('active', !!S.settings.showDrumMap);
    document.querySelectorAll('#toolbar [data-action="layout"]').forEach((b) => b.classList.toggle('active', b.dataset.value === (S.settings.layout === 'page' ? 'page' : 'endless')));
    const play = document.getElementById('play-btn');
    play.textContent = TC.player.playing ? '■' : '▶';
    play.classList.toggle('active', TC.player.playing);
    TC.wake.update(); // (keep the screen on while playing / on stage)
    document.getElementById('loop-btn').classList.toggle('active', !!S.settings.loop);
    document.getElementById('metro-btn').classList.toggle('active', !!S.settings.metronome);
    const pm = document.querySelector('#perform-bar [data-p="clickMenu"]'); // (stage bar: ♩ lit while it clicks)
    if (pm) pm.classList.toggle('on', !!S.settings.metronome);
    document.getElementById('follow-btn').classList.toggle('active', S.settings.followPlay !== false);
    // "Parts ▾": only when there are texts above bars to jump to
    const sec = document.getElementById('section-btn');
    if (sec) sec.hidden = !S.doc.bars.some((h) => h.marker);
    // sound switch: only when a track has a MIDI output - MIDI off for a moment (all with Tactus' sounds) and on again
    const snd = document.getElementById('sound-btn');
    if (snd) {
      const on = !S.settings.midiOff;
      snd.hidden = !TC.midiOut.supported() || !TC.midiOut.chosen();
      snd.textContent = on ? 'MIDI' : 'Tactus';
      snd.classList.toggle('active', on);
      snd.classList.toggle('missing', on && TC.midiOut.missing());
      snd.title = tr(on ? 'MIDI on: the tracks with a MIDI output play there. Click: all with Tactus sounds' : 'MIDI off: all tracks with Tactus sounds. Click: MIDI on');
    }
    const tempo = document.getElementById('tempo-input');
    if (document.activeElement !== tempo) tempo.value = S.doc.meta.tempo;
    UI.updateZoom();
    const kit = document.getElementById('status-kit');
    if (kit) {
      const p = TC.kits.current(S.doc), missing = !p && S.doc.meta.kitName;
      const lacks = p ? TC.kits.check(S.doc, p).length : 0; // instruments of the score without a key
      kit.textContent = tr('Kit: {name}', { name: p ? p.name : missing ? S.doc.meta.kitName + ' ' + tr('(missing)') : 'General MIDI' }) + (lacks ? ' ⚠' : '');
      kit.classList.toggle('missing', !!missing);
      kit.classList.toggle('lacks', !!lacks);
      kit.title = tr('Kit profile of this score: MIDI export uses its keys. Click: change');
    }
    const trk = document.getElementById('status-track');
    if (trk) {
      // several tracks: the one shown and written (click: the next one)
      trk.hidden = S.doc.tracks.length < 2;
      trk.textContent = tr('Track: {name}', { name: TC.curTrack().name + (TC.curTrack().lh ? ' (' + tr('left hand') + ')' : '') });
      trk.title = tr('The track you see and write into. Click: next track (all tracks: panel "Tracks")');
    }
    document.title = (S.doc.meta.title ? S.doc.meta.title + ' – ' : '') + 'Tactus';
  };

  function initToolbar() {
    document.getElementById('toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-action]');
      if (!b) return;
      const fn = TC.actions[b.dataset.action];
      if (fn) fn(b.dataset.value);
    });
    document.getElementById('status-kit').addEventListener('click', () => TC.actions.kitMenu());
    document.getElementById('status-track').addEventListener('click', () => TC.actions.nextTrack());
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
    TC.kits.load();
    if (TC.kswLib) TC.kswLib.load();
    if (S.settings.remoteIn && TC.remote && TC.remote.supported()) TC.remote.init(); // page turning by MIDI: listen again
    // recorded sounds switched on: load them with the first touch (the browser allows sound only then)
    document.addEventListener('pointerdown', () => { if (S.settings.samples && TC.samples.state() === 'off') TC.samples.load(TC.audio.context()); }, { once: true, capture: true });
    // a MIDI file dropped on the window: import it
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      if (!/\.midi?$/i.test(f.name)) {
        UI.hint(tr('Drop a MIDI file (.mid) here to import it.'));
        return;
      }
      const r = new FileReader();
      r.onload = () => TC.midiIn.open(new Uint8Array(r.result), f.name);
      r.readAsArrayBuffer(f);
    });
    const back = TC.storage.restore();
    if (back) {
      S.doc = back.doc;
      S.file.name = back.name || S.file.name;
      S.file.dropbox = back.dropbox;
      S.file.saved = !!back.dropbox;
      S.dirty = back.dirty;
    } else {
      S.doc = TC.storage.demoDoc(); // first start: an example to look at
      S.file.name = 'Example.tactus.json';
    }
    // one MIDI output for all tracks (before 2026-11-16): the tracks of this score get it, once - now each has its own
    if (S.settings.midiOut) {
      S.doc.tracks.forEach((t) => { if (!t.midiOut) t.midiOut = S.settings.midiOut; });
      S.settings.midiOut = '';
      TC.saveSettings();
    }
    if (TC.midiOut.supported() && TC.midiOut.chosen()) TC.midiOut.init(); // the tracks' MIDI outputs again (permission is remembered)
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
    TC.drums.applyDoc(S.doc); // the score's notation and stems
    TC.score.revoice(S.doc);
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
    // back from the Dropbox sign-in / already connected: kit profiles in step
    if (TC.dropbox) TC.dropbox.start();
    // opened with a share link (#s=…): its score
    if (TC.share) TC.share.openFromHash();
    // opened from the manual (index.html?beispiel=spruenge): that example, then the address without it
    const ex = new URLSearchParams(location.search).get('beispiel');
    if (ex) {
      TC.storage.loadExample(ex);
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* file:// */ }
    }
    // the music font may arrive a moment later: draw again, so widths fit
    if (document.fonts && document.fonts.load) document.fonts.load('40px Bravura').then(() => TC.refresh());
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline copy is optional */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.TC);
