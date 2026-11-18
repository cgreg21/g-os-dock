import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAvailableDockSpace, calculateDockIconSize, calculateUniformItemSize, resolveDockSizingMetrics } from '../dist/features/icon-sizing.js';

const defaults = {
    applicationIds: ['favorite', 'running'],
    favoriteIds: new Set(['favorite']),
    availableSpace: 500,
    configuredSize: 64,
    spacing: 8,
    showFavoritesSeparator: true,
    separatorSize: 2,
    additionalItemCount: 2,
    iconPadding: 0,
    vertical: false,
};

test('caps icon size at configured size when there is ample room', () => {
    assert.equal(calculateDockIconSize(defaults), 64);
});

test('shrinks icons to fit item count and separator space', () => {
    const result = calculateDockIconSize({ ...defaults, availableSpace: 150 });
    assert.equal(result, 25);
});

test('does not reserve separator space without both favorite and running apps', () => {
    const result = calculateDockIconSize({
        ...defaults,
        applicationIds: ['favorite'],
        availableSpace: 80,
    });
    assert.equal(result, 17);
});

test('uses vertical overhead and respects minimum icon size', () => {
    const result = calculateDockIconSize({
        ...defaults,
        availableSpace: 20,
        vertical: true,
    });
    assert.equal(result, 16);
});

test('uses configured size for an empty dock', () => {
    assert.equal(calculateDockIconSize({
        ...defaults,
        applicationIds: [],
        additionalItemCount: 0,
    }), 64);
});

test('does not mutate supplied collections', () => {
    const appIds = ['favorite', 'running'];
    const favoriteIds = new Set(['favorite']);
    calculateDockIconSize({ ...defaults, applicationIds: appIds, favoriteIds });
    assert.deepEqual(appIds, ['favorite', 'running']);
    assert.deepEqual([...favoriteIds], ['favorite']);
});

test('calculates vertical available space below the panel inset', () => {
    assert.equal(calculateAvailableDockSpace({
        monitorWidth: 1920,
        monitorY: 100,
        monitorHeight: 1080,
        usableTop: 150,
        edgeDistance: 12,
        padding: 20,
        border: 4,
        vertical: true,
    }), 994);
});

test('calculates horizontal available space from both edge insets', () => {
    assert.equal(calculateAvailableDockSpace({
        monitorWidth: 1920,
        monitorY: 0,
        monitorHeight: 1080,
        usableTop: 0,
        edgeDistance: 12,
        padding: 20,
        border: 4,
        vertical: false,
    }), 1872);
});

test('preserves negative available space for impossible layouts', () => {
    assert.equal(calculateAvailableDockSpace({
        monitorWidth: 100,
        monitorY: 0,
        monitorHeight: 100,
        usableTop: 90,
        edgeDistance: 20,
        padding: 20,
        border: 4,
        vertical: true,
    }), -34);
});

test('resolves application count and favorites separator cost generically', () => {
    assert.deepEqual(
        resolveDockSizingMetrics({
            applicationIds: ['favorite', 'running', 'other'],
            favoriteIds: new Set(['favorite']),
            additionalItemCount: 2,
            showFavoritesSeparator: true,
            separatorSize: 3,
            separatorMargin: 4,
            spacing: 7,
        }),
        { itemCount: 5, separatorSpace: 18 },
    );
});

test('does not reserve separator cost when one application group is absent', () => {
    assert.deepEqual(
        resolveDockSizingMetrics({
            applicationIds: ['favorite-a', 'favorite-b'],
            favoriteIds: new Set(['favorite-a', 'favorite-b']),
            additionalItemCount: -2,
            showFavoritesSeparator: true,
            separatorSize: 3,
            separatorMargin: 4,
            spacing: 7,
        }),
        { itemCount: 2, separatorSpace: 0 },
    );
});

test('does not reserve separator cost when the separator is disabled', () => {
    assert.deepEqual(
        resolveDockSizingMetrics({
            applicationIds: ['favorite', 'running'],
            favoriteIds: new Set(['favorite']),
            additionalItemCount: 1,
            showFavoritesSeparator: false,
            separatorSize: 3,
            separatorMargin: 4,
            spacing: 7,
        }),
        { itemCount: 3, separatorSpace: 0 },
    );
});

test('calculates uniform item size after subtracting spacing and overhead', () => {
    assert.equal(calculateUniformItemSize({
        availableSpace: 150,
        itemCount: 4,
        spacing: 8,
        additionalSpace: 10,
        overhead: 4,
        itemPadding: 2,
        configuredSize: 64,
        minimumSize: 16,
    }), 23);
});

test('uses configured size when there are no items', () => {
    assert.equal(calculateUniformItemSize({
        availableSpace: 0,
        itemCount: 0,
        spacing: 8,
        additionalSpace: 10,
        overhead: 4,
        itemPadding: 2,
        configuredSize: 48,
        minimumSize: 16,
    }), 48);
});

test('clamps uniform item size between minimum and configured size', () => {
    const options = {
        availableSpace: 1,
        itemCount: 5,
        spacing: 8,
        additionalSpace: 10,
        overhead: 4,
        itemPadding: 2,
        configuredSize: 64,
        minimumSize: 16,
    };
    assert.equal(calculateUniformItemSize(options), 16);
    assert.equal(calculateUniformItemSize({
        ...options,
        availableSpace: 1000,
    }), 64);
});
