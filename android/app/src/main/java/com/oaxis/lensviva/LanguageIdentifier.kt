package com.oaxis.lensviva

import android.os.SystemClock
import android.util.Log
import com.google.android.gms.tasks.Task
import com.google.mlkit.nl.languageid.IdentifiedLanguage
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.languageid.LanguageIdentificationOptions
import com.google.mlkit.nl.languageid.LanguageIdentifier as LanguageIdentificationClient

class LanguageIdentifier {
    private val callbackExecutor: GuardedExecutor = GuardedExecutor()
    private val client: LanguageIdentificationClient = LanguageIdentification.getClient(
        LanguageIdentificationOptions.Builder()
            .setConfidenceThreshold(LanguageCandidatePolicy.CONFIDENCE_THRESHOLD)
            .build(),
    )

    fun close() {
        callbackExecutor.execute { client.close() }
        callbackExecutor.shutdown()
    }

    fun identify(text: String, callback: EngineCallback<LanguageCandidate>) {
        val analyzedText: String = LanguageCandidatePolicy.analyzedText(text)

        if (analyzedText.isEmpty()) {
            callback.onSuccess(LanguageCandidatePolicy.UNDETERMINED)
            return
        }

        val startedAt: Long = SystemClock.elapsedRealtime()
        val identification: Task<List<IdentifiedLanguage>> = try {
            client.identifyPossibleLanguages(analyzedText)
        } catch (exception: RuntimeException) {
            Log.w(LensEngineLog.TAG, "Language identification could not be submitted (${exception.javaClass.simpleName})")
            callback.onFailure(identificationFailure())
            return
        }

        identification.addOnCompleteListener(callbackExecutor) { task: Task<List<IdentifiedLanguage>> ->
            if (!task.isSuccessful) {
                Log.w(LensEngineLog.TAG, "Language identification failed (${failureName(task)})")
                callback.onFailure(identificationFailure())
                return@addOnCompleteListener
            }

            val candidates: List<LanguageCandidate> = task.result.map { identifiedLanguage: IdentifiedLanguage ->
                LanguageCandidate(confidence = identifiedLanguage.confidence.toDouble(), language = identifiedLanguage.languageTag)
            }
            val bestCandidate: LanguageCandidate = LanguageCandidatePolicy.best(candidates)

            if (Log.isLoggable(LensEngineLog.TAG, Log.DEBUG)) {
                val elapsed: Long = SystemClock.elapsedRealtime() - startedAt
                Log.d(LensEngineLog.TAG, "Language identified as ${bestCandidate.language} from ${candidates.size} candidates in $elapsed ms")
            }

            callback.onSuccess(bestCandidate)
        }
    }

    private fun failureName(task: Task<*>): String {
        return task.exception?.javaClass?.simpleName ?: UNKNOWN_FAILURE
    }

    private fun identificationFailure(): LensEngineException {
        return LensEngineException(LensEngineErrorCode.LANGUAGE_ID_FAILED, "The language of the text could not be identified")
    }

    companion object {
        private const val UNKNOWN_FAILURE: String = "unknown"
    }
}
