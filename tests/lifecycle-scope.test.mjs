import assert from 'node:assert/strict';
import test from 'node:test';
import { LifecycleScope } from '../dist/features/lifecycle-scope.js';

class FakeScheduler {
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
}

test('disposes scheduled work, signals and chrome actors exactly once', () => {
    const scheduler = new FakeScheduler();
    const events = [];
    const emitter = { disconnect: id => events.push(['disconnect', id]) };
    const scope = new LifecycleScope(
        scheduler,
        (actor, options) => events.push(['add', actor, options]),
        actor => events.push(['remove', actor]),
    );
    const actor = {};
    scope.addSignal(emitter, 42);
    scope.tasks.timeout('refresh', 100, () => events.push(['callback']));
    scope.chrome.add(actor, { affectsStruts: false });

    assert.equal(scope.cleanup.size, 1);
    assert.equal(scope.tasks.size, 1);
    assert.equal(scope.chrome.size, 1);

    scope.destroy();
    scope.destroy();

    assert.equal(scope.isDestroyed, true);
    assert.equal(scheduler.tasks.size, 0);
    assert.deepEqual(events.map(event => event[0]), ['add', 'disconnect', 'remove']);
    assert.equal(scope.cleanup.size, 0);
    assert.equal(scope.tasks.size, 0);
    assert.equal(scope.chrome.size, 0);
});

test('rejects new resources after destruction without leaking them', () => {
    const scheduler = new FakeScheduler();
    let added = 0;
    let disconnected = 0;
    const scope = new LifecycleScope(
        scheduler,
        () => added++,
        () => {},
    );
    scope.destroy();
    scope.tasks.idle('late', () => {});
    scope.chrome.add({}, {});
    scope.addSignal({ disconnect: () => disconnected++ }, 1);

    assert.equal(scheduler.tasks.size, 0);
    assert.equal(added, 0);
    assert.equal(disconnected, 1);
});
