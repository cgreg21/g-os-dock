import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('E2E: hover animation preferences expose all supported styles and tuning controls', () => {
    const preferences = read('../src/preferences/appearance.ts');
    const schema = read('../schemas/org.gnome.shell.extensions.g-os-dock.gschema.xml');
    for (const mode of ['none', 'scale', 'lift', 'bounce', 'glow']) {
        assert.ok(preferences.includes(`'${mode}'`), `missing ${mode} preference`);
        assert.ok(schema.includes(`<key name="hover-animation"`));
    }
    for (const key of ['hover-animation-intensity', 'hover-animation-duration']) {
        assert.ok(preferences.includes(key), `missing preference control for ${key}`);
        assert.ok(schema.includes(`<key name="${key}"`), `missing GSettings key ${key}`);
    }
});

test('E2E: shared dock items animate on pointer hover and keyboard focus', () => {
    const base = read('../src/features/items/dock-item-base.ts');
    assert.ok(base.includes(`connect('notify::hover'`));
    assert.ok(base.includes(`connect('key-focus-in'`));
    assert.ok(base.includes(`connect('key-focus-out'`));
    assert.ok(base.includes(`changed::${key}`));
    assert.ok(base.includes('this.dockPosition()'));
    assert.ok(base.includes('AnimationManager'));
});

test('E2E: hover animation settings are live-updated and cleanly disposed with each item', () => {
    const base = read('../src/features/items/dock-item-base.ts');
    assert.ok(base.includes("'hover-animation', 'hover-animation-intensity', 'hover-animation-duration'"));
    assert.ok(base.includes('this.cleanup.addSignal(settings, signal)'));
    assert.ok(base.includes("remove_style_class_name('g-os-dock-item-hover-glow')"));
    assert.ok(base.includes('this.animations.destroy()'));
});
