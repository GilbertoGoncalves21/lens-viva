package com.oaxis.lensviva

import android.graphics.Bitmap
import android.media.Image
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.getcapacitor.JSObject
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognizer
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

interface TextFrameListener {
    fun onFrameFailed(code: String, message: String)

    fun onFrameRecognized(event: JSObject)
}

interface ViewSizeProvider {
    fun currentViewSize(): FrameSize
}

class TextFrameAnalyzer(
    private val callbackExecutor: Executor,
    private val frameListener: TextFrameListener,
    private val textRecognizer: () -> TextRecognizer,
    private val viewSizeProvider: ViewSizeProvider,
) : ImageAnalysis.Analyzer {
    @Volatile
    private var analysesPerSecond: Double = AnalysisPolicy.DEFAULT_ANALYSES_PER_SECOND

    private val analysisInFlight: AtomicBoolean = AtomicBoolean(false)

    @Volatile
    private var frozen: Boolean = false

    private val generation: AtomicInteger = AtomicInteger(0)

    private var lastAnalysisStartedAt: Long = 0L

    private var lastFrameTimestamp: Long = 0L

    @Volatile
    private var paused: Boolean = false

    @OptIn(ExperimentalGetImage::class)
    override fun analyze(image: ImageProxy) {
        val now: Long = SystemClock.elapsedRealtime()

        if (!isAccepting(frameFrozen = false) || analysisInFlight.get() || !AnalysisPolicy.isAnalysisDue(now, lastAnalysisStartedAt, analysesPerSecond)) {
            image.close()
            return
        }

        val mediaImage: Image? = image.image

        if (mediaImage == null) {
            image.close()
            return
        }

        analysisInFlight.set(true)
        lastAnalysisStartedAt = now
        lastFrameTimestamp = AnalysisPolicy.nextFrameTimestamp(now, lastFrameTimestamp)

        val frameGeneration: Int = generation.get()
        val rotationDegrees: Int = image.imageInfo.rotationDegrees
        val uprightSize: FrameSize = AnalysisPolicy.uprightSize(image.width, image.height, rotationDegrees)
        val viewSize: FrameSize = viewSizeProvider.currentViewSize()
        val frame: FrameDescriptor = FrameDescriptor(
            frameTimestamp = lastFrameTimestamp,
            frozen = false,
            imageHeight = uprightSize.height,
            imageWidth = uprightSize.width,
            rotationDegrees = rotationDegrees,
            viewHeight = viewSize.height,
            viewWidth = viewSize.width,
        )

        val recognition: Task<Text> = try {
            textRecognizer().process(InputImage.fromMediaImage(mediaImage, rotationDegrees))
        } catch (exception: RuntimeException) {
            image.close()
            analysisInFlight.set(false)
            Log.w(LensEngineLog.TAG, "Frame could not be submitted for recognition (${exception.javaClass.simpleName})")
            frameListener.onFrameFailed(LensEngineErrorCode.OCR_FAILED, "Text recognition could not process the frame")
            return
        }

        recognition.addOnCompleteListener(DIRECT_EXECUTOR) { _: Task<Text> -> image.close() }
        recognition.addOnCompleteListener(callbackExecutor) { task: Task<Text> ->
            try {
                handleResult(task, frame, frameGeneration, now)
            } finally {
                analysisInFlight.set(false)
            }
        }
    }

    fun analyzeFrozen(bitmap: Bitmap) {
        val frameGeneration: Int = generation.get()
        val recognitionBitmap: Bitmap? = bitmap.copy(Bitmap.Config.ARGB_8888, false)

        if (recognitionBitmap == null) {
            Log.w(LensEngineLog.TAG, "Frozen frame could not be copied for recognition")
            frameListener.onFrameFailed(LensEngineErrorCode.OCR_FAILED, "Text recognition could not process the frozen frame")
            return
        }

        callbackExecutor.execute { recognizeFrozen(recognitionBitmap, frameGeneration) }
    }

    fun invalidate() {
        generation.incrementAndGet()
    }

    fun reset() {
        invalidate()
        frozen = false
        paused = false
    }

    fun setAnalysesPerSecond(analysesPerSecond: Double) {
        this.analysesPerSecond = AnalysisPolicy.clampAnalysesPerSecond(analysesPerSecond)
    }

    fun setFrozen(frozen: Boolean) {
        if (frozen) {
            invalidate()
        }

        this.frozen = frozen
    }

    fun setPaused(paused: Boolean) {
        if (paused) {
            invalidate()
        }

        this.paused = paused
    }

    private fun handleResult(task: Task<Text>, frame: FrameDescriptor, frameGeneration: Int, startedAt: Long) {
        if (frameGeneration != generation.get() || !isAccepting(frame.frozen)) {
            return
        }

        if (!task.isSuccessful) {
            val failureName: String = task.exception?.javaClass?.simpleName ?: UNKNOWN_FAILURE
            Log.w(LensEngineLog.TAG, "Text recognition failed ($failureName)")
            frameListener.onFrameFailed(LensEngineErrorCode.OCR_FAILED, "Text recognition failed")
            return
        }

        val text: Text = task.result
        val event: JSObject = RecognitionSerializer.toEvent(text, frame)

        if (Log.isLoggable(LensEngineLog.TAG, Log.DEBUG)) {
            val elapsed: Long = SystemClock.elapsedRealtime() - startedAt
            Log.d(LensEngineLog.TAG, "Frame ${frame.imageWidth}x${frame.imageHeight} analyzed in $elapsed ms with ${text.textBlocks.size} blocks")
        }

        frameListener.onFrameRecognized(event)
    }

    private fun isAccepting(frameFrozen: Boolean): Boolean {
        return AnalysisPolicy.isFrameAccepted(frameFrozen, frozen, paused)
    }

    private fun recognizeFrozen(bitmap: Bitmap, frameGeneration: Int) {
        val now: Long = SystemClock.elapsedRealtime()

        if (frameGeneration != generation.get() || !isAccepting(frameFrozen = true)) {
            bitmap.recycle()
            return
        }

        lastFrameTimestamp = AnalysisPolicy.nextFrameTimestamp(now, lastFrameTimestamp)

        val frame: FrameDescriptor = AnalysisPolicy.frozenFrame(lastFrameTimestamp, bitmap.width, bitmap.height)
        val recognition: Task<Text> = try {
            textRecognizer().process(InputImage.fromBitmap(bitmap, AnalysisPolicy.FROZEN_FRAME_ROTATION_DEGREES))
        } catch (exception: RuntimeException) {
            bitmap.recycle()
            Log.w(LensEngineLog.TAG, "Frozen frame could not be submitted for recognition (${exception.javaClass.simpleName})")
            frameListener.onFrameFailed(LensEngineErrorCode.OCR_FAILED, "Text recognition could not process the frozen frame")
            return
        }

        recognition.addOnCompleteListener(DIRECT_EXECUTOR) { _: Task<Text> -> bitmap.recycle() }
        recognition.addOnCompleteListener(callbackExecutor) { task: Task<Text> -> handleResult(task, frame, frameGeneration, now) }
    }

    companion object {
        private val DIRECT_EXECUTOR: Executor = Executor { command: Runnable -> command.run() }
        private const val UNKNOWN_FAILURE: String = "unknown"
    }
}
