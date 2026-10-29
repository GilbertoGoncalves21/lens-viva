package com.oaxis.lensviva

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test
import kotlin.math.cos
import kotlin.math.sin

class OrientedBoxPolicyTest {
    @Test
    fun measureKeepsTheSizeOfAnUprightLine() {
        val box: OrientedBox = OrientedBoxPolicy.measure(
            doubleArrayOf(10.0, 210.0, 210.0, 10.0),
            doubleArrayOf(40.0, 40.0, 70.0, 70.0),
            FALLBACK,
        )

        assertEquals(0.0, box.angle, DELTA)
        assertEquals(200.0, box.width, DELTA)
        assertEquals(30.0, box.height, DELTA)
    }

    @Test
    fun measureReadsTheTextSizeAndAngleOfATiltedLineInsteadOfItsTallerBoundingBox() {
        val radians: Double = Math.toRadians(8.0)
        val width: Double = 300.0
        val height: Double = 24.0
        val cornerXs: DoubleArray = doubleArrayOf(0.0, width * cos(radians), width * cos(radians) - height * sin(radians), -height * sin(radians))
        val cornerYs: DoubleArray = doubleArrayOf(0.0, width * sin(radians), width * sin(radians) + height * cos(radians), height * cos(radians))

        val box: OrientedBox = OrientedBoxPolicy.measure(cornerXs, cornerYs, FALLBACK)

        assertEquals(8.0, box.angle, DELTA)
        assertEquals(width, box.width, DELTA)
        assertEquals(height, box.height, DELTA)
    }

    @Test
    fun measureReportsACounterclockwiseTiltAsANegativeAngle() {
        val box: OrientedBox = OrientedBoxPolicy.measure(
            doubleArrayOf(0.0, 100.0, 101.0, 1.0),
            doubleArrayOf(10.0, 0.0, 10.0, 20.0),
            FALLBACK,
        )

        assertEquals(Math.toDegrees(Math.atan2(-10.0, 100.0)), box.angle, DELTA)
    }

    @Test
    fun measureFallsBackWhenTheCornersAreMissingOrUnusable() {
        assertSame(FALLBACK, OrientedBoxPolicy.measure(doubleArrayOf(0.0, 1.0, 1.0), doubleArrayOf(0.0, 0.0, 1.0), FALLBACK))
        assertSame(FALLBACK, OrientedBoxPolicy.measure(doubleArrayOf(0.0, Double.NaN, 1.0, 0.0), doubleArrayOf(0.0, 0.0, 1.0, 1.0), FALLBACK))
        assertSame(FALLBACK, OrientedBoxPolicy.measure(doubleArrayOf(5.0, 5.0, 5.0, 5.0), doubleArrayOf(5.0, 5.0, 5.0, 5.0), FALLBACK))
    }

    private companion object {
        const val DELTA: Double = 0.0001
        val FALLBACK: OrientedBox = OrientedBox(angle = 2.0, height = 12.0, width = 80.0)
    }
}
