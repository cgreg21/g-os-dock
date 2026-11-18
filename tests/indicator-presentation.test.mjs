import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIndicatorPresentation } from '../dist/features/indicator-presentation.js';

const options = {
    enabled: true,
    showOpen: true,
    showFocused: true,
    showMinimized: true,
    showCount: true,
};

const state = (overrides = {}) => ({
    count: 2,
    running: true,
    active: false,
    minimized: false,
    ...overrides,
});

test('shows an indicator for a running application when enabled', () => {
    assert.deepEqual(
        resolveIndicatorPresentation(state(), options),
        {
            visible: true,
            active: false,
            iconOpacity: 255,
            badgeText: '2',
            badgeVisible: true,
        },
    );
});

test('hides indicators when every visibility mode is disabled', () => {
    assert.equal(
        resolveIndicatorPresentation(state(), {
            ...options,
            showOpen: false,
            showFocused: false,
            showMinimized: false,
        }).visible,
        false,
    );
});

test('uses reduced icon opacity for fully minimized applications', () => {
    assert.equal(
        resolveIndicatorPresentation(state({ minimized: true, running: true }), options).iconOpacity,
        128,
    );
});

test('does not show a badge for zero or one window', () => {
    for (const count of [0, 1]) {
        const result = resolveIndicatorPresentation(state({ count }), options);
        assert.equal(result.badgeText, '');
        assert.equal(result.badgeVisible, false);
    }
});

test('hides the badge when window counts are disabled', () => {
    const result = resolveIndicatorPresentation(state(), { ...options, showCount: false });
    assert.equal(result.badgeText, '');
    assert.equal(result.badgeVisible, false);
});

test('preserves focused and minimized visibility independently', () => {
    assert.equal(
        resolveIndicatorPresentation(state({ active: true, running: false }), {
            ...options,
            showOpen: false,
        }).visible,
        true,
    );
    assert.equal(
        resolveIndicatorPresentation(state({ minimized: true, running: false }), {
            ...options,
            showOpen: false,
            showFocused: false,
        }).visible,
        true,
    );
});
