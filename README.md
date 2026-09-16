# Anny Serienreservierung für Microsoft Edge

Eine Manifest-V3-Erweiterung, die eine normale Reservierung auf `https://anny.eu/planner` als Vorlage erkennt und auf ausgewählte kommende Wochentage überträgt.

## Funktionsweise

1. Die Erweiterung erkennt den kurzlebigen Bearer-Token automatisch aus den API-Aufrufen, mit denen der geöffnete Anny-Planner seine Daten lädt. Der Token muss nicht eingegeben oder kopiert werden.
2. Nach einer normalen Reservierung öffnet sie das seitliche Panel und übernimmt Ressource, Service sowie lokale Start-/Endzeit als Vorlage.
3. Nutzer wählen 1–365 kommende Kalendertage, Wochentage, Start-/Endzeit und die Zeitzone. Der Ausgangstag wird absichtlich nicht erneut gebucht.
4. Nach einer expliziten Bestätigung werden die zusätzlichen Reservierungen nacheinander erstellt. Resultate werden einzeln angezeigt; Konflikte werden nicht überschrieben.

Die Berechnung arbeitet mit lokalen Kalenderzeiten und berücksichtigt Sommer-/Winterzeit. Zugangsdaten werden weder persistent gespeichert noch an Dritte übertragen. Da der Ablauf eine interne, nicht öffentlich dokumentierte Anny-Schnittstelle nutzt, kann eine Änderung der Web-App Anpassungen erfordern.

## Installation (Entwicklermodus)

```bash
npm test
npm run check
npm run package
```

Danach in Edge `edge://extensions` öffnen, **Entwicklermodus** aktivieren und entweder **Entpackte Erweiterung laden** mit dem Projektordner verwenden oder `dist/anny-series-reservation.zip` gemäß der unternehmensinternen Verteilung installieren.

## Lokale Entwicklung

Die Erweiterung ist bewusst ohne Runtime- oder Build-Abhängigkeiten umgesetzt. Dadurch gibt es keine veraltenden Supply-Chain-Pakete. Nach Änderungen Erweiterung auf `edge://extensions` neu laden und den Anny-Tab aktualisieren.

Die Skripte unterstützen Node.js ab Version 22 sowie Bun. Syntaxprüfungen kompilieren die Browser-Skripte, ohne sie in einer serverseitigen Umgebung auszuführen. Die Paketierung erzeugt das ZIP direkt in JavaScript und benötigt daher auch unter Windows kein externes `zip`-Programm.

## Grenzen und Sicherheit

- Nur Reservierungen, die der angemeldete Anny-Nutzer auch regulär anlegen dürfte, sind möglich.
- Die Anmeldung wird automatisch aus regulären Anny-API-Aufrufen erkannt. Als fachliche Vorlage muss weiterhin im selben Tab eine normale Reservierung ausgelöst werden, weil nur deren Request die Ressourcen-, Service- und Zeitoptionen vollständig enthält.
- Der Dialog zeigt die Anzahl verbindlicher Buchungen vor dem Absenden; ein erfolgreicher Teil-Lauf wird bei späteren Fehlern nicht zurückgerollt.
- Keine Secrets, insbesondere keine Bearer-Tokens, in Quelltext, Issues oder Logs übernehmen. Das im ursprünglichen Arbeitsauftrag enthaltene Beispiel-Token sollte als kompromittiert betrachtet und widerrufen werden.

## Architektur

- `src/bridge-main.js`: läuft in der Hauptwelt der Anny-Seite, erkennt Vorlage/Anmeldung und führt bestätigte API-Aufrufe aus.
- `src/content.js` und `src/content.css`: isoliertes, zugängliches Slide-in und Ablaufsteuerung.
- `src/recurrence.js`: getestete, DST-feste Terminberechnung.
