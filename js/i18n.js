'use strict';
/*
 * Language (German / English) and theme (light / dark / auto).
 * The program is written in English; TC.tr('English text') returns the German text
 * when German is chosen. HTML elements with data-i18n / data-i18n-title are translated
 * by TC.updateUIStrings().
 */
(function (TC) {
  const DE = {
    // toolbar
    'File ▾': 'Datei ▾',
    'New, open, save': 'Neu, öffnen, speichern',
    'Undo (Ctrl+Z)': 'Rückgängig (Strg+Z)',
    'Redo (Ctrl+Y)': 'Wiederholen (Strg+Y)',
    Endless: 'Endlos',
    Page: 'Seite',
    'Endless view: all bars in one row': 'Endlos-Ansicht: alle Takte in einer Reihe',
    'Page view (A4) – phase 2': 'Seitenansicht (A4) – kommt in Phase 2',
    'Drum map': 'Drum-Map',
    'Show which instrument sits on which line': 'Zeigt, welches Instrument auf welcher Linie liegt',
    Panel: 'Panel',
    'Show / hide the panel': 'Panel ein-/ausblenden',
    'Toggle theme (light / dark / auto)': 'Farbschema wechseln (hell / dunkel / automatisch)',
    'Switch language': 'Sprache wechseln',
    'Expand panel': 'Panel ausklappen',
    'Collapse panel': 'Panel einklappen',
    Settings: 'Einstellungen',
    'Show / hide the note panel': 'Noten-Panel ein-/ausblenden',
    'Show / hide the settings panel (score, bar, drum kit)': 'Einstellungs-Panel ein-/ausblenden (Stück, Takt, Drum-Kit)',
    'Show the note panel': 'Noten-Panel zeigen',
    'Show the settings panel': 'Einstellungs-Panel zeigen',
    'Drag: width · double-click: default width': 'Ziehen: Breite · Doppelklick: Standardbreite',
    'Default size (160 %)': 'Standardgröße (160 %)',
    // instrument lock, drum kit, drum map, view
    'Lock instrument': 'Instrument sperren',
    'A click anywhere in the column writes the selected instrument (L, or hold Shift)': 'Ein Klick irgendwo in die Spalte setzt das gewählte Instrument (L, oder Shift halten)',
    'On: the height no longer matters.': 'An: Die Höhe spielt keine Rolle mehr.',
    'Hold Shift: lock while held · L: switch': 'Shift halten: sperrt, solange gehalten · L: umschalten',
    'Instrument lock on: the height no longer matters': 'Instrument-Sperre an: Die Höhe spielt keine Rolle mehr',
    'Instrument lock off': 'Instrument-Sperre aus',
    'instrument lock': 'Instrument-Sperre',
    'Other instruments: drum kit in the settings panel.': 'Weitere Instrumente: Drum-Kit im Einstellungs-Panel.',
    'Drum kit': 'Drum-Kit',
    Kit: 'Kit',
    '{n} instruments – only these appear in the note panel and the drum map.': '{n} Instrumente – nur diese erscheinen im Noten-Panel und in der Drum-Map.',
    'Choose instruments': 'Instrumente auswählen',
    'Show next to the staff': 'Neben den Notenlinien zeigen',
    'Only instruments used in the score': 'Nur im Stück benutzte Instrumente',
    'Pointer on a short name: its line lights up. Click: choose the instrument.': 'Zeiger auf ein Kürzel: Seine Linie leuchtet auf. Klick: Instrument wählen.',
    'click: choose': 'Klick: wählen',
    View: 'Ansicht',
    'Left-handed mode (swap the panels)': 'Linkshändermodus (Panels tauschen)',
    'Lock instrument (switch / while held)': 'Instrument sperren (umschalten / solange gehalten)',
    'Ctrl+click': 'Strg+Klick',
    'Select several notes': 'Mehrere Noten auswählen',
    // menus
    'New score': 'Neues Stück',
    'Open…': 'Öffnen…',
    Save: 'Speichern',
    'Save as…': 'Speichern unter…',
    'Load example groove': 'Beispiel-Groove laden',
    'PDF / print (phase 2)': 'PDF / Drucken (Phase 2)',
    'Zoom in': 'Vergrößern',
    'Zoom out': 'Verkleinern',
    'To the start': 'Zum Anfang',
    'Time signature from here': 'Taktart ab hier',
    'Other…': 'Andere…',
    'Insert bar before': 'Takt davor einfügen',
    'Insert bar after': 'Takt danach einfügen',
    'Clear bar': 'Takt leeren',
    'Delete bar': 'Takt löschen',
    // messages
    '{n} note(s) deleted': '{n} Note(n) gelöscht',
    'The last bar cannot be deleted': 'Der letzte Takt kann nicht gelöscht werden',
    'Invalid time signature': 'Ungültige Taktart',
    'Time signature (e.g. 7/8, 11/16)': 'Taktart (z. B. 7/8, 11/16)',
    'The page view follows in phase 2 (together with the PDF export)': 'Die Seitenansicht kommt in Phase 2 (zusammen mit dem PDF-Export)',
    'Discard the changes of the open score?': 'Änderungen am offenen Stück verwerfen?',
    'File name': 'Dateiname',
    'Saved: {name}': 'Gespeichert: {name}',
    'Could not save: {msg}': 'Speichern fehlgeschlagen: {msg}',
    'Opened: {name}': 'Geöffnet: {name}',
    'This file cannot be opened: {msg}': 'Diese Datei lässt sich nicht öffnen: {msg}',
    'Click on the staff to write a note · right-click a bar for its menu': 'Auf die Notenlinien klicken, um eine Note zu setzen · Rechtsklick auf einen Takt für sein Menü',
    'Unsaved changes (kept in the browser)': 'Ungespeicherte Änderungen (im Browser gesichert)',
    'Welcome to Tactus': 'Willkommen bei Tactus',
    Bar: 'Takt',
    'click: delete': 'Klick: löschen',
    'click: select': 'Klick: auswählen',
    'Add a bar': 'Takt anhängen',
    // panel
    Notes: 'Noten',
    Whole: 'Ganze',
    Half: 'Halbe',
    Quarter: 'Viertel',
    Eighth: 'Achtel',
    Sixteenth: 'Sechzehntel',
    '32nd': 'Zweiunddreißigstel',
    '64th': 'Vierundsechzigstel',
    triplet: 'Triole',
    'Note value': 'Notenwert',
    Dotted: 'Punktiert',
    'Dotted (.)': 'Punktiert (.)',
    Triplet: 'Triole',
    'Triplet (T)': 'Triole (T)',
    'Click grid': 'Klick-Raster',
    'changes the selected notes': 'ändert die ausgewählten Noten',
    Instrument: 'Instrument',
    "A click on another line writes that line's instrument.": 'Ein Klick auf eine andere Linie setzt das Instrument dieser Linie.',
    'As the drum map': 'Wie in der Drum-Map',
    Normal: 'Normal',
    Cross: 'Kreuz',
    'Circled cross': 'Kreuz im Kreis',
    'Circle with slash': 'Kreis mit Strich',
    'Heavy cross': 'Dickes Kreuz',
    'Cross with hat': 'Kreuz mit Dach',
    Diamond: 'Raute',
    Triangle: 'Dreieck',
    Slashed: 'Durchgestrichen',
    'Selected notes ({n})': 'Ausgewählte Noten ({n})',
    'Next note': 'Nächste Note',
    Accent: 'Akzent',
    'No accent': 'Kein Akzent',
    'Accent (A)': 'Akzent (A)',
    Marcato: 'Marcato',
    'Ghost note': 'Ghost Note',
    'Ghost note: head in brackets, played softly (G)': 'Ghost Note: Notenkopf in Klammern, leise gespielt (G)',
    Notehead: 'Notenkopf',
    Delete: 'Löschen',
    'Delete (Del)': 'Löschen (Entf)',
    Deselect: 'Abwählen',
    'Click a bar or right-click it: time signature, insert, delete.': 'Takt anklicken oder Rechtsklick: Taktart, einfügen, löschen.',
    'Time sig.': 'Taktart',
    'Applies from this bar up to the next change.': 'Gilt ab diesem Takt bis zur nächsten Änderung.',
    '+ before': '+ davor',
    '+ after': '+ danach',
    Clear: 'Leeren',
    Score: 'Stück',
    Title: 'Titel',
    Subtitle: 'Untertitel',
    Artist: 'Interpret',
    Tempo: 'Tempo',
    'Keyboard shortcuts': 'Tastenkürzel',
    'Whole … 64th note': 'Ganze … 64tel Note',
    'Hi-hat closed / open, snare, kick': 'Hi-Hat zu / offen, Snare, Bassdrum',
    'Ride, crash, floor tom, pedal hi-hat': 'Ride, Crash, Standtom, Hi-Hat-Pedal',
    'Accent / ghost note': 'Akzent / Ghost Note',
    'Selected notes to the next instrument': 'Ausgewählte Noten zum nächsten Instrument',
    Del: 'Entf',
    'Delete selected notes': 'Ausgewählte Noten löschen',
    'Undo / redo': 'Rückgängig / wiederholen',
    Wheel: 'Mausrad',
    'Scroll (Ctrl: zoom, Shift: up/down)': 'Scrollen (Strg: Zoom, Umschalt: hoch/runter)',
    'Space+drag': 'Leertaste+Ziehen',
    'Move the view': 'Ansicht verschieben',
  };

  TC.getLang = () => (TC.state && TC.state.settings && TC.state.settings.lang) || 'de';

  /** English text -> current language; {name} placeholders filled from vars. */
  TC.tr = function (s, vars) {
    let out = TC.getLang() === 'de' && Object.prototype.hasOwnProperty.call(DE, s) ? DE[s] : s;
    if (vars) out = String(out).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return out;
  };

  TC.setLang = function (lang) {
    TC.state.settings.lang = lang === 'en' ? 'en' : 'de';
    TC.saveSettings();
    TC.updateUIStrings();
    TC.panel.rebuild();
    TC.refresh();
  };

  TC.updateUIStrings = function () {
    document.documentElement.lang = TC.getLang();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      if (!el.dataset.i18nSrc) el.dataset.i18nSrc = el.dataset.i18n;
      el.textContent = TC.tr(el.dataset.i18nSrc);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = TC.tr(el.dataset.i18nTitle);
      el.setAttribute('aria-label', el.title);
    });
    const lb = document.getElementById('lang-btn');
    if (lb) lb.textContent = TC.getLang().toUpperCase();
    TC.applyTheme();
  };

  TC.isDarkMode = function () {
    const t = TC.state.settings.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };

  TC.applyTheme = function () {
    const t = TC.state.settings.theme;
    const root = document.documentElement;
    if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = t === 'auto' ? '🌓' : (TC.isDarkMode() ? '🌙' : '☀️');
  };

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (TC.state.settings.theme === 'auto') TC.applyTheme();
    });
  }
})(window.TC);
