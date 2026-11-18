import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIconPaddingExtent } from '../dist/features/icon-padding-metrics.js';

const padding = { top: 3, right: 5, bottom: 7, left: 11 };

test('resolves vertical icon padding from top and bottom', () => {
    assert.equal(resolveIconPaddingExtent(padding, true), 10);
});

test('resolves horizontal icon padding from left and right', () => {
    assert.equal(resolveIconPaddingExtent(padding, false), 16);
});

test('does not mutate the supplied padding values', () => {
    const original = { ...padding };
    resolveIconPaddingExtent(padding, true);
    assert.deepEqual(padding, original);
});
