export interface ChromeActorOptions {
    affectsStruts?: boolean;
    trackFullscreen?: boolean;
}

/** Owns actors registered with GNOME's chrome layer and releases them once. */
export class ChromeActorManager<T extends object> {
    private readonly actors = new Set<T>();
    private destroyed = false;

    constructor(
        private readonly addActor: (actor: T, options: ChromeActorOptions) => void,
        private readonly removeActor: (actor: T) => void,
    ) {}

    add(actor: T, options: ChromeActorOptions = {}): void {
        if (this.destroyed || this.actors.has(actor))
            return;
        this.addActor(actor, options);
        this.actors.add(actor);
    }

    remove(actor: T): void {
        if (!this.actors.delete(actor))
            return;
        try {
            this.removeActor(actor);
        } catch (error) {
            logError(error as Error, 'Unable to remove dock chrome actor');
        }
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        const actors = [...this.actors];
        this.actors.clear();
        for (let index = actors.length - 1; index >= 0; index--) {
            try {
                this.removeActor(actors[index]!);
            } catch (error) {
                logError(error as Error, 'Unable to remove dock chrome actor');
            }
        }
    }

    get size(): number {
        return this.actors.size;
    }
}
