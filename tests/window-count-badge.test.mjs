import assert from 'node:assert/strict';
import test from 'node:test';
import {
    countVisibleWindowBadges,
    shouldShowWindowCountBadge,
} from '../dist/features/window-count-badge.js';

test('shows a badge only when enabled and multiple windows exist', () => {
    assert.equal(shouldShowWindowCountBadge(0, true), false);
    assert.equal(shouldShowWindowCountBadge(1, true), false);
    assert.equal(shouldShowWindowCountBadge(2, true), true);
    assert.equal(shouldShowWindowCountBadge(3, false), false);
});

test('counts only applications with visible window badges', () => {
    assert.equal(countVisibleWindowBadges([0, 1, 2, 4, 1], true), 2);
});

test('returns zero badge count when badges are disabled', () => {
    assert.equal(countVisibleWindowBadges([2, 3, 5], false), 0);
});

test('does not mutate supplied window counts', () => {
    const counts = [1, 2, 3];
    countVisibleWindowBadges(counts, true);
    assert.deepEqual(counts, [1, 2, 3]);
});
