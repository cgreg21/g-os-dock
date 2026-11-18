import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canDropDockItemAtIndex,
    resolveDockDndInsertionIndex,
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
