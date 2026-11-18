import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApplicationOrder } from '../dist/features/application-order.js';

const app = id => ({ get_id: () => id });
const ids = applications => applications.map(item => item.get_id());

test('keeps favorites before running applications and preserves source order by default', () => {
    const favorites = [app('favorite-a'), app('favorite-b')];
    const running = [app('running-a'), app('favorite-a'), app('running-b')];

    assert.deepEqual(
        ids(resolveApplicationOrder(favorites, running, new Map())),
        ['favorite-a', 'favorite-b', 'running-a', 'running-b'],
    );
});

test('applies persisted ranks within favorite and running sections', () => {
    const favorites = [app('favorite-a'), app('favorite-b')];
    const running = [app('running-a'), app('running-b')];
    const ranks = new Map([
        ['app:favorite-b', 0],
        ['app:favorite-a', 1],
        ['app:running-b', 2],
        ['app:running-a', 3],
    ]);

    assert.deepEqual(
        ids(resolveApplicationOrder(favorites, running, ranks)),
        ['favorite-b', 'favorite-a', 'running-b', 'running-a'],
    );
});

test('ignores applications without IDs and removes duplicate IDs', () => {
    const favorites = [app(null), app('same'), app('same')];
    const running = [app('same'), app(null), app('other')];

    assert.deepEqual(
        ids(resolveApplicationOrder(favorites, running, new Map())),
        ['same', 'other'],
    );
});

test('keeps unranked applications stable after ranked applications', () => {
    const favorites = [app('a'), app('b'), app('c')];
    const ranks = new Map([['app:c', 1]]);

    assert.deepEqual(
        ids(resolveApplicationOrder(favorites, [], ranks)),
        ['c', 'a', 'b'],
    );
});
