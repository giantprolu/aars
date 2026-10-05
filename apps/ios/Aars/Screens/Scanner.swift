import AVFoundation
import SwiftUI

private let softLight = Color(argb: 0xFFCFC8BF)

/// Un code-barres de 8, 12 ou 13 chiffres.
func isBarcode(_ value: String) -> Bool {
    value.wholeMatch(of: /\d{8}|\d{12}|\d{13}/) != nil
}

/// Un produit à compléter à la main avant de le noter : inconnu, ou incomplet chez Open Food Facts.
private struct Completion {
    let barcode: String
    let partial: PartialProduct?
}

enum CameraAccess {
    case unknown, granted, denied, unavailable

    static func request() async -> CameraAccess {
        guard AVCaptureDevice.default(for: .video) != nil else { return .unavailable }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return .granted
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video) ? .granted : .denied
        default: return .denied
        }
    }
}

/**
 Le scanner, ouvert par un appui long sur le + ou la tuile Scanner.

 La caméra lit le code (AVFoundation, sur l'appareil), le serveur le résout :
 cache produits, puis Open Food Facts. Un produit inconnu ou incomplet se
 complète à la main et entre au cache, comme sur la PWA.
 */
struct ScannerOverlay: View {
    let visible: Bool
    let model: AppModel
    let onDismiss: () -> Void
    let onFound: (SearchHit) -> Void

    @State private var access = CameraAccess.unknown
    @State private var code = ""
    @State private var message: String?
    @State private var busy = false
    @State private var completion: Completion?
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack {
            if visible {
                content
                    .transition(.opacity.combined(with: .offset(y: 40)))
            }
        }
        .animation(.easeOut(duration: 0.25), value: visible)
        .onChange(of: visible, initial: true) { _, shown in
            guard shown else { return }
            code = ""
            message = nil
            busy = false
            completion = nil
            Task { access = await CameraAccess.request() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let completion {
            CompletionForm(model: model, completion: completion, onDone: onFound) { self.completion = nil }
        } else {
            camera
        }
    }

    private var camera: some View {
        ZStack {
            Neutrals.scanner.ignoresSafeArea()
            if access == .granted {
                CameraPreview(paused: busy) { barcode in
                    Haptics.selection()
                    code = barcode
                    resolve(barcode)
                }
                .ignoresSafeArea()
            }
            VStack(spacing: 0) {
                HStack {
                    Text("Scanner un code-barres").textStyle(nt(17, 600, .white)).frame(maxWidth: .infinity, alignment: .leading)
                    CloseButton(dark: true, action: onDismiss)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                Text(status)
                    .textStyle(nt(12, 500, .white))
                    .padding(10)
                    .frame(width: 260, height: 160, alignment: .bottom)
                    .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Domains.nutrition.fill, lineWidth: 3))
                    .frame(maxHeight: .infinity)
                VStack(spacing: 10) {
                    if access == .denied {
                        PrimaryButton(text: "Autoriser la caméra", colors: Domains.nutrition, height: 48, textSize: 15) {
                            if let settings = URL(string: UIApplication.openSettingsURLString) { openURL(settings) }
                        }
                    }
                    NutriField(
                        text: $code,
                        placeholder: "Ou saisis le code",
                        kind: .number,
                        submitLabel: .search,
                        onSubmit: { resolve(code) },
                        focusColor: Domains.nutrition.fill
                    )
                    .filtered($code, onlyDigits(13))
                    .overlay(alignment: .trailing) {
                        Text("Chercher")
                            .textStyle(nt(14, 600, Domains.nutrition.textOnLight))
                            .padding(.horizontal, 14)
                            .frame(maxHeight: .infinity)
                            .tap { resolve(code) }
                    }
                    Text(message ?? "Ouvert par un appui long sur le +")
                        .textStyle(nt(13.5, 400, softLight))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
                .background(Neutrals.scanner.opacity(0.85).ignoresSafeArea(edges: .bottom))
            }
        }
        .preferredColorScheme(.dark)
    }

    private var status: String {
        if busy { return "Recherche du produit…" }
        switch access {
        case .denied: return "Caméra non autorisée"
        case .unavailable: return "Caméra indisponible"
        case .unknown, .granted: return "Vise le code-barres"
        }
    }

    private func resolve(_ barcode: String) {
        guard !busy else { return }
        guard isBarcode(barcode) else {
            message = "Un code-barres a 8, 12 ou 13 chiffres."
            return
        }
        busy = true
        message = nil
        Task {
            switch await model.resolveBarcode(barcode) {
            case .found(let hit): onFound(hit)
            case .incomplete(let partial): completion = Completion(barcode: barcode, partial: partial)
            case .unknown: completion = Completion(barcode: barcode, partial: nil)
            case .failed(let failure): message = failure
            }
            busy = false
        }
    }
}

/// La session de capture. `startRunning` bloque : elle démarre et s'arrête
/// sur sa propre file, que la session tolère (documentation d'AVFoundation).
final class CaptureSession: @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "fr.aars.camera")

    func start() {
        queue.async { if !self.session.isRunning { self.session.startRunning() } }
    }

    func stop() {
        queue.async { self.session.stopRunning() }
    }
}

/// L'aperçu caméra plein écran ; aucun code ne remonte tant que `paused` est vrai.
struct CameraPreview: UIViewRepresentable {
    let paused: Bool
    let onBarcode: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        context.coordinator.configure(view)
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {
        context.coordinator.paused = paused
        context.coordinator.onBarcode = onBarcode
    }

    static func dismantleUIView(_ view: PreviewView, coordinator: Coordinator) {
        coordinator.capture.stop()
    }

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

        var preview: AVCaptureVideoPreviewLayer? { layer as? AVCaptureVideoPreviewLayer }
    }

    @MainActor
    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        let capture = CaptureSession()
        var paused = false
        var onBarcode: (String) -> Void = { _ in }
        /// Le même code relu en boucle pendant qu'un échec s'affiche : on l'ignore 3 s.
        private var last: (code: String, at: Date)?

        func configure(_ view: PreviewView) {
            let session = capture.session
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device),
                  session.canAddInput(input)
            else { return }
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            // L'UPC-A arrive en EAN-13 précédé d'un zéro.
            output.metadataObjectTypes = [.ean13, .ean8, .upce].filter(output.availableMetadataObjectTypes.contains)
            view.preview?.session = session
            view.preview?.videoGravity = .resizeAspectFill
            capture.start()
        }

        nonisolated func metadataOutput(
            _ output: AVCaptureMetadataOutput,
            didOutput metadataObjects: [AVMetadataObject],
            from connection: AVCaptureConnection
        ) {
            let codes = metadataObjects.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }
            // La file du délégué est la file principale.
            MainActor.assumeIsolated { deliver(codes) }
        }

        private func deliver(_ codes: [String]) {
            guard !paused, let code = codes.first(where: isBarcode) else { return }
            if let last, last.code == code, Date().timeIntervalSince(last.at) < 3 { return }
            last = (code, Date())
            onBarcode(code)
        }
    }
}

/// Compléter un produit : nom et valeurs pour 100 g, préremplis de ce qu'Open Food Facts connaît.
private struct CompletionForm: View {
    let model: AppModel
    let completion: Completion
    let onDone: (SearchHit) -> Void
    let onBack: () -> Void

    @State private var name = ""
    @State private var kcal = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let partial = completion.partial
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(partial == nil ? "Produit inconnu" : "Produit incomplet")
                        .textStyle(nt(22, 600, tracking: -0.02))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    CloseButton(action: onBack)
                }
                Text(
                    partial == nil
                        ? "Le code \(completion.barcode) n'est ni dans la base ni chez Open Food Facts. Recopie l'étiquette, pour 100 g."
                        : "Open Food Facts ne donne pas toutes les valeurs. Complète-les d'après l'étiquette, pour 100 g."
                )
                .textStyle(nt(14, 400, Neutrals.muted))
                Labeled(label: "Nom") {
                    NutriField(text: $name, placeholder: "Nom du produit").filtered($name, maxLength(200))
                }
                Labeled(label: "Calories (kcal)") {
                    NutriField(text: $kcal, kind: .decimal).filtered($kcal, maxLength(6))
                }
                HStack(alignment: .top, spacing: 8) {
                    Labeled(label: "Protéines") { NutriField(text: $protein, kind: .decimal).filtered($protein, maxLength(6)) }
                    Labeled(label: "Glucides") { NutriField(text: $carbs, kind: .decimal).filtered($carbs, maxLength(6)) }
                    Labeled(label: "Lipides") { NutriField(text: $fat, kind: .decimal, submitLabel: .done).filtered($fat, maxLength(6)) }
                }
                if let error { Text(error).textStyle(nt(13, 500, Macros.protein.text)) }
                PrimaryButton(text: "Enregistrer le produit", colors: Domains.nutrition, height: 52, busy: busy, action: save)
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Neutrals.screen.ignoresSafeArea())
        .onAppear(perform: prefill)
    }

    private func shown(_ value: Double?) -> String {
        guard let value else { return "" }
        return value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value).replacingOccurrences(of: ".", with: ",")
    }

    private func prefill() {
        let partial = completion.partial
        name = partial?.name ?? ""
        kcal = shown(partial?.per100g.kcal)
        protein = shown(partial?.per100g.proteinG)
        carbs = shown(partial?.per100g.carbsG)
        fat = shown(partial?.per100g.fatG)
    }

    private func number(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let k = number(kcal), let p = number(protein), let c = number(carbs), let f = number(fat) else {
            error = "Le nom et les quatre valeurs sont nécessaires."
            return
        }
        busy = true
        Task {
            let hit = await model.saveManualProduct(
                barcode: completion.barcode,
                name: trimmed,
                per100g: MacroValues(kcal: k, proteinG: p, carbsG: c, fatG: f),
                servingSizeG: completion.partial?.servingSizeG
            )
            busy = false
            if let hit { onDone(hit) } else { error = "Le produit n'a pas pu être enregistré." }
        }
    }
}
