import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { DockDragDrop } from './drag-and-drop.js';
import { DockSystemItem } from './system-item.js';
import { DockTrashItem } from './trash-item.js';
import { DockVolumeItems } from './volume-items.js';

/**
 * Coordinates the lifecycle of non-application dock items.
 * Item-specific behavior remains owned by each concrete item implementation.
 */
export class DockItemsController {
    private systemItem: DockSystemItem | null = null;
    private trashItem: DockTrashItem | null = null;
    private volumeItems: DockVolumeItems | null = null;
    private destroyed = false;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly settings: Gio.Settings,
        private readonly dragDrop: DockDragDrop,
        private readonly dockPosition: () => string,
        private readonly onVolumesChanged: () => void,
    ) {}

    get volumeCount(): number {
        return this.volumeItems?.getCount() ?? 0;
    }

    /** Initialize or reconcile mounted volumes before the dock computes its fitted icon size. */
    syncVolumes(size: number): boolean {
        if (this.destroyed)
            return false;

        if (!this.volumeItems) {
            this.volumeItems = new DockVolumeItems(
                this.content,
                this.settings,
                this.dragDrop,
                size,
                this.onVolumesChanged,
                this.dockPosition,
            );
            return true;
        }

        return this.volumeItems.sync();
    }

    /** Reconcile optional fixed items and apply the final fitted size to every volume item. */
    sync(size: number): boolean {
        if (this.destroyed)
            return false;

        let changed = false;
        changed = this.syncOptionalItem(
            this.systemItem,
            this.settings.get_boolean('show-system-icon'),
            () => new DockSystemItem(
                this.content, this.settings, size, this.dockPosition, this.dragDrop,
            ),
            size,
            item => { this.systemItem = item; },
        ) || changed;

        changed = this.syncOptionalItem(
            this.trashItem,
            this.settings.get_boolean('show-trash-icon'),
            () => new DockTrashItem(
                this.content, this.settings, size, this.dragDrop, this.dockPosition,
            ),
            size,
            item => { this.trashItem = item; },
        ) || changed;

        this.volumeItems?.setIconSize(size);
        return changed;
    }

    getDndItems(): Array<{ id: string; actor: St.Button }> {
        const items: Array<{ id: string; actor: St.Button }> = [];
        if (this.systemItem)
            items.push({ id: 'system:launcher', actor: this.systemItem.getActor() });
        if (this.trashItem)
            items.push({ id: 'system:trash', actor: this.trashItem.getActor() });
        if (this.volumeItems)
            items.push(...this.volumeItems.getDndItems());
        return items;
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.systemItem?.destroy();
        this.systemItem = null;
        this.trashItem?.destroy();
        this.trashItem = null;
        this.volumeItems?.destroy();
        this.volumeItems = null;
    }

    private syncOptionalItem<T extends {
        setIconSize(size: number): void;
        destroy(): void;
    }>(
        current: T | null,
        enabled: boolean,
        create: () => T,
        size: number,
        assign: (item: T | null) => void,
    ): boolean {
        if (!enabled) {
            if (!current)
                return false;
            current.destroy();
            assign(null);
            return true;
        }

        if (!current) {
            assign(create());
            return true;
        }

        current.setIconSize(size);
        return false;
    }
}
