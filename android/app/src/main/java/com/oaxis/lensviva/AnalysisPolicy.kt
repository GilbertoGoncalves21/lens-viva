package com.oaxis.lensviva

data class FrameSize(val width: Int, val height: Int)

object AnalysisPolicy {
    const val DEFAULT_ANALYSES_PER_SECOND: Double = 3.0
    const val FROZEN_FRAME_ROTATION_DEGREES: Int = 0
    const val MAXIMUM_ANALYSES_PER_SECOND: Double = 5.0
    const val MINIMUM_ANALYSES_PER_SECOND: Double = 1.0

    private const val MILLISECONDS_PER_SECOND: Double = 1000.0
    private const val QUARTER_TURN_DEGREES: Int = 90
    private const val HALF_TURN_DEGREES: Int = 180

    fun clampAnalysesPerSecond(requested: Double?): Double {
        if (requested == null || requested.isNaN()) {
            return DEFAULT_ANALYSES_PER_SECOND
        }

        return requested.coerceIn(MINIMUM_ANALYSES_PER_SECOND, MAXIMUM_ANALYSES_PER_SECOND)
    }

    fun frozenFrame(frameTimestamp: Long, width: Int, height: Int): FrameDescriptor {
        return FrameDescriptor(
            frameTimestamp = frameTimestamp,
            frozen = true,
            imageHeight = height,
            imageWidth = width,
            rotationDegrees = FROZEN_FRAME_ROTATION_DEGREES,
            viewHeight = height,
            viewWidth = width,
        )
    }

    fun intervalMilliseconds(analysesPerSecond: Double): Long {
        return (MILLISECONDS_PER_SECOND / clampAnalysesPerSecond(analysesPerSecond)).toLong()
    }

    fun isAnalysisDue(now: Long, lastAnalysisStartedAt: Long, analysesPerSecond: Double): Boolean {
        return lastAnalysisStartedAt == 0L || now - lastAnalysisStartedAt >= intervalMilliseconds(analysesPerSecond)
    }

    fun isFrameAccepted(frameFrozen: Boolean, frozen: Boolean, paused: Boolean): Boolean {
        return !paused && frameFrozen == frozen
    }

    fun nextFrameTimestamp(candidate: Long, previous: Long): Long {
        return if (candidate > previous) candidate else previous + 1L
    }

    fun uprightSize(width: Int, height: Int, rotationDegrees: Int): FrameSize {
        val normalizedRotation: Int = Math.floorMod(rotationDegrees, HALF_TURN_DEGREES)

        return if (normalizedRotation == QUARTER_TURN_DEGREES) FrameSize(height, width) else FrameSize(width, height)
    }
}
