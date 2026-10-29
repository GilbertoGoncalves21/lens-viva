package com.oaxis.lensviva

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ApplicationContextTest {
    @Test
    fun usesLensVivaPackage() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext

        assertEquals("com.oaxis.lensviva", context.packageName)
    }
}
