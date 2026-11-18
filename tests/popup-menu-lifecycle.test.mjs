import assert from 'node:assert/strict';
import test from 'node:test';
import { PopupMenuLifecycle } from '../dist/features/popup-menu-lifecycle.js';

function createMenu() {
    const calls = [];
    let stateChanged;
    return {
        calls,
        connect: (signal, callback) => {
            assert.equal(signal, 'open-state-changed');
            stateChanged = callback;
            return 1;
        },
        close: () => {
            calls.push('close');
            stateChanged?.(null, false);
        },
        destroy: () => calls.push('destroy'),
        setOpen: open => stateChanged?.(null, open),
    };
}

function createManager() {
    const calls = [];
    return {
        calls,
        addMenu: menu => calls.push(['add', menu]),
        removeMenu: menu => calls.push(['remove', menu]),
    };
}

test('tracks menus and disposes them when they close', () => {
    const manager = createManager();
    const lifecycle = new PopupMenuLifecycle(manager);
    const menu = createMenu();

    assert.equal(lifecycle.track(menu), true);
    assert.equal(lifecycle.size, 1);
    assert.deepEqual(manager.calls, [['add', menu]]);
    menu.setOpen(false);
    assert.equal(lifecycle.size, 0);
    assert.deepEqual(manager.calls, [['add', menu], ['remove', menu]]);
    assert.deepEqual(menu.calls, ['close', 'destroy']);
});

test('disposes each menu only once when close emits synchronously', () => {
    const manager = createManager();
    const lifecycle = new PopupMenuLifecycle(manager);
    const menu = createMenu();

    lifecycle.track(menu);
    lifecycle.dispose(menu);
    lifecycle.dispose(menu);
    assert.equal(lifecycle.size, 0);
    assert.deepEqual(manager.calls, [['add', menu], ['remove', menu]]);
    assert.deepEqual(menu.calls, ['close', 'destroy']);
});

test('destroy disposes all tracked menus and is idempotent', () => {
    const manager = createManager();
    const lifecycle = new PopupMenuLifecycle(manager);
    const first = createMenu();
    const second = createMenu();

    lifecycle.track(first);
    lifecycle.track(second);
    lifecycle.destroy();
    lifecycle.destroy();
    assert.equal(lifecycle.size, 0);
    assert.deepEqual(first.calls, ['close', 'destroy']);
    assert.deepEqual(second.calls, ['close', 'destroy']);
    assert.equal(manager.calls.filter(([action]) => action === 'remove').length, 2);
});

test('immediately destroys menus tracked after lifecycle shutdown', () => {
    const manager = createManager();
    const lifecycle = new PopupMenuLifecycle(manager);
    const menu = createMenu();

    lifecycle.destroy();
    assert.equal(lifecycle.track(menu), false);
    assert.deepEqual(menu.calls, ['destroy']);
    assert.deepEqual(manager.calls, []);
});
