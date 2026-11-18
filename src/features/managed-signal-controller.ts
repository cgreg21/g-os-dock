import { CleanupManager } from './cleanup-manager.js';

interface SignalEmitter {
    connect(signal: string, callback: (...args: any[]) => void): number;
    disconnect(id: number): void;
}

/** Shared idempotent lifecycle for controllers that own GNOME signal subscriptions. */
export abstract class ManagedSignalController {
    private readonly cleanup = new CleanupManager();
    private connected = false;
    private destroyed = false;

    protected beginConnect(): boolean {
        if (this.destroyed || this.connected)
            return false;
        this.connected = true;
        return true;
    }

    protected connectSignal(
        source: SignalEmitter,
        signal: string,
        callback: (...args: any[]) => void,
    ): void {
        this.cleanup.addSignal(source, source.connect(signal, callback));
    }

    protected run(callback: () => void): void {
        if (!this.destroyed)
            callback();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cleanup.clear();
    }

    get isDestroyed(): boolean {
        return this.destroyed;
    }

    get size(): number {
        return this.cleanup.size;
    }
}
