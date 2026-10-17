import Foundation

enum AnswerResult: Equatable {
    /// Genau richtig
    case correct
    /// Kleiner Tippfehler – zählt als richtig
    case almost
    case wrong

    var countsAsCorrect: Bool { self != .wrong }
}

/// Vergleicht eine eingetippte Antwort tolerant mit der Lösung.
/// - Groß-/Kleinschreibung, Satzzeichen, Akzente/Makrons sind egal.
/// - ä/ae, ö/oe, ü/ue, ß/ss werden gleich behandelt.
/// - Artikel (der/die/das, the/a) und „to“ vor englischen Verben sind optional.
/// - Klammerinhalte sind optional: „(sich) freuen“ ≙ „freuen“.
/// - Bei mehreren Bedeutungen („Haus, Gebäude“) reicht eine davon.
enum AnswerChecker {
    static func check(_ input: String, expected: String) -> AnswerResult {
        let given = split(input).map(normalize).filter { !$0.isEmpty }
        let solutions = alternatives(of: expected)
        guard !given.isEmpty, !solutions.isEmpty else { return .wrong }

        if given.contains(where: { solutions.contains($0) }) {
            return .correct
        }

        for g in given {
            for s in solutions {
                if levenshtein(g, s) <= tolerance(for: s) { return .almost }
            }
        }
        return .wrong
    }

    static func alternatives(of expected: String) -> [String] {
        var result = split(expected).map(normalize)
        result.append(normalize(expected))
        // „(sich) freuen“: auch mit Klammerinhalt akzeptieren
        let withParentheses = expected
            .replacingOccurrences(of: "(", with: " ")
            .replacingOccurrences(of: ")", with: " ")
        result += split(withParentheses).map(normalize)
        var seen = Set<String>()
        return result.filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    static func split(_ text: String) -> [String] {
        var t = text
        for sep in [" oder ", " or ", ";", "/", "|"] {
            t = t.replacingOccurrences(of: sep, with: ",")
        }
        // Kommas innerhalb von Klammern nicht als Trenner werten
        var parts: [String] = []
        var current = ""
        var depth = 0
        for ch in t {
            if ch == "(" || ch == "[" { depth += 1 }
            if ch == ")" || ch == "]" { depth = max(0, depth - 1) }
            if ch == "," && depth == 0 {
                parts.append(current)
                current = ""
            } else {
                current.append(ch)
            }
        }
        parts.append(current)
        return parts.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private static let optionalPrefixes = [
        "to ", "the ", "a ", "an ",
        "der ", "die ", "das ", "den ", "dem ", "des ", "ein ", "eine ", "einen ", "sich ",
    ]

    static func normalize(_ text: String) -> String {
        var t = text.lowercased()
        for (from, to) in [("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")] {
            t = t.replacingOccurrences(of: from, with: to)
        }
        t = t.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        t = t.replacingOccurrences(of: "\\([^)]*\\)", with: " ", options: .regularExpression)
        t = t.replacingOccurrences(of: "\\[[^\\]]*\\]", with: " ", options: .regularExpression)
        t = t.replacingOccurrences(of: "’", with: "'")
        t = String(t.unicodeScalars.map {
            CharacterSet.alphanumerics.contains($0) || $0 == "'" ? Character($0) : " "
        })
        t = t.split(whereSeparator: \.isWhitespace).joined(separator: " ")

        var changed = true
        while changed {
            changed = false
            for prefix in optionalPrefixes where t.hasPrefix(prefix) && t.count > prefix.count {
                t.removeFirst(prefix.count)
                changed = true
            }
        }
        return t
    }

    static func tolerance(for solution: String) -> Int {
        switch solution.count {
        case ..<4: return 0
        case ..<9: return 1
        default: return 2
        }
    }

    static func levenshtein(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var previous = Array(0...b.count)
        var current = [Int](repeating: 0, count: b.count + 1)
        for i in 1...a.count {
            current[0] = i
            for j in 1...b.count {
                let cost = a[i - 1] == b[j - 1] ? 0 : 1
                current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            }
            swap(&previous, &current)
        }
        return previous[b.count]
    }
}
