import SwiftData
import SwiftUI

struct SettingsView: View {
    @Environment(\.modelContext) private var context
    @Query private var cards: [Card]
    @Query private var logs: [ReviewLog]

    @AppStorage("learnerName") private var learnerName = ""
    @AppStorage("sessionSize") private var sessionSize = 20
    @AppStorage("maxNewPerSession") private var maxNew = 10
    @AppStorage(AIServiceFactory.providerKey) private var providerRaw = AIServiceFactory.Provider.automatic.rawValue

    @State private var apiKey = ""
    @State private var showResetConfirm = false
    @State private var testResult: String?
    @State private var isTesting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Lernende/r") {
                    TextField("Vorname", text: $learnerName)
                }

                Section {
                    Stepper("Abfragen pro Runde: \(sessionSize)", value: $sessionSize, in: 5...60, step: 5)
                    Stepper("Neue Vokabeln pro Runde: \(maxNew)", value: $maxNew, in: 0...30)
                } header: {
                    Text("Üben")
                } footer: {
                    Text("Fällige Vokabeln haben immer Vorrang. Neue kommen nur dazu, wenn noch Platz in der Runde ist.")
                }

                Section {
                    Picker("KI", selection: $providerRaw) {
                        ForEach(AIServiceFactory.Provider.allCases) { p in
                            Text(p.title).tag(p.rawValue)
                        }
                    }
                    LabeledContent("Apple Intelligence",
                                   value: AIServiceFactory.isAppleIntelligenceAvailable ? "verfügbar ✅" : "nicht verfügbar")
                    SecureField("Claude-API-Schlüssel (sk-ant-…)", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(saveKey)
                    HStack {
                        Button("Schlüssel speichern", action: saveKey)
                        Spacer()
                        Button {
                            Task { await testAI() }
                        } label: {
                            if isTesting { ProgressView() } else { Text("KI testen") }
                        }
                    }
                    .buttonStyle(.borderless)
                    if let testResult {
                        Text(testResult).font(.caption)
                    }
                } header: {
                    Text("Künstliche Intelligenz")
                } footer: {
                    Text("Die KI hilft beim Erkennen von Vokabeln aus Fotos/PDFs und bildet Übungssätze. Apple Intelligence läuft kostenlos auf dem iPhone (iPhone 15 Pro oder neuer, iOS 26). Claude braucht Internet und einen API-Schlüssel von platform.claude.com (kostet pro Nutzung ein paar Cent) und ist bei Latein deutlich besser. „Automatisch“ nimmt Claude, wenn ein Schlüssel eingetragen ist, sonst Apple Intelligence.")
                }

                Section("Daten") {
                    LabeledContent("Vokabeln", value: "\(cards.count)")
                    LabeledContent("Abfragen insgesamt", value: "\(logs.count)")
                    Button("Beispielvokabeln hinzufügen") { SampleData.insert(into: context) }
                    Button("Gesamten Lernstand zurücksetzen", role: .destructive) { showResetConfirm = true }
                }
            }
            .navigationTitle("Einstellungen")
            .onAppear { apiKey = Keychain.get(AIServiceFactory.claudeKeychainKey) ?? "" }
            .confirmationDialog("Wirklich alles zurücksetzen?", isPresented: $showResetConfirm, titleVisibility: .visible) {
                Button("Lernstand und Statistik löschen", role: .destructive) {
                    cards.forEach { $0.resetProgress() }
                    logs.forEach { context.delete($0) }
                    try? context.save()
                }
            } message: {
                Text("Die Vokabeln bleiben erhalten, aber alle gelten wieder als neu und die Statistik wird gelöscht.")
            }
        }
    }

    private func saveKey() {
        Keychain.set(apiKey.trimmingCharacters(in: .whitespacesAndNewlines), for: AIServiceFactory.claudeKeychainKey)
        testResult = apiKey.isEmpty ? "Schlüssel entfernt." : "Schlüssel gespeichert."
    }

    private func testAI() async {
        saveKey()
        guard let ai = AIServiceFactory.current() else {
            testResult = LearningAIError.notConfigured.localizedDescription
            return
        }
        isTesting = true
        defer { isTesting = false }
        do {
            let sentences = try await ai.makeSentences(
                words: [WordHint(term: "dog", translation: "Hund")],
                subject: .english, direction: .foreignToGerman, count: 1
            )
            testResult = "✅ \(ai.name) funktioniert: „\(sentences.first?.prompt ?? "")“"
        } catch {
            testResult = "❌ \(error.localizedDescription)"
        }
    }
}
