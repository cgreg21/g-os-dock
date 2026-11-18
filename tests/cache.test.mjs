import assert from 'node:assert/strict';
import test from 'node:test';
import { DockCache } from '../dist/features/cache.js';

test('stores and retrieves generic values, including undefined', () => {
    const cache = new DockCache();
    cache.set('undefined', undefined);
    assert.equal(cache.has('undefined'), true);
    assert.equal(cache.get('undefined'), undefined);
    assert.equal(cache.has('missing'), false);
});

test('refreshes least-recently-used entries and evicts the oldest', () => {
    const cache = new DockCache(2);
    cache.set('first', 1);
    cache.set('second', 2);
    assert.equal(cache.get('first'), 1);
    cache.set('third', 3);
    assert.equal(cache.has('second'), false);
    assert.equal(cache.get('first'), 1);
    assert.equal(cache.get('third'), 3);
});

test('expires entries lazily and supports a zero TTL', () => {
    const cache = new DockCache(4, 100);
    const originalNow = Date.now;
    let now = 1000;
    Date.now = () => now;
    try {
        cache.set('short-lived', 'value', 10);
        assert.equal(cache.get('short-lived'), 'value');
        now += 10;
        assert.equal(cache.has('short-lived'), false);
        cache.set('immediate', 'value', 0);
        assert.equal(cache.get('immediate'), undefined);
        cache.set('not-a-duration', 'value', Number.NaN);
        assert.equal(cache.has('not-a-duration'), false);
        assert.equal(cache.get('not-a-duration'), undefined);
    } finally {
        Date.now = originalNow;
    }
});

test('creates a value once and updates cache statistics', () => {
    const cache = new DockCache();
    let calls = 0;
    const factory = () => ++calls;
    assert.equal(cache.getOrCreate('key', factory), 1);
    assert.equal(cache.getOrCreate('key', factory), 1);
    assert.equal(calls, 1);
    assert.deepEqual(cache.statistics, { size: 1, hits: 1, misses: 1 });
});

test('clear resets entries and statistics', () => {
    const cache = new DockCache();
    cache.set('key', 'value');
    cache.get('key');
    cache.clear();
    assert.deepEqual(cache.statistics, { size: 0, hits: 0, misses: 0 });
});
