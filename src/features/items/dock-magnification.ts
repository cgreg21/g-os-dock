import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { AnimationManager, type AnimationTarget } from '../../core/animation-manager.js';
import { CleanupManager } from '../../core/cleanup-manager.js';

const MAGNIFICATION_DURATION_MS = 100;
const INFLUENCE_RADIUS_FACTOR = 2.5;

/** Resolve button dimensions from the visual's animated size, keeping CSS padding fixed. */
export function resolveMagnificationButtonSize(
    baseStyle: string,
    visualWidth: number,
    visualHeight: number,
    scaleX: number,
    scaleY: number,
): [number, number] {
    const widthMatch = baseStyle.match(/min-width:\s*([\d.]+)px/);
    const heightMatch = baseStyle.match(/min-height:\s*([\d.]+)px/);
    if (![visualWidth, visualHeight, scaleX, scaleY].every(Number.isFinite)
        || visualWidth <= 0 || visualHeight <= 0 || scaleX < 1 || scaleY < 1
        || !widthMatch || !heightMatch)
        return [0, 0];
    return [
        Number(widthMatch[1]) + visualWidth * (scaleX - 1),
        Number(heightMatch[1]) + visualHeight * (scaleY - 1),
    ];
}

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
 * Resolves one button's main-axis slot while preserving the gaps between
 * buttons. The total growth is distributed equally at both ends so the
 * magnified row or column remains centered around its original allocation.
 *
 * precedingGrowth is the sum of the size increases of all preceding buttons.
 */
export function resolveMagnificationMainAxisLayout(
    itemStart: number,
    itemExtent: number,
    itemScale: number,
    precedingGrowth: number,
    totalGrowth: number,
): [number, number] {
    if (![itemStart, itemExtent, itemScale, precedingGrowth, totalGrowth].every(Number.isFinite)
        || itemExtent <= 0 || itemScale < 1 || precedingGrowth < 0 || totalGrowth < precedingGrowth)
        return [itemStart, itemExtent];

    return [
        itemStart - totalGrowth / 2 + precedingGrowth,
        itemExtent * itemScale,
    ];
}

/**
 * Resolves the cross-axis slot while keeping the dock's outer edge fixed.
 * For bottom/right docks anchorEnd is true; top/left docks grow inward from
 * their leading edge.
 */
export function resolveMagnificationCrossAxisLayout(
    itemStart: number,
    itemExtent: number,
    itemScale: number,
    anchorEnd: boolean,
): [number, number] {
    if (![itemStart, itemExtent, itemScale].every(Number.isFinite)
        || itemExtent <= 0 || itemScale < 1)
        return [itemStart, itemExtent];

    const targetExtent = itemExtent * itemScale;
    return [
        anchorEnd ? itemStart + itemExtent - targetExtent : itemStart,
        targetExtent,
    ];
}

/** Applies pointer-driven scale transitions to the registered visual actors. */
export class DockMagnificationController {
    private readonly items = new Map<St.Button, Clutter.Actor>();
    private readonly animationKeys = new Map<St.Button, string>();
    private readonly baseStyles = new Map<St.Button, string>();
    private readonly visualScaleSignals = new Map<St.Button, number[]>();
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
        private readonly onSurfaceExtentChanged?: (leading: number, trailing: number, active?: boolean) => void,
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
            this.onSurfaceExtentChanged?.(0, 0, false);
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
        this.baseStyles.set(button, _baseStyle);
        const animationId = this.nextAnimationId++;
        this.animationKeys.set(button, `dock-magnification-visual-${animationId}`);
        const scaleSignals = [
            visual.connect('notify::scale-x', () => this.syncButtonSize(button, visual)),
            visual.connect('notify::scale-y', () => this.syncButtonSize(button, visual)),
        ];
        this.visualScaleSignals.set(button, scaleSignals);
        this.applyVisualAnchor(visual);
        visual.scale_x = 1;
        visual.scale_y = 1;
        this.syncButtonSize(button, visual);
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
        for (const [button, visual] of this.items) {
            const scale = scales.get(button) ?? 1;
            this.animateItem(button, visual, scale);
        }
        this.updateSurfaceInsets(scales);
        this.content.queue_relayout();
    }

    /**
     * The buttons now contribute their enlarged preferred size to the content
     * allocation. Ask the layout to remeasure it, but do not add extra insets:
     * doing so would count the same growth twice in the backdrop width.
     */
    private updateSurfaceInsets(_scales: ReadonlyMap<St.Button, number>): void {
        this.onSurfaceExtentChanged?.(0, 0, this.pointerAxis !== null);
    }

    private animateItemsToScale(scale: number): void {
        for (const [button, visual] of this.items)
            this.animateItem(button, visual, scale);
    }

    /** Keep the button allocation synchronized with the visual's live scale. */
    private syncButtonSize(button: St.Button, visual: Clutter.Actor): void {
        const baseStyle = this.baseStyles.get(button);
        if (baseStyle === undefined)
            return;
        const [buttonWidth, buttonHeight] = resolveMagnificationButtonSize(
            baseStyle, visual.width, visual.height, visual.scale_x, visual.scale_y,
        );
        if (buttonWidth <= 0 || buttonHeight <= 0)
            return;
        button.set_width(buttonWidth);
        button.set_height(buttonHeight);
        this.content.queue_relayout();
    }

    private animateItem(button: St.Button, visual: Clutter.Actor, scale: number): void {
        const visualKey = this.animationKeys.get(button);
        if (!visualKey)
            return;
        this.syncButtonSize(button, visual);
        this.animations.animate(
            visualKey,
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
        this.baseStyles.delete(button);
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
        this.visualScaleSignals.clear();
        this.baseStyles.clear();
        this.onSurfaceExtentChanged?.(0, 0, false);
    }

    get size(): number {
        return this.items.size;
    }
}
