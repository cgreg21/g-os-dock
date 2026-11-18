import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DockPositioner,
    resolveDockEdgeSensor,
    resolveHiddenTranslation,
} from '../dist/features/dock-positioner.js';

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

test('resolves edge sensor geometry for all four dock edges', () => {
    const monitor = { x: -100, y: 40, width: 800, height: 600 };
    assert.deepEqual(resolveDockEdgeSensor({
        monitor, edge: 'top', thickness: 3,
    }), { x: -100, y: 40, width: 800, height: 3 });
    assert.deepEqual(resolveDockEdgeSensor({
        monitor, edge: 'bottom', thickness: 3,
    }), { x: -100, y: 637, width: 800, height: 3 });
    assert.deepEqual(resolveDockEdgeSensor({
        monitor, edge: 'left', thickness: 3,
    }), { x: -100, y: 40, width: 3, height: 600 });
    assert.deepEqual(resolveDockEdgeSensor({
        monitor, edge: 'right', thickness: 3,
    }), { x: 697, y: 40, width: 3, height: 600 });
});

test('keeps the top edge sensor below the panel reveal margin', () => {
    const monitor = { x: 0, y: 100, width: 1920, height: 1080 };
    assert.deepEqual(resolveDockEdgeSensor({
        monitor, edge: 'left', thickness: 3, topInset: 48,
    }), { x: 0, y: 148, width: 3, height: 1032 });
    assert.deepEqual(resolveDockEdgeSensor({
        monitor, edge: 'top', thickness: 3, topInset: 5000,
    }), { x: 0, y: 1180, width: 1920, height: 3 });
});

test('resolves hidden translations for each dock edge', () => {
    const size = { width: 120, height: 64 };
    assert.deepEqual(resolveHiddenTranslation('left', size), { x: -120, y: 0 });
    assert.deepEqual(resolveHiddenTranslation('right', size), { x: 120, y: 0 });
    assert.deepEqual(resolveHiddenTranslation('top', size), { x: 0, y: -64 });
    assert.deepEqual(resolveHiddenTranslation('bottom', size), { x: 0, y: 64 });
});
