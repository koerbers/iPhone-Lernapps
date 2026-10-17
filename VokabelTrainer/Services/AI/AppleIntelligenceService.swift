#if canImport(FoundationModels)
import Foundation
import FoundationModels

// Apple Intelligence läuft komplett auf dem iPhone (kostenlos, offline).
// Voraussetzung: iOS 26 und ein Gerät mit Apple Intelligence (iPhone 15 Pro oder neuer).

@available(iOS 26.0, *)
@Generable
struct GeneratedVocabPair {
    @Guide(description: "Wort oder Ausdruck in der Fremdsprache, inklusive Grammatikangaben")
    var term: String
    @Guide(description: "Deutsche Bedeutung, mehrere Bedeutungen durch Komma getrennt")
    var translation: String
}

@available(iOS 26.0, *)
@Generable
struct GeneratedVocabList {
    var pairs: [GeneratedVocabPair]
}

@available(iOS 26.0, *)
@Generable
struct GeneratedSentence {
    @Guide(description: "Der Satz, den das Kind übersetzen soll")
    var prompt: String
    @Guide(description: "Musterübersetzung")
    var solution: String
}

@available(iOS 26.0, *)
@Generable
struct GeneratedSentenceList {
    var sentences: [GeneratedSentence]
}

@available(iOS 26.0, *)
@Generable
struct GeneratedGrade {
    @Guide(description: "true, wenn die Übersetzung im Wesentlichen richtig ist")
    var correct: Bool
    @Guide(description: "Kurzes, ermutigendes Feedback auf Deutsch an das Kind")
    var feedback: String
    @Guide(description: "Die richtiggestellte Übersetzung")
    var correctedTranslation: String
}

@available(iOS 26.0, *)
struct AppleIntelligenceService: LearningAI {
    var name: String { "Apple Intelligence" }

    static var isAvailable: Bool {
        if case .available = SystemLanguageModel.default.availability { return true }
        return false
    }

    func extractVocabulary(from payload: ImportPayload, subject: Subject) async throws -> [WordPair] {
        // Das Modell auf dem Gerät hat ein kleines Kontextfenster → Text in Stücken verarbeiten.
        var result: [WordPair] = []
        for chunk in Self.chunks(of: payload.text, maxCharacters: 1800) {
            let session = LanguageModelSession(instructions: Prompts.extractionInstructions(subject: subject))
            let response = try await session.respond(
                to: "Material:\n\(chunk)",
                generating: GeneratedVocabList.self
            )
            result += response.content.pairs.map { WordPair(term: $0.term, translation: $0.translation) }
        }
        return result
    }

    func makeSentences(words: [WordHint], subject: Subject, direction: Direction, count: Int) async throws -> [SentenceExercise] {
        let session = LanguageModelSession(instructions: Prompts.sentenceInstructions(subject: subject, direction: direction))
        let response = try await session.respond(
            to: Prompts.sentenceRequest(words: words, count: count),
            generating: GeneratedSentenceList.self
        )
        return response.content.sentences.map { SentenceExercise(prompt: $0.prompt, solution: $0.solution) }
    }

    func grade(exercise: SentenceExercise, answer: String, subject: Subject, direction: Direction) async throws -> SentenceGrade {
        let session = LanguageModelSession(instructions: Prompts.gradingInstructions(subject: subject, direction: direction))
        let response = try await session.respond(
            to: Prompts.gradingRequest(exercise: exercise, answer: answer),
            generating: GeneratedGrade.self
        )
        let g = response.content
        return SentenceGrade(correct: g.correct, feedback: g.feedback, correctedTranslation: g.correctedTranslation)
    }

    static func chunks(of text: String, maxCharacters: Int) -> [String] {
        var chunks: [String] = []
        var current = ""
        for line in text.components(separatedBy: .newlines) {
            if current.count + line.count > maxCharacters, !current.isEmpty {
                chunks.append(current)
                current = ""
            }
            current += line + "\n"
        }
        if !current.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { chunks.append(current) }
        return chunks
    }
}
#endif
