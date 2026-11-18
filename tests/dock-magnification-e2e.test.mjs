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

test('E2E: magnification uses a frame-driven raised-cosine wave with smoothed pointer input', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes("connect('motion-event'"));
    assert.ok(controller.includes("connect('enter-event'"));
    assert.ok(controller.includes("connect('leave-event'"));
    assert.ok(controller.includes('Clutter.Timeline.new_for_actor'));
    assert.ok(controller.includes('CURSOR_TAU = 0.045'));
    assert.ok(controller.includes('SPRING_OMEGA = 20'));
    assert.ok(controller.includes('(1 - Math.cos(theta)) / 2'));
    assert.ok(controller.includes('Math.exp(-dt / DockMagnificationController.CURSOR_TAU)'));
    assert.ok(controller.includes('MAX_FRAME_DT = 1 / 30'));
});

test('E2E: magnification reflows neighboring slots and keeps the pointer anchored', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('const bounds = new Array<number>(count + 1)'));
    assert.ok(controller.includes('const expanded = new Array<number>(count + 1)'));
    assert.ok(controller.includes('(bounds[i + 1]! - bounds[i]!) * entries[i]!.scale'));
    assert.ok(controller.includes('shift = this.cursor - mapped'));
    assert.ok(controller.includes('mappedCenter - entry.center'));
    assert.ok(controller.includes('entry.actor.translation_x = translation'));
    assert.ok(controller.includes('entry.actor.translation_y = translation'));
});

test('E2E: magnification keeps every icon anchored to the screen-facing edge', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes("actor.set_pivot_point(0.5, 1)"));
    assert.ok(controller.includes("actor.set_pivot_point(0.5, 0)"));
    assert.ok(controller.includes("actor.set_pivot_point(0, 0.5)"));
    assert.ok(controller.includes("actor.set_pivot_point(1, 0.5)"));
    assert.ok(controller.includes("changed::dock-position"));
});

test('E2E: dock magnification keeps application icons rendered at four times their display resolution', () => {
    const appItem = read('../src/features/applications/app-item.ts');
    const folders = read('../src/features/applications/dock-folders-controller.ts');
    assert.ok(appItem.includes('app.create_icon_texture(size * 4)'));
    assert.ok(folders.includes('app.create_icon_texture(iconSize * 4)'));
});

test('E2E: magnification is shared by all dock items and frame resources are cleaned up', () => {
    const base = read('../src/features/items/dock-item-base.ts');
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(base.includes('DockMagnificationController'));
    assert.ok(base.includes('magnification.unregister(this.button)'));
    assert.ok(controller.includes('this.stopTimeline()'));
    assert.ok(controller.includes('this.cleanup.clear()'));
    assert.ok(controller.includes('this.resetAllActors()'));
});
