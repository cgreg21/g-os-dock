export const FAVORITES_SEPARATOR_MARGIN = 4;

export function hasFavoritesSeparatorTarget(
    applicationIds: readonly (string | null)[],
    favoriteIds: ReadonlySet<string>,
): boolean {
    let hasFavorite = false;
    for (const id of applicationIds) {
        if (id && favoriteIds.has(id)) {
            hasFavorite = true;
            continue;
        }
        if (hasFavorite)
            return true;
    }
    return false;
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
    let hasFavorite = false;

    for (const application of applications) {
        const id = application.get_id();
        if (id && favoriteIds.has(id)) {
            hasFavorite = true;
            continue;
        }

        if (hasFavorite)
            return application;
    }

    return null;
}
