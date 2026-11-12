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
| `test_model.js` | Noten setzen (Akkord, gleiche Stelle, Kürzen), löschen, Taktart ab einem Takt / nur ein Takt, Takte einfügen / löschen, Laden mit kaputten Werten, Drum-Map, Drum-Kits, Magnet zur nächsten Linie |
| `test_bars.js` | Balkengruppen (7/8, 5/8, eigene Gruppen), Pausen in den Gruppen, Takte kopieren / einfügen / verdoppeln, %-Takt, Flam / Wirbel / Sticking speichern und laden |
| `test_playback.js` | Wiedergabe-Zeitplan: Zeiten bei 120 BPM, Lautstärke (Ghost / Akzent), Flam, Drag, Wirbel, Metronom, Einzähler, %-Takt, Tempowechsel, ungerade Taktarten |
| `harness.js`, `run.js` | Hilfsmittel: Dateien laden, Prüfungen zählen, alle `test_*.js` ausführen |

## Klick-Test (im Browser)

`tools/uitest/index.html` in Edge oder Chrome öffnen: Die echte App startet, ein Skript klickt
Noten auf die Linien, wählt aus, löscht, macht rückgängig, ändert die Taktart, drückt Tasten
und zeigt rechts unten das Ergebnis (`ok` / `FAIL` je Zeile). Es speichert nichts – ein im
Browser gesichertes Stück bleibt unverändert.

`tools/uitest/index.html` ist eine Kopie von `index.html` mit Pfaden `../../` und dem Skript
`uitest.js`; nach Änderungen an `index.html` (neue Skripte) dort nachziehen.
