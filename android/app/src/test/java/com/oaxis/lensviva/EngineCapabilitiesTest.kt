package com.oaxis.lensviva

import org.junit.Assert.assertEquals
import org.junit.Test

class EngineCapabilitiesTest {
    @Test
    fun entriesUseTheWebContractKeysInOrder() {
        val capabilities: EngineCapabilities = EngineCapabilities(
            cameraSelection = true,
            languageIdentification = true,
            modelRemoval = false,
            openAppSettings = true,
            translation = false,
        )

        assertEquals(
            listOf("cameraSelection", "languageIdentification", "modelRemoval", "openAppSettings", "translation"),
            capabilities.entries().keys.toList(),
        )
        assertEquals(listOf(true, true, false, true, false), capabilities.entries().values.toList())
    }

    @Test
    fun onDeviceEngineSupportsEveryCapabilityExceptCameraSelection() {
        assertEquals(
            mapOf(
                "cameraSelection" to false,
                "languageIdentification" to true,
                "modelRemoval" to true,
                "openAppSettings" to true,
                "translation" to true,
            ),
            EngineCapabilities.ON_DEVICE.entries(),
        )
    }
}
