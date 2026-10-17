import AVFoundation

/// Liest englische Wörter vor.
@MainActor
enum Speech {
    private static let synthesizer = AVSpeechSynthesizer()

    static func speakEnglish(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-GB")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        synthesizer.stopSpeaking(at: .immediate)
        synthesizer.speak(utterance)
    }
}
