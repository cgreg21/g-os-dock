import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createItemOrderRanks,
    resolveSavedItemOrder,
} from '../dist/features/item-order.js';

test('creates rank maps from persisted order', () => {
    const ranks = createItemOrderRanks(['app:a', 'system:launcher', 'app:b']);
    assert.equal(ranks.get('app:a'), 0);
    assert.equal(ranks.get('system:launcher'), 1);
    assert.equal(ranks.get('app:b'), 2);
});

test('keeps an existing saved order unchanged', () => {
    const saved = ['app:b', 'system:launcher', 'app:a'];
    const items = [{ id: 'app:a' }, { id: 'app:b' }, { id: 'system:launcher' }];
    assert.deepEqual(resolveSavedItemOrder(saved, items, 0), saved);
});

test('migrates the legacy launcher position among remaining items', () => {
    const items = [
        { id: 'app:a' },
        { id: 'system:launcher' },
        { id: 'system:trash' },
        { id: 'volume:disk' },
    ];
    assert.deepEqual(
        resolveSavedItemOrder([], items, 2),
        ['app:a', 'system:trash', 'system:launcher', 'volume:disk'],
    );
});

test('clamps legacy launcher positions and handles missing launcher', () => {
    const items = [{ id: 'app:a' }, { id: 'system:launcher' }];
    assert.deepEqual(resolveSavedItemOrder([], items, 99), ['app:a', 'system:launcher']);
    assert.deepEqual(resolveSavedItemOrder([], [{ id: 'app:a' }], -5), ['app:a']);
});

test('does not mutate input arrays', () => {
    const saved = ['app:b', 'app:a'];
    const items = [{ id: 'app:a' }, { id: 'app:b' }, { id: 'system:launcher' }];
    resolveSavedItemOrder(saved, items, 1);
    assert.deepEqual(saved, ['app:b', 'app:a']);
    assert.deepEqual(items.map(item => item.id), ['app:a', 'app:b', 'system:launcher']);
});
