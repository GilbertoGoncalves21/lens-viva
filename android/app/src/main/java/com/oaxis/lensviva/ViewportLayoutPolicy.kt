package com.oaxis.lensviva

import kotlin.math.max
import kotlin.math.roundToInt

data class CssRect(val height: Double, val width: Double, val x: Double, val y: Double)

data class PixelBounds(val height: Int, val left: Int, val top: Int, val width: Int)

object ViewportLayoutPolicy {
    private const val DEFAULT_SCALE: Float = 1.0f
    private const val ORIGIN: Int = 0

    fun cssRect(x: Double, y: Double, width: Double, height: Double): CssRect? {
        val candidate: CssRect = CssRect(height = height, width = width, x = x, y = y)

        return if (isUsable(candidate)) candidate else null
    }

    fun isUsable(viewport: CssRect): Boolean {
        return viewport.x.isFinite() &&
            viewport.y.isFinite() &&
            viewport.width.isFinite() &&
            viewport.height.isFinite() &&
            viewport.width > 0.0 &&
            viewport.height > 0.0
    }

    fun resolveScale(density: Float, zoomScale: Float?): Float {
        if (zoomScale != null && isUsableScale(zoomScale)) {
            return zoomScale
        }

        if (isUsableScale(density)) {
            return density
        }

        return DEFAULT_SCALE
    }

    fun toPixelBounds(viewport: CssRect?, scale: Float, containerWidth: Int, containerHeight: Int): PixelBounds {
        val container: PixelBounds = PixelBounds(height = max(containerHeight, ORIGIN), left = ORIGIN, top = ORIGIN, width = max(containerWidth, ORIGIN))

        if (viewport == null || !isUsable(viewport) || !isUsableScale(scale)) {
            return container
        }

        val left: Int = toPixel(viewport.x, scale, container.width)
        val right: Int = toPixel(viewport.x + viewport.width, scale, container.width)
        val top: Int = toPixel(viewport.y, scale, container.height)
        val bottom: Int = toPixel(viewport.y + viewport.height, scale, container.height)

        if (right <= left || bottom <= top) {
            return container
        }

        return PixelBounds(height = bottom - top, left = left, top = top, width = right - left)
    }

    fun translate(bounds: PixelBounds, left: Int, top: Int): PixelBounds {
        return PixelBounds(height = bounds.height, left = bounds.left + left, top = bounds.top + top, width = bounds.width)
    }

    private fun isUsableScale(scale: Float): Boolean {
        return scale.isFinite() && scale > 0f
    }

    private fun toPixel(cssValue: Double, scale: Float, limit: Int): Int {
        return (cssValue * scale).coerceIn(ORIGIN.toDouble(), limit.toDouble()).roundToInt()
    }
}
