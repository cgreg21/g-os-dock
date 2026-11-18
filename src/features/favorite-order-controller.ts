import Gio from 'gi://Gio?version=2.0';
import { resolveFavoriteOrderPlan } from './favorite-order.js';

export interface FavoriteOrderAdapter {
    getFavoriteIds(): string[];
    addFavorite(id: string): void;
    moveFavoriteToPos(id: string, position: number): void;
}

/**
 * Persists mixed dock order and synchronizes GNOME's favorite list with the
 * favorite section implied by that order.
 */
export class FavoriteOrderController {
    constructor(
        private readonly settings: Gio.Settings,
        private readonly favorites: FavoriteOrderAdapter,
    ) {}

    persist(ids: readonly string[]): void {
        const appIds = ids
            .filter(id => id.startsWith('app:'))
            .map(id => id.slice(4));
        const favoriteCount = this.favorites.getFavoriteIds().length;
        // With no favorites yet, the first app slot acts as the pinning area.
        const pinningBoundary = Math.max(1, favoriteCount);

        // addFavorite emits favorites.changed and may synchronously refresh
        // the dock, so the complete mixed order must be saved first.
        this.settings.set_strv('dock-item-order', [...ids]);

        const plan = resolveFavoriteOrderPlan(
            appIds,
            this.favorites.getFavoriteIds(),
            pinningBoundary,
        );
        for (const id of plan.idsToPin)
            this.favorites.addFavorite(id);

        // Re-read after mutations: GNOME may reject an unavailable app ID.
        const currentFavorites = this.favorites.getFavoriteIds();
        const currentPositions = new Map(
            currentFavorites.map((id, index) => [id, index]),
        );
        const orderedFavorites = appIds.filter(id => currentPositions.has(id));

        for (const [index, id] of orderedFavorites.entries()) {
            const current = currentPositions.get(id);
            if (current === undefined || current === index)
                continue;

            this.favorites.moveFavoriteToPos(id, index);
            currentFavorites.splice(current, 1);
            currentFavorites.splice(index, 0, id);
            const firstChanged = Math.min(current, index);
            const lastChanged = Math.max(current, index);
            for (let position = firstChanged; position <= lastChanged; position++) {
                const favoriteId = currentFavorites[position];
                if (favoriteId !== undefined)
                    currentPositions.set(favoriteId, position);
            }
        }
    }
}
