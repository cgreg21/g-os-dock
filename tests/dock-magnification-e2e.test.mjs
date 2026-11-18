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
    assert.ok(controller.includes('item.visual.set_scale(item.scale, item.scale)'));
    assert.ok(controller.includes('item.button.get_allocation_box()'));
    assert.ok(controller.includes('The button remains the fixed layout slot'));
    assert.ok(!controller.includes('GAP_COMPRESSION'));
    assert.ok(!controller.includes('expanded[i + 1]'));
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

test('E2E: every interactive dock item type joins the shared magnification wave', () => {
    const base = read('../src/features/items/dock-item-base.ts');
    const applications = read('../src/features/applications/app-item.ts');
    const folders = read('../src/features/applications/dock-folders-controller.ts');
    const system = read('../src/features/items/system-item.ts');
    const trash = read('../src/features/items/trash-item.ts');
    const volumes = read('../src/features/items/volume-items.ts');

    assert.ok(base.includes('controller.register(this.button)'));
    assert.ok(applications.includes('new DockItemBase('));
    assert.ok(folders.includes('new DockItemBase(\n            this.content,'));
    assert.ok(system.includes('new DockItemBase(\n            this.content,'));
    assert.ok(trash.includes('new DockItemBase(\n            this.content,'));
    assert.ok(volumes.includes('new DockItemBase(\n            this.content,'));
});

test('E2E: folder items participate in shared magnification and keep lifecycle cleanup', () => {
    const folders = read('../src/features/applications/dock-folders-controller.ts');
    assert.ok(folders.includes('if (folder.actor.get_parent() !== this.content)'));
    assert.ok(folders.includes('folder.base.destroy()'));
    assert.ok(folders.includes('this.animateIn(folder.actor)'));
    assert.ok(folders.includes('this.animateOut(folder)'));
});

test('E2E: dock background expands with the live magnification wave on all orientations', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    const base = read('../src/features/items/dock-item-base.ts');
    const view = read('../src/dock/view.ts');
    const layout = read('../src/features/layout/layout.ts');

    assert.ok(controller.includes('onSurfaceExtentChanged?.('));
    assert.ok(controller.includes('firstExtent * (first.scale - 1) / 2'));
    assert.ok(controller.includes('lastExtent * (last.scale - 1) / 2'));
    assert.ok(controller.includes('this.onSurfaceExtentChanged?.(0, 0)'));
    assert.ok(base.includes('setMagnificationSurfaceHandler'));
    assert.ok(base.includes('magnificationSurfaceHandlers.get(this.content)'));
    assert.ok(view.includes('this.layout.setMagnificationInsets(leading, trailing)'));
    assert.ok(layout.includes('setMagnificationInsets(leading: number, trailing: number)'));
    assert.ok(layout.includes('this.backgroundBaseWidth + leading + trailing'));
    assert.ok(layout.includes('this.backgroundBaseHeight + leading + trailing'));
    assert.ok(layout.includes('this.backgroundBaseX - leading'));
    assert.ok(layout.includes('this.backgroundBaseY - leading'));
    assert.ok(layout.includes('this.background.remove_transition(property)'));
});


test('E2E: dock backdrop blur is configurable and updates with appearance settings', () => {
    const schema = read('../schemas/org.gnome.shell.extensions.g-os-dock.gschema.xml');
    const preferences = read('../src/preferences/appearance.ts');
    const appearance = read('../src/features/appearance/appearance.ts');
    const settings = read('../src/dock/controllers/settings-controller.ts');

    assert.match(schema, /name="background-blur" type="i"><range min="0" max="64"\/><default>20<\/default>/);
    assert.ok(preferences.includes("'background-blur'"));
    assert.ok(preferences.includes("'Background blur radius (px)'"));
    assert.ok(appearance.includes('Shell.BlurMode.BACKGROUND'));
    assert.ok(appearance.includes('set_radius(normalizedRadius)'));
    assert.ok(appearance.includes('normalizedRadius === 0'));
    assert.ok(settings.includes("'background-blur'"));
});


test('E2E: magnification compresses flexible gaps without clipping enlarged icons', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('item.visual.set_scale(item.scale, item.scale)'));
    assert.ok(controller.includes('item.button.get_allocation_box()'));
    assert.ok(controller.includes('this.setVisualPivot(visual)'));
    assert.ok(!controller.includes('GAP_COMPRESSION'));
    assert.ok(!controller.includes('entry.button.set_scale'));
    assert.ok(!controller.includes('entry.button.translation_x'));
    assert.ok(!controller.includes('entry.button.translation_y'));
});


test('E2E: only visual icons scale; button padding and dock gaps remain fixed', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    const base = read('../src/features/items/dock-item-base.ts');
    const app = read('../src/features/applications/app-item.ts');
    const system = read('../src/features/items/system-item.ts');
    const trash = read('../src/features/items/trash-item.ts');
    const volumes = read('../src/features/items/volume-items.ts');
    const folders = read('../src/features/applications/dock-folders-controller.ts');

    assert.ok(controller.includes('item.visual.set_scale(item.scale, item.scale)'));
    assert.ok(!controller.includes('item.button.set_scale'));
    assert.ok(!controller.includes('item.button.translation_x'));
    assert.ok(!controller.includes('item.button.translation_y'));
    assert.ok(base.includes('controller.register(this.button, visualActor'));
    assert.ok(app.includes('base.setIconPadding(this.dependencies.settings, size, icon)'));
    assert.ok(system.includes('this.item.setIconPadding(this.settings, this.iconSize, icon)'));
    assert.ok(trash.includes('this.item.setIconPadding(this.settings, this.iconSize, this.icon)'));
    assert.ok(volumes.includes('item.item.setIconPadding(this.settings, size, item.icon)'));
    assert.ok(folders.includes('folder.actor.get_child() ?? folder.actor'));
});
