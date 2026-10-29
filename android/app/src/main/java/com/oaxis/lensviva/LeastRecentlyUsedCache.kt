package com.oaxis.lensviva

import java.io.Closeable

class LeastRecentlyUsedCache<V : Closeable>(private val capacity: Int) {
    private val valuesByKey: LinkedHashMap<String, V> = LinkedHashMap(capacity + 1, LOAD_FACTOR, true)

    init {
        require(capacity > 0) { "The cache capacity must be positive" }
    }

    @Synchronized
    fun clear() {
        val values: List<V> = valuesByKey.values.toList()

        valuesByKey.clear()
        values.forEach { value: V -> value.close() }
    }

    @Synchronized
    fun getOrCreate(key: String, factory: () -> V): V {
        val existing: V? = valuesByKey[key]

        if (existing != null) {
            return existing
        }

        while (valuesByKey.size >= capacity) {
            val eldestKey: String = valuesByKey.keys.first()

            valuesByKey.remove(eldestKey)?.close()
        }

        val created: V = factory()

        valuesByKey[key] = created

        return created
    }

    @Synchronized
    fun removeWhere(predicate: (String) -> Boolean) {
        val keys: List<String> = valuesByKey.keys.filter(predicate)

        keys.forEach { key: String -> valuesByKey.remove(key)?.close() }
    }

    @Synchronized
    fun size(): Int {
        return valuesByKey.size
    }

    companion object {
        private const val LOAD_FACTOR: Float = 0.75f
    }
}
