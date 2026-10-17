# iPhone-Lernapps – Vokabeltrainer

Lernapp für **Englisch** (beide Richtungen) und **Latein** (Latein → Deutsch).
Die App gibt es in zwei Varianten, beide brauchen **keinen Mac**:

| | **Web-App** (`web/`) | **Swift-App** (`VokabelTrainer.swiftpm/`) |
|---|---|---|
| Läuft auf | iPhone, iPad, Windows-PC (im Browser, auf dem iPhone als App auf dem Home-Bildschirm) | iPad (in Swift Playgrounds) |
| Kosten | kostenlos | kostenlos (aufs iPhone nur mit Apple-Entwicklerkonto, 99 €/Jahr) |
| Programmieren | HTML/CSS/JavaScript, z. B. mit VS Code unter Windows | Swift + SwiftUI, direkt auf dem iPad |
| Gedacht für | **das tägliche Lernen** | **gemeinsam Programmieren lernen** |

## Was die App kann

- **Lernkartei (Leitner-System):** Jede Vokabel liegt in einem von 6 Fächern.
  Richtig → ein Fach weiter, längere Pause (1, 2, 4, 8, 16, 32 Tage).
  Falsch → zurück in Fach 1 und **sofort wieder fällig**. In derselben Runde kommt sie nach 3 anderen Karten noch einmal dran.
  Vokabeln, die schon oft falsch waren, kommen auch nach richtigen Antworten früher wieder.
- **Drei Abfragearten:** Eintippen (tolerant bei Groß/Klein, Umlauten, Artikeln, „to“, kleinen Tippfehlern; bei mehreren Bedeutungen reicht eine), Auswählen (Multiple Choice) und Karteikarte (aufdecken und selbst einschätzen).
- **Import aus Fotos, Kamera und PDFs:** Die Texterkennung läuft auf dem Gerät. Zweispaltige Vokabellisten werden automatisch in Wort und Übersetzung zerlegt. Vor dem Speichern kann man alles prüfen und korrigieren.
- **Sätze übersetzen:** Die KI bildet kurze, kindgerechte Sätze mit den eigenen Vokabeln (bevorzugt mit denen, die noch nicht sitzen), bewertet die Übersetzung und gibt Feedback.
- **Erfolgskontrolle:** Serie (Tage in Folge), Trefferquote, Aktivität der letzten 14 Tage, Verteilung auf die Fächer der Lernkartei, Liste der häufigsten Fehler. Nach jeder Runde gibt es Sterne und die Liste der falschen Vokabeln.
- Englische Wörter können vorgelesen werden.

### KI (optional)

Ohne KI funktionieren Abfrage, Import per Texterkennung und Statistik. Für das **Übersetzen von Sätzen** und eine
bessere Erkennung unübersichtlicher Seiten braucht es **Claude**:

1. Auf <https://platform.claude.com> ein Konto anlegen, ein kleines Guthaben aufladen und ein **Ausgabenlimit** setzen.
2. Einen API-Schlüssel erstellen und in der App unter **Einstellungen** eintragen.

Eine Übungsrunde kostet wenige Cent. Der Schlüssel bleibt nur auf dem jeweiligen Gerät.
(Die Swift-App kann auf neueren Geräten mit iOS/iPadOS 26 stattdessen auch Apple Intelligence nutzen, kostenlos und offline.)

---

## Web-App: aufs iPhone bringen

Die Web-App muss einmal im Internet veröffentlicht werden. Danach öffnet man sie in Safari und legt sie auf den Home-Bildschirm.

### Schritt 1: Veröffentlichen (einmalig, am Windows-PC im Browser)

**Variante A – GitHub Pages (empfohlen):**
GitHub Pages ist bei privaten Repositories nur mit einem kostenpflichtigen GitHub-Konto möglich. Das Repository enthält keine
geheimen Daten (der API-Schlüssel wird nur in der App gespeichert), deshalb kann man es öffentlich machen:

1. Auf GitHub im Repository: **Settings → General → ganz unten „Change repository visibility“ → Public**.
2. **Settings → Pages → Source: „GitHub Actions“** auswählen.
3. Die Änderungen auf den Branch `main` bringen (Pull Request zusammenführen). Danach baut GitHub die Seite automatisch
   (Reiter **Actions**) und sie ist erreichbar unter: **`https://koerbers.github.io/iPhone-Lernapps/`**

**Variante B – Repository privat lassen, mit Netlify (kostenlos):**
Auf <https://app.netlify.com> mit dem GitHub-Konto anmelden → „Add new project“ → „Import from GitHub“ → dieses Repository
wählen → **Publish directory: `web`**, Build command leer lassen → Deploy. Netlify zeigt danach die Adresse an.

### Schritt 2: Auf dem iPhone installieren

1. Die Adresse in **Safari** öffnen.
2. Unten auf **Teilen** (□↑) tippen → **„Zum Home-Bildschirm“**.
3. Fertig – der Vokabeltrainer startet jetzt wie eine App, auch ohne Internet.

**Wichtig:** Die Vokabeln werden nur auf diesem Gerät gespeichert. Unter **Einstellungen → Sicherung** kann man eine
Sicherungsdatei speichern (z. B. in iCloud Drive) und auf einem anderen Gerät wieder laden.

### Am Windows-PC weiterentwickeln

1. [Visual Studio Code](https://code.visualstudio.com) und [Node.js](https://nodejs.org) installieren.
2. Repository herunterladen (in VS Code: „Clone Git Repository“).
3. Im Terminal von VS Code:
   ```
   cd web
   npm start        # startet die App unter http://localhost:3000
   npm test         # prüft die Lernlogik automatisch
   ```
4. Änderungen hochladen (Commit + Push) – GitHub Pages aktualisiert die App automatisch.

Aufbau der Web-App:

```
web/
  index.html            Grundgerüst mit Menüleiste
  css/style.css         Aussehen (hell + dunkel)
  js/main.js            Einstieg: wählt die Seite passend zur Adresse
  js/srs.js             Lernkartei (Fächer, Pausen, welche Vokabeln dran sind)
  js/answer.js          Prüft eingetippte Antworten
  js/parser.js          Findet Vokabelpaare in erkanntem Text
  js/session.js         Ablauf einer Übungsrunde
  js/stats.js           Auswertungen für „Erfolge“
  js/store.js           Speichern im Browser, Sicherung, Beispielvokabeln
  js/ocr.js             Texterkennung für Fotos und PDFs
  js/ai.js              Anbindung an Claude
  js/views/*.js         Die einzelnen Seiten
  tests/                Automatische Tests
```

---

## Swift-App: auf dem iPad mit Swift Playgrounds

1. Auf dem iPad **Swift Playgrounds** aus dem App Store laden (kostenlos).
2. In Safari auf dem iPad dieses Repository auf github.com öffnen (anmelden, falls es privat ist) →
   grüner Knopf **„Code“ → „Download ZIP“**.
3. In der **Dateien**-App die ZIP-Datei antippen (wird entpackt) und den Ordner **`VokabelTrainer.swiftpm`**
   in **iCloud Drive → Playgrounds** verschieben.
4. Swift Playgrounds öffnen → `VokabelTrainer` antippen → **▶︎ App ausführen**.

Swift Playgrounds kann die App über **App Store Connect** auch an TestFlight schicken. Damit lässt sie sich auf dem iPhone
installieren; dafür braucht man aber das Apple Developer Program (99 €/Jahr).
Auf einem Mac lässt sich `VokabelTrainer.swiftpm` übrigens auch mit Xcode öffnen.

Aufbau der Swift-App:

```
VokabelTrainer.swiftpm/
  Package.swift         App-Einstellungen (Name, Icon, Kamera-Erlaubnis)
  App/                  Einstieg, Menüleiste, Beispielvokabeln
  Models/               Datenmodell (SwiftData)
  Logic/                Lernkartei, Antwortprüfung, Vokabel-Erkennung, Statistik
  Services/             Texterkennung (Vision/PDFKit), Vorlesen, Schlüsselbund, KI
  Views/                Die einzelnen Bildschirme
```

---

## Ideen zum Weiterbauen (gemeinsames Projekt)

Einstiegsaufgaben, bei denen man schnell ein Ergebnis sieht – in beiden Varianten möglich:

- **Lob-Sprüche** nach einer Runde ändern (`web/js/ui.js` → `resultScreen` bzw. `SessionResultView.swift`).
- **Farben** anpassen (`web/css/style.css`, ganz oben).
- **Pausen der Lernkartei** ändern (`INTERVAL_DAYS` in `web/js/srs.js` bzw. `intervalDays` in `SpacedRepetition.swift`).
- **Neue Tests** schreiben (`web/tests/logic.test.mjs`): Welche Antworten sollen noch als richtig gelten?
- Fortgeschritten: Tagesziel mit Fortschrittsring, Abzeichen („100 Vokabeln gemeistert“), Formen-Training für lateinische Verben, ein Wettkampf-Modus gegen die Uhr.
