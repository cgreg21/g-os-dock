/**
 * Small process-wide LRU cache for reusable, derived dock values.
 *
 * Entries expire lazily on access, so the cache does not need timers or
 * background sources and cannot keep the extension alive by itself.
 */
interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export class DockCache {
    private entries = new Map<string, CacheEntry<unknown>>();
    private hits = 0;
    private misses = 0;

    constructor(
        private readonly maxEntries = 512,
        private readonly defaultTtlMs = 5 * 60 * 1000,
    ) {}

    get<T>(key: string): T | undefined {
        const entry = this.entries.get(key) as CacheEntry<T> | undefined;
        if (!entry) {
            this.misses++;
            return undefined;
        }
        if (entry.expiresAt <= Date.now()) {
            this.entries.delete(key);
            this.misses++;
            return undefined;
        }

        this.entries.delete(key);
        this.entries.set(key, entry);
        this.hits++;
        return entry.value;
    }

    has(key: string): boolean {
        const entry = this.entries.get(key);
        if (!entry)
            return false;
        if (entry.expiresAt <= Date.now()) {
            this.entries.delete(key);
            return false;
        }
        return true;
    }

    set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): T {
        this.entries.delete(key);
        this.entries.set(key, {
            value,
            expiresAt: Date.now() + Math.max(0, ttlMs),
        });
        this.evictOverflow();
        return value;
    }

    getOrCreate<T>(key: string, factory: () => T, ttlMs = this.defaultTtlMs): T {
        const entry = this.entries.get(key) as CacheEntry<T> | undefined;
        if (entry && entry.expiresAt > Date.now()) {
            this.entries.delete(key);
            this.entries.set(key, entry);
            this.hits++;
            return entry.value;
        }

        if (entry)
            this.entries.delete(key);

        this.misses++;
        return this.set(key, factory(), ttlMs);
    }

    delete(key: string): boolean {
        return this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
        this.hits = 0;
        this.misses = 0;
    }

    get size(): number {
        this.pruneExpired();
        return this.entries.size;
    }

    get statistics(): { size: number; hits: number; misses: number } {
        this.pruneExpired();
        return { size: this.entries.size, hits: this.hits, misses: this.misses };
    }

    private pruneExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now)
                this.entries.delete(key);
        }
    }

    private evictOverflow(): void {
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined)
                return;
            this.entries.delete(oldest);
        }
    }
}

/** Shared cache for derived values used by all dock instances and features. */
export const dockCache = new DockCache();
