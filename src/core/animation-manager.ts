/** Minimal actor contract kept independent from GJS so animation ownership is testable. */
export interface AnimationTarget {
    ease(params: AnimationParameters): void;
    remove_transition(property: string): void;
}

export interface AnimationParameters extends Record<string, unknown> {
    duration: number;
    mode?: number;
    onComplete?: () => void;
}

export interface AnimationOptions {
    durationMs: number;
    mode: number;
    onComplete?: () => void;
}

interface ActiveAnimation {
    actor: AnimationTarget;
    properties: string[];
}

/** Owns keyed actor transitions, replacing stale animations and guarding callbacks. */
export class AnimationManager {
    private readonly active = new Map<string, ActiveAnimation>();
    private destroyed = false;

    animate(
        key: string,
        actor: AnimationTarget,
        properties: Record<string, number>,
        options: AnimationOptions,
    ): void {
        if (this.destroyed)
            return;

        this.cancel(key);
        const animation: ActiveAnimation = {
            actor,
            properties: Object.keys(properties),
        };
        this.active.set(key, animation);

        const params: AnimationParameters = {
            ...properties,
            duration: Math.max(0, options.durationMs),
            mode: options.mode,
            onComplete: () => {
                if (this.destroyed || this.active.get(key) !== animation)
                    return;
                this.active.delete(key);
                options.onComplete?.();
            },
        };

        try {
            actor.ease(params);
        } catch (error) {
            if (this.active.get(key) === animation)
                this.active.delete(key);
            throw error;
        }
    }

    cancel(key: string): void {
        const animation = this.active.get(key);
        if (!animation)
            return;

        this.active.delete(key);
        for (const property of animation.properties)
            animation.actor.remove_transition(property);
    }

    cancelAll(): void {
        for (const key of [...this.active.keys()])
            this.cancel(key);
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cancelAll();
    }

    get size(): number {
        return this.active.size;
    }
}
