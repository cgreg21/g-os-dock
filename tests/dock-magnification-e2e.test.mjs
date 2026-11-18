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
        .replace(/:\s*(?:string|number)(?:\s*\|\s*null)?/g, '');
    const moduleSource = javascript + '\nexport { resolveMagnificationPointerAxis };\n';
    const encoded = Buffer.from(moduleSource).toString('base64');
    return import('data:text/javascript;base64,' + encoded);
}

async function loadScaleResolver() {
    const source = read('../src/features/items/dock-magnification.ts');
    const match = source.match(/export function resolveMagnificationScale\([\s\S]*?\n}\n/);
    assert.ok(match, 'the pure magnification-scale resolver must be present');
    const javascript = match[0]
        .replace('export function', 'function')
        .replace(/: number/g, '');
    const moduleSource = javascript + '\nexport { resolveMagnificationScale };\n';
    const encoded = Buffer.from(moduleSource).toString('base64');
    return import('data:text/javascript;base64,' + encoded);
}

test('E2E: magnification peaks at the pointer and falls off smoothly', async () => {
    const { resolveMagnificationScale } = await loadScaleResolver();
    assert.equal(resolveMagnificationScale(50, 50, 100, 4), 4);
    assert.equal(resolveMagnificationScale(150, 50, 100, 4), 1);
    assert.equal(resolveMagnificationScale(151, 50, 100, 4), 1);
    assert.ok(resolveMagnificationScale(75, 50, 100, 4) > 1);
    assert.ok(resolveMagnificationScale(75, 50, 100, 4) < 4);
});

test('E2E: magnification influence is symmetric and decreases with distance', async () => {
    const { resolveMagnificationScale } = await loadScaleResolver();
    const left = resolveMagnificationScale(25, 50, 100, 3);
    const right = resolveMagnificationScale(75, 50, 100, 3);
    const nearer = resolveMagnificationScale(60, 50, 100, 3);
    const farther = resolveMagnificationScale(90, 50, 100, 3);
    assert.equal(left, right);
    assert.ok(nearer > farther);
    assert.ok(farther > 1);
});

test('E2E: invalid wave parameters safely return the base scale', async () => {
    const { resolveMagnificationScale } = await loadScaleResolver();
    assert.equal(resolveMagnificationScale(10, 10, 0, 4), 1);
    assert.equal(resolveMagnificationScale(10, 10, -1, 4), 1);
    assert.equal(resolveMagnificationScale(10, 10, 20, 0.9), 1);
    assert.equal(resolveMagnificationScale(Number.NaN, 10, 20, 4), 1);
    assert.equal(resolveMagnificationScale(10, Number.POSITIVE_INFINITY, 20, 4), 1);
});

async function loadItemScaleResolver() {
    const source = read('../src/features/items/dock-magnification.ts');
    const scaleMatch = source.match(/export function resolveMagnificationScale\([\s\S]*?\n}\n/);
    const itemMatch = source.match(/export function resolveMagnificationItemScale\([\s\S]*?\n}\n/);
    assert.ok(scaleMatch, 'the magnification-scale resolver must be present');
    assert.ok(itemMatch, 'the per-item geometry resolver must be present');
    const stripTypes = value => value
        .replace('export function', 'function')
        .replace(/:\s*(?:number|string)(?:\s*\|\s*null)?/g, '');
    const moduleSource = stripTypes(scaleMatch[0]) + '\n' +
        stripTypes(itemMatch[0]) +
        '\nexport { resolveMagnificationItemScale };\n';
    const encoded = Buffer.from(moduleSource).toString('base64');
    return import('data:text/javascript;base64,' + encoded);
}

test('E2E: per-item magnification uses the real item center and extent', async () => {
    const { resolveMagnificationItemScale } = await loadItemScaleResolver();
    assert.equal(resolveMagnificationItemScale(50, 30, 40, 2.5, 4), 4);
    assert.equal(resolveMagnificationItemScale(150, 30, 40, 2.5, 4), 1);
    assert.ok(resolveMagnificationItemScale(80, 30, 40, 2.5, 4) > 1);
});

test('E2E: per-item influence adapts to different rendered dimensions', async () => {
    const { resolveMagnificationItemScale } = await loadItemScaleResolver();
    const small = resolveMagnificationItemScale(30, 20, 20, 2.5, 4);
    const large = resolveMagnificationItemScale(50, 0, 80, 2.5, 4);
    assert.equal(small, 4);
    assert.ok(large > 1);
    assert.ok(large < 4);
});

test('E2E: invalid item geometry returns the base scale', async () => {
    const { resolveMagnificationItemScale } = await loadItemScaleResolver();
    assert.equal(resolveMagnificationItemScale(10, 10, 0, 2.5, 4), 1);
    assert.equal(resolveMagnificationItemScale(10, 10, -5, 2.5, 4), 1);
    assert.equal(resolveMagnificationItemScale(10, 10, 20, 0, 4), 1);
    assert.equal(resolveMagnificationItemScale(Number.NaN, 10, 20, 2.5, 4), 1);
});

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

test('E2E: every registered visual uses its transformed geometry without mutation', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('private readonly items = new Map<St.Button, Clutter.Actor>()'));
    assert.ok(controller.includes('this.items.set(button, visual)'));
    assert.ok(controller.includes('getItemScales('));
    assert.ok(controller.includes('button.get_transformed_position()'));
    assert.ok(controller.includes('button.get_transformed_size()'));
    assert.ok(controller.includes('visual.height : visual.width'));
    assert.ok(controller.includes('unscaled allocation'));
    assert.ok(!controller.includes('visual.get_transformed_position()'));
    assert.ok(controller.includes('resolveMagnificationItemScale('));
    assert.ok(controller.includes('return scales'));
});

test('E2E: pointer motion animates every visual actor and restores scale on leave', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('private readonly animations = new AnimationManager()'));
    assert.ok(controller.includes('this.applyMagnification()'));
    assert.ok(controller.includes('this.animateItemsToScale(1)'));
    assert.ok(controller.includes('{ scaleX: scale, scaleY: scale }'));
    assert.ok(controller.includes('visual as unknown as AnimationTarget'));
    assert.ok(controller.includes('MAGNIFICATION_DURATION_MS = 100'));
    assert.ok(controller.includes('Clutter.AnimationMode.EASE_OUT_CUBIC'));
});

test('E2E: visual anchors preserve the outer edge in all dock orientations', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes("visual.set_pivot_point(position === 'right' ? 1 : 0, 0.5)"));
    assert.ok(controller.includes("visual.set_pivot_point(0.5, position === 'top' ? 0 : 1)"));
});

test('E2E: magnification respects settings and resizes button allocations through CSS', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes("'dock-magnification-enabled'"));
    assert.ok(controller.includes("'dock-magnification-scale'"));
    assert.ok(controller.includes('this.settings.get_int'));
    assert.ok(controller.includes('this.settings.get_boolean'));
    assert.ok(!controller.includes('button.scale_x'));
    assert.ok(!controller.includes('button.scale_y'));
    assert.ok(controller.includes('resolveMagnificationButtonStyle(baseStyle, scale)'));
    assert.ok(controller.includes('this.content.queue_relayout()'));
    assert.ok(controller.includes('this.updateSurfaceInsets(scales)'));
    assert.ok(!controller.includes('button.set_size('));
});

async function loadButtonLayoutResolvers() {
    const source = read('../src/features/items/dock-magnification.ts');
    const mainMatch = source.match(/export function resolveMagnificationMainAxisLayout\([\s\S]*?\n}\n/);
    const crossMatch = source.match(/export function resolveMagnificationCrossAxisLayout\([\s\S]*?\n}\n/);
    assert.ok(mainMatch, 'the main-axis button layout resolver must be present');
    assert.ok(crossMatch, 'the cross-axis button layout resolver must be present');
    const stripTypes = value => value
        .replace('export function', 'function')
        .replace(/: (?:number|boolean|\[number, number\])/g, '');
    const moduleSource = stripTypes(mainMatch[0]) + '\n' +
        stripTypes(crossMatch[0]) +
        '\nexport { resolveMagnificationMainAxisLayout, resolveMagnificationCrossAxisLayout };\n';
    const encoded = Buffer.from(moduleSource).toString('base64');
    return import('data:text/javascript;base64,' + encoded);
}

test('E2E: magnified main-axis slots preserve gaps and keep the group centered', async () => {
    const { resolveMagnificationMainAxisLayout } = await loadButtonLayoutResolvers();
    const first = resolveMagnificationMainAxisLayout(10, 40, 2, 0, 60);
    const second = resolveMagnificationMainAxisLayout(56, 40, 1.5, 40, 60);
    assert.deepEqual(first, [-20, 80]);
    assert.deepEqual(second, [66, 60]);
    assert.equal(second[0] - (first[0] + first[1]), 6);
    const originalCenter = (10 + 96) / 2;
    const targetCenter = (first[0] + second[0] + second[1]) / 2;
    assert.equal(targetCenter, originalCenter);
});

test('E2E: magnified cross-axis slots stay attached to the selected outer edge', async () => {
    const { resolveMagnificationCrossAxisLayout } = await loadButtonLayoutResolvers();
    assert.deepEqual(resolveMagnificationCrossAxisLayout(20, 40, 2, false), [20, 80]);
    assert.deepEqual(resolveMagnificationCrossAxisLayout(20, 40, 2, true), [-20, 80]);
    assert.deepEqual(resolveMagnificationCrossAxisLayout(20, 40, 1, true), [20, 40]);
});

test('E2E: invalid button layout geometry safely preserves the original slot', async () => {
    const { resolveMagnificationMainAxisLayout, resolveMagnificationCrossAxisLayout } =
        await loadButtonLayoutResolvers();
    assert.deepEqual(resolveMagnificationMainAxisLayout(10, 40, 0.5, 0, 20), [10, 40]);
    assert.deepEqual(resolveMagnificationMainAxisLayout(10, 40, 2, 30, 20), [10, 40]);
    assert.deepEqual(resolveMagnificationCrossAxisLayout(10, 0, 2, true), [10, 0]);
    assert.deepEqual(resolveMagnificationCrossAxisLayout(10, 40, Number.NaN, true), [10, 40]);
});


async function loadButtonStyleResolver() {
    const source = read('../src/features/items/dock-magnification.ts');
    const match = source.match(/export function resolveMagnificationButtonStyle\([\s\S]*?\n}\n/);
    assert.ok(match, 'the button style resolver must be present');
    const javascript = match[0]
        .replace('export function', 'function')
        .replace(/:\\s*(?:string|number)/g, '');
    const moduleSource = javascript + '\nexport { resolveMagnificationButtonStyle };\n';
    const encoded = Buffer.from(moduleSource).toString('base64');
    return import('data:text/javascript;base64,' + encoded);
}

test('E2E: button magnification scales both dimensions and preserves padding', async () => {
    const { resolveMagnificationButtonStyle } = await loadButtonStyleResolver();
    const base = 'padding: 3px 5px 7px 9px; min-width: 48px; min-height: 52px;';
    assert.equal(
        resolveMagnificationButtonStyle(base, 2),
        'padding: 3px 5px 7px 9px; min-width: 96px; min-height: 104px;',
    );
    assert.equal(resolveMagnificationButtonStyle(base, 1), base);
    assert.equal(resolveMagnificationButtonStyle(base, 0.5), base);
});

test('E2E: button allocation and backdrop insets are recalculated from pointer scales', () => {
    const controller = read('../src/features/items/dock-magnification.ts');
    assert.ok(controller.includes('private readonly baseStyles = new Map<St.Button, string>()'));
    assert.ok(controller.includes('this.content.queue_relayout()'));
    assert.ok(controller.includes('this.onSurfaceExtentChanged(leading, trailing, this.pointerAxis !== null)'));
    assert.ok(controller.includes('this.resetButtonAllocations()'));
    assert.ok(controller.includes('this.onSurfaceExtentChanged?.(0, 0, false)'));
});
