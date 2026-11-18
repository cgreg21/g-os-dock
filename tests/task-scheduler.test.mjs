import assert from 'node:assert/strict';
import test from 'node:test';
import { TaskScheduler } from '../dist/features/task-scheduler.js';

class FakeBackend {
    nextId = 1;
    tasks = new Map();
    timeout(_delay, callback) { return this.add(callback); }
    idle(callback) { return this.add(callback); }
    add(callback) {
        const id = this.nextId++;
        this.tasks.set(id, callback);
        return id;
    }
    remove(id) { this.tasks.delete(id); }
    run(id) {
        const callback = this.tasks.get(id);
        if (callback?.() === false)
            this.tasks.delete(id);
    }
}

test('replaces an existing task with the same key', () => {
    const backend = new FakeBackend();
    const scheduler = new TaskScheduler(backend);
    const calls = [];
    scheduler.timeout('hide', 100, () => calls.push('old'));
    scheduler.timeout('hide', 200, () => calls.push('new'));
    assert.equal(backend.tasks.size, 1);
    backend.run(2);
    assert.deepEqual(calls, ['new']);
    assert.equal(scheduler.size, 0);
});

test('runs idle tasks once and removes them from ownership', () => {
    const backend = new FakeBackend();
    const scheduler = new TaskScheduler(backend);
    let calls = 0;
    scheduler.idle('layout', () => calls++);
    backend.run(1);
    backend.run(1);
    assert.equal(calls, 1);
    assert.equal(scheduler.size, 0);
});

test('cancel and destroy are idempotent', () => {
    const backend = new FakeBackend();
    const scheduler = new TaskScheduler(backend);
    scheduler.timeout('a', 1, () => {});
    scheduler.timeout('b', 1, () => {});
    scheduler.cancel('a');
    scheduler.cancel('a');
    scheduler.destroy();
    scheduler.destroy();
    assert.equal(backend.tasks.size, 0);
    assert.equal(scheduler.size, 0);
});

test('does not schedule or invoke tasks after destruction', () => {
    const backend = new FakeBackend();
    const scheduler = new TaskScheduler(backend);
    let calls = 0;
    scheduler.destroy();
    scheduler.timeout('late', 1, () => calls++);
    scheduler.idle('late-idle', () => calls++);
    assert.equal(backend.tasks.size, 0);
    assert.equal(calls, 0);
});

test('ignores stale callbacks after a keyed task is replaced', () => {
    const backend = new FakeBackend();
    const scheduler = new TaskScheduler(backend);
    let calls = 0;
    scheduler.timeout('refresh', 1, () => calls++);
    const oldTask = backend.tasks.get(1);
    scheduler.timeout('refresh', 1, () => calls += 10);
    oldTask();
    assert.equal(calls, 0);
    backend.run(2);
    assert.equal(calls, 10);
});

test('contains callback failures and releases task ownership', () => {
    const backend = new FakeBackend();
    const scheduler = new TaskScheduler(backend);
    const originalLogError = globalThis.logError;
    globalThis.logError = () => {};
    try {
        scheduler.timeout('broken', 1, () => { throw new Error('task failed'); });
        backend.run(1);
        assert.equal(scheduler.size, 0);
    } finally {
        globalThis.logError = originalLogError;
    }
});

test('continues cancelling tasks when the backend reports a removal failure', () => {
    const removed = [];
    const originalLogError = globalThis.logError;
    globalThis.logError = () => {};
    try {
        const backend = new FakeBackend();
        backend.remove = id => {
            removed.push(id);
            if (id === 1)
                throw new Error('already removed');
            backend.tasks.delete(id);
        };
        const scheduler = new TaskScheduler(backend);
        scheduler.timeout('first', 1, () => {});
        scheduler.timeout('second', 1, () => {});
        scheduler.destroy();
        assert.deepEqual(removed, [1, 2]);
        assert.equal(scheduler.size, 0);
    } finally {
        globalThis.logError = originalLogError;
    }
});
