import assert from 'node:assert/strict';
import test from 'node:test';
import { ChromeActorManager } from '../dist/features/chrome-actor-manager.js';

test('registers each actor once and removes it once', () => {
    const calls = [];
    const manager = new ChromeActorManager(
        (actor, options) => calls.push(['add', actor, options]),
        actor => calls.push(['remove', actor]),
    );
    const actor = {};
    manager.add(actor, { affectsStruts: false });
    manager.add(actor, { affectsStruts: true });
    assert.equal(manager.size, 1);
    manager.remove(actor);
    manager.remove(actor);
    assert.deepEqual(calls, [
        ['add', actor, { affectsStruts: false }],
        ['remove', actor],
    ]);
});

test('destroy removes actors in reverse order and is idempotent', () => {
    const removed = [];
    const manager = new ChromeActorManager(() => {}, actor => removed.push(actor));
    const first = {};
    const second = {};
    manager.add(first);
    manager.add(second);
    manager.destroy();
    manager.destroy();
    assert.deepEqual(removed, [second, first]);
    assert.equal(manager.size, 0);
});

test('contains removal failures and continues cleanup', () => {
    const removed = [];
    const originalLogError = globalThis.logError;
    globalThis.logError = () => {};
    try {
        const manager = new ChromeActorManager(() => {}, actor => {
            removed.push(actor);
            if (actor.fail)
                throw new Error('remove failed');
        });
        manager.add({ fail: true });
        manager.add({ fail: false });
        manager.destroy();
    } finally {
        globalThis.logError = originalLogError;
    }
    assert.equal(removed.length, 2);
});

test('does not register actors after destruction', () => {
    let adds = 0;
    const manager = new ChromeActorManager(() => adds++, () => {});
    manager.destroy();
    manager.add({});
    assert.equal(adds, 0);
    assert.equal(manager.size, 0);
});


test('contains individual removal failures', () => {
    const removed = [];
    const originalLogError = globalThis.logError;
    globalThis.logError = () => {};
    try {
        const manager = new ChromeActorManager(() => {}, actor => {
            removed.push(actor);
            if (actor.fail)
                throw new Error('remove failed');
        });
        const failing = { fail: true };
        const succeeding = { fail: false };
        manager.add(failing);
        manager.add(succeeding);
        manager.remove(failing);
        manager.remove(succeeding);
        assert.deepEqual(removed, [failing, succeeding]);
        assert.equal(manager.size, 0);
    } finally {
        globalThis.logError = originalLogError;
    }
});
