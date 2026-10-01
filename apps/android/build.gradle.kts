// AGP 9 compile le Kotlin lui-même : le plugin kotlin-android n'est déclaré ici
// que pour fixer la version du compilateur, jamais appliqué au module.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
