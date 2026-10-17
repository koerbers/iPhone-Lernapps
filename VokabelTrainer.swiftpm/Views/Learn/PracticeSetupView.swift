import SwiftData
import SwiftUI

struct PracticeSetupView: View {
    let subject: Subject

    @Query(sort: \VocabList.createdAt) private var allLists: [VocabList]
    @AppStorage("sessionSize") private var sessionSize = 20
    @AppStorage("maxNewPerSession") private var maxNew = 10
    @AppStorage("practiceMode") private var modeRaw = PracticeMode.typing.rawValue

    @State private var selectedLists: Set<PersistentIdentifier> = []
    @State private var directionChoice: DirectionChoice = .both
    @State private var activeSession: ActiveSession?
    @State private var showNothingDue = false

    enum DirectionChoice: String, CaseIterable, Identifiable {
        case both, foreignToGerman, germanToForeign
        var id: String { rawValue }
    }

    struct ActiveSession: Identifiable {
        let id = UUID()
        let session: PracticeSession
        let mode: PracticeMode
        let distractors: [Direction: [String]]
    }

    private var lists: [VocabList] { allLists.filter { $0.subject == subject } }

    private var chosenLists: [VocabList] {
        selectedLists.isEmpty ? lists : lists.filter { selectedLists.contains($0.persistentModelID) }
    }

    private var directions: [Direction] {
        guard subject == .english else { return [.foreignToGerman] }
        switch directionChoice {
        case .both: return [.foreignToGerman, .germanToForeign]
        case .foreignToGerman: return [.foreignToGerman]
        case .germanToForeign: return [.germanToForeign]
        }
    }

    private var mode: PracticeMode { PracticeMode(rawValue: modeRaw) ?? .typing }

    var body: some View {
        let cards = chosenLists.flatMap(\.cards)
        let counts = SpacedRepetition.dueCount(cards: cards, directions: directions)

        Form {
            Section("Listen") {
                ForEach(lists) { list in
                    Button {
                        toggle(list)
                    } label: {
                        HStack {
                            Image(systemName: isSelected(list) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(isSelected(list) ? Color.accentColor : .secondary)
                            Text(list.name).foregroundStyle(.primary)
                            Spacer()
                            Text("\(list.cards.count)").foregroundStyle(.secondary)
                        }
                    }
                }
                if !selectedLists.isEmpty {
                    Button("Alle Listen verwenden") { selectedLists.removeAll() }
                }
            }

            if subject == .english {
                Section("Richtung") {
                    Picker("Richtung", selection: $directionChoice) {
                        Text("Beide").tag(DirectionChoice.both)
                        Text("EN → DE").tag(DirectionChoice.foreignToGerman)
                        Text("DE → EN").tag(DirectionChoice.germanToForeign)
                    }
                    .pickerStyle(.segmented)
                }
            } else {
                Section("Richtung") {
                    Label("Latein → Deutsch", systemImage: "arrow.right")
                }
            }

            Section("Abfrageart") {
                Picker("Abfrageart", selection: $modeRaw) {
                    ForEach(PracticeMode.allCases) { m in
                        Label(m.title, systemImage: m.icon).tag(m.rawValue)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            Section {
                LabeledContent("Fällig", value: "\(counts.due)")
                LabeledContent("Neu", value: "\(counts.new)")
                Button {
                    start(cards: cards, fillWithWeak: false)
                } label: {
                    Label("Fällige Vokabeln üben", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(cards.isEmpty)

                Button {
                    start(cards: cards, fillWithWeak: true)
                } label: {
                    Label("Freies Training (schwächste zuerst)", systemImage: "dumbbell")
                        .frame(maxWidth: .infinity)
                }
                .disabled(cards.isEmpty)
            } footer: {
                Text("Richtig beantwortete Vokabeln kommen erst nach einer Pause wieder (1, 2, 4, 8, 16, 32 Tage). Falsche Vokabeln kommen sofort wieder dran – auch noch in derselben Runde.")
            }
        }
        .navigationTitle("\(subject.flag) \(subject.displayName) üben")
        .fullScreenCover(item: $activeSession) { active in
            PracticeSessionView(session: active.session, mode: active.mode, distractors: active.distractors)
        }
        .alert("Alles erledigt! 🎉", isPresented: $showNothingDue) {
            Button("Freies Training") { start(cards: cards, fillWithWeak: true) }
            Button("OK", role: .cancel) {}
        } message: {
            Text("Gerade ist keine Vokabel fällig. Du kannst trotzdem frei trainieren.")
        }
    }

    private func isSelected(_ list: VocabList) -> Bool {
        selectedLists.isEmpty || selectedLists.contains(list.persistentModelID)
    }

    private func toggle(_ list: VocabList) {
        let id = list.persistentModelID
        if selectedLists.isEmpty {
            selectedLists = [id]
        } else if selectedLists.contains(id) {
            selectedLists.remove(id)
        } else {
            selectedLists.insert(id)
        }
    }

    private func start(cards: [Card], fillWithWeak: Bool) {
        let candidates = SpacedRepetition.buildSession(
            cards: cards,
            directions: directions,
            size: sessionSize,
            maxNew: maxNew,
            fillWithWeak: fillWithWeak
        )
        guard !candidates.isEmpty else {
            showNothingDue = true
            return
        }
        // Falsche Antwortmöglichkeiten für „Auswählen“ aus allen Vokabeln des Fachs
        let pool = lists.flatMap(\.cards)
        var distractors: [Direction: [String]] = [:]
        for d in directions {
            distractors[d] = Array(Set(pool.map { $0.answer(for: d) }))
        }
        activeSession = ActiveSession(
            session: PracticeSession(subject: subject, candidates: candidates),
            mode: mode,
            distractors: distractors
        )
    }
}
