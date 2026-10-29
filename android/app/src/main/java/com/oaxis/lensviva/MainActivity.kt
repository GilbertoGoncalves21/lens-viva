package com.oaxis.lensviva

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(LensEnginePlugin::class.java)
        super.onCreate(savedInstanceState)
        bridge?.webView?.settings?.textZoom = 100
    }
}
