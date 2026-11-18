import assert from 'node:assert/strict';
import test from 'node:test';
import { DockStyleManager } from '../dist/features/style-manager.js';

test('applies a style once and skips unchanged styles', () => {
    const manager = new DockStyleManager();
    const calls = [];
    const actor = { set_style: style => calls.push(style) };

    assert.equal(manager.apply(actor, 'padding: 4px;'), true);
    assert.equal(manager.apply(actor, 'padding: 4px;'), false);
    assert.equal(manager.apply(actor, 'padding: 8px;'), true);
    assert.deepEqual(calls, ['padding: 4px;', 'padding: 8px;']);
});

test('tracks styles independently for each actor', () => {
    const manager = new DockStyleManager();
    const firstCalls = [];
    const secondCalls = [];
    const first = { set_style: style => firstCalls.push(style) };
    const second = { set_style: style => secondCalls.push(style) };

    assert.equal(manager.apply(first, 'color: white;'), true);
    assert.equal(manager.apply(second, 'color: white;'), true);
    assert.equal(manager.apply(first, 'color: white;'), false);
    assert.deepEqual(firstCalls, ['color: white;']);
    assert.deepEqual(secondCalls, ['color: white;']);
});

test('forget allows a previously used actor to receive its style again', () => {
    const manager = new DockStyleManager();
    const calls = [];
    const actor = { set_style: style => calls.push(style) };

    manager.apply(actor, 'opacity: 1;');
    manager.forget(actor);
    assert.equal(manager.apply(actor, 'opacity: 1;'), true);
    assert.deepEqual(calls, ['opacity: 1;', 'opacity: 1;']);
});
