export interface ActiveIndicatorTransition {
    changed: boolean;
    active: boolean;
}

/** Resolve whether an actor's active CSS state needs to change. */
export function resolveActiveIndicatorTransition(
    previous: boolean | undefined,
    active: boolean,
): ActiveIndicatorTransition {
    return {
        changed: previous !== active,
        active,
    };
}
