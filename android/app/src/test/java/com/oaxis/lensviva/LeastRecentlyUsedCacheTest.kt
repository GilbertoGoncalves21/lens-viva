package com.oaxis.lensviva

import java.io.Closeable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class LeastRecentlyUsedCacheTest {
    @Test
    fun clearClosesEveryValue() {
        val cache: LeastRecentlyUsedCache<TrackedResource> = LeastRecentlyUsedCache(CAPACITY)
        val first: TrackedResource = cache.getOrCreate(FIRST_KEY) { TrackedResource() }
        val second: TrackedResource = cache.getOrCreate(SECOND_KEY) { TrackedResource() }

        cache.clear()

        assertTrue(first.closed)
        assertTrue(second.closed)
        assertEquals(0, cache.size())
    }

    @Test(expected = IllegalArgumentException::class)
    fun constructorRejectsNonPositiveCapacity() {
        LeastRecentlyUsedCache<TrackedResource>(0)
    }

    @Test
    fun getOrCreateEvictsAndClosesTheLeastRecentlyUsedValue() {
        val cache: LeastRecentlyUsedCache<TrackedResource> = LeastRecentlyUsedCache(CAPACITY)
        val first: TrackedResource = cache.getOrCreate(FIRST_KEY) { TrackedResource() }
        val second: TrackedResource = cache.getOrCreate(SECOND_KEY) { TrackedResource() }
        val third: TrackedResource = cache.getOrCreate(THIRD_KEY) { TrackedResource() }

        assertTrue(first.closed)
        assertFalse(second.closed)
        assertFalse(third.closed)
        assertEquals(CAPACITY, cache.size())
    }

    @Test
    fun getOrCreateRefreshesRecencyOnAccess() {
        val cache: LeastRecentlyUsedCache<TrackedResource> = LeastRecentlyUsedCache(CAPACITY)
        val first: TrackedResource = cache.getOrCreate(FIRST_KEY) { TrackedResource() }
        val second: TrackedResource = cache.getOrCreate(SECOND_KEY) { TrackedResource() }

        cache.getOrCreate(FIRST_KEY) { TrackedResource() }
        cache.getOrCreate(THIRD_KEY) { TrackedResource() }

        assertFalse(first.closed)
        assertTrue(second.closed)
    }

    @Test
    fun getOrCreateReusesTheCachedValue() {
        val cache: LeastRecentlyUsedCache<TrackedResource> = LeastRecentlyUsedCache(CAPACITY)
        val created: TrackedResource = cache.getOrCreate(FIRST_KEY) { TrackedResource() }
        var factoryCalls: Int = 0
        val reused: TrackedResource = cache.getOrCreate(FIRST_KEY) {
            factoryCalls += 1
            TrackedResource()
        }

        assertSame(created, reused)
        assertEquals(0, factoryCalls)
        assertFalse(created.closed)
    }

    @Test
    fun removeWhereClosesOnlyMatchingValues() {
        val cache: LeastRecentlyUsedCache<TrackedResource> = LeastRecentlyUsedCache(CAPACITY)
        val first: TrackedResource = cache.getOrCreate(FIRST_KEY) { TrackedResource() }
        val second: TrackedResource = cache.getOrCreate(SECOND_KEY) { TrackedResource() }

        cache.removeWhere { key: String -> key == FIRST_KEY }

        assertTrue(first.closed)
        assertFalse(second.closed)
        assertEquals(1, cache.size())
    }

    private class TrackedResource : Closeable {
        var closed: Boolean = false
            private set

        override fun close() {
            closed = true
        }
    }

    private companion object {
        const val CAPACITY: Int = 2
        const val FIRST_KEY: String = "pt>en"
        const val SECOND_KEY: String = "es>en"
        const val THIRD_KEY: String = "fr>de"
    }
}
