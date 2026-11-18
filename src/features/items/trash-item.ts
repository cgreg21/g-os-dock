import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { DockDragDrop } from '../interaction/drag-and-drop.js';
import { DockItemBase } from './dock-item-base.js';

/** Trash launcher with an icon reflecting whether the trash contains files. */
export class DockTrashItem {
    private button: St.Button;
    private icon: St.Icon;
    private monitor: Gio.FileMonitor | null = null;
    private item: DockItemBase;
    private destroyed = false;
    private hasItems: boolean | null = null;

    constructor(
        private content: St.BoxLayout,
        private settings: Gio.Settings,
        private iconSize: number,
        private dragDrop: DockDragDrop,
        dockPosition: () => string,
    ) {
        this.icon = new St.Icon({
            icon_name: 'user-trash',
            icon_size: iconSize,
            style_class: 'g-os-dock-trash-icon',
        });
        this.button = new St.Button({
            style_class: 'g-os-dock-item g-os-dock-trash-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: false,
            y_expand: false,
            accessible_name: 'Trash',
            child: this.icon,
        });
        this.item = new DockItemBase(
            this.content, this.button, 'Corbeille', dockPosition, this.dragDrop, 'system:trash',
        );
        this.item.cleanup.addSignal(this.button, this.button.connect('clicked', () => {
            try {
                Gio.AppInfo.launch_default_for_uri('trash:///', null);
            } catch (error) {
                logError(error as Error, 'Unable to open Trash');
            }
        }));
        this.watchTrash();
        this.updateIcon();
    }

    private watchTrash(): void {
        try {
            const trash = Gio.File.new_for_uri('trash:///');
            this.monitor = trash.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            const monitor = this.monitor;
            this.item.cleanup.add(() => monitor.cancel());
            const signal = monitor.connect('changed', () => this.updateIcon());
            this.item.cleanup.addSignal(monitor, signal);
        } catch (error) {
            logError(error as Error, 'Unable to monitor Trash');
        }
    }

    private updateIcon(): void {
        if (this.destroyed)
            return;
        let hasItems = false;
        let enumerator: Gio.FileEnumerator | null = null;
        try {
            const trash = Gio.File.new_for_uri('trash:///');
            enumerator = trash.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NONE,
                null,
            );
            hasItems = enumerator.next_file(null) !== null;
        } catch {
            // Some minimal GVfs installations do not expose a trash backend.
            // Keep the empty-trash icon and leave the launcher usable.
        } finally {
            enumerator?.close(null);
        }
        if (this.hasItems !== hasItems) {
            this.icon.icon_name = hasItems ? 'user-trash-full' : 'user-trash';
            this.hasItems = hasItems;
        }
        if (this.icon.icon_size !== this.iconSize)
            this.icon.icon_size = this.iconSize;
        this.item.setIconPadding(this.settings, this.iconSize, this.icon);
    }

    getActor(): St.Button {
        return this.button;
    }

    setIconSize(size: number): void {
        if (this.iconSize === size)
            return;
        this.iconSize = size;
        this.updateIcon();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.monitor = null;
        this.item.destroy();
    }
}
