import Meta from 'gi://Meta?version=51';
import { CleanupManager } from '../features/cleanup-manager.js';

interface SignalEmitter {
    connect(signal: string, callback: (...args: any[]) => void): number;
    disconnect(id: number): void;
}

export interface DockRuntimeSignalCallbacks {
    refresh(): void;
    updateIndicators(): void;
    queueSmartHideCheck(): void;
    trackWindow(window: Meta.Window): void;
}

/** Owns application, focus, stacking and workspace signal subscriptions. */
export class DockRuntimeSignalsController {
    private readonly cleanup = new CleanupManager();
    private destroyed = false;

    private connected = false;

    constructor(
        private readonly appSystem: SignalEmitter,
        private readonly favorites: SignalEmitter,
        private readonly display: SignalEmitter,
        private readonly workspaceManager: SignalEmitter,
        private readonly callbacks: DockRuntimeSignalCallbacks,
    ) {}

    connect(): void {
        if (this.destroyed || this.connected)
            return;
        this.connected = true;

        this.connectSignal(this.appSystem, 'app-state-changed',
            () => this.run(() => this.callbacks.refresh()));
        this.connectSignal(this.favorites, 'changed',
            () => this.run(() => this.callbacks.refresh()));

        this.connectSignal(this.display, 'notify::focus-window', () => this.run(() => {
            this.callbacks.updateIndicators();
            this.callbacks.queueSmartHideCheck();
        }));
        this.connectSignal(this.display, 'restacked',
            () => this.run(() => this.callbacks.queueSmartHideCheck()));
        this.connectSignal(this.workspaceManager, 'active-workspace-changed',
            () => this.run(() => this.callbacks.queueSmartHideCheck()));
        this.connectSignal(this.display, 'window-created',
            (_display: Meta.Display, window: Meta.Window) =>
                this.run(() => this.callbacks.trackWindow(window)));
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
