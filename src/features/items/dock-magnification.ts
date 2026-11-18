import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { CleanupManager } from '../../core/cleanup-manager.js';

/**
 * Converts stage pointer coordinates into a coordinate on the dock's main
 * axis. The dock surface is axis-aligned, so its transformed origin is enough
 * to make the result local to the surface.
 */
export function resolveMagnificationPointerAxis(
    position: string,
    pointerX: number,
    pointerY: number,
    surfaceX: number,
    surfaceY: number,
): number {
    return position === 'left' || position === 'right'
        ? pointerY - surfaceY
        : pointerX - surfaceX;
}

/**
 * Step 1 of the magnifier rebuild: observe pointer position on the complete
 * content surface. This controller deliberately performs no animation,
 * scaling, button resizing, or layout changes.
 */
export class DockMagnificationController {
    private readonly items = new Set<St.Button>();
    private readonly cleanup = new CleanupManager();
    private readonly surface: Clutter.Actor;
    private pointerAxis: number | null = null;
    private destroyed = false;

    constructor(
        private readonly content: St.BoxLayout,
        _settings: Gio.Settings,
        _dockPosition: () => string,
        _onSurfaceExtentChanged?: (leading: number, trailing: number, active?: boolean) => void,
    ) {
        this.surface = content.get_parent() ?? content;
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
            return Clutter.EVENT_PROPAGATE;
        }));
    }

    private updatePointer(event: Clutter.Event): void {
        if (this.destroyed)
            return;
        const [pointerX, pointerY] = event.get_coords();
        const [surfaceX, surfaceY] = this.surface.get_transformed_position();
        const position = this.content.orientation === Clutter.Orientation.VERTICAL
            ? 'left'
            : 'bottom';
        this.pointerAxis = resolveMagnificationPointerAxis(
            position, pointerX, pointerY, surfaceX, surfaceY,
        );
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
        this.items.clear();
    }

    get size(): number {
        return this.items.size;
    }
}
