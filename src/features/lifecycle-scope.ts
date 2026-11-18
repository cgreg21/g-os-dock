import { CleanupManager } from './cleanup-manager.js';
import { ChromeActorManager, type ChromeActorOptions } from './chrome-actor-manager.js';
import { TaskScheduler, type TaskSchedulerBackend } from './task-scheduler.js';

/**
 * Composes the common lifetime resources owned by a dock feature.
 *
 * Feature-specific behavior stays in its owner; this scope only standardizes
 * disposal of signals, scheduled GLib work and actors registered with chrome.
 */
export class LifecycleScope<T extends object> {
    readonly cleanup = new CleanupManager();
    readonly tasks: TaskScheduler;
    readonly chrome: ChromeActorManager<T>;
    private destroyed = false;

    constructor(
        scheduler: TaskSchedulerBackend,
        addChromeActor: (actor: T, options: ChromeActorOptions) => void,
        removeChromeActor: (actor: T) => void,
    ) {
        this.tasks = new TaskScheduler(scheduler);
        this.chrome = new ChromeActorManager(addChromeActor, removeChromeActor);
    }

    addSignal(
        emitter: { disconnect(id: number): void },
        signalId: number,
    ): void {
        this.cleanup.addSignal(emitter, signalId);
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;

        // Stop asynchronous callbacks before releasing their targets.
        this.tasks.destroy();
        this.cleanup.clear();
        this.chrome.destroy();
    }

    get isDestroyed(): boolean {
        return this.destroyed;
    }
}
