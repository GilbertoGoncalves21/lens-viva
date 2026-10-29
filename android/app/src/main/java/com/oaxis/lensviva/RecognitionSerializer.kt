package com.oaxis.lensviva

import android.graphics.Point
import android.graphics.Rect
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.google.mlkit.vision.text.Text
import org.json.JSONObject

data class FrameDescriptor(
    val frameTimestamp: Long,
    val frozen: Boolean,
    val imageHeight: Int,
    val imageWidth: Int,
    val rotationDegrees: Int,
    val viewHeight: Int,
    val viewWidth: Int,
)

object RecognitionSerializer {
    fun toEvent(text: Text, frame: FrameDescriptor): JSObject {
        val blocks: JSArray = JSArray()

        text.textBlocks.forEach { block: Text.TextBlock ->
            val serializedBlock: JSObject? = serializeBlock(block)

            if (serializedBlock != null) {
                blocks.put(serializedBlock)
            }
        }

        val event: JSObject = JSObject()
        event.put("blocks", blocks)
        event.put("frame", serializeFrame(frame))

        return event
    }

    private fun axisAlignedBox(boundingBox: Rect, angle: Double): OrientedBox {
        return OrientedBox(angle = angle, height = boundingBox.height().toDouble(), width = boundingBox.width().toDouble())
    }

    private fun languageOrNull(language: String?): Any {
        if (language == null || LanguageCandidatePolicy.isUndetermined(language)) {
            return JSONObject.NULL
        }

        return language
    }

    private fun orientedBoxOf(cornerPoints: Array<Point>?, fallback: OrientedBox): OrientedBox {
        if (cornerPoints == null) {
            return fallback
        }

        val cornerXs: DoubleArray = cornerPoints.map { point: Point -> point.x.toDouble() }.toDoubleArray()
        val cornerYs: DoubleArray = cornerPoints.map { point: Point -> point.y.toDouble() }.toDoubleArray()

        return OrientedBoxPolicy.measure(cornerXs, cornerYs, fallback)
    }

    private fun serializeBlock(block: Text.TextBlock): JSObject? {
        val boundingBox: Rect = block.boundingBox ?: return null
        val lines: JSArray = JSArray()

        block.lines.forEach { line: Text.Line ->
            val serializedLine: JSObject? = serializeLine(line)

            if (serializedLine != null) {
                lines.put(serializedLine)
            }
        }

        val orientedBox: OrientedBox = orientedBoxOf(block.cornerPoints, axisAlignedBox(boundingBox, 0.0))

        val serializedBlock: JSObject = JSObject()
        serializedBlock.put("boundingBox", serializeRect(boundingBox))
        serializedBlock.put("lines", lines)
        serializedBlock.put("orientedHeight", orientedBox.height)
        serializedBlock.put("orientedWidth", orientedBox.width)
        serializedBlock.put("recognizedLanguage", languageOrNull(block.recognizedLanguage))
        serializedBlock.put("text", block.text)

        return serializedBlock
    }

    private fun serializeConfidence(confidence: Float): Any {
        if (confidence.isNaN() || confidence < 0f) {
            return JSONObject.NULL
        }

        return confidence.toDouble()
    }

    private fun serializeFrame(frame: FrameDescriptor): JSObject {
        val serializedFrame: JSObject = JSObject()
        serializedFrame.put("frameTimestamp", frame.frameTimestamp)
        serializedFrame.put("frozen", frame.frozen)
        serializedFrame.put("imageHeight", frame.imageHeight)
        serializedFrame.put("imageWidth", frame.imageWidth)
        serializedFrame.put("mirrored", false)
        serializedFrame.put("rotationDegrees", frame.rotationDegrees)
        serializedFrame.put("viewHeight", frame.viewHeight)
        serializedFrame.put("viewWidth", frame.viewWidth)

        return serializedFrame
    }

    private fun serializeLine(line: Text.Line): JSObject? {
        val boundingBox: Rect = line.boundingBox ?: return null
        val angle: Float = line.angle
        val orientedBox: OrientedBox = orientedBoxOf(line.cornerPoints, axisAlignedBox(boundingBox, if (angle.isFinite()) angle.toDouble() else 0.0))

        val serializedLine: JSObject = JSObject()
        serializedLine.put("angle", orientedBox.angle)
        serializedLine.put("boundingBox", serializeRect(boundingBox))
        serializedLine.put("confidence", serializeConfidence(line.confidence))
        serializedLine.put("orientedHeight", orientedBox.height)
        serializedLine.put("orientedWidth", orientedBox.width)
        serializedLine.put("recognizedLanguage", languageOrNull(line.recognizedLanguage))
        serializedLine.put("text", line.text)

        return serializedLine
    }

    private fun serializeRect(rect: Rect): JSObject {
        val serializedRect: JSObject = JSObject()
        serializedRect.put("bottom", rect.bottom)
        serializedRect.put("left", rect.left)
        serializedRect.put("right", rect.right)
        serializedRect.put("top", rect.top)

        return serializedRect
    }
}
