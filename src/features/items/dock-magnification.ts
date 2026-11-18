import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { AnimationManager, type AnimationTarget } from '../../core/animation-manager.js';
import { CleanupManager } from '../../core/cleanup-manager.js';

const MAGNIFICATION_DURATION_MS = 100;
const INFLUENCE_RADIUS_FACTOR = 2.5;

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

/** Applies pointer-driven scale transitions to the registered visual actors. */
export class DockMagnificationController {
    private readonly items = new Map<St.Button, Clutter.Actor>();
    private readonly animationKeys = new Map<St.Button, string>();
    private readonly animations = new AnimationManager();
    private readonly cleanup = new CleanupManager();
    private readonly surface: Clutter.Actor;
    private readonly originalReactive: boolean;
    private pointerAxis: number | null = null;
    private nextAnimationId = 0;
    private destroyed = false;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly settings: Gio.Settings,
        private readonly dockPosition: () => string,
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
            this.animateItemsToScale(1);
            log('[G-OS Dock] magnification pointer: left surface');
            return Clutter.EVENT_PROPAGATE;
        }));
        for (const key of ['dock-magnification-enabled', 'dock-magnification-scale', 'dock-position']) {
            this.cleanup.addSignal(settings, settings.connect(`changed::${key}`, () => {
                if (key === 'dock-position') {
                    for (const visual of this.items.values())
                        this.applyVisualAnchor(visual);
                }
                this.applyMagnification();
            }));
        }
    }

    private updatePointer(event: Clutter.Event): void {
        if (this.destroyed)
            return;
        const [pointerX, pointerY] = event.get_coords();
        const [surfaceX, surfaceY] = this.surface.get_transformed_position();
        const [surfaceWidth, surfaceHeight] = this.surface.get_transformed_size();
        const position = this.content.orientation === Clutter.Orientation.VERTICAL
            ? this.dockPosition()
            : 'bottom';
        this.pointerAxis = resolveMagnificationPointerAxis(
            position, pointerX, pointerY, surfaceX, surfaceY, surfaceWidth, surfaceHeight,
        );
        this.applyMagnification();
        log(`[G-OS Dock] magnification pointer: axis=${this.pointerAxis === null ? 'outside' : this.pointerAxis.toFixed(1)}px, stage=(${pointerX.toFixed(1)}, ${pointerY.toFixed(1)})`);
    }

    /** Local pointer coordinate on the dock's main axis, or null outside it. */
    getPointerAxis(): number | null {
        return this.pointerAxis;
    }

    register(button: St.Button, visual: Clutter.Actor, _baseStyle: string): void {
        if (this.destroyed)
            return;
        this.items.set(button, visual);
        this.animationKeys.set(button, `dock-magnification-${this.nextAnimationId++}`);
        this.applyVisualAnchor(visual);
        visual.scale_x = 1;
        visual.scale_y = 1;
        this.applyMagnification();
    }

    private applyVisualAnchor(visual: Clutter.Actor): void {
        const position = this.dockPosition();
        if (this.content.orientation === Clutter.Orientation.VERTICAL) {
            // Keep the outer edge fixed so the icon grows into the screen.
            visual.set_pivot_point(position === 'right' ? 1 : 0, 0.5);
        } else {
            // Horizontal docks keep every icon aligned to their outer edge.
            visual.set_pivot_point(0.5, position === 'top' ? 0 : 1);
        }
    }

    /** Calculate each registered item's scale from its transformed geometry. */
    getItemScales(
        influenceRadiusFactor = INFLUENCE_RADIUS_FACTOR,
        maxScale = this.settings.get_int('dock-magnification-scale') / 100,
    ): ReadonlyMap<St.Button, number> {
        const scales = new Map<St.Button, number>();
        if (this.destroyed || this.pointerAxis === null
            || !this.settings.get_boolean('dock-magnification-enabled'))
            return scales;

        const [surfaceX, surfaceY] = this.surface.get_transformed_position();
        const vertical = this.content.orientation === Clutter.Orientation.VERTICAL;
        const boundedMaxScale = Math.max(1, Math.min(4, maxScale));
        for (const [button, visual] of this.items) {
            // Read the unscaled slot geometry for its center and the visual's
            // unscaled allocation for its extent. Using the visual's transformed
            // bounds here would feed the current scale back into the next frame.
            const [buttonX, buttonY] = button.get_transformed_position();
            const [buttonWidth, buttonHeight] = button.get_transformed_size();
            const itemExtent = vertical ? visual.height : visual.width;
            const itemCenter = vertical
                ? buttonY + buttonHeight / 2 - surfaceY
                : buttonX + buttonWidth / 2 - surfaceX;
            const itemStart = itemCenter - itemExtent / 2;
            scales.set(button, resolveMagnificationItemScale(
                this.pointerAxis, itemStart, itemExtent, influenceRadiusFactor, boundedMaxScale,
            ));
        }
        return scales;
    }

    private applyMagnification(): void {
        if (this.destroyed)
            return;
        const scales = this.getItemScales();
        for (const [button, visual] of this.items)
            this.animateItem(button, visual, scales.get(button) ?? 1);
    }

    private animateItemsToScale(scale: number): void {
        for (const [button, visual] of this.items)
            this.animateItem(button, visual, scale);
    }

    private animateItem(button: St.Button, visual: Clutter.Actor, scale: number): void {
        const key = this.animationKeys.get(button);
        if (!key)
            return;
        this.animations.animate(
            key,
            visual as unknown as AnimationTarget,
            { scaleX: scale, scaleY: scale },
            {
                durationMs: MAGNIFICATION_DURATION_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            },
        );
    }

    unregister(button: St.Button): void {
        const key = this.animationKeys.get(button);
        if (key)
            this.animations.cancel(key);
        this.animationKeys.delete(button);
        this.items.delete(button);
        if (this.items.size === 0)
            this.destroy();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.pointerAxis = null;
        this.animations.destroy();
        this.cleanup.clear();
        this.surface.reactive = this.originalReactive;
        this.items.clear();
        this.animationKeys.clear();
    }

    get size(): number {
        return this.items.size;
    }
}
