import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateFavoritesSeparatorSpace,
    hasFavoritesSeparatorTarget,
    resolveFavoritesSeparatorTarget,
    resolveFavoritesSeparatorTargetIndex,
} from '../dist/features/favorites-separator.js';

const app = id => ({ get_id: () => id });

test('returns the first running application after the favorite section', () => {
    const favoriteA = app('favorite-a');
    const favoriteB = app('favorite-b');
    const runningA = app('running-a');
    const runningB = app('running-b');

    assert.equal(
        resolveFavoritesSeparatorTarget(
            [favoriteA, favoriteB, runningA, runningB],
            new Set(['favorite-a', 'favorite-b']),
        ),
        runningA,
    );
});

test('returns null when there are no favorites', () => {
    assert.equal(
        resolveFavoritesSeparatorTarget([app('running-a')], new Set()),
        null,
    );
});

test('returns null when every application is a favorite', () => {
    assert.equal(
        resolveFavoritesSeparatorTarget(
            [app('favorite-a'), app('favorite-b')],
            new Set(['favorite-a', 'favorite-b']),
        ),
        null,
    );
});

test('treats an item without an application ID as non-favorite', () => {
    const noId = app(null);

    assert.equal(
        resolveFavoritesSeparatorTarget(
            [app('favorite-a'), noId],
            new Set(['favorite-a']),
        ),
        noId,
    );
});

test('does not return an item before the first favorite', () => {
    const running = app('running-a');
    const favorite = app('favorite-a');

    assert.equal(
        resolveFavoritesSeparatorTarget(
            [running, favorite],
            new Set(['favorite-a']),
        ),
        null,
    );
});

test('shares separator visibility detection with sizing', () => {
    assert.equal(hasFavoritesSeparatorTarget(
        ['favorite-a', 'running-a'],
        new Set(['favorite-a']),
    ), true);
    assert.equal(hasFavoritesSeparatorTarget(
        ['favorite-a', 'favorite-b'],
        new Set(['favorite-a', 'favorite-b']),
    ), false);
    assert.equal(hasFavoritesSeparatorTarget(
        ['running-a', 'favorite-a'],
        new Set(['favorite-a']),
    ), false);
});

test('calculates the exact main-axis separator cost', () => {
    assert.equal(calculateFavoritesSeparatorSpace(true, 2, 4, 6), 16);
    assert.equal(calculateFavoritesSeparatorSpace(false, 2, 4, 6), 0);
});

test('normalizes negative separator dimensions to zero', () => {
    assert.equal(calculateFavoritesSeparatorSpace(true, -2, -4, -6), 0);
});

test('resolves the separator target index from generic application IDs', () => {
    assert.equal(
        resolveFavoritesSeparatorTargetIndex(
            ['favorite-a', 'favorite-b', 'running-a', 'running-b'],
            new Set(['favorite-a', 'favorite-b']),
        ),
        2,
    );
    assert.equal(
        resolveFavoritesSeparatorTargetIndex(
            ['running-a', 'favorite-a'],
            new Set(['favorite-a']),
        ),
        -1,
    );
});
