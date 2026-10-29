package com.oaxis.lensviva

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AnalysisPolicyTest {
    @Test
    fun clampAnalysesPerSecondFallsBackToDefaultWhenMissing() {
        assertEquals(AnalysisPolicy.DEFAULT_ANALYSES_PER_SECOND, AnalysisPolicy.clampAnalysesPerSecond(null), DELTA)
        assertEquals(AnalysisPolicy.DEFAULT_ANALYSES_PER_SECOND, AnalysisPolicy.clampAnalysesPerSecond(Double.NaN), DELTA)
    }

    @Test
    fun clampAnalysesPerSecondKeepsValuesInsideBounds() {
        assertEquals(1.0, AnalysisPolicy.clampAnalysesPerSecond(0.2), DELTA)
        assertEquals(2.5, AnalysisPolicy.clampAnalysesPerSecond(2.5), DELTA)
        assertEquals(5.0, AnalysisPolicy.clampAnalysesPerSecond(30.0), DELTA)
    }

    @Test
    fun frozenFrameDescribesTheBitmapInViewSpace() {
        val frame: FrameDescriptor = AnalysisPolicy.frozenFrame(4200L, 1080, 2400)

        assertEquals(
            FrameDescriptor(
                frameTimestamp = 4200L,
                frozen = true,
                imageHeight = 2400,
                imageWidth = 1080,
                rotationDegrees = 0,
                viewHeight = 2400,
                viewWidth = 1080,
            ),
            frame,
        )
    }

    @Test
    fun intervalMillisecondsMatchesRate() {
        assertEquals(1000L, AnalysisPolicy.intervalMilliseconds(1.0))
        assertEquals(333L, AnalysisPolicy.intervalMilliseconds(3.0))
        assertEquals(200L, AnalysisPolicy.intervalMilliseconds(12.0))
    }

    @Test
    fun isAnalysisDueRespectsInterval() {
        assertTrue(AnalysisPolicy.isAnalysisDue(5000L, 0L, 3.0))
        assertFalse(AnalysisPolicy.isAnalysisDue(5200L, 5000L, 3.0))
        assertTrue(AnalysisPolicy.isAnalysisDue(5333L, 5000L, 3.0))
    }

    @Test
    fun isFrameAcceptedKeepsFrozenAndLiveFramesApart() {
        assertTrue(AnalysisPolicy.isFrameAccepted(frameFrozen = false, frozen = false, paused = false))
        assertFalse(AnalysisPolicy.isFrameAccepted(frameFrozen = false, frozen = true, paused = false))
        assertTrue(AnalysisPolicy.isFrameAccepted(frameFrozen = true, frozen = true, paused = false))
        assertFalse(AnalysisPolicy.isFrameAccepted(frameFrozen = true, frozen = false, paused = false))
    }

    @Test
    fun isFrameAcceptedRejectsEveryFrameWhilePaused() {
        assertFalse(AnalysisPolicy.isFrameAccepted(frameFrozen = false, frozen = false, paused = true))
        assertFalse(AnalysisPolicy.isFrameAccepted(frameFrozen = true, frozen = true, paused = true))
    }

    @Test
    fun nextFrameTimestampIsStrictlyIncreasing() {
        assertEquals(1500L, AnalysisPolicy.nextFrameTimestamp(1500L, 1000L))
        assertEquals(1001L, AnalysisPolicy.nextFrameTimestamp(1000L, 1000L))
        assertEquals(1001L, AnalysisPolicy.nextFrameTimestamp(900L, 1000L))
    }

    @Test
    fun uprightSizeSwapsDimensionsOnQuarterTurns() {
        assertEquals(FrameSize(960, 1280), AnalysisPolicy.uprightSize(1280, 960, 90))
        assertEquals(FrameSize(960, 1280), AnalysisPolicy.uprightSize(1280, 960, 270))
        assertEquals(FrameSize(1280, 960), AnalysisPolicy.uprightSize(1280, 960, 0))
        assertEquals(FrameSize(1280, 960), AnalysisPolicy.uprightSize(1280, 960, 180))
    }

    private companion object {
        const val DELTA: Double = 0.0001
    }
}
