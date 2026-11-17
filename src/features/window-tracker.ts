import Meta from 'gi://Meta?version=51';

/** Tracks window geometry and lifetime signals for smart-hide updates. */
export class WindowTracker {
    private tracked: Array<{ window: Meta.Window; signals: number[] }> = [];

    constructor(private display: Meta.Display, private onChange: () => void) {}

    trackExisting(): void {
        const windows = this.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        for (const window of windows)
            this.track(window);
    }

    track(window: Meta.Window): void {
        if (!window || this.tracked.some(entry => entry.window === window))
            return;

        const signals: number[] = [];
        for (const signal of ['position-changed', 'size-changed', 'unmanaged']) {
            try {
                signals.push(window.connect(signal, () => {
                    if (signal === 'unmanaged')
                        this.untrack(window);
                    this.onChange();
                }));
            } catch (_error) {
                // Special window types may not expose every geometry signal.
            }
        }

        this.tracked.push({ window, signals });
    }

    destroy(): void {
        for (const entry of [...this.tracked])
            this.untrack(entry.window);
    }

    private untrack(window: Meta.Window): void {
        const index = this.tracked.findIndex(entry => entry.window === window);
        if (index < 0)
            return;

        const [entry] = this.tracked.splice(index, 1);
        for (const signal of entry.signals) {
            try {
                entry.window.disconnect(signal);
            } catch (_error) {
                // Window may already have been disposed by Mutter.
            }
        }
    }
}
