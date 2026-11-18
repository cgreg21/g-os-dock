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
