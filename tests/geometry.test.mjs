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

test('rejects rectangles whose calculated edges overflow', () => {
    const dock = { x: 0, y: 0, width: 100, height: 100 };
    assert.equal(rectanglesOverlap(dock, {
        x: Number.MAX_VALUE, y: 10, width: Number.MAX_VALUE, height: 20,
    }), false);
    assert.equal(rectanglesOverlap(dock, {
        x: 10, y: Number.MAX_VALUE, width: 20, height: Number.MAX_VALUE,
    }), false);
});


test('builds the smallest rectangle containing both inputs', async () => {
    const { unionRectangles } = await import('../dist/features/geometry.js');
    assert.deepEqual(
        unionRectangles(
            { x: 10, y: 20, width: 30, height: 40 },
            { x: 0, y: 35, width: 60, height: 10 },
        ),
        { x: 0, y: 20, width: 60, height: 40 },
    );
});

test('unions overlapping, contained, and negative-coordinate rectangles', async () => {
    const { unionRectangles } = await import('../dist/features/geometry.js');
    assert.deepEqual(
        unionRectangles(
            { x: -100, y: -50, width: 40, height: 30 },
            { x: -90, y: -45, width: 10, height: 10 },
        ),
        { x: -100, y: -50, width: 40, height: 30 },
    );
});

test('rejects invalid or overflowing rectangle unions', async () => {
    const { unionRectangles } = await import('../dist/features/geometry.js');
    assert.equal(unionRectangles(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 10, width: 0, height: 10 },
    ), null);
    assert.equal(unionRectangles(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 10 },
    ), null);
});


test('shares rectangle validation across geometry operations', async () => {
    const { isValidRectangle } = await import('../dist/features/geometry.js');
    assert.equal(isValidRectangle({ x: -20, y: 10, width: 20, height: 30 }), true);
    assert.equal(isValidRectangle({ x: 0, y: 0, width: 0, height: 10 }), false);
    assert.equal(isValidRectangle({ x: 1e20, y: 0, width: 1, height: 10 }), false);
    assert.equal(isValidRectangle({ x: 0, y: 1e20, width: 10, height: 1 }), false);
    assert.equal(isValidRectangle({ x: Number.NaN, y: 0, width: 10, height: 10 }), false);
    assert.equal(isValidRectangle({
        x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 10,
    }), false);
});


test('returns the exact positive-area rectangle intersection', async () => {
    const { intersectRectangles } = await import('../dist/features/geometry.js');
    assert.deepEqual(
        intersectRectangles(
            { x: 10, y: 20, width: 30, height: 40 },
            { x: 25, y: 5, width: 30, height: 30 },
        ),
        { x: 25, y: 20, width: 15, height: 15 },
    );
});

test('returns no intersection for touching or invalid rectangles', async () => {
    const { intersectRectangles } = await import('../dist/features/geometry.js');
    assert.equal(intersectRectangles(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 10, height: 10 },
    ), null);
    assert.equal(intersectRectangles(
        { x: 1e20, y: 0, width: 1, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 },
    ), null);
});


test('keeps intersection, overlap, and union symmetric for valid rectangles', async () => {
    const {
        intersectRectangles,
        isValidRectangle,
        rectanglesOverlap,
        unionRectangles,
    } = await import('../dist/features/geometry.js');
    const cases = [
        [
            { x: -120, y: 40, width: 80, height: 60 },
            { x: -80, y: 20, width: 100, height: 70 },
        ],
        [
            { x: 0, y: 0, width: 20, height: 20 },
            { x: 5, y: 5, width: 5, height: 5 },
        ],
        [
            { x: 100, y: -50, width: 25, height: 30 },
            { x: 125, y: -50, width: 10, height: 30 },
        ],
    ];

    for (const [first, second] of cases) {
        assert.equal(rectanglesOverlap(first, second), rectanglesOverlap(second, first));
        assert.deepEqual(intersectRectangles(first, second), intersectRectangles(second, first));
        assert.deepEqual(unionRectangles(first, second), unionRectangles(second, first));

        const union = unionRectangles(first, second);
        assert.ok(union && isValidRectangle(union));
        for (const rectangle of [first, second]) {
            assert.ok(union.x <= rectangle.x);
            assert.ok(union.y <= rectangle.y);
            assert.ok(union.x + union.width >= rectangle.x + rectangle.width);
            assert.ok(union.y + union.height >= rectangle.y + rectangle.height);
        }
    }
});
