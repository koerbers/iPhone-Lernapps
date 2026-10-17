import Charts
import SwiftData
import SwiftUI

/// Erfolgskontrolle: Wie viel wurde geübt, wie gut sitzen die Vokabeln, welche sind schwierig?
struct StatsView: View {
    @Query(sort: \ReviewLog.date, order: .reverse) private var allLogs: [ReviewLog]
    @Query(sort: \VocabList.createdAt) private var lists: [VocabList]
    @State private var filter: SubjectFilter = .all

    enum SubjectFilter: String, CaseIterable, Identifiable {
        case all, english, latin
        var id: String { rawValue }
        var title: String {
            switch self {
            case .all: return "Alle"
            case .english: return "Englisch"
            case .latin: return "Latein"
            }
        }
        var subject: Subject? {
            switch self {
            case .all: return nil
            case .english: return .english
            case .latin: return .latin
            }
        }
    }

    private var logs: [ReviewLog] {
        guard let s = filter.subject else { return allLogs }
        return allLogs.filter { $0.subject == s }
    }

    private var cards: [Card] {
        let relevant = filter.subject.map { s in lists.filter { $0.subject == s } } ?? lists
        return relevant.flatMap(\.cards)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Picker("Fach", selection: $filter) {
                        ForEach(SubjectFilter.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    tiles
                    activityChart
                    boxChart
                    sentenceSection
                    troubleWords
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Erfolge")
        }
    }

    // MARK: Kacheln

    private var tiles: some View {
        let weekAgo = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
        let lastWeek = logs.filter { $0.date >= weekAgo && $0.kind == .vocab }
        let accuracy = Stats.accuracy(lastWeek)
        let mastered = cards.filter { $0.weakestBox >= SpacedRepetition.masteredBox }.count

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            Tile(title: "Serie", value: "\(Stats.streak(logs: logs)) 🔥", subtitle: "Tage in Folge geübt")
            Tile(title: "Heute", value: "\(Stats.logsToday(logs).count)", subtitle: "Abfragen")
            Tile(title: "Trefferquote", value: accuracy.map { "\(Int($0 * 100)) %" } ?? "–", subtitle: "letzte 7 Tage")
            Tile(title: "Sitzen", value: "\(mastered) / \(cards.count)", subtitle: "Vokabeln ab Fach \(SpacedRepetition.masteredBox)")
        }
    }

    // MARK: Aktivität

    private var activityChart: some View {
        let days = Stats.daily(logs, days: 14)
        return ChartCard(title: "Geübt in den letzten 14 Tagen") {
            Chart {
                ForEach(days) { day in
                    BarMark(x: .value("Tag", day.day, unit: .day), y: .value("Anzahl", day.correct))
                        .foregroundStyle(by: .value("Ergebnis", "Richtig"))
                    BarMark(x: .value("Tag", day.day, unit: .day), y: .value("Anzahl", day.wrong))
                        .foregroundStyle(by: .value("Ergebnis", "Falsch"))
                }
            }
            .chartForegroundStyleScale(["Richtig": Color.green, "Falsch": Color.red.opacity(0.7)])
            .chartXAxis {
                AxisMarks(values: .stride(by: .day, count: 2)) { _ in
                    AxisValueLabel(format: .dateTime.day().month(.defaultDigits))
                }
            }
            .frame(height: 180)
        }
    }

    // MARK: Lernkartei

    private var boxChart: some View {
        struct BoxCount: Identifiable {
            let box: Int
            let count: Int
            var id: Int { box }
            var label: String { box == 0 ? "neu" : "\(box)" }
        }
        var counts = [Int](repeating: 0, count: SpacedRepetition.maxBox + 1)
        for card in cards {
            for d in card.subject.directions {
                counts[min(card.state(d).box, SpacedRepetition.maxBox)] += 1
            }
        }
        let data = counts.enumerated().map { BoxCount(box: $0.offset, count: $0.element) }

        return ChartCard(title: "Lernkartei – wie gut sitzen die Vokabeln?") {
            Chart(data) { item in
                BarMark(x: .value("Fach", item.label), y: .value("Karten", item.count))
                    .foregroundStyle(color(forBox: item.box))
                    .annotation(position: .top) {
                        if item.count > 0 { Text("\(item.count)").font(.caption2) }
                    }
            }
            .frame(height: 160)
            Text("Fach 1 = gerade falsch oder frisch gelernt, Fach 6 = sitzt richtig gut.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func color(forBox box: Int) -> Color {
        switch box {
        case 0: return .gray
        case 1: return .red
        case 2...3: return .orange
        case 4: return .yellow
        default: return .green
        }
    }

    // MARK: Sätze

    @ViewBuilder
    private var sentenceSection: some View {
        let sentences = logs.filter { $0.kind == .sentence }
        if !sentences.isEmpty {
            ChartCard(title: "Satzübersetzungen") {
                HStack {
                    Tile(title: "Übersetzt", value: "\(sentences.count)", subtitle: "Sätze")
                    Tile(title: "Richtig", value: Stats.accuracy(sentences).map { "\(Int($0 * 100)) %" } ?? "–",
                         subtitle: "aller Sätze")
                }
            }
        }
    }

    // MARK: Sorgenkinder

    @ViewBuilder
    private var troubleWords: some View {
        let trouble = cards
            .filter { $0.totalWrong > 0 }
            .sorted { lhs, rhs in
                if lhs.totalWrong != rhs.totalWrong { return lhs.totalWrong > rhs.totalWrong }
                return lhs.weakestBox < rhs.weakestBox
            }
            .prefix(10)

        if !trouble.isEmpty {
            ChartCard(title: "Sorgenkinder – diese Vokabeln waren oft falsch") {
                ForEach(Array(trouble)) { card in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(card.term).bold()
                            Text(card.translation).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(card.totalWrong)× falsch")
                            .font(.caption.bold())
                            .foregroundStyle(.red)
                        BoxIndicator(box: card.weakestBox)
                    }
                    Divider()
                }
            }
        }
    }
}

private struct Tile: View {
    let title: String
    let value: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title2.bold()).minimumScaleFactor(0.6).lineLimit(1)
            Text(subtitle).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 14))
    }
}

private struct ChartCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.headline)
            content
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }
}
