import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { CleanupManager } from '../../core/cleanup-manager.js';

interface MagnifiedItem {
    actor: St.Button;
}

/**
 * One pointer tracker for the whole dock.
 *
 * Do not route pointer motion through AnimationManager: it cancels the active
 * Clutter transitions before every retarget, which makes fast pointer movement
 * visibly stutter. Actor.ease() retargets from the current interpolated value.
 */
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
        actor.set_pivot_point(0.5, 0.5);
        this.items.set(actor, { actor });
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
        const snapshots = [...this.items.values()].map(({ actor }) => {
            const [x, y] = actor.get_transformed_position();
            const [width, height] = actor.get_transformed_size();
            // Remove the previous magnification translation from the measured
            // center so the pointer is compared against the stable layout slot.
            const center = vertical
                ? y + height / 2 - actor.translation_y
                : x + width / 2 - actor.translation_x;
            const size = Math.max(1, vertical ? actor.get_height() : actor.get_width());
            return { actor, center, size };
        });

        for (const item of snapshots) {
            const distance = Math.abs(pointer - item.center);
            const radius = item.size * 1.8;
            const t = Math.max(0, 1 - distance / radius);
            // Smootherstep has zero slope at both ends: no sudden scale jumps
            // when an icon enters or leaves the magnification field.
            const influence = t * t * t * (t * (t * 6 - 15) + 10);
            const scale = 1 + (maximum - 1) * influence;
            const direction = Math.sign(item.center - pointer);
            const displacement = direction * (scale - 1) * item.size * 0.42;

            // Retarget in place. Unlike cancel()+ease(), this preserves the
            // current velocity/position instead of restarting from a snapped
            // transition on every pointer event.
            item.actor.ease({
                scaleX: scale,
                scaleY: scale,
                translationX: vertical ? 0 : displacement,
                translationY: vertical ? displacement : 0,
                duration: 145,
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
                duration: 180,
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
