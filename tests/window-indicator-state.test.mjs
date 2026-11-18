import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWindowIndicatorState } from '../dist/features/window-indicator-state.js';

const window = (minimized = false) => ({ minimized });

test('resolves an active application with visible windows', () => {
    const first = window();
    const second = window();

    assert.deepEqual(
        resolveWindowIndicatorState([first, second], second, false),
        { count: 2, running: true, active: true, minimized: false },
    );
});

test('recognizes an application running without managed windows', () => {
    assert.deepEqual(
        resolveWindowIndicatorState([], null, true),
        { count: 0, running: true, active: false, minimized: false },
    );
});

test('recognizes an application with all windows minimized', () => {
    assert.deepEqual(
        resolveWindowIndicatorState([window(true), window(true)], null, true),
        { count: 2, running: true, active: false, minimized: true },
    );
});

test('does not mark an application active when another window is focused', () => {
    assert.deepEqual(
        resolveWindowIndicatorState([window()], window(), false),
        { count: 1, running: true, active: false, minimized: false },
    );
});

test('does not mark an application without windows as minimized', () => {
    assert.deepEqual(
        resolveWindowIndicatorState([], null, false),
        { count: 0, running: false, active: false, minimized: false },
    );
});
