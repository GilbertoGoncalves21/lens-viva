package com.oaxis.lensviva

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ViewportLayoutPolicyTest {
    @Test
    fun cssRectAcceptsFiniteRectanglesWithPositiveSize() {
        assertEquals(CssRect(height = 410.0, width = 328.0, x = 16.0, y = 80.0), ViewportLayoutPolicy.cssRect(16.0, 80.0, 328.0, 410.0))
        assertEquals(CssRect(height = 50.0, width = 40.0, x = -10.0, y = -20.0), ViewportLayoutPolicy.cssRect(-10.0, -20.0, 40.0, 50.0))
    }

    @Test
    fun cssRectRejectsNonFiniteValues() {
        assertNull(ViewportLayoutPolicy.cssRect(Double.NaN, 0.0, 100.0, 100.0))
        assertNull(ViewportLayoutPolicy.cssRect(0.0, Double.POSITIVE_INFINITY, 100.0, 100.0))
        assertNull(ViewportLayoutPolicy.cssRect(0.0, 0.0, Double.NaN, 100.0))
        assertNull(ViewportLayoutPolicy.cssRect(0.0, 0.0, 100.0, Double.NEGATIVE_INFINITY))
    }

    @Test
    fun cssRectRejectsEmptyOrNegativeSizes() {
        assertNull(ViewportLayoutPolicy.cssRect(0.0, 0.0, 0.0, 100.0))
        assertNull(ViewportLayoutPolicy.cssRect(0.0, 0.0, 100.0, 0.0))
        assertNull(ViewportLayoutPolicy.cssRect(0.0, 0.0, -1.0, 100.0))
    }

    @Test
    fun isUsableMatchesCssRectValidation() {
        assertTrue(ViewportLayoutPolicy.isUsable(CssRect(height = 1.0, width = 1.0, x = 0.0, y = 0.0)))
        assertFalse(ViewportLayoutPolicy.isUsable(CssRect(height = Double.NaN, width = 1.0, x = 0.0, y = 0.0)))
        assertFalse(ViewportLayoutPolicy.isUsable(CssRect(height = 1.0, width = 0.0, x = 0.0, y = 0.0)))
    }

    @Test
    fun resolveScaleFallsBackToDefaultWhenDensityIsUnusable() {
        assertEquals(1.0f, ViewportLayoutPolicy.resolveScale(0f, null), DELTA)
        assertEquals(1.0f, ViewportLayoutPolicy.resolveScale(Float.NaN, Float.NaN), DELTA)
    }

    @Test
    fun resolveScalePrefersAUsableZoomScale() {
        assertEquals(4.5f, ViewportLayoutPolicy.resolveScale(2.625f, 4.5f), DELTA)
    }

    @Test
    fun resolveScaleUsesDensityWhenZoomIsMissingOrUnusable() {
        assertEquals(2.625f, ViewportLayoutPolicy.resolveScale(2.625f, null), DELTA)
        assertEquals(2.625f, ViewportLayoutPolicy.resolveScale(2.625f, 0f), DELTA)
        assertEquals(2.625f, ViewportLayoutPolicy.resolveScale(2.625f, Float.POSITIVE_INFINITY), DELTA)
    }

    @Test
    fun toPixelBoundsClampsToTheContainer() {
        val viewport: CssRect = CssRect(height = 500.0, width = 400.0, x = -20.0, y = 700.0)

        assertEquals(
            PixelBounds(height = 300, left = 0, top = 2100, width = 1080),
            ViewportLayoutPolicy.toPixelBounds(viewport, 3.0f, 1080, 2400),
        )
    }

    @Test
    fun toPixelBoundsClampsHugeValuesWithoutOverflow() {
        val viewport: CssRect = CssRect(height = Double.MAX_VALUE, width = Double.MAX_VALUE, x = 10.0, y = 10.0)

        assertEquals(
            PixelBounds(height = 2370, left = 30, top = 30, width = 1050),
            ViewportLayoutPolicy.toPixelBounds(viewport, 3.0f, 1080, 2400),
        )
    }

    @Test
    fun toPixelBoundsConvertsCssPixelsWithTheScale() {
        val viewport: CssRect = CssRect(height = 410.0, width = 328.0, x = 16.0, y = 80.0)

        assertEquals(
            PixelBounds(height = 1230, left = 48, top = 240, width = 984),
            ViewportLayoutPolicy.toPixelBounds(viewport, 3.0f, 1080, 2400),
        )
    }

    @Test
    fun toPixelBoundsFillsTheContainerWhenTheViewportIsMissing() {
        assertEquals(
            PixelBounds(height = 2400, left = 0, top = 0, width = 1080),
            ViewportLayoutPolicy.toPixelBounds(null, 3.0f, 1080, 2400),
        )
    }

    @Test
    fun toPixelBoundsFillsTheContainerWhenTheScaleIsUnusable() {
        val viewport: CssRect = CssRect(height = 410.0, width = 328.0, x = 16.0, y = 80.0)

        assertEquals(PixelBounds(height = 2400, left = 0, top = 0, width = 1080), ViewportLayoutPolicy.toPixelBounds(viewport, 0f, 1080, 2400))
        assertEquals(PixelBounds(height = 2400, left = 0, top = 0, width = 1080), ViewportLayoutPolicy.toPixelBounds(viewport, Float.NaN, 1080, 2400))
    }

    @Test
    fun toPixelBoundsFillsTheContainerWhenTheViewportIsOutside() {
        val viewport: CssRect = CssRect(height = 100.0, width = 100.0, x = 400.0, y = 0.0)

        assertEquals(
            PixelBounds(height = 2400, left = 0, top = 0, width = 1080),
            ViewportLayoutPolicy.toPixelBounds(viewport, 3.0f, 1080, 2400),
        )
    }

    @Test
    fun toPixelBoundsFillsTheContainerWhenTheViewportIsUnusable() {
        val viewport: CssRect = CssRect(height = Double.NaN, width = 328.0, x = 16.0, y = 80.0)

        assertEquals(
            PixelBounds(height = 2400, left = 0, top = 0, width = 1080),
            ViewportLayoutPolicy.toPixelBounds(viewport, 3.0f, 1080, 2400),
        )
    }

    @Test
    fun toPixelBoundsKeepsAnEmptyContainerEmpty() {
        val viewport: CssRect = CssRect(height = 410.0, width = 328.0, x = 16.0, y = 80.0)

        assertEquals(PixelBounds(height = 0, left = 0, top = 0, width = 0), ViewportLayoutPolicy.toPixelBounds(viewport, 3.0f, 0, 0))
        assertEquals(PixelBounds(height = 0, left = 0, top = 0, width = 0), ViewportLayoutPolicy.toPixelBounds(viewport, 3.0f, -5, -5))
    }

    @Test
    fun toPixelBoundsRoundsEdgesToTheNearestPixel() {
        val viewport: CssRect = CssRect(height = 400.0, width = 320.0, x = 20.3, y = 100.1)

        assertEquals(
            PixelBounds(height = 1050, left = 53, top = 263, width = 840),
            ViewportLayoutPolicy.toPixelBounds(viewport, 2.625f, 1080, 2400),
        )
    }

    @Test
    fun translateOffsetsTheBoundsByTheContainerOrigin() {
        val bounds: PixelBounds = PixelBounds(height = 1230, left = 48, top = 240, width = 984)

        assertEquals(PixelBounds(height = 1230, left = 48, top = 340, width = 984), ViewportLayoutPolicy.translate(bounds, 0, 100))
        assertEquals(PixelBounds(height = 1230, left = 58, top = 230, width = 984), ViewportLayoutPolicy.translate(bounds, 10, -10))
    }

    private companion object {
        const val DELTA: Float = 0.0001f
    }
}
