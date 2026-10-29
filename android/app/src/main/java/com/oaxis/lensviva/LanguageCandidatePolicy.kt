package com.oaxis.lensviva

data class LanguageCandidate(val confidence: Double, val language: String)

object LanguageCandidatePolicy {
    const val CONFIDENCE_THRESHOLD: Float = 0.01f
    const val MAXIMUM_ANALYZED_CHARACTERS: Int = 500
    const val UNDETERMINED_LANGUAGE: String = "und"

    val UNDETERMINED: LanguageCandidate = LanguageCandidate(confidence = 0.0, language = UNDETERMINED_LANGUAGE)

    private const val CONFIDENCE_PRECISION: Double = 10000.0
    private const val MAXIMUM_CONFIDENCE: Double = 1.0
    private const val MINIMUM_CONFIDENCE: Double = 0.0

    fun analyzedText(text: String): String {
        val trimmedText: String = text.trim()

        if (trimmedText.length <= MAXIMUM_ANALYZED_CHARACTERS) {
            return trimmedText
        }

        val lastIncludedCharacter: Char = trimmedText[MAXIMUM_ANALYZED_CHARACTERS - 1]
        val endIndex: Int = if (Character.isHighSurrogate(lastIncludedCharacter)) MAXIMUM_ANALYZED_CHARACTERS - 1 else MAXIMUM_ANALYZED_CHARACTERS

        return trimmedText.substring(0, endIndex).trimEnd()
    }

    fun best(candidates: List<LanguageCandidate>): LanguageCandidate {
        val bestCandidate: LanguageCandidate = candidates
            .filter { candidate: LanguageCandidate -> isUsable(candidate) }
            .maxByOrNull { candidate: LanguageCandidate -> candidate.confidence }
            ?: return UNDETERMINED

        if (isUndetermined(bestCandidate.language)) {
            return UNDETERMINED
        }

        return LanguageCandidate(confidence = normalizedConfidence(bestCandidate.confidence), language = bestCandidate.language)
    }

    fun isUndetermined(language: String?): Boolean {
        return language.isNullOrBlank() || language == UNDETERMINED_LANGUAGE
    }

    private fun isUsable(candidate: LanguageCandidate): Boolean {
        return candidate.language.isNotBlank() && candidate.confidence > MINIMUM_CONFIDENCE
    }

    private fun normalizedConfidence(confidence: Double): Double {
        return Math.round(confidence.coerceIn(MINIMUM_CONFIDENCE, MAXIMUM_CONFIDENCE) * CONFIDENCE_PRECISION) / CONFIDENCE_PRECISION
    }
}
