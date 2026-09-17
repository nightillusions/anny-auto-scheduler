# Anny Serienreservierung für Microsoft Edge

Eine Manifest-V3-Erweiterung, die eine normale Reservierung auf `https://anny.eu/planner` als Vorlage erkennt und auf ausgewählte kommende Wochentage überträgt.

## Funktionsweise

1. Die Erweiterung öffnet das Panel, wenn Anny nach dem Anklicken einer Ressource `GET https://b.anny.eu/api/v1/resources/{resource}/children` abfragt. Die Anfrage liefert Ressource und Service, aber bei `data: []` ausdrücklich keine Buchungsvorlage.
2. Beim Laden von `GET https://b.anny.eu/api/v1/service-configuration` übernimmt sie für die aktuell gewählte Buchungsoption die editierbaren Standardzeiten. Die Erweiterung synchronisiert beim Start bereits geladene Konfigurationen nach, damit die Defaults nicht von der Reihenfolge der Anny-Anfragen abhängen. Bei flexiblen Buchungen erzwingt sie außerdem die pro Ressource gelieferte Mindest- und Höchstdauer; Buchungsintervall und Ressourcenzeitplan werden angezeigt und Anny prüft die konkrete Verfügbarkeit weiterhin verbindlich.
3. Nach einer normalen Reservierung übernimmt sie aus `POST https://b.anny.eu/api/v1/bookings/instant` zusätzlich die konkrete Ressource, den Service sowie lokale Start-/Endzeit als Vorlage und aktiviert die Serienbuchung.
4. Nutzer wählen 1–365 kommende Kalendertage, Wochentage, Start-/Endzeit und die Zeitzone. Der Ausgangstag wird absichtlich nicht erneut gebucht.
4. Nach einer expliziten Bestätigung werden die zusätzlichen Reservierungen nacheinander erstellt. Resultate werden einzeln angezeigt; Konflikte werden nicht überschrieben.

Die Berechnung arbeitet mit lokalen Kalenderzeiten und berücksichtigt Sommer-/Winterzeit. Zugangsdaten werden weder persistent gespeichert noch an Dritte übertragen. Da der Ablauf eine interne, nicht öffentlich dokumentierte Anny-Schnittstelle nutzt, kann eine Änderung der Web-App Anpassungen erfordern.

Der organisationsweite Vorausbuchungszeitraum wird aus der Anny-Ressourcenantwort erkannt. Termine, deren Ende das Limit erreicht oder überschreitet, werden nicht erzeugt. Sollte Anny das Limit nur als `unavailable_interval` zurückgeben, übernimmt die Erweiterung den daraus genannten Zeitpunkt und überspringt weitere ungültige Termine.

## Installation (Entwicklermodus)

```bash
npm test
npm run check
npm run package
```

Danach in Edge `edge://extensions` öffnen, **Entwicklermodus** aktivieren und **Entpackte Erweiterung laden** wählen. Im Ordnerdialog den entpackten Ordner `dist/anny-series-reservation` auswählen (nicht die `.zip` – der Ordnerdialog zeigt Dateien wie Zip-Archive grundsätzlich nicht an). Die Datei `dist/anny-series-reservation.zip` ist ausschließlich für die unternehmensinterne Verteilung gedacht.

## Lokale Entwicklung

Die Erweiterung ist bewusst ohne Runtime- oder Build-Abhängigkeiten umgesetzt. Dadurch gibt es keine veraltenden Supply-Chain-Pakete. Nach Änderungen Erweiterung auf `edge://extensions` neu laden und den Anny-Tab aktualisieren.

## Grenzen und Sicherheit

- Nur Reservierungen, die der angemeldete Anny-Nutzer auch regulär anlegen dürfte, sind möglich.
- Vor dem ersten Lauf muss im selben Tab eine normale Reservierung erstellt werden, damit Vorlage und kurzlebige Anmeldung erkannt werden.
- Der Dialog zeigt die Anzahl verbindlicher Buchungen vor dem Absenden; ein erfolgreicher Teil-Lauf wird bei späteren Fehlern nicht zurückgerollt.
- Keine Secrets, insbesondere keine Bearer-Tokens, in Quelltext, Issues oder Logs übernehmen. Das im ursprünglichen Arbeitsauftrag enthaltene Beispiel-Token sollte als kompromittiert betrachtet und widerrufen werden.

## Architektur

- `src/bridge-main.js`: läuft in der Hauptwelt der Anny-Seite, erkennt Vorlage/Anmeldung und führt bestätigte API-Aufrufe aus.
- `src/content.js` und `src/content.css`: isoliertes, zugängliches Slide-in und Ablaufsteuerung.
- `src/recurrence.js`: getestete, DST-feste Terminberechnung.

## Arbeit Mit KI-Agenten

Die verbindlichen Projektregeln für KI-Agenten stehen in `.github/copilot-instructions.md`. Zusammenhängende Implementierung, Tests und Dokumentation werden als ein Commit abgeschlossen. Dafür wird nach erfolgreicher Prüfung beispielsweise folgender Befehl verwendet:

```bash
bun run release -- fix "Vorausbuchungslimit berücksichtigen" src/bridge-main.js src/content.js src/recurrence.js test/recurrence.test.js README.md .github/copilot-instructions.md scripts/release.mjs
```

Der Befehl erstellt den Commit, erhöht die Version synchron in `package.json` und `manifest.json` und erzeugt anschließend den aktuellen Edge-Auslieferungsordner `dist/anny-series-reservation`: `fix` erhöht Patch, `feat` Minor und `breaking` Major. In Edge muss die bereits geladene Erweiterung nach einem Release über `edge://extensions` neu geladen werden; dort zeigt Edge dann diese Manifest-Version an.
