export interface IdentifiedDockItem {
    id: string;
}

/** Build a stable lookup for persisted dock item positions. */
export function createItemOrderRanks(ids: readonly string[]): ReadonlyMap<string, number> {
    return new Map(ids.map((id, index) => [id, index]));
}

/**
 * Resolve the saved order, migrating the legacy launcher position only when
 * no explicit order has been persisted yet.
 */
export function resolveSavedItemOrder<T extends IdentifiedDockItem>(
    saved: readonly string[],
    items: readonly T[],
    legacyLauncherPosition: number,
    launcherId = 'system:launcher',
): string[] {
    if (saved.length > 0)
        return [...saved];

    const migrated = items
        .filter(item => item.id !== launcherId)
        .map(item => item.id);
    const launcherExists = items.some(item => item.id === launcherId);
    if (launcherExists) {
        const target = Math.max(0, Math.min(
            legacyLauncherPosition,
            migrated.length,
        ));
        migrated.splice(target, 0, launcherId);
    }
    return migrated;
}
