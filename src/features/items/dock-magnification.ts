import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { CleanupManager } from '../../core/cleanup-manager.js';

interface MagnifiedItem {
    button: St.Button;
    visual: Clutter.Actor;
    start: number;
    end: number;
    center: number;
    scale: number;
}

/**
 * Frame-driven icon-only dock magnifier.
 *
 * The button remains the fixed layout slot: its padding, margins and spacing
 * never scale or reflow. Only the visual icon actor is magnified.
 */
export class DockMagnificationController {
    private readonly items = new Map<St.Button, MagnifiedItem>();
    private readonly cleanup = new CleanupManager();
    private destroyed = false;
    private timeline: Clutter.Timeline | null = null;
    private cursor: number | null = null;
    private rawPointer: number | null = null;
    private envelope = 0;
    private envelopeVelocity = 0;
    private targetEnvelope = 0;

    private static readonly CURSOR_TAU = 0.045;
    private static readonly SPRING_OMEGA = 20;
    private static readonly MAX_FRAME_DT = 1 / 30;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly settings: Gio.Settings,
        private readonly dockPosition: () => string,
        private readonly onSurfaceExtentChanged?: (leading: number, trailing: number) => void,
    ) {
        this.content.reactive = true;
        this.cleanup.addSignal(content, content.connect('motion-event', (_actor, event) => {
            const [x, y] = event.get_coords();
            this.rawPointer = this.isVertical() ? y : x;
            this.targetEnvelope = this.settings.get_boolean('dock-magnification-enabled') ? 1 : 0;
            this.startTimeline();
            return Clutter.EVENT_PROPAGATE;
        }));
        this.cleanup.addSignal(content, content.connect('enter-event', (_actor, event) => {
            const [x, y] = event.get_coords();
            this.rawPointer = this.isVertical() ? y : x;
            if (this.settings.get_boolean('dock-magnification-enabled')) {
                this.targetEnvelope = 1;
                this.startTimeline();
            }
            return Clutter.EVENT_PROPAGATE;
        }));
        this.cleanup.addSignal(content, content.connect('leave-event', () => {
            this.targetEnvelope = 0;
            this.startTimeline();
            return Clutter.EVENT_PROPAGATE;
        }));
        this.cleanup.addSignal(settings, settings.connect('changed::dock-magnification-enabled', () => {
            this.targetEnvelope = settings.get_boolean('dock-magnification-enabled') && this.rawPointer !== null ? 1 : 0;
            if (this.targetEnvelope > 0 || this.envelope > 0)
                this.startTimeline();
        }));
        this.cleanup.addSignal(settings, settings.connect('changed::dock-magnification-scale', () => {
            if (this.envelope > 0)
                this.startTimeline();
        }));
        this.cleanup.addSignal(settings, settings.connect('changed::dock-position', () => {
            for (const item of this.items.values())
                this.setVisualPivot(item.visual);
            if (this.envelope > 0)
                this.startTimeline();
        }));
    }

    register(button: St.Button, visual: Clutter.Actor): void {
        if (this.destroyed)
            return;
        const existing = this.items.get(button);
        if (existing) {
            if (existing.visual !== visual) {
                this.resetVisual(existing.visual);
                existing.visual = visual;
                this.setVisualPivot(visual);
            }
            return;
        }
        this.setVisualPivot(visual);
        this.items.set(button, {
            button, visual, start: 0, end: 0, center: 0, scale: 1,
        });
        if (this.envelope > 0)
            this.startTimeline();
    }

    private isVertical(): boolean {
        return ['left', 'right'].includes(this.dockPosition());
    }

    private setVisualPivot(actor: Clutter.Actor): void {
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
        default:
            actor.set_pivot_point(0.5, 1);
            break;
        }
    }

    unregister(button: St.Button): void {
        const item = this.items.get(button);
        if (!item)
            return;
        this.items.delete(button);
        this.resetVisual(item.visual);
        if (this.items.size === 0)
            this.destroy();
        else if (this.envelope > 0)
            this.applyWave();
    }

    private startTimeline(): void {
        if (this.destroyed || this.timeline || this.items.size === 0)
            return;
        this.timeline = Clutter.Timeline.new_for_actor(this.content, 3600 * 1000);
        this.timeline.set_repeat_count(-1);
        this.timeline.connect('new-frame', () => this.onFrame());
        this.timeline.start();
    }

    private stopTimeline(): void {
        if (!this.timeline)
            return;
        this.timeline.stop();
        this.timeline = null;
    }

    private onFrame(): void {
        if (this.destroyed || !this.content.get_stage()) {
            this.stopTimeline();
            return;
        }
        const delta = this.timeline?.get_delta() ?? 0;
        const dt = Math.min(Math.max(delta / 1000, 0), DockMagnificationController.MAX_FRAME_DT);
        if (this.rawPointer !== null) {
            if (this.cursor === null)
                this.cursor = this.rawPointer;
            else
                this.cursor += (this.rawPointer - this.cursor) *
                    (1 - Math.exp(-dt / DockMagnificationController.CURSOR_TAU));
        }

        const omega = DockMagnificationController.SPRING_OMEGA;
        this.envelopeVelocity += (-2 * omega * this.envelopeVelocity -
            omega * omega * (this.envelope - this.targetEnvelope)) * dt;
        this.envelope += this.envelopeVelocity * dt;
        this.envelope = Math.max(0, Math.min(1, this.envelope));

        if (this.targetEnvelope === 0 && this.envelope < 0.002 &&
            Math.abs(this.envelopeVelocity) < 0.02) {
            this.envelope = 0;
            this.envelopeVelocity = 0;
            this.resetAllVisuals();
            this.onSurfaceExtentChanged?.(0, 0);
            this.stopTimeline();
            return;
        }
        if (this.envelope > 0 && this.cursor !== null)
            this.applyWave();
        else
            this.resetAllVisuals();
    }

    /** Scale only the icon actors; button allocations and inter-item gaps stay fixed. */
    private applyWave(): void {
        if (this.destroyed || this.cursor === null || !this.content.has_allocation())
            return;
        const vertical = this.isVertical();
        const contentPosition = this.content.get_transformed_position();
        const contentOrigin = vertical ? contentPosition[1] : contentPosition[0];
        const entries: MagnifiedItem[] = [];
        for (const item of this.items.values()) {
            if (!item.button.visible || !item.button.has_allocation() ||
                !item.visual.visible || !item.visual.has_allocation())
                continue;
            const box = item.button.get_allocation_box();
            const start = contentOrigin + (vertical ? box.y1 : box.x1);
            const extent = vertical ? box.get_height() : box.get_width();
            item.start = start;
            item.end = start + extent;
            item.center = start + extent / 2;
            entries.push(item);
        }
        entries.sort((a, b) => a.start - b.start);
        if (entries.length === 0)
            return;

        const maximum = Math.max(1, Math.min(4,
            this.settings.get_int('dock-magnification-scale') / 100));
        const averageSize = entries.reduce((sum, item) => sum + item.end - item.start, 0) / entries.length;
        const effectWidth = averageSize * 6;
        const min = this.cursor - effectWidth / 2;
        for (const item of entries) {
            const theta = Math.max(0, Math.min(2 * Math.PI,
                ((item.center - min) / effectWidth) * 2 * Math.PI));
            const hann = (1 - Math.cos(theta)) / 2;
            item.scale = 1 + this.envelope * (maximum - 1) * hann;
            item.visual.set_scale(item.scale, item.scale);
        }

        // The surface may grow around the first/last icon, without changing slots.
        const first = entries[0]!;
        const last = entries[entries.length - 1]!;
        const firstExtent = vertical ? first.visual.get_height() : first.visual.get_width();
        const lastExtent = vertical ? last.visual.get_height() : last.visual.get_width();
        this.onSurfaceExtentChanged?.(
            Math.max(0, firstExtent * (first.scale - 1) / 2),
            Math.max(0, lastExtent * (last.scale - 1) / 2),
        );
    }

    private resetVisual(actor: Clutter.Actor): void {
        for (const property of ['scale-x', 'scale-y', 'translation-x', 'translation-y'])
            actor.remove_transition(property);
        actor.set_scale(1, 1);
        actor.translation_x = 0;
        actor.translation_y = 0;
    }

    private resetAllVisuals(): void {
        for (const item of this.items.values())
            this.resetVisual(item.visual);
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.stopTimeline();
        this.cleanup.clear();
        this.rawPointer = null;
        this.cursor = null;
        this.resetAllVisuals();
        this.onSurfaceExtentChanged?.(0, 0);
        this.items.clear();
    }

    get size(): number {
        return this.items.size;
    }
}
