import Meta from 'gi://Meta?version=51';

/** Tracks window geometry and lifetime signals for smart-hide updates. */
export class WindowTracker {
    private tracked = new Map<Meta.Window, number[]>();
    private destroyed = false;

    constructor(private display: Meta.Display, private onChange: () => void) {}

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

        const signals: number[] = [];
        // Meta.Window's GIR declarations omit these runtime GObject signals.
        const connectWindowSignal = (
            window as unknown as {
                connect: (signal: string, callback: () => void) => number;
            }
        ).connect.bind(window);
        for (const signal of ['position-changed', 'size-changed', 'unmanaged']) {
            try {
                signals.push(connectWindowSignal(signal, () => {
                    if (this.destroyed)
                        return;
                    if (signal === 'unmanaged')
                        this.untrack(window);
                    this.onChange();
                }));
            } catch (_error) {
                // Special window types may not expose every geometry signal.
            }
        }

        this.tracked.set(window, signals);
    }

    destroy(): void {
        if (this.destroyed)
            return;

        this.destroyed = true;
        for (const window of this.tracked.keys())
            this.untrack(window);
    }

    private untrack(window: Meta.Window): void {
        const signals = this.tracked.get(window);
        if (!signals)
            return;

        this.tracked.delete(window);
        for (const signal of signals) {
            try {
                window.disconnect(signal);
            } catch (_error) {
                // Window may already have been disposed by Mutter.
            }
        }
    }
}
