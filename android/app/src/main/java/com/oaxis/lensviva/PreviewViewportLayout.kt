package com.oaxis.lensviva

import android.annotation.SuppressLint
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.coordinatorlayout.widget.CoordinatorLayout

class PreviewViewportLayout {
    private val placedViewLayoutListener: View.OnLayoutChangeListener = object : View.OnLayoutChangeListener {
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
            alignTranslation(view)
        }
    }
    private val placedViews: MutableList<View> = mutableListOf()
    private var placement: PixelBounds? = null
    private var relayoutPending: Boolean = false
    private val relayoutRunnable: Runnable = Runnable {
        relayoutPending = false
        relayout()
    }
    private var viewport: CssRect? = null
    private var webView: View? = null
    private val webViewLayoutListener: View.OnLayoutChangeListener = object : View.OnLayoutChangeListener {
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
            if (left != oldLeft || top != oldTop || right != oldRight || bottom != oldBottom) {
                scheduleRelayout(view)
            }
        }
    }

    fun add(view: View, index: Int): Boolean {
        val currentWebView: View = webView ?: return false
        val parent: ViewGroup = currentWebView.parent as? ViewGroup ?: return false

        placement = computePlacement(currentWebView)
        parent.addView(view, index, layoutParamsFor(parent, currentWebView))
        view.addOnLayoutChangeListener(placedViewLayoutListener)
        placedViews.add(view)
        alignTranslation(view)

        return true
    }

    fun attach(webView: View) {
        detach()
        this.webView = webView
        webView.addOnLayoutChangeListener(webViewLayoutListener)
    }

    fun currentViewport(): CssRect? {
        return viewport
    }

    fun detach() {
        placedViews.toList().forEach { view: View -> remove(view) }

        val currentWebView: View? = webView

        if (currentWebView != null) {
            currentWebView.removeOnLayoutChangeListener(webViewLayoutListener)
            currentWebView.removeCallbacks(relayoutRunnable)
        }

        placement = null
        relayoutPending = false
        webView = null
    }

    fun placedSize(): FrameSize {
        val currentPlacement: PixelBounds? = placement

        if (currentPlacement != null) {
            return FrameSize(currentPlacement.width, currentPlacement.height)
        }

        val currentWebView: View = webView ?: return FrameSize(0, 0)

        return FrameSize(currentWebView.width, currentWebView.height)
    }

    fun remove(view: View) {
        view.removeOnLayoutChangeListener(placedViewLayoutListener)
        view.translationX = 0f
        view.translationY = 0f
        placedViews.remove(view)
        (view.parent as? ViewGroup)?.removeView(view)
    }

    fun setViewport(viewport: CssRect?) {
        this.viewport = viewport
        relayout()
    }

    private fun alignTranslation(view: View) {
        val currentPlacement: PixelBounds? = placement

        if (currentPlacement == null) {
            view.translationX = 0f
            view.translationY = 0f
            return
        }

        view.translationX = (currentPlacement.left - view.left).toFloat()
        view.translationY = (currentPlacement.top - view.top).toFloat()
    }

    private fun computePlacement(webView: View): PixelBounds? {
        if (webView.width <= 0 || webView.height <= 0) {
            return null
        }

        val bounds: PixelBounds = ViewportLayoutPolicy.toPixelBounds(viewport, webViewScale(webView), webView.width, webView.height)

        return ViewportLayoutPolicy.translate(bounds, webView.left, webView.top)
    }

    private fun hasSameLayout(current: ViewGroup.LayoutParams?, next: ViewGroup.LayoutParams): Boolean {
        if (current == null || current.width != next.width || current.height != next.height) {
            return false
        }

        val currentMargins: ViewGroup.MarginLayoutParams? = current as? ViewGroup.MarginLayoutParams
        val nextMargins: ViewGroup.MarginLayoutParams? = next as? ViewGroup.MarginLayoutParams

        return currentMargins?.leftMargin == nextMargins?.leftMargin &&
            currentMargins?.topMargin == nextMargins?.topMargin &&
            currentMargins?.rightMargin == nextMargins?.rightMargin &&
            currentMargins?.bottomMargin == nextMargins?.bottomMargin
    }

    private fun layoutParamsFor(parent: ViewGroup, webView: View): ViewGroup.MarginLayoutParams {
        val currentPlacement: PixelBounds = placement ?: return webViewLayoutParams(parent, webView)
        val layoutParams: ViewGroup.MarginLayoutParams = sizedLayoutParams(parent, currentPlacement.width, currentPlacement.height)

        layoutParams.setMargins(currentPlacement.left - parent.paddingLeft, currentPlacement.top - parent.paddingTop, 0, 0)

        return layoutParams
    }

    private fun relayout() {
        val currentWebView: View = webView ?: return
        val parent: ViewGroup = currentWebView.parent as? ViewGroup ?: return

        placement = computePlacement(currentWebView)
        placedViews.forEach { view: View ->
            val layoutParams: ViewGroup.MarginLayoutParams = layoutParamsFor(parent, currentWebView)

            if (!hasSameLayout(view.layoutParams, layoutParams)) {
                view.layoutParams = layoutParams
            }

            alignTranslation(view)
        }
    }

    private fun scheduleRelayout(view: View) {
        if (relayoutPending) {
            return
        }

        relayoutPending = true
        view.post(relayoutRunnable)
    }

    @SuppressLint("RtlHardcoded")
    private fun sizedLayoutParams(parent: ViewGroup, width: Int, height: Int): ViewGroup.MarginLayoutParams {
        return when (parent) {
            is CoordinatorLayout -> CoordinatorLayout.LayoutParams(width, height).also { layoutParams: CoordinatorLayout.LayoutParams ->
                layoutParams.gravity = Gravity.TOP or Gravity.LEFT
            }
            is FrameLayout -> FrameLayout.LayoutParams(width, height, Gravity.TOP or Gravity.LEFT)
            else -> ViewGroup.MarginLayoutParams(width, height)
        }
    }

    private fun webViewLayoutParams(parent: ViewGroup, webView: View): ViewGroup.MarginLayoutParams {
        val layoutParams: ViewGroup.MarginLayoutParams = sizedLayoutParams(parent, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        val sourceLayoutParams: ViewGroup.MarginLayoutParams? = webView.layoutParams as? ViewGroup.MarginLayoutParams

        if (sourceLayoutParams != null) {
            layoutParams.setMargins(sourceLayoutParams.leftMargin, sourceLayoutParams.topMargin, sourceLayoutParams.rightMargin, sourceLayoutParams.bottomMargin)
        }

        return layoutParams
    }

    private fun webViewScale(webView: View): Float {
        return ViewportLayoutPolicy.resolveScale(webView.resources.displayMetrics.density, zoomScale(webView))
    }

    @Suppress("DEPRECATION")
    private fun zoomScale(webView: View): Float? {
        if (webView !is WebView) {
            return null
        }

        val settings: WebSettings = webView.settings

        if (!settings.supportZoom() || !settings.builtInZoomControls) {
            return null
        }

        return webView.scale
    }
}
