import SwiftData
import SwiftUI

struct ListDetailView: View {
    @Environment(\.modelContext) private var context
    @Bindable var list: VocabList

    @State private var editingCard: Card?
    @State private var showNewCard = false
    @State private var showImport = false
    @State private var showResetConfirm = false
    @State private var search = ""

    private var cards: [Card] {
        let sorted = list.cards.sorted { $0.createdAt < $1.createdAt }
        guard !search.isEmpty else { return sorted }
        return sorted.filter {
            $0.term.localizedCaseInsensitiveContains(search) || $0.translation.localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        List {
            Section {
                TextField("Name", text: $list.name)
                LabeledContent("Fach", value: "\(list.subject.flag) \(list.subject.displayName)")
            }

            Section("\(list.cards.count) Vokabeln") {
                ForEach(cards) { card in
                    Button {
                        editingCard = card
                    } label: {
                        CardRow(card: card)
                    }
                    .foregroundStyle(.primary)
                }
                .onDelete { offsets in
                    let current = cards
                    for i in offsets { context.delete(current[i]) }
                    try? context.save()
                }
            }

            Section {
                Button("Lernstand dieser Liste zurücksetzen", role: .destructive) {
                    showResetConfirm = true
                }
            }
        }
        .searchable(text: $search, prompt: "Vokabel suchen")
        .navigationTitle(list.name)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button { showNewCard = true } label: { Label("Vokabel hinzufügen", systemImage: "plus") }
                    Button { showImport = true } label: { Label("Aus Foto / PDF importieren", systemImage: "doc.viewfinder") }
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(item: $editingCard) { card in
            CardEditView(list: list, card: card)
        }
        .sheet(isPresented: $showNewCard) {
            CardEditView(list: list, card: nil)
        }
        .sheet(isPresented: $showImport) {
            ImportView(initialList: list)
        }
        .confirmationDialog("Lernstand zurücksetzen?", isPresented: $showResetConfirm, titleVisibility: .visible) {
            Button("Zurücksetzen", role: .destructive) {
                list.cards.forEach { $0.resetProgress() }
                try? context.save()
            }
        } message: {
            Text("Alle Vokabeln dieser Liste gelten danach wieder als neu.")
        }
    }
}

struct CardRow: View {
    let card: Card

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(card.term).font(.body.bold())
                Text(card.translation).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            BoxIndicator(box: card.weakestBox)
        }
    }
}

/// Zeigt, in welchem Fach der Lernkartei die Vokabel liegt.
struct BoxIndicator: View {
    let box: Int

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...SpacedRepetition.maxBox, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(i <= box ? color : Color.gray.opacity(0.25))
                    .frame(width: 6, height: 14)
            }
        }
        .accessibilityLabel(box == 0 ? "neu" : "Fach \(box) von \(SpacedRepetition.maxBox)")
    }

    private var color: Color {
        switch box {
        case ...1: return .red
        case 2...3: return .orange
        case 4: return .yellow
        default: return .green
        }
    }
}

struct CardEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    let list: VocabList
    let card: Card?

    @State private var term = ""
    @State private var translation = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section(list.subject.displayName) {
                    TextField(list.subject == .latin ? "z. B. amicus, -i m." : "z. B. to go, went, gone", text: $term)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
                Section {
                    TextField("z. B. Freund", text: $translation)
                } header: {
                    Text("Deutsch")
                } footer: {
                    Text("Mehrere Bedeutungen mit Komma trennen – bei der Abfrage reicht eine davon.")
                }
                Section("Notiz (optional)") {
                    TextField("z. B. Merkhilfe", text: $note)
                }
                if let card {
                    Section("Lernstand") {
                        ForEach(list.subject.directions) { d in
                            let s = card.state(d)
                            LabeledContent(d.label(for: list.subject),
                                           value: "Fach \(s.box) · \(s.correct)× richtig · \(s.wrong)× falsch")
                        }
                    }
                }
            }
            .navigationTitle(card == nil ? "Neue Vokabel" : "Vokabel bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern") { save() }
                        .disabled(term.trimmingCharacters(in: .whitespaces).isEmpty
                                  || translation.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                if let card {
                    term = card.term
                    translation = card.translation
                    note = card.note
                }
            }
        }
    }

    private func save() {
        let t = term.trimmingCharacters(in: .whitespaces)
        let tr = translation.trimmingCharacters(in: .whitespaces)
        if let card {
            card.term = t
            card.translation = tr
            card.note = note
        } else {
            let newCard = Card(term: t, translation: tr, note: note)
            context.insert(newCard)
            newCard.list = list
        }
        try? context.save()
        dismiss()
    }
}
