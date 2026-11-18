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
    private readonly maxEntries: number;
    private readonly defaultTtlMs: number;

    constructor(maxEntries = 512, defaultTtlMs = 5 * 60 * 1000) {
        // A non-finite capacity such as NaN would disable eviction and allow
        // unbounded growth. Normalize it to the standard bounded capacity.
        this.maxEntries = Number.isFinite(maxEntries)
            ? Math.max(0, Math.floor(maxEntries))
            : 512;
        this.defaultTtlMs = Number.isNaN(defaultTtlMs)
            ? 0
            : Math.max(0, defaultTtlMs);
    }

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
            // Treat NaN as an immediate expiry; otherwise comparisons with
            // the resulting NaN timestamp would make get() and getOrCreate()
            // disagree about whether the entry is still valid.
            expiresAt: Date.now() + (Number.isNaN(ttlMs) ? 0 : Math.max(0, ttlMs)),
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
