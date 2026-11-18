export interface ActorBackedItem<TActor extends object = object> {
    actor: TActor;
}

/**
 * Orders registered dock items by their actual actor order in the content box.
 * Structural actors (such as separators and drag preview slots) are ignored.
 */
export function resolveDockDndOrder<T extends ActorBackedItem>(
    items: readonly T[],
    children: readonly object[],
): T[] {
    const positions = new Map<object, number>();
    children.forEach((child, index) => positions.set(child, index));

    return [...items].sort((a, b) =>
        (positions.get(a.actor) ?? -1) - (positions.get(b.actor) ?? -1),
    );
}
