import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { CleanupManager } from '../../core/cleanup-manager.js';

interface MagnifiedItem {
    actor: St.Button;
}

/** Pointer-driven magnification wave shared by every item in one dock. */
export class DockMagnificationController {
    private readonly items = new Map<St.Button, MagnifiedItem>();
    private readonly cleanup = new CleanupManager();
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
            this.lastPointer = null;
            this.animateToRest();
            return Clutter.EVENT_PROPAGATE;
        }));
        this.cleanup.addSignal(settings, settings.connect('changed::dock-magnification-enabled', () => {
            if (!settings.get_boolean('dock-magnification-enabled'))
                this.animateToRest();
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
        this.setBaselinePivot(actor);
        this.items.set(actor, { actor });
    }

    private setBaselinePivot(actor: St.Button): void {
        // Scale away from the dock's outer edge: all icons keep the same
        // baseline even when the focused icon grows to 400%.
        switch (this.dockPosition()) {
        case 'top':
            actor.set_pivot_point(0.5, 0);
            break;
        case 'left':
            actor.set_pivot_point(0, 0.5);
            break;
        case 'right':
            actor.set_pivot_point(1, 0.5);
            break;
        default: // bottom
            actor.set_pivot_point(0.5, 1);
            break;
        }
    }

    unregister(actor: St.Button): void {
        if (!this.items.has(actor))
            return;
        this.items.delete(actor);
        this.stopTransitions(actor);
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

        for (const { actor } of this.items.values()) {
            // The coordinate along the dock's length is unaffected by the
            // baseline-anchored scale pivot, so the wave does not chase itself.
            const [x, y] = actor.get_transformed_position();
            const width = actor.get_width();
            const height = actor.get_height();
            const center = vertical ? y + height / 2 : x + width / 2;
            const size = Math.max(1, vertical ? height : width);
            const distance = Math.abs(pointer - center);

            // A bell-shaped wave: strongest under the pointer, smoothly fading
            // across neighboring icons without a hard edge or flat plateau.
            const radius = size * 1.65;
            const influence = Math.exp(-0.5 * Math.pow(distance / radius, 2));
            const scale = 1 + (maximum - 1) * influence;

            // Retarget the active Clutter transition directly. No per-motion
            // cancellation and no translations: the row/column baseline stays fixed.
            actor.ease({
                scaleX: scale,
                scaleY: scale,
                translationX: 0,
                translationY: 0,
                duration: 115,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    private animateToRest(): void {
        for (const { actor } of this.items.values()) {
            actor.ease({
                scaleX: 1,
                scaleY: 1,
                translationX: 0,
                translationY: 0,
                duration: 190,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    private stopTransitions(actor: St.Button): void {
        for (const property of ['scale-x', 'scale-y', 'translation-x', 'translation-y'])
            actor.remove_transition(property);
        actor.scale_x = 1;
        actor.scale_y = 1;
        actor.translation_x = 0;
        actor.translation_y = 0;
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cleanup.clear();
        this.lastPointer = null;
        for (const { actor } of this.items.values())
            this.stopTransitions(actor);
        this.items.clear();
    }

    get size(): number {
        return this.items.size;
    }
}
