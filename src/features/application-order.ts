export interface IdentifiedApplication {
    get_id(): string | null;
}

/**
 * Resolve the visible application sequence without depending on GNOME ordering
 * beyond the order of running applications supplied by the caller.
 *
 * Favorites always form the first section, retain their configured order unless
 * an explicit dock rank changes that order, and are never duplicated.
 */
export function resolveApplicationOrder<T extends IdentifiedApplication>(
    favorites: T[],
    running: T[],
    ranks: ReadonlyMap<string, number>,
): T[] {
    const favoriteIds = new Set<string>();
    const seenIds = new Set<string>();
    const result: Array<{ app: T; index: number; favorite: boolean; rank: number }> = [];

    for (const app of favorites) {
        const id = app.get_id();
        if (!id || seenIds.has(id))
            continue;
        favoriteIds.add(id);
        seenIds.add(id);
        result.push({
            app,
            index: result.length,
            favorite: true,
            rank: ranks.get(`app:${id}`) ?? Number.MAX_SAFE_INTEGER,
        });
    }

    for (const app of running) {
        const id = app.get_id();
        if (!id || seenIds.has(id))
            continue;
        seenIds.add(id);
        result.push({
            app,
            index: result.length,
            favorite: favoriteIds.has(id),
            rank: ranks.get(`app:${id}`) ?? Number.MAX_SAFE_INTEGER,
        });
    }

    result.sort((a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        a.rank - b.rank ||
        a.index - b.index,
    );
    return result.map(item => item.app);
}
