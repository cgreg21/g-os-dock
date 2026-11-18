import Meta from 'gi://Meta?version=51';
import { CleanupManager } from './cleanup-manager.js';

interface WindowSignalEmitter {
    connect(signal: string, callback: () => void): number;
    disconnect(id: number): void;
}

/** Tracks window geometry and lifetime signals for smart-hide updates. */
export class WindowTracker {
    private tracked = new Map<Meta.Window, CleanupManager>();
    private destroyed = false;

    constructor(
        private display: Meta.Display,
        private onChange: () => void,
        private onWindowStateChange: () => void,
    ) {}

    trackExisting(): void {
        if (this.destroyed)
            return;

        const windows = this.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        for (const window of windows)
            this.track(window);
    }

    track(window: Meta.Window): void {
        if (this.destroyed || !window || this.tracked.has(window))
            return;

        const cleanup = new CleanupManager();
        // Meta.Window's GIR declarations omit these runtime GObject signals.
        const emitter = window as unknown as WindowSignalEmitter;
        for (const signal of [
            'position-changed',
            'size-changed',
            'unmanaged',
            'notify::minimized',
        ]) {
            try {
                cleanup.addSignal(emitter, emitter.connect(signal, () => {
                    if (this.destroyed)
                        return;
                    if (signal === 'unmanaged') {
                        this.untrack(window);
                        this.onChange();
                    } else if (signal === 'notify::minimized') {
                        this.onWindowStateChange();
                    } else {
                        this.onChange();
                    }
                }));
            } catch (_error) {
                // Special window types may not expose every geometry signal.
            }
        }

        this.tracked.set(window, cleanup);
    }

    destroy(): void {
        if (this.destroyed)
            return;

        this.destroyed = true;
        for (const window of this.tracked.keys())
            this.untrack(window);
    }

    private untrack(window: Meta.Window): void {
        const cleanup = this.tracked.get(window);
        if (!cleanup)
            return;

        this.tracked.delete(window);
        cleanup.clear();
    }
}
