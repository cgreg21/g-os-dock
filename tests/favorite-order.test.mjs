import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFavoriteOrderPlan } from '../dist/features/favorite-order.js';

test('pins only apps moved into the favorite boundary', () => {
    assert.deepEqual(
        resolveFavoriteOrderPlan(
            ['new', 'pinned', 'running', 'other'],
            ['pinned', 'other'],
            2,
        ),
        {
            idsToPin: ['new'],
            orderedFavoriteIds: ['new', 'pinned', 'other'],
        },
    );
});

test('uses the first app as pinning area when no favorites exist', () => {
    assert.deepEqual(
        resolveFavoriteOrderPlan(['first', 'second'], [], 1),
        { idsToPin: ['first'], orderedFavoriteIds: ['first'] },
    );
});

test('clamps boundaries and preserves existing favorites outside app order', () => {
    assert.deepEqual(
        resolveFavoriteOrderPlan(['b', 'a'], ['a', 'outside'], 99),
        { idsToPin: ['b'], orderedFavoriteIds: ['b', 'a'] },
    );
    assert.deepEqual(
        resolveFavoriteOrderPlan(['a'], ['a'], -5),
        { idsToPin: [], orderedFavoriteIds: ['a'] },
    );
});

test('does not mutate input arrays', () => {
    const apps = ['b', 'a'];
    const favorites = ['a', 'outside'];
    resolveFavoriteOrderPlan(apps, favorites, 1);
    assert.deepEqual(apps, ['b', 'a']);
    assert.deepEqual(favorites, ['a', 'outside']);
});
