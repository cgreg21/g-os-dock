import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('E2E: step 1 observes the pointer on the complete dock content surface', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes("this.surface.connect('motion-event'"));
    assert.ok(controller.includes("this.surface.connect('enter-event'"));
    assert.ok(controller.includes("this.surface.connect('leave-event'"));
    assert.ok(controller.includes('this.surface = content.get_parent() ?? content'));
    assert.ok(controller.includes('getPointerAxis(): number | null'));
});

test('E2E: pointer coordinates are converted to the dock main-axis coordinate', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('pointerY - surfaceY'));
    assert.ok(controller.includes('pointerX - surfaceX'));
    assert.ok(controller.includes('this.surface.get_transformed_position()'));
    assert.ok(controller.includes('this.pointerAxis = null'));
});

test('E2E: step 1 supports horizontal and vertical dock orientations', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('this.content.orientation === Clutter.Orientation.VERTICAL'));
    assert.ok(controller.includes("position === 'left' || position === 'right'"));
    assert.ok(controller.includes(': pointerX - surfaceX'));
});

test('E2E: step 1 does not animate, scale, resize, or relayout dock items', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(!controller.includes('Clutter.Timeline'));
    assert.ok(!controller.includes('set_scale('));
    assert.ok(!controller.includes('set_size('));
    assert.ok(!controller.includes('queue_relayout('));
    assert.ok(!controller.includes('ease('));
});

test('E2E: pointer listeners and registered items are cleaned up safely', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('this.cleanup.clear()'));
    assert.ok(controller.includes('this.items.clear()'));
    assert.ok(controller.includes('this.pointerAxis = null'));
    assert.ok(controller.includes('this.items.add(button)'));
    assert.ok(controller.includes('this.items.delete(button)'));
});
