import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFavoritesSeparatorTarget } from '../dist/features/favorites-separator.js';

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
