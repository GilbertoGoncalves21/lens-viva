package com.oaxis.lensviva

import android.util.Log
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

class GuardedExecutor : Executor {
    private val delegate: ExecutorService = Executors.newSingleThreadExecutor()

    override fun execute(command: Runnable) {
        try {
            delegate.execute(command)
        } catch (exception: RejectedExecutionException) {
            Log.d(LensEngineLog.TAG, "Task skipped because the engine is shutting down")
        }
    }

    fun shutdown() {
        delegate.shutdown()
    }
}
