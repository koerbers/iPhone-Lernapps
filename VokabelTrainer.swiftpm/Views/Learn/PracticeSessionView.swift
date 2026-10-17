import SwiftData
import SwiftUI

struct PracticeSessionView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var session: PracticeSession
    let mode: PracticeMode
    let distractors: [Direction: [String]]

    @State private var input = ""
    @State private var result: AnswerResult?
    @State private var revealed = false
    @State private var choices: [String] = []
    @State private var pickedChoice: String?
    @FocusState private var inputFocused: Bool

    init(session: PracticeSession, mode: PracticeMode, distractors: [Direction: [String]]) {
        _session = State(initialValue: session)
        self.mode = mode
        self.distractors = distractors
    }

    var body: some View {
        NavigationStack {
            Group {
                if let item = session.current {
                    question(item)
                        .id(item.id)
                } else {
                    SessionResultView(
                        correct: session.firstTryCorrect,
                        total: session.firstTryTotal,
                        missed: session.missed.map { "\($0.term) – \($0.translation)" }
                    ) { dismiss() }
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Beenden") {
                        try? context.save()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .principal) {
                    if !session.isFinished {
                        ProgressView(value: session.progress)
                            .frame(width: 160)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Frage

    @ViewBuilder
    private func question(_ item: PracticeSession.Item) -> some View {
        let prompt = item.card.prompt(for: item.direction)
        let answer = item.card.answer(for: item.direction)

        ScrollView {
            VStack(spacing: 24) {
                Text(item.direction.label(for: session.subject))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.top, 24)

                if item.attempt > 0 {
                    Label("Noch einmal!", systemImage: "arrow.counterclockwise")
                        .font(.caption.bold())
                        .foregroundStyle(.orange)
                }

                VStack(spacing: 8) {
                    HStack {
                        Text(prompt)
                            .font(.largeTitle.bold())
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.5)
                        if session.subject == .english && item.direction == .foreignToGerman {
                            speakButton(prompt)
                        }
                    }
                    if !item.card.note.isEmpty {
                        Text(item.card.note).font(.callout).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))

                switch mode {
                case .typing: typingArea(item: item, answer: answer)
                case .choice: choiceArea(item: item, answer: answer)
                case .flashcard: flashcardArea(item: item, answer: answer)
                }
            }
            .padding()
        }
        .onAppear { prepare(item) }
    }

    private func speakButton(_ text: String) -> some View {
        Button {
            Speech.speakEnglish(text)
        } label: {
            Image(systemName: "speaker.wave.2.fill")
        }
        .buttonStyle(.bordered)
    }

    // MARK: Eintippen

    @ViewBuilder
    private func typingArea(item: PracticeSession.Item, answer: String) -> some View {
        TextField("Deine Antwort", text: $input)
            .textFieldStyle(.roundedBorder)
            .font(.title2)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .focused($inputFocused)
            .disabled(result != nil)
            .submitLabel(.done)
            .onSubmit { if result == nil { checkTyped(answer: answer) } }

        if let result {
            feedbackBox(result: result, answer: answer, item: item)
            HStack {
                if result == .wrong {
                    Button("Ich hatte recht") { next(correct: true) }
                        .buttonStyle(.bordered)
                }
                Button("Weiter") { next(correct: result.countsAsCorrect) }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .controlSize(.large)
        } else {
            HStack {
                Button("Weiß ich nicht") {
                    self.result = .wrong
                }
                .buttonStyle(.bordered)
                Button("Prüfen") { checkTyped(answer: answer) }
                    .buttonStyle(.borderedProminent)
                    .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .controlSize(.large)
        }
    }

    private func checkTyped(answer: String) {
        guard !input.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        result = AnswerChecker.check(input, expected: answer)
        Haptics.feedback(result!.countsAsCorrect)
    }

    // MARK: Auswählen

    @ViewBuilder
    private func choiceArea(item: PracticeSession.Item, answer: String) -> some View {
        VStack(spacing: 12) {
            ForEach(choices, id: \.self) { choice in
                Button {
                    guard pickedChoice == nil else { return }
                    pickedChoice = choice
                    result = choice == answer ? .correct : .wrong
                    Haptics.feedback(choice == answer)
                } label: {
                    Text(choice)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.bordered)
                .tint(tint(for: choice, answer: answer))
                .controlSize(.large)
            }
        }
        if let result {
            feedbackBox(result: result, answer: answer, item: item)
            Button("Weiter") { next(correct: result.countsAsCorrect) }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
    }

    private func tint(for choice: String, answer: String) -> Color {
        guard let picked = pickedChoice else { return .accentColor }
        if choice == answer { return .green }
        if choice == picked { return .red }
        return .gray
    }

    // MARK: Karteikarte

    @ViewBuilder
    private func flashcardArea(item: PracticeSession.Item, answer: String) -> some View {
        if revealed {
            Text(answer)
                .font(.title.bold())
                .multilineTextAlignment(.center)
                .foregroundStyle(.blue)
            if session.subject == .english && item.direction == .germanToForeign {
                speakButton(answer)
            }
            Text("Wusstest du es?").foregroundStyle(.secondary)
            HStack {
                Button {
                    next(correct: false)
                } label: {
                    Label("Nein", systemImage: "xmark").frame(maxWidth: .infinity)
                }
                .tint(.red)
                Button {
                    next(correct: true)
                } label: {
                    Label("Ja", systemImage: "checkmark").frame(maxWidth: .infinity)
                }
                .tint(.green)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        } else {
            Button("Aufdecken") { withAnimation { revealed = true } }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
    }

    // MARK: Gemeinsam

    @ViewBuilder
    private func feedbackBox(result: AnswerResult, answer: String, item: PracticeSession.Item) -> some View {
        VStack(spacing: 6) {
            switch result {
            case .correct:
                Text("Richtig! 🎉").font(.title2.bold()).foregroundStyle(.green)
            case .almost:
                Text("Fast richtig – kleiner Tippfehler 👍").font(.title3.bold()).foregroundStyle(.green)
            case .wrong:
                Text("Leider falsch").font(.title2.bold()).foregroundStyle(.red)
            }
            if result != .correct {
                Text("Lösung: \(answer)").font(.title3)
            }
            if session.subject == .english && item.direction == .germanToForeign {
                speakButton(answer)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background((result.countsAsCorrect ? Color.green : Color.red).opacity(0.12),
                    in: RoundedRectangle(cornerRadius: 16))
    }

    private func prepare(_ item: PracticeSession.Item) {
        input = ""
        result = nil
        revealed = false
        pickedChoice = nil
        if mode == .choice {
            let answer = item.card.answer(for: item.direction)
            let wrong = (distractors[item.direction] ?? []).filter { $0 != answer }.shuffled().prefix(3)
            choices = (Array(wrong) + [answer]).shuffled()
        }
        if mode == .typing {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { inputFocused = true }
        }
    }

    private func next(correct: Bool) {
        session.record(correct: correct, context: context)
    }
}

enum Haptics {
    static func feedback(_ success: Bool) {
        UINotificationFeedbackGenerator().notificationOccurred(success ? .success : .error)
    }
}
