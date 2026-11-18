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
 * Pointer observation only: no animation, scaling, button resizing, or layout.
 */
export class DockMagnificationController {
    private readonly items = new Set<St.Button>();
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

    register(button: St.Button, _visual: Clutter.Actor, _baseStyle: string): void {
        if (!this.destroyed)
            this.items.add(button);
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
