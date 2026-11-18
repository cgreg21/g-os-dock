import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDockDndOrder } from '../dist/features/dock-dnd-order.js';

const item = (id, actor) => ({ id, actor });

test('orders application and system items by their actual content actor positions', () => {
    const appA = {};
    const separator = {};
    const system = {};
    const appB = {};
    const items = [
        item('app:b', appB),
        item('system:launcher', system),
        item('app:a', appA),
    ];

    assert.deepEqual(
        resolveDockDndOrder(items, [appA, separator, system, appB]).map(entry => entry.id),
        ['app:a', 'system:launcher', 'app:b'],
    );
});

test('ignores structural actors that are not registered dock items', () => {
    const first = {};
    const preview = {};
    const last = {};

    assert.deepEqual(
        resolveDockDndOrder(
            [item('last', last), item('first', first)],
            [first, preview, last],
        ).map(entry => entry.id),
        ['first', 'last'],
    );
});

test('keeps unmounted items stable ahead of mounted items', () => {
    const mounted = {};
    const missingA = {};
    const missingB = {};

    assert.deepEqual(
        resolveDockDndOrder(
            [item('mounted', mounted), item('missing-a', missingA), item('missing-b', missingB)],
            [mounted],
        ).map(entry => entry.id),
        ['missing-a', 'missing-b', 'mounted'],
    );
});

test('does not mutate the caller item array', () => {
    const first = {};
    const second = {};
    const items = [item('second', second), item('first', first)];

    resolveDockDndOrder(items, [first, second]);

    assert.deepEqual(items.map(entry => entry.id), ['second', 'first']);
});
