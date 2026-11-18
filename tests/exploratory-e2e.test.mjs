import assert from 'node:assert/strict';
import test from 'node:test';

import {
    resolveDockDndInsertionIndex,
    resolveDockDndInsertionIndexWithHysteresis,
} from '../dist/features/interaction/dnd-geometry.js';
import {
    DockPositioner,
    resolveDockEdgeSensor,
    resolveDockSurfacePosition,
} from '../dist/features/layout/dock-positioner.js';
import {
    calculateDockIconSize,
} from '../dist/features/layout/icon-sizing.js';
import {
    mergeDockFolderMembers,
    resolveDockFolderDropOrder,
    resolveDockFolderRemoval,
} from '../dist/features/applications/folder-state.js';
import {
    resolveWrappedDockIndex,
} from '../dist/features/interaction/keyboard-navigation-state.js';

// Reproducible pseudo-random exploration. A failing seed and iteration are
// included in assertion messages so every discovered case can be replayed.
function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function integer(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
}

function scenario(seed, iteration) {
    return `seed=0x${seed.toString(16)}, iteration=${iteration}`;
}

const EDGES = ['top', 'right', 'bottom', 'left'];

test('Exploratory E2E: randomized dock geometry stays inside varied monitor work areas', () => {
    const seed = 0x51d0c;
    const random = createRandom(seed);
    for (let i = 0; i < 2500; i++) {
        const monitor = {
            x: integer(random, -4000, 4000),
            y: integer(random, -1500, 1500),
            width: integer(random, 640, 3840),
            height: integer(random, 480, 2160),
        };
        const inset = integer(random, 0, Math.min(100, monitor.height / 3));
        const edgeDistance = integer(random, 0, 48);
        const edge = EDGES[integer(random, 0, 3)];
        const width = integer(random, 16, Math.max(16, monitor.width - edgeDistance * 2));
        const height = integer(random, 16, Math.max(16, monitor.height - inset - edgeDistance));
        const size = { width, height };
        const point = resolveDockSurfacePosition(
            monitor, size, edge, edgeDistance, monitor.y + inset,
        );
        const label = scenario(seed, i);
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), label);
        assert.ok(point.x >= monitor.x + edgeDistance - 1, label);
        assert.ok(point.y >= monitor.y + inset - 1, label);
        assert.ok(point.x + width <= monitor.x + monitor.width - edgeDistance + 1, label);
        assert.ok(point.y + height <= monitor.y + monitor.height - edgeDistance + 1, label);
    }
});

test('Exploratory E2E: randomized edge sensors never have negative or empty geometry', () => {
    const seed = 0x51d0d;
    const random = createRandom(seed);
    for (let i = 0; i < 1500; i++) {
        const monitor = {
            x: integer(random, -3000, 3000),
            y: integer(random, -1000, 1000),
            width: integer(random, 320, 3840),
            height: integer(random, 240, 2160),
        };
        const thickness = integer(random, 1, 20);
        const topInset = integer(random, 0, monitor.height);
        const edge = EDGES[integer(random, 0, 3)];
        const sensor = resolveDockEdgeSensor({ monitor, edge, thickness, topInset });
        const label = scenario(seed, i);
        assert.ok(sensor.width >= thickness && sensor.height >= thickness, label);
        assert.ok(sensor.x >= monitor.x && sensor.y >= monitor.y, label);
        assert.ok(sensor.x + sensor.width <= monitor.x + monitor.width, label);
        assert.ok(sensor.y + sensor.height <= monitor.y + monitor.height, label);
    }
});

test('Exploratory E2E: randomized popup anchors always produce finite clamped positions', () => {
    const seed = 0x51d0e;
    const random = createRandom(seed);
    for (let i = 0; i < 2000; i++) {
        const bounds = {
            x: integer(random, -2500, 2500),
            y: integer(random, -1200, 1200),
            width: integer(random, 500, 3000),
            height: integer(random, 400, 1800),
        };
        const anchor = {
            x: integer(random, bounds.x, bounds.x + bounds.width - 1),
            y: integer(random, bounds.y, bounds.y + bounds.height - 1),
            width: integer(random, 1, 96),
            height: integer(random, 1, 96),
        };
        const size = {
            width: integer(random, 20, bounds.width),
            height: integer(random, 20, bounds.height),
        };
        const edge = EDGES[integer(random, 0, 3)];
        const maxPadding = Math.max(0, Math.floor(Math.min(
            (bounds.width - size.width) / 2,
            (bounds.height - size.height) / 2,
        )));
        const padding = integer(random, 0, Math.min(12, maxPadding));
        const point = DockPositioner.placeFloating(
            anchor, size, edge, integer(random, 0, 32), bounds, padding,
        );
        const label = scenario(seed, i);
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), label);
        assert.ok(point.x >= bounds.x + padding, label);
        assert.ok(point.y >= bounds.y + padding, label);
        assert.ok(point.x + size.width <= bounds.x + bounds.width - padding + 1, label);
        assert.ok(point.y + size.height <= bounds.y + bounds.height - padding + 1, label);
    }
});

test('Exploratory E2E: randomized DnD insertion is bounded and monotonic', () => {
    const seed = 0x51d0f;
    const random = createRandom(seed);
    for (let i = 0; i < 2000; i++) {
        const count = integer(random, 0, 80);
        const midpoints = [];
        let coordinate = integer(random, -100, 100);
        for (let j = 0; j < count; j++) {
            coordinate += integer(random, 1, 80);
            midpoints.push(coordinate);
        }
        const samples = Array.from({ length: 40 }, () => integer(random, -300, coordinate + 300))
            .sort((a, b) => a - b);
        let previous = 0;
        for (const pointer of samples) {
            const index = resolveDockDndInsertionIndex(midpoints, pointer);
            const label = scenario(seed, i);
            assert.ok(Number.isInteger(index) && index >= 0 && index <= count, label);
            assert.ok(index >= previous, label + ' insertion must be monotonic');
            previous = index;
        }
    }
});

test('Exploratory E2E: randomized DnD hysteresis never returns an invalid slot', () => {
    const seed = 0x51d10;
    const random = createRandom(seed);
    for (let i = 0; i < 2500; i++) {
        const count = integer(random, 0, 60);
        const midpoints = [];
        let coordinate = integer(random, -100, 100);
        for (let j = 0; j < count; j++) {
            coordinate += integer(random, 2, 100);
            midpoints.push(coordinate);
        }
        const pointer = integer(random, -500, coordinate + 500);
        const current = integer(random, 0, count);
        const hysteresis = integer(random, 0, 30);
        const index = resolveDockDndInsertionIndexWithHysteresis(
            midpoints, pointer, current, hysteresis,
        );
        assert.ok(Number.isInteger(index), scenario(seed, i));
        assert.ok(index >= 0 && index <= count, scenario(seed, i));
    }
});

test('Exploratory E2E: randomized folder merges preserve uniqueness and all valid members', () => {
    const seed = 0x51d11;
    const random = createRandom(seed);
    for (let i = 0; i < 2500; i++) {
        const pool = Array.from({ length: integer(random, 1, 100) }, (_, n) => `app.${n}`);
        const target = Array.from({ length: integer(random, 0, 120) }, () =>
            random() < 0.08 ? '' : pool[integer(random, 0, pool.length - 1)]);
        const source = Array.from({ length: integer(random, 0, 120) }, () =>
            random() < 0.08 ? '' : pool[integer(random, 0, pool.length - 1)]);
        const merged = mergeDockFolderMembers(target, source);
        const expected = new Set([...target, ...source].filter(Boolean));
        assert.equal(merged.length, expected.size, scenario(seed, i));
        assert.deepEqual(new Set(merged), expected, scenario(seed, i));
        assert.deepEqual(mergeDockFolderMembers(merged, []), merged, scenario(seed, i));
        assert.deepEqual(mergeDockFolderMembers(merged, merged), merged, scenario(seed, i));
    }
});

test('Exploratory E2E: randomized folder creation removes exactly two entries and inserts one folder', () => {
    const seed = 0x51d12;
    const random = createRandom(seed);
    for (let i = 0; i < 2000; i++) {
        const count = integer(random, 2, 100);
        const order = Array.from({ length: count }, (_, n) => `app:${n}`);
        const sourceIndex = integer(random, 0, count - 1);
        let targetIndex = integer(random, 0, count - 2);
        if (targetIndex >= sourceIndex)
            targetIndex++;
        const sourceId = order[sourceIndex];
        const targetId = order[targetIndex];
        const folderId = `folder:${i}`;
        const next = resolveDockFolderDropOrder(order, sourceId, targetId, folderId);
        const label = scenario(seed, i);
        assert.equal(next.length, count - 1, label);
        assert.equal(next.filter(id => id === folderId).length, 1, label);
        assert.ok(!next.includes(sourceId) && !next.includes(targetId), label);
        assert.equal(new Set(next).size, next.length, label);
        assert.deepEqual(order, Array.from({ length: count }, (_, n) => `app:${n}`), label);
    }
});

test('Exploratory E2E: randomized folder removal conserves application membership and order', () => {
    const seed = 0x51d13;
    const random = createRandom(seed);
    for (let i = 0; i < 2000; i++) {
        const memberCount = integer(random, 2, 30);
        const appIds = Array.from({ length: memberCount }, (_, n) => `org.test.App${n}`);
        const folderId = `folder:${i}`;
        const before = ['external:before'];
        const after = ['external:after'];
        const order = [...before, folderId, ...after];
        const removed = appIds[integer(random, 0, appIds.length - 1)];
        const mode = random() < 0.5 ? 'grid' : 'stack';
        const state = resolveDockFolderRemoval(
            [{ id: folderId, name: 'Random folder', appIds, viewMode: mode }],
            order,
            folderId,
            removed,
        );
        const label = scenario(seed, i);
        assert.ok(state, label);
        const restoredIds = state.folders.length
            ? state.folders[0].appIds
            : state.order.filter(id => id.startsWith('app:')).map(id => id.slice(4));
        const allMembers = [...restoredIds, removed].sort();
        assert.deepEqual(allMembers, [...appIds].sort(), label);
        assert.equal(new Set(state.order).size, state.order.length, label);
        assert.ok(state.order.includes('app:' + removed), label);
        if (memberCount > 2) {
            assert.equal(state.folders.length, 1, label);
            assert.equal(state.folders[0].viewMode, mode, label);
            assert.ok(state.order.includes(folderId), label);
        } else {
            assert.equal(state.folders.length, 0, label);
            assert.ok(!state.order.includes(folderId), label);
        }
        assert.deepEqual(appIds, Array.from({ length: memberCount }, (_, n) => `org.test.App${n}`), label);
    }
});

test('Exploratory E2E: randomized keyboard focus always wraps into the current dock', () => {
    const seed = 0x51d14;
    const random = createRandom(seed);
    for (let i = 0; i < 5000; i++) {
        const count = integer(random, 1, 200);
        const index = integer(random, -count * 100, count * 100);
        const wrapped = resolveWrappedDockIndex(index, count);
        const label = scenario(seed, i);
        assert.ok(Number.isInteger(wrapped) && wrapped >= 0 && wrapped < count, label);
        assert.equal(wrapped, ((index % count) + count) % count, label);
    }
});

test('Exploratory E2E: randomized icon sizing remains within configured limits', () => {
    const seed = 0x51d15;
    const random = createRandom(seed);
    for (let i = 0; i < 4000; i++) {
        const count = integer(random, 0, 100);
        const ids = Array.from({ length: count }, (_, n) => `app.${n}`);
        const favorites = new Set(ids.filter(() => random() < 0.5));
        const configuredSize = integer(random, 16, 128);
        const size = calculateDockIconSize({
            applicationIds: ids,
            favoriteIds: favorites,
            availableSpace: integer(random, 0, 5000),
            configuredSize,
            spacing: integer(random, 0, 24),
            showFavoritesSeparator: random() < 0.5,
            separatorSize: integer(random, 0, 12),
            separatorMargin: integer(random, 0, 24),
            additionalItemCount: integer(random, 0, 20),
            windowCountBadgeCount: integer(random, 0, 30),
            iconPadding: integer(random, 0, 24),
            vertical: random() < 0.5,
        });
        const label = scenario(seed, i);
        assert.ok(Number.isFinite(size), label);
        assert.ok(size >= 16 && size <= configuredSize, label);
    }
});
