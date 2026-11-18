export const FAVORITES_SEPARATOR_MARGIN = 4;

/** Find the first non-favorite item after the favorite section. */
export function resolveFavoritesSeparatorTargetIndex(
    applicationIds: readonly (string | null)[],
    favoriteIds: ReadonlySet<string>,
): number {
    let hasFavorite = false;
    for (let index = 0; index < applicationIds.length; index++) {
        const id = applicationIds[index];
        if (id && favoriteIds.has(id)) {
            hasFavorite = true;
            continue;
        }
        if (hasFavorite)
            return index;
    }
    return -1;
}

export function hasFavoritesSeparatorTarget(
    applicationIds: readonly (string | null)[],
    favoriteIds: ReadonlySet<string>,
): boolean {
    return resolveFavoritesSeparatorTargetIndex(applicationIds, favoriteIds) >= 0;
}

/** Calculate the separator's exact cost along the dock's main axis. */
export function calculateFavoritesSeparatorSpace(
    visible: boolean,
    thickness: number,
    margin: number,
    spacing: number,
): number {
    return visible
        ? Math.max(0, thickness) + Math.max(0, margin) * 2 + Math.max(0, spacing)
        : 0;
}

export interface IdentifiedDockItem {
    get_id(): string | null;
}

/**
 * Find the first non-favorite application that follows the favorite section.
 * Returns null when there is no favorite section or no running-app section.
 */
export function resolveFavoritesSeparatorTarget<T extends IdentifiedDockItem>(
    applications: readonly T[],
    favoriteIds: ReadonlySet<string>,
): T | null {
    const index = resolveFavoritesSeparatorTargetIndex(
        applications.map(application => application.get_id()),
        favoriteIds,
    );
    return index >= 0 ? applications[index] ?? null : null;
}
