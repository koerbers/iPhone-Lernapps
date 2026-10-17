import SwiftUI

/// Ergebnis am Ende einer Runde.
struct SessionResultView: View {
    let correct: Int
    let total: Int
    let missed: [String]
    let onDone: () -> Void

    private var ratio: Double { total > 0 ? Double(correct) / Double(total) : 0 }

    private var stars: Int {
        switch ratio {
        case 0.9...: return 3
        case 0.7...: return 2
        case 0.4...: return 1
        default: return 0
        }
    }

    private var message: String {
        switch stars {
        case 3: return "Super gemacht!"
        case 2: return "Gut gemacht!"
        case 1: return "Weiter so – Übung macht den Meister!"
        default: return "Nicht aufgeben – die schweren Wörter kommen bald wieder."
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                HStack {
                    ForEach(0..<3) { i in
                        Image(systemName: i < stars ? "star.fill" : "star")
                            .font(.system(size: 44))
                            .foregroundStyle(.yellow)
                    }
                }
                .padding(.top, 40)

                Text(message).font(.title2.bold()).multilineTextAlignment(.center)
                Text("\(correct) von \(total) beim ersten Versuch richtig")
                    .font(.title3)
                    .foregroundStyle(.secondary)

                if !missed.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Diese üben wir bald nochmal:").font(.headline)
                        ForEach(missed, id: \.self) { line in
                            Label(line, systemImage: "arrow.counterclockwise")
                                .font(.callout)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
                }

                Button("Fertig", action: onDone)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
            .padding()
        }
    }
}
