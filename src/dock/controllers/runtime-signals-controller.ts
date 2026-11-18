import Meta from 'gi://Meta?version=51';
import { ManagedSignalController, type SignalEmitter } from '../../features/managed-signal-controller.js';

export interface DockRuntimeSignalCallbacks {
    refresh(): void;
    updateIndicators(): void;
    queueSmartHideCheck(): void;
    trackWindow(window: Meta.Window): void;
}

/** Owns application, focus, stacking and workspace signal subscriptions. */
export class DockRuntimeSignalsController extends ManagedSignalController {
    constructor(
        private readonly appSystem: SignalEmitter,
        private readonly favorites: SignalEmitter,
        private readonly display: SignalEmitter,
        private readonly workspaceManager: SignalEmitter,
        private readonly callbacks: DockRuntimeSignalCallbacks,
    ) {
        super();
    }

    connect(): void {
        if (!this.beginConnect())
            return;

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

}
