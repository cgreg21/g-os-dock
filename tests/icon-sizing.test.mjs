import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDockIconSize } from '../dist/features/icon-sizing.js';

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
    assert.equal(result, 55);
});

test('does not reserve separator space without both favorite and running apps', () => {
    const result = calculateDockIconSize({
        ...defaults,
        applicationIds: ['favorite'],
        availableSpace: 80,
    });
    assert.equal(result, 64);
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
