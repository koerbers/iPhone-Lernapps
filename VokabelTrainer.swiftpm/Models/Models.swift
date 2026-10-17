import Foundation
import SwiftData

/// Das Fach, zu dem eine Vokabelliste gehört.
enum Subject: String, Codable, CaseIterable, Identifiable {
    case english
    case latin

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .english: return "Englisch"
        case .latin: return "Latein"
        }
    }

    var flag: String {
        switch self {
        case .english: return "🇬🇧"
        case .latin: return "🏛️"
        }
    }

    /// Englisch wird in beide Richtungen abgefragt, Latein nur Latein → Deutsch.
    var directions: [Direction] {
        switch self {
        case .english: return [.foreignToGerman, .germanToForeign]
        case .latin: return [.foreignToGerman]
        }
    }
}

/// Abfragerichtung.
enum Direction: String, Codable, CaseIterable, Identifiable {
    case foreignToGerman
    case germanToForeign

    var id: String { rawValue }

    func label(for subject: Subject) -> String {
        switch self {
        case .foreignToGerman: return "\(subject.displayName) → Deutsch"
        case .germanToForeign: return "Deutsch → \(subject.displayName)"
        }
    }

    func sourceLanguage(for subject: Subject) -> String {
        self == .foreignToGerman ? subject.displayName : "Deutsch"
    }

    func targetLanguage(for subject: Subject) -> String {
        self == .foreignToGerman ? "Deutsch" : subject.displayName
    }
}

/// Lernstand einer Karte in einer Richtung (Lernkartei nach Leitner).
struct ReviewState: Equatable {
    /// 0 = neu, 1 … `SpacedRepetition.maxBox` = Fach in der Lernkartei
    var box: Int
    var due: Date
    var correct: Int
    var wrong: Int
    var lastReviewed: Date?

    static let new = ReviewState(box: 0, due: .distantPast, correct: 0, wrong: 0, lastReviewed: nil)
}

@Model
final class VocabList {
    var name: String = ""
    var subjectRaw: String = Subject.english.rawValue
    var createdAt: Date = Date()

    @Relationship(deleteRule: .cascade, inverse: \Card.list)
    var cards: [Card] = []

    init(name: String, subject: Subject) {
        self.name = name
        self.subjectRaw = subject.rawValue
        self.createdAt = Date()
    }

    var subject: Subject {
        get { Subject(rawValue: subjectRaw) ?? .english }
        set { subjectRaw = newValue.rawValue }
    }
}

@Model
final class Card {
    /// Wort in der Fremdsprache (bei Latein inkl. Angaben wie „amicus, -i m.“)
    var term: String = ""
    /// Deutsche Bedeutung(en), mehrere durch Komma getrennt
    var translation: String = ""
    var note: String = ""
    var createdAt: Date = Date()
    var list: VocabList?

    // Lernstand Fremdsprache → Deutsch
    var fwdBox: Int = 0
    var fwdDue: Date = Date.distantPast
    var fwdCorrect: Int = 0
    var fwdWrong: Int = 0
    var fwdLast: Date?

    // Lernstand Deutsch → Fremdsprache
    var revBox: Int = 0
    var revDue: Date = Date.distantPast
    var revCorrect: Int = 0
    var revWrong: Int = 0
    var revLast: Date?

    init(term: String, translation: String, note: String = "") {
        self.term = term
        self.translation = translation
        self.note = note
        self.createdAt = Date()
    }

    var subject: Subject { list?.subject ?? .english }

    func state(_ direction: Direction) -> ReviewState {
        switch direction {
        case .foreignToGerman:
            return ReviewState(box: fwdBox, due: fwdDue, correct: fwdCorrect, wrong: fwdWrong, lastReviewed: fwdLast)
        case .germanToForeign:
            return ReviewState(box: revBox, due: revDue, correct: revCorrect, wrong: revWrong, lastReviewed: revLast)
        }
    }

    func setState(_ s: ReviewState, for direction: Direction) {
        switch direction {
        case .foreignToGerman:
            fwdBox = s.box; fwdDue = s.due; fwdCorrect = s.correct; fwdWrong = s.wrong; fwdLast = s.lastReviewed
        case .germanToForeign:
            revBox = s.box; revDue = s.due; revCorrect = s.correct; revWrong = s.wrong; revLast = s.lastReviewed
        }
    }

    func resetProgress() {
        for d in Direction.allCases { setState(.new, for: d) }
    }

    func prompt(for direction: Direction) -> String {
        direction == .foreignToGerman ? term : translation
    }

    func answer(for direction: Direction) -> String {
        direction == .foreignToGerman ? translation : term
    }

    /// Fehler über alle abgefragten Richtungen
    var totalWrong: Int { subject.directions.reduce(0) { $0 + state($1).wrong } }
    var totalCorrect: Int { subject.directions.reduce(0) { $0 + state($1).correct } }
    /// Niedrigstes Fach über alle Richtungen (zeigt, wie gut die Vokabel sitzt)
    var weakestBox: Int { subject.directions.map { state($0).box }.min() ?? 0 }
}

/// Protokoll jeder einzelnen Abfrage – Grundlage für die Erfolgskontrolle.
@Model
final class ReviewLog {
    var date: Date = Date()
    var subjectRaw: String = Subject.english.rawValue
    var directionRaw: String = Direction.foreignToGerman.rawValue
    /// "vocab" oder "sentence"
    var kindRaw: String = "vocab"
    var correct: Bool = false
    var prompt: String = ""

    init(subject: Subject, direction: Direction, kind: Kind, correct: Bool, prompt: String) {
        self.date = Date()
        self.subjectRaw = subject.rawValue
        self.directionRaw = direction.rawValue
        self.kindRaw = kind.rawValue
        self.correct = correct
        self.prompt = prompt
    }

    enum Kind: String { case vocab, sentence }

    var subject: Subject { Subject(rawValue: subjectRaw) ?? .english }
    var direction: Direction { Direction(rawValue: directionRaw) ?? .foreignToGerman }
    var kind: Kind { Kind(rawValue: kindRaw) ?? .vocab }
}

/// Einfache Vokabel ohne Datenbank-Bezug (für Import und KI).
struct WordPair: Identifiable, Hashable, Codable {
    var id = UUID()
    var term: String
    var translation: String
    var note: String = ""
    var include: Bool = true

    enum CodingKeys: String, CodingKey { case term, translation, note }
}
