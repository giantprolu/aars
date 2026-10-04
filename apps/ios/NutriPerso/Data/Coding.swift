import Foundation

/*
 * Deux écarts entre Codable et kotlinx.serialization, comblés ici pour que les
 * modèles restent ceux de l'app Android.
 */

/// La valeur d'un champ absent de la réponse.
protocol DefaultProvider {
    associatedtype Value: Codable & Sendable
    static var value: Value { get }
}

/**
 Un champ qui prend sa valeur par défaut quand le serveur l'omet ou le met à
 `null`. Codable, contrairement à kotlinx.serialization, exige sinon la clé,
 même quand la propriété a une valeur initiale.
 */
@propertyWrapper
struct Default<Provider: DefaultProvider>: Codable, Sendable {
    var wrappedValue: Provider.Value

    init(wrappedValue: Provider.Value) {
        self.wrappedValue = wrappedValue
    }

    init(from decoder: Decoder) throws {
        wrappedValue = try decoder.singleValueContainer().decode(Provider.Value.self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

extension KeyedDecodingContainer {
    func decode<P>(_ type: Default<P>.Type, forKey key: Key) throws -> Default<P> {
        try decodeIfPresent(type, forKey: key) ?? Default(wrappedValue: P.value)
    }
}

enum Empty<Element: Codable & Sendable>: DefaultProvider {
    static var value: [Element] { [] }
}

enum Zero: DefaultProvider {
    static var value: Double { 0 }
}

enum ZeroInt: DefaultProvider {
    static var value: Int { 0 }
}

enum False: DefaultProvider {
    static var value: Bool { false }
}

/**
 Un champ facultatif écrit `null` plutôt qu'omis. Les schémas Zod du serveur
 en `.nullable()` refusent une clé absente, et `JSONEncoder` omet les `nil`.
 */
@propertyWrapper
struct Nullable<Value: Codable & Sendable>: Codable, Sendable {
    var wrappedValue: Value?

    init(wrappedValue: Value?) {
        self.wrappedValue = wrappedValue
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        wrappedValue = container.decodeNil() ? nil : try container.decode(Value.self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let wrappedValue {
            try container.encode(wrappedValue)
        } else {
            try container.encodeNil()
        }
    }
}

extension KeyedDecodingContainer {
    func decode<V>(_ type: Nullable<V>.Type, forKey key: Key) throws -> Nullable<V> {
        try decodeIfPresent(type, forKey: key) ?? Nullable(wrappedValue: nil)
    }
}
