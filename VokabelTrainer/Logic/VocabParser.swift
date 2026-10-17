import Foundation

/// Erkennt Vokabelpaare in erkanntem Text (ohne KI).
/// Funktioniert gut mit typischen Vokabellisten:
///   house – Haus
///   amicus, -i m.    Freund
///   to go = gehen
/// Spalten aus Fotos werden von der Texterkennung mit Tabulator getrennt.
enum VocabParser {
    private static let inlineSeparators = [" – ", " — ", " - ", " = ", " : ", ": ", " -> ", " → ", " ; "]

    static func parse(_ text: String) -> [WordPair] {
        text
            .components(separatedBy: .newlines)
            .compactMap(parseLine)
    }

    static func parseLine(_ rawLine: String) -> WordPair? {
        let line = rawLine
            .replacingOccurrences(of: "|", with: "\t")
            .trimmingCharacters(in: .whitespaces)
        guard line.count >= 3 else { return nil }

        // 1. Spalten (Tabulator oder mehrere Leerzeichen)
        let columns = line
            .replacingOccurrences(of: "\\s{3,}", with: "\t", options: .regularExpression)
            .components(separatedBy: "\t")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        if columns.count >= 3 {
            return make(term: columns[0],
                        translation: columns[columns.count - 1],
                        note: columns[1..<(columns.count - 1)].joined(separator: " "))
        }
        if columns.count == 2 {
            return make(term: columns[0], translation: columns[1])
        }

        // 2. Trennzeichen innerhalb der Zeile
        for sep in inlineSeparators {
            if let range = line.range(of: sep) {
                let left = String(line[..<range.lowerBound])
                let right = String(line[range.upperBound...])
                return make(term: left, translation: right)
            }
        }

        // 3. Zwei Leerzeichen als letzte Möglichkeit
        if let range = line.range(of: "  ") {
            return make(term: String(line[..<range.lowerBound]), translation: String(line[range.upperBound...]))
        }
        return nil
    }

    private static func make(term: String, translation: String, note: String = "") -> WordPair? {
        let t = clean(term), tr = clean(translation)
        guard !t.isEmpty, !tr.isEmpty else { return nil }
        // Seitenzahlen o. Ä. ignorieren
        guard t.rangeOfCharacter(from: .letters) != nil, tr.rangeOfCharacter(from: .letters) != nil else { return nil }
        return WordPair(term: t, translation: tr, note: clean(note))
    }

    private static func clean(_ s: String) -> String {
        var t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        // Aufzählungszeichen und Nummerierung am Anfang entfernen („1.“, „•“, „-“)
        t = t.replacingOccurrences(of: "^([0-9]+[.)]\\s*|[•·*\\-–]\\s+)", with: "", options: .regularExpression)
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
