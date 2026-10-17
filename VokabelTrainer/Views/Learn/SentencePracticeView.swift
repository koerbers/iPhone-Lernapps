import SwiftData
import SwiftUI

/// Auswahl für das Satz-Training.
struct SentenceSetupView: View {
    let subject: Subject

    @Query(sort: \VocabList.createdAt) private var allLists: [VocabList]
    @State private var direction: Direction = .foreignToGerman
    @State private var listID: PersistentIdentifier?
    @State private var count = 5
    @State private var started: StartedRound?

    struct StartedRound: Identifiable {
        let id = UUID()
        let words: [WordHint]
        let direction: Direction
        let count: Int
    }

    private var lists: [VocabList] { allLists.filter { $0.subject == subject } }

    var body: some View {
        Form {
            Section {
                Picker("Vokabeln aus", selection: $listID) {
                    Text("Allen Listen").tag(PersistentIdentifier?.none)
                    ForEach(lists) { list in
                        Text(list.name).tag(Optional(list.persistentModelID))
                    }
                }
                if subject == .english {
                    Picker("Richtung", selection: $direction) {
                        Text("EN → DE").tag(Direction.foreignToGerman)
                        Text("DE → EN").tag(Direction.germanToForeign)
                    }
                    .pickerStyle(.segmented)
                } else {
                    Label("Latein → Deutsch", systemImage: "arrow.right")
                }
                Stepper("Anzahl Sätze: \(count)", value: $count, in: 3...10)
            } footer: {
                Text("Die KI bildet neue Sätze mit deinen Vokabeln – bevorzugt mit denen, die noch nicht so gut sitzen.")
            }

            Section {
                Button {
                    start()
                } label: {
                    Label("Los geht's", systemImage: "play.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(lists.flatMap(\.cards).isEmpty)
            }

            if AIServiceFactory.current() == nil {
                Section {
                    Label("Für Sätze wird eine KI benötigt. Bitte in den Einstellungen Apple Intelligence wählen oder einen Claude-Schlüssel eintragen.",
                          systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("Sätze übersetzen")
        .fullScreenCover(item: $started) { round in
            SentencePracticeView(subject: subject, direction: round.direction, words: round.words, count: round.count)
        }
    }

    private func start() {
        let source = listID.flatMap { id in lists.first { $0.persistentModelID == id } }.map { [$0] } ?? lists
        let cards = source.flatMap(\.cards)
        let words = Self.pickWords(from: cards, direction: direction, max: 12)
        started = StartedRound(words: words, direction: subject == .latin ? .foreignToGerman : direction, count: count)
    }

    /// Wählt Vokabeln für die Sätze: bereits geübte, schwache Vokabeln bevorzugt.
    static func pickWords(from cards: [Card], direction: Direction, max: Int) -> [WordHint] {
        let practiced = cards.filter { $0.state(direction).box > 0 }
        let pool = practiced.count >= 4 ? practiced : cards
        // Etwas Zufall, damit nicht immer dieselben Wörter drankommen
        let scored = pool.map { ($0, SpacedRepetition.priority($0.state(direction)) + Double.random(in: 0...3)) }
        return scored
            .sorted { $0.1 > $1.1 }
            .prefix(max)
            .map { WordHint(term: $0.0.term, translation: $0.0.translation) }
    }
}

/// Eine Runde Satzübersetzungen.
struct SentencePracticeView: View {
    let subject: Subject
    let direction: Direction
    let words: [WordHint]
    let count: Int

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var exercises: [SentenceExercise] = []
    @State private var index = 0
    @State private var answer = ""
    @State private var grade: SentenceGrade?
    @State private var needsSelfCheck = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var correctCount = 0
    @State private var missed: [String] = []

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && exercises.isEmpty {
                    ProgressView("Sätze werden erstellt …")
                } else if let errorMessage, exercises.isEmpty {
                    ContentUnavailableView {
                        Label("Das hat nicht geklappt", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("Nochmal versuchen") { Task { await load() } }
                    }
                } else if index < exercises.count {
                    exerciseView(exercises[index])
                        .id(exercises[index].id)
                } else {
                    SessionResultView(correct: correctCount, total: exercises.count, missed: missed) { dismiss() }
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Beenden") { dismiss() }
                }
                ToolbarItem(placement: .principal) {
                    if !exercises.isEmpty && index < exercises.count {
                        Text("Satz \(index + 1) von \(exercises.count)").font(.headline)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { if exercises.isEmpty { await load() } }
    }

    private func exerciseView(_ exercise: SentenceExercise) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Übersetze ins \(direction.targetLanguage(for: subject))e:")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                HStack(alignment: .top) {
                    Text(exercise.prompt)
                        .font(.title2.bold())
                    Spacer()
                    if subject == .english && direction == .foreignToGerman {
                        Button { Speech.speakEnglish(exercise.prompt) } label: {
                            Image(systemName: "speaker.wave.2.fill")
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                TextField("Deine Übersetzung", text: $answer, axis: .vertical)
                    .lineLimit(3...6)
                    .textFieldStyle(.roundedBorder)
                    .font(.title3)
                    .disabled(grade != nil || needsSelfCheck)

                if let grade {
                    gradeView(grade, exercise: exercise)
                } else if needsSelfCheck {
                    selfCheckView(exercise)
                } else {
                    Button {
                        Task { await check(exercise) }
                    } label: {
                        if isLoading {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Prüfen").frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(answer.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
                }
            }
            .padding()
        }
    }

    private func gradeView(_ grade: SentenceGrade, exercise: SentenceExercise) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(grade.correct ? "Richtig! 🎉" : "Noch nicht ganz")
                .font(.title2.bold())
                .foregroundStyle(grade.correct ? .green : .orange)
            Text(grade.feedback)
            if !grade.correct {
                Text("So wäre es richtig:").font(.headline)
                Text(grade.correctedTranslation)
            }
            Text("Musterlösung: \(exercise.solution)")
                .font(.callout)
                .foregroundStyle(.secondary)
            Button("Weiter") { advance() }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .frame(maxWidth: .infinity)
        }
        .padding()
        .background((grade.correct ? Color.green : Color.orange).opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
    }

    /// Falls die KI nicht bewerten kann: Musterlösung zeigen und selbst einschätzen.
    private func selfCheckView(_ exercise: SentenceExercise) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Musterlösung:").font(.headline)
            Text(exercise.solution).font(.title3)
            Text("War deine Übersetzung richtig?").foregroundStyle(.secondary)
            HStack {
                Button("Nein") { record(correct: false, exercise: exercise); advance() }
                    .tint(.red)
                Button("Ja") { record(correct: true, exercise: exercise); advance() }
                    .tint(.green)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
    }

    private func load() async {
        guard let ai = AIServiceFactory.current() else {
            errorMessage = LearningAIError.notConfigured.localizedDescription
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            exercises = try await ai.makeSentences(words: words, subject: subject, direction: direction, count: count)
            if exercises.isEmpty { errorMessage = "Es wurden keine Sätze erstellt." }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func check(_ exercise: SentenceExercise) async {
        // Exakt die Musterlösung? Dann ist keine KI nötig.
        if AnswerChecker.normalize(answer) == AnswerChecker.normalize(exercise.solution) {
            let g = SentenceGrade(correct: true, feedback: "Perfekt – genau wie die Musterlösung!", correctedTranslation: exercise.solution)
            grade = g
            record(correct: true, exercise: exercise)
            return
        }
        guard let ai = AIServiceFactory.current() else {
            needsSelfCheck = true
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let g = try await ai.grade(exercise: exercise, answer: answer, subject: subject, direction: direction)
            grade = g
            record(correct: g.correct, exercise: exercise)
            Haptics.feedback(g.correct)
        } catch {
            needsSelfCheck = true
        }
    }

    private func record(correct: Bool, exercise: SentenceExercise) {
        if correct { correctCount += 1 } else { missed.append("\(exercise.prompt) → \(exercise.solution)") }
        context.insert(ReviewLog(subject: subject, direction: direction, kind: .sentence, correct: correct, prompt: exercise.prompt))
        try? context.save()
    }

    private func advance() {
        answer = ""
        grade = nil
        needsSelfCheck = false
        index += 1
    }
}
