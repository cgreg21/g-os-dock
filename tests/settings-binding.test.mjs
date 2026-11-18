import assert from 'node:assert/strict';
import test from 'node:test';
import { SettingsBinding } from '../dist/features/settings-binding.js';

class FakeSignalSource {
    nextId = 1;
    signals = new Map();
    root = {};
    connect(signal, callback) {
        const id = this.nextId++;
        this.signals.set(id, { signal, callback });
        return id;
    }
    disconnect(id) { this.signals.delete(id); }
    get_root() { return this.root; }
    emit(signal) {
        for (const item of [...this.signals.values()]) {
            if (item.signal === signal)
                item.callback();
        }
    }
}

test('watches settings and disconnects all signals when the row is detached', () => {
    const row = new FakeSignalSource();
    const settings = new FakeSignalSource();
    const binding = new SettingsBinding(row);
    let calls = 0;
    binding.watch(settings, 'theme', () => calls++);
    settings.emit('changed::theme');
    assert.equal(calls, 1);
    assert.equal(binding.size, 2);

    row.root = null;
    row.emit('notify::root');
    settings.emit('changed::theme');
    assert.equal(calls, 1);
    assert.equal(settings.signals.size, 0);
    assert.equal(binding.size, 0);
});

test('destroy is idempotent and prevents new bindings', () => {
    const row = new FakeSignalSource();
    const settings = new FakeSignalSource();
    const binding = new SettingsBinding(row);
    binding.destroy();
    binding.destroy();
    binding.watch(settings, 'theme', () => {});
    binding.connect(row, 'notify::selected', () => {});
    assert.equal(binding.size, 0);
    assert.equal(settings.signals.size, 0);
});

test('ignores empty setting keys', () => {
    const row = new FakeSignalSource();
    const settings = new FakeSignalSource();
    const binding = new SettingsBinding(row);
    binding.watch(settings, '', () => {});
    assert.equal(settings.signals.size, 0);
    binding.destroy();
});
