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

## Werkzeuge ✅

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

## Wiederholungen ✅ (zum Ausprobieren)

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

## Dropbox ✅ (zum Ausprobieren)

- Datei → „Mit Dropbox verbinden…“ (nur online, https): eigene Dropbox-App, nur der App-Ordner
- Songs: „Aus Dropbox öffnen…“, „In Dropbox speichern (unter…)“; Strg+S speichert einen Dropbox-Song dorthin zurück,
  bei Änderung auf einem anderen Gerät wird gefragt (überschreiben oder neuer Name)
- Kit-Profile: `Kit-Profile/Kits.tactus-kits.json`, jede Änderung wird hochgeladen, beim Start abgeglichen
- Lokale Dateien (Öffnen / Speichern unter, Export / Import der Kit-Profile) bleiben wie gehabt

## Als Nächstes (Reihenfolge)

1. ~~Kopf auf Folgeseiten, Seitenränder~~ ✅  2. ~~Mehrtaktpausen~~ ✅  3. ~~Tempo-Übersicht, Klang-Umschalter, Profil-Prüfung~~ ✅
4. ~~Wiederholungen & Sprünge (D.S. / D.C. / Coda / Fine)~~ ✅
5. ~~Samples~~ ✅ (zum Ausprobieren)  6. Vorlagen für kostenlose VSTs: ~~MT Power Drum Kit 2, General MIDI~~ ✅ (SSD 5.5 Free offen)
7. Drummap-Export für weitere DAWs (Reaper-Notennamen, Studio-One-Pitchlist – Formate erst prüfen)  8. Handbuch / Hilfeseite mit ⓘ-Links

## Offen zum Ausprobieren

- Fühlt sich das Raster richtig an (Breite der Zellen, Einrasten, Vorschau)?
- Klingen die synthetischen Sounds brauchbar, oder lohnen sich bald echte Samples?

## Wiedergabe über Cubase (Web MIDI) ✅ (zum Ausprobieren)

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

## Aufgenommene Klänge (Samples) ✅ (zum Ausprobieren)

- Panel → Wiedergabe: **„Aufgenommene Schlagzeug-Klänge (Samples) statt Synthesizer“** – beim ersten Mal ca. 3,4 MB, danach
  offline im eigenen Cache (bleibt über Updates erhalten)
- Quellen: **MuldjordKit** (Lars Muldjord, CC BY 4.0: Bassdrum, Snare, Hi-Hat zu / offen, 4 Toms, 2 Crashes, China, 2 Rides
  mit Glocke) und **Virtuosity Drums** (Versilian Studios, CC0: Rimshot, Sidestick, Hi-Hat Pedal / halb / Splash, Cowbell,
  Claves, Tamburin, Shaker). Namensnennung im Panel, `samples/LICENSE.md`, README
- 3 Aufnahmen pro Klang (leise / mittel / laut): Ghost nimmt die leise, Akzent die laute; ein geschlossenes Hi-Hat stoppt das
  offene; abgestoppte Becken kurz. Ohne Aufnahme (Klatschen, Reverse-Becken): Synthesizer
- `tools/build_samples.sh` baut `samples/*.flac` aus den Originalen (`samples-src/`, nicht im Repo; braucht ffmpeg)
- Später evtl.: mehrere Aufnahmen pro Stufe (Round Robin) gegen den „Maschinengewehr“-Effekt bei Wirbeln

## Vorlagen für kostenlose Drum-VSTs ✅ (zum Ausprobieren)

- Kit-Profile → **„Neu aus Vorlage…“**: „MT Power Drum Kit 2“ (Manda Audio, kostenlos) und „General MIDI (Groove Agent SE, …)“.
  Die Vorlage enthält nur Tastennummern (aus der Hersteller-Map übernommen, deren Datei wird nicht mitgeliefert);
  „Drummap für Cubase speichern“ erzeugt die Cubase-Map mit der Tactus-Notation.
- Drummap-Erkennung robuster: „SIDE-STICK“, „Tom Hi / Mid / Low“, Zweittasten in Klammern „(Snare)“, Instrument-Tasten
  ohne Anzeigenote („Hi-Hat Pedal“), „---“ = ohne Name; Kanal −1 („Kanal der Spur“) spielt auf Kanal 10.

## Drummap für Cubase 13 und älter ✅ (zum Testen in Cubase 13)

- Kit-Profile: **„Drummap für Cubase 14+ speichern“** (Notenköpfe, Instrumente, Spielweisen) und **„… für Cubase 13 und älter“**
  (altes Format: nur `HeadSymbol`, ohne NoteheadSet / Instrument / Spielweise – Cubase 13 kennt keine Spielweisen; Windows-Zeilenenden)
- `HeadSymbol` = Index in Cubases Kopf-Liste, ermittelt an einer in Cubase 13 gespeicherten Map: 0 normal, 1 ⊘, 2 x, 3 Raute,
  4 Schrägstrich, 5 Quadrat, 6 dickes x, 7 ⊗, 8 langer Schrägstrich, 9 klein, 10 / 11 Dreieck links / rechts, 14 Dreieck unten.
  Tactus: Hi-Hat / Ride x (2), halb offen ⊘ (1), offen ⊗ (7), Crash / China dickes x (6), Rimshot / Glocke Raute (3),
  Cowbell vorerst Dreieck unten (14; Werte 16–30 noch unbekannt)
