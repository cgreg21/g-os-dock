import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { CleanupManager } from '../../core/cleanup-manager.js';

interface MagnifiedItem {
    actor: St.Button;
    start: number;
    end: number;
    center: number;
    scale: number;
}

/**
 * Frame-driven dock magnifier.
 *
 * A raised-cosine window creates the wave; a cumulative slot walk moves
 * neighboring icons aside while keeping the icon under the pointer anchored.
 * The scale pivot remains on the screen-facing edge for all four dock sides.
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
            if (this.targetEnvelope > 0)
                this.startTimeline();
            else if (this.envelope > 0)
                this.startTimeline();
        }));
        this.cleanup.addSignal(settings, settings.connect('changed::dock-magnification-scale', () => {
            if (this.envelope > 0)
                this.startTimeline();
        }));
        this.cleanup.addSignal(settings, settings.connect('changed::dock-position', () => {
            for (const { actor } of this.items.values())
                this.setBaselinePivot(actor);
            if (this.envelope > 0)
                this.startTimeline();
        }));
    }

    register(actor: St.Button): void {
        if (this.destroyed || this.items.has(actor))
            return;
        this.setBaselinePivot(actor);
        this.items.set(actor, { actor, start: 0, end: 0, center: 0, scale: 1 });
        if (this.envelope > 0)
            this.startTimeline();
    }

    private isVertical(): boolean {
        return ['left', 'right'].includes(this.dockPosition());
    }

    private setBaselinePivot(actor: St.Button): void {
        // The perpendicular pivot sits exactly on the screen-facing edge.
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

    unregister(actor: St.Button): void {
        if (!this.items.has(actor))
            return;
        this.items.delete(actor);
        this.resetActor(actor);
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

        // Critically damped envelope avoids snapping when entering/leaving.
        const omega = DockMagnificationController.SPRING_OMEGA;
        this.envelopeVelocity += (-2 * omega * this.envelopeVelocity -
            omega * omega * (this.envelope - this.targetEnvelope)) * dt;
        this.envelope += this.envelopeVelocity * dt;
        this.envelope = Math.max(0, Math.min(1, this.envelope));

        if (this.targetEnvelope === 0 &&
            this.envelope < 0.002 &&
            Math.abs(this.envelopeVelocity) < 0.02) {
            this.envelope = 0;
            this.envelopeVelocity = 0;
            this.resetAllActors();
            this.stopTimeline();
            return;
        }

        if (this.envelope > 0 && this.cursor !== null)
            this.applyWave();
        else
            this.resetAllActors();
    }

    /**
     * Read untransformed child allocations, calculate a Hann wave, then
     * accumulate each enlarged slot to reflow the row/column as one strip.
     */
    private applyWave(): void {
        if (this.destroyed || this.cursor === null || !this.content.has_allocation())
            return;

        const vertical = this.isVertical();
        const contentPosition = this.content.get_transformed_position();
        const contentAxis = vertical ? contentPosition[1] : contentPosition[0];
        const contentOrigin = contentAxis;
        const entries: MagnifiedItem[] = [];

        for (const entry of this.items.values()) {
            const actor = entry.actor;
            if (!actor.visible || !actor.has_allocation())
                continue;
            const box = actor.get_allocation_box();
            const start = contentOrigin + (vertical ? box.y1 : box.x1);
            const extent = vertical ? box.get_height() : box.get_width();
            entry.start = start;
            entry.end = start + extent;
            entry.center = start + extent / 2;
            entries.push(entry);
        }
        entries.sort((a, b) => a.start - b.start);
        if (entries.length === 0)
            return;

        const maximum = Math.max(1, Math.min(4,
            this.settings.get_int('dock-magnification-scale') / 100));
        const averageSize = entries.reduce((sum, entry) => sum + entry.end - entry.start, 0) / entries.length;
        const effectWidth = Math.max(averageSize * 2, averageSize * 6);
        const min = this.cursor - effectWidth / 2;

        for (const entry of entries) {
            const theta = Math.max(0, Math.min(2 * Math.PI,
                ((entry.center - min) / effectWidth) * 2 * Math.PI));
            const hann = (1 - Math.cos(theta)) / 2;
            entry.scale = 1 + this.envelope * (maximum - 1) * hann;
        }

        // Slot boundaries sit midway through the gaps between icons.
        const count = entries.length;
        const bounds = new Array<number>(count + 1);
        const expanded = new Array<number>(count + 1);
        bounds[0] = entries[0]!.start;
        for (let i = 1; i < count; i++)
            bounds[i] = (entries[i - 1]!.end + entries[i]!.start) / 2;
        bounds[count] = entries[count - 1]!.end;

        expanded[0] = bounds[0]!;
        for (let i = 0; i < count; i++)
            expanded[i + 1] = expanded[i]! + (bounds[i + 1]! - bounds[i]!) * entries[i]!.scale;

        // Keep the pointer's location stable while the neighboring slots expand.
        let shift = 0;
        if (this.cursor > bounds[0]! && this.cursor < bounds[count]!) {
            let index = 0;
            while (index < count - 1 && bounds[index + 1]! < this.cursor)
                index++;
            const mapped = expanded[index]! +
                (this.cursor - bounds[index]!) * entries[index]!.scale;
            shift = this.cursor - mapped;
        } else if (this.cursor >= bounds[count]!) {
            shift = bounds[count]! - expanded[count]!;
        }

        for (let i = 0; i < count; i++) {
            const entry = entries[i]!;
            const mappedCenter = expanded[i]! +
                (entry.center - bounds[i]!) * entry.scale + shift;
            const translation = mappedCenter - entry.center;
            entry.actor.set_scale(entry.scale, entry.scale);
            if (vertical)
                entry.actor.translation_y = translation;
            else
                entry.actor.translation_x = translation;
        }
    }

    private resetActor(actor: St.Button): void {
        for (const property of ['scale-x', 'scale-y', 'translation-x', 'translation-y'])
            actor.remove_transition(property);
        actor.set_scale(1, 1);
        actor.translation_x = 0;
        actor.translation_y = 0;
    }

    private resetAllActors(): void {
        for (const { actor } of this.items.values())
            this.resetActor(actor);
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.stopTimeline();
        this.cleanup.clear();
        this.rawPointer = null;
        this.cursor = null;
        this.resetAllActors();
        this.items.clear();
    }

    get size(): number {
        return this.items.size;
    }
}
