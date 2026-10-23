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

- **Mehrere Kinder:** Jedes Kind hat ein Profil (Name, Alter, Bild) mit eigenen Listen, eigenem Lernstand, eigener Statistik und eigenen Einstellungen. Bei jedem Start der App (und nach mehr als 15 Minuten Pause) fragt sie „Wer lernt?“, damit sich mehrere Kinder ein Gerät teilen können; gewechselt wird außerdem oben auf der Startseite über das Bild. Listen lassen sich für ein anderes Kind kopieren; der Claude-Schlüssel gilt für alle.
- **Avatare:** Tier- und Weltall-Bilder (🚀 🛸 👽 🤖 🧑‍🚀 🪐 …) oder ein eigenes Foto/Bild vom Gerät (z. B. die Lieblingsfigur). Eigene Bilder werden quadratisch verkleinert und bleiben nur auf dem Gerät (und in der Sicherungsdatei).
- **Schwierigkeit nach Alter** (automatisch, in den Einstellungen änderbar):

  | | Leicht (bis 10) | Mittel (11–12) | Schwer (ab 13) |
  |---|---|---|---|
  | Tippfehler | großzügig | normal | streng |
  | Hilfe | 💡 Tipp-Knopf (erste Buchstaben) | – | – |
  | Auswählen | zufällige falsche Antworten | zufällige | ähnlich aussehende |
  | Englisch startet mit | Englisch → Deutsch | beiden Richtungen | beiden Richtungen |
  | Runde | 10 Abfragen, 5 neue | 20, 10 neue | 25, 15 neue |
  | KI-Sätze | 4–8 Wörter, Präsens | 5–12 Wörter, einfache Nebensätze | 8–16 Wörter, verschiedene Zeitformen |
  | Bewertung von Sätzen | sehr großzügig | fair | genau |

- **Lernkartei (Leitner-System):** Jede Vokabel liegt in einem von 6 Fächern.
  Richtig → ein Fach weiter, längere Pause (1, 2, 4, 8, 16, 32 Tage).
  Falsch → zurück in Fach 1 und **sofort wieder fällig**. In derselben Runde kommt sie nach 3 anderen Karten noch einmal dran.
  Vokabeln, die schon oft falsch waren, kommen auch nach richtigen Antworten früher wieder.
- **Mehrere Bedeutungen:** Eine richtige Bedeutung reicht. Gibt es weitere (z. B. „domina – die Herrin, die Dame“), kommt das Wort nach ein paar anderen Karten noch einmal: „Nenne eine weitere Bedeutung“.
- **Grammatik** (z. B. „m“, „Adv.“, „Präp. m. Akk.“, Stammformen) wird erst nach der Antwort zusammen mit der Lösung aufgedeckt.
- **Lektionen:** Beim Import fragt die App, ob die Seiten/Fotos Lektionen zugeordnet werden sollen. Beim Üben (und beim Sätze-Übersetzen) lassen sich dann einzelne Lektionen gezielt auswählen. Neue Vokabeln kommen zufällig aus dem ganzen ausgewählten Vorrat.
- **Vokabeln korrigieren:** In der Vokabelliste antippen – oder während der Abfrage über „✏️ Vokabel korrigieren“.
- **Timer:** Beim Üben ist ein Timer mit 15 Minuten vorgelegt (in 5-Minuten-Schritten verlängerbar, abschaltbar). Es kommen so lange Vokabeln, bis die Zeit um ist.
- **Daumen hoch/runter:** 👍 oder 👎 nach jeder Antwort und als Gesamtergebnis am Ende der Runde.
- **Drei Abfragearten:** Eintippen (tolerant bei Groß/Klein, Umlauten, Artikeln, „to“, kleinen Tippfehlern; bei mehreren Bedeutungen reicht eine), Auswählen (Multiple Choice) und Karteikarte (aufdecken und selbst einschätzen).
- **Import aus Fotos, Kamera und PDFs:** Die Texterkennung läuft auf dem Gerät. Vokabeltabellen aus Schulbüchern (auch abfotografiert, mit Grammatik-Spalte, Beispielsätzen und Merkhilfen) werden automatisch in Wort, Übersetzung und Grammatik zerlegt. Vor dem Speichern kann man alles prüfen und korrigieren.
- **Handschrift** (z. B. ein Vokabelheft): Die Texterkennung auf dem Gerät kann Handschrift nicht lesen. Die App erkennt das und bietet stattdessen an: **„Mit Claude lesen“** (zuverlässig, ca. 1–2 Cent pro Seite) oder kostenlos die **Texterkennung des iPhones** (Text im Foto gedrückt halten → „Alles auswählen“ → „Kopieren“ → in der App unter „Text einfügen“ einsetzen; auch spaltenweise kopierter Text wird richtig zugeordnet). Textdateien mit „Wort – Übersetzung“ pro Zeile lassen sich ebenfalls importieren.
- **Sätze übersetzen** (Latein → Deutsch, Englisch in beide Richtungen), zwei Quellen:
  - **📖 Aus dem Buch:** Beispielsätze werden beim Import der Buchseiten automatisch mit übernommen (ohne KI, kostenlos). Die Antwort wird mit der Lösung aus dem Buch verglichen (Wortstellung und kleine Fehler egal); bei Abweichungen zeigt die App die Buchlösung und man schätzt mit 👍/👎 selbst ein – oder Claude bewertet, wenn eingerichtet. Falsch übersetzte Sätze kommen öfter dran.
  - **🤖 Neue von der KI:** Claude bildet neue Sätze mit den eigenen Vokabeln (bevorzugt die, die noch nicht sitzen) und bewertet die Übersetzung.
- **Erfolgskontrolle:** Serie (Tage in Folge), Trefferquote, Aktivität der letzten 14 Tage, Verteilung auf die Fächer der Lernkartei, Liste der häufigsten Fehler. Nach jeder Runde gibt es Sterne und die Liste der falschen Vokabeln.
- Englische Wörter können vorgelesen werden.

### KI (optional)

Ohne KI funktionieren Abfrage, Import per Texterkennung und Statistik. Für das **Übersetzen von Sätzen** und eine
bessere Erkennung unübersichtlicher Seiten braucht es **Claude**:

1. Auf <https://platform.claude.com> ein Konto anlegen, ein kleines Guthaben aufladen und ein **Ausgabenlimit** setzen.
2. Einen API-Schlüssel erstellen und in der App unter **Einstellungen** eintragen.

Sätze bilden und bewerten übernimmt das kleine, sehr günstige Modell Claude Haiku 5.5 (eine Runde mit 5 Sätzen kostet weniger als 0,1 Cent). Nur das Lesen von Fotos/Handschrift nutzt das große Modell Claude Opus 5.5. Der Schlüssel bleibt nur auf dem jeweiligen Gerät.
(Die Swift-App kann auf neueren Geräten mit iOS/iPadOS 26 stattdessen auch Apple Intelligence nutzen, kostenlos und offline.)

---

## Sicherheit und Eltern-Code

- **Eltern-Code (Einstellungen → 🔒):** Lernstand und Statistik zurücksetzen, Listen, Vokabeln, Sätze oder Kinder löschen und eine Sicherung laden geht nur mit dem Code (4–8 Ziffern). Er wird beim ersten Löschen festgelegt, falls noch keiner existiert. Gespeichert wird nur ein Prüfwert (SHA-256 mit Zufallssalz). Nach 3 Fehlversuchen wird die Eingabe 1, 2, 4 … Minuten gesperrt. Nach richtiger Eingabe wird 5 Minuten lang nicht erneut gefragt.
- **Grenze:** Alle Daten liegen im Browser des Geräts. Wer in den iPhone-Einstellungen die Website-Daten von Safari löscht, löscht alles, auch ohne Code. Dagegen hilft die **Bildschirmzeit** von iOS (Einschränkungen, Code für Einstellungen). Den Eltern-Code bitte gut merken. Ohne ihn hilft nur: Sicherung speichern (geht ohne Code), Website-Daten löschen, Sicherung wieder laden. Der Code ist nicht Teil der Sicherung.
- **Content Security Policy** (in `index.html`): Die App darf nur eigene Dateien, Texterkennung/PDF-Leser von cdn.jsdelivr.net (feste Versionen) und die Claude-API laden. Eingeschleuster Code kann den API-Schlüssel so nicht nach außen schicken. (`'unsafe-eval'` ist nötig, weil Safari sonst die Texterkennung – WebAssembly – blockiert.)
- **Sicherungsdateien werden geprüft:** Nur bekannte Felder mit passenden Werten werden übernommen. Eine manipulierte Datei kann keinen Code einschleusen.
- **Claude-Schlüssel:** Er bleibt auf dem Gerät und ist nicht in der Sicherung. Bitte bei platform.claude.com ein **monatliches Ausgabenlimit** setzen und den Schlüssel sofort löschen, falls das Gerät verloren geht.
- **GitHub:** Der Veröffentlichungs-Workflow hat nur die nötigen Rechte. Im Repository sollte nie ein Schlüssel oder Foto der Kinder landen.

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
  js/platform.js        Browser oder installierte App? (Pfade, native Funktionen)
  js/ai.js              Anbindung an Claude
  js/views/*.js         Die einzelnen Seiten
  tests/                Automatische Tests
```

---

## Installierbare App für Android und iPhone (Ordner `app/`)

Die Web-App wird mit [Capacitor](https://capacitorjs.com) in eine echte App verpackt. Es gibt **eine** Codebasis:
Jede Änderung in `web/` landet beim nächsten Bau automatisch auch in der App.

Unterschiede zur Web-App:
- **Offline-Import:** Texterkennung, PDF-Leser und Sprachdaten (Englisch, Deutsch, Latein) liegen mit im App-Paket (ca. 16 MB). Nur Claude braucht Internet.
- **Sicherung:** Die Datei wird über „Teilen“ gespeichert (Dateien, iCloud, Google Drive, Mail).
- **Android-Zurück-Taste:** Sie schließt erst Dialoge oder die Übungsrunde und geht dann zurück.
- **Strengere Sicherheitsregeln:** Ohne CDN darf die App nur noch mit der Claude-API sprechen.
- **Eigene Daten:** Die App hat einen eigenen Speicher, getrennt von Safari bzw. Chrome. Umziehen geht mit **Sicherung speichern → in der App „Sicherung laden“**.

### Android: APK bauen lassen und installieren (geht ohne eigenen Rechner)

1. Auf github.com im Repository **Actions → „App bauen (Android/iOS)“** öffnen. Läuft nichts, auf **„Run workflow“** tippen.
2. Nach etwa 5–10 Minuten den grünen Lauf öffnen und unten unter **Artifacts** die Datei **Vokabeltrainer-Android** herunterladen. Das ist eine ZIP-Datei mit `app-debug.apk`.
3. Die APK auf das Android-Gerät bringen und öffnen. Android fragt einmal, ob Apps aus dieser Quelle installiert werden dürfen: erlauben.

Am Windows-PC geht es auch mit **Android Studio**:
```
cd app
npm install
npm run android
npx cap open android
```
Danach in Android Studio auf ▶ tippen (Gerät per USB oder Emulator).

### iPhone

- **Jetzt schon:** die Web-App über Safari → Teilen → **„Zum Home-Bildschirm“**. Sie verhält sich wie eine App.
- **Als echte App** braucht Apple ein **Apple-Developer-Konto** (99 € pro Jahr) und eine Signatur. Ohne Mac geht das über einen Cloud-Bau: die GitHub-Actions-macOS-Maschine dieses Workflows mit hinterlegten Zertifikaten, oder ein Dienst wie Codemagic. Dann kommt die App per **TestFlight** auf die Familien-iPhones.
- Der Workflow prüft schon jetzt bei jeder Änderung, ob das iOS-Projekt baut.

### Später in die Stores (Checkliste)

- **App-ID** `de.koerbers.vokabeltrainer` in `app/capacitor.config.json`. Vor der ersten Veröffentlichung endgültig festlegen, danach nicht mehr ändern.
- **Google Play:**
  - Entwicklerkonto (einmalig 25 $),
  - Signaturschlüssel als GitHub-Secret, `./gradlew bundleRelease` (AAB),
  - Datenschutzerklärung und Angaben zur Datensicherheit,
  - da Kinder die Zielgruppe sind: die Families-Richtlinien beachten.
- **App Store:**
  - Apple-Developer-Konto, Signatur, TestFlight,
  - Datenschutzangaben,
  - bei der Kategorie „Kinder“ besonders strenge Regeln (z. B. keine Links nach außen ohne Eltern-Schranke). Der Link zu platform.claude.com müsste dann hinter den Eltern-Code.
- **Daten:**
  - Die App speichert lokal. Es gibt keine Konten und keine Werbung.
  - Nur wenn ein Claude-Schlüssel eingetragen ist, gehen Fotos oder Vokabeln zur Auswertung an Anthropic. Das gehört in die Datenschutzerklärung.

### Aufbau

```
app/
  package.json            Capacitor und die Bibliotheken für Offline-Texterkennung (feste Versionen)
  capacitor.config.json   App-ID, Name, Einstellungen
  assets/                 App-Symbol und Startbild (erzeugt mit scripts/make-icons.py)
  scripts/build-www.mjs   web/ → www/ kopieren, Texterkennung/PDF-Leser nach www/vendor/
  scripts/native.mjs      Android-/iOS-Projekt erzeugen, Symbole, Kamera-Begründung (iOS), Dateien kopieren
```
Die Ordner `android/`, `ios/` und `www/` werden bei jedem Bau neu erzeugt und nicht eingecheckt.

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
