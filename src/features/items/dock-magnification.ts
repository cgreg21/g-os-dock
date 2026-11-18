import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { AnimationManager, type AnimationTarget } from '../../core/animation-manager.js';
import { CleanupManager } from '../../core/cleanup-manager.js';

interface MagnifiedItem {
    actor: St.Button;
    key: string;
}

/** Shares one pointer tracker across all dock items and smoothly magnifies nearby icons. */
export class DockMagnificationController {
    private readonly items = new Map<St.Button, MagnifiedItem>();
    private readonly animations = new AnimationManager();
    private readonly cleanup = new CleanupManager();
    private nextKey = 0;
    private destroyed = false;
    private lastPointer: [number, number] | null = null;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly settings: Gio.Settings,
        private readonly dockPosition: () => string,
    ) {
        this.content.reactive = true;
        this.cleanup.addSignal(content, content.connect('motion-event', (_actor, event) => {
            const [x, y] = event.get_coords();
            this.update(x, y);
            return Clutter.EVENT_PROPAGATE;
        }));
        this.cleanup.addSignal(content, content.connect('leave-event', () => {
            this.reset();
            return Clutter.EVENT_PROPAGATE;
        }));
        this.cleanup.addSignal(settings, settings.connect('changed::dock-magnification-enabled', () => {
            if (!settings.get_boolean('dock-magnification-enabled'))
                this.reset();
            else if (this.lastPointer)
                this.update(...this.lastPointer);
        }));
        this.cleanup.addSignal(settings, settings.connect('changed::dock-magnification-scale', () => {
            if (this.lastPointer && settings.get_boolean('dock-magnification-enabled'))
                this.update(...this.lastPointer);
        }));
    }

    register(actor: St.Button): void {
        if (this.destroyed || this.items.has(actor))
            return;
        actor.set_pivot_point(0.5, 0.5);
        this.items.set(actor, { actor, key: `magnify-${++this.nextKey}` });
    }

    unregister(actor: St.Button): void {
        const item = this.items.get(actor);
        if (!item)
            return;
        this.animations.cancel(item.key);
        this.items.delete(actor);
        if (this.items.size === 0)
            this.destroy();
    }

    private update(pointerX: number, pointerY: number): void {
        if (this.destroyed)
            return;
        this.lastPointer = [pointerX, pointerY];
        if (!this.settings.get_boolean('dock-magnification-enabled'))
            return;

        const vertical = ['left', 'right'].includes(this.dockPosition());
        const pointer = vertical ? pointerY : pointerX;
        const maximum = Math.max(1, Math.min(4, this.settings.get_int('dock-magnification-scale') / 100));
        const snapshots = [...this.items.values()].map(item => {
            const [x, y] = item.actor.get_transformed_position();
            const [width, height] = item.actor.get_transformed_size();
            const center = vertical ? y + height / 2 - item.actor.translation_y
                : x + width / 2 - item.actor.translation_x;
            const size = vertical ? item.actor.get_height() : item.actor.get_width();
            return { ...item, center, size: Math.max(1, size) };
        });

        for (const item of snapshots) {
            const distance = Math.abs(pointer - item.center);
            const radius = item.size * 1.45;
            const influence = Math.exp(-(distance * distance) / (2 * radius * radius));
            const scale = 1 + (maximum - 1) * influence;
            const direction = Math.sign(item.center - pointer);
            const neighborPush = (maximum - 1) * item.size * 0.5 *
                Math.exp(-(distance * distance) / (2 * Math.pow(item.size * 2.5, 2)));
            const displacement = direction * ((scale - 1) * item.size * 0.5 + neighborPush);
            this.animations.animate(item.key, item.actor as unknown as AnimationTarget, {
                scaleX: scale,
                scaleY: scale,
                translationX: vertical ? 0 : displacement,
                translationY: vertical ? displacement : 0,
            }, {
                durationMs: 64,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    private reset(): void {
        for (const item of this.items.values()) {
            this.animations.animate(item.key, item.actor as unknown as AnimationTarget, {
                scaleX: 1,
                scaleY: 1,
                translationX: 0,
                translationY: 0,
            }, {
                durationMs: 110,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cleanup.clear();
        this.lastPointer = null;
        this.animations.destroy();
        for (const { actor } of this.items.values()) {
            actor.scale_x = 1;
            actor.scale_y = 1;
            actor.translation_x = 0;
            actor.translation_y = 0;
        }
        this.items.clear();
    }

    get size(): number {
        return this.items.size;
    }
}
