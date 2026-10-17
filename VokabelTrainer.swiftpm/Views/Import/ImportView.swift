import PhotosUI
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

/// Vokabeln aus Fotos, Scans, PDFs oder eingefügtem Text übernehmen.
struct ImportView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \VocabList.createdAt, order: .reverse) private var lists: [VocabList]

    let initialList: VocabList?

    @AppStorage("useAIForImport") private var useAI = true

    @State private var targetListID: PersistentIdentifier?
    @State private var newListName = ""
    @State private var newListSubject: Subject = .english

    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showScanner = false
    @State private var showFileImporter = false
    @State private var showTextInput = false
    @State private var pastedText = ""

    @State private var stage: Stage = .pick
    @State private var pairs: [WordPair] = []
    @State private var notice: String?

    enum Stage: Equatable {
        case pick
        case processing(String)
        case review
    }

    enum Source {
        case image(UIImage)
        case pdf(Data)
        case text(String)
    }

    private var targetList: VocabList? {
        targetListID.flatMap { id in lists.first { $0.persistentModelID == id } }
    }

    private var subject: Subject { targetList?.subject ?? newListSubject }

    var body: some View {
        NavigationStack {
            Group {
                switch stage {
                case .pick: pickView
                case .processing(let message): ProgressView(message).controlSize(.large)
                case .review: reviewView
                }
            }
            .navigationTitle("Vokabeln importieren")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                if stage == .review {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Übernehmen") { save() }
                            .disabled(!pairs.contains { $0.include })
                    }
                }
            }
        }
        .onAppear {
            if targetListID == nil { targetListID = initialList?.persistentModelID }
        }
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var sources: [Source] = []
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        sources.append(.image(image))
                    }
                }
                photoItems = []
                await process(sources)
            }
        }
        .fullScreenCover(isPresented: $showScanner) {
            DocumentScannerView { images in
                Task { await process(images.map { .image($0) }) }
            }
            .ignoresSafeArea()
        }
        .fileImporter(isPresented: $showFileImporter,
                      allowedContentTypes: [.pdf, .image, .plainText],
                      allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            let sources = urls.compactMap(Self.loadFile)
            Task { await process(sources) }
        }
        .sheet(isPresented: $showTextInput) {
            NavigationStack {
                TextEditor(text: $pastedText)
                    .padding()
                    .navigationTitle("Text einfügen")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Abbrechen") { showTextInput = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Erkennen") {
                                showTextInput = false
                                let text = pastedText
                                Task { await process([.text(text)]) }
                            }
                        }
                    }
            }
        }
    }

    // MARK: - Schritt 1: Quelle wählen

    private var pickView: some View {
        Form {
            Section("Ziel-Liste") {
                Picker("Liste", selection: $targetListID) {
                    Text("Neue Liste …").tag(PersistentIdentifier?.none)
                    ForEach(lists) { list in
                        Text("\(list.subject.flag) \(list.name)").tag(Optional(list.persistentModelID))
                    }
                }
                if targetList == nil {
                    TextField("Name der neuen Liste", text: $newListName)
                    Picker("Fach", selection: $newListSubject) {
                        ForEach(Subject.allCases) { s in Text("\(s.flag) \(s.displayName)").tag(s) }
                    }
                    .pickerStyle(.segmented)
                }
            }

            Section {
                PhotosPicker(selection: $photoItems, maxSelectionCount: 10, matching: .images) {
                    Label("Foto aus der Mediathek", systemImage: "photo.on.rectangle")
                }
                if DocumentScannerView.isSupported {
                    Button { showScanner = true } label: {
                        Label("Seite mit der Kamera scannen", systemImage: "doc.viewfinder")
                    }
                }
                Button { showFileImporter = true } label: {
                    Label("PDF oder Bild aus Dateien", systemImage: "folder")
                }
                Button { showTextInput = true } label: {
                    Label("Text einfügen", systemImage: "doc.on.clipboard")
                }
            } header: {
                Text("Quelle")
            } footer: {
                Text("Am besten funktionieren Vokabellisten mit zwei Spalten (Fremdwort | Deutsch). Du kannst alles vor dem Speichern prüfen und korrigieren.")
            }

            Section {
                Toggle("KI zum Erkennen verwenden", isOn: $useAI)
            } footer: {
                if AIServiceFactory.current() == nil {
                    Text("Keine KI eingerichtet – es wird die einfache Erkennung (nach Spalten und Trennzeichen) verwendet.")
                } else {
                    Text("Die KI sortiert Wörter und Übersetzungen auch bei unübersichtlichen Seiten richtig zu.")
                }
            }
        }
    }

    // MARK: - Schritt 2: Prüfen

    private var reviewView: some View {
        List {
            if let notice {
                Section { Label(notice, systemImage: "info.circle").foregroundStyle(.orange) }
            }
            Section {
                HStack {
                    Button {
                        pairs = pairs.map { var p = $0; swap(&p.term, &p.translation); return p }
                    } label: {
                        Label("Spalten tauschen", systemImage: "arrow.left.arrow.right")
                    }
                    Spacer()
                    Button("Neu laden") { stage = .pick }
                }
                .buttonStyle(.borderless)
            } footer: {
                Text("Links steht \(subject.displayName), rechts Deutsch. Falls es andersherum erkannt wurde: „Spalten tauschen“.")
            }

            Section("\(pairs.filter(\.include).count) von \(pairs.count) ausgewählt") {
                ForEach($pairs) { $pair in
                    HStack {
                        Button {
                            pair.include.toggle()
                        } label: {
                            Image(systemName: pair.include ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(pair.include ? Color.accentColor : .secondary)
                        }
                        .buttonStyle(.borderless)
                        VStack(spacing: 4) {
                            TextField(subject.displayName, text: $pair.term)
                                .font(.body.bold())
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                            TextField("Deutsch", text: $pair.translation)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .opacity(pair.include ? 1 : 0.5)
                }
                .onDelete { pairs.remove(atOffsets: $0) }

                Button {
                    pairs.append(WordPair(term: "", translation: ""))
                } label: {
                    Label("Zeile hinzufügen", systemImage: "plus")
                }
            }
        }
    }

    // MARK: - Verarbeitung

    private static func loadFile(_ url: URL) -> Source? {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { return nil }
        let type = UTType(filenameExtension: url.pathExtension)
        if type?.conforms(to: .pdf) == true { return .pdf(data) }
        if type?.conforms(to: .image) == true, let image = UIImage(data: data) { return .image(image) }
        if let text = String(data: data, encoding: .utf8) { return .text(text) }
        return nil
    }

    @MainActor
    private func process(_ sources: [Source]) async {
        guard !sources.isEmpty else { return }
        notice = nil
        var found: [WordPair] = []
        let ai = useAI ? AIServiceFactory.current() : nil

        for (i, source) in sources.enumerated() {
            let step = sources.count > 1 ? " (\(i + 1)/\(sources.count))" : ""
            do {
                stage = .processing("Text wird erkannt …\(step)")
                let payload: ImportPayload
                switch source {
                case .image(let image):
                    payload = ImportPayload(text: try await TextRecognizer.recognize(image: image),
                                            imageJPEG: image.jpegForUpload())
                case .pdf(let data):
                    payload = ImportPayload(text: try await TextRecognizer.text(fromPDF: data), pdf: data)
                case .text(let text):
                    payload = ImportPayload(text: text)
                }

                if let ai {
                    stage = .processing("\(ai.name) sortiert die Vokabeln …\(step)")
                    do {
                        found += try await ai.extractVocabulary(from: payload, subject: subject)
                        continue
                    } catch {
                        notice = "Die KI konnte nicht helfen (\(error.localizedDescription)). Es wurde die einfache Erkennung verwendet."
                    }
                }
                found += VocabParser.parse(payload.text)
            } catch {
                notice = error.localizedDescription
            }
        }

        pairs = found.filter { !$0.term.isEmpty || !$0.translation.isEmpty }
        if pairs.isEmpty {
            notice = (notice.map { $0 + " " } ?? "") + "Es wurden keine Vokabeln erkannt. Du kannst sie unten auch von Hand eintragen."
        }
        stage = .review
    }

    private func save() {
        let list: VocabList
        if let targetList {
            list = targetList
        } else {
            let name = newListName.trimmingCharacters(in: .whitespaces)
            list = VocabList(name: name.isEmpty ? "Import \(Date().formatted(date: .abbreviated, time: .omitted))" : name,
                             subject: newListSubject)
            context.insert(list)
        }

        var existing = Set(list.cards.map { AnswerChecker.normalize($0.term) })
        for pair in pairs where pair.include {
            let term = pair.term.trimmingCharacters(in: .whitespaces)
            let translation = pair.translation.trimmingCharacters(in: .whitespaces)
            guard !term.isEmpty, !translation.isEmpty, existing.insert(AnswerChecker.normalize(term)).inserted else { continue }
            let card = Card(term: term, translation: translation, note: pair.note)
            context.insert(card)
            card.list = list
        }
        try? context.save()
        dismiss()
    }
}
