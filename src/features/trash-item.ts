import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { DockDragDrop } from './drag-and-drop.js';
import { DockTooltip } from './tooltip.js';
import { getIconPaddingStyle } from './icon-padding.js';
import { CleanupManager } from './cleanup-manager.js';

/** Trash launcher with an icon reflecting whether the trash contains files. */
export class DockTrashItem {
    private button: St.Button;
    private icon: St.Icon;
    private monitor: Gio.FileMonitor | null = null;
    private cleanup = new CleanupManager();
    private destroyed = false;
    private hasItems: boolean | null = null;
    private paddingStyle = '';

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
        this.button.connect('clicked', () => {
            try {
                Gio.AppInfo.launch_default_for_uri('trash:///', null);
            } catch (error) {
                logError(error as Error, 'Unable to open Trash');
            }
        });
        new DockTooltip(this.button, 'Corbeille', dockPosition);
        this.content.add_child(this.button);
        this.dragDrop.registerItem({ id: 'system:trash', actor: this.button });
        this.watchTrash();
        this.updateIcon();
    }

    private watchTrash(): void {
        try {
            const trash = Gio.File.new_for_uri('trash:///');
            this.monitor = trash.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            const monitor = this.monitor;
            this.cleanup.add(() => monitor.cancel());
            const signal = monitor.connect('changed', () => this.updateIcon());
            this.cleanup.add(() => monitor.disconnect(signal));
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
        const paddingStyle = getIconPaddingStyle(this.settings, this.iconSize);
        if (this.paddingStyle !== paddingStyle) {
            this.button.set_style(paddingStyle);
            this.paddingStyle = paddingStyle;
        }
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
        this.cleanup.clear();
        this.monitor = null;
        this.dragDrop.unregisterItem(this.button);
        this.button.destroy();
    }
}
