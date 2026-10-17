import Foundation

/// Material, aus dem Vokabeln gewonnen werden.
struct ImportPayload {
    /// Per Texterkennung gewonnener Text
    var text: String
    /// Optional: Originalbild als JPEG (Claude kann es direkt „ansehen“)
    var imageJPEG: Data?
    /// Optional: Original-PDF
    var pdf: Data?
}

/// Ein Übersetzungssatz.
struct SentenceExercise: Identifiable, Codable, Hashable {
    var id = UUID()
    /// Der zu übersetzende Satz
    var prompt: String
    /// Musterlösung
    var solution: String

    enum CodingKeys: String, CodingKey { case prompt, solution }
}

/// Bewertung einer Satzübersetzung.
struct SentenceGrade: Codable, Hashable {
    var correct: Bool
    var feedback: String
    var correctedTranslation: String
}

/// Ein Vokabelpaar, das in einem Satz vorkommen soll.
struct WordHint: Hashable {
    var term: String
    var translation: String
}

enum LearningAIError: LocalizedError {
    case notConfigured
    case badResponse(String)
    case refused

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Keine KI eingerichtet. Bitte in den Einstellungen Apple Intelligence aktivieren oder einen Claude-API-Schlüssel eintragen."
        case .badResponse(let detail):
            return "Die KI hat nicht wie erwartet geantwortet. (\(detail))"
        case .refused:
            return "Die KI hat diese Anfrage abgelehnt."
        }
    }
}

/// Gemeinsame Schnittstelle für die KI-Funktionen (Apple Intelligence auf dem Gerät oder Claude).
protocol LearningAI {
    var name: String { get }
    func extractVocabulary(from payload: ImportPayload, subject: Subject) async throws -> [WordPair]
    func makeSentences(words: [WordHint], subject: Subject, direction: Direction, count: Int) async throws -> [SentenceExercise]
    func grade(exercise: SentenceExercise, answer: String, subject: Subject, direction: Direction) async throws -> SentenceGrade
}

/// Gemeinsame Anweisungen (Prompts) für beide KI-Varianten.
enum Prompts {
    static func extractionInstructions(subject: Subject) -> String {
        var text = """
        Du hilfst einem Schulkind beim Anlegen von Vokabelkarten für das Fach \(subject.displayName).
        Aus dem Material (Vokabelliste aus einem Schulbuch, Arbeitsblatt oder Heft) extrahierst du alle Vokabelpaare.
        - "term" ist das Wort oder der Ausdruck auf \(subject.displayName).
        - "translation" ist die deutsche Bedeutung. Mehrere Bedeutungen durch Komma trennen.
        - Ignoriere Überschriften, Seitenzahlen, Beispielsätze und Erklärtexte.
        - Korrigiere offensichtliche Fehler der Texterkennung, erfinde aber keine Vokabeln.
        """
        if subject == .latin {
            text += """

            - Bei Latein gehören Grammatikangaben zum "term", so wie sie im Buch stehen, z. B. "amicus, -i m.", "vocare, voco, vocavi, vocatum", "magnus, -a, -um".
            """
        } else {
            text += """

            - Bei englischen Verben "to" mitschreiben, wenn es im Material steht. Unregelmäßige Formen ("go, went, gone") gehören zum "term".
            """
        }
        return text
    }

    static func sentenceInstructions(subject: Subject, direction: Direction) -> String {
        let source = direction.sourceLanguage(for: subject)
        let target = direction.targetLanguage(for: subject)
        var text = """
        Du bist eine freundliche Lehrkraft für \(subject.displayName) an einem deutschen Gymnasium (Klasse 5 bis 8).
        Du erstellst kurze Übersetzungsübungen: Sätze auf \(source), die das Kind ins \(target)e übersetzt.
        - Jeder Satz verwendet mindestens eine der vorgegebenen Vokabeln.
        - Sonst nur sehr einfache Grundwörter und Grammatik, die zu den Vokabeln passt.
        - Sätze kurz (5 bis 12 Wörter), kindgerecht, abwechslungsreich und gern ein bisschen lustig.
        - "prompt" ist der Satz auf \(source), "solution" eine gute Musterübersetzung auf \(target).
        """
        if subject == .latin {
            text += """

            - Lateinische Sätze im Stil des Schulbuch-Lateins (z. B. wie in Cursus, Campus, Prima, Felix), ohne Makrons.
            """
        }
        return text
    }

    static func gradingInstructions(subject: Subject, direction: Direction) -> String {
        """
        Du bist eine geduldige, ermutigende Lehrkraft für \(subject.displayName).
        Ein Kind hat einen Satz von \(direction.sourceLanguage(for: subject)) ins \(direction.targetLanguage(for: subject))e übersetzt.
        - "correct" ist true, wenn die Übersetzung inhaltlich und grammatisch im Wesentlichen stimmt. Freie, aber sinngemäß richtige Übersetzungen und Synonyme sind richtig. Kleine Rechtschreibfehler machen die Antwort nicht falsch, werden aber erwähnt.
        - "feedback": 1 bis 3 kurze Sätze auf Deutsch, direkt an das Kind gerichtet (du). Erst loben, was gut war, dann konkret erklären, was falsch war (z. B. Vokabel, Zeitform, Fall).
        - "correctedTranslation": die Übersetzung des Kindes, möglichst wenig verändert und richtiggestellt.
        """
    }

    static func sentenceRequest(words: [WordHint], count: Int) -> String {
        let list = words.map { "- \($0.term) = \($0.translation)" }.joined(separator: "\n")
        return "Erstelle \(count) Sätze. Verwende diese Vokabeln:\n\(list)"
    }

    static func gradingRequest(exercise: SentenceExercise, answer: String) -> String {
        """
        Satz: \(exercise.prompt)
        Musterlösung: \(exercise.solution)
        Übersetzung des Kindes: \(answer)
        """
    }
}

/// Liefert die eingestellte KI.
enum AIServiceFactory {
    static let providerKey = "aiProvider"
    static let claudeKeychainKey = "claudeAPIKey"

    enum Provider: String, CaseIterable, Identifiable {
        case automatic, apple, claude, off
        var id: String { rawValue }
        var title: String {
            switch self {
            case .automatic: return "Automatisch"
            case .apple: return "Apple Intelligence (auf dem iPhone)"
            case .claude: return "Claude (Internet, API-Schlüssel)"
            case .off: return "Aus"
            }
        }
    }

    static var selectedProvider: Provider {
        Provider(rawValue: UserDefaults.standard.string(forKey: providerKey) ?? "") ?? .automatic
    }

    static var claudeKey: String? {
        guard let key = Keychain.get(claudeKeychainKey), !key.isEmpty else { return nil }
        return key
    }

    static var isAppleIntelligenceAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return AppleIntelligenceService.isAvailable
        }
        #endif
        return false
    }

    static func current() -> LearningAI? {
        switch selectedProvider {
        case .off:
            return nil
        case .claude:
            return claudeKey.map { ClaudeService(apiKey: $0) }
        case .apple:
            return appleService()
        case .automatic:
            // Claude ist bei Latein deutlich besser – daher bevorzugt, wenn ein Schlüssel da ist.
            if let key = claudeKey { return ClaudeService(apiKey: key) }
            return appleService()
        }
    }

    private static func appleService() -> LearningAI? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), AppleIntelligenceService.isAvailable {
            return AppleIntelligenceService()
        }
        #endif
        return nil
    }
}
