import assert from 'node:assert/strict';
import test from 'node:test';
import { AnimationManager } from '../dist/features/animation-manager.js';

class FakeActor {
    animations = [];
    removed = [];
    ease(params) { this.animations.push(params); }
    remove_transition(property) { this.removed.push(property); }
    complete(index = this.animations.length - 1) {
        this.animations[index]?.onComplete?.();
    }
}

const options = { durationMs: 240, mode: 1 };

test('animates multiple actors independently and releases completed animations', () => {
    const manager = new AnimationManager();
    const content = new FakeActor();
    const background = new FakeActor();
    manager.animate('content', content, { translationX: 0, opacity: 255 }, options);
    manager.animate('background', background, { translationX: 0 }, options);
    assert.equal(manager.size, 2);
    content.complete();
    assert.equal(manager.size, 1);
    background.complete();
    assert.equal(manager.size, 0);
});

test('replacing an animation cancels only its previous properties', () => {
    const manager = new AnimationManager();
    const actor = new FakeActor();
    let completed = 0;
    manager.animate('slide', actor, { translationX: 10, translationY: 0 }, {
        ...options,
        onComplete: () => completed++,
    });
    const staleCompletion = actor.animations[0].onComplete;
    manager.animate('slide', actor, { translationX: 0 }, options);
    assert.deepEqual(actor.removed, ['translationX', 'translationY']);
    staleCompletion();
    assert.equal(manager.size, 1);
    assert.equal(completed, 0);
    actor.complete();
    assert.equal(manager.size, 0);
});

test('cancel prevents completion callbacks and is idempotent', () => {
    const manager = new AnimationManager();
    const actor = new FakeActor();
    let completed = 0;
    manager.animate('fade', actor, { opacity: 0 }, {
        ...options,
        onComplete: () => completed++,
    });
    const finish = actor.animations[0].onComplete;
    manager.cancel('fade');
    manager.cancel('fade');
    finish();
    assert.equal(completed, 0);
    assert.equal(manager.size, 0);
});

test('destroy cancels all animations and rejects future work', () => {
    const manager = new AnimationManager();
    const first = new FakeActor();
    const second = new FakeActor();
    manager.animate('first', first, { opacity: 0 }, options);
    manager.animate('second', second, { translationY: 20 }, options);
    manager.destroy();
    manager.destroy();
    manager.animate('late', first, { opacity: 255 }, options);
    assert.deepEqual(first.removed, ['opacity']);
    assert.deepEqual(second.removed, ['translationY']);
    assert.equal(first.animations.length, 1);
    assert.equal(manager.size, 0);
});
