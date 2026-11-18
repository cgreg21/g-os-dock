import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveActiveIndicatorTransition } from '../dist/features/active-indicator-state.js';

test('requests an active class when an actor becomes active', () => {
    assert.deepEqual(resolveActiveIndicatorTransition(false, true), {
        changed: true,
        active: true,
    });
});

test('requests removal when an actor becomes inactive', () => {
    assert.deepEqual(resolveActiveIndicatorTransition(true, false), {
        changed: true,
        active: false,
    });
});

test('does not request a mutation when the state is unchanged', () => {
    assert.equal(resolveActiveIndicatorTransition(true, true).changed, false);
    assert.equal(resolveActiveIndicatorTransition(false, false).changed, false);
});

test('initializes an actor from its first observed state', () => {
    assert.deepEqual(resolveActiveIndicatorTransition(undefined, false), {
        changed: true,
        active: false,
    });
});
