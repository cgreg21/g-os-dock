import assert from 'node:assert/strict';
import test from 'node:test';
import { DockPositioner } from '../dist/features/dock-positioner.js';

const bounds = { x: 100, y: 50, width: 800, height: 600 };

test('places floating content relative to each dock edge', () => {
    const anchor = { x: 400, y: 300, width: 64, height: 64 };
    const size = { width: 200, height: 100 };
    assert.deepEqual(DockPositioner.placeFloating(anchor, size, 'top', 10, bounds), { x: 332, y: 374 });
    assert.deepEqual(DockPositioner.placeFloating(anchor, size, 'bottom', 10, bounds), { x: 332, y: 190 });
    assert.deepEqual(DockPositioner.placeFloating(anchor, size, 'left', 10, bounds), { x: 474, y: 282 });
    assert.deepEqual(DockPositioner.placeFloating(anchor, size, 'right', 10, bounds), { x: 190, y: 282 });
});

test('clamps oversized placements to the padded monitor bounds', () => {
    assert.deepEqual(
        DockPositioner.clamp({ x: -100, y: 900 }, { width: 200, height: 100 }, bounds, 8),
        { x: 108, y: 542 },
    );
});

test('supports monitors with non-zero origins', () => {
    assert.deepEqual(
        DockPositioner.clamp({ x: 0, y: 0 }, { width: 100, height: 80 }, bounds, 12),
        { x: 112, y: 62 },
    );
});
