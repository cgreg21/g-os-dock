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

    constructor(
        appSystem: SignalEmitter,
        favorites: SignalEmitter,
        display: SignalEmitter,
        workspaceManager: SignalEmitter,
        private readonly callbacks: DockRuntimeSignalCallbacks,
    ) {
        this.connect(appSystem, 'app-state-changed', () => this.run(() => callbacks.refresh()));
        this.connect(favorites, 'changed', () => this.run(() => callbacks.refresh()));

        this.connect(display, 'notify::focus-window', () => this.run(() => {
            callbacks.updateIndicators();
            callbacks.queueSmartHideCheck();
        }));
        this.connect(display, 'restacked', () => this.run(() => callbacks.queueSmartHideCheck()));
        this.connect(workspaceManager, 'active-workspace-changed',
            () => this.run(() => callbacks.queueSmartHideCheck()));
        this.connect(display, 'window-created',
            (_display: Meta.Display, window: Meta.Window) => this.run(() => callbacks.trackWindow(window)));
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cleanup.clear();
    }

    private connect(source: SignalEmitter, signal: string, callback: (...args: any[]) => void): void {
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
