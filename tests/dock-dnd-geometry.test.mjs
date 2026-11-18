import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canDropDockItemAtIndex,
    isDockDndFavoriteBoundaryInsertion,
    resolveDockDndInsertionIndex,
    resolveDockDndPreviewChildIndex,
    resolveDockRemovalZoneGeometry,
} from '../dist/features/interaction/dnd-geometry.js';

test('resolves insertion before the first item, including the first midpoint', () => {
    assert.equal(resolveDockDndInsertionIndex([20, 50, 80], 0), 0);
    assert.equal(resolveDockDndInsertionIndex([20, 50, 80], 20), 0);
});

test('resolves insertion between items and after the final item', () => {
    assert.equal(resolveDockDndInsertionIndex([20, 50, 80], 21), 1);
    assert.equal(resolveDockDndInsertionIndex([20, 50, 80], 65), 2);
    assert.equal(resolveDockDndInsertionIndex([20, 50, 80], 100), 3);
});

test('uses the same axis-independent insertion calculation for all dock edges', () => {
    const horizontalMidpoints = [30, 70, 110];
    const verticalMidpoints = [30, 70, 110];
    assert.equal(resolveDockDndInsertionIndex(horizontalMidpoints, 90), 2);
    assert.equal(resolveDockDndInsertionIndex(verticalMidpoints, 90), 2);
});

test('rejects incomplete or non-finite geometry instead of guessing a drop index', () => {
    assert.equal(resolveDockDndInsertionIndex([10, null, 40], 50), null);
    assert.equal(resolveDockDndInsertionIndex([10, Number.NaN, 40], 50), null);
    assert.equal(resolveDockDndInsertionIndex([10, 40], Number.NaN), null);
});

test('resolves an empty dock to its only insertion slot', () => {
    assert.equal(resolveDockDndInsertionIndex([], 50), 0);
});

test('allows a favorite to move within the favorite section', () => {
    assert.equal(canDropDockItemAtIndex(true, 2, 3), true);
    assert.equal(canDropDockItemAtIndex(true, 3, 3), true);
});

test('rejects a favorite moved beyond the favorite section', () => {
    assert.equal(canDropDockItemAtIndex(true, 4, 3), false);
});

test('allows a non-favorite application to be dropped into the favorite section', () => {
    assert.equal(canDropDockItemAtIndex(false, 0, 3), true);
});

test('previews a favorite before the separator when moved to the end of favorites', () => {
    assert.equal(isDockDndFavoriteBoundaryInsertion(true, false, 2, 2), true);
    assert.equal(resolveDockDndPreviewChildIndex(5, 4, 8, true), 4);
});

test('keeps a non-favorite dragged from the running section after the separator', () => {
    assert.equal(isDockDndFavoriteBoundaryInsertion(false, false, 3, 3), false);
    assert.equal(resolveDockDndPreviewChildIndex(5, 4, 8, false), 5);
});

test('does not move the separator when a favorite is inserted before another favorite', () => {
    assert.equal(isDockDndFavoriteBoundaryInsertion(true, true, 1, 2), false);
});

test('uses the end slot when no registered target actor is mounted', () => {
    assert.equal(resolveDockDndPreviewChildIndex(-1, 4, 8, false), 8);
});

test('restores a two-thirds-screen removal area opposite horizontal docks', () => {
    const monitor = { x: 100, y: 50, width: 1200, height: 800 };
    assert.deepEqual(resolveDockRemovalZoneGeometry(monitor, 'bottom'), {
        x: 100, y: 82, width: 1200, height: 533,
    });
    assert.deepEqual(resolveDockRemovalZoneGeometry(monitor, 'top'), {
        x: 100, y: 317, width: 1200, height: 533,
    });
});

test('restores a two-thirds-screen removal area opposite vertical docks', () => {
    const monitor = { x: 100, y: 50, width: 1200, height: 800 };
    assert.deepEqual(resolveDockRemovalZoneGeometry(monitor, 'left'), {
        x: 500, y: 50, width: 800, height: 800,
    });
    assert.deepEqual(resolveDockRemovalZoneGeometry(monitor, 'right'), {
        x: 100, y: 50, width: 800, height: 800,
    });
});

test('keeps the large bottom-dock removal area below the top panel', () => {
    const monitor = { x: 100, y: 50, width: 1200, height: 800 };
    assert.deepEqual(
        resolveDockRemovalZoneGeometry(monitor, 'bottom', 32),
        { x: 100, y: 82, width: 1200, height: 501 },
    );
});
