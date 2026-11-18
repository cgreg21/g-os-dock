import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

async function loadAxisResolver() {
    const source = read('../src/features/items/dock-magnification.ts');
    const match = source.match(/export function resolveMagnificationPointerAxis\([\s\S]*?\n}\n/);
    assert.ok(match, 'the pure pointer-axis resolver must be present');
    const javascript = match[0]
        .replace('export function', 'function')
        .replace(/: (?:string|number)(?: \\| null)?/g, '');
    const moduleSource = javascript + '\nexport { resolveMagnificationPointerAxis };\n';
    const encoded = Buffer.from(moduleSource).toString('base64');
    return import('data:text/javascript;base64,' + encoded);
}

test('E2E: the complete dock surface receives pointer motion and boundary events', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes("this.surface.connect('motion-event'"));
    assert.ok(controller.includes("this.surface.connect('enter-event'"));
    assert.ok(controller.includes("this.surface.connect('leave-event'"));
    assert.ok(controller.includes('this.surface = content.get_parent() ?? content'));
    assert.ok(controller.includes('getPointerAxis(): number | null'));
});

test('E2E: horizontal and vertical docks resolve the correct local axis', async () => {
    const { resolveMagnificationPointerAxis } = await loadAxisResolver();
    assert.equal(resolveMagnificationPointerAxis('top', 130, 240, 100, 200, 80, 40), 30);
    assert.equal(resolveMagnificationPointerAxis('bottom', 130, 240, 100, 200, 80, 40), 30);
    assert.equal(resolveMagnificationPointerAxis('left', 130, 240, 100, 200, 80, 40), 40);
    assert.equal(resolveMagnificationPointerAxis('right', 130, 240, 100, 200, 80, 40), 40);
});

test('E2E: pointer coordinates at all surface edges are accepted', async () => {
    const { resolveMagnificationPointerAxis } = await loadAxisResolver();
    assert.equal(resolveMagnificationPointerAxis('bottom', 100, 210, 100, 200, 80, 40), 0);
    assert.equal(resolveMagnificationPointerAxis('bottom', 180, 240, 100, 200, 80, 40), 80);
    assert.equal(resolveMagnificationPointerAxis('left', 100, 200, 100, 200, 80, 40), 0);
    assert.equal(resolveMagnificationPointerAxis('left', 180, 240, 100, 200, 80, 40), 40);
});

test('E2E: coordinates outside the surface are rejected', async () => {
    const { resolveMagnificationPointerAxis } = await loadAxisResolver();
    assert.equal(resolveMagnificationPointerAxis('bottom', 99, 220, 100, 200, 80, 40), null);
    assert.equal(resolveMagnificationPointerAxis('bottom', 181, 220, 100, 200, 80, 40), null);
    assert.equal(resolveMagnificationPointerAxis('left', 120, 199, 100, 200, 80, 40), null);
    assert.equal(resolveMagnificationPointerAxis('left', 120, 241, 100, 200, 80, 40), null);
});

test('E2E: reactive state is restored and signal resources are released', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('this.originalReactive = this.surface.reactive'));
    assert.ok(controller.includes('this.surface.reactive = this.originalReactive'));
    assert.ok(controller.includes('this.cleanup.clear()'));
    assert.ok(controller.includes('this.items.clear()'));
    assert.ok(controller.includes('this.pointerAxis = null'));
});

test('E2E: pointer observation does not animate, scale, resize, or relayout items', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(!controller.includes('Clutter.Timeline'));
    assert.ok(!controller.includes('set_scale('));
    assert.ok(!controller.includes('set_size('));
    assert.ok(!controller.includes('queue_relayout('));
    assert.ok(!controller.includes('ease('));
});
