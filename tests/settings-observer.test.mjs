import assert from 'node:assert/strict';
import test from 'node:test';
import { SettingsObserver } from '../dist/features/settings-observer.js';

class FakeSettings {
    nextId = 1;
    signals = new Map();
    connect(signal, callback) {
        const id = this.nextId++;
        this.signals.set(id, { signal, callback });
        return id;
    }
    disconnect(id) {
        this.signals.delete(id);
    }
    emit(signal) {
        for (const entry of this.signals.values()) {
            if (entry.signal === signal)
                entry.callback();
        }
    }
}

test('watches individual setting keys without reacting to unrelated keys', () => {
    const observer = new SettingsObserver();
    const settings = new FakeSettings();
    let calls = 0;

    observer.watch(settings, 'show-window-previews', () => calls++);
    settings.emit('changed::dock-position');
    assert.equal(calls, 0);
    settings.emit('changed::show-window-previews');
    assert.equal(calls, 1);
    assert.equal(observer.size, 1);

    observer.destroy();
    assert.equal(settings.signals.size, 0);
});

test('supports general changed notifications and multiple settings sources', () => {
    const observer = new SettingsObserver();
    const first = new FakeSettings();
    const second = new FakeSettings();
    let calls = 0;

    observer.watchAll(first, () => calls++);
    observer.watch(second, 'theme', () => calls++);
    first.emit('changed');
    second.emit('changed::theme');
    assert.equal(calls, 2);
    assert.equal(observer.size, 2);

    observer.destroy();
    assert.equal(first.signals.size, 0);
    assert.equal(second.signals.size, 0);
});

test('destroy is idempotent and prevents later subscriptions', () => {
    const observer = new SettingsObserver();
    const settings = new FakeSettings();
    observer.destroy();
    observer.destroy();
    observer.watch(settings, 'theme', () => {});
    observer.watchAll(settings, () => {});

    assert.equal(observer.size, 0);
    assert.equal(settings.signals.size, 0);
});
