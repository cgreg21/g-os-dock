export const FAVORITES_SEPARATOR_MARGIN = 4;

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
