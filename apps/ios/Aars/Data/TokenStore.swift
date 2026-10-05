import Foundation
import Security

/**
 Le jeton de session, dans le trousseau.

 Il remplace le cookie de la PWA. Il n'est lisible qu'une fois l'appareil
 déverrouillé depuis le démarrage, et ne part ni dans les sauvegardes ni vers
 un autre appareil (`ThisDeviceOnly`).
 */
enum TokenStore {
    private static let service = "fr.aars.app.session"
    private static let account = "token"
    private static let installedKey = "installed"

    /**
     Le trousseau survit à la désinstallation de l'app, contrairement aux
     préférences : une réinstallation retrouverait la session. Au premier
     lancement, on la ferme, comme Android le fait en effaçant ses données.
     */
    static func forgetPreviousInstall() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: installedKey) else { return }
        clear()
        defaults.set(true, forKey: installedKey)
    }

    static func read() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ token: String) {
        clear()
        var query = baseQuery
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
