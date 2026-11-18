import assert from 'node:assert/strict';
import test from 'node:test';
import {
    resolveDockDndInsertionIndex,
    resolveDockDndInsertionIndexWithHysteresis,
    resolveDockDndPreviewChildIndex,
    isDockDndFavoriteBoundaryInsertion,
    resolveDockRemovalZoneGeometry,
    canDropDockItemAtIndex,
} from '../dist/features/interaction/dnd-geometry.js';
import {
    DockPositioner,
    resolveDockSurfacePosition,
    resolveDockEdgeSensor,
    resolveHiddenTranslation,
    resolveOppositeDockEdge,
    isVerticalDockPosition,
} from '../dist/features/layout/dock-positioner.js';
import {
    calculateDockIconSize,
    calculateUniformItemSize,
    calculateAvailableDockSpace,
    resolveDockSizingMetrics,
    WINDOW_COUNT_BADGE_SPACE,
} from '../dist/features/layout/icon-sizing.js';
import {
    resolveDockKeyboardAction,
    resolveWrappedDockIndex,
} from '../dist/features/interaction/keyboard-navigation-state.js';
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

test('E2E: removing an app preserves its folder-specific grid or stack setting', () => {
    const state = resolveDockFolderRemoval(
        [{ ...folder('folder:stack', ['app.a', 'app.b', 'app.c']), viewMode: 'stack' }],
        ['folder:stack'],
        'folder:stack',
        'app.b',
    );
    assert.deepEqual(state.folders, [
        { ...folder('folder:stack', ['app.a', 'app.c']), viewMode: 'stack' },
    ]);
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

test('E2E: keyboard navigation follows the dock axis and opens previews inward', () => {
    const keys = { left: 1, right: 2, up: 3, down: 4, home: 5, end: 6, escape: 7 };
    assert.equal(resolveDockKeyboardAction(1, 'bottom', keys), 'previous');
    assert.equal(resolveDockKeyboardAction(2, 'bottom', keys), 'next');
    assert.equal(resolveDockKeyboardAction(3, 'bottom', keys), 'previews');
    assert.equal(resolveDockKeyboardAction(4, 'top', keys), 'previews');
    assert.equal(resolveDockKeyboardAction(2, 'left', keys), 'previews');
    assert.equal(resolveDockKeyboardAction(1, 'right', keys), 'previews');
    assert.equal(resolveDockKeyboardAction(5, 'right', keys), 'first');
    assert.equal(resolveDockKeyboardAction(6, 'right', keys), 'last');
    assert.equal(resolveDockKeyboardAction(7, 'right', keys), 'escape');
    assert.equal(resolveDockKeyboardAction(99, 'right', keys), null);
});

test('E2E: keyboard focus wraps instead of stopping at the first or last app', () => {
    assert.equal(resolveWrappedDockIndex(-1, 5), 4);
    assert.equal(resolveWrappedDockIndex(5, 5), 0);
    assert.equal(resolveWrappedDockIndex(2, 5), 2);
    assert.equal(resolveWrappedDockIndex(0, 0), null);
});


// Broad deterministic scenario matrix: these tests exercise the same pure
// decision logic used by the runtime controllers without pretending to drive
// a real GNOME Shell session or compositor.

test('E2E: dock orientation and opposite popup edge are consistent for every position', () => {
    assert.equal(isVerticalDockPosition('left'), true);
    assert.equal(isVerticalDockPosition('right'), true);
    assert.equal(isVerticalDockPosition('top'), false);
    assert.equal(isVerticalDockPosition('bottom'), false);
    assert.deepEqual(
        ['top', 'right', 'bottom', 'left'].map(resolveOppositeDockEdge),
        ['bottom', 'left', 'top', 'right'],
    );
});

test('E2E: dock positioning stays within offset multi-monitor geometries', () => {
    const monitors = [
        { x: -1920, y: 0, width: 1920, height: 1080 },
        { x: 1440, y: -240, width: 2560, height: 1440 },
        { x: 0, y: 0, width: 1280, height: 720 },
    ];
    for (const screen of monitors) {
        for (const edge of ['top', 'right', 'bottom', 'left']) {
            for (const edgeDistance of [0, 1, 12, 32]) {
                const size = { width: 220, height: 68 };
                const inset = Math.max(screen.y, screen.y + 36);
                const point = resolveDockSurfacePosition(screen, size, edge, edgeDistance, inset);
                assert.ok(point.x >= screen.x + edgeDistance - 1);
                assert.ok(point.y >= inset - 1);
                assert.ok(point.x + size.width <= screen.x + screen.width - edgeDistance + 1);
                assert.ok(point.y + size.height <= screen.y + screen.height - edgeDistance + 1);
            }
        }
    }
});

test('E2E: oversized docks clamp safely instead of escaping tiny monitors', () => {
    for (const screen of [
        { x: 0, y: 0, width: 320, height: 240 },
        { x: -800, y: 200, width: 160, height: 120 },
    ]) {
        for (const edge of ['top', 'right', 'bottom', 'left']) {
            const point = resolveDockSurfacePosition(
                screen, { width: 600, height: 500 }, edge, 12, screen.y + 30,
            );
            assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
            assert.ok(point.x >= screen.x + 11);
            assert.ok(point.y >= screen.y + 29);
        }
    }
});

test('E2E: edge sensors remain on the requested edge and respect top-panel insets', () => {
    const screen = { x: -1280, y: 120, width: 1280, height: 800 };
    for (const edge of ['top', 'right', 'bottom', 'left']) {
        const sensor = resolveDockEdgeSensor({
            monitor: screen, edge, thickness: 3, topInset: 44,
        });
        assert.ok(sensor.width >= 3 && sensor.height >= 3);
        if (edge === 'left') assert.equal(sensor.x, screen.x);
        if (edge === 'right') assert.equal(sensor.x + sensor.width, screen.x + screen.width);
        if (edge === 'bottom') assert.equal(sensor.y + sensor.height, screen.y + screen.height);
        if (edge === 'top') assert.equal(sensor.y, screen.y + 44);
    }
});

test('E2E: popup placement clamps at all four monitor corners', () => {
    const bounds = { x: -900, y: 80, width: 900, height: 700 };
    const anchors = [
        { x: -900, y: 80, width: 48, height: 48 },
        { x: -48, y: 80, width: 48, height: 48 },
        { x: -900, y: 732, width: 48, height: 48 },
        { x: -48, y: 732, width: 48, height: 48 },
    ];
    for (const anchor of anchors) {
        for (const edge of ['top', 'right', 'bottom', 'left']) {
            const size = { width: 360, height: 420 };
            const point = DockPositioner.placeFloating(anchor, size, edge, 10, bounds, 6);
            assert.ok(point.x >= bounds.x + 6);
            assert.ok(point.y >= bounds.y + 6);
            assert.ok(point.x + size.width <= bounds.x + bounds.width - 6);
            assert.ok(point.y + size.height <= bounds.y + bounds.height - 6);
        }
    }
});

test('E2E: floating popups handle dimensions larger than their available bounds', () => {
    const point = DockPositioner.placeFloating(
        { x: 20, y: 20, width: 32, height: 32 },
        { width: 800, height: 900 },
        'bottom',
        8,
        { x: 10, y: 10, width: 300, height: 200 },
        5,
    );
    assert.deepEqual(point, { x: 15, y: 15 });
});

test('E2E: hidden translations clear the dock from every edge for varied sizes', () => {
    for (const width of [24, 48, 96, 320, 1200]) {
        for (const height of [24, 48, 96, 180, 900]) {
            assert.deepEqual(resolveHiddenTranslation('left', { width, height }), { x: -width, y: 0 });
            assert.deepEqual(resolveHiddenTranslation('right', { width, height }), { x: width, y: 0 });
            assert.deepEqual(resolveHiddenTranslation('top', { width, height }), { x: 0, y: -height });
            assert.deepEqual(resolveHiddenTranslation('bottom', { width, height }), { x: 0, y: height });
        }
    }
});

test('E2E: adaptive icon sizing never exceeds configured size or drops below minimum', () => {
    for (let count = 0; count <= 80; count++) {
        for (const availableSpace of [0, 1, 64, 240, 720, 1440, 3840]) {
            const ids = Array.from({ length: count }, (_, i) => 'app-' + i);
            const size = calculateDockIconSize({
                applicationIds: ids,
                favoriteIds: new Set(ids.filter((_, i) => i % 2 === 0)),
                availableSpace,
                configuredSize: 96,
                spacing: 6,
                showFavoritesSeparator: true,
                separatorSize: 2,
                separatorMargin: 4,
                additionalItemCount: 3,
                windowCountBadgeCount: 4,
                iconPadding: 8,
                vertical: count % 2 === 0,
            });
            assert.ok(size >= 16, `count=${count}, space=${availableSpace}, size=${size}`);
            assert.ok(size <= 96);
        }
    }
});

test('E2E: uniform sizing handles empty docks and clamps pathological available space', () => {
    assert.equal(calculateUniformItemSize({
        availableSpace: 0, itemCount: 0, spacing: 8, additionalSpace: 0,
        overhead: 0, itemPadding: 0, configuredSize: 64, minimumSize: 16,
    }), 64);
    assert.equal(calculateUniformItemSize({
        availableSpace: -100, itemCount: 12, spacing: 8, additionalSpace: 0,
        overhead: 0, itemPadding: 0, configuredSize: 64, minimumSize: 16,
    }), 16);
    assert.equal(calculateUniformItemSize({
        availableSpace: 10000, itemCount: 1, spacing: 0, additionalSpace: 0,
        overhead: 0, itemPadding: 0, configuredSize: 64, minimumSize: 16,
    }), 64);
});

test('E2E: additional dock items and vertical window badges are included in sizing', () => {
    const base = {
        applicationIds: ['a', 'b', 'c'],
        favoriteIds: new Set(['a']),
        availableSpace: 200,
        configuredSize: 96,
        spacing: 4,
        showFavoritesSeparator: false,
        separatorSize: 2,
        separatorMargin: 4,
        additionalItemCount: 0,
        windowCountBadgeCount: 0,
        iconPadding: 0,
    };
    const horizontal = calculateDockIconSize({ ...base, vertical: false });
    const verticalNoBadges = calculateDockIconSize({ ...base, vertical: true });
    const verticalWithBadges = calculateDockIconSize({
        ...base, vertical: true, windowCountBadgeCount: 2,
    });
    const withExtraItems = calculateDockIconSize({
        ...base, vertical: false, additionalItemCount: 4,
    });
    assert.ok(verticalWithBadges < verticalNoBadges);
    assert.ok(withExtraItems < horizontal);
    assert.equal(WINDOW_COUNT_BADGE_SPACE, 25);
});

test('E2E: sizing metrics count extra items but do not allocate an empty separator', () => {
    const metrics = resolveDockSizingMetrics({
        applicationIds: ['a', 'b'],
        favoriteIds: new Set(),
        additionalItemCount: 3,
        showFavoritesSeparator: true,
        separatorSize: 2,
        separatorMargin: 4,
        spacing: 6,
    });
    assert.equal(metrics.itemCount, 5);
    assert.equal(metrics.separatorSpace, 0);
});

test('E2E: available dock space subtracts all configured outer insets', () => {
    const horizontal = calculateAvailableDockSpace({
        monitorWidth: 1920, monitorY: 0, monitorHeight: 1080, usableTop: 40,
        edgeDistance: 12, padding: 16, border: 2, vertical: false,
    });
    const vertical = calculateAvailableDockSpace({
        monitorWidth: 1920, monitorY: 0, monitorHeight: 1080, usableTop: 40,
        edgeDistance: 12, padding: 16, border: 2, vertical: true,
    });
    assert.equal(horizontal, 1878);
    assert.equal(vertical, 1010);
});

test('E2E: drag insertion returns null for incomplete or invalid geometry', () => {
    assert.equal(resolveDockDndInsertionIndex([10, null, 30], 20), null);
    assert.equal(resolveDockDndInsertionIndex([10, Number.NaN, 30], 20), null);
    assert.equal(resolveDockDndInsertionIndex([10, 20], Number.NaN), null);
    assert.equal(resolveDockDndInsertionIndex([], 20), 0);
});

test('E2E: drag insertion maps every midpoint boundary to the expected slot', () => {
    const midpoints = [20, 50, 90, 140];
    assert.equal(resolveDockDndInsertionIndex(midpoints, -100), 0);
    assert.equal(resolveDockDndInsertionIndex(midpoints, 20), 0);
    assert.equal(resolveDockDndInsertionIndex(midpoints, 21), 1);
    assert.equal(resolveDockDndInsertionIndex(midpoints, 50), 1);
    assert.equal(resolveDockDndInsertionIndex(midpoints, 51), 2);
    assert.equal(resolveDockDndInsertionIndex(midpoints, 200), 4);
});

test('E2E: drag hysteresis rejects invalid current slots and invalid margins safely', () => {
    const midpoints = [20, 50, 90];
    assert.equal(resolveDockDndInsertionIndexWithHysteresis(midpoints, 55, null, 8), 2);
    assert.equal(resolveDockDndInsertionIndexWithHysteresis(midpoints, 55, -1, 8), 2);
    assert.equal(resolveDockDndInsertionIndexWithHysteresis(midpoints, 55, 99, 8), 2);
    assert.equal(resolveDockDndInsertionIndexWithHysteresis(midpoints, 55, 1, -1), null);
    assert.equal(resolveDockDndInsertionIndexWithHysteresis(midpoints, 55, 1, Number.NaN), null);
});

test('E2E: drag preview respects the favorites separator and fallback positions', () => {
    assert.equal(resolveDockDndPreviewChildIndex(5, 3, 8, true), 3);
    assert.equal(resolveDockDndPreviewChildIndex(5, 3, 8, false), 5);
    assert.equal(resolveDockDndPreviewChildIndex(-1, 3, 8, false), 8);
    assert.equal(resolveDockDndPreviewChildIndex(2, -1, 8, true), 2);
});

test('E2E: favorite boundary insertion is only true for favorite-to-running boundary drops', () => {
    assert.equal(isDockDndFavoriteBoundaryInsertion(true, false, 3, 3), true);
    assert.equal(isDockDndFavoriteBoundaryInsertion(false, false, 3, 3), false);
    assert.equal(isDockDndFavoriteBoundaryInsertion(true, true, 3, 3), false);
    assert.equal(isDockDndFavoriteBoundaryInsertion(true, false, 2, 3), false);
    assert.equal(isDockDndFavoriteBoundaryInsertion(true, false, 4, 3), false);
});

test('E2E: removal target occupies two thirds of the monitor for every dock edge', () => {
    const screen = { x: -1600, y: 80, width: 1600, height: 900 };
    for (const edge of ['top', 'right', 'bottom', 'left']) {
        const zone = resolveDockRemovalZoneGeometry(screen, edge);
        if (edge === 'top' || edge === 'bottom')
            assert.equal(zone.height, Math.floor(screen.height * 2 / 3));
        else
            assert.equal(zone.width, Math.floor(screen.width * 2 / 3));
        assert.ok(zone.width > 0 && zone.height > 0);
        assert.ok(zone.x >= screen.x && zone.y >= screen.y);
        assert.ok(zone.x + zone.width <= screen.x + screen.width);
        assert.ok(zone.y + zone.height <= screen.y + screen.height);
    }
});

test('E2E: removal target accounts for top panel inset on bottom dock', () => {
    const screen = { x: 0, y: 0, width: 1920, height: 1080 };
    const zone = resolveDockRemovalZoneGeometry(screen, 'bottom', 48);
    assert.equal(zone.y, 48);
    assert.equal(zone.height, Math.floor(1080 * 2 / 3) - 48);
});

test('E2E: folder member merge is stable, unique, and ignores empty identifiers', () => {
    const target = ['app.a', '', 'app.b', 'app.a'];
    const source = ['app.c', 'app.b', '', 'app.d'];
    assert.deepEqual(
        mergeDockFolderMembers(target, source),
        ['app.a', 'app.b', 'app.c', 'app.d'],
    );
    assert.deepEqual(target, ['app.a', '', 'app.b', 'app.a']);
    assert.deepEqual(source, ['app.c', 'app.b', '', 'app.d']);
});

test('E2E: folder member merge is idempotent and commutative as a membership set', () => {
    const a = ['one', 'two', 'three'];
    const b = ['three', 'four'];
    assert.deepEqual(mergeDockFolderMembers(mergeDockFolderMembers(a, b), []), ['one', 'two', 'three', 'four']);
    assert.deepEqual(new Set(mergeDockFolderMembers(a, b)), new Set(mergeDockFolderMembers(b, a)));
});

test('E2E: folder creation handles source and target at either end or adjacent positions', () => {
    const cases = [
        { order: ['source', 'x', 'target'], expected: ['folder', 'x'] },
        { order: ['target', 'x', 'source'], expected: ['folder', 'x'] },
        { order: ['x', 'source', 'target'], expected: ['x', 'folder'] },
        { order: ['x', 'target', 'source'], expected: ['x', 'folder'] },
        { order: ['source', 'target'], expected: ['folder'] },
    ];
    for (const scenario of cases) {
        assert.deepEqual(
            resolveDockFolderDropOrder(scenario.order, 'source', 'target', 'folder'),
            scenario.expected,
        );
    }
});

test('E2E: folder creation does not mutate its incoming dock order', () => {
    const order = ['before', 'source', 'middle', 'target', 'after'];
    const snapshot = [...order];
    resolveDockFolderDropOrder(order, 'source', 'target', 'folder');
    assert.deepEqual(order, snapshot);
});

test('E2E: folder creation with missing source or target appends one folder entry', () => {
    assert.deepEqual(resolveDockFolderDropOrder(['a', 'b'], 'missing', 'b', 'f'), ['a', 'f']);
    assert.deepEqual(resolveDockFolderDropOrder(['a', 'b'], 'a', 'missing', 'f'), ['f', 'b']);
    assert.deepEqual(resolveDockFolderDropOrder(['a', 'b'], 'missing-a', 'missing-b', 'f'), ['a', 'b', 'f']);
});

test('E2E: folder removal preserves unrelated folders and their custom settings', () => {
    const folders = [
        { id: 'folder:one', name: 'One', appIds: ['a', 'b', 'c'], viewMode: 'stack', custom: 'keep' },
        { id: 'folder:two', name: 'Two', appIds: ['d', 'e'], viewMode: 'grid' },
    ];
    const state = resolveDockFolderRemoval(folders, ['folder:one', 'folder:two'], 'folder:one', 'b');
    assert.deepEqual(state.folders, [
        { ...folders[1], appIds: ['d', 'e'] },
        { ...folders[0], appIds: ['a', 'c'] },
    ]);
    assert.deepEqual(folders[0].appIds, ['a', 'b', 'c']);
});

test('E2E: folder removal preserves stack/grid mode when a folder dissolves', () => {
    for (const viewMode of ['grid', 'stack']) {
        const state = resolveDockFolderRemoval(
            [{ id: 'folder:x', name: 'X', appIds: ['a', 'b'], viewMode }],
            ['folder:x'],
            'folder:x',
            'b',
        );
        assert.deepEqual(state.folders, []);
        assert.deepEqual(state.order, ['app:a', 'app:b']);
    }
});

test('E2E: folder removal at the beginning and end keeps restored app order stable', () => {
    const first = resolveDockFolderRemoval(
        [folder('f', ['a', 'b', 'c'])], ['f', 'x'], 'f', 'b',
    );
    assert.deepEqual(first.order, ['f', 'app:b', 'x']);
    const last = resolveDockFolderRemoval(
        [folder('f', ['a', 'b', 'c'])], ['x', 'f'], 'f', 'b',
    );
    assert.deepEqual(last.order, ['x', 'f', 'app:b']);
});

test('E2E: removing an app from a missing folder or twice is a safe no-op', () => {
    const folders = [folder('f', ['a', 'b', 'c'])];
    assert.equal(resolveDockFolderRemoval(folders, ['f'], 'missing', 'a'), null);
    const once = resolveDockFolderRemoval(folders, ['f'], 'f', 'b');
    assert.equal(resolveDockFolderRemoval(once.folders, once.order, 'f', 'b'), null);
});

test('E2E: keyboard navigation maps every orientation and ignores perpendicular keys', () => {
    const keys = { left: 1, right: 2, up: 3, down: 4, home: 5, end: 6, escape: 7 };
    const cases = [
        ['top', 1, 'previous'], ['top', 2, 'next'], ['top', 4, 'previews'],
        ['bottom', 1, 'previous'], ['bottom', 2, 'next'], ['bottom', 3, 'previews'],
        ['left', 3, 'previous'], ['left', 4, 'next'], ['left', 2, 'previews'],
        ['right', 3, 'previous'], ['right', 4, 'next'], ['right', 1, 'previews'],
    ];
    for (const [edge, key, expected] of cases)
        assert.equal(resolveDockKeyboardAction(key, edge, keys), expected);
});

test('E2E: keyboard first/last/escape actions are orientation independent', () => {
    const keys = { left: 1, right: 2, up: 3, down: 4, home: 5, end: 6, escape: 7 };
    for (const edge of ['top', 'right', 'bottom', 'left']) {
        assert.equal(resolveDockKeyboardAction(keys.home, edge, keys), 'first');
        assert.equal(resolveDockKeyboardAction(keys.end, edge, keys), 'last');
        assert.equal(resolveDockKeyboardAction(keys.escape, edge, keys), 'escape');
    }
});

test('E2E: wrapped keyboard focus handles negative and oversized indices', () => {
    for (let count = 1; count <= 20; count++) {
        for (let index = -count * 3; index <= count * 3; index++) {
            const wrapped = resolveWrappedDockIndex(index, count);
            assert.ok(wrapped >= 0 && wrapped < count);
            assert.equal(wrapped, ((index % count) + count) % count);
        }
    }
});

test('E2E: keyboard focus rejects non-integer indices and invalid item counts', () => {
    for (const [index, count] of [[1.5, 4], [0, 0], [0, -1], [Number.NaN, 4], [1, Number.NaN]]) {
        assert.equal(resolveWrappedDockIndex(index, count), null);
    }
});

import { readFileSync } from 'node:fs';

test('E2E: folder application grids use the same translucent card treatment as window previews', () => {
    const stylesheet = readFileSync(new URL('../stylesheet.css', import.meta.url), 'utf8');
    const controller = readFileSync(
        new URL('../src/features/applications/dock-folders-controller.ts', import.meta.url),
        'utf8',
    );
    assert.match(controller, /createFolderAppCard\(entry\.app\)/);
    assert.match(controller, /g-os-dock-folder-app-card/);
    assert.match(controller, /g-os-dock-preview-open/);
    assert.match(stylesheet, /\.g-os-dock-folder-app-card\s*\{[^}]*background-color:\s*rgba\(255,\s*255,\s*255,\s*0\.07\)/s);
    assert.match(stylesheet, /\.g-os-dock-folder-app-card:hover[\s\S]*background-color:\s*rgba\(255,\s*255,\s*255,\s*0\.16\)/);
});
