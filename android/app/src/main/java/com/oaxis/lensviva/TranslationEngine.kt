package com.oaxis.lensviva

import android.util.Log
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions

class LensEngineException(val code: String, message: String) : Exception(message)

interface EngineCallback<T> {
    fun onFailure(exception: LensEngineException)

    fun onSuccess(value: T)
}

class TranslationEngine {
    private val callbackExecutor: GuardedExecutor = GuardedExecutor()
    private val remoteModelManager: RemoteModelManager = RemoteModelManager.getInstance()
    private val translators: LeastRecentlyUsedCache<Translator> = LeastRecentlyUsedCache(MAXIMUM_OPEN_TRANSLATORS)

    fun close() {
        callbackExecutor.execute { translators.clear() }
        callbackExecutor.shutdown()
    }

    fun deleteModel(languageTag: String, callback: EngineCallback<Unit>) {
        val language: String = resolveLanguage(languageTag, callback) ?: return

        if (language == TranslateLanguage.ENGLISH) {
            callback.onFailure(LensEngineException(LensEngineErrorCode.MODEL_DELETE_FAILED, "The English model is built in and cannot be removed"))
            return
        }

        val model: TranslateRemoteModel = TranslateRemoteModel.Builder(language).build()

        remoteModelManager.deleteDownloadedModel(model).addOnCompleteListener(callbackExecutor) { task: Task<Void> ->
            if (!task.isSuccessful) {
                Log.w(LensEngineLog.TAG, "Model removal failed (${failureName(task)})")
                callback.onFailure(LensEngineException(LensEngineErrorCode.MODEL_DELETE_FAILED, "The language model could not be removed"))
                return@addOnCompleteListener
            }

            closeTranslatorsFor(language)
            callback.onSuccess(Unit)
        }
    }

    fun downloadModel(languageTag: String, requireWifi: Boolean, callback: EngineCallback<Unit>) {
        val language: String = resolveLanguage(languageTag, callback) ?: return
        val model: TranslateRemoteModel = TranslateRemoteModel.Builder(language).build()
        val builder: DownloadConditions.Builder = DownloadConditions.Builder()

        if (requireWifi) {
            builder.requireWifi()
        }

        val startedAt: Long = System.currentTimeMillis()

        remoteModelManager.download(model, builder.build()).addOnCompleteListener(callbackExecutor) { task: Task<Void> ->
            if (!task.isSuccessful) {
                Log.w(LensEngineLog.TAG, "Model download failed (${failureName(task)})")
                callback.onFailure(LensEngineException(LensEngineErrorCode.MODEL_DOWNLOAD_FAILED, "The language model could not be downloaded"))
                return@addOnCompleteListener
            }

            Log.i(LensEngineLog.TAG, "Model download finished in ${System.currentTimeMillis() - startedAt} ms")
            callback.onSuccess(Unit)
        }
    }

    fun downloadedLanguages(callback: EngineCallback<List<String>>) {
        remoteModelManager.getDownloadedModels(TranslateRemoteModel::class.java).addOnCompleteListener(callbackExecutor) { task: Task<Set<TranslateRemoteModel>> ->
            if (!task.isSuccessful) {
                Log.w(LensEngineLog.TAG, "Model inventory query failed (${failureName(task)})")
                callback.onFailure(LensEngineException(LensEngineErrorCode.MODEL_QUERY_FAILED, "The downloaded language models could not be listed"))
                return@addOnCompleteListener
            }

            val languages: MutableSet<String> = sortedSetOf(TranslateLanguage.ENGLISH)
            task.result.forEach { model: TranslateRemoteModel -> languages.add(model.language) }
            callback.onSuccess(languages.toList())
        }
    }

    fun translate(text: String, sourceLanguageTag: String, targetLanguageTag: String, callback: EngineCallback<String>) {
        val sourceLanguage: String = resolveLanguage(sourceLanguageTag, callback) ?: return
        val targetLanguage: String = resolveLanguage(targetLanguageTag, callback) ?: return

        if (text.isBlank() || sourceLanguage == targetLanguage) {
            callback.onSuccess(text)
            return
        }

        val sourceCheck: Task<Boolean> = isModelAvailable(sourceLanguage)
        val targetCheck: Task<Boolean> = isModelAvailable(targetLanguage)

        Tasks.whenAllComplete(sourceCheck, targetCheck).addOnCompleteListener(callbackExecutor) { _: Task<List<Task<*>>> ->
            if (!sourceCheck.isSuccessful || !targetCheck.isSuccessful) {
                callback.onFailure(LensEngineException(LensEngineErrorCode.MODEL_QUERY_FAILED, "The language model state could not be verified"))
                return@addOnCompleteListener
            }

            if (sourceCheck.result != true || targetCheck.result != true) {
                callback.onFailure(LensEngineException(LensEngineErrorCode.MODEL_MISSING, "A required language model is not downloaded"))
                return@addOnCompleteListener
            }

            translatorFor(sourceLanguage, targetLanguage).translate(text).addOnCompleteListener(callbackExecutor) { task: Task<String> ->
                if (!task.isSuccessful) {
                    Log.w(LensEngineLog.TAG, "Translation failed (${failureName(task)})")
                    callback.onFailure(LensEngineException(LensEngineErrorCode.TRANSLATION_FAILED, "The text could not be translated"))
                    return@addOnCompleteListener
                }

                callback.onSuccess(task.result)
            }
        }
    }

    private fun closeTranslatorsFor(language: String) {
        translators.removeWhere { key: String -> key.split(PAIR_SEPARATOR).contains(language) }
    }

    private fun failureName(task: Task<*>): String {
        return task.exception?.javaClass?.simpleName ?: UNKNOWN_FAILURE
    }

    private fun isModelAvailable(language: String): Task<Boolean> {
        if (language == TranslateLanguage.ENGLISH) {
            return Tasks.forResult(true)
        }

        return remoteModelManager.isModelDownloaded(TranslateRemoteModel.Builder(language).build())
    }

    private fun <T> resolveLanguage(languageTag: String, callback: EngineCallback<T>): String? {
        val language: String? = TranslateLanguage.fromLanguageTag(languageTag)

        if (language == null) {
            callback.onFailure(LensEngineException(LensEngineErrorCode.UNSUPPORTED_LANGUAGE, "The language is not supported by on-device translation"))
        }

        return language
    }

    private fun translatorFor(sourceLanguage: String, targetLanguage: String): Translator {
        val key: String = sourceLanguage + PAIR_SEPARATOR + targetLanguage

        return translators.getOrCreate(key) {
            val options: TranslatorOptions = TranslatorOptions.Builder()
                .setSourceLanguage(sourceLanguage)
                .setTargetLanguage(targetLanguage)
                .build()

            Translation.getClient(options)
        }
    }

    companion object {
        private const val MAXIMUM_OPEN_TRANSLATORS: Int = 2
        private const val PAIR_SEPARATOR: String = ">"
        private const val UNKNOWN_FAILURE: String = "unknown"
    }
}
