import Foundation

/// Lernkartei nach dem Leitner-Prinzip:
/// - Richtig beantwortet → Karte rückt ein Fach weiter und kommt erst nach längerer Pause wieder.
/// - Falsch beantwortet → Karte fällt zurück in Fach 1 und ist sofort wieder fällig.
/// - Karten, die schon oft falsch waren, kommen auch nach richtigen Antworten früher wieder.
enum SpacedRepetition {
    static let maxBox = 6

    /// Pause in Tagen, nachdem eine Karte in das jeweilige Fach gerückt ist.
    static let intervalDays: [Int: Double] = [1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32]

    /// Ab diesem Fach gilt eine Vokabel als „sitzt“.
    static let masteredBox = 5

    static func review(_ state: ReviewState, correct: Bool, now: Date = Date(), calendar: Calendar = .current) -> ReviewState {
        var next = state
        next.lastReviewed = now

        if correct {
            next.correct += 1
            next.box = min(max(state.box, 0) + 1, maxBox)
            let base = intervalDays[next.box] ?? 1
            // Je öfter eine Vokabel falsch war, desto kürzer die Pause.
            let penalty = 1.0 / (1.0 + 0.2 * Double(next.wrong))
            let days = max(1, Int((base * penalty).rounded()))
            let startOfToday = calendar.startOfDay(for: now)
            next.due = calendar.date(byAdding: .day, value: days, to: startOfToday) ?? now
        } else {
            next.wrong += 1
            next.box = 1
            next.due = now
        }
        return next
    }

    static func isDue(_ state: ReviewState, now: Date = Date()) -> Bool {
        state.box == 0 || state.due <= now
    }

    /// Je höher, desto dringender sollte die Karte abgefragt werden.
    static func priority(_ state: ReviewState, now: Date = Date()) -> Double {
        let overdueDays = max(0, now.timeIntervalSince(state.due) / 86_400)
        return 2
            + Double(maxBox - state.box)
            + errorRate(state) * 4
            + min(overdueDays, 10) * 0.3
    }

    static func errorRate(_ state: ReviewState) -> Double {
        let total = state.correct + state.wrong
        return total > 0 ? Double(state.wrong) / Double(total) : 0
    }

    struct Candidate {
        let card: Card
        let direction: Direction
        let state: ReviewState
    }

    /// Stellt die Abfragen für eine Übungsrunde zusammen.
    /// - Parameters:
    ///   - size: maximale Anzahl Abfragen
    ///   - maxNew: wie viele neue (noch nie gelernte) Vokabeln dazukommen dürfen
    ///   - fillWithWeak: wenn nicht genug fällig ist, mit den schwächsten Vokabeln auffüllen
    static func buildSession(
        cards: [Card],
        directions: [Direction],
        size: Int,
        maxNew: Int,
        fillWithWeak: Bool,
        now: Date = Date()
    ) -> [Candidate] {
        let all = cards.flatMap { card in
            directions.map { Candidate(card: card, direction: $0, state: card.state($0)) }
        }

        let due = all
            .filter { $0.state.box > 0 && $0.state.due <= now }
            .sorted { priority($0.state, now: now) > priority($1.state, now: now) }

        let fresh = all
            .filter { $0.state.box == 0 }
            .sorted { $0.card.createdAt < $1.card.createdAt }

        var picked = Array(due.prefix(size))
        let freeSlots = max(0, size - picked.count)
        picked += fresh.prefix(min(maxNew, freeSlots))

        if fillWithWeak && picked.count < size {
            let taken = Set(picked.map { key($0) })
            let weak = all
                .filter { !taken.contains(key($0)) }
                .sorted { priority($0.state, now: now) > priority($1.state, now: now) }
            picked += weak.prefix(size - picked.count)
        }

        return spreadApart(picked.shuffled())
    }

    static func dueCount(cards: [Card], directions: [Direction], now: Date = Date()) -> (due: Int, new: Int) {
        var due = 0, new = 0
        for card in cards {
            for d in directions {
                let s = card.state(d)
                if s.box == 0 { new += 1 } else if s.due <= now { due += 1 }
            }
        }
        return (due, new)
    }

    private static func key(_ c: Candidate) -> String {
        "\(ObjectIdentifier(c.card).hashValue)-\(c.direction.rawValue)"
    }

    /// Verhindert, dass dieselbe Vokabel direkt hintereinander in beiden Richtungen kommt.
    private static func spreadApart(_ items: [Candidate]) -> [Candidate] {
        var result: [Candidate] = []
        var pending = items
        while !pending.isEmpty {
            let last = result.last?.card
            if let idx = pending.firstIndex(where: { $0.card !== last }) {
                result.append(pending.remove(at: idx))
            } else {
                result.append(pending.removeFirst())
            }
        }
        return result
    }
}
