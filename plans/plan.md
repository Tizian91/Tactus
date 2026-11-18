# Tactus – Plan

Ein Notenschreibprogramm im Browser: Noten werden per Klick auf die richtige Linie an die
richtige Stelle gesetzt. Zuerst Schlagzeug, später Notensystem und Tabulatur.
Formate und MIDI-Werte wie in Guitar Pro.

## Leitlinien

Tactus ist ein Nischenwerkzeug für den Arbeitsweg von Schlagzeugern – kein Konkurrent zu kostenpflichtigen Plattformen mit
Song-Datenbanken.

- **Für immer kostenlos.** Keine Bezahlschranke, kein Konto, keine Anmeldung.
- **Kleinste Einstiegshürde:** Link öffnen und loslegen – im Zug, zuhause, im Bandraum; offline, ohne Installation (installierbar
  auf Wunsch). Ein Stück teilt man per Link.
- **Tiefe nur auf Wunsch:** Wer sich eingewöhnt hat, bettet Tactus vollständig in seinen Ablauf ein (DAW, Drum-Maps / Kit-Profile,
  Drum-VSTs über MIDI, Backing-Tracks mit Umblättern auf der Bühne). Diese Funktionen bleiben optional und stören den Einstieg nicht.
- **Bedienung genauso einfach:** Grundlegendes geht ohne Anleitung; Gesten sind intuitiv (tippen, halten, ziehen – Finger, Stift,
  Maus nach derselben Regel). Die meisten Funktionen findet man zufällig einmal und nutzt sie dann; nichts Wichtiges versteckt sich
  hinter Einstellungen. Neue Funktionen müssen diese Regel einhalten: sinnvolle Standardwerte, keine Pflicht-Einrichtung.
  Zeiten der Gesten: Note halten 350 ms (Reihe / Anschlag / Menü), leere Stelle halten 500 ms (Taktmenü – länger, damit ein Finger,
  der kurz zielt, trotzdem seine Note setzt).

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
| **5: Notensystem** | Violin- / Bassschlüssel, Tonarten, Vorzeichen, Haltebögen über Taktgrenzen, mehrere Spuren untereinander | ✅ Melodie-Spur (Schritt A), ✅ Stufenakkorde (Schritt B), ✅ Liedtext (Schritt C), weiter mit Klaviersystem – siehe „Phase 5 – Melodien“ |
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
- ⚙ → Seite: **Seitenränder** (10–30 mm, Standard 15) und **Kopf auf Folgeseiten** (Titel · Interpret links, „Seite 2 / 3“ rechts; aus = nur die Seitenzahl unten), mit dem Stück gespeichert.
- **Mehrtaktpausen** (⚙ → Seite, Standard an): mindestens zwei leere Takte hintereinander werden ein ▬ mit der Anzahl darüber – nur Seitenansicht / PDF. Unterbrochen von Taktart, Tempo, Text, Wiederholung, Klammer, %, neuer Zeile. Leer heißt: in **allen** Spuren keine Note (später mehrere Spuren). Hineinklicken schreibt in den ersten Takt.
- **%-Takte** (⚙ → Seite): „Jeder einzeln“, „Schmal, durchgezählt (2, 3, 4 …)“ (der wiederholte Takt ist 1; feste schmale Breite, nicht gestreckt) oder „Zusammengefasst: ein % mit Anzahl“ (Standard; gleiche Regeln wie bei den Pausen).

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
- **Neue Instrumente** für die Drum-VSTs: Rimshot und Rand (Rim Only) für jedes Tom (Raute / Kreuz auf der Tom-Linie),
  Hi-Hat-Pedal offen (Splash), Shaker, Claves / Klick (BeatMaker-Accent); Snare Rim Only = Sidestick. Damit bleibt in
  den eigenen Drummaps keine Schlagzeug-Taste mehr ohne Instrument.
- **Anschlag in fünf Stufen**: Ghost · leise · normal · kräftig · Akzent (nur Ghost und Akzent bekommen ein Zeichen; Ghost
  leiser als bisher, Akzent etwas lauter). Halten + hoch / runter, Notenmenü, MIDI-Export und -Import nutzen alle fünf.
- Später: Wirbel beim Import erkennen (nur was feiner als das Raster ist),
  `.gp`-Export (ZIP + eigenes XML, größerer Aufwand; Guitar Pro
  liest MIDI ohne Triolen).

## Phase 3 – Wiedergabe (Grundfunktion) ✅

- Synthetisierte Klänge (Web Audio, keine Dateien): Bassdrum, Snare / Rimshot / Sidestick, Toms, Hi-Hat zu /
  halb / offen / Pedal, Ride / Glocke, Crash, Splash, China, Cowbell, Percussion; abgestoppte Becken kurz
- Ghost leise, Akzent laut; Flam / Drag als Vorschläge, Wirbel als schnelle Schläge
- Abspielen ab dem ausgewählten Takt (Leertaste / ▶), mitlaufender Cursor, Ansicht folgt
- Metronom, Einzähler, Schleife (ausgewählter Takt, sonst alles), Tempo in der Werkzeugleiste, Lautstärke
- Änderungen während des Abspielens sind sofort zu hören; Klang beim Setzen einer Note
- **„Folgen“** (Werkzeugleiste / Panel): aus = die Ansicht bleibt beim Abspielen stehen, um beim Hören Noten zu ändern
- Später: echte Samples, Swing / Shuffle, Tempo pro Takt im Panel

## Bedienung: setzen, verschieben, Reihen, Takte ✅ (zum Ausprobieren)

Eine Regel für Maus, Stift und Finger:
- Leere Stelle auf den Linien drücken: Vorschau wandert mit (Spalte und Linie), **Loslassen setzt**; neben den Linien losgelassen: nichts
- Note ziehen: **verschieben** (seitlich Zeit, hoch / runter Instrument); Note halten, dann ziehen: **Notenreihe** (Maus: Strg + ziehen)
- Note halten, dann **hoch / runter: Anschlag** Ghost · normal · Akzent (kleiner Balken an der Note; bei mehreren ausgewählten Noten für alle);
  die erste Bewegung nach dem Halten entscheidet: seitlich = Reihe, hoch / runter = Anschlag; Esc nimmt es zurück
- Note halten und **ohne Ziehen loslassen**: kleines Menü mit den **Instrumenten der Linie** (Hi-Hat zu / halb / offen,
  Snare / Rimshot / Sidestick …) und Ghost / normal / Akzent – auf dem Tablet der schnelle Weg von zu nach offen
- Neben den Linien (darüber, darunter, Taktanfang): tippen **wählt den Takt**, ziehen **scrollt**; Finger halten: Taktmenü
- Finger / Stift auf einer leeren Stelle der Linien **still halten**: Taktmenü statt Note (wer vorher zielt, setzt normal)
- Zwei Finger: scrollen + zoomen; Einstellung „Finger setzt Noten“ (aus: Finger wählt nur aus und scrollt)
- Instrument-Sperre gilt nur auf den Linien; darunter / darüber bleibt die Taktauswahl
- **Mehrere Takte**: Shift + Klick neben die Linien, Taktmenü „Takte a–b auswählen“ (Finger: lange drücken), Panel „bis Takt“; Abspielen / Schleife spielt genau diese Takte

## MIDI-Import in das offene Stück ✅

- Im Import-Dialog **Ziel**: „Neues Stück“ (ersetzt das offene, wie bisher) oder **„In das offene Stück“**:
  ab Takt …, aus der Datei Takt … bis …, Taktarten der Datei übernehmen (Standard); die Noten dieser Takte werden
  ersetzt, am Ende kommen bei Bedarf Takte dazu; ein Rückgängig-Schritt, die neuen Takte sind danach ausgewählt

## Teilen per Link ✅

- Datei → **„Link zum Teilen kopieren“** (Tablet / Handy: Teilen-Menü): das ganze Stück steckt komprimiert in der Adresse
  nach „#“ – kein Server, der Teil nach „#“ geht auch nicht an GitHub; ein Groove-Stück ergibt wenige hundert Zeichen
- Wer den Link öffnet, bekommt das Stück (bei ungespeicherten Änderungen wird gefragt); es ist danach nur im Browser,
  speichern wie gewohnt

## Swing / Shuffle ✅

- Takt · Stück → Stück → **Swing**: gerade, leichter Swing, Swing, Shuffle (triolisch, 2:1), harter Shuffle; Achtel oder Sechzehntel
- Abspielen swingt; **MIDI-Export** swingt auch (abschaltbar: gerade Noten, um in der DAW zu swingen)
- Über dem ersten Takt steht „Shuffle“ / „Swing“ neben dem Tempo; Triolen bleiben, wie sie sind

## Paket „Takte“ ✅

- **Tempowechsel ab einem Takt**: Takt-Panel (Feld „Tempo … ab hier“, leer = wie davor) oder Taktmenü „Tempo ab hier…“;
  „♩ = 140“ über dem Takt (beide Ansichten, PDF); Abspielen und MIDI-Export folgen
- **Mehrere Takte**: Kopieren, Einfügen (ab dem Takt, am Ende kommen Takte dazu), Verdoppeln, Leeren, Löschen wirken auf
  die ausgewählten Takte (Panel, Taktmenü „Takte a–b …“, Strg+C / V / D)

## Werkzeuge ✅ (getestet)

- Oben im Noten-Panel (Tasten W / V / E): **✏ Schreiben** (wie bisher), **⬚ Auswählen**, **⌫ Radieren**
- Auswählen: Rahmen auf leerer Fläche ziehen, Shift / Strg + Klick fügt hinzu, eine ausgewählte Note ziehen verschiebt
  **alle** ausgewählten (seitlich in der Zeit, auch über Taktgrenzen; hoch / runter, wenn alle dasselbe Instrument sind),
  halten + loslassen: Menü Instrument / Anschlag für die Auswahl; blockiert, wenn dort schon dieselbe Note liegt
- Radieren: antippen oder über Noten wischen, ein Rückgängig-Schritt; das Radierer-Ende eines Stifts radiert immer
- Strg+A: alle Noten (bzw. die der ausgewählten Takte), ← →: Auswahl ein Raster früher / später; zwei Finger scrollen

## Notenhälse ✅

- Einstellungen (⚙) → Drum-Kit → **Notenhälse**: „Alle nach oben (eine Stimme)“, „Füße nach unten“ oder
  „Füße und tiefe Toms nach unten“ (Standard; welche Toms: Häkchen, voreingestellt Standtom und Standtom 2)
- Beim Umschalten (und beim Laden) wandern die Noten in die passende Stimme; gleichzeitige Schläge werden ein Akkord.
  Nur das Notenbild ändert sich, Klang und MIDI nicht

## Aufgeräumt: Panel und Einstellungsfenster ✅

- Rechtes Panel „Takt · Stück“: nur noch Takt, Wiedergabe, Stück
- **Einstellungsfenster** (⚙ in der Werkzeugleiste, oder „Weitere Einstellungen…“ unten im Panel): Drum-Kit,
  Darstellung, Kit-Profile, Drum-Map, Seite, Ansicht, Tastenkürzel; Esc / ✕ / Klick daneben schließt es

## Wiederholungen ✅ (getestet, auch Sprünge)

- Taktmenü → Wiederholung bzw. Takt-Panel: |: Anfang, :| Ende (2×, 3× …), Klammern 1. / 2. (auch über mehrere Takte);
  mehrere Takte ausgewählt: „Takte a–b wiederholen“
- Abspielen, Cursor und **MIDI-Export schreiben sie aus** (eine MIDI-Datei kennt keine Wiederholungen): Cubase bekommt
  jeden Takt so, wie er gespielt wird, mit einem Marker, wo eine Wiederholung neu beginnt („Takt 5 – 2. Mal“)
- Taktzählung: Tactus zählt geschriebene Takte; beim Abspielen zeigt die Statusleiste zusätzlich den gespielten Takt
  (= Cubase). „Wiederholungen ausschreiben“ macht daraus eigene Takte, dann stimmen die Nummern 1:1
- **Sprünge** ✅: Takt-Panel → Rubrik **„Wiederholungen & Sprünge“** (oder Taktmenü „Wiederholung & Sprung“): Zeichen am Taktanfang
  (𝄋 Segno, ⊕ Coda), am Taktende (Fine, To Coda), Sprung (D.C. / D.S., al Fine / al Coda). Nach dem Sprung: Wiederholungen einmal,
  letzte Klammer (Häkchen „mitspielen“ = con rip.); Fine / To Coda gelten erst nach dem Sprung; jeder Sprung einmal.
  Abspielen, Cursor, MIDI-Export (Marker „D.S. – Takt 3“, „Coda – Takt 9“) und „Ausschreiben“ folgen. Fehlendes (Segno, Fine,
  To Coda, Coda) wird im Panel gemeldet. ⓘ „Wie funktionieren Sprünge?“ erklärt es mit Beispielen (`js/help.js`).
  Seitenansicht: die Coda beginnt eine neue Zeile.

## Dropbox ✅ (getestet)

- Datei → „Mit Dropbox verbinden…“ (nur online, https): eigene Dropbox-App, nur der App-Ordner
- Songs: „Aus Dropbox öffnen…“, „In Dropbox speichern (unter…)“; Strg+S speichert einen Dropbox-Song dorthin zurück,
  bei Änderung auf einem anderen Gerät wird gefragt (überschreiben oder neuer Name)
- Kit-Profile: `Kit-Profile/Kits.tactus-kits.json`, jede Änderung wird hochgeladen, beim Start abgeglichen
- Lokale Dateien (Öffnen / Speichern unter, Export / Import der Kit-Profile) bleiben wie gehabt

## Als Nächstes (Reihenfolge)

1. ~~Kopf auf Folgeseiten, Seitenränder~~ ✅  2. ~~Mehrtaktpausen~~ ✅  3. ~~Tempo-Übersicht, Klang-Umschalter, Profil-Prüfung~~ ✅
4. ~~Wiederholungen & Sprünge (D.S. / D.C. / Coda / Fine)~~ ✅
5. ~~Samples~~ ✅  6. Vorlagen für kostenlose VSTs: ~~MT Power Drum Kit 2, General MIDI~~ ✅ (SSD 5.5 Free offen)
7. ~~Drummaps für andere DAWs (Reaper, Studio One)~~ ✅  8. ~~Handbuch / Hilfeseite mit ⓘ-Links, Beispielstücke~~ ✅
9. ~~Mehrere Spuren~~ ✅ (siehe unten)  10. ~~MusicXML-Export~~ ✅ (in Guitar Pro getestet, siehe unten)
11. **Melodien** (Gesangsmelodie, Tonleitern, Stufenakkorde, Klaviersystem, Liedtext; Reihenfolge A ✅ → B ✅ → C ✅ → E → D, danach Gitarren-Begleitung G, siehe „Phase 5 – Melodien“)

## Mehrere Spuren (als Nächstes)

Vor dem Notensystem: In Partituren bekommen einzelne Schlagzeuginstrumente oft eine eigene Spur (z. B. eine Spur nur mit
Snare oder Becken). Das Datenmodell kennt schon mehrere Spuren (`doc.tracks`), die Oberfläche zeigt bisher nur `tracks[0]`.

- **Übergeordnet (Taktkopf, gilt für alle Spuren):** Taktart, Tempo, Wiederholungen, Klammern, Segno / Coda / Fine, D.C. / D.S.,
  Takt-Text, Zeilenumbruch. Abspielfolge einmal für das ganze Stück.
- **Pro Spur:** Noten, Name, Kit / Instrumente (auch eine Spur mit nur einem Instrument), Kanal, Lautstärke, Pausenbereinigung
  und der **%-Takt** ✅ (vom Taktkopf in den Spur-Takt verschoben; alte Dateien: ein % im Taktkopf wird % in jeder Spur).
  Seitenansicht: % mit Anzahl bzw. Mehrtaktpause nur, wenn es für alle Spuren gilt.

Schritte:
1. ✅ Spuren verwalten (zum Ausprobieren): Panel „Takt · Stück“ → **Spuren**: hinzufügen (+ Spur, nach der aktiven), umbenennen ✎,
   sortieren ↑ ↓, verdoppeln ⧉, löschen ✕ (Rückfrage, wenn Noten drin sind), alles rückgängig machbar. Klick auf den Namen = **aktive
   Spur**: Ansicht, Schreiben, Auswahl (Strg+A), %, „Leeren“ und MIDI-Import „in das offene Stück“ betreffen nur sie. Statusleiste
   „Spur: …“ (ab zwei Spuren; Klick = nächste). Bis Schritt 2 zeigt die Ansicht nur die aktive Spur. **Abspielen und MIDI-Export
   spielen alle Spuren** zusammen. Kopieren / Einfügen / Verdoppeln von Takten nimmt alle Spuren mit; Takte einfügen / löschen
   gilt für alle. Pausenbereinigung gilt für alle Schlagzeugspuren.
2. ✅ Spuren untereinander (zum Ausprobieren), Endlos- und Seitenansicht / PDF: jede sichtbare Spur eine Notenzeile, eine
   Linie links verbindet sie, Name über jeder Zeile (die aktive farbig); Taktstriche, Taktart, Wiederholungszeichen in jeder Zeile,
   Texte / Tempo / Klammern / Sprünge über der obersten. **In eine Zeile klicken = in diese Spur schreiben** (wird aktiv; auch
   Taktmenü). Drum-Map und Vorschau an der Zeile unter dem Zeiger. Mehrtaktpausen / zusammengefasste % nur, wenn es für alle
   sichtbaren Spuren gilt. **Ein- / ausblenden** ◉ / ◌ im Panel (ausgeblendete werden weiter gespielt, nicht gedruckt; eine
   bleibt sichtbar). **Instrumente pro Spur:** „Drum-Kit (⚙)“ oder „Eigene Auswahl“ (Häkchen), dazu **„Eine Notenlinie“**:
   alle Noten auf der Mittellinie, kurze Taktstriche. **„+ Spur für Snare“** (das gewählte Instrument) legt so eine Spur an.
   Noten verschiedener Spuren lassen sich nicht zusammen verschieben. ⚙ → Seite → **Abstand der Notenzeilen** (zwischen den Spuren;
   40–160 %, Standard 80 %; unter 60 % können sich volle Drum-Kits berühren) und **Abstand der Zeilen** (Seitenansicht, wo eine
   Zeile umbricht; 40–160 %, Standard 100 %), beide mit dem Stück gespeichert, Bildschirm und PDF.
3. ✅ Seitenansicht / PDF: in Schritt 2 enthalten
4. ✅ Wiedergabe / MIDI pro Spur (zum Ausprobieren):
   - **M / S** (Stumm / Solo) in der Spurliste; Solo: nur die Solo-Spuren. Gilt fürs Abspielen (auch über MIDI), sofort hörbar.
   - **Kit-Profil pro Spur** (Panel → Spuren → Kit-Profil): „Wie das Stück“, General MIDI oder ein Profil; gespeichert mit Id und Name.
     „Was fehlt“ prüft nur die Spuren, die mit dem Profil spielen.
   - **MIDI-Ausgang und Kanal pro Spur** (nur wenn unter Wiedergabe → Klang ein MIDI-Ausgang gewählt ist): z. B. ein loopMIDI-Port je
     Drum-VST in Cubase, oder ein Port mit verschiedenen Kanälen für ein VST mit mehreren Kits. Leer = wie im Panel / aus dem Kit-Profil.
   - **MIDI-Export** (Strg+E): bei mehreren Spuren ein Dialog – Häkchen je Spur, Drum-Map je Spur (vorgewählt: ihr Kit-Profil),
     „Eine MIDI-Datei pro Spur“ (Standard; „Titel – Spur.mid“, in Chrome / Edge in einen gewählten Ordner, sonst einzelne Downloads)
     oder „Alle in einer Datei“ (Typ 1, je Tactus-Spur eine benannte MIDI-Spur). Jede Datei mit Tempo, Taktarten, Markern,
     ausgeschriebenen Wiederholungen.
   - **MIDI-Import**: Häkchen je MIDI-Spur (Name, Notenzahl, Kanal 10; Spuren ohne Noten wie Automation erscheinen nicht),
     vorgewählt die Schlagzeugspuren; Drum-Map je Spur („Alle aus“ setzt alle). Neues Stück: jede Spur eine Tactus-Spur mit ihrem
     Namen; in das offene Stück: eine Spur in die aktive, mehrere in die Spur gleichen Namens (sonst neu).
5. ✅ **Ansicht folgt beim Abspielen: springend oder flüssig** (Panel → Wiedergabe → Folgen; Einstellung des Browsers): flüssig =
   Cursor bleibt bei einem Drittel der Breite, Seitenansicht: die gespielte Zeile gleitet ins obere Viertel; Sprünge gleiten mit.
   Die Seitenansicht berücksichtigt dabei die Höhe aller Notenzeilen.

## MusicXML-Export ✅ (in Guitar Pro getestet)

- Datei → **„MusicXML exportieren (Guitar Pro, MuseScore …)“** (`js/musicxml.js`, MusicXML 3.1 partwise, `Titel.musicxml`).
- Jede Spur ein Part (Schlagzeug-Notensystem, einlinige Spuren mit einer Linie); jedes Instrument nennt seine General-MIDI-Taste
  (`midi-unpitched`), damit das andere Programm den Klang findet. Noten wie in Tactus gezeichnet: Werte, Pausen, Punktierung,
  Triolen, Balken, zwei Stimmen (Hälse oben / unten).
- Notenköpfe, Ghost (Klammern), Akzent / starker Akzent, Flam / Drag (Vorschlagsnoten), Wirbel (Tremolo-Striche), Sticking (Text
  unter der Note), %-Takte (Taktwiederholung, Noten für die Wiedergabe mitgeschrieben), Taktarten, Tempo und Tempowechsel, Swing
  als Text, Takt-Texte (Studierzeichen), |: :| n×, Klammern 1. / 2., Segno / Coda / Fine / To Coda / D.C. / D.S. (mit `<sound>`
  für die Wiedergabe), Zeilenumbrüche. Texte und Tempo in der ersten Spur, Wiederholungen in allen.
- **Getestet:** Import in Guitar Pro – Noten, Notenköpfe, Wiederholungen funktionieren sauber. **Nicht getestet:** MuseScore (nicht
  vorhanden), Sibelius, Dorico.
- **Sprünge und Guitar Pro** (getestet mit 4 Schreibweisen, `tools/xml_variants.js`): Guitar Pro übernimmt aus MusicXML kein D.S. /
  D.C. / Fine und kein „al Coda“, die Ziele (Segno, Coda) bleiben leer; nur To Coda kommt an (springt dann zu früh). Grund: MusicXML
  kennt kein „al Coda / al Fine“ und keine Doppelzeichen als eigene Art, Guitar Pro errät sie beim Import nicht (alphaTab ebenso,
  PR #2929). Guitar Pro schreibt beim eigenen MusicXML-Export weder Noten noch Sprünge. Daher:
  - Datei → **„MusicXML für Guitar Pro exportieren (Wiederholungen ausgeschrieben)“**: alle Takte in der gespielten Reihenfolge
    (Kopie, `TC.score.unfold`; Tempo an jeder Stelle richtig, auch nach D.C. zurück vor einen Tempowechsel) – spielt in Guitar Pro richtig.
  - Der normale MusicXML-Export bleibt beim Standard (Text, Zeichen, `<sound>` in der Anweisung) – für MuseScore & Co.
  - Saubere Sprungzeichen in Guitar Pro gibt es erst mit einem `.gp`-Export (Phase 7).
- **Sprünge wie in Guitar Pro** ✅: zusätzlich 𝄋𝄋 Segno Segno, ⊕⊕ Double Coda, „To Coda ⊕⊕“, D.S.S. (Dal Segno Segno) und jeweils
  „al Double Coda“ (D.C. / D.S. / D.S.S.); Abspielen, MIDI, „Was fehlt“, MusicXML (`segno2` / `coda2`) folgen. Später für den
  `.gp`-Export genau das Modell von Guitar Pro (Ziele und Sprünge getrennt).

## Phase 5 – Melodien (Schritt A ✅, B ✅, C Liedtext ✅, E Klavier ✅ – als Nächstes: Akkorde als Noten, Klavier + Gitarre)

Tactus als kreatives Werkzeug auf niedrigem Niveau: beim Songschreiben eine **Gesangsmelodie aus dem Kopf** schnell als Noten
festhalten – im Tactus-Stil oft einfacher als in der DAW. Nicht das Ziel: Einspielen (dafür gibt es die DAW).

**Leitlinie:** Eine neue Spur „Melodie“ geht sofort ohne Einrichtung (Violinschlüssel, C-Dur, weicher Klang). Tonleiter, Schlüssel,
Stimmlage nur auf Wunsch. Bei Melodien ist **die Tonhöhe das Kreative**, der Anschlag Feinschliff.

**Reihenfolge:** A ✅ → B Stufenakkorde ✅ → C Liedtext ✅ (vorgezogen, 2026-11-16) → E Klaviersystem ✅ (2026-11-16) → Dynamik ✅ →
G Akkorde als Noten ✅ (2026-11-16) → **D Komfort**.

### Stand nach Schritt B (2026-11-15, noch nicht committet / nicht online)

- **Gebaut:** Stufenakkorde und Akkordsymbole (siehe „Schritt B“ unten, Abschnitt „Gebaut“). Tests: `test_chords.js`,
  `test_chordsyms.js` (zusammen mit allen anderen 625 Prüfungen grün), Klick-Test 234 ok (3 neue für Akkorde).
- **Wo was steht:** `js/pitch.js` (`P.QUALS`, `degreeChord(s)`, `chordName` / `chordText` / `parseChord`, `chordVoicing`,
  `chordTones`, `guideTone`, `lockedLine`), `js/model.js` (`bar.chords`, `bar.guide`, `doc.harmony`, `SC.harmonyTrack` /
  `harmonyScale` / `chordOf` / `chordsIn` / `chordAt` / `setChord` / `chordSlots` / `guideAt`), `js/render.js` (Akkordzeile über
  der ersten Notenzeile, Klammern 1./2. darüber, Markierung `line-chord`), `js/interaction.js` (`pitchAt` mit Akkord-Sperre;
  Verschieben ist frei), `js/playback.js` (`T.CHORD_TRACK`, Fläche), `js/midi.js` (`opts.chords`), `js/musicxml.js`
  (`harmonyXml`), `js/panel.js` (`chordSection`), `js/actions.js` (Akkord-Aktionen, Taktmenü „Akkord“, Export-Dialog),
  Handbuch Kapitel 8 „Akkorde“, Beispiel „Melodie“ mit Akkorden.
- **Entschieden beim Bauen (zum Prüfen):**
  - Stufenakkorde richten sich nach der **ersten Melodie-Spur** (immer dieselbe, damit die Namen nicht beim Spurwechsel
    springen); ohne Melodie-Spur nach der **Tonart des Stücks** (`doc.harmony.key`, Panel „Tonart“).
  - Akkordnamen: englische Buchstaben mit ♯ / ♭; in deutscher Oberfläche **H** und **B** (= B♭). Eingetippt wird in der
    Sprache der Oberfläche gelesen, gespeichert sprachfrei (`F#m7`, `Bb/D`).
  - Stellen im Takt = das Klick-Raster (Notenwert im Panel: Achtel 1 + 2 + …, Sechzehntel in zwei Reihen); ein Akkord an einer
    anderen Stelle bleibt in der Liste. Ohne Raster (Tests): die Schläge.
  - Natürliches Moll gibt als V. Stufe **Em** (nicht E); wer E / E7 will, tippt es ein (oder nimmt harmonisch Moll).
  - Der Akkord-Teppich spielt standardmäßig mit dem Tactus-Synth (ein Drum-VST im Omni-Modus würde ihn als Schläge spielen);
    wahlweise eigener MIDI-Ausgang + Kanal (Panel → Akkorde → Klang, `harmony.midiOut` / `midiCh`, z. B. ein Synth-VST; fehlt
    der Ausgang, spielt Tactus selbst). Er schweigt, wenn eine Spur auf Solo steht. MIDI-Export: sobald Akkorde da sind, öffnet sich der
    Export-Dialog (auch bei einer Spur) mit der Zeile „Akkorde“ (eigene Datei bzw. eigene MIDI-Spur, Kanal 15).
  - Kopieren / Einfügen ganzer Takte nimmt die Akkorde mit (als Stufe: im Ziel-Takt gilt dessen Tonleiter).
- **Noch nicht gemacht (aus dem Plan für B):** Noten, die nach einem Akkordwechsel nicht mehr passen, markieren / „auf Akkordtöne
  setzen“; Antippen eines Akkordsymbols direkt im Notenblatt (bisher: Takt antippen → Panel, oder Taktmenü). Möglicher
  Feinschliff: in der Seitenansicht liegen bei Akkorden + Klammer + Takt-Text drei Reihen eng übereinander.

### Stand 2026-11-15 (für die Weiterarbeit)

- **Schritt A ist fertig und online** (gepusht, GitHub Pages). Der Nutzer testet auf Tablet / Handy; Rückmeldung zu den Fingern
  und zu den Klängen steht noch aus (siehe „Offen zum Ausprobieren“).
- **Nach dem ersten Test auf dem Tablet / Handy behoben:**
  - Noten-Panel der Melodie: die Akzent-Knöpfe waren leer (Notenschrift-Zeichen beim Kopieren verloren – Zeichen der Notenschrift
    immer als `\uE…` schreiben), Akzent auch für die nächsten Noten, Knopf „⁀ Haltebogen zur nächsten Note“ bei ausgewählter Note.
  - Synth: eine kurze Note wartet nicht mehr auf ein langsames Einschwingen (eine Flächen-Achtel schwoll nach ihrem Ende an und
    brach ab); jeder der 21 Klänge hat eigene Einstellungen (`SOUND` in `js/audio.js`: Filterschwung, Vibrato) – Klänge einer
    Gruppe klangen vorher gleich.
  - Notenwert / Punktiert / Triole mit Auswahl ändern **nur die ausgewählten Noten** (wie Akzent und Instrument; vorher auch die
    Einstellung für die nächsten Noten – wirkte, als merke sich eine Position die Länge). Das Panel zeigt den Wert der Auswahl.
  - Finger (Handy): Fangbereich einer Note größer (seitlich ~26 px, höchstens eine halbe Rasterzelle; hoch / runter knapp unter zwei
    Linien, damit eine Terz als Akkordton setzbar bleibt; `RD.fingerReach`); eine halbe Linie hoch / runter verschiebt schon
    (`stepped` in `js/interaction.js` – die Linien liegen auf dem Handy enger als die 10-px-Ziehschwelle). **Falls das nicht reicht:**
    Regel umdrehen – nah an einer Note gewinnt beim Finger immer die Note, neue Noten nur auf freien Stellen.
- **Wo was steht:** `js/pitch.js` (Tonleitern, Linien, Vorzeichen, Schreibweise, Schlüssel, Stimmlagen, `spellBar`), `js/model.js`
  (Melodie-Spur, `scaleAt` / `setScale`, Ketten: `tiedFrom` / `tiedTo` / `nextNote` / `tieChain` / `tiedOn` / `setMelodyLength` /
  `melodyRoom`, `TC.MELODY_SOUNDS` / `soundFamily`, `valueOfTicks`), `js/render.js` (`pitchInfo`, Vorzeichen, `drawPitchMap`,
  `tieArc`, Längen-Vorschau), `js/interaction.js` (Melodie-Gesten: `pitchAt`, `aimMelody`, `dragLength`, `beginAlter` / `beginLen`,
  `melodyMenu`), `js/audio.js` (`FAMILY`, `SOUND`, `AU.tone`), `js/panel.js` (`melodyNoteSection`, `melodyTrackRows`),
  `js/storage.js` (`melodyDoc`), Handbuch Kapitel 8.
- **Tests:** `tools/tests/test_pitch.js`, `test_melody.js`, `test_ties.js` (zusammen 546 Prüfungen grün, Lauf siehe
  `tools/tests/README.md`; VS Code liegt hier unter `H:\Programmierung\Microsoft VS Code\Code.exe`), Klick-Test `tools/uitest` (231 ok).
- **Ausprobieren ohne Hände:** Szenen-Skript wie `tools/help/shots.js` + Kopie von `tools/uitest/index.html`, Edge headless
  (`--virtual-time-budget`, Screenshot / `--dump-dom`). Klänge messen: `OfflineAudioContext` statt `AudioContext` unterschieben und
  per DevTools-Protokoll (`--remote-debugging-port`, eigenes `--user-data-dir`, nur diese Edge-Prozesse beenden) auslesen – mit
  virtueller Zeit rendert der Offline-Puffer nicht.

**Schon da (vor Phase 5):** Spur-Arten `pitched` / `tab` und `note.pitch` im Datenmodell (`js/model.js`), Haltebögen für Nicht-Schlagzeug in
`rhythm.js`, Kanal / Programm / MIDI-Ausgang pro Spur.

### Entscheidungen

- **Gesten auf Melodie-Spuren:** Note halten, dann **hoch / runter = ♯ / ♭** (Halbton; Anzeige wie beim Anschlag-Balken, Esc nimmt es
  zurück). Der **Anschlag** wandert ins Notenmenü (halten + loslassen). Beim Schlagzeug bleibt alles wie es ist.
- **Tonleiter pro Spur** (Grundton + Tonleiter), wechselbar ab einem Takt. **Die Tonleiter bestimmt, welcher Ton auf einer
  Linie liegt – sie sperrt nichts.** Wer abweichen will, erhöht / erniedrigt selbst (halten + hoch / runter).
  - Vorzeichen am Zeilenanfang sind nur die Darstellung, immer übliche: Kirchentonarten die der Dur-Tonart, aus der sie stammen
    (D-Dorisch = keine), alle anderen die von Dur oder Moll (je nach Terz). Was darin fehlt (A-Harmonisch-Moll: G♯), setzt Tactus
    automatisch an die Note. Keine gemischten Vorzeichen (liest Guitar Pro nicht).
  - Tonleitern mit weniger als 7 Tönen (Pentatonik, Hirajoshi, In-Sen): die Linien außerhalb der Tonleiter sind **blass**, setzen
    aber ihren Ton (der verwandten 7-Ton-Tonleiter). Blues: die Blue Note (Ges in C) liegt auf derselben Linie wie G → erniedrigen.
  - **Vorzeichen im Takt:** Tippen setzt immer den Ton der Tonleiter, auch wenn vorher im Takt auf dieser Linie erniedrigt wurde
    (Tactus zeichnet dann ♮). Die Vorschau zeigt den Ton vor dem Loslassen.
  - **Tonleiterwechsel:** bestehende Noten behalten ihre Tonhöhe (nur neu gezeichnet), neue folgen der neuen Tonleiter.
- **Akkordsymbole gehören zum Song**, nicht zu einer Spur: einmal über der obersten Zeile, gelten für alle Spuren (wie Takt-Text /
  Tempo). Ein Akkord gilt **ab seiner Stelle bis zum nächsten** (Standard Taktanfang, wahlweise eine zweite Stelle, z. B. Taktmitte).
  Angeboten werden die Stufenakkorde der Tonleiter, die **an dieser Stelle** in der aktiven Melodie-Spur gilt (Takt 17 nach Wechsel
  zu D-Dur → D, Em, F♯m …); frei eintippen geht immer.
- **Gespeichert wird der klingende Ton** (MIDI-Nummer) plus Schreibweise (F♯ oder G♭); ohne Angabe aus der Tonleiter abgeleitet.
  Tenor-Schlüssel (Violin 8 unten) zeichnet eine Oktave höher, als er klingt.
- **Echte Notenlängen:** Die Pausenbereinigung bleibt beim Schlagzeug; bei Melodien zählen Länge, Pausen und Haltebögen.

### Schritt A – Einstimmige Gesangsmelodie ✅ (zum Ausprobieren)

**Gebaut (2026-11-15):** `js/pitch.js` (Tonleitern, Linien, Vorzeichen, Schreibweise, Schlüssel, Stimmlagen; `test_pitch.js`),
Melodie-Spur im Modell (`clef`, `scale`, `voice`, `bar.scale`, `note.pitch` / `note.dia`; `test_melody.js`), Notenbild (Schlüssel,
Vorzeichen am Zeilenanfang und beim Wechsel, Versetzungszeichen, Hilfslinien, Hälse nach Lage, Haltebögen im Takt, blasse Stellen
außerhalb der Tonleiter, Tonnamen statt Drum-Map), Eingabe (Tippen = Ton der Tonleiter, **beim Drücken seitlich ziehen = Länge**,
Note ziehen = verschieben, halten + hoch / runter = ♯ / ♭, halten + seitlich = Länge, halten + loslassen = Menü mit ♯ / ♭ /
„Schreiben als …“ / Anschlag / Löschen; ↑ ↓ = nächste Linie), Panel (Stimmlage, Schlüssel, Grundton + Tonleiter gruppiert, ab dem
gewählten Takt; Noten-Panel ♯ / ♭ / umdeuten / Akzent), Klang (weicher Synth, über MIDI mit Kanal und Programm), MIDI-Export
(Programmwechsel, Notenlänge), MusicXML (Tonhöhe, Tonart mit Modus, Schlüssel inkl. Tenor, Vorzeichen, Haltebögen), Teilen-Link.
**Rest aus A (2026-11-15 erledigt):**
1. ✅ **Haltebögen über Taktgrenzen** (gebaut, `test_ties.js`; wie Guitar Pro / MusicXML): jeder Takt behält seine Noten, der Rest im nächsten
   Takt ist eine echte Note „angebunden“ (`note.tie`). Über den Taktstrich ziehen legt die Kette an (auch über mehrere Takte, Status
   zeigt die Gesamtlänge); ♯ / ♭, Verschieben, Löschen wirken auf die ganze Kette; Notenmenü „Haltebogen zur nächsten Note“
   (gleicher Ton) an / aus. Bogen über den Taktstrich, beim Zeilenumbruch halber Bogen am Zeilenende und -anfang. Wiedergabe / MIDI:
   angebunden = klingt weiter, nur wenn davor derselbe Ton bis zum Taktende klang (Wiederholung springt zurück: neu angeschlagen).
   Teil der Kette auf anderen Ton: der Bogen löst sich. Kein Bogen in einen %-Takt.
2. ✅ **Verlängern stoppt an der nächsten Note** (gebaut: Strich in der Vorschau, Statuszeile „bis zur nächsten Note“, Länge als „1 Takt + 2 Viertel“; nicht überschreiben, nicht schieben) – die Vorschau zeigt die Grenze.
3. ✅ **Klang wählen** (Panel „Klang“: 21 Klänge in 6 Gruppen = GM-Programm, `TC.MELODY_SOUNDS`; der Tactus-Synth spielt 13 Familien – Klavier klingt aus, Streicher / Fläche schwellen an …; dazu eigene Einstellungen je Klang (Filterschwung, Vibrato); beim Wählen hörbar).
4. ✅ **Oktaven und Tastatur:** Noten-Panel „Oktave höher / tiefer“; ↑ ↓ nächste Linie (Ton der Tonleiter), Alt+↑ ↓ Halbton, Strg+↑ ↓
   Oktave (angebundene Noten wandern mit); Auswahl-Werkzeug verschiebt Melodie-Noten auch in der Höhe (nach Linien). **Zurückgestellt:**
   Notennamen per Buchstabe (A–G) – die Buchstaben sind belegt (A Akzent, G Ghost, E Radierer, C / F Crash / Standtom …).
5. ✅ Handbuch-Kapitel 8 „Melodie schreiben“ (Töne setzen, Ändern, Tonleitern) und Beispiel „Melodie“ (Datei → Beispiele, `index.html?beispiel=melodie`).

**Entschieden:** Gesang ist einstimmig; zwei Sänger = zwei Spuren. Akkorde (gleicher Anfang, gleiche Länge) gehen in einer Stimme;
zeitlich versetzt Überlappendes: klassisch mit einer zweiten Stimme, von Tactus automatisch angelegt (siehe „Später“).

1. **Spur-Art Melodie** („+ Melodie“ in der Spurliste): Schlüssel (Violin, Violin 8 unten, Bass), Stimmlage (Sopran, Alt, Tenor,
   Bariton / Bass – setzt Schlüssel und Tonumfang), Tonleiter, Klang.
2. **Notenbild:** Hilfslinien, Vorzeichen (gelten bis Taktende, Auflösungszeichen), Vorzeichen am Zeilenanfang und bei Wechsel,
   Halsrichtung nach Lage, Haltebögen über Taktgrenzen, Akkorde in einer Stimme (Sekunden versetzt); Notenzeilen so hoch wie
   nötig (Abstände der Spuren und Seitenansicht berücksichtigen das).
3. **Eingabe:** Tippen auf Linie / Zwischenraum setzt den **Ton der Tonleiter** – man setzt nicht aus Versehen „falsch“
   (siehe Entscheidungen; keine Sperre). Halten + hoch / runter = ♯ / ♭.
   **Vorhören:** beim Zielen klingt der Ton unter dem Zeiger / Finger. Oktave: Hilfslinien darüber / darunter plus Oktav-Schalter
   im Panel. Tastatur: A–G setzt, ↑ ↓ Halbton, Strg+↑ ↓ Oktave. Notenmenü: Anschlag, enharmonisch umdeuten (F♯ ↔ G♭).
   **Länge (entschieden):** beim Setzen gedrückt halten und seitlich ziehen = länger (bis zur Rasterzelle unter dem Zeiger, höchstens
   bis zum Taktende); eine vorhandene Note: halten, dann seitlich. Der Notenwert im Panel ist die Mindestlänge.
4. **Klang:** einfacher Synth („Stimme“ / weicher Lead, Klavier); über MIDI jedes VST mit Kanal und Programm.
5. **Austausch:** MIDI-Export mit Programmwechsel, MusicXML mit Tonhöhe, Tonart (inkl. Modus), Schlüssel; Teilen per Link.
   Bestehendes läuft weiter: Kopieren / Einfügen, %-Takte, Mehrtaktpausen, Wiederholungen / Sprünge, Stumm / Solo.

### Schritt B – Tonleitern und Stufenakkorde ✅ (zum Ausprobieren)

**Gebaut (2026-11-15):** Panel „Takt · Stück“ → **Akkorde** (für den ausgewählten Takt): Stelle wählen (wie das Klick-Raster, z. B. „4 und“), Knöpfe mit den
Stufenakkorden der Tonleiter an dieser Stelle (Name + Stufe, blass = nicht nur Töne einer Pentatonik o. ä.), „7 Vierklänge“,
„Entfernen“, eigener Akkord zum Eintippen, Tonart (ohne Melodie-Spur), „Melodie: Akkordtöne zeigen / Nur Akkordtöne / keine Hilfe“
(ab diesem Takt), „Akkorde mitspielen“ + Lautstärke. Taktmenü → **Akkord** (Stufenakkorde, eintippen, Vierklänge, entfernen).
Akkordsymbole über der obersten Notenzeile (über hohen Noten höher, Klammern 1./2. darüber), auch in Seitenansicht / PDF.
Wiedergabe: weiche Fläche (GM 89), gehalten bis zum nächsten Akkord. MIDI-Export: Akkord-Spur / -Datei (Kanal 15, Namen als
Text), MusicXML `<harmony>` (mit `<offset>`, Grundton, Art, Bass, Zusatztöne). Teilen-Link, Speichern, Kopieren / Einfügen.
Tonleitern: **▶** zum Vorhören, Zweitnamen in der Auswahl (Äolisch, Ionisch, Spanisch …).

- **Tonleiter-Auswahl pro Spur** (Töne ab C):

  | Gruppe | Tonleiter | Töne ab C | Stufenakkorde / Hinweis |
  |---|---|---|---|
  | **Häufig** (immer sichtbar) | Dur (= Ionisch) | C D E F G A H | normal |
  | | Moll (natürlich, = Äolisch) | C D Es F G As B | normal |
  | | Dur-Pentatonik | C D E G A | von Dur |
  | | Moll-Pentatonik | C Es F G B | von Moll |
  | | Blues (Moll-Blues) | C Es F Ges G B | I7 · IV7 · V7 |
  | **Moll-Varianten** | Harmonisch Moll | C D Es F G As H | klassisch, „orientalisch“ |
  | | Melodisch Moll | C D Es F G A H | Jazz, weich |
  | **Kirchentonarten** | Dorisch | C D Es F G A B | Moll mit heller Sexte |
  | | Phrygisch | C Des Es F G As B | dunkel, spanisch, Metal |
  | | Lydisch | C D E Fis G A H | schwebend, Filmmusik |
  | | Mixolydisch | C D E F G A B | Rock, Blues-Rock |
  | | Lokrisch | C Des Es F Ges As B | sehr instabil |
  | **Weitere** (ausklappbar) | Dur-Blues | C D Es E G A | I7 · IV7 · V7; Country, Boogie |
  | | Phrygisch-Dominant | C Des E F G As B | Flamenco, Klezmer, Metal |
  | | Harmonisch Dur | C D E F G As H | Dur mit Moll-Färbung |
  | | Lydisch-Dominant | C D E Fis G A B | Jazz |
  | | Ungarisch Moll | C D Es Fis G As H | Zigeunermoll |
  | | Doppelt harmonisch | C Des E F G As H | arabisch / byzantinisch |
  | | Alteriert | C Des Es E Ges As B | Jazz über Dominanten |
  | | Ganzton | C D E Fis Gis Ais | nur übermäßige Akkorde (C+, D+ …) |
  | | Hirajoshi | C D Es G As | japanisch; von Moll |
  | | In-Sen | C Des F G B | japanisch; von Phrygisch |
  | **Chromatisch** | frei | alle 12 | keine blassen Linien; Vorzeichen / Akkorde von Dur auf dem Grundton |

  Vorerst nicht: Vermindert (8 Töne passen nicht auf 7 Linien). Jede Tonleiter mit **▶ Vorhören** und einem Satz zum Klang
  (wählen nach Gefühl, ohne Theorie); Suche findet auch Zweitnamen (Äolisch, Ionisch, Zigeunermoll, Spanisch).
- **Stufenakkorde zu jeder Tonleiter:** auf jeder Stufe Terzen aus der Tonleiter geschichtet (jeder zweite Ton) → Dreiklang oder
  Vierklang, mit Stufe (I ii iii IV V vi vii°) und Name (C, Dm, Em … / Cmaj7, Dm7 …). Exotische 7-Ton-Tonleitern ergeben auch
  übermäßige / verminderte Akkorde – gewollt, das ist ihr Klang.
  - Weniger als 7 Töne (Pentatonik, Hirajoshi, In-Sen): Terzen schichten geht nicht (Lücken ungleich → Quarten, sus-Klänge),
    daher die Akkorde der verwandten 7-Ton-Tonleiter; Akkorde **nur aus Tönen der Tonleiter** markiert (A-Moll-Pentatonik: Am, C).
  - Blues (Moll / Dur): I7 · IV7 · V7 (in A: A7, D7, E7).
- **Akkorde setzen:** Auswahlleiste der Stufenakkorde (Panel, Taktmenü); Tippen setzt das Symbol an die Stelle. Frei eintippbar
  (C7, Fadd9, G/B). **Gespeichert:** aus der Leiste als **Stufe** (ii – wird beim Tonleiterwechsel C → D-Dur von Dm zu Em),
  eingetippt als Name. **Beim Abspielen klingt ein einfacher Akkord-Teppich** mit (abschaltbar, eigene Lautstärke) –
  Songschreiben auch ganz ohne Melodie.
- **Akkord beim Schreiben der Melodie**, drei Stufen (pro Takt einstellbar, Standard fürs Stück):
  - **Aus:** nur die Tonleiter
  - **Hervorheben (Standard):** die Töne des gerade klingenden Akkords sind auf den Linien markiert, gesetzt wird jeder Ton
  - **Sperren:** nur Akkordtöne; die anderen Linien blass, Tippen dort springt zum nächsten Akkordton (gleich weit: beim Ziehen
    die Richtung, aus der man kommt, beim Tippen der tiefere; die Vorschau zeigt es). Halten + hoch / runter geht weiter (bewusst
    abweichen). Gilt ab der Stelle des Akkords bis zum nächsten.
  - Akkord ändern, wenn schon Noten da sind: Noten bleiben, was nicht passt, wird markiert (evtl. Angebot „auf Akkordtöne setzen“).
  - Die Sperre wirkt nur beim Setzen auf Melodie-Spuren (später evtl. Bass: Grundtöne).
- Export: MIDI (Akkorde als eigene Spur, abschaltbar), MusicXML `<harmony>`.
- Die Akkordsymbole gelten für alle Spuren (Melodie, Klaviersystem, Schlagzeug); Hervorheben / Sperren wirkt beim Setzen in
  Melodie-Spuren und in beiden Zeilen eines Klaviersystems.

### Schritt E – Klaviersystem ✅ (zum Ausprobieren, 2026-11-16)

Ein Instrument, zwei Notenzeilen: oben Violinschlüssel (rechte Hand), unten Bassschlüssel (linke Hand), links eine geschweifte
Klammer. Löst „Melodie oben, Akkorde unten“ ohne zweite Stimme: jede Zeile hat ihren eigenen Rhythmus.

- Eine Melodie-Spur bekommt **„Zwei Notenzeilen (Klavier)“**; intern eigene Stimmen je Hand (wie Guitar Pro). Tippen in die obere /
  untere Zeile schreibt in dieselbe Spur, in die jeweilige Hand. Tonleiter, Stumm / Solo, Ausblenden gelten fürs ganze Instrument.
- **Akkord per Tipp in die linke Hand** (Stufenakkorde aus B): „Am“ setzt A-C-E in die untere Zeile (Lage wählbar).
- Export: MusicXML ein Part mit `<staves>2</staves>` (Guitar Pro / MuseScore erkennen ein Klavier), MIDI eine Spur.
- Bis dahin: zwei Melodie-Spuren „Klavier rechts / links“ (Violin- / Bassschlüssel) gehen schon.

**Gebaut:**
- Daten: **zwei gekoppelte Melodie-Spuren** – die linke Hand ist die Spur direkt nach der oberen, mit `lh: true` (`js/model.js`
  `SC.leftHand` / `rightHand` / `handsOf` / `instrumentOf` / `instruments` / `isPiano` / `setPiano` / `syncHands`). Gemeinsam
  (`SC.HAND_SHARED` + Tonleiter mit ihren Wechseln): Name, Klang, Lautstärke, Stumm / Solo, Ausblenden, MIDI-Ausgang / -Kanal; die
  obere Spur bestimmt, eine Aktion an einer Hand gleicht ab (`sync` in `js/actions.js`). Eigen je Zeile: Noten, zwei Stimmen,
  Schlüssel. So gehen Tippen, Verschieben, Akkordhilfe, Liedtext, Abspielen je Zeile ohne Umbau.
- Spur-Operationen im Block: Hinzufügen nach einem Klavier (nach beiden Zeilen), Verschieben, Verdoppeln, Löschen. Laden: eine
  linke Hand nur direkt nach einer Melodie-Spur, die selbst keine linke Hand ist (sonst eigene Spur).
- Panel: Spurliste ein Eintrag je Instrument; „+ Klavier“ (Klang Klavier); bei Melodie-Spuren der Haken „Zwei Notenzeilen (Klavier:
  rechte und linke Hand)“ – aus: die linke Hand verschwindet (mit Noten: Nachfrage; vorher wurde sie eine eigene Spur – verwirrend, beim Wiederanwählen gab es zwei). Hinweis, welche Hand man schreibt;
  „Schlüssel (obere / untere Zeile)“; keine Stimmlage beim Klavier. Statuszeile „Spur: Klavier (linke Hand)“.
- Notenbild: geschweifte Klammer links (`brace` in `js/render.js`), Taktstriche (auch Wiederholung / Schluss) durch den Raum
  zwischen den Zeilen, Name einmal, Tonleiter-Text einmal.
- Export: MusicXML ein Part, `<staves>2</staves>`, `<clef number="1|2">`, linke Hand nach `<backup>` mit `<staff>2</staff>`,
  Stimmen 5 / 6. MIDI eine Spur je Instrument (beide Hände; Export-Dialog: eine Zeile).
- Tests: `test_piano.js` (23), Klick-Test (7: „+ Klavier“, Tippen oben / unten, Stumm für beide, aus, rückgängig), Bild
  `help/img/klavier.png`, Handbuch Kapitel 8 „Klavier“.

**Zum Ausprobieren:** Tippen in die untere Zeile am Tablet (trifft man sie?), Abstand der Zeilen mit / ohne Liedtext, Import in
MuseScore / Guitar Pro (erkennen sie ein Klavier mit zwei Zeilen?). Noch nicht: Noten von einer Hand in die andere ziehen.

### Schritt C – Liedtext ✅ (zum Ausprobieren, 2026-11-16)

- Silben unter den Noten: Note antippen → Text, Leertaste / Tab springt zur nächsten Note, „-“ verbindet Silben, „_“ für Melismen.
- Mehrere Strophen (Zeilen) untereinander; MusicXML `<lyric>`, MIDI als Lyric-Events.
- **Auch im Klaviersystem:** Text an den Noten der rechten Hand, gezeichnet zwischen den beiden Zeilen (wie in Klavier-Gesang-Noten).
  → offen, kommt mit Schritt E.

**Gebaut:**
- Daten: `note.lyr = ['Lie-', 'Son-']` (eine Silbe je Strophe, ein „-“ am Ende = das Wort geht weiter), an der **ersten Note eines
  Ereignisses in Stimme 1**. Stellen für Silben (`SC.lyricSlots`): die Ereignisse der Stimme 1 in Taktreihenfolge (wie geschrieben,
  nicht wie gespielt – die Strophen ersetzen die Wiederholungen), ohne %-Takte und ohne Ereignisse, die nur gebundene Noten halten.
  Höchstens 8 Strophen, 40 Zeichen je Silbe. Teilen-Link, Speichern, Kopieren nehmen den Text mit.
- Eingabe (`js/lyrics.js`): kleines Feld unter der Note. Start: Notenmenü „✎ Liedtext“, Noten-Panel „Liedtext“ (mit Strophe 1 / 2 /
  + und „Strophe löschen“), **Strg+L**, Silbe antippen (auch unter einer Note ohne Silbe, sobald die Spur Text hat). Leertaste = weiter,
  „-“ = Silbe, Leertaste im leeren Feld / „_“ = Note auslassen (Melisma), Tab / ⇧Tab / ← → am Rand, Rücktaste im leeren Feld = zurück,
  ↑ ↓ = Strophe, Enter = fertig, Esc = dieses Feld unverändert. **Eingefügter Text verteilt sich** (`SC.splitLyrics` / `spreadLyrics`).
  Die Trenner werden aus dem Text gelesen, nicht aus den Tasten (Bildschirmtastatur). Alles in einem Zug = ein Rückgängig-Schritt.
  Die Ansicht rollt mit (auch über der Bildschirmtastatur, `visualViewport`).
- Zeichnen (`js/render.js`): eine Zeile je Strophe unter der Notenzeile (tiefer unter tiefen Noten / Stimme-2-Hälsen), Silben mittig,
  „-“ in der Mitte zwischen den Silben eines Wortes, Melisma-Linie (Wort endet, die nächsten Noten ohne Silbe bis zur Pause; nicht
  bei der letzten Silbe einer Strophe – sonst eine Linie hinter einer halb getippten Strophe), „1.“ / „2.“ vor der ersten Silbe.
  **Takte werden breiter**, damit Silben nicht ineinanderlaufen (`lyricRoom`, Breite gemessen per Canvas); die Zählhilfe rückt darunter.
- Export: MusicXML `<lyric number>` mit `<syllabic>` und `<extend/>`; MIDI Lyric-Ereignisse (Wortende mit Leerzeichen), Strophe n
  im n-ten Durchgang einer Wiederholung. Wiederholungen finden: andere Worte = nicht derselbe Takt (kein %).
- Tests: `test_lyrics.js` (alle 730 Prüfungen grün), Klick-Test 243 ok (6 neue), Handbuch Kapitel 8 „Liedtext“ mit Bild, Beispiel
  „Melodie“ mit Text.
- **Zum Ausprobieren:** Tippen mit der Bildschirmtastatur auf Tablet / Handy (Android meldet keine Tasten, iPad schon), Rollen über der
  Tastatur, Silbe antippen mit dem Finger, sehr lange Wörter in der Seitenansicht.

### Schritt D – Komfort

- **Transponieren** (Auswahl / Spur) in Halbtönen und **Tonleiter wechseln, Melodie folgt stufenweise** (C-Dur → A-Moll).
- **Stufen-Hilfe** unter den Noten (1 2 3 … oder do re mi), abschaltbar wie die Zählhilfe.
- **Tonumfang:** Noten außerhalb der gewählten Stimmlage rot markiert.
- **Rhythmus übernehmen:** Rhythmus einer anderen Spur (z. B. Bassdrum) in die Melodie-Spur einfügen, nur die Töne fehlen dann.

### Schritt G – Akkorde als Noten: Klavier und Gitarre ✅ (zum Ausprobieren, 2026-11-16)

**Gebaut:** `js/accomp.js` (`TC.accomp`): Lagen – Klavier (Bass + enge Akkordtöne, nach Schlüssel), Gitarre (Griffsuche auf 6 Saiten in
Standardstimmung: Bass auf der tiefsten klingenden Saite, keine stummen Saiten dazwischen, ≤ 4 Bünde, alle Akkordtöne (ab 4 Tönen darf die
Quinte fehlen), offene Saiten bevorzugt, keine doppelten Töne, nah am Griff davor → die bekannten offenen Akkorde / Barré). 10 Spielweisen
(`AC.PATTERNS`: Klavier ausgehalten / Schläge / Bass + Akkord (3/4 Walzer) / gebrochen / Alberti; Gitarre gehalten ↓ / ↓ je Schlag /
↓ ↓↑ ↑↓↑ / ↓↑ Achtel / gezupft). `AC.write` in die markierten Takte der Spur (Stimme 1 / 2), Akkordwechsel im Takt (Schlag am Wechsel,
gehaltene Akkorde enden dort). `note.stroke` d / u: ⊓ / V über dem Akkord, gespielt 12 ms je Saite versetzt (`T.strum`), MIDI-Export
ebenso, MusicXML `<down-bow/>` / `<up-bow/>`. Panel: Noten-Panel „Akkorde als Noten“ (Spielweise, „In Takt a–b schreiben“; Gitarre
(Klang 24–31) startet mit Pop-Schlag, linke Hand mit Bass + Akkord). Neue Melodie-Spuren übernehmen die Tonleiter des Stücks; eine
gemeinsame Tonleiter steht nur einmal über den Noten. Tests: `test_accomp.js` (24), Klick-Test (3), Bild `akkordnoten.png`, Handbuch
Kap. 8. **Nach Rückmeldung (2026-11-16): Schlagmuster sind „zu viel unter die Arme gegriffen“ → stattdessen Akkorde wie Noten setzen:**
Noten-Panel „Akkorde → Setzen: Ton · Akkord · ↓ · ↑“, ein Tipp setzt den Akkord der Akkordzeile dort (Gitarre: Griff, sonst ab dem
angetippten Ton aufwärts, `AC.chordNotes`), Notenwert wie bei Tönen; `note.chordNote`: gehalten + runter / hoch = Ab- / Aufschlag (sonst
♯ / ♭); Menü ↓ / ↑ / –; Panel „Anschlag“ bei ausgewähltem Akkord. Die Muster (`AC.write`) bleiben im Code, ohne Knopf. Handbuch:
Tabelle „Welche Akkorde kann ich eintippen?“. Danach: „Töne: wie Symbol · Dreiklang · Vierklang (Septime der Tonleiter) · Power“
(`AC.resize`, Powerchord-Griff auf E- / A-Saite). Dann: **Instrument je Melodie-Spur** (`track.inst`: voice, keys, guitar, bass,
ensemble, pad; Klang bleibt frei; beim Wählen einmal passender Klang + Schlüssel; alte Stücke: aus dem Klang, `TC.instFromProgram`) –
bestimmt die Akkord-Lage (Gitarre Griff voll / eng 4 Saiten, Bass ein Ton, Ensemble vierstimmig drop 2, sonst eng). **Offen:** Akkord per Tipp in die
linke Hand; Gitarren-Lage wählbar (offen / höher).

Ein gemeinsamer Kern für beide: aus den Akkordsymbolen Noten nach einem Muster. **Klavier (linke Hand):** Grundton + Akkord,
gebrochen (Alberti), ausgehalten, Grundton / Quinte. **Gitarre:** wie unten.


Die Akkordsymbole nicht nur über den Takten, sondern **als Noten in eine Spur einfügen** – eine Begleitgitarre zum Mitspielen /
Exportieren. **Kein Griffbrett, keine Griffbilder, keine Tabulatur** (ausdrücklich nicht gewünscht).
- Eine Melodie-Spur „Gitarre“ (Klang Nylon / Steel / E-Gitarre): „Akkorde als Noten einfügen“ für Takte / das ganze Stück.
- **Spielweise wählbar:** angeschlagen (ein Akkord pro Akkordwechsel, gehalten), **Ab-/Aufschlag nach einem Muster** (z. B.
  ↓ ↓↑ ↑↓↑ in Achteln, eigene Muster aus ↓ ↑ und Pausen), gezupft (Grundton + Akkordtöne nacheinander). Ab- / Aufschlag als Zeichen
  über der Note (MusicXML `<down-bow>` / `<up-bow>` bzw. Guitar Pro „stroke“), beim Abspielen leicht versetzt (Strum: tief → hoch
  bzw. hoch → tief, ein paar ms je Saite).
- **Gitarren-Eigenheiten in der Lage:** 4–6 Töne in einer gitarrentypischen Lage (Grundton im Bass, Umfang E2 … etwa E5, offene
  Akkorde bevorzugt), Wechsel zwischen den Akkorden mit kleinen Sprüngen; Schrägstrich-Akkorde mit ihrem Bass.
- Danach von Hand änderbar wie jede Melodie; ein neuer Akkord ändert die eingefügten Noten nicht von selbst.

### Dynamik und Spur-Lautstärke ✅ (Wunsch 2026-11-16, zum Ausprobieren)

- Daten: `bar.dyn = [{ t, v }, { t, w: 'cresc' | 'dim', len }]` je Spur-Takt (geht mit Kopieren, eigener Wert macht einen Takt
  „anders“ für %). `SC.DYN_LEVELS` / `DYN_FACTORS` (mf = 1, ppp 0,35 … fff 1,45), `SC.dynFactor(doc, track)` → (Takt, Tick) → Faktor;
  Gabel zur nächsten Stufe bis 1 Takt nach ihrem Ende, sonst 2 Stufen weiter (danach gilt die erreichte Stufe).
- Wirkt als Faktor auf die Anschlagstärke (Abspielen `js/playback.js`, MIDI-Export) – **die Noten bleiben, wie sie sind** (Ghost,
  Akzent, Stufe). Geschriebene Reihenfolge (Wiederholungen spielen sie wieder).
- Panel „Dynamik · Takt n“ (Stellen wie die Akkorde, `S.chordSlot`), Stufen-Knöpfe, „< cresc.“ / „> dim.“ bis Ende der markierten
  Takte, „Für alle Spuren“ (`S.dynAll`), Klavier: beide Hände. Nach Rückmeldung: Gabel in einem Schritt „pp < ff bis Takt n“
  (`A.wedgeDraft` / `makeWedge`, Gabel trägt ihre Zielstufe `to`, die danach gilt; „Von“ = die Stufe, die dort gilt – dann kein neues Zeichen). Notenbild: Bravura-Glyphen unter der Zeile (Melodie mit Text: unter dem
  Text), Gabeln über Zeilenumbrüche. MusicXML `<dynamics>` (+ `<sound dynamics>`), `<wedge>`.
- Spur-Lautstärke (`track.volume`, war schon im Modell, ungenutzt): Regler in „Spuren & Klang“; Tactus-Klänge: Verstärkung, MIDI:
  Melodie über MIDI: CC 7 (live einmal je Ausgang + Kanal, Export am Anfang, wenn ≠ 100), Anschlag bleibt; Schlagzeug über MIDI: die
  Anschlagstärke (EZDrummer 3 überhört CC 7 – beim Testen bemerkt). Panel: Dynamik im Noten-Panel links (unter den Noten, über dem Liedtext).
- Tests: `test_dynamics.js` (21), Klick-Test (7), Bild `help/img/dynamik.png`, Handbuch Kap. 10 „Dynamik“.
- Offen: Dynamik im Taktmenü; Gabel per Ziehen im Notenbild; Ausweichen, wenn Dynamik und Zählhilfe sich bei sehr tiefen Noten
  berühren.

### Später

- Bass / Gitarre mit Tabulatur (Phase 6), MIDI-Import von Melodien (Quantisieren, Schreibweise),
  Bindebögen / Artikulation, evtl. Vorsingen (Mikrofon erkennt die Tonhöhe).
- **Eine Note länger klingen lassen als die folgenden** (langes C unter einem D) – **entschieden: klassisch mit zwei Stimmen**.
  Wird eine Note über folgende Noten hinweg verlängert, legt Tactus sie **automatisch in Stimme 2** (Hals nach unten, echte lange
  Note), die Melodie bleibt in Stimme 1; ohne Überlappung bleibt alles in einer Stimme. Schalter „Stimme 1 / 2“ im Panel nur zum
  selbst Bestimmen. (Nicht mit Haltebögen `C ⁀ C+D` – unruhig, die Linie ist nicht mehr zu sehen.) Bis dahin stoppt die Note an
  der nächsten.
- **Klavier: Pedal-Zeichen** (*Ped.* … ✱) und *l.v.* („klingen lassen“) – die Noten bleiben kurz geschrieben, das Zeichen hält sie.
- **Sehr niedrige Priorität:** Schritt-Eingabe per MIDI-Keyboard (dafür gibt es die DAW).

## Wiederholungen finden (nach MIDI-Import) ✅ (zum Ausprobieren, 2026-11-15)

Eine MIDI-Datei aus der DAW ist ganz ausgeschrieben. Tactus findet, was sich wiederholt (`SC.findRepeats` in `js/model.js`,
Tests `test_findrepeats.js`):
- **Takte wie der davor** (pro Spur, nicht leer, gleiche Taktart) → %-Takt.
- **Abschnitte**, die direkt danach gleich wiederkommen (alle Spuren gleich, mindestens 2 Takte, nicht nur ein Takt immer wieder –
  das ist %; nicht über Text / Tempo / Taktart in der Kopie oder vorhandene Wiederholungen / Sprünge; der kürzeste passende
  Abschnitt gewinnt) → |: :| n×.
- **MIDI-Import, neues Stück:** Häkchen „Wiederholungen automatisch setzen“ (Standard an; zuerst Abschnitte, dann %; klingt wie vorher).
  Ohne Häkchen werden die Funde nur farbig markiert.
- **Panel → Wiederholungen finden → Gleiche Takte markieren:** Abschnitte grün / lila (erster Durchgang gestrichelt, „2/3“),
  %-Kandidaten orange („= 5“); Liste mit Knopf je Fund, „Alle als %“, „Alle setzen“, „Anschlag nicht beachten“.
- **Zurück:** Taktmenü „Noten zeigen statt %“ (statt „Takt davor wiederholen (%)“ auf einem %-Takt) und „Diese Wiederholung
  ausschreiben (Takt a–b, n×)“ in einem |: :|-Abschnitt ohne Häuser (`SC.unfoldSection`).
- **Später:** Abschnitte mit 1./2. Haus erkennen (gleich bis auf den letzten Takt / die letzten Takte), Ähnlichkeit statt
  Gleichheit (ein Fill am Ende), „in das offene Stück“-Import auch automatisch.

## Umblättern: Bühnenansicht und MIDI ✅ (zum Ausprobieren)

Ziel: live mit Backing-Tracks (Cymatic) spielen, die Seiten blättern sich im Takt um – Android-Tablet, Chrome, MIDI-USB-C-Interface.

- **Bühnenansicht** (Werkzeugleiste „Bühne“ oder ⚙ → Umblättern): Vollbild, nur die Seiten, eine ganze Seite auf dem Schirm, wie
  gedruckt (ohne Raster, „+“, Drum-Map). Leiste oben rechts: ‹ Seite n / m › ✕. Tippen ins rechte / linke Drittel blättert, Ziehen
  verschiebt, zwei Finger zoomen; es wird nichts geschrieben. Esc (oder Vollbild verlassen) beendet sie; gedreht: Seite neu eingepasst.
- **Bild↓ / Bild↑** blättern immer (auch was Umblätter-Pedale senden), in der Bühnenansicht auch die Pfeiltasten.
- **MIDI-Eingang** (⚙ → Umblättern, `js/remote.js`, Web MIDI: Chrome / Edge über https): „Note n = Seite n“ (Standard; Program
  Change 0 = Seite 1; ein verlorener Befehl schadet nicht) oder „Angelernt: nächste / vorige Seite“ (Note, CC – z. B. Pedal –,
  Program Change); Kanal wählbar. Der Eingang wird beim Start wieder geöffnet.
- **Umblätter-MIDI exportieren** (Datei-Menü, ⚙ → Umblättern): eine MIDI-Datei mit einer Note pro Seitenwechsel (Note n = Seite n,
  Kanal 16), 0 / 1 / 2 Takte vorher, mit Tempo, Taktarten und ausgeschriebenen Wiederholungen / Sprüngen – in Cubase als Spur zu den
  Backing-Tracks legen, mit auf den Player. Seiten wie in der Seitenansicht (auch wenn gerade die Endlos-Ansicht offen ist).
- Später evtl.: Folgen über MIDI-Clock / Song Position (Cursor läuft mit dem Player).

## Offen zum Ausprobieren

- ~~Fühlt sich das Raster richtig an?~~ ✅ passt
- ~~Synthetische Sounds oder echte Samples?~~ ✅ Samples eingebaut und getestet
- **Umblättern mit dem Cymatic** (wartet auf den MIDI-zu-USB-C-Konverter, kommt im Dezember 2026). Aufbau: Cymatic (Backing-Tracks mit
  Umblätter-MIDI-Spur) → MIDI-Ausgang → MIDI-USB-C-Konverter → Android-Tablet, Chrome, Tactus über https (GitHub Pages). Prüfen:
  1. Zeigt Chrome den Konverter unter ⚙ → Umblättern → „MIDI-Eingänge anzeigen…“ an (Erlaubnis-Abfrage)?
  2. Gibt der Cymatic die MIDI-Spur der Backing-Tracks an seinem MIDI-Ausgang aus (Einstellung am Gerät)?
  3. Kommt mit „Note n = Seite n“ die richtige Seite, und pünktlich (1 Takt vorher passend, oder 0 / 2 Takte besser)?
  4. Wiederholungen / Sprünge: blättert es bei der Wiederholung richtig zurück?
  5. Bühnenansicht auf dem Tablet: ganze Seite lesbar (Hoch- / Querformat), Tippen am Rand, kein Vollbild-Verlust beim Umblättern?
  6. Bleibt der Eingang nach einem Neustart von Chrome gewählt?
- Kit-Profile ohne Hersteller-Drummap (Anlernen per ▶ über Cubase)
- Mehrere Spuren mit MIDI: je Spur eigener loopMIDI-Port / Kanal in Cubase; MIDI-Export „eine Datei pro Spur“ und „alle in einer“
  in Cubase importieren
- **Melodie auf Tablet / Handy** (Rückmeldung steht aus):
  1. Note antippen statt versehentlich eine neue setzen – reicht der größere Fangbereich? (sonst: „Note gewinnt“, siehe Stand Phase 5)
  2. Eine Linie hoch / runter ziehen, ohne dass es als Halten zählt?
  3. Seitlich ziehen für die Länge, über den Taktstrich (Haltebogen); halten + hoch / runter für ♯ / ♭
  4. Klingen die 21 Klänge brauchbar und unterscheidbar (v. a. Gitarren, Bässe, Fläche bei kurzen Noten)?
- **MusicXML mit Melodie in Guitar Pro** (bisher nur automatisch geprüft): Tonhöhen, Tonart, Schlüssel (auch Tenor), Haltebögen
  über den Taktstrich, Programm; **Akkordsymbole** (`<harmony>`, auch auf Schlag 3, Schrägstrich-Akkorde, m7♭5)
- **Akkorde (Schritt B)** zum Ausprobieren:
  1. Akkorde setzen auf dem Tablet: Takt antippen, Panel-Knöpfe – schnell genug? Fehlt das direkte Antippen des Symbols?
  2. Klingt der Akkord-Teppich passend (Lautstärke, Lage, zu weich / zu laut neben Schlagzeug und Melodie)?
  3. „Nur Akkordtöne“: fühlt sich der Sprung zum nächsten Akkordton richtig an (auch beim Ziehen)? Ist die Markierung bei
     „Akkordtöne zeigen“ hilfreich oder zu unruhig?
  4. Namen in der deutschen Oberfläche (H / B) so gewollt?
  5. MIDI-Export mit Akkordspur in Cubase (eigene Datei, Kanal 15, Textereignisse)

## Wiedergabe über Cubase (Web MIDI) ✅ (getestet)

- Panel → Wiedergabe → **Klang**: „Tactus-Klänge“ oder **„MIDI: <Ausgang>“** (Chrome / Edge; beim ersten Mal fragt der
  Browser). Die Schläge gehen mit den Tasten aus dem **Kit-Profil des Stücks** (ohne Profil: General MIDI, Kanal 10)
  an den Ausgang, mit genauem Zeitpunkt; Cursor und Metronom bleiben in Tactus. „Tactus-Klänge zusätzlich“ wahlweise.
- Einrichtung (Windows): virtuelles MIDI-Kabel, z. B. **loopMIDI** (kostenlos), Port anlegen; in Cubase die
  Drum-Spur (Groove Agent …) auf diesen MIDI-Eingang stellen und Monitor einschalten (oder Aufnahme aktivieren).
- **Vorlauf** (ms, im Panel unter dem Ausgang): die Noten gehen so viel früher los, wie das Drum-VST zu spät klingt (Audio-Puffer);
  mit Metronom einstellen. Ohne ASIO-Treiber hat ein Standalone-VST oft 100–250 ms, Cubase mit ASIO meist nur wenige ms.
- Auch beim Setzen einer Note klingt sie über Cubase (dort ohne Vorlauf). Später: MIDI-Eingang (Aufnahme).

## Kit-Profile ohne Hersteller-Drummap ✅ (zum Ausprobieren)

- Kit-Profile → **„Neu ohne Drummap…“**: Name eingeben, alle 128 Tasten (spielen ihre eigene Note), General MIDI vorbelegt
- Ansicht **„Nach Taste (Belegungsplan)“**: Taste für Taste wie im Plan des Herstellers – ▶ abspielen, Instrument wählen;
  eine zweite Taste eines Instruments wird „weitere Taste“. Ansicht „Nach Instrument“ wie bisher, auch dort mit ▶
- ▶ spielt die Taste über den MIDI-Ausgang (Panel → Wiedergabe → Klang) auf dem Drum-VST – Fehler fallen beim Einrichten auf;
  ohne MIDI-Ausgang den Tactus-Klang des Instruments
- „Drummap für Cubase speichern“ schreibt daraus die komplette `.drm` (Namen = Tactus-Instrumente, Anzeige wie in Tactus):
  in Cubase muss nichts mehr abgetippt werden
- Drum-Kit **„Wie das Kit-Profil“** (⚙ → Drum-Kit): Panel und Linien bieten genau die Instrumente des Kit-Profils des Stücks an
  (z. B. China, Tom-Rimshots bei EZDrummer); ohne Profil das Standard-Kit

## Tempo-Übersicht, Klang-Umschalter, Profil-Prüfung ✅ (zum Ausprobieren)

- Panel → Stück: **Tempowechsel** als Liste („Takt 17: ♩ = 140“) – Klick springt zum Takt, ✕ entfernt den Wechsel
- Werkzeugleiste: **Tactus / MIDI** schaltet zwischen den Tactus-Klängen und dem zuletzt gewählten MIDI-Ausgang um
  (erscheint, sobald einmal ein Ausgang gewählt wurde; rot, wenn der Ausgang fehlt)
- **Was fehlt im Kit-Profil**: öffnet sich beim Wechsel des Profils, sonst Klick auf „Kit: …“ (⚠ = es fehlt etwas).
  Pro Instrument des Stücks ohne Taste: Automatisch (verwandtes Instrument), „Spielen als“ ein anderes Instrument des
  Profils, eine freie Taste des VSTs (wird Taste des Instruments) oder „Nicht spielen“ – gespeichert im Profil (`subst`),
  gilt für Abspielen und MIDI-Export. „Im Stück: → …“ schreibt die Noten des Stücks um (ein Rückgängig-Schritt).
- Toms ohne Taste: das nächstgelegene Tom des Kits

## Aufgenommene Klänge (Samples) ✅ (getestet)

- Panel → Wiedergabe: **„Aufgenommene Schlagzeug-Klänge (Samples) statt Synthesizer“** – beim ersten Mal ca. 3,4 MB, danach
  offline im eigenen Cache (bleibt über Updates erhalten)
- Quellen: **MuldjordKit** (Lars Muldjord, CC BY 4.0: Bassdrum, Snare, Hi-Hat zu / offen, 4 Toms, 2 Crashes, China, 2 Rides
  mit Glocke) und **Virtuosity Drums** (Versilian Studios, CC0: Rimshot, Sidestick, Hi-Hat Pedal / halb / Splash, Cowbell,
  Claves, Tamburin, Shaker). Namensnennung im Panel, `samples/LICENSE.md`, README
- 3 Aufnahmen pro Klang (leise / mittel / laut): Ghost nimmt die leise, Akzent die laute; ein geschlossenes Hi-Hat stoppt das
  offene; abgestoppte Becken kurz. Ohne Aufnahme (Klatschen, Reverse-Becken): Synthesizer
- `tools/build_samples.sh` baut `samples/*.flac` aus den Originalen (`samples-src/`, nicht im Repo; braucht ffmpeg)
- **Sehr niedrige Priorität:** mehrere Aufnahmen pro Stufe (Round Robin) gegen den „Maschinengewehr“-Effekt bei Wirbeln – wer
  das braucht, spielt über MIDI ein Drum-VST (macht Round Robin selbst); kostenlose Samples dafür sind rar, evtl. später eigene
  Aufnahmen am eigenen Set

## Vorlagen für kostenlose Drum-VSTs ✅ (zum Ausprobieren)

- Kit-Profile → **„Neu aus Vorlage…“**: „MT Power Drum Kit 2“ (Manda Audio, kostenlos) und „General MIDI (Groove Agent SE, …)“.
  Die Vorlage enthält nur Tastennummern (aus der Hersteller-Map übernommen, deren Datei wird nicht mitgeliefert);
  „Drummap für Cubase speichern“ erzeugt die Cubase-Map mit der Tactus-Notation.
- Drummap-Erkennung robuster: „SIDE-STICK“, „Tom Hi / Mid / Low“, Zweittasten in Klammern „(Snare)“, Instrument-Tasten
  ohne Anzeigenote („Hi-Hat Pedal“), „---“ = ohne Name; Kanal −1 („Kanal der Spur“) spielt auf Kanal 10.

## Drummap für Cubase 13 und älter ✅ (in Cubase 13 getestet)

- Kit-Profile: **„Drummap für Cubase 14+ speichern“** (Notenköpfe, Instrumente, Spielweisen) und **„… für Cubase 13 und älter“**
  (altes Format: nur `HeadSymbol`, ohne NoteheadSet / Instrument / Spielweise – Cubase 13 kennt keine Spielweisen; Windows-Zeilenenden)
- `HeadSymbol` = Index in Cubases Kopf-Liste, ermittelt an einer in Cubase 13 gespeicherten Map: 0 normal, 1 ⊘, 2 x, 3 Raute,
  4 Schrägstrich, 5 Quadrat, 6 dickes x, 7 ⊗, 8 langer Schrägstrich, 9 klein, 10 / 11 Dreieck links / rechts, 14 Dreieck unten.
  Tactus: Hi-Hat / Ride x (2), halb offen ⊘ (1), offen ⊗ (7), Crash / China dickes x (6), Rimshot / Glocke Raute (3),
  Cowbell vorerst Dreieck unten (14; Werte 16–30 noch unbekannt)

## Andere DAWs: Reaper und Studio One ✅

- **Laden:** „Neu aus Drummap…“ nimmt auch Reaper-Notennamen (`.txt`, „Taste ⇥ Name“) und Studio-One-Pitchlisten (`.pitchlist`) –
  viele Hersteller liefern genau diese mit. Die Zuordnung wird wie bei Cubase aus den Namen erkannt.
- **Speichern:** „Andere DAWs…“ → Reaper-Notennamen bzw. Studio-One-Pitchliste; zugeordnete Tasten heißen wie in Tactus,
  die übrigen behalten den Namen des Herstellers. Diese Formate kennen nur Namen, keine Notenköpfe / Notenlinien.
- Nicht unterstützt: Ableton (`.adg` = ganzes Drum-Rack-Preset), Cakewalk (`.map`, binär), Music Maker.

## Handbuch und Beispiele ✅

- **`hilfe.html`** (Werkzeugleiste „?“, öffnet einen eigenen Tab, offline im Cache): roter Faden Bandraum (Tablet) → zuhause →
  Cubase; eigene Kapitel für Finger / Stift, „Anders als Guitar Pro – eher wie eine DAW“, **Drum-VST wechseln über Tactus**,
  Wiederholungen / Sprünge mit Beispielen, Notenblatt, Wiedergabe / Verzögerung, Speichern / Teilen, Häufige Fragen.
- Automatisch aus dem Programm: **Linien-Tabelle** (`js/drummap.js`) und **Gesten / Tastenkürzel** (`js/shortcuts.js`, dieselbe Liste wie in ⚙).
- **Bilder** per Skript: `bash tools/build_help_images.sh` (Szenen in `tools/help/shots.js`, Tablet-Format 1180 × 820).
- **ⓘ-Links** an den kniffligen Stellen: Kit-Profile, „Was fehlt“, MIDI-Import, Vorlauf, Ausgabe-Verzögerung, Sprünge.
- **Beispiele** (Datei → Beispiele, oder aus dem Handbuch „▶ Im Programm öffnen“ = `index.html?beispiel=…`):
  Groove, **Wiederholungen & Häuser** (1./2. Haus, %, Refrain 3×, Mehrtaktpause), **Sprünge** (D.S. al Coda).
- Seitenansicht: eine Zeile vor einem erzwungenen Umbruch (Coda, neue Zeile) wird nicht mehr über die volle Breite gestreckt.

### Keyswitches (Spielweisen eines Instrument-VSTs) ✅ (zum Ausprobieren, 2026-11-16)

- Wunsch: Gitarren-VSTs wie **UJAM Iron 2 (Instrument Mode)** wie die Drums über eine Tastenkarte ansteuern; die Keyswitches nicht als
  Noten, sondern als Anweisungen (P.M. …). Gebaut: `js/keyswitch.js` (`TC.ksw`) – Profil an der Spur (`track.ksw`: Vorlage `ujam-iron2`
  nach der Tabelle aus dem Handbuch: open A#2, muted F#2, half G#2, dead D#2, Picking C2–A2, Slides C1/D1/E1, Pick Slide F1, Upstroke A1,
  Downstroke B1, Stop G#1/A#1, Release C#2, Schalter Trigger / Strum Auto; `c3` 60 / 48, `noteShift` +12, `poly` 4), Marken
  `bar.ks = [{ t, k }]`. Spielweisen („art“) werden gehalten bis zur nächsten (Latch an / aus egal), „once“ (Slides) kurz vor der Note,
  „event“ (Stop, Release) an der Stelle; Anschläge ⊓ / V → Irons Down- / Upstroke-Taste (Tactus verteilt dann nicht selbst); Noten ans VST
  +12; angetippte Akkorde bei `poly` ≤ 4 enge Griffe. Notenbild: Kürzel unter der Zeile, gehaltene mit gestrichelter Linie und Haken
  („open“ ohne Text). Panel: „Spuren & Klang“ → Keyswitches (Vorlage, C3, Tasten prüfen ▶ / ändern), Noten-Panel „Spielweise“.
  MusicXML: Text über den Noten. Tests: `test_keyswitch.js` (16), Klick-Test (2), Bild `keyswitch.png`, Handbuch Kap. 8 „Keyswitches“.
- **Nach dem Test (2026-11-16):** C3 = 60 stimmt; C1 frei, Slides D1 E1 F1, Pick Slide G1; Trigger Mode On (D#1) muss mit (`ksw.init`,
  beim Start unsichtbar); Stroke-Tasten werden gehalten, solange der Akkord klingt; Gruppen `mute` (open / P.M. / ½ M. / Dead) und `pick`;
  „open“ sichtbar; Slides / Stop / Release eigene Reihe. Alte Iron-Profile werden beim Laden auf die Vorlage gebracht. **Noch zu prüfen:** was die sechs
  Picking-Tasten C2 … A2 einzeln tun (laut Nutzer: Härtegrade). Zweite Vorlage **UJAM Virtual Bassist Rowdy** (2026-11-17): C0–E0 Slides
  (span „note“: nur über die Note), C#0 / F#0 Legato, G0 Silent Dead (Umschalter), A0 / B0 Dead, Bb0 Full Stop; Noten +12 (geprüft),
  „Noten verschieben“ im Profil wählbar. **Offen:** eigene Profile anlegen / weitere Vorlagen; Spielweisen über das Notenmenü.

### Eigene Keyswitch-Profile (Bibliothek wie die Kit-Profile) ✅ (zum Ausprobieren, 2026-11-17)

- Wunsch: für jedes Instrument-VST (weitere UJAM, Iconica Sketch …) selbst ein Keyswitch-Profil anlegen, in der Dropbox ablegen, als Preset
  wählen. Gebaut: `js/kswlib.js` (`TC.kswLib`): Profile `{ id, name, c3, noteShift, poly, init, keys }` in localStorage `tactus.ksw`,
  Dropbox `/Keyswitch-Profile/Keyswitches.tactus-keyswitches.json` (`DB.syncKsw` / `kswChanged`, wie die Kits), Export / Import
  (`*.tactus-keyswitches.json`, auch ein einzelnes). Dialog „Keyswitch-Profile“: neu leer / aus Vorlage / aus der Spur, Tasten mit
  ▶, Name, Text, Taste, Art, Gruppe / Dauer / „am Anfang“, hinzufügen / entfernen. Spur: Kopie mit `ksw.lib`; Auswahl „Vorlagen“ /
  „Eigene Profile“ (fremdes Profil: „(in diesem Stück)“); „Als eigenes Profil speichern…“. Beim Schließen des Dialogs übernehmen die
  Spuren des Stücks, die ein geändertes Profil benutzen, es (ein Undo-Schritt). Tests `test_kswlib.js` (18).
- **Als Nächstes:** Spielweisen an der Note (Staccato-Punkt, Tremolo-Striche – Taste nur für diese Note, danach zurück) und Import von
  Cubase-Expression-Maps (Iconica Sketch) – Expression Maps kommen vom Nutzer.

### Spielweisen von Tactus vorgegeben, Expression Maps, Zeichen an den Noten ✅ (zum Ausprobieren, 2026-11-17)

- Wunsch: die Spielweisen gibt Tactus vor (wie die Drum-Instrumente), im Profil nur die Taste je Spielweise; Expression Maps laden; ein
  Keyswitch gilt immer bis zum nächsten (Latch egal); eine aus den Noten genommene Spielweise darf nicht weiterklingen. Gebaut:
  `KS.CATALOG` (Streicher · Bläser · Orchester: Sustain/ord., vib., non vib., Legato, Staccato, Staccatissimo, Spiccato, Portato, Tenuto,
  Akzent, Marcato, Tremolo, Triller ½ / 1, Pizz., Bartók, col legno, harm., sul pont., sul tasto, flaut., flz., senza / con sord.; Gitarre ·
  Bass: die Tasten von Iron / Rowdy) mit `sign` (Zeichen an jeder Note), `line` (gestrichelt), `def` (Start-Spielweise der Gruppe:
  ord., senza sord., let ring, Legato aus – beim Start gesendet, wenn vorher nichts steht). Vorlagen Iron / Rowdy aus dem Katalog (gleiche
  Ids und Tasten), eigene Schalter (`mode`) frei benannt, Tasten älterer Profile bleiben. Dialog: Tabelle je Kategorie und Gruppe, Taste
  eintragen / leeren, ▶, doppelte Tasten gewarnt. `KS.fromExpressionMap`: Sound-Slots (Name ohne gemeinsamen Vorsatz → Spielweise,
  Note-On → Taste, C3 = 60); Controller / anderer Kanal / doppelt / unbekannt als Liste. Notenbild: Bravura-Artikulationen am Kopf,
  Tremolo als 3 Striche (mit Fähnchen), MusicXML `<staccato/>` … `<tremolo>`. Getestet mit der Violins-Map von Iconica Sketch (7 von 7
  Slots erkannt). `expressionmap/` in .gitignore. Tests `test_kswlib.js` (32).

### Dynamik als Controller (Keyswitch-Profil `dyn`)
- Profil-Feld `dyn: { cc, lo, hi }` (CC 1 / 11 / 2; Vorgabe 20 … 127): die Dynamik der Spur (ppp … fff, Gabeln) geht zusätzlich als
  Controller raus - für VSTs, deren Lautstärke am Modulationsrad hängt (Iconica). ppp = lo, fff = hi, Stufen gleichmäßig dazwischen.
  `SC.dynLevel` (Stufe 0 … 7, in einer Gabel gebrochen), `KS.dynCC` (Werte nur bei Änderung, Gabel alle 32stel, am Anfang der geltende
  Wert). Abspielen: Hits `{ cc, val }` 10 ms vor den Noten (`MO.cc`, nur MIDI); MIDI-Export: vor den Noten derselben Stelle.
  Ein Profil nur mit Dynamik (ohne Tasten) gilt. Anschlagstärke bleibt wie bisher. Tests `test_kswlib.js` (41).

### Gabeln bis zu einer Stelle im Takt
- Panel „bis Takt“ + Stelle (`A.wedgeEnds`: Raster des Noten-Panels nach dem Anfang, dazu „Ende“; Entwurf `endT`), `A.wedgeEndText`
  („bis Takt 1, Zählzeit 2“). Zielstufe im Notenbild an der Note der Endstelle (wie eine Angabe dort), MusicXML ebenso. Klick-Test.
- Dynamik auch über Pitchbend (`dyn.cc = 'pb'`, UJAM Virtual Pianist: Stärke am Pitchbend): `KS.dynMsg` baut CC oder Pitchbend
  (Wert 0 … 127 → 14 Bit, 127 = ganz oben), Abspielen und MIDI-Export.

### Dynamik an Noten als Positionshilfe (Schritt 1 von 2)
- Kein Zählzeit-Raster mehr in der Dynamik: Stufe an der ersten markierten Note (ohne Note: Taktanfang), Gabel von der ersten bis zur
  letzten markierten Note (`A.dynPlace`), Schalter „bis Anfang / Ende der Zielnote“ (`toEnd`; eine Note: über sie). Shift + Tippen auf
  eine Note markiert bis zu ihr (`selectNotesUpTo`). Bleibt an der Stelle im Takt (nicht an die Note gebunden).
- Zeichen und Gabeln im Notenbild antippbar (`data-dyn`, Gabel mit breiter Trefferfläche `.dyn-hit`), ausgewählt `S.dynSel` (farbig),
  Panel-Abschnitt oben: Stufe ändern, Gabel von / bis / Anfang-Ende ändern, Entfernen; Radierer entfernt direkt. Klick-Test.
- Schritt 2: Anfasser zum Ziehen (`data-dynh`: Gabel s / e als Kreise, ein ausgewähltes Zeichen selbst, das Zielzeichen = Ende); rasten
  an Anfang / Ende jeder Note und Pause und an Taktenden ein (`RD.dynSnaps`), Vorschau als Linie im Overlay (`RD.drawDynDrag`),
  `A.moveDynSel` (Startstufe wandert mit; schon belegte Stelle abgelehnt). Klick-Tests.

### Schnellere Darstellung beim Abspielen
- Cursor, Noten-Vorschau, Auswahlrahmen und Anfasser-Vorschau in eigenem SVG `#overlay` über `#score` (gleiche Größe und View,
  pointer-events none). Vorher lag der Cursor im Noten-SVG: jedes Bild malte das ganze Notenbild neu – langsam bei feinem Raster
  (breitere Takte) oder nah herangezoomt, während der Ton stabil blieb.
- Loop / ausgewählte Takte: `drawCursor` baute Takt-Hinterlegung und Loop-Rahmen in jedem Bild neu (der Browser malte den ganzen
  Loop-Bereich neu). Jetzt nur beim Taktwechsel (oder neuer Zeichnung / anderem Loop); pro Bild wird nur der Cursor-Strich verschoben.
- Ansicht mit mittlerer Maustaste / Finger / zwei Fingern gehalten (`I.holdingView`): eine Pause zeichnet nicht neu (jedes Neuzeichnen
  rastert das große Bild samt Rand neu – nah herangezoomt ein spürbarer Ruck); neu gezeichnet erst beim Verlassen des Bilds oder beim
  Loslassen (`RD.settleView`). Offen, falls nötig: nur Takte nahe der Ansicht zeichnen; Rand an den Zoom anpassen.
- Hover-Vorschau ruckelte (gemessen über Edge DevTools-Protokoll: ~170 ms pro Mausbewegung, fast alles „Layerize“): ein einziges
  Rechteck mit CSS `opacity` (ausgewählter Takt `.bar-sel`) machte eine Effekt-Gruppe; bei jeder Änderung der Vorschau sortierte der
  Browser alles darüber neu in Ebenen. Im Notenbild jetzt nur `fill-opacity` / `stroke-opacity` (sieht gleich aus): ~10× schneller.
  Messung: Edge headless mit --remote-debugging-port, Tracing, Input.dispatchMouseEvent (Skript nicht im Repo).
- Messwerkzeug `tools/perf/run.js` (+ `perf.js`): Edge headless über DevTools-Protokoll, Teststück(e), Szenarien hover / pan /
  cursor / draw, Hauptthread-Zeit pro Schritt gegen Budgets, größte Posten aus dem Tracing; Exit-Code 1 bei SLOW. Standard: zwei
  Stücke (4 Spuren · 16 Takte · 1/16 und 1 Spur · 64 Takte · 1/32, Zoom 150 %, Takt ausgewählt). Erkennt die opacity-Bremse.
