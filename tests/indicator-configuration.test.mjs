import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIndicatorMarkerConfiguration } from '../dist/features/indicator-configuration.js';

const input = (overrides = {}) => ({
    count: 3,
    multiple: true,
    shape: 'round',
    size: 4,
    color: '230, 230, 240',
    opacity: 0.8,
    borderSize: 1,
    borderColor: '0, 0, 0',
    borderOpacity: 0.5,
    ...overrides,
});

test('resolves multiple markers and round dimensions', () => {
    assert.deepEqual(resolveIndicatorMarkerConfiguration(input()), {
        count: 3,
        style: {
            length: 4,
            thickness: 4,
            radius: '999px',
            color: '230, 230, 240',
            opacity: 0.8,
            borderSize: 1,
            borderColor: '0, 0, 0',
            borderOpacity: 0.5,
        },
    });
});

test('uses a single marker when multiple mode is disabled', () => {
    assert.equal(resolveIndicatorMarkerConfiguration(input({ count: 5, multiple: false })).count, 1);
});

test('keeps one marker for zero-window applications in multiple mode', () => {
    assert.equal(resolveIndicatorMarkerConfiguration(input({ count: 0 })).count, 1);
});

test('doubles the marker length for line shape', () => {
    const result = resolveIndicatorMarkerConfiguration(input({ shape: 'line', size: 5 }));
    assert.equal(result.style.length, 10);
    assert.equal(result.style.thickness, 5);
    assert.equal(result.style.radius, '0px');
});

test('uses square corners for non-round non-line shapes', () => {
    assert.equal(
        resolveIndicatorMarkerConfiguration(input({ shape: 'square' })).style.radius,
        '0px',
    );
});
