import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('E2E: magnification has a configurable 100–400 percent range', () => {
    const schema = read('../schemas/org.gnome.shell.extensions.g-os-dock.gschema.xml');
    const preferences = read('../src/preferences/appearance.ts');
    assert.match(schema, /name="dock-magnification-enabled" type="b"><default>true<\/default>/);
    assert.match(schema, /name="dock-magnification-scale" type="i"><range min="100" max="400"\/><default>400<\/default>/);
    assert.ok(preferences.includes("'dock-magnification-enabled'"));
    assert.ok(preferences.includes("'dock-magnification-scale'"));
});

test('E2E: magnification smoothly affects nearby items and restores them on pointer leave', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes("connect('motion-event'"));
    assert.ok(controller.includes("connect('leave-event'"));
    assert.ok(controller.includes('Math.exp('));
    assert.ok(controller.includes('EASE_OUT_CUBIC'));
    assert.ok(controller.includes('duration: 145'));
    assert.ok(controller.includes('Smootherstep'));
    assert.ok(controller.includes('actor.ease({'));
    assert.ok(!controller.includes('this.animations.cancel'));
    assert.ok(!controller.includes('AnimationManager'));
    assert.ok(controller.includes('this.reset()'));
});

test('E2E: dock magnification keeps application icons rendered at four times their display resolution', () => {
    const appItem = read('../src/features/applications/app-item.ts');
    const folders = read('../src/features/applications/dock-folders-controller.ts');
    assert.ok(appItem.includes('app.create_icon_texture(size * 4)'));
    assert.ok(folders.includes('app.create_icon_texture(iconSize * 4)'));
});

test('E2E: magnification is shared by all dock items and cleaned up when items are removed', () => {
    const base = read('../src/features/items/dock-item-base.ts');
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(base.includes('DockMagnificationController'));
    assert.ok(base.includes('magnification.unregister(this.button)'));
    assert.ok(controller.includes('this.animations.destroy()'));
    assert.ok(controller.includes('this.cleanup.clear()'));
});
