// swift-tools-version: 5.9

// Dieses Paket ist ein „App Playground“. Öffnen lässt es sich mit
// - Swift Playgrounds auf dem iPad (kostenlos im App Store)
// - Xcode auf dem Mac
import AppleProductTypes
import PackageDescription

let package = Package(
    name: "Vokabeltrainer",
    platforms: [
        .iOS("17.0"),
    ],
    products: [
        .iOSApplication(
            name: "Vokabeltrainer",
            targets: ["AppModule"],
            bundleIdentifier: "de.familie.VokabelTrainer",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .openBook),
            accentColor: .presetColor(.blue),
            supportedDeviceFamilies: [
                .pad,
                .phone,
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad])),
            ],
            capabilities: [
                .camera(purposeString: "Die Kamera wird benötigt, um Vokabellisten abzufotografieren."),
            ]
        ),
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "."
        ),
    ]
)
