import St from 'gi://St?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import { DockAppItemFactory, type DockAppButton } from './app-item.js';

/**
 * Owns the reconciliation lifecycle for application buttons in the dock.
 * It reuses actors when possible and replaces them transactionally on resize.
 */
export class DockApplicationItemsController {
    private currentItems: DockAppButton[] = [];
    private currentSize = 0;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly factory: DockAppItemFactory,
        private readonly settings: Gio.Settings,
    ) {}

    get items(): DockAppButton[] {
        return this.currentItems;
    }

    get size(): number {
        return this.currentSize;
    }

    sync(applications: Shell.App[], size: number): boolean {
        const pending: DockAppButton[] = [];
        const sizeChanged = this.currentSize !== 0 && this.currentSize !== size;
        const previousById = new Map<string, DockAppButton>();
        const existingItems = new Set(this.currentItems);

        if (!sizeChanged) {
            for (const item of this.currentItems) {
                const id = item._gOsDockApp?.get_id();
                if (id)
                    previousById.set(id, item);
            }
        }

        try {
            for (const app of applications) {
                const id = app.get_id();
                let item: DockAppButton | undefined;
                if (id) {
                    item = previousById.get(id);
                    if (item)
                        previousById.delete(id);
                }
                if (!item)
                    item = this.factory.create(app, size);

                item._gOsDockBase.setIconPadding(this.settings, size);
                if (item.get_parent() !== this.content)
                    this.content.add_child(item);
                pending.push(item);
            }
        } catch (error) {
            for (const item of pending) {
                if (!existingItems.has(item))
                    this.destroyItem(item);
            }
            throw error;
        }

        const structureChanged = sizeChanged ||
            this.currentItems.length !== pending.length ||
            this.currentItems.some((item, index) =>
                item._gOsDockApp.get_id() !== pending[index]?._gOsDockApp.get_id(),
            );
        const retained = new Set(pending);

        for (const item of this.currentItems) {
            if (retained.has(item))
                continue;
            this.destroyItem(item);
        }

        this.currentItems = pending;
        this.currentSize = size;
        return structureChanged;
    }

    destroy(): void {
        for (const item of this.currentItems)
            this.destroyItem(item);
        this.currentItems = [];
        this.currentSize = 0;
    }

    private destroyItem(item: DockAppButton): void {
        item.get_parent()?.remove_child(item);
        item._gOsDockBase.destroy();
    }
}
