import St from 'gi://St?version=51';
import { CleanupManager } from '../features/cleanup-manager.js';

interface SignalEmitter {
    connect(signal: string, callback: (...args: any[]) => void): number;
    disconnect(id: number): void;
}

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
export class DockActorSignalsController {
    private readonly cleanup = new CleanupManager();
    private connected = false;
    private destroyed = false;

    constructor(
        private readonly panel: St.Widget & SignalEmitter,
        private readonly actor: SignalEmitter,
        private readonly content: SignalEmitter,
        private readonly edgeSensor: St.Widget & SignalEmitter,
        private readonly callbacks: DockActorSignalCallbacks,
    ) {}

    connect(): void {
        if (this.destroyed || this.connected)
            return;
        this.connected = true;

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

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cleanup.clear();
    }

    private connectSignal(source: SignalEmitter, signal: string, callback: (...args: any[]) => void): void {
        this.cleanup.addSignal(source, source.connect(signal, callback));
    }

    private run(callback: () => void): void {
        if (!this.destroyed)
            callback();
    }

    get size(): number {
        return this.cleanup.size;
    }
}
