import Foundation

/// Auswertungen für die Erfolgskontrolle.
enum Stats {
    static func logsToday(_ logs: [ReviewLog], calendar: Calendar = .current) -> [ReviewLog] {
        logs.filter { calendar.isDateInToday($0.date) }
    }

    /// Anzahl Tage in Folge, an denen geübt wurde (heute oder gestern muss dabei sein).
    static func streak(logs: [ReviewLog], now: Date = Date(), calendar: Calendar = .current) -> Int {
        streak(days: Set(logs.map { calendar.startOfDay(for: $0.date) }), now: now, calendar: calendar)
    }

    static func streak(days: Set<Date>, now: Date = Date(), calendar: Calendar = .current) -> Int {
        var day = calendar.startOfDay(for: now)
        if !days.contains(day) {
            guard let yesterday = calendar.date(byAdding: .day, value: -1, to: day), days.contains(yesterday) else { return 0 }
            day = yesterday
        }
        var count = 0
        while days.contains(day) {
            count += 1
            guard let previous = calendar.date(byAdding: .day, value: -1, to: day) else { break }
            day = previous
        }
        return count
    }

    static func accuracy(_ logs: [ReviewLog]) -> Double? {
        guard !logs.isEmpty else { return nil }
        return Double(logs.filter(\.correct).count) / Double(logs.count)
    }

    struct DayStat: Identifiable {
        var id: Date { day }
        let day: Date
        let correct: Int
        let wrong: Int
    }

    static func daily(_ logs: [ReviewLog], days: Int, now: Date = Date(), calendar: Calendar = .current) -> [DayStat] {
        let today = calendar.startOfDay(for: now)
        let grouped = Dictionary(grouping: logs) { calendar.startOfDay(for: $0.date) }
        return (0..<days).reversed().compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: -offset, to: today) else { return nil }
            let entries = grouped[day] ?? []
            return DayStat(day: day, correct: entries.filter(\.correct).count, wrong: entries.filter { !$0.correct }.count)
        }
    }
}
