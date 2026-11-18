/** Owns cleanup callbacks and runs them once, in reverse registration order. */
export class CleanupManager {
    private cleanups: Array<() => void> = [];
    private cleared = false;

    add(cleanup: () => void): void {
        if (this.cleared) {
            cleanup();
            return;
        }
        this.cleanups.push(cleanup);
    }

    clear(): void {
        if (this.cleared)
            return;
        this.cleared = true;
        const cleanups = this.cleanups.splice(0);
        for (let index = cleanups.length - 1; index >= 0; index--) {
            try {
                cleanups[index]!();
            } catch (error) {
                logError(error as Error, 'Unable to release dock resource');
            }
        }
    }

    get size(): number {
        return this.cleanups.length;
    }
}
