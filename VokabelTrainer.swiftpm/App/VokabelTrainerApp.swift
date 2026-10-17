import SwiftData
import SwiftUI

@main
struct VokabelTrainerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [VocabList.self, Card.self, ReviewLog.self])
    }
}

struct ContentView: View {
    var body: some View {
        TabView {
            LearnHomeView()
                .tabItem { Label("Lernen", systemImage: "graduationcap") }
            ListsView()
                .tabItem { Label("Vokabeln", systemImage: "books.vertical") }
            StatsView()
                .tabItem { Label("Erfolge", systemImage: "chart.bar.xaxis") }
            SettingsView()
                .tabItem { Label("Einstellungen", systemImage: "gearshape") }
        }
    }
}

/// Kleine Beispiellisten zum Ausprobieren.
enum SampleData {
    static func insert(into context: ModelContext) {
        let english = VocabList(name: "Beispiel: Unit 1", subject: .english)
        context.insert(english)
        for (t, d) in [
            ("house", "Haus"), ("to go, went, gone", "gehen"), ("friend", "Freund, Freundin"),
            ("school", "Schule"), ("to be happy", "glücklich sein"), ("dog", "Hund"),
            ("breakfast", "Frühstück"), ("always", "immer"), ("beautiful", "schön"), ("to buy, bought, bought", "kaufen"),
        ] {
            let card = Card(term: t, translation: d)
            context.insert(card)
            card.list = english
        }

        let latin = VocabList(name: "Beispiel: Lektion 1", subject: .latin)
        context.insert(latin)
        for (t, d) in [
            ("amicus, -i m.", "Freund"), ("villa, -ae f.", "Haus, Landhaus"), ("vocare, voco", "rufen, nennen"),
            ("magnus, -a, -um", "groß"), ("et", "und"), ("non", "nicht"), ("servus, -i m.", "Sklave, Diener"),
            ("laborare, laboro", "arbeiten"), ("hodie", "heute"), ("ubi?", "wo?"),
        ] {
            let card = Card(term: t, translation: d)
            context.insert(card)
            card.list = latin
        }
        try? context.save()
    }
}
