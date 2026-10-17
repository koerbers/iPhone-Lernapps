import Foundation

/// Anbindung an Claude über die Anthropic-API (https://platform.claude.com).
/// Benötigt einen API-Schlüssel, der in den Einstellungen eingetragen wird.
/// Claude kann Fotos und PDFs direkt lesen und ist besonders gut bei Latein.
struct ClaudeService: LearningAI {
    let apiKey: String
    var model = "claude-opus-5-5"

    var name: String { "Claude" }

    private static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!

    // MARK: - LearningAI

    func extractVocabulary(from payload: ImportPayload, subject: Subject) async throws -> [WordPair] {
        var content: [[String: Any]] = []
        if let jpeg = payload.imageJPEG {
            content.append([
                "type": "image",
                "source": ["type": "base64", "media_type": "image/jpeg", "data": jpeg.base64EncodedString()],
            ])
        } else if let pdf = payload.pdf {
            content.append([
                "type": "document",
                "source": ["type": "base64", "media_type": "application/pdf", "data": pdf.base64EncodedString()],
            ])
        }
        var text = "Extrahiere alle Vokabelpaare aus dem Material."
        if !payload.text.isEmpty {
            text += "\n\nZur Hilfe der Text aus der automatischen Texterkennung (kann Fehler enthalten):\n\(payload.text)"
        }
        content.append(["type": "text", "text": text])

        let schema = Self.objectSchema([
            "pairs": [
                "type": "array",
                "items": Self.objectSchema([
                    "term": ["type": "string"],
                    "translation": ["type": "string"],
                ]),
            ],
        ])

        struct Result: Decodable { let pairs: [WordPair] }
        let result: Result = try await send(
            system: Prompts.extractionInstructions(subject: subject),
            content: content,
            schema: schema,
            effort: "medium"
        )
        return result.pairs
    }

    func makeSentences(words: [WordHint], subject: Subject, direction: Direction, count: Int) async throws -> [SentenceExercise] {
        let schema = Self.objectSchema([
            "sentences": [
                "type": "array",
                "items": Self.objectSchema([
                    "prompt": ["type": "string"],
                    "solution": ["type": "string"],
                ]),
            ],
        ])
        struct Result: Decodable { let sentences: [SentenceExercise] }
        let result: Result = try await send(
            system: Prompts.sentenceInstructions(subject: subject, direction: direction),
            content: [["type": "text", "text": Prompts.sentenceRequest(words: words, count: count)]],
            schema: schema,
            effort: "low"
        )
        return result.sentences
    }

    func grade(exercise: SentenceExercise, answer: String, subject: Subject, direction: Direction) async throws -> SentenceGrade {
        let schema = Self.objectSchema([
            "correct": ["type": "boolean"],
            "feedback": ["type": "string"],
            "correctedTranslation": ["type": "string"],
        ])
        return try await send(
            system: Prompts.gradingInstructions(subject: subject, direction: direction),
            content: [["type": "text", "text": Prompts.gradingRequest(exercise: exercise, answer: answer)]],
            schema: schema,
            effort: "low"
        )
    }

    // MARK: - HTTP

    private static func objectSchema(_ properties: [String: Any]) -> [String: Any] {
        [
            "type": "object",
            "properties": properties,
            "required": Array(properties.keys).sorted(),
            "additionalProperties": false,
        ]
    }

    private func send<T: Decodable>(system: String, content: [[String: Any]], schema: [String: Any], effort: String) async throws -> T {
        let body: [String: Any] = [
            "model": model,
            "max_tokens": 16000,
            "system": system,
            "messages": [["role": "user", "content": content]],
            "output_config": [
                "effort": effort,
                "format": ["type": "json_schema", "schema": schema],
            ],
            // Lehnt das Modell eine Anfrage ab, versucht die API es automatisch mit einem anderen Modell.
            "fallbacks": "default",
        ]

        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]

        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let message = (json["error"] as? [String: Any])?["message"] as? String ?? "HTTP \(http.statusCode)"
            if http.statusCode == 401 {
                throw LearningAIError.badResponse("API-Schlüssel ungültig")
            }
            throw LearningAIError.badResponse(message)
        }

        if json["stop_reason"] as? String == "refusal" {
            throw LearningAIError.refused
        }

        let blocks = json["content"] as? [[String: Any]] ?? []
        guard let text = blocks.last(where: { $0["type"] as? String == "text" })?["text"] as? String,
              let jsonData = text.data(using: .utf8) else {
            throw LearningAIError.badResponse("keine Textantwort")
        }
        do {
            return try JSONDecoder().decode(T.self, from: jsonData)
        } catch {
            throw LearningAIError.badResponse("ungültiges JSON")
        }
    }
}
