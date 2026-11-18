import assert from 'node:assert/strict';
import test from 'node:test';
import {
    resolveDockDndInsertionIndexWithHysteresis,
    canDropDockItemAtIndex,
} from '../dist/features/interaction/dnd-geometry.js';
import {
    DockPositioner,
    resolveDockSurfacePosition,
    resolveDockEdgeSensor,
    resolveHiddenTranslation,
    resolveOppositeDockEdge,
} from '../dist/features/layout/dock-positioner.js';
import { calculateDockIconSize } from '../dist/features/layout/icon-sizing.js';
import {
    mergeDockFolderMembers,
    resolveDockFolderDropOrder,
    resolveDockFolderRemoval,
} from '../dist/features/applications/folder-state.js';

const monitor = { x: 0, y: 0, width: 1440, height: 900 };
const folder = (id, appIds) => ({ id, name: 'Folder', appIds });

test('E2E: dock remains on-screen and clear of the top panel on every edge', () => {
    for (const edge of ['top', 'right', 'bottom', 'left']) {
        const size = { width: edge === 'left' || edge === 'right' ? 76 : 520,
            height: edge === 'left' || edge === 'right' ? 520 : 76 };
        const position = resolveDockSurfacePosition(monitor, size, edge, 12, 40);
        assert.ok(position.x >= monitor.x + 12, edge + ' dock crosses left monitor edge');
        assert.ok(position.y >= monitor.y + 40, edge + ' dock overlaps top panel inset');
        assert.ok(position.x + size.width <= monitor.x + monitor.width - 12,
            edge + ' dock crosses right monitor edge');
        assert.ok(position.y + size.height <= monitor.y + monitor.height - 12,
            edge + ' dock crosses bottom monitor edge');

        const sensor = resolveDockEdgeSensor({ monitor, edge, thickness: 3, topInset: 40 });
        assert.ok(sensor.width > 0 && sensor.height > 0, edge + ' reveal sensor is unusable');
    }
});

test('E2E: dense docks keep icons usable while adapting to the available space', () => {
    for (const availableSpace of [420, 700, 1100, 1800]) {
        for (const itemCount of [1, 5, 12, 24]) {
            const applicationIds = Array.from({ length: itemCount }, (_, index) => 'app-' + index);
            const size = calculateDockIconSize({
                applicationIds,
                favoriteIds: new Set(applicationIds.slice(0, Math.ceil(itemCount / 2))),
                availableSpace,
                configuredSize: 64,
                spacing: 8,
                showFavoritesSeparator: true,
                separatorSize: 2,
                separatorMargin: 4,
                additionalItemCount: 0,
                windowCountBadgeCount: 0,
                iconPadding: 0,
                vertical: false,
            });
            assert.ok(size >= 16, `icon size ${size}px is below the supported minimum`);
            assert.ok(size <= 64, 'icon size exceeds configured maximum');
        }
    }
});

test('E2E: popups open away from the dock and remain inside the monitor', () => {
    const anchor = { x: 680, y: 410, width: 64, height: 64 };
    const popup = { width: 320, height: 360 };
    const expected = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    for (const edge of Object.keys(expected)) {
        assert.equal(resolveOppositeDockEdge(edge), expected[edge]);
        const point = DockPositioner.placeFloating(anchor, popup, edge, 8, monitor, 8);
        assert.ok(point.x >= 8 && point.y >= 8, edge + ' popup escapes upper/left bounds');
        assert.ok(point.x + popup.width <= monitor.width - 8, edge + ' popup escapes right bound');
        assert.ok(point.y + popup.height <= monitor.height - 8, edge + ' popup escapes bottom bound');
    }
});

test('E2E: hiding and revealing the dock moves it fully beyond the selected edge', () => {
    const size = { width: 240, height: 72 };
    assert.deepEqual(resolveHiddenTranslation('left', size), { x: -240, y: 0 });
    assert.deepEqual(resolveHiddenTranslation('right', size), { x: 240, y: 0 });
    assert.deepEqual(resolveHiddenTranslation('top', size), { x: 0, y: -72 });
    assert.deepEqual(resolveHiddenTranslation('bottom', size), { x: 0, y: 72 });
});

test('E2E: drag preview ignores pointer jitter but follows deliberate movement', () => {
    const midpoints = [40, 100, 160, 220];
    let index = 1;
    for (const pointer of [94, 99, 101, 97, 105, 108, 111]) {
        index = resolveDockDndInsertionIndexWithHysteresis(midpoints, pointer, index, 10);
    }
    assert.equal(index, 2, 'pointer should cross the next slot only after the hysteresis margin');
    index = resolveDockDndInsertionIndexWithHysteresis(midpoints, 20, index, 10);
    assert.equal(index, 0, 'large pointer movement should not feel blocked');
});

test('E2E: favorites cannot be accidentally reordered into the running-app section', () => {
    assert.equal(canDropDockItemAtIndex(true, 2, 3), true);
    assert.equal(canDropDockItemAtIndex(true, 4, 3), false);
    assert.equal(canDropDockItemAtIndex(false, 0, 3), true);
});

test('E2E: dropping one app onto another creates one folder at the earliest dock position', () => {
    const members = mergeDockFolderMembers(['org.example.Target.desktop'], ['org.example.Source.desktop']);
    assert.deepEqual(members, ['org.example.Target.desktop', 'org.example.Source.desktop']);
    assert.deepEqual(
        resolveDockFolderDropOrder(
            ['app:before', 'app:org.example.Source.desktop', 'app:after', 'app:org.example.Target.desktop'],
            'app:org.example.Source.desktop',
            'app:org.example.Target.desktop',
            'folder:generated',
        ),
        ['app:before', 'folder:generated', 'app:after'],
    );
});

test('E2E: dropping onto a folder adds a member without duplicates or losing existing apps', () => {
    assert.deepEqual(
        mergeDockFolderMembers(
            ['org.example.A.desktop', 'org.example.B.desktop'],
            ['org.example.C.desktop', 'org.example.A.desktop'],
        ),
        ['org.example.A.desktop', 'org.example.B.desktop', 'org.example.C.desktop'],
    );
});

test('E2E: removing an app preserves the folder and restores the app beside it', () => {
    const state = resolveDockFolderRemoval(
        [folder('folder:one', ['app.a', 'app.b', 'app.c'])],
        ['app:before', 'folder:one', 'app:after'],
        'folder:one',
        'app.b',
    );
    assert.deepEqual(state.folders, [folder('folder:one', ['app.a', 'app.c'])]);
    assert.deepEqual(state.order, ['app:before', 'folder:one', 'app:app.b', 'app:after']);
});

test('E2E: removing down to one app dissolves the folder and restores both apps', () => {
    const state = resolveDockFolderRemoval(
        [folder('folder:one', ['app.a', 'app.b'])],
        ['app:before', 'folder:one', 'app:after'],
        'folder:one',
        'app.b',
    );
    assert.deepEqual(state.folders, []);
    assert.deepEqual(state.order, ['app:before', 'app:app.a', 'app:app.b', 'app:after']);
});

test('E2E: invalid folder removal is a no-op rather than corrupting dock order', () => {
    assert.equal(resolveDockFolderRemoval(
        [folder('folder:one', ['app.a', 'app.b'])],
        ['folder:one'],
        'folder:one',
        'app.missing',
    ), null);
});
