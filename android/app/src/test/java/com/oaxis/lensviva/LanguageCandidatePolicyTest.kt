package com.oaxis.lensviva

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LanguageCandidatePolicyTest {
    @Test
    fun analyzedTextCapsLongText() {
        val text: String = "a".repeat(LanguageCandidatePolicy.MAXIMUM_ANALYZED_CHARACTERS + 120)

        assertEquals(LanguageCandidatePolicy.MAXIMUM_ANALYZED_CHARACTERS, LanguageCandidatePolicy.analyzedText(text).length)
    }

    @Test
    fun analyzedTextDoesNotSplitSurrogatePairs() {
        val text: String = "a".repeat(LanguageCandidatePolicy.MAXIMUM_ANALYZED_CHARACTERS - 1) + SURROGATE_PAIR + "tail"
        val analyzedText: String = LanguageCandidatePolicy.analyzedText(text)

        assertEquals(LanguageCandidatePolicy.MAXIMUM_ANALYZED_CHARACTERS - 1, analyzedText.length)
        assertFalse(Character.isHighSurrogate(analyzedText.last()))
    }

    @Test
    fun analyzedTextKeepsShortTextIntact() {
        assertEquals("Hola mundo", LanguageCandidatePolicy.analyzedText("Hola mundo"))
    }

    @Test
    fun analyzedTextOfBlankTextIsEmpty() {
        assertEquals(0, LanguageCandidatePolicy.analyzedText(" \n\t ").length)
    }

    @Test
    fun analyzedTextTrimsSurroundingWhitespace() {
        assertEquals("Bonjour", LanguageCandidatePolicy.analyzedText("  Bonjour \n"))
    }

    @Test
    fun analyzedTextTrimsWhitespaceLeftAtTheCut() {
        val text: String = "a".repeat(LanguageCandidatePolicy.MAXIMUM_ANALYZED_CHARACTERS - 2) + "   tail"

        assertEquals(LanguageCandidatePolicy.MAXIMUM_ANALYZED_CHARACTERS - 2, LanguageCandidatePolicy.analyzedText(text).length)
    }

    @Test
    fun bestIgnoresBlankAndNonPositiveCandidates() {
        val candidates: List<LanguageCandidate> = listOf(
            LanguageCandidate(confidence = Double.NaN, language = "fr"),
            LanguageCandidate(confidence = 0.9, language = " "),
            LanguageCandidate(confidence = 0.0, language = "de"),
            LanguageCandidate(confidence = -0.4, language = "it"),
            LanguageCandidate(confidence = 0.2, language = "pt"),
        )

        assertEquals(LanguageCandidate(confidence = 0.2, language = "pt"), LanguageCandidatePolicy.best(candidates))
    }

    @Test
    fun bestKeepsTheFirstCandidateOnTies() {
        val candidates: List<LanguageCandidate> = listOf(
            LanguageCandidate(confidence = 0.45, language = "es"),
            LanguageCandidate(confidence = 0.45, language = "gl"),
        )

        assertEquals("es", LanguageCandidatePolicy.best(candidates).language)
    }

    @Test
    fun bestPicksTheHighestConfidenceCandidate() {
        val candidates: List<LanguageCandidate> = listOf(
            LanguageCandidate(confidence = 0.12, language = "ca"),
            LanguageCandidate(confidence = 0.81, language = "es"),
            LanguageCandidate(confidence = 0.07, language = "pt"),
        )

        assertEquals(LanguageCandidate(confidence = 0.81, language = "es"), LanguageCandidatePolicy.best(candidates))
    }

    @Test
    fun bestReturnsUndeterminedWhenOnlyUnusableCandidatesExist() {
        val candidates: List<LanguageCandidate> = listOf(
            LanguageCandidate(confidence = 0.0, language = "en"),
            LanguageCandidate(confidence = Double.NaN, language = "de"),
        )

        assertEquals(LanguageCandidatePolicy.UNDETERMINED, LanguageCandidatePolicy.best(candidates))
    }

    @Test
    fun bestReturnsUndeterminedWhenTheBestCandidateIsUndetermined() {
        val candidates: List<LanguageCandidate> = listOf(
            LanguageCandidate(confidence = 0.6, language = LanguageCandidatePolicy.UNDETERMINED_LANGUAGE),
            LanguageCandidate(confidence = 0.3, language = "en"),
        )

        assertEquals(LanguageCandidate(confidence = 0.0, language = "und"), LanguageCandidatePolicy.best(candidates))
    }

    @Test
    fun bestReturnsUndeterminedWhenThereAreNoCandidates() {
        assertEquals(LanguageCandidate(confidence = 0.0, language = "und"), LanguageCandidatePolicy.best(emptyList()))
    }

    @Test
    fun bestRoundsAndClampsTheConfidence() {
        val floatConfidence: LanguageCandidate = LanguageCandidatePolicy.best(listOf(LanguageCandidate(confidence = 0.87f.toDouble(), language = "it")))
        val excessiveConfidence: LanguageCandidate = LanguageCandidatePolicy.best(listOf(LanguageCandidate(confidence = 1.7, language = "nl")))

        assertEquals(0.87, floatConfidence.confidence, 0.0)
        assertEquals(1.0, excessiveConfidence.confidence, 0.0)
    }

    @Test
    fun bestSkipsUnusableCandidatesBeforeTheUndeterminedCheck() {
        val candidates: List<LanguageCandidate> = listOf(
            LanguageCandidate(confidence = Double.NaN, language = LanguageCandidatePolicy.UNDETERMINED_LANGUAGE),
            LanguageCandidate(confidence = 0.55, language = "sv"),
        )

        assertEquals(LanguageCandidate(confidence = 0.55, language = "sv"), LanguageCandidatePolicy.best(candidates))
    }

    @Test
    fun confidenceThresholdIsLowEnoughToKeepWeakCandidates() {
        assertTrue(LanguageCandidatePolicy.CONFIDENCE_THRESHOLD > 0f)
        assertTrue(LanguageCandidatePolicy.CONFIDENCE_THRESHOLD <= 0.05f)
    }

    @Test
    fun isUndeterminedRecognizesMissingAndUndeterminedLanguages() {
        assertTrue(LanguageCandidatePolicy.isUndetermined(null))
        assertTrue(LanguageCandidatePolicy.isUndetermined(" "))
        assertTrue(LanguageCandidatePolicy.isUndetermined("und"))
        assertFalse(LanguageCandidatePolicy.isUndetermined("en"))
    }

    private companion object {
        const val SURROGATE_PAIR: String = "😀"
    }
}
