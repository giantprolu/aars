import SwiftUI

/// Le genre de saisie d'un champ : clavier, remplissage automatique, majuscules.
enum FieldKind {
    case text
    case email
    case password
    case newPassword
    case decimal
    case number
}

/**
 Champ de saisie de la maquette : 50 de haut, rayon 14, fond crème, filet qui
 passe à la couleur du domaine quand il a le focus.
 */
struct NutriField: View {
    @Binding var text: String
    var placeholder = ""
    var kind: FieldKind = .text
    var submitLabel: SubmitLabel = .next
    var onSubmit: (() -> Void)?
    var focusColor: Color = Domains.nutrition.textOnLight
    var prefix: String?
    /// Une unité après la saisie : « g ».
    var suffix: String?
    var height: CGFloat = 50
    var background: Color = Neutrals.card
    var border: Color? = Neutrals.fieldBorder
    var leadingIcon: Lucide?
    var leadingTint: Color = Domains.nutrition.textOnLight
    var textSize: CGFloat = 16

    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 0) {
            if let leadingIcon {
                LucideIcon(leadingIcon, 17, leadingTint).padding(.trailing, 10)
            }
            if let prefix {
                Text(prefix).textStyle(nt(textSize, 500, Neutrals.faint)).padding(.trailing, 2)
            }
            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(placeholder)
                        .textStyle(nt(leadingIcon != nil ? 14 : textSize, leadingIcon != nil ? 400 : 500, Neutrals.faint, line: 1.2))
                        .lineLimit(1)
                        .allowsHitTesting(false)
                }
                input
                    .textStyle(nt(textSize, 500, line: 1.2))
                    .tint(focusColor)
                    .focused($focused)
                    .submitLabel(submitLabel)
                    .onSubmit { onSubmit?() }
            }
            if let suffix {
                Text(suffix).textStyle(nt(14, 500, Neutrals.muted)).padding(.leading, 4)
            }
        }
        .padding(.horizontal, 14)
        .frame(height: height)
        .background(background, in: RoundedRectangle(cornerRadius: Radius.field))
        .overlay {
            if focused {
                RoundedRectangle(cornerRadius: Radius.field).strokeBorder(focusColor, lineWidth: 1.5)
            } else if let border {
                RoundedRectangle(cornerRadius: Radius.field).strokeBorder(border, lineWidth: 1)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }

    @ViewBuilder
    private var input: some View {
        switch kind {
        case .password, .newPassword:
            SecureField("", text: $text)
                .textContentType(kind == .password ? .password : .newPassword)
        case .email:
            TextField("", text: $text)
                .keyboardType(.emailAddress)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        case .decimal:
            TextField("", text: $text).keyboardType(.decimalPad)
        case .number:
            TextField("", text: $text).keyboardType(.numberPad)
        case .text:
            TextField("", text: $text)
        }
    }
}

/// Un champ et son libellé de 13/500, avec une aide facultative dessous.
struct Labeled<Content: View>: View {
    let label: String
    var hint: String?
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).textStyle(nt(13, 500))
            content
            if let hint { Text(hint).textStyle(nt(12.5, 400, Neutrals.muted)) }
        }
    }
}
