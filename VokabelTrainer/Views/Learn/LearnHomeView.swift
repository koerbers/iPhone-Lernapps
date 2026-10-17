import SwiftData
import SwiftUI

struct LearnHomeView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \VocabList.createdAt) private var lists: [VocabList]
    @Query(sort: \ReviewLog.date, order: .reverse) private var logs: [ReviewLog]
    @AppStorage("learnerName") private var learnerName = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    header

                    if lists.isEmpty {
                        emptyState
                    } else {
                        ForEach(Subject.allCases) { subject in
                            let subjectLists = lists.filter { $0.subject == subject }
                            if !subjectLists.isEmpty {
                                SubjectCard(subject: subject, lists: subjectLists)
                            }
                        }
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Lernen")
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(learnerName.isEmpty ? "Hallo!" : "Hallo \(learnerName)!")
                    .font(.title2.bold())
                Text(todayText)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack {
                Text("🔥").font(.largeTitle)
                Text("\(Stats.streak(logs: logs)) Tage").font(.caption.bold())
            }
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }

    private var todayText: String {
        let today = Stats.logsToday(logs)
        if today.isEmpty { return "Heute noch nichts geübt – los geht's!" }
        let correct = today.filter(\.correct).count
        return "Heute schon \(today.count) Abfragen, \(correct) richtig 💪"
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("📚").font(.system(size: 60))
            Text("Noch keine Vokabeln").font(.headline)
            Text("Lege im Tab „Vokabeln“ eine Liste an oder importiere Vokabeln aus einem Foto oder einer PDF.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("Beispielvokabeln laden") { SampleData.insert(into: context) }
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct SubjectCard: View {
    let subject: Subject
    let lists: [VocabList]

    var body: some View {
        let cards = lists.flatMap(\.cards)
        let counts = SpacedRepetition.dueCount(cards: cards, directions: subject.directions)

        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("\(subject.flag) \(subject.displayName)").font(.title3.bold())
                Spacer()
                Text("\(cards.count) Vokabeln").foregroundStyle(.secondary).font(.subheadline)
            }

            HStack(spacing: 12) {
                Badge(value: counts.due, label: "fällig", color: .orange)
                Badge(value: counts.new, label: "neu", color: .blue)
                Badge(value: cards.filter { $0.weakestBox >= SpacedRepetition.masteredBox }.count,
                      label: "sitzen", color: .green)
            }

            NavigationLink {
                PracticeSetupView(subject: subject)
            } label: {
                Label("Vokabeln üben", systemImage: "rectangle.stack")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            NavigationLink {
                SentenceSetupView(subject: subject)
            } label: {
                Label("Sätze übersetzen", systemImage: "text.bubble")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct Badge: View {
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack {
            Text("\(value)").font(.title2.bold()).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
    }
}
