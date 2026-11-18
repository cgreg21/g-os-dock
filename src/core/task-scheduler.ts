/** Minimal GLib-compatible scheduler contract, injectable for deterministic tests. */
export interface TaskSchedulerBackend {
    timeout(delayMs: number, callback: () => boolean): number;
    idle(callback: () => boolean): number;
    remove(sourceId: number): void;
}

/** Owns keyed one-shot GLib tasks and prevents callbacks after disposal. */
export class TaskScheduler {
    private readonly sources = new Map<string, number>();
    private destroyed = false;

    constructor(private readonly backend: TaskSchedulerBackend) {}

    timeout(key: string, delayMs: number, callback: () => void): void {
        this.schedule(key, done => this.backend.timeout(delayMs, done), callback);
    }

    idle(key: string, callback: () => void): void {
        this.schedule(key, done => this.backend.idle(done), callback);
    }

    cancel(key: string): void {
        const sourceId = this.sources.get(key);
        if (sourceId === undefined)
            return;
        this.sources.delete(key);
        this.removeSource(sourceId);
    }

    cancelAll(): void {
        for (const key of [...this.sources.keys()])
            this.cancel(key);
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cancelAll();
    }

    get size(): number {
        return this.sources.size;
    }

    private schedule(
        key: string,
        createSource: (callback: () => boolean) => number,
        callback: () => void,
    ): void {
        if (this.destroyed)
            return;
        this.cancel(key);
        let sourceId = 0;
        sourceId = createSource(() => {
            if (this.destroyed || this.sources.get(key) !== sourceId)
                return false;
            this.sources.delete(key);
            try {
                callback();
            } catch (error) {
                logError(error as Error, `Dock scheduled task failed: ${key}`);
            }
            return false;
        });
        this.sources.set(key, sourceId);
    }

    private removeSource(sourceId: number): void {
        try {
            this.backend.remove(sourceId);
        } catch (error) {
            // The source may already have completed or been removed by GLib.
            logError(error as Error, 'Unable to cancel dock scheduled task');
        }
    }
}
