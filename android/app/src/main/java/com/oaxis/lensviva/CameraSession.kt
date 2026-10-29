package com.oaxis.lensviva

import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import android.view.Surface
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Observer
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.Executor

interface CameraSessionListener {
    fun onCameraError(code: String, message: String)
}

class ViewSizeTracker : ViewSizeProvider, View.OnLayoutChangeListener {
    @Volatile
    private var height: Int = 0

    @Volatile
    private var width: Int = 0

    override fun currentViewSize(): FrameSize {
        return FrameSize(width, height)
    }

    override fun onLayoutChange(
        view: View,
        left: Int,
        top: Int,
        right: Int,
        bottom: Int,
        oldLeft: Int,
        oldTop: Int,
        oldRight: Int,
        oldBottom: Int,
    ) {
        update(right - left, bottom - top)
    }

    fun update(width: Int, height: Int) {
        if (width > 0 && height > 0) {
            this.width = width
            this.height = height
        }
    }
}

class CameraSession(
    private val activity: AppCompatActivity,
    private val analysisExecutor: Executor,
    private val listener: CameraSessionListener,
    private val viewSizeTracker: ViewSizeTracker,
) {
    private var camera: Camera? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private val cameraStateObserver: Observer<CameraState> = Observer { cameraState: CameraState -> handleCameraState(cameraState) }
    private val displayListener: DisplayManager.DisplayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) {}

        override fun onDisplayChanged(displayId: Int) {
            if (previewView?.display?.displayId == displayId) {
                updateTargetRotation()
            }
        }

        override fun onDisplayRemoved(displayId: Int) {}
    }
    private var frozenBitmap: Bitmap? = null
    private var frozenView: ImageView? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var lastReportedErrorCode: Int? = null
    private var orientationBeforeFreeze: Int? = null
    private val pendingStarts: MutableList<EngineCallback<Unit>> = mutableListOf()
    private var preview: Preview? = null
    private val previewLayout: PreviewViewportLayout = PreviewViewportLayout()
    private var previewView: PreviewView? = null
    private var startGeneration: Int = 0
    private var state: CameraSessionState = CameraSessionState.IDLE

    fun freeze(): Bitmap? {
        val currentPreviewView: PreviewView = previewView ?: return null

        if (frozenView != null) {
            return frozenBitmap
        }

        val parent: ViewGroup = currentPreviewView.parent as? ViewGroup ?: return null
        val bitmap: Bitmap = currentPreviewView.bitmap ?: return null
        val imageView: ImageView = ImageView(activity)

        imageView.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        imageView.scaleType = ImageView.ScaleType.FIT_XY
        imageView.setImageBitmap(bitmap)

        if (!previewLayout.add(imageView, parent.indexOfChild(currentPreviewView) + 1)) {
            imageView.setImageDrawable(null)
            bitmap.recycle()
            return null
        }

        frozenBitmap = bitmap
        frozenView = imageView
        orientationBeforeFreeze = activity.requestedOrientation
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LOCKED

        return bitmap
    }

    fun isActive(): Boolean {
        return state != CameraSessionState.IDLE
    }

    fun isRunning(): Boolean {
        return state == CameraSessionState.RUNNING
    }

    fun previewViewport(): CssRect? {
        return previewLayout.currentViewport()
    }

    fun setPreviewViewport(viewport: CssRect?) {
        previewLayout.setViewport(viewport)
    }

    fun start(webView: View, analyzer: ImageAnalysis.Analyzer, callback: EngineCallback<Unit>) {
        if (state == CameraSessionState.RUNNING) {
            callback.onSuccess(Unit)
            return
        }

        pendingStarts.add(callback)

        if (state == CameraSessionState.STARTING) {
            return
        }

        try {
            attachPreviewView(webView)
        } catch (exception: LensEngineException) {
            teardown()
            completePendingStarts(exception)
            return
        }

        state = CameraSessionState.STARTING
        startGeneration += 1

        val generation: Int = startGeneration
        val providerFuture: ListenableFuture<ProcessCameraProvider> = ProcessCameraProvider.getInstance(activity)
        val startedAt: Long = System.currentTimeMillis()

        providerFuture.addListener({
            if (generation != startGeneration || state != CameraSessionState.STARTING) {
                return@addListener
            }

            try {
                bind(providerFuture.get(), analyzer)
                state = CameraSessionState.RUNNING
                Log.i(LensEngineLog.TAG, "Camera bound in ${System.currentTimeMillis() - startedAt} ms")
                completePendingStarts(null)
            } catch (exception: Exception) {
                Log.w(LensEngineLog.TAG, "Camera could not be bound (${exception.javaClass.simpleName})")
                teardown()
                completePendingStarts(toEngineException(exception))
            }
        }, ContextCompat.getMainExecutor(activity))
    }

    fun stop() {
        startGeneration += 1
        teardown()
        completePendingStarts(LensEngineException(LensEngineErrorCode.CAMERA_START_CANCELLED, "The camera was stopped before it started"))
    }

    fun unfreeze() {
        val imageView: ImageView? = frozenView
        val bitmap: Bitmap? = frozenBitmap
        val previousOrientation: Int? = orientationBeforeFreeze

        frozenView = null
        frozenBitmap = null
        orientationBeforeFreeze = null

        if (previousOrientation != null) {
            activity.requestedOrientation = previousOrientation
        }

        if (imageView != null) {
            imageView.setImageDrawable(null)
            previewLayout.remove(imageView)
        }

        bitmap?.recycle()
    }

    fun updateTargetRotation() {
        val rotation: Int = previewView?.display?.rotation ?: return

        preview?.setTargetRotation(rotation)
        imageAnalysis?.setTargetRotation(rotation)
    }

    private fun attachPreviewView(webView: View) {
        val view: PreviewView = PreviewView(activity)

        view.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        view.scaleType = PreviewView.ScaleType.FILL_CENTER
        previewLayout.attach(webView)

        if (!previewLayout.add(view, PREVIEW_VIEW_INDEX)) {
            previewLayout.detach()
            throw LensEngineException(LensEngineErrorCode.CAMERA_UNAVAILABLE, "The web view is not attached to a container")
        }

        val previewSize: FrameSize = previewLayout.placedSize()

        view.addOnLayoutChangeListener(viewSizeTracker)
        viewSizeTracker.update(previewSize.width, previewSize.height)
        webView.setBackgroundColor(Color.TRANSPARENT)
        previewView = view
    }

    private fun bind(provider: ProcessCameraProvider, analyzer: ImageAnalysis.Analyzer) {
        val currentPreviewView: PreviewView = previewView
            ?: throw LensEngineException(LensEngineErrorCode.CAMERA_UNAVAILABLE, "The preview surface is not available")

        if (!provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
            throw LensEngineException(LensEngineErrorCode.CAMERA_UNAVAILABLE, "No back camera is available")
        }

        val rotation: Int = currentPreviewView.display?.rotation ?: Surface.ROTATION_0
        val previewSelector: ResolutionSelector = ResolutionSelector.Builder()
            .setAspectRatioStrategy(SHARED_ASPECT_RATIO_STRATEGY)
            .build()
        val analysisSelector: ResolutionSelector = ResolutionSelector.Builder()
            .setAspectRatioStrategy(SHARED_ASPECT_RATIO_STRATEGY)
            .setResolutionStrategy(ResolutionStrategy(ANALYSIS_TARGET_SIZE, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
            .build()
        val boundPreview: Preview = Preview.Builder()
            .setResolutionSelector(previewSelector)
            .setTargetRotation(rotation)
            .build()
        val boundAnalysis: ImageAnalysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
            .setResolutionSelector(analysisSelector)
            .setTargetRotation(rotation)
            .build()

        boundPreview.setSurfaceProvider(currentPreviewView.surfaceProvider)
        boundAnalysis.setAnalyzer(analysisExecutor, analyzer)
        provider.unbindAll()

        val boundCamera: Camera = provider.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, boundPreview, boundAnalysis)

        lastReportedErrorCode = null
        boundCamera.cameraInfo.cameraState.observe(activity, cameraStateObserver)

        camera = boundCamera
        cameraProvider = provider
        imageAnalysis = boundAnalysis
        preview = boundPreview
        displayManager()?.registerDisplayListener(displayListener, Handler(Looper.getMainLooper()))
    }

    private fun completePendingStarts(failure: LensEngineException?) {
        val callbacks: List<EngineCallback<Unit>> = pendingStarts.toList()

        pendingStarts.clear()
        callbacks.forEach { callback: EngineCallback<Unit> ->
            if (failure == null) callback.onSuccess(Unit) else callback.onFailure(failure)
        }
    }

    private fun displayManager(): DisplayManager? {
        return ContextCompat.getSystemService(activity, DisplayManager::class.java)
    }

    private fun handleCameraState(cameraState: CameraState) {
        val stateError: CameraState.StateError? = cameraState.error

        if (stateError == null) {
            if (cameraState.type == CameraState.Type.OPEN) {
                lastReportedErrorCode = null
            }
            return
        }

        if (stateError.code == lastReportedErrorCode) {
            return
        }

        lastReportedErrorCode = stateError.code
        Log.w(LensEngineLog.TAG, "Camera state error ${stateError.code} (${stateError.type})")

        if (stateError.type == CameraState.ErrorType.CRITICAL) {
            listener.onCameraError(LensEngineErrorCode.CAMERA_ERROR, "The camera reported a critical error (${stateError.code})")
        }
    }

    private fun teardown() {
        displayManager()?.unregisterDisplayListener(displayListener)
        camera?.cameraInfo?.cameraState?.removeObserver(cameraStateObserver)
        imageAnalysis?.clearAnalyzer()
        preview?.setSurfaceProvider(null)
        cameraProvider?.unbindAll()
        unfreeze()

        val currentPreviewView: PreviewView? = previewView

        if (currentPreviewView != null) {
            currentPreviewView.removeOnLayoutChangeListener(viewSizeTracker)
            previewLayout.remove(currentPreviewView)
        }

        previewLayout.detach()

        camera = null
        cameraProvider = null
        imageAnalysis = null
        lastReportedErrorCode = null
        preview = null
        previewView = null
        state = CameraSessionState.IDLE
    }

    private fun toEngineException(exception: Exception): LensEngineException {
        val cause: Throwable = exception.cause ?: exception

        if (exception is LensEngineException) {
            return exception
        }

        if (cause is LensEngineException) {
            return cause
        }

        return LensEngineException(LensEngineErrorCode.CAMERA_UNAVAILABLE, "The camera could not be started")
    }

    private enum class CameraSessionState {
        IDLE,
        RUNNING,
        STARTING,
    }

    companion object {
        private val ANALYSIS_TARGET_SIZE: Size = Size(1920, 1440)
        private const val PREVIEW_VIEW_INDEX: Int = 0
        private val SHARED_ASPECT_RATIO_STRATEGY: AspectRatioStrategy = AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY
    }
}
