import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { CleanupManager } from '../../core/cleanup-manager.js';

/**
 * Converts stage coordinates into the dock's main-axis coordinate.
 * Returns null when the pointer is outside the surface bounds.
 */
export function resolveMagnificationPointerAxis(
    position: string,
    pointerX: number,
    pointerY: number,
    surfaceX: number,
    surfaceY: number,
    surfaceWidth: number,
    surfaceHeight: number,
): number | null {
    const localX = pointerX - surfaceX;
    const localY = pointerY - surfaceY;
    if (localX < 0 || localY < 0 || localX > surfaceWidth || localY > surfaceHeight)
        return null;

    return position === 'left' || position === 'right' ? localY : localX;
}

/**
 * Computes a smooth, symmetric magnification influence for one item.
 * The cosine falloff reaches maxScale at the pointer and returns to 1 at
 * influenceRadius. This is a pure calculation; it does not alter any actor.
 */
export function resolveMagnificationScale(
    pointerAxis: number,
    itemCenter: number,
    influenceRadius: number,
    maxScale: number,
): number {
    if (![pointerAxis, itemCenter, influenceRadius, maxScale].every(Number.isFinite)
        || influenceRadius <= 0 || maxScale < 1)
        return 1;

    const normalizedDistance = Math.abs(pointerAxis - itemCenter) / influenceRadius;
    if (normalizedDistance >= 1)
        return 1;

    const influence = (1 + Math.cos(Math.PI * normalizedDistance)) / 2;
    return 1 + (maxScale - 1) * influence;
}

/**
 * Resolves one item's influence from its actual main-axis geometry.
 * The influence radius scales with the item's rendered extent, so different
 * icon sizes and slot dimensions do not require fixed pixel assumptions.
 */
export function resolveMagnificationItemScale(
    pointerAxis: number,
    itemStart: number,
    itemExtent: number,
    influenceRadiusFactor: number,
    maxScale: number,
): number {
    if (![pointerAxis, itemStart, itemExtent, influenceRadiusFactor, maxScale].every(Number.isFinite)
        || itemExtent <= 0 || influenceRadiusFactor <= 0)
        return 1;

    const itemCenter = itemStart + itemExtent / 2;
    const influenceRadius = itemExtent * influenceRadiusFactor;
    return resolveMagnificationScale(pointerAxis, itemCenter, influenceRadius, maxScale);
}

/**
 * Pointer observation only: no animation, scaling, button resizing, or layout.
 */
export class DockMagnificationController {
    private readonly items = new Map<St.Button, Clutter.Actor>();
    private readonly cleanup = new CleanupManager();
    private readonly surface: Clutter.Actor;
    private readonly originalReactive: boolean;
    private pointerAxis: number | null = null;
    private destroyed = false;

    constructor(
        private readonly content: St.BoxLayout,
        _settings: Gio.Settings,
        _dockPosition: () => string,
        _onSurfaceExtentChanged?: (leading: number, trailing: number, active?: boolean) => void,
    ) {
        this.surface = content.get_parent() ?? content;
        this.originalReactive = this.surface.reactive;
        this.surface.reactive = true;

        this.cleanup.addSignal(this.surface, this.surface.connect('motion-event', (_actor, event) => {
            this.updatePointer(event);
            return Clutter.EVENT_PROPAGATE;
        }));
        this.cleanup.addSignal(this.surface, this.surface.connect('enter-event', (_actor, event) => {
            this.updatePointer(event);
            return Clutter.EVENT_PROPAGATE;
        }));
        this.cleanup.addSignal(this.surface, this.surface.connect('leave-event', () => {
            this.pointerAxis = null;
            log('[G-OS Dock] magnification pointer: left surface');
            return Clutter.EVENT_PROPAGATE;
        }));
    }

    private updatePointer(event: Clutter.Event): void {
        if (this.destroyed)
            return;
        const [pointerX, pointerY] = event.get_coords();
        const [surfaceX, surfaceY] = this.surface.get_transformed_position();
        const [surfaceWidth, surfaceHeight] = this.surface.get_transformed_size();
        const position = this.content.orientation === Clutter.Orientation.VERTICAL
            ? 'left'
            : 'bottom';
        this.pointerAxis = resolveMagnificationPointerAxis(
            position, pointerX, pointerY, surfaceX, surfaceY, surfaceWidth, surfaceHeight,
        );
        log(`[G-OS Dock] magnification pointer: axis=${this.pointerAxis === null ? 'outside' : this.pointerAxis.toFixed(1)}px, stage=(${pointerX.toFixed(1)}, ${pointerY.toFixed(1)})`);
    }

    /** Local pointer coordinate on the dock's main axis, or null outside it. */
    getPointerAxis(): number | null {
        return this.pointerAxis;
    }

    register(button: St.Button, visual: Clutter.Actor, _baseStyle: string): void {
        if (!this.destroyed)
            this.items.set(button, visual);
    }

    /** Calculate each registered item's scale without applying it to actors. */
    getItemScales(influenceRadiusFactor = 2.5, maxScale = 4): ReadonlyMap<St.Button, number> {
        const scales = new Map<St.Button, number>();
        if (this.destroyed || this.pointerAxis === null)
            return scales;

        const [surfaceX, surfaceY] = this.surface.get_transformed_position();
        const vertical = this.content.orientation === Clutter.Orientation.VERTICAL;
        for (const [button, visual] of this.items) {
            const [itemX, itemY] = visual.get_transformed_position();
            const [itemWidth, itemHeight] = visual.get_transformed_size();
            const itemStart = vertical ? itemY - surfaceY : itemX - surfaceX;
            const itemExtent = vertical ? itemHeight : itemWidth;
            scales.set(button, resolveMagnificationItemScale(
                this.pointerAxis, itemStart, itemExtent, influenceRadiusFactor, maxScale,
            ));
        }
        return scales;
    }

    unregister(button: St.Button): void {
        this.items.delete(button);
        if (this.items.size === 0)
            this.destroy();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.pointerAxis = null;
        this.cleanup.clear();
        this.surface.reactive = this.originalReactive;
        this.items.clear();
    }

    get size(): number {
        return this.items.size;
    }
}
