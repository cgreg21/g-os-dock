import St from 'gi://St?version=51';
import { ManagedSignalController, type SignalEmitter } from '../../features/managed-signal-controller.js';

export interface DockActorSignalCallbacks {
    positionDock(): void;
    queueLayoutUpdate(): void;
    onDockPointerChanged(): void;
    onEdgeSensorHoverChanged(hovered: boolean): void;
}

/**
 * Owns panel, dock actor, content allocation and edge sensor subscriptions.
 * The controller is reusable by dock views with different actor instances.
 */
export class DockActorSignalsController extends ManagedSignalController {
    constructor(
        private readonly panel: St.Widget & SignalEmitter,
        private readonly actor: SignalEmitter,
        private readonly content: SignalEmitter,
        private readonly edgeSensor: St.Widget & SignalEmitter,
        private readonly callbacks: DockActorSignalCallbacks,
    ) {
        super();
    }

    connect(): void {
        if (!this.beginConnect())
            return;

        for (const property of ['x', 'y', 'width', 'height']) {
            this.connectSignal(this.panel, `notify::${property}`, () => {
                this.run(() => this.callbacks.positionDock());
            });
        }

        this.connectSignal(this.actor, 'notify::hover', () => {
            this.run(() => this.callbacks.onDockPointerChanged());
        });
        this.connectSignal(this.edgeSensor, 'notify::hover', () => {
            this.run(() => this.callbacks.onEdgeSensorHoverChanged(this.edgeSensor.hover));
        });
        this.connectSignal(this.content, 'notify::allocation', () => {
            this.run(() => this.callbacks.queueLayoutUpdate());
        });
    }

}
