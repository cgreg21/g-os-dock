import { CleanupManager } from './cleanup-manager.js';

interface SignalSource {
    connect(signal: string, callback: () => void): number;
    disconnect(id: number): void;
}

interface RootedRow extends SignalSource {
    get_root(): unknown;
}

/** Owns preference-row signal bindings until the row leaves its widget tree. */
export class SettingsBinding {
    private cleanup = new CleanupManager();
    private destroyed = false;

    constructor(row: RootedRow) {
        this.cleanup.addSignal(row, row.connect('notify::root', () => {
            if (row.get_root() === null)
                this.destroy();
        }));
    }

    watch(settings: SignalSource, key: string, callback: () => void): void {
        if (this.destroyed || !key)
            return;
        this.cleanup.addSignal(settings, settings.connect(`changed::${key}`, callback));
    }

    connect(source: SignalSource, signal: string, callback: () => void): void {
        if (this.destroyed)
            return;
        this.cleanup.addSignal(source, source.connect(signal, callback));
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cleanup.clear();
    }

    get size(): number {
        return this.cleanup.size;
    }
}
