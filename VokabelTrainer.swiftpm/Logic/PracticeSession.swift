import Foundation
import Observation
import SwiftData

enum PracticeMode: String, CaseIterable, Identifiable {
    case typing, choice, flashcard

    var id: String { rawValue }

    var title: String {
        switch self {
        case .typing: return "Eintippen"
        case .choice: return "Auswählen"
        case .flashcard: return "Karteikarte"
        }
    }

    var icon: String {
        switch self {
        case .typing: return "keyboard"
        case .choice: return "list.bullet.circle"
        case .flashcard: return "rectangle.on.rectangle.angled"
        }
    }
}

/// Eine laufende Übungsrunde. Falsch beantwortete Vokabeln werden in derselben
/// Runde nach ein paar anderen Karten noch einmal abgefragt.
@Observable
@MainActor
final class PracticeSession {
    struct Item: Identifiable {
        let id = UUID()
        let card: Card
        let direction: Direction
        /// 0 = erste Abfrage in dieser Runde, danach Wiederholungen
        let attempt: Int
    }

    static let maxRepeatsPerRound = 2
    static let repeatGap = 3

    let subject: Subject
    private(set) var queue: [Item]
    private(set) var index = 0
    private(set) var firstTryCorrect = 0
    private(set) var firstTryTotal = 0
    private(set) var missed: [Card] = []

    init(subject: Subject, candidates: [SpacedRepetition.Candidate]) {
        self.subject = subject
        self.queue = candidates.map { Item(card: $0.card, direction: $0.direction, attempt: 0) }
    }

    var current: Item? { index < queue.count ? queue[index] : nil }
    var isFinished: Bool { current == nil }
    var progress: Double { queue.isEmpty ? 1 : Double(index) / Double(queue.count) }
    var remaining: Int { max(0, queue.count - index) }

    func record(correct: Bool, context: ModelContext) {
        guard let item = current else { return }

        // Nur die erste Antwort einer Runde verändert die Lernkartei.
        if item.attempt == 0 {
            firstTryTotal += 1
            if correct {
                firstTryCorrect += 1
            } else if !missed.contains(where: { $0 === item.card }) {
                missed.append(item.card)
            }
            let updated = SpacedRepetition.review(item.card.state(item.direction), correct: correct)
            item.card.setState(updated, for: item.direction)
            context.insert(ReviewLog(subject: subject,
                                     direction: item.direction,
                                     kind: .vocab,
                                     correct: correct,
                                     prompt: item.card.prompt(for: item.direction)))
        }

        if !correct && item.attempt < Self.maxRepeatsPerRound {
            let position = min(index + 1 + Self.repeatGap, queue.count)
            queue.insert(Item(card: item.card, direction: item.direction, attempt: item.attempt + 1), at: position)
        }

        index += 1
        if isFinished { try? context.save() }
    }
}
