package fr.nutriperso.app.ui.add

import android.Manifest
import android.content.pm.PackageManager
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import fr.nutriperso.app.AppModel
import fr.nutriperso.app.data.MacroValues
import fr.nutriperso.app.data.PartialProduct
import fr.nutriperso.app.data.SearchHit
import fr.nutriperso.app.ui.components.CloseButton
import fr.nutriperso.app.ui.components.Labeled
import fr.nutriperso.app.ui.components.NutriField
import fr.nutriperso.app.ui.components.PrimaryButton
import fr.nutriperso.app.ui.components.Txt
import fr.nutriperso.app.ui.theme.Domains
import fr.nutriperso.app.ui.theme.Motion
import fr.nutriperso.app.ui.theme.Neutrals
import fr.nutriperso.app.ui.theme.nt
import kotlinx.coroutines.launch

private val BARCODE = Regex("^\\d{8}$|^\\d{12}$|^\\d{13}$")
private val SoftLight = Color(0xFFCFC8BF)

/** Un produit à compléter à la main avant de le noter : inconnu, ou incomplet chez Open Food Facts. */
private data class Completion(val barcode: String, val partial: PartialProduct?)

/**
 * Le scanner, ouvert par un appui long sur le + ou la tuile Scanner.
 *
 * La caméra lit le code (ML Kit, sur l'appareil), le serveur le résout :
 * cache produits, puis Open Food Facts. Un produit inconnu ou incomplet se
 * complète à la main et entre au cache, comme sur la PWA.
 */
@Composable
fun BoxScope.ScannerOverlay(visible: Boolean, model: AppModel, onDismiss: () -> Unit, onFound: (SearchHit) -> Unit) {
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    var code by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var completion by remember { mutableStateOf<Completion?>(null) }

    LaunchedEffect(visible) {
        if (visible) {
            code = ""
            message = null
            busy = false
            completion = null
            if (!granted) permission.launch(Manifest.permission.CAMERA)
        }
    }

    fun resolve(barcode: String) {
        if (busy) return
        if (!BARCODE.matches(barcode)) {
            message = "Un code-barres a 8, 12 ou 13 chiffres."
            return
        }
        busy = true
        message = null
        scope.launch {
            when (val outcome = model.resolveBarcode(barcode)) {
                is AppModel.BarcodeOutcome.Found -> onFound(outcome.hit)
                is AppModel.BarcodeOutcome.Incomplete -> completion = Completion(barcode, outcome.partial)
                is AppModel.BarcodeOutcome.Unknown -> completion = Completion(barcode, null)
                is AppModel.BarcodeOutcome.Failed -> message = outcome.message
            }
            busy = false
        }
    }

    AnimatedVisibility(
        visible,
        enter = fadeIn(tween(250)) + slideInVertically(tween(Motion.SHEET_IN_MS, easing = Motion.sheet)) { it / 12 },
        exit = fadeOut(tween(200)) + slideOutVertically(tween(250)) { it / 12 },
    ) {
        Box(Modifier.fillMaxSize().background(Neutrals.scanner).pointerInput(Unit) { detectTapGestures { } }) {
            val pending = completion
            if (pending != null) {
                CompletionForm(model, pending, onDone = onFound, onBack = { completion = null })
                return@Box
            }
            if (granted && visible) {
                CameraPreview(paused = busy) { barcode ->
                    view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                    code = barcode
                    resolve(barcode)
                }
            }
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
                Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Txt("Scanner un code-barres", nt(17f, 600, Color.White), Modifier.weight(1f))
                    CloseButton(onDismiss, dark = true)
                }
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Box(
                        Modifier.size(260.dp, 160.dp).border(3.dp, Domains.nutrition.fill, RoundedCornerShape(22.dp)).padding(10.dp),
                        contentAlignment = Alignment.BottomCenter,
                    ) {
                        Txt(
                            when {
                                busy -> "Recherche du produit…"
                                !granted -> "Caméra non autorisée"
                                else -> "Vise le code-barres"
                            },
                            nt(12f, 500, Color.White),
                        )
                    }
                }
                Column(
                    Modifier.background(Neutrals.scanner.copy(alpha = 0.85f)).padding(horizontal = 24.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (!granted) {
                        PrimaryButton("Autoriser la caméra", Domains.nutrition, { permission.launch(Manifest.permission.CAMERA) }, height = 48.dp, textSize = 15f)
                    }
                    NutriField(
                        code,
                        { code = it.filter(Char::isDigit).take(13) },
                        placeholder = "Ou saisis le code",
                        keyboardType = KeyboardType.Number,
                        imeAction = ImeAction.Search,
                        onDone = { resolve(code) },
                        focusColor = Domains.nutrition.fill,
                        trailing = {
                            Txt("Chercher", nt(14f, 600, Domains.nutrition.textOnLight), Modifier.clip(RoundedCornerShape(8.dp)).padding(4.dp).pointerInput(code) { detectTapGestures { resolve(code) } })
                        },
                    )
                    Txt(
                        message ?: "Ouvert par un appui long sur le +",
                        nt(13.5f, color = SoftLight),
                        Modifier.fillMaxWidth(),
                        align = TextAlign.Center,
                    )
                }
            }
        }
    }
}

/** L'aperçu caméra plein écran ; aucun code ne remonte tant que [paused] est vrai. */
@Composable
fun CameraPreview(paused: Boolean, onBarcode: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val latest by rememberUpdatedState(onBarcode)
    val isPaused by rememberUpdatedState(paused)
    val scanner: BarcodeScanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E)
                .build(),
        )
    }
    val controller = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.IMAGE_ANALYSIS)
        }
    }
    DisposableEffect(lifecycle) {
        val executor = ContextCompat.getMainExecutor(context)
        controller.setImageAnalysisAnalyzer(
            executor,
            MlKitAnalyzer(listOf(scanner), CameraController.COORDINATE_SYSTEM_VIEW_REFERENCED, executor) { result ->
                if (isPaused) return@MlKitAnalyzer
                val value = result.getValue(scanner)?.firstNotNullOfOrNull { it.rawValue?.takeIf(BARCODE::matches) }
                if (value != null) latest(value)
            },
        )
        controller.bindToLifecycle(lifecycle)
        onDispose {
            controller.unbind()
            scanner.close()
        }
    }
    AndroidView(
        factory = { viewContext ->
            PreviewView(viewContext).apply {
                this.controller = controller
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }
        },
        modifier = Modifier.fillMaxSize(),
    )
}

/** Compléter un produit : nom et valeurs pour 100 g, préremplis de ce qu'Open Food Facts connaît. */
@Composable
private fun CompletionForm(model: AppModel, completion: Completion, onDone: (SearchHit) -> Unit, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val partial = completion.partial
    fun shown(value: Double?) = value?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString().replace('.', ',') } ?: ""
    var name by remember { mutableStateOf(partial?.name.orEmpty()) }
    var kcal by remember { mutableStateOf(shown(partial?.per100g?.kcal)) }
    var protein by remember { mutableStateOf(shown(partial?.per100g?.proteinG)) }
    var carbs by remember { mutableStateOf(shown(partial?.per100g?.carbsG)) }
    var fat by remember { mutableStateOf(shown(partial?.per100g?.fatG)) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val number = { text: String -> text.trim().replace(',', '.').toDoubleOrNull() }

    Column(
        Modifier.fillMaxSize().background(Neutrals.screen).statusBarsPadding().navigationBarsPadding().imePadding()
            .verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt(if (partial == null) "Produit inconnu" else "Produit incomplet", nt(22f, 600, tracking = -0.02f), Modifier.weight(1f))
            CloseButton(onBack)
        }
        Txt(
            if (partial == null) "Le code ${completion.barcode} n'est ni dans la base ni chez Open Food Facts. Recopie l'étiquette, pour 100 g."
            else "Open Food Facts ne donne pas toutes les valeurs. Complète-les d'après l'étiquette, pour 100 g.",
            nt(14f, color = Neutrals.muted),
        )
        Labeled("Nom") { NutriField(name, { name = it.take(200) }, placeholder = "Nom du produit") }
        Labeled("Calories (kcal)") { NutriField(kcal, { kcal = it.take(6) }, keyboardType = KeyboardType.Decimal) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) { Labeled("Protéines") { NutriField(protein, { protein = it.take(6) }, keyboardType = KeyboardType.Decimal) } }
            Column(Modifier.weight(1f)) { Labeled("Glucides") { NutriField(carbs, { carbs = it.take(6) }, keyboardType = KeyboardType.Decimal) } }
            Column(Modifier.weight(1f)) { Labeled("Lipides") { NutriField(fat, { fat = it.take(6) }, keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done) } }
        }
        error?.let { Txt(it, nt(13f, 500, fr.nutriperso.app.ui.theme.Macros.protein.text)) }
        val values = listOf(kcal, protein, carbs, fat).map(number)
        PrimaryButton(
            "Enregistrer le produit",
            Domains.nutrition,
            {
                val (k, p, c, f) = values
                if (name.isBlank() || k == null || p == null || c == null || f == null) {
                    error = "Le nom et les quatre valeurs sont nécessaires."
                } else {
                    busy = true
                    scope.launch {
                        val hit = model.saveManualProduct(completion.barcode, name.trim(), MacroValues(k, p, c, f), partial?.servingSizeG)
                        busy = false
                        if (hit == null) error = "Le produit n'a pas pu être enregistré." else onDone(hit)
                    }
                }
            },
            height = 52.dp,
            busy = busy,
        )
    }
}
