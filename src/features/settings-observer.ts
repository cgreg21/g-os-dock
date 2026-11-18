import { CleanupManager } from './cleanup-manager.js';

interface SettingsSignalSource {
    connect(signal: string, callback: () => void): number;
    disconnect(id: number): void;
}

/** Owns runtime GSettings subscriptions and their cleanup. */
export class SettingsObserver {
    private cleanup = new CleanupManager();
    private destroyed = false;

    watch(settings: SettingsSignalSource, key: string, callback: () => void): void {
        if (this.destroyed)
            return;
        this.cleanup.addSignal(
            settings,
            settings.connect(`changed::${key}`, callback),
        );
    }

    watchMany(settings: SettingsSignalSource, keys: readonly string[], callback: () => void): void {
        if (this.destroyed)
            return;
        for (const key of new Set(keys)) {
            if (key.length === 0)
                continue;
            this.watch(settings, key, callback);
        }
    }

    watchAll(settings: SettingsSignalSource, callback: () => void): void {
        if (this.destroyed)
            return;
        this.cleanup.addSignal(settings, settings.connect('changed', callback));
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
