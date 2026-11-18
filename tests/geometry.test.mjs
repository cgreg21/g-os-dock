import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglesOverlap } from '../dist/features/geometry.js';

test('detects partial and contained rectangle intersections', () => {
    const dock = { x: 100, y: 100, width: 80, height: 40 };
    assert.equal(rectanglesOverlap(dock, { x: 150, y: 110, width: 40, height: 40 }), true);
    assert.equal(rectanglesOverlap(dock, { x: 110, y: 105, width: 20, height: 10 }), true);
    assert.equal(rectanglesOverlap(dock, { x: 0, y: 0, width: 500, height: 500 }), true);
});

test('treats touching edges as non-overlapping', () => {
    const dock = { x: 100, y: 100, width: 80, height: 40 };
    assert.equal(rectanglesOverlap(dock, { x: 180, y: 100, width: 20, height: 40 }), false);
    assert.equal(rectanglesOverlap(dock, { x: 100, y: 140, width: 80, height: 20 }), false);
    assert.equal(rectanglesOverlap(dock, { x: 80, y: 100, width: 20, height: 40 }), false);
});

test('handles negative screen coordinates and separated rectangles', () => {
    const dock = { x: -1920, y: 0, width: 80, height: 600 };
    assert.equal(rectanglesOverlap(dock, { x: -1900, y: 200, width: 50, height: 50 }), true);
    assert.equal(rectanglesOverlap(dock, { x: 0, y: 0, width: 100, height: 100 }), false);
});

test('rejects rectangles with zero or negative dimensions', () => {
    const dock = { x: 100, y: 100, width: 80, height: 40 };
    assert.equal(rectanglesOverlap(dock, { x: 120, y: 110, width: 0, height: 20 }), false);
    assert.equal(rectanglesOverlap(dock, { x: 120, y: 110, width: 20, height: 0 }), false);
    assert.equal(rectanglesOverlap(dock, { x: 120, y: 110, width: -20, height: 20 }), false);
    assert.equal(rectanglesOverlap(dock, { x: 120, y: 110, width: 20, height: -20 }), false);
});

test('rejects non-finite rectangle coordinates and dimensions', () => {
    const dock = { x: 100, y: 100, width: 80, height: 40 };
    assert.equal(rectanglesOverlap(dock, { x: Number.NaN, y: 110, width: 20, height: 20 }), false);
    assert.equal(rectanglesOverlap(dock, { x: 110, y: Number.POSITIVE_INFINITY, width: 20, height: 20 }), false);
    assert.equal(rectanglesOverlap(dock, { x: 110, y: 110, width: Number.POSITIVE_INFINITY, height: 20 }), false);
});
