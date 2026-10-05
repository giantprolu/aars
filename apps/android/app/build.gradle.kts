import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// L'adresse de l'API se règle dans local.properties (non versionné), par
// exemple `nutriperso.apiUrl=http://10.0.2.2:3000` pour le serveur de dev vu
// depuis l'émulateur. Par défaut : la production.
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}
val apiUrl: String = localProperties.getProperty("nutriperso.apiUrl")
    ?: "https://nutri-rosy-one.vercel.app"

// Signature de publication : jamais dans le dépôt. `keystore.properties` (non
// versionné, à côté de `local.properties`) ou les variables d'environnement
// de la CI. Sans elles, `bundleRelease` produit un bundle non signé, refusé
// par la Play Console, ce qui vaut mieux qu'une clé de debug par erreur.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use(::load)
}
fun signingValue(key: String, env: String): String? =
    keystoreProperties.getProperty(key) ?: System.getenv(env)
val releaseStoreFile = signingValue("storeFile", "NUTRI_UPLOAD_STORE_FILE")

// Chaque envoi à la Play Console exige un versionCode plus grand que le
// précédent : la CI le passe par `-Pnutriperso.versionCode=…`.
val appVersionCode = (findProperty("nutriperso.versionCode") as String?)?.toIntOrNull() ?: 1
val appVersionName = (findProperty("nutriperso.versionName") as String?) ?: "1.0.0"

android {
    namespace = "fr.nutriperso.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "fr.nutriperso.app"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName
        buildConfigField("String", "API_BASE_URL", "\"${apiUrl.trimEnd('/')}\"")
    }

    signingConfigs {
        if (releaseStoreFile != null) {
            create("upload") {
                storeFile = rootProject.file(releaseStoreFile)
                storePassword = signingValue("storePassword", "NUTRI_UPLOAD_STORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "NUTRI_UPLOAD_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "NUTRI_UPLOAD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.findByName("upload")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.animation)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.camera.mlkit)
    implementation(libs.mlkit.barcode)
    implementation(libs.androidx.health.connect)
    // Photos des plats, servies par Vercel Blob. Le module réseau réutilise OkHttp.
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.play.billing)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
}
