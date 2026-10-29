package com.oaxis.lensviva

data class EngineCapabilities(
    val cameraSelection: Boolean,
    val languageIdentification: Boolean,
    val modelRemoval: Boolean,
    val openAppSettings: Boolean,
    val translation: Boolean,
) {
    fun entries(): Map<String, Boolean> {
        return linkedMapOf(
            CAMERA_SELECTION_KEY to cameraSelection,
            LANGUAGE_IDENTIFICATION_KEY to languageIdentification,
            MODEL_REMOVAL_KEY to modelRemoval,
            OPEN_APP_SETTINGS_KEY to openAppSettings,
            TRANSLATION_KEY to translation,
        )
    }

    companion object {
        const val CAMERA_SELECTION_KEY: String = "cameraSelection"
        const val LANGUAGE_IDENTIFICATION_KEY: String = "languageIdentification"
        const val MODEL_REMOVAL_KEY: String = "modelRemoval"
        const val OPEN_APP_SETTINGS_KEY: String = "openAppSettings"
        const val TRANSLATION_KEY: String = "translation"

        val ON_DEVICE: EngineCapabilities = EngineCapabilities(
            cameraSelection = false,
            languageIdentification = true,
            modelRemoval = true,
            openAppSettings = true,
            translation = true,
        )
    }
}
