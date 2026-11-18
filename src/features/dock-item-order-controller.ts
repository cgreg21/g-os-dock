import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { dockCache } from './cache.js';
import {
    createItemOrderRanks,
    resolveSavedItemOrder,
    type IdentifiedDockItem,
} from './item-order.js';

export interface DockOrderItem extends IdentifiedDockItem {
    actor: St.Widget;
}

/**
 * Owns persistence, legacy migration and application of the mixed dock item
 * order. Domain-specific favorite synchronization remains with DockView.
 */
export class DockItemOrderController<T extends DockOrderItem> {
    constructor(
        private readonly content: St.BoxLayout,
        private readonly settings: Gio.Settings,
        private readonly getItems: () => T[],
    ) {}

    getRanks(ids: readonly string[]): ReadonlyMap<string, number> {
        const key = `dock-item-order-ranks:${JSON.stringify(ids)}`;
        return dockCache.getOrCreate(key, () => createItemOrderRanks(ids));
    }

    apply(): void {
        const items = this.getItems();
        const saved = resolveSavedItemOrder(
            this.settings.get_strv('dock-item-order'),
            items,
            this.settings.get_int('system-icon-position'),
        );
        if (saved.length > 0 && this.settings.get_strv('dock-item-order').length === 0)
            this.settings.set_strv('dock-item-order', saved);

        const ranks = this.getRanks(saved);
        const ordered = items
            .map((item, index) => ({ item, index }))
            .sort((a, b) =>
                (ranks.get(a.item.id) ?? Number.MAX_SAFE_INTEGER) -
                (ranks.get(b.item.id) ?? Number.MAX_SAFE_INTEGER) ||
                a.index - b.index,
            )
            .map(entry => entry.item);

        const children = this.content.get_children();
        for (const [index, item] of ordered.entries()) {
            const current = children.indexOf(item.actor);
            if (current < 0 || current === index)
                continue;

            this.content.set_child_at_index(item.actor, index);
            children.splice(current, 1);
            children.splice(index, 0, item.actor);
        }
    }
}
