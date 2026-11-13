# Tactus – Plan

Ein Notenschreibprogramm im Browser: Noten werden per Klick auf die richtige Linie an die
richtige Stelle gesetzt. Zuerst Schlagzeug, später Notensystem und Tabulatur.
Formate und MIDI-Werte wie in Guitar Pro.

## Grundentscheidungen

- **Bauweise wie MindMapper:** reines JavaScript ohne Build-Schritt, läuft per Doppelklick
  (`file://`) und auf GitHub Pages, installierbar und offline nutzbar. Kein Node nötig; Tests laufen
  mit dem Electron von VS Code.
- **Datenmodell wie Guitar Pro:** Taktköpfe (Taktart, Tempo, Wiederholung) für alle Spuren, jede Spur
  hat eigene Takte mit bis zu 4 Stimmen; Zeit in Ticks (960 pro Viertel). Dadurch passen später
  Notensystem, Tabulatur und der .gp-Export ohne Umbau hinein.
- **Schläge statt Notendauern:** Eine Note behält den Notenwert, mit dem sie gesetzt wurde, endet aber
  spätestens beim nächsten Schlag ihrer Stimme. Pausen, Punktierungen, Triolen und Balken berechnet
  das Programm (`rhythm.js`).
- **Raster = Notenwert:** Klickbar sind nur die Positionen des gewählten Notenwerts. Ein feineres Raster
  verbreitert die Takte, damit eine Rasterzelle nie zu schmal wird; der Zoom ändert nur die Größe.
- **Doppelt belegte Linien:** Die Linie bestimmt das Instrument; liegt das im Panel gewählte Instrument
  auf dieser Linie, wird es gesetzt (z. B. Hi-Hat offen statt geschlossen, Rimshot statt Snare).
- **Zwei Stimmen beim Schlagzeug:** Hände (Hälse nach oben), Füße (Bassdrum, Hi-Hat-Pedal, Hälse nach unten).

## Phasen

| Phase | Inhalt | Stand |
|---|---|---|
| **0: Grundlagen** | Gerüst aus MindMapper (Undo, Panel, Menüs, Sprache, Farbschema, Offline-App), Datenmodell, Drum-Map nach Guitar Pro, Rhythmus-Logik mit Tests | ✅ fertig |
| **1: Schlagzeug-Editor** | Klick ins Raster mit Vorschau, Notenwert-Panel, Instrumentwahl, zwei Stimmen, Balken, Pausen, Triolen, Auswahl / Löschen, Rückgängig, Endlos-Ansicht | ✅ fertig (Feinschliff nach Rückmeldung) |
| **2: Notenblatt** | Seitenansicht A4 mit Zeilen- und Seitenumbruch, Kopf mit Titel / Interpret / Tempo, **PDF** über den Druckdialog (wie MindMapper `printPages`), Takt-Texte, Taktnummern, Velocity, Wiederholungen | ✅ Seitenansicht + PDF (Velocity, Wiederholungen offen) |
| **3: Wiedergabe** | Web Audio: synthetisierte Schlagzeugklänge (später eingebettete Samples), mitlaufender Cursor, Metronom, Schleife, Tempo | ✅ Grundfunktion fertig (Samples später) |
| **4: Teilen & Austausch** | ~~GitHub Pages~~ ✅ (https://tizian91.github.io/Tactus/), Teilen per Link (Stück komprimiert im `#`-Teil der Adresse), MIDI-Export, MusicXML-Export (Import in Guitar Pro) | |
| **5: Notensystem** | Violin- / Bassschlüssel, Tonarten, Vorzeichen, Haltebögen über Taktgrenzen, mehrere Spuren untereinander | |
| **6: Tabulatur** | Saiten / Bünde, Stimmungen, Tabulatur unter dem Notensystem, Bend / Slide | |
| **7: Extras** | .gp-Export (Guitar Pro 7/8), MIDI-Eingang (Aufnahme), Kopieren / Einfügen von Takten, Volta-Klammern | |

## Phase 1b – Rückmeldung nach dem ersten Ausprobieren ✅

- Linie leichter treffen: Standardgröße 160 %, Name an der Vorschau-Note, Linie unter dem Zeiger hervorgehoben,
  Magnet zur nächsten belegten Linie, **Instrument-Sperre** (Schalter fürs Tablet, `L`, Shift halten am PC)
- Drum-Map entschlackt: **Drum-Kit** (Standard 5-teilig / Groß / Alle / Eigene Auswahl), Kürzel direkt an der
  Linie in zwei Spalten (Linien / Zwischenräume), Hover-Kopplung Kürzel ↔ Linie, Klick auf Kürzel wählt das
  Instrument, Option „nur benutzte“
- **Zwei Panels:** links pro Note (für die Hand ohne Stift), rechts selten Gebrauchtes; **Linkshändermodus** tauscht sie
- Mehrfachauswahl jetzt mit Strg+Klick (Shift ist die Sperre)
- **Tablet:** ein Finger ziehen = scrollen, tippen = setzen, lange drücken = Taktmenü, zwei Finger = Zoom; der Stift setzt sofort

## Phase 1c – Phase 1 abgeschlossen ✅

- **Balkengruppen** für ungerade Taktarten (7/8 = 2+2+3, 3+2+2 …, 5/8 = 3+2), Pausen füllen die Gruppen
- **Ziehen** setzt eine Notenreihe (z. B. Hi-Hat-Achtel in einem Zug), ein Rückgängig-Schritt
- **Takte** kopieren / einfügen / verdoppeln (Strg+C / V / D), **%-Takt** (wiederholt den vorigen; ausschreibbar)
- **Flam, Drag, Wirbel (1–3 Striche), Sticking (R/L)** pro Note im Noten-Panel
- **Zählhilfe** (1 e + e, 1 tri let) unter den Noten, abschaltbar

## Phase 1d – Feinschliff: Setzen und Pausen ✅

- **Pausenbereinigung** (Schlagzeug, Einstellungen → Ansicht → Notenwerte): eine Note reicht bis zur nächsten
  ihrer Stimme, höchstens bis zum Ende ihres Schlags (ungerade Taktarten: ihrer Balkengruppe); ein Schlag ohne
  Note behält seine Pause. Wahlweise „bis zur nächsten Note“ oder „wie gesetzt“; im Stück gespeichert
  (`track.fill`). Nur beim Zeichnen (und für die Länge eines Wirbels) – die gespeicherten Dauern bleiben, damit
  später Notensystem und Tabulatur echte Notenlängen haben. Notenwert per Mausrad entfällt dadurch.
- **Setzen beim Loslassen** (Maus / Stift): gedrückt halten und hoch / runter bewegen wählt die Linie, Loslassen
  setzt; seitwärts beginnt die Notenreihe. Auswählen / Löschen einer Note auch erst beim Loslassen auf ihr.
- **Notenreihe mit dem Finger:** Note lange drücken, dann ziehen (lange drücken auf leere Stelle: Taktmenü wie bisher).
  Mit Maus / Stift lässt sich eine Reihe auch von einer vorhandenen Note aus ziehen.

## Phase 2 – Notenblatt (Seitenansicht, PDF) ✅ Grundfunktion

- **Seitenansicht** (Werkzeugleiste „Seite“): A4-Seiten untereinander, die Takte brechen in Zeilen um und
  werden auf die Zeilenbreite ausgeglichen (die letzte Zeile höchstens so weit wie die davor); jede Zeile
  beginnt mit dem Schlüssel. Abstände wie gedruckt: das Klickraster verbreitert hier nichts.
- Kopf auf Seite 1: Titel, Untertitel, Interpret; Tempo über der ersten Zeile; Seitenzahl ab Seite 2.
- **Takte pro Zeile** (automatisch / fest), **Zeilenumbruch nach einem Takt** oder **neue Zeile ab einem Takt**
  (Taktmenü, Takt-Panel); manuelle Umbrüche sind in der Seitenansicht mit ↵ markiert (nicht im Druck).
- **Takt-Text** (Intro, Strophe, Refrain, Fill …) im Kasten über dem Takt: Taktmenü oder Takt-Panel.
- **Taktnummern:** am Zeilenanfang / an jedem Takt / keine (Endlos-Ansicht: immer an jedem Takt).
- **PDF / Drucken** (Datei-Menü, Strg+P): jede Seite als eigenes SVG, schwarz auf weiß, ohne Raster und
  Auswahl; im Druckdialog „Als PDF speichern“.
- Bearbeiten geht in beiden Ansichten gleich (Klick, Ziehen, Finger). Technisch: jeder Takt hat ein x in
  „Notenzeilen-Koordinaten“, die Zeilen werden nur verschoben gezeichnet (`TC.render.toLocal`).
- Offen: Velocity, Wiederholungszeichen / Volta, Kopf auf Folgeseiten, Seitenränder einstellbar.

## Phase 4a – Drummaps und Darstellung (begonnen)

- **Darstellung** umschaltbar (Einstellungen → Drum-Kit): „Tactus“ (Standard, wie in der eigenen Cubase-Drummap:
  Bassdrum und Pedal auf der untersten Linie, Toms von oben nach unten, Crash 2 / China / Splash über der Hi-Hat)
  oder „Guitar Pro“. Nur die Zeichnung ändert sich; das Stück speichert weiter das Instrument (Guitar-Pro-Nummer).
- Cubase-Drummaps (`.drm`) lesen und auf die Tactus-Darstellung umschreiben (`js/cubase.js`,
  `tools/restyle_drummaps.js`): EZDrummer 3, Groove Agent (Ozzie), UJAM BeatMaker.
- **Kit-Profile** (Einstellungen → Drum-Kit → „Kit-Profile (Cubase)…“): Cubase-Drummap eines Drum-VSTs laden, Tactus
  ordnet die Tasten über die Namen zu; pro Instrument (feste Linie und Kopf) nur die Taste wählen, weitere Tasten
  für den Import. Verdächtige Tasten (gleiche Ausgangsnote wie ein anderes Instrument) werden gemeldet, Tasten ohne
  Tactus-Instrument aufgelistet. „Drummap für Cubase speichern“ schreibt die `.drm` mit der Tactus-Darstellung.
  Gespeichert im Browser, Export / Import als `*.tactus-kits.json`.
- Crash 3 einer Drummap wird Crash 1 (hoch) zugeordnet, Crash 4 Crash 2 (zwei Crash-Linien bleiben lesbar, klingen aber verschieden).
- **Kit-Profil des Stücks** (Statusleiste „Kit: …“, Klick zum Wechseln; im Dialog „Für dieses Stück verwenden“): wird
  mit dem Stück gespeichert (Id und Name, damit es auf einem anderen Rechner per Name gefunden wird).
- **MIDI-Export** (Datei → MIDI exportieren): General MIDI (auch für Guitar Pro) oder ein Kit-Profil. Strg+E exportiert mit dem
  Kit-Profil des Stücks, „MIDI exportieren für“ wählt ein anderes. Tempo, Taktart,
  Takt-Texte als Marker, Anschlag (Ghost / Akzent), Flam / Drag / Wirbel ausgeschrieben, %-Takte ausgeschrieben;
  fehlt im Profil eine Taste, wird ein verwandtes Instrument genommen und gemeldet.
- **MIDI-Import** (Datei → MIDI importieren oder `.mid` aufs Fenster ziehen): Herkunft (Kit-Profil des Stücks
  vorgeschlagen, alle Tasten eines Instruments zählen) und Raster wählen (1/16 + Triolen …; pro Schlag gerade oder
  Triole, je nachdem was besser passt), Vorschau mit Anzahl und unbekannten Tasten. Anschlag → Ghost / Akzent,
  leise Schläge kurz davor → Flam / Drag, Tempo, Taktarten und Marker werden übernommen. Ersetzt das offene Stück.
  Bei einem ganzen Projekt wird die Schlagzeugspur vorgeschlagen (Name / Kanal 10), Tempo im Dialog änderbar.
- Später: fehlende Instrumente (Tom-Rimshots, Accent, Hi-Hat-Pedal offen …), Wirbel beim Import erkennen,
  Import in das offene Stück (ab einem Takt), `.gp`-Export (ZIP + eigenes XML, größerer Aufwand; Guitar Pro
  liest MIDI ohne Triolen).

## Phase 3 – Wiedergabe (Grundfunktion) ✅

- Synthetisierte Klänge (Web Audio, keine Dateien): Bassdrum, Snare / Rimshot / Sidestick, Toms, Hi-Hat zu /
  halb / offen / Pedal, Ride / Glocke, Crash, Splash, China, Cowbell, Percussion; abgestoppte Becken kurz
- Ghost leise, Akzent laut; Flam / Drag als Vorschläge, Wirbel als schnelle Schläge
- Abspielen ab dem ausgewählten Takt (Leertaste / ▶), mitlaufender Cursor, Ansicht folgt
- Metronom, Einzähler, Schleife (ausgewählter Takt, sonst alles), Tempo in der Werkzeugleiste, Lautstärke
- Änderungen während des Abspielens sind sofort zu hören; Klang beim Setzen einer Note
- Später: echte Samples, Swing / Shuffle, Tempo pro Takt im Panel, Wiederholungszeichen beim Abspielen

## Offen zum Ausprobieren

- Fühlt sich das Raster richtig an (Breite der Zellen, Einrasten, Vorschau)?
- Klingen die synthetischen Sounds brauchbar, oder lohnen sich bald echte Samples?
