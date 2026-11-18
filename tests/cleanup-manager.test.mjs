import assert from 'node:assert/strict';
import test from 'node:test';
import { CleanupManager } from '../dist/features/cleanup-manager.js';

test('runs cleanup callbacks once in reverse registration order', () => {
    const manager = new CleanupManager();
    const calls = [];
    manager.add(() => calls.push('first'));
    manager.add(() => calls.push('second'));
    manager.add(() => calls.push('third'));

    manager.clear();
    manager.clear();

    assert.deepEqual(calls, ['third', 'second', 'first']);
    assert.equal(manager.size, 0);
});

test('runs callbacks added after clearing immediately', () => {
    const manager = new CleanupManager();
    const calls = [];
    manager.add(() => calls.push('initial'));
    manager.clear();
    manager.add(() => calls.push('late'));

    assert.deepEqual(calls, ['initial', 'late']);
    assert.equal(manager.size, 0);
});

test('continues releasing resources when one cleanup callback fails', () => {
    const manager = new CleanupManager();
    const calls = [];
    manager.add(() => calls.push('first'));
    manager.add(() => { throw new Error('cleanup failure'); });
    manager.add(() => calls.push('last'));

    const originalLogError = globalThis.logError;
    globalThis.logError = () => {};
    try {
        manager.clear();
    } finally {
        globalThis.logError = originalLogError;
    }

    assert.deepEqual(calls, ['last', 'first']);
    assert.equal(manager.size, 0);
});
