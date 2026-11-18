export interface FavoriteOrderPlan {
    idsToPin: string[];
    orderedFavoriteIds: string[];
}

/**
 * Resolve which applications become favorites after a dock reorder and the
 * resulting order of favorites, without mutating either input collection.
 */
export function resolveFavoriteOrderPlan(
    appIds: readonly string[],
    currentFavoriteIds: readonly string[],
    pinningBoundary: number,
): FavoriteOrderPlan {
    const favoriteIds = new Set(currentFavoriteIds);
    const idsToPin: string[] = [];
    const boundary = Math.max(0, Math.min(pinningBoundary, appIds.length));

    for (let index = 0; index < boundary; index++) {
        const id = appIds[index];
        if (!id || favoriteIds.has(id))
            continue;
        favoriteIds.add(id);
        idsToPin.push(id);
    }

    return {
        idsToPin,
        orderedFavoriteIds: appIds.filter(id => favoriteIds.has(id)),
    };
}
