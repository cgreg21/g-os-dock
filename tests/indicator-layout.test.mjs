import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIndicatorMarkerLayout } from '../dist/features/indicator-layout.js';

test('centers a single marker along the bottom edge', () => {
    assert.deepEqual(
        resolveIndicatorMarkerLayout(1, 12, 4, 40, 32, 3),
        { width: 12, height: 4, x: 14, y: 25 },
    );
});

test('accounts for spacing between multiple markers', () => {
    assert.deepEqual(
        resolveIndicatorMarkerLayout(3, 10, 4, 50, 30, 2),
        { width: 34, height: 4, x: 8, y: 24 },
    );
});

test('clamps horizontal placement when markers exceed container width', () => {
    assert.deepEqual(
        resolveIndicatorMarkerLayout(4, 12, 4, 30, 20, 1),
        { width: 54, height: 4, x: 0, y: 15 },
    );
});

test('supports custom spacing and bottom offsets', () => {
    assert.deepEqual(
        resolveIndicatorMarkerLayout(2, 8, 3, 40, 24, 5, 4),
        { width: 20, height: 3, x: 10, y: 16 },
    );
});
