import SwiftData
import SwiftUI

struct ListsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \VocabList.createdAt, order: .reverse) private var lists: [VocabList]
    @State private var showNewList = false
    @State private var showImport = false

    var body: some View {
        NavigationStack {
            List {
                if lists.isEmpty {
                    ContentUnavailableView(
                        "Noch keine Listen",
                        systemImage: "books.vertical",
                        description: Text("Tippe auf ＋, um eine Liste anzulegen oder Vokabeln aus einem Foto oder einer PDF zu importieren.")
                    )
                }
                ForEach(Subject.allCases) { subject in
                    let subjectLists = lists.filter { $0.subject == subject }
                    if !subjectLists.isEmpty {
                        Section("\(subject.flag) \(subject.displayName)") {
                            ForEach(subjectLists) { list in
                                NavigationLink {
                                    ListDetailView(list: list)
                                } label: {
                                    ListRow(list: list)
                                }
                            }
                            .onDelete { offsets in
                                for i in offsets { context.delete(subjectLists[i]) }
                                try? context.save()
                            }
                        }
                    }
                }
            }
            .navigationTitle("Vokabeln")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button { showImport = true } label: {
                            Label("Aus Foto / PDF importieren", systemImage: "doc.viewfinder")
                        }
                        Button { showNewList = true } label: {
                            Label("Neue leere Liste", systemImage: "plus")
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showNewList) {
                NewListView { _ in }
            }
            .sheet(isPresented: $showImport) {
                ImportView(initialList: nil)
            }
        }
    }
}

private struct ListRow: View {
    let list: VocabList

    var body: some View {
        let mastered = list.cards.filter { $0.weakestBox >= SpacedRepetition.masteredBox }.count
        let progress = list.cards.isEmpty ? 0 : Double(mastered) / Double(list.cards.count)
        VStack(alignment: .leading, spacing: 6) {
            Text(list.name).font(.headline)
            HStack {
                Text("\(list.cards.count) Vokabeln")
                Spacer()
                Text("\(Int(progress * 100)) % sitzen")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            ProgressView(value: progress).tint(.green)
        }
        .padding(.vertical, 4)
    }
}

struct NewListView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var subject: Subject = .english
    let onCreate: (VocabList) -> Void

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name, z. B. „Unit 3“ oder „Lektion 12“", text: $name)
                Picker("Fach", selection: $subject) {
                    ForEach(Subject.allCases) { s in
                        Text("\(s.flag) \(s.displayName)").tag(s)
                    }
                }
                .pickerStyle(.segmented)
            }
            .navigationTitle("Neue Liste")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Anlegen") {
                        let list = VocabList(name: name.trimmingCharacters(in: .whitespaces), subject: subject)
                        context.insert(list)
                        try? context.save()
                        onCreate(list)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
