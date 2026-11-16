# Tests

## Logik-Tests (ohne Browser)

Prüfen Notenwerte, Pausen, Triolen, Balken (`rhythm.js`) und das Setzen / Löschen von Noten,
Takten und Taktarten (`model.js`, `drummap.js`). Sie laden die Dateien aus `js/` in eine
nachgebaute Umgebung (`vm`) und schreiben das Ergebnis in eine Textdatei.

Node ist nicht nötig – die Skripte laufen mit dem Electron von VS Code (Git Bash):

```bash
ELECTRON_RUN_AS_NODE=1 "/c/Users/<Name>/AppData/Local/Programs/Microsoft VS Code/Code.exe" \
  tools/tests/run.js "<Pfad zum Repo>" "<Ausgabe>.txt"
```

Die erste Zeile der Ausgabe lautet `ALL OK: … passed` oder `FAILED: …`, darunter steht jede Prüfung.

| Skript | prüft |
|---|---|
| `test_rhythm.js` | Notenwerte, Punktierung, Pausen ohne verdeckte Zählzeiten, Pausenbereinigung (bis Schlagende / nächste Note), Achtel-/Sechzehntel-/Viertel-Triolen, 3/4, 6/8, 7/8, Haltebögen (nur ohne Schlagzeug), Balken, Zählnamen |
| `test_model.js` | Noten setzen (Akkord, gleiche Stelle, Kürzen), löschen, Takt-Text / Zeilenumbruch / Seiteneinstellungen laden, Taktart ab einem Takt / nur ein Takt, Takte einfügen / löschen, Laden mit kaputten Werten, Drum-Map, Drum-Kits, Magnet zur nächsten Linie |
| `test_bars.js` | Balkengruppen (7/8, 5/8, eigene Gruppen), Pausen in den Gruppen, Takte kopieren / einfügen / verdoppeln, %-Takt, Flam / Wirbel / Sticking speichern und laden |
| `test_playback.js` | Wiedergabe-Zeitplan: Zeiten bei 120 BPM, Lautstärke (Ghost / Akzent), Flam, Drag, Wirbel, Metronom, Einzähler, %-Takt, Tempowechsel, ungerade Taktarten |
| `test_repeats.js` | Wiederholungen: Abspielfolge (2×, 3×, ohne Anfang, 1./2. Ende, mehrtaktige Klammer, neue Abschnitte), Auswahl-Bereiche, Wiedergabe und MIDI-Export ausgeschrieben mit Markern, Ausschreiben im Stück, Laden |
| `test_stems.js` | Notenhälse: Füße / tiefe Toms / alles nach oben, Noten wandern in die passende Stimme, Akkorde, Ids bleiben |
| `test_tools.js` | Mehrere Noten verschieben: über Taktgrenzen (auch andere Taktart), zu einem anderen Instrument, blockiert am Stückende / auf gleicher Note / im %-Takt |
| `test_tracks.js` | Mehrere Spuren: hinzufügen / löschen / sortieren / verdoppeln, aktive Spur, %-Takt und Leeren pro Spur, Einfügen und MIDI-Import in eine Spur, Abspielen und MIDI-Export aller Spuren, Speichern, Instrumente pro Spur (eigene Auswahl, eine Notenlinie), Ausblenden |
| `test_tracks_midi.js` | Spuren und MIDI: Stumm / Solo, Kit-Profil pro Spur (eigenes, wie das Stück, General MIDI, nicht vorhanden), MIDI-Export einzeln pro Spur und alle in einer Datei (Typ 1, benannte Spuren), Import mehrerer Spuren als eigene Tactus-Spuren mit eigener Drum-Map, Speichern |
| `test_pages.js` | Umblättern: Umblätter-MIDI (Note n = Seite n, Kanal 16, Takte vorher, Seite aus einem Takt, Wiederholungen, Tempo), eingehende MIDI-Befehle (Note, Program Change, Kanalfilter, angelernte Note / Pedal-CC) |
| `test_musicxml.js` | MusicXML-Export: wohlgeformt, jede Stimme füllt ihren Takt, Parts / Instrumente (GM-Tasten), Notenköpfe, Ghost, Akzent, Flam / Drag, Wirbel, Sticking, Triolen, Balken, Wiederholungen, Klammern, Sprünge, Takt-Texte, Tempo, %-Takte, einlinige Spuren |
| `test_jumps.js` | Sprünge wie in Guitar Pro: Segno Segno, Double Coda, D.S.S., „al Double Coda“ (Abspielfolge, was fehlt, Speichern), MusicXML mit `segno2` / `coda2`, Export für Guitar Pro (ausgeschrieben, Tempo an jeder Stelle) |
| `test_swing.js` | Swing / Shuffle: Zeitpunkte (Achtel, Sechzehntel, Triolen bleiben), Wiedergabe, MIDI mit und ohne Swing, Laden |
| `test_share.js` | Teilen-Link: kompaktes JSON ohne Ids / Ansicht / Standardwerte, beim Laden dieselben Noten, Takte, Wiederholungen, Tempo |
| `test_cubase.js` | Cubase-Drummaps (`.drm`): lesen, Instrumente an den Namen erkennen (Pattern-Tasten auslassen), auf die Tactus-Darstellung umschreiben, Klänge (INote / ONote) bleiben |
| `test_kits.js` | Kit-Profile: automatische Zuordnung, verdächtige Tasten (falsche Ausgangsnote), eine Taste = ein Instrument, Cubase-Drummap mit Tactus-Darstellung und Reihenfolge, Export / Import, Speichern im Browser |
| `test_midi.js` | MIDI-Export: Noten und Zeiten, Anschlag (Ghost / Akzent), %-Takt, Flam, Tempo / Taktart / Marker, Kit-Profil mit Ersatz-Instrument und Fehlendem |
| `test_midiin.js` | MIDI-Import: Hin und zurück (Export → Import), eingespielte Datei (Typ 1, 480 Ticks, ungenau): Raster, Triolen-Schlag, Ghost / Akzent, Flam, unbekannte Taste, Marker; Kit-Profil mit mehreren Tasten |
| `test_pitch.js` | Tonleitern: welcher Ton auf welcher Linie liegt (auch Pentatonik / Blues / Ganzton: blasse Linien), Vorzeichen (Kirchentonarten, harmonisch Moll …), Grundton-Schreibweise (Des-Dur, Cis-Moll), Schreibweise einer Tonhöhe, Versetzungszeichen im Takt, Schlüssel (Violin, Bass, Tenor), Namen |
| `test_melody.js` | Melodie-Spuren: anlegen, Noten mit Tonhöhe (Akkord, gleicher Ton, verschieben), Tonleiter ab einem Takt (bleibt beim Leeren, beim Ausschreiben), Speichern / Laden, Wiedergabe mit Tonlänge, MIDI (Programm, Kanal, Länge), MusicXML (Tonhöhe, Tonart, Schlüssel, Vorzeichen, Haltebögen) |
| `test_ties.js` | Haltebögen (Melodie): Note über mehrere Taktstriche, kürzer machen, stoppt an der nächsten Note, Kette / was danach kommt, ein Bogen gilt nur wo er passt (anderer Ton, %-Takt), Bogen von Hand im Takt, Wiedergabe und MIDI schlagen nicht neu an (nach einer Wiederholung zu einem anderen Ton schon), MusicXML über den Taktstrich ohne zweites Vorzeichen, Speichern |
| `test_chords.js` | Stufenakkorde jeder Tonleiter (Dreiklänge, Vierklänge, Stufen I ii iii … mit ♭ / ♯, Pentatonik mit eigenen Tönen markiert, Blues I7 IV7 V7, Ganzton, seltsame Akkorde exotischer Tonleitern), Namen (deutsch H / B), Eintippen (Zweitnamen, Schrägstrich, deutsche Grundtöne, unbekannte Endung), Lage zum Mitspielen, Akkordtöne mit Schreibweise, Hervorheben / Sperren, nächster Akkordton |
| `test_chordsyms.js` | Akkordsymbole im Stück: setzen / entfernen, als Stufe (folgen dem Tonleiterwechsel) oder eingetippt, Akkord an einer Stelle, Tonart ohne Melodie-Spur, Hilfe beim Schreiben pro Takt, Taktart, Kopieren / Einfügen, Speichern / Laden / Teilen-Link, Wiedergabe (Fläche bis zum nächsten Akkord, gehalten über den Taktstrich, aus / Solo), MIDI (eigene Spur, Kanal 15, Namen als Text, Datei nur mit Akkorden), MusicXML `<harmony>` |
| `test_findrepeats.js` | Wiederholungen finden: Takte wie der davor (→ %), Abschnitte, die direkt wiederkommen (→ Wiederholungszeichen n×; nicht aus einem einzigen Takt, nur wenn alle Spuren gleich, nicht über Text / Taktart / vorhandene Zeichen), Anschlag beachten oder nicht, vorhandene %, Zusammenfassen, alles automatisch (klingt wie vorher), eine Wiederholung wieder ausschreiben |
| `test_timesigshift.js` | Taktart nur für einen Takt mit nachrückenden Noten (MIDI-Import ohne Taktwechsel): kürzer zieht vor, länger schiebt nach hinten, die anderen Takte behalten ihre Taktart, Texte bleiben, Akkorde rücken mit, %-Takte ausgeschrieben, Melodienoten über dem Taktstrich geteilt und gebunden, Schlagzeug abgeschnitten; „nur dieser Takt“ ohne Verschieben |
| `test_keyswitch.js` | Keyswitches (UJAM Iron 2): Tastennamen als MIDI-Noten (C3 = 60 / 48), Vorlage nach Handbuch, Profil mit dem Stück gespeichert, Spielweisen bis zur nächsten gehalten (Abspielen, ab Takt 2, MIDI-Export), Slides vor ihrer Note, Anschläge als Iron-Tasten (nicht verteilt), Noten verschoben, MusicXML-Anweisungen |
| `test_accomp.js` | Akkorde als Noten: Gitarrengriffe (offene Akkorde, Bass auf der tiefsten Saite, Schrägstrich, keine doppelten Töne), Klavier-Lagen, Spielweisen (Pop-Schlag, Bass + Akkord, Walzer, Alberti, gebrochen, ausgehalten), Akkordwechsel im Takt, Ersetzen, Anschläge gespeichert / versetzt gespielt / MIDI / MusicXML `<down-bow/>` |
| `test_dynamics.js` | Dynamik und Spur-Lautstärke: Stufen und Gabeln setzen / entfernen, wie stark jede Stelle spielt (Gabel zur nächsten Stufe oder zwei Stufen weiter), Abspielen und MIDI (Noten bleiben, wie sie sind), CC 7, Speichern / Laden / Teilen-Link, Kopieren, %-Takte, MusicXML `<dynamics>` / `<wedge>` |
| `test_piano.js` | Klavier: zwei Notenzeilen als ein Instrument (Name, Klang, Tonleiter, Stumm / Solo, Ausblenden gemeinsam), Reihenfolge der Spuren (Hinzufügen, Verschieben, Verdoppeln, Löschen im Block), Laden (linke Hand nur nach einer Melodie-Spur), wieder eine Zeile, MusicXML ein Part mit `<staves>2</staves>`, MIDI eine Spur |
| `test_lyrics.js` | Liedtext: Text in Silben teilen (Bindestrich, `_` für Melismen), auf die Noten verteilen (nur Stimme 1, gebundene Noten ausgelassen), Strophen, Speichern / Laden / Teilen-Link, andere Worte = kein %-Takt, MusicXML `<lyric>` (Silbentrennung, `<extend/>`, Strophen), MIDI Lyric-Ereignisse (Strophe 2 im 2. Durchgang) |
| `test_voices.js` | Melodie in zwei Stimmen: liegender Ton (Stimme 2) unter bewegter Melodie (Stimme 1) – beides klingt, die Melodie kürzt den liegenden Ton nicht, Noten in die andere Stimme verschieben, MusicXML mit `<voice>2</voice>` und Hals nach unten |
| `harness.js`, `run.js` | Hilfsmittel: Dateien laden, Prüfungen zählen, alle `test_*.js` ausführen |

## Klick-Test (im Browser)

`tools/uitest/index.html` in Edge oder Chrome öffnen: Die echte App startet, ein Skript klickt
Noten auf die Linien, wählt aus, löscht, macht rückgängig, ändert die Taktart, drückt Tasten
und zeigt rechts unten das Ergebnis (`ok` / `FAIL` je Zeile). Es speichert nichts – ein im
Browser gesichertes Stück bleibt unverändert.

`tools/uitest/index.html` ist eine Kopie von `index.html` mit Pfaden `../../` und dem Skript
`uitest.js`; nach Änderungen an `index.html` (neue Skripte) dort nachziehen.
