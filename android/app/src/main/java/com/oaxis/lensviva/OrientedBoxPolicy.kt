package com.oaxis.lensviva

import kotlin.math.atan2
import kotlin.math.hypot

data class OrientedBox(val angle: Double, val height: Double, val width: Double)

object OrientedBoxPolicy {
    private const val BOTTOM_LEFT: Int = 3
    private const val BOTTOM_RIGHT: Int = 2
    private const val CORNER_COUNT: Int = 4
    private const val TOP_LEFT: Int = 0
    private const val TOP_RIGHT: Int = 1

    fun measure(cornerXs: DoubleArray, cornerYs: DoubleArray, fallback: OrientedBox): OrientedBox {
        if (cornerXs.size != CORNER_COUNT || cornerYs.size != CORNER_COUNT || !(cornerXs + cornerYs).all { value: Double -> value.isFinite() }) {
            return fallback
        }

        val width: Double = (
            distance(cornerXs, cornerYs, TOP_LEFT, TOP_RIGHT) + distance(cornerXs, cornerYs, BOTTOM_LEFT, BOTTOM_RIGHT)
        ) / 2.0
        val height: Double = (
            distance(cornerXs, cornerYs, TOP_RIGHT, BOTTOM_RIGHT) + distance(cornerXs, cornerYs, TOP_LEFT, BOTTOM_LEFT)
        ) / 2.0

        if (!width.isFinite() || !height.isFinite() || width <= 0.0 || height <= 0.0) {
            return fallback
        }

        val directionX: Double = cornerXs[TOP_RIGHT] - cornerXs[TOP_LEFT] + cornerXs[BOTTOM_RIGHT] - cornerXs[BOTTOM_LEFT]
        val directionY: Double = cornerYs[TOP_RIGHT] - cornerYs[TOP_LEFT] + cornerYs[BOTTOM_RIGHT] - cornerYs[BOTTOM_LEFT]

        return OrientedBox(angle = Math.toDegrees(atan2(directionY, directionX)), height = height, width = width)
    }

    private fun distance(cornerXs: DoubleArray, cornerYs: DoubleArray, from: Int, to: Int): Double {
        return hypot(cornerXs[to] - cornerXs[from], cornerYs[to] - cornerYs[from])
    }
}
