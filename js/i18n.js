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
    'Page view: A4 pages as printed (PDF: Ctrl+P)': 'Seitenansicht: A4-Seiten wie gedruckt (PDF: Strg+P)',
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
    Notation: 'Darstellung',
    'Kit profiles (Cubase)…': 'Kit-Profile (Cubase)…',
    'Which key of your drum VST is which instrument; drum maps for Cubase': 'Welche Taste deines Drum-VSTs welches Instrument ist; Drummaps für Cubase',
    'Kit profiles': 'Kit-Profile',
    'No kit profile yet.': 'Noch kein Kit-Profil.',
    'Load the Cubase drum map of your drum VST (.drm). Tactus guesses from the key names which key is which instrument; you only correct what does not fit.': 'Lade die Cubase-Drummap deines Drum-VSTs (.drm). Tactus erkennt an den Namen, welche Taste welches Instrument ist; du korrigierst nur, was nicht passt.',
    'Load drum map…': 'Drummap laden…',
    'New from drum map…': 'Neu aus Drummap…',
    'Rename…': 'Umbenennen…',
    'Close': 'Schließen',
    'Line': 'Linie',
    'Key in the drum map': 'Taste in der Drummap',
    'More keys': 'Weitere Tasten',
    'more keys': 'weitere',
    'Line and notehead are fixed per instrument (Tactus notation, also in the Cubase drum map). Choose the key of your drum map for each one; more keys (e.g. 11, 61) are recognised on import.': 'Linie und Notenkopf sind pro Instrument fest (Tactus-Darstellung, auch in der Cubase-Drummap). Wähle für jedes die Taste aus deiner Drummap; weitere Tasten (z. B. 11, 61) werden beim Import erkannt. ◦ = gehört gerade zu einem anderen Instrument.',
    'Drum keys without a Tactus instrument:': 'Schlagzeug-Tasten ohne Instrument in Tactus:',
    '{n} more keys of the drum map have no Tactus instrument (info)': '{n} weitere Tasten der Drummap haben kein Instrument in Tactus (nur zur Info)',
    'Please check (same output note as another instrument):': 'Bitte prüfen (gleiche Ausgangsnote wie ein anderes Instrument):',
    '(no name)': '(ohne Name)',
    'Export MIDI': 'MIDI exportieren',
    'Import MIDI…': 'MIDI importieren…',
    'Import MIDI': 'MIDI importieren',
    'Track': 'Spur',
    'All tracks': 'Alle Spuren',
    'Track {n}': 'Spur {n}',
    '{n} notes': '{n} Noten',
    'in the file: {t}': 'in der Datei: {t}',
    '{n} notes in {b} bars.': '{n} Noten in {b} Takten.',
    'Import': 'Importieren',
    'Cancel': 'Abbrechen',
    'Comes from': 'Kommt von',
    'Grid': 'Raster',
    '1/16 + triplets': '1/16 + Triolen',
    '1/32 + triplets': '1/32 + Triolen',
    '1/8 + triplets': '1/8 + Triolen',
    '1/16 (no triplets)': '1/16 (ohne Triolen)',
    '1/32 (no triplets)': '1/32 (ohne Triolen)',
    'Keys without an instrument (left out):': 'Tasten ohne Instrument (weggelassen):',
    '{n} notes in {b} bars, tempo {t}.': '{n} Noten in {b} Takten, Tempo {t}.',
    '{m} hits merged (flam / drag or the same position).': '{m} Schläge zusammengefasst (Flam / Drag oder gleiche Stelle).',
    'The import replaces the open score. Velocity: soft = ghost note, loud = accent.': 'Der Import ersetzt das offene Stück. Anschlag: leise = Ghost-Note, laut = Akzent.',
    'MIDI imported: {n} notes': 'MIDI importiert: {n} Noten',
    'This is not a MIDI file.': 'Das ist keine MIDI-Datei.',
    'Drop a MIDI file (.mid) here to import it.': 'Eine MIDI-Datei (.mid) hier ablegen, um sie zu importieren.',
    'Kit: {name}': 'Kit: {name}',
    '(missing)': '(fehlt)',
    'Kit profile of this score: MIDI export uses its keys. Click: change': 'Kit-Profil dieses Stücks: der MIDI-Export nimmt seine Tasten. Klick: wechseln',
    'Export MIDI ({name})': 'MIDI exportieren ({name})',
    'Export MIDI for': 'MIDI exportieren für',
    'Use for this score': 'Für dieses Stück verwenden',
    'used by this score': 'wird von diesem Stück verwendet',
    'General MIDI (Guitar Pro …)': 'General MIDI (Guitar Pro …)',
    'Kit profile: {name}': 'Kit-Profil: {name}',
    '{a} played as {b}': '{a} → gespielt als {b}',
    '{a}: no key in the profile, left out': '{a}: keine Taste im Profil, weggelassen',
    'MIDI exported. The kit profile "{name}" has no key for:': 'MIDI exportiert. Das Kit-Profil „{name}“ hat keine Taste für:',
    'MIDI exported: {file}': 'MIDI exportiert: {file}',
    'Look the same in Cubase (same line and notehead):': 'Sehen in Cubase gleich aus (gleiche Linie und gleicher Notenkopf):',
    'Save drum map for Cubase': 'Drummap für Cubase speichern',
    'Export profiles': 'Profile exportieren',
    'Import profiles…': 'Profile importieren…',
    'This is not a Cubase drum map (.drm).': 'Das ist keine Cubase-Drummap (.drm).',
    '{name} (copy)': '{name} (Kopie)',
    'Name of the kit profile:': 'Name des Kit-Profils:',
    'Delete the kit profile "{name}"?': 'Kit-Profil „{name}“ löschen?',
    '{n} kit profile(s) imported.': '{n} Kit-Profil(e) importiert.',
    'This is not a Tactus kit file.': 'Das ist keine Tactus-Kit-Datei.',
    'Where the instruments sit on the staff. Only the display changes.': 'Wo die Instrumente im Notensystem stehen. Nur die Anzeige ändert sich, das Stück bleibt gleich.',
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
    'PDF / print…': 'PDF / Drucken …',
    // page view, PDF, bar text
    Text: 'Text',
    'e.g. Verse, Chorus': 'z. B. Strophe, Refrain',
    'New line from this bar (page view)': 'Neue Zeile ab diesem Takt (Seitenansicht)',
    'Bars per line': 'Takte pro Zeile',
    Automatic: 'Automatisch',
    'Bar numbers': 'Taktnummern',
    'At the start of each line': 'Am Zeilenanfang',
    'Every bar': 'An jedem Takt',
    None: 'Keine',
    'Endless view': 'Endlos-Ansicht',
    'Page view': 'Seitenansicht',
    'PDF: choose "Save as PDF" as the printer. Bar menu: text above a bar, new line.': 'PDF: als Drucker „Als PDF speichern“ wählen. Taktmenü: Text über dem Takt, neue Zeile.',
    'Text above the bar…': 'Text über dem Takt …',
    'New line from this bar': 'Neue Zeile ab diesem Takt',
    'Line break after this bar': 'Zeilenumbruch nach diesem Takt',
    'Line break after this bar (page view)': 'Zeilenumbruch nach diesem Takt (Seitenansicht)',
    'manual line break': 'manueller Zeilenumbruch',
    'Text above bar {n} (e.g. Verse, Chorus) – empty: remove': 'Text über Takt {n} (z. B. Strophe, Refrain) – leer: entfernen',
    'Line breaks show in the page view': 'Zeilenumbrüche sieht man in der Seitenansicht',
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
    // bars: beams, copy, simile
    '(default)': '(Standard)',
    'Beam groups': 'Balkengruppen',
    Beams: 'Balken',
    'Play from here': 'Ab hier abspielen',
    Space: 'Leertaste',
    'Copy bar': 'Takt kopieren',
    'Paste into this bar': 'In diesen Takt einfügen',
    'Duplicate bar': 'Takt verdoppeln',
    'Repeat the bar before (%)': 'Vorigen Takt wiederholen (%)',
    Copy: 'Kopieren',
    Paste: 'Einfügen',
    Duplicate: 'Verdoppeln',
    'Bar {n} copied – click a bar and paste (Ctrl+V)': 'Takt {n} kopiert – Takt anklicken und einfügen (Strg+V)',
    'Copy a bar first (Ctrl+C)': 'Erst einen Takt kopieren (Strg+C)',
    'Pasted into bar {n}': 'In Takt {n} eingefügt',
    'The first bar has no bar before it to repeat': 'Vor dem ersten Takt gibt es keinen Takt zum Wiederholen',
    'repeats the bar before (%) – bar menu: write it out': 'wiederholt den vorigen Takt (%) – im Taktmenü ausschreiben',
    // grace notes, roll, sticking, counting
    Grace: 'Vorschlag',
    'No grace note': 'Kein Vorschlag',
    'Flam: one grace note just before': 'Flam: ein Vorschlag kurz davor',
    'Drag (ruff): two grace notes just before': 'Drag (Ruff): zwei Vorschläge kurz davor',
    Roll: 'Wirbel',
    'No roll': 'Kein Wirbel',
    '{n} stroke(s) through the stem: the note is played as a roll': '{n} Strich(e) durch den Hals: die Note wird als Wirbel gespielt',
    Sticking: 'Sticking',
    'No sticking': 'Kein Sticking',
    'Right hand (written under the staff)': 'Rechte Hand (steht unter den Noten)',
    'Left hand (written under the staff)': 'Linke Hand (steht unter den Noten)',
    'Counting under the staff (1 e + a)': 'Zählhilfe unter den Noten (1 e + e)',
    'Note values': 'Notenwerte',
    'Up to the end of the beat': 'Bis zum Ende des Schlags',
    'Up to the next note': 'Bis zur nächsten Note',
    'As written': 'Wie gesetzt',
    'Rest cleanup: a note lasts until the next one instead of leaving rests (saved with the score).': 'Pausenbereinigung: Eine Note reicht bis zur nächsten statt Pausen zu lassen (wird im Stück gespeichert).',
    Drag: 'Ziehen',
    'Write a row of notes (e.g. hi-hat eighths)': 'Notenreihe setzen (z. B. Hi-Hat-Achtel)',
    '{n} more': '{n} weitere',
    'release: write': 'loslassen: setzen',
    Finger: 'Finger',
    'drag: row of notes': 'ziehen: Notenreihe',
    'Hold a note, then drag: row of notes': 'Note lange drücken, dann ziehen: Notenreihe',
    // playback
    Playback: 'Wiedergabe',
    Metronome: 'Metronom',
    Click: 'Klick',
    'Count-in (one bar)': 'Einzähler (ein Takt)',
    'Loop (the selected bar, otherwise everything)': 'Schleife (der ausgewählte Takt, sonst alles)',
    'Sound when writing a note': 'Klang beim Setzen einer Note',
    Volume: 'Lautstärke',
    'Space: play / stop · plays from the selected bar.': 'Leertaste: abspielen / stoppen · spielt ab dem ausgewählten Takt.',
    'Play / stop': 'Abspielen / stoppen',
    'Copy / paste / duplicate the bar': 'Takt kopieren / einfügen / verdoppeln',
    'Play / stop (Space) – from the selected bar': 'Abspielen / stoppen (Leertaste) – ab dem ausgewählten Takt',
    'Loop: the selected bar, otherwise everything': 'Schleife: der ausgewählte Takt, sonst alles',
    'Tempo (quarter notes per minute)': 'Tempo (Viertel pro Minute)',
    'This browser cannot play sound': 'Dieser Browser kann keinen Klang abspielen',
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
