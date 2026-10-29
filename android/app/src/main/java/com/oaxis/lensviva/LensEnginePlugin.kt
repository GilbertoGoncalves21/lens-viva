package com.oaxis.lensviva

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.provider.Settings
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions

private const val CAMERA_PERMISSION_ALIAS: String = "camera"

@CapacitorPlugin(
    name = "LensEngine",
    permissions = [Permission(alias = CAMERA_PERMISSION_ALIAS, strings = [Manifest.permission.CAMERA])],
)
class LensEnginePlugin : Plugin(), CameraSessionListener, TextFrameListener {
    private lateinit var analysisExecutor: GuardedExecutor
    private lateinit var cameraSession: CameraSession
    private lateinit var languageIdentifier: LanguageIdentifier
    private lateinit var textFrameAnalyzer: TextFrameAnalyzer
    @Volatile private lateinit var textRecognizer: TextRecognizer
    private val textRecognizers: MutableMap<String, TextRecognizer> = mutableMapOf()
    private lateinit var translationEngine: TranslationEngine

    override fun load() {
        val viewSizeTracker: ViewSizeTracker = ViewSizeTracker()

        analysisExecutor = GuardedExecutor()
        textRecognizer = recognizerFor("en")
        textFrameAnalyzer = TextFrameAnalyzer(analysisExecutor, this, { textRecognizer }, viewSizeTracker)
        cameraSession = CameraSession(activity, analysisExecutor, this, viewSizeTracker)
        translationEngine = TranslationEngine()
        languageIdentifier = LanguageIdentifier()
    }

    override fun handleOnConfigurationChanged(newConfig: Configuration) {
        super.handleOnConfigurationChanged(newConfig)
        activity.window.decorView.post { cameraSession.updateTargetRotation() }
    }

    override fun handleOnDestroy() {
        textFrameAnalyzer.reset()
        cameraSession.stop()
        textRecognizers.values.forEach { it.close() }
        textRecognizers.clear()
        translationEngine.close()
        languageIdentifier.close()
        analysisExecutor.shutdown()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun deleteModel(call: PluginCall) {
        val language: String = requireString(call, LANGUAGE_KEY) ?: return

        translationEngine.deleteModel(language, unitCallback(call))
    }

    @PluginMethod
    fun downloadModel(call: PluginCall) {
        val language: String = requireString(call, LANGUAGE_KEY) ?: return
        val requireWifi: Boolean = call.getBoolean(REQUIRE_WIFI_KEY, false) ?: false

        translationEngine.downloadModel(language, requireWifi, unitCallback(call))
    }

    @PluginMethod
    fun freezeFrame(call: PluginCall) {
        activity.runOnUiThread {
            if (!cameraSession.isRunning()) {
                call.reject("The camera is not running", LensEngineErrorCode.CAMERA_NOT_STARTED)
                return@runOnUiThread
            }

            textFrameAnalyzer.setFrozen(true)

            val frozenFrame: Bitmap? = cameraSession.freeze()

            if (frozenFrame == null) {
                textFrameAnalyzer.setFrozen(false)
                call.reject("The current frame could not be captured", LensEngineErrorCode.FREEZE_FAILED)
                return@runOnUiThread
            }

            call.resolve()
            textFrameAnalyzer.analyzeFrozen(frozenFrame)
        }
    }

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val response: JSObject = JSObject()

        EngineCapabilities.ON_DEVICE.entries().forEach { (key: String, supported: Boolean) -> response.put(key, supported) }
        call.resolve(response)
    }

    @PluginMethod
    fun getDownloadedModels(call: PluginCall) {
        translationEngine.downloadedLanguages(object : EngineCallback<List<String>> {
            override fun onFailure(exception: LensEngineException) {
                rejectWith(call, exception)
            }

            override fun onSuccess(value: List<String>) {
                val response: JSObject = JSObject()
                response.put(LANGUAGES_KEY, JSArray(value))
                call.resolve(response)
            }
        })
    }

    @PluginMethod
    fun identifyLanguage(call: PluginCall) {
        val text: String = requireString(call, TEXT_KEY) ?: return

        languageIdentifier.identify(text, object : EngineCallback<LanguageCandidate> {
            override fun onFailure(exception: LensEngineException) {
                rejectWith(call, exception)
            }

            override fun onSuccess(value: LanguageCandidate) {
                val response: JSObject = JSObject()
                response.put(CONFIDENCE_KEY, value.confidence)
                response.put(LANGUAGE_KEY, value.language)
                call.resolve(response)
            }
        })
    }

    @PluginMethod
    fun listCameras(call: PluginCall) {
        val response: JSObject = JSObject()

        response.put(CAMERAS_KEY, JSArray())
        call.resolve(response)
    }

    override fun onCameraError(code: String, message: String) {
        emitEngineError(code, message)
    }

    override fun onFrameFailed(code: String, message: String) {
        emitEngineError(code, message)
    }

    override fun onFrameRecognized(event: JSObject) {
        notifyListeners(TEXT_RECOGNIZED_EVENT, event)
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent: Intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts(PACKAGE_SCHEME, context.packageName, null))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        try {
            context.startActivity(intent)
            call.resolve()
        } catch (exception: ActivityNotFoundException) {
            call.reject("The app settings could not be opened", LensEngineErrorCode.SETTINGS_UNAVAILABLE, exception)
        }
    }

    @PluginMethod
    fun pauseAnalysis(call: PluginCall) {
        textFrameAnalyzer.setPaused(true)
        call.resolve()
    }

    @PluginMethod
    fun resumeAnalysis(call: PluginCall) {
        textFrameAnalyzer.setPaused(false)
        call.resolve()
    }

    @PluginMethod
    fun selectCamera(call: PluginCall) {
        call.reject("Camera selection is not supported on this device", LensEngineErrorCode.CAMERA_SELECTION_UNSUPPORTED)
    }

    @PluginMethod
    fun setAnalysisRate(call: PluginCall) {
        val analysesPerSecond: Double? = call.getDouble(ANALYSES_PER_SECOND_KEY)

        if (analysesPerSecond == null) {
            call.reject("analysesPerSecond is required", LensEngineErrorCode.INVALID_ARGUMENT)
            return
        }

        textFrameAnalyzer.setAnalysesPerSecond(analysesPerSecond)
        call.resolve()
    }

    @PluginMethod
    fun setPreviewViewport(call: PluginCall) {
        activity.runOnUiThread {
            cameraSession.setPreviewViewport(readViewport(call))
            call.resolve()
        }
    }

    @PluginMethod
    fun startCamera(call: PluginCall) {
        if (getPermissionState(CAMERA_PERMISSION_ALIAS) != PermissionState.GRANTED) {
            call.reject("Camera permission has not been granted", LensEngineErrorCode.PERMISSION_DENIED)
            return
        }

        val analysesPerSecond: Double = AnalysisPolicy.clampAnalysesPerSecond(call.getDouble(ANALYSES_PER_SECOND_KEY))

        activity.runOnUiThread {
            // Recognition languages are ordered target first, explicit source last.
            val languages: JSArray? = call.getArray("recognitionLanguages")
            val source: String = languages?.optString(languages.length() - 1, "en") ?: "en"
            textFrameAnalyzer.invalidate()
            textRecognizer = recognizerFor(source)
            if (!cameraSession.isActive()) {
                textFrameAnalyzer.reset()
            }

            textFrameAnalyzer.setAnalysesPerSecond(analysesPerSecond)
            cameraSession.setPreviewViewport(readViewport(call))
            cameraSession.start(bridge.webView, textFrameAnalyzer, cameraStartCallback(call))
        }
    }

    private fun recognizerFor(language: String): TextRecognizer {
        val script: String = when (language) {
            "ja", "zh", "ko" -> language
            "hi", "mr" -> "hi"
            else -> "latin"
        }
        return textRecognizers.getOrPut(script) {
            when (script) {
                "ja" -> TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build())
                "zh" -> TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
                "ko" -> TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
                "hi" -> TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
                else -> TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            }
        }
    }

    @PluginMethod
    fun stopCamera(call: PluginCall) {
        activity.runOnUiThread {
            textFrameAnalyzer.reset()
            cameraSession.stop()
            call.resolve()
        }
    }

    @PluginMethod
    fun translate(call: PluginCall) {
        val text: String = requireString(call, TEXT_KEY, allowEmpty = true) ?: return
        val sourceLanguage: String = requireString(call, SOURCE_LANGUAGE_KEY) ?: return
        val targetLanguage: String = requireString(call, TARGET_LANGUAGE_KEY) ?: return

        translationEngine.translate(text, sourceLanguage, targetLanguage, object : EngineCallback<String> {
            override fun onFailure(exception: LensEngineException) {
                rejectWith(call, exception)
            }

            override fun onSuccess(value: String) {
                val response: JSObject = JSObject()
                response.put(TRANSLATED_TEXT_KEY, value)
                call.resolve(response)
            }
        })
    }

    @PluginMethod
    fun unfreezeFrame(call: PluginCall) {
        activity.runOnUiThread {
            cameraSession.unfreeze()
            textFrameAnalyzer.setFrozen(false)
            call.resolve()
        }
    }

    private fun cameraStartCallback(call: PluginCall): EngineCallback<Unit> {
        return object : EngineCallback<Unit> {
            override fun onFailure(exception: LensEngineException) {
                rejectWith(call, exception)
            }

            override fun onSuccess(value: Unit) {
                call.resolve()
                emitEngineStatus(LensEngineStatusCode.RECOGNITION_READY)
            }
        }
    }

    private fun emitEngineError(code: String, message: String) {
        val event: JSObject = JSObject()
        event.put(CODE_KEY, code)
        event.put(MESSAGE_KEY, message)
        notifyListeners(ENGINE_ERROR_EVENT, event)
    }

    private fun emitEngineStatus(code: String) {
        val event: JSObject = JSObject()
        event.put(CODE_KEY, code)
        notifyListeners(ENGINE_STATUS_EVENT, event)
    }

    private fun readViewport(call: PluginCall): CssRect? {
        val viewport: JSObject = call.getObject(VIEWPORT_KEY) ?: return null
        val requestedViewport: CssRect? = ViewportLayoutPolicy.cssRect(
            x = viewport.optDouble(X_KEY),
            y = viewport.optDouble(Y_KEY),
            width = viewport.optDouble(WIDTH_KEY),
            height = viewport.optDouble(HEIGHT_KEY),
        )

        if (requestedViewport == null) {
            Log.w(LensEngineLog.TAG, "An unusable preview viewport was ignored")
            return cameraSession.previewViewport()
        }

        return requestedViewport
    }

    private fun rejectWith(call: PluginCall, exception: LensEngineException) {
        call.reject(exception.message ?: exception.code, exception.code)
    }

    private fun requireString(call: PluginCall, key: String, allowEmpty: Boolean = false): String? {
        val value: String? = call.getString(key)

        if (value == null || (!allowEmpty && value.isBlank())) {
            call.reject("$key is required", LensEngineErrorCode.INVALID_ARGUMENT)
            return null
        }

        return value
    }

    private fun unitCallback(call: PluginCall): EngineCallback<Unit> {
        return object : EngineCallback<Unit> {
            override fun onFailure(exception: LensEngineException) {
                rejectWith(call, exception)
            }

            override fun onSuccess(value: Unit) {
                call.resolve()
            }
        }
    }

    companion object {
        private const val ANALYSES_PER_SECOND_KEY: String = "analysesPerSecond"
        private const val CAMERAS_KEY: String = "cameras"
        private const val CODE_KEY: String = "code"
        private const val CONFIDENCE_KEY: String = "confidence"
        private const val ENGINE_ERROR_EVENT: String = "engineError"
        private const val ENGINE_STATUS_EVENT: String = "engineStatus"
        private const val HEIGHT_KEY: String = "height"
        private const val LANGUAGE_KEY: String = "language"
        private const val LANGUAGES_KEY: String = "languages"
        private const val MESSAGE_KEY: String = "message"
        private const val PACKAGE_SCHEME: String = "package"
        private const val REQUIRE_WIFI_KEY: String = "requireWifi"
        private const val SOURCE_LANGUAGE_KEY: String = "sourceLanguage"
        private const val TARGET_LANGUAGE_KEY: String = "targetLanguage"
        private const val TEXT_KEY: String = "text"
        private const val TEXT_RECOGNIZED_EVENT: String = "textRecognized"
        private const val TRANSLATED_TEXT_KEY: String = "translatedText"
        private const val VIEWPORT_KEY: String = "viewport"
        private const val WIDTH_KEY: String = "width"
        private const val X_KEY: String = "x"
        private const val Y_KEY: String = "y"
    }
}
