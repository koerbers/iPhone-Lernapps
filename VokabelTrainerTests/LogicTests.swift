import Foundation
import Testing
@testable import VokabelTrainer

struct AnswerCheckerTests {
    @Test func exactAnswerIsCorrect() {
        #expect(AnswerChecker.check("Haus", expected: "Haus") == .correct)
    }

    @Test func caseAndPunctuationDoNotMatter() {
        #expect(AnswerChecker.check("  haus! ", expected: "Haus") == .correct)
    }

    @Test func oneOfSeveralMeaningsIsEnough() {
        #expect(AnswerChecker.check("Landhaus", expected: "Haus, Landhaus") == .correct)
        #expect(AnswerChecker.check("nennen", expected: "rufen; nennen") == .correct)
    }

    @Test func umlautsCanBeWrittenOut() {
        #expect(AnswerChecker.check("Fruehstueck", expected: "Frühstück") == .correct)
        #expect(AnswerChecker.check("gross", expected: "groß") == .correct)
    }

    @Test func articlesAndToAreOptional() {
        #expect(AnswerChecker.check("go", expected: "to go") == .correct)
        #expect(AnswerChecker.check("der Hund", expected: "Hund") == .correct)
        #expect(AnswerChecker.check("Freund", expected: "der Freund") == .correct)
    }

    @Test func parenthesesAreOptional() {
        #expect(AnswerChecker.check("freuen", expected: "(sich) freuen") == .correct)
        #expect(AnswerChecker.check("sich freuen", expected: "(sich) freuen") == .correct)
    }

    @Test func smallTypoIsAlmost() {
        #expect(AnswerChecker.check("Schuhle", expected: "Schule") == .almost)
        #expect(AnswerChecker.check("beautifull", expected: "beautiful") == .almost)
    }

    @Test func wrongAnswerIsWrong() {
        #expect(AnswerChecker.check("Katze", expected: "Hund") == .wrong)
        #expect(AnswerChecker.check("", expected: "Hund") == .wrong)
        // Kurze Wörter: kein Tippfehler-Bonus
        #expect(AnswerChecker.check("et", expected: "ut") == .wrong)
    }

    @Test func levenshtein() {
        #expect(AnswerChecker.levenshtein("kitten", "sitting") == 3)
        #expect(AnswerChecker.levenshtein("", "abc") == 3)
        #expect(AnswerChecker.levenshtein("abc", "abc") == 0)
    }
}

struct VocabParserTests {
    @Test func parsesDashSeparatedLines() {
        let pairs = VocabParser.parse("house – Haus\nto go - gehen\nfriend = Freund")
        #expect(pairs.map(\.term) == ["house", "to go", "friend"])
        #expect(pairs.map(\.translation) == ["Haus", "gehen", "Freund"])
    }

    @Test func parsesColumnsFromTextRecognition() {
        let pairs = VocabParser.parse("amicus, -i m.\tFreund\nvilla, -ae f.\t\tHaus, Landhaus")
        #expect(pairs.count == 2)
        #expect(pairs[0].term == "amicus, -i m.")
        #expect(pairs[0].translation == "Freund")
        #expect(pairs[1].translation == "Haus, Landhaus")
    }

    @Test func threeColumnsPutMiddleIntoNote() {
        let pairs = VocabParser.parse("vocare\tvoco, vocavi\trufen")
        #expect(pairs.first?.term == "vocare")
        #expect(pairs.first?.note == "voco, vocavi")
        #expect(pairs.first?.translation == "rufen")
    }

    @Test func ignoresHeadingsAndNumbers() {
        let pairs = VocabParser.parse("Lektion 3\n12\t13\n1. dog – Hund")
        #expect(pairs.count == 1)
        #expect(pairs.first?.term == "dog")
    }
}

struct SpacedRepetitionTests {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let calendar = Calendar(identifier: .gregorian)

    @Test func correctAnswerMovesUpAndDelays() {
        let s = SpacedRepetition.review(.new, correct: true, now: now, calendar: calendar)
        #expect(s.box == 1)
        #expect(s.due > now)
        let s2 = SpacedRepetition.review(s, correct: true, now: now, calendar: calendar)
        #expect(s2.box == 2)
        #expect(s2.due > s.due)
    }

    @Test func wrongAnswerFallsBackAndIsDueImmediately() {
        var s = ReviewState(box: 5, due: now, correct: 5, wrong: 0, lastReviewed: nil)
        s = SpacedRepetition.review(s, correct: false, now: now, calendar: calendar)
        #expect(s.box == 1)
        #expect(s.wrong == 1)
        #expect(SpacedRepetition.isDue(s, now: now))
    }

    @Test func oftenWrongWordsComeBackSooner() {
        let easy = ReviewState(box: 3, due: now, correct: 3, wrong: 0, lastReviewed: nil)
        let hard = ReviewState(box: 3, due: now, correct: 3, wrong: 5, lastReviewed: nil)
        let e = SpacedRepetition.review(easy, correct: true, now: now, calendar: calendar)
        let h = SpacedRepetition.review(hard, correct: true, now: now, calendar: calendar)
        #expect(h.due < e.due)
        #expect(SpacedRepetition.priority(hard, now: now) > SpacedRepetition.priority(easy, now: now))
    }

    @Test func boxIsCapped() {
        var s = ReviewState(box: SpacedRepetition.maxBox, due: now, correct: 10, wrong: 0, lastReviewed: nil)
        s = SpacedRepetition.review(s, correct: true, now: now, calendar: calendar)
        #expect(s.box == SpacedRepetition.maxBox)
    }
}

struct StatsTests {
    @Test func streakCountsConsecutiveDays() {
        let calendar = Calendar(identifier: .gregorian)
        let today = calendar.startOfDay(for: Date())
        let days: Set<Date> = Set((0..<3).compactMap { calendar.date(byAdding: .day, value: -$0, to: today) })
        #expect(Stats.streak(days: days, calendar: calendar) == 3)
    }

    @Test func streakIsZeroAfterBreak() {
        let calendar = Calendar(identifier: .gregorian)
        let today = calendar.startOfDay(for: Date())
        let old = calendar.date(byAdding: .day, value: -3, to: today)!
        #expect(Stats.streak(days: [old], calendar: calendar) == 0)
    }
}
