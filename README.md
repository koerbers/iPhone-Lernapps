# iPhone-Lernapps – Vokabeltrainer

Lernapp für Englisch und Latein (SwiftUI, iOS 17+).

## Was die App kann

| Funktion | Englisch | Latein |
|---|---|---|
| Vokabeln abfragen | Englisch → Deutsch **und** Deutsch → Englisch | Latein → Deutsch |
| Sätze übersetzen (von der KI gebildet) | in beide Richtungen | Latein → Deutsch |
| Vorlesen der Aussprache | ✅ | – |

- **Lernkartei (Leitner-System):** Jede Vokabel liegt in einem von 6 Fächern.
  Richtig → ein Fach weiter, längere Pause (1, 2, 4, 8, 16, 32 Tage).
  Falsch → zurück in Fach 1 und **sofort wieder fällig**. In derselben Runde kommt sie nach 3 anderen Karten noch einmal dran.
  Vokabeln, die schon oft falsch waren, kommen auch nach richtigen Antworten früher wieder.
- **Drei Abfragearten:** Eintippen (tolerant bei Groß/Klein, Umlauten, Artikeln, „to“, kleinen Tippfehlern), Auswählen (Multiple Choice), Karteikarte (aufdecken und selbst einschätzen).
- **Import aus Fotos, Kamera-Scan, PDFs oder Text:** Die Texterkennung läuft auf dem iPhone. Optional sortiert eine KI Wörter und Übersetzungen richtig zu. Vor dem Speichern kann man alles prüfen und korrigieren („Spalten tauschen“, Zeilen abwählen).
- **Satzübersetzung:** Die KI bildet kurze, kindgerechte Sätze mit den eigenen Vokabeln (bevorzugt die, die noch nicht so gut sitzen), bewertet die Übersetzung und gibt Feedback.
- **Erfolgskontrolle (Tab „Erfolge“):** Serie (Tage in Folge), Trefferquote, Aktivität der letzten 14 Tage, Verteilung auf die Fächer der Lernkartei, Sorgenkinder-Liste der häufigsten Fehler, Statistik der Satzübersetzungen. Nach jeder Runde gibt es Sterne und eine Liste der falschen Vokabeln.

## KI: zwei Möglichkeiten (in den Einstellungen)

1. **Apple Intelligence** – kostenlos, offline, direkt auf dem iPhone. Braucht iOS 26 und ein iPhone 15 Pro oder neuer. Für Englisch gut, für Latein eher schwach.
2. **Claude** – braucht Internet und einen API-Schlüssel von <https://platform.claude.com> (Abrechnung pro Nutzung, eine Übungsrunde kostet nur wenige Cent; am besten ein kleines Guthaben-Limit setzen). Liest Fotos und PDFs direkt und ist bei Latein deutlich besser. Der Schlüssel wird im Schlüsselbund des iPhones gespeichert.

Ohne KI funktionieren Abfrage, Import (einfache Erkennung nach Spalten/Trennzeichen wie `house – Haus`) und Statistik trotzdem, nur die Satzübersetzung braucht eine KI.

## App auf das iPhone bringen

Ihr braucht einen Mac mit **Xcode 26** (kostenlos im Mac App Store). Ein normales Apple-Konto reicht, ein kostenpflichtiger Entwickler-Account ist nicht nötig.

1. Repository klonen und `VokabelTrainer.xcodeproj` öffnen.
2. In Xcode links das Projekt anklicken → Target **VokabelTrainer** → **Signing & Capabilities** → bei *Team* euer Apple-Konto auswählen (ggf. über *Add an Account…* anmelden). Falls Xcode meckert, die *Bundle Identifier* auf etwas Eigenes ändern, z. B. `de.euername.VokabelTrainer`.
3. iPhone per Kabel anschließen, oben in Xcode als Ziel auswählen und auf ▶︎ drücken.
4. Auf dem iPhone beim ersten Mal: *Einstellungen → Datenschutz & Sicherheit → Entwicklermodus* einschalten und unter *Allgemein → VPN & Geräteverwaltung* dem Entwickler vertrauen.

Hinweis: Mit einem kostenlosen Apple-Konto läuft die App 7 Tage, danach einfach erneut aus Xcode starten (die Vokabeln bleiben erhalten). Mit dem Apple Developer Program (99 €/Jahr) ein Jahr bzw. über TestFlight.

Zum Ausprobieren ohne iPhone: in Xcode einen Simulator wählen und ▶︎ drücken. Unit-Tests: `⌘U`.

## Projektaufbau

```
VokabelTrainer/
  App/            Einstieg, Tabs, Beispielvokabeln
  Models/         Datenmodell (SwiftData): Listen, Karten, Abfrage-Protokoll
  Logic/          Lernkartei, Antwortprüfung, Vokabel-Erkennung, Statistik, Übungsrunde
  Services/       Texterkennung (Vision/PDFKit), Vorlesen, Schlüsselbund
  Services/AI/    KI-Schnittstelle, Apple Intelligence, Claude
  Views/          Oberflächen: Lernen, Vokabeln, Import, Erfolge, Einstellungen
VokabelTrainerTests/  Tests für Antwortprüfung, Erkennung und Lernkartei
```

## Ideen zum Weiterbauen (gemeinsames Projekt)

Gute Einstiegsaufgaben, bei denen man schnell ein Ergebnis sieht:

- **Eigenes App-Icon** malen (1024 × 1024 px) und in `Assets.xcassets/AppIcon` ziehen.
- **Lob-Sprüche** in `SessionResultView.swift` ändern oder erweitern.
- **Pausen der Lernkartei** in `SpacedRepetition.swift` (`intervalDays`) anpassen und beobachten, was passiert.
- **Neue Tests** in `VokabelTrainerTests/LogicTests.swift` schreiben: Welche Antworten sollen noch als richtig gelten?
- Fortgeschritten: Tagesziel mit Fortschrittsring, Abzeichen („100 Vokabeln gemeistert“), Erinnerung per Mitteilung, Sync über iCloud, Formen-Training für lateinische Verben.
