import Foundation
import PDFKit
import UIKit
import Vision

enum TextRecognizerError: LocalizedError {
    case invalidImage
    case invalidPDF

    var errorDescription: String? {
        switch self {
        case .invalidImage: return "Das Bild konnte nicht gelesen werden."
        case .invalidPDF: return "Die PDF-Datei konnte nicht geöffnet werden."
        }
    }
}

/// Texterkennung direkt auf dem iPhone (Apple Vision) – funktioniert offline.
enum TextRecognizer {
    /// Erkennt Text in einem Foto. Nebeneinanderliegende Textblöcke (z. B. Spalten einer
    /// Vokabelliste) werden zu einer Zeile zusammengefasst und mit Tabulator getrennt.
    static func recognize(image: UIImage) async throws -> String {
        guard let cgImage = image.cgImage else { throw TextRecognizerError.invalidImage }
        let orientation = CGImagePropertyOrientation(image.imageOrientation)

        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.recognitionLanguages = ["de-DE", "en-US"]
                // Keine Autokorrektur – sonst werden lateinische Wörter „verbessert“.
                request.usesLanguageCorrection = false

                let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation)
                do {
                    try handler.perform([request])
                    continuation.resume(returning: groupIntoLines(request.results ?? []))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    static func recognize(imageData: Data) async throws -> String {
        guard let image = UIImage(data: imageData) else { throw TextRecognizerError.invalidImage }
        return try await recognize(image: image)
    }

    /// Liest den Text einer PDF. Seiten ohne Textebene (eingescannt) werden per Texterkennung gelesen.
    @MainActor
    static func text(fromPDF data: Data) async throws -> String {
        guard let document = PDFDocument(data: data) else { throw TextRecognizerError.invalidPDF }
        var pages: [String] = []
        for i in 0..<document.pageCount {
            guard let page = document.page(at: i) else { continue }
            let text = page.string ?? ""
            if text.trimmingCharacters(in: .whitespacesAndNewlines).count > 30 {
                pages.append(text)
            } else {
                let bounds = page.bounds(for: .mediaBox)
                let scale = 2400 / max(bounds.width, bounds.height, 1)
                let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
                let image = page.thumbnail(of: size, for: .mediaBox)
                pages.append(try await recognize(image: image))
            }
        }
        return pages.joined(separator: "\n")
    }

    private static func groupIntoLines(_ observations: [VNRecognizedTextObservation]) -> String {
        let items: [(box: CGRect, text: String)] = observations.compactMap { obs in
            guard let text = obs.topCandidates(1).first?.string else { return nil }
            return (obs.boundingBox, text)
        }
        // Vision-Koordinaten: Ursprung unten links → nach oben absteigend sortieren
        let sorted = items.sorted { $0.box.midY > $1.box.midY }

        var rows: [[(box: CGRect, text: String)]] = []
        for item in sorted {
            if let reference = rows.last?.first,
               abs(reference.box.midY - item.box.midY) < max(reference.box.height, item.box.height) * 0.6 {
                rows[rows.count - 1].append(item)
            } else {
                rows.append([item])
            }
        }

        return rows
            .map { row in row.sorted { $0.box.minX < $1.box.minX }.map(\.text).joined(separator: "\t") }
            .joined(separator: "\n")
    }
}

extension CGImagePropertyOrientation {
    init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}

extension UIImage {
    /// Verkleinert das Bild (für den Versand an die KI) und liefert JPEG-Daten.
    func jpegForUpload(maxDimension: CGFloat = 1800) -> Data? {
        let longest = max(size.width, size.height)
        let scale = min(1, maxDimension / max(longest, 1))
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }
}
