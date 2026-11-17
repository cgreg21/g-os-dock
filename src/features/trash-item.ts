import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { DockDragDrop } from './drag-and-drop.js';

/** Trash launcher with an icon reflecting whether the trash contains files. */
export class DockTrashItem {
    private button: St.Button;
    private icon: St.Icon;
    private monitor: Gio.FileMonitor | null = null;
    private monitorSignal = 0;
    private destroyed = false;

    constructor(
        private content: St.BoxLayout,
        private settings: Gio.Settings,
        private iconSize: number,
        private dragDrop: DockDragDrop,
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
        this.content.add_child(this.button);
        this.dragDrop.registerItem({ id: 'system:trash', actor: this.button });
        this.watchTrash();
        this.updateIcon();
    }

    private watchTrash(): void {
        try {
            const trash = Gio.File.new_for_uri('trash:///');
            this.monitor = trash.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            this.monitorSignal = this.monitor.connect('changed', () => this.updateIcon());
        } catch (error) {
            logError(error as Error, 'Unable to monitor Trash');
        }
    }

    private updateIcon(): void {
        if (this.destroyed)
            return;
        let hasItems = false;
        try {
            const trash = Gio.File.new_for_uri('trash:///');
            const enumerator = trash.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NONE,
                null,
            );
            const first = enumerator.next_file(null);
            hasItems = first !== null;
            enumerator.close(null);
        } catch {
            // Some minimal GVfs installations do not expose a trash backend.
            // Keep the empty-trash icon and leave the launcher usable.
        }
        this.icon.icon_name = hasItems ? 'user-trash-full' : 'user-trash';
        this.icon.icon_size = this.iconSize;
        const top = this.settings.get_int('icon-padding-top');
        const right = this.settings.get_int('icon-padding-right');
        const bottom = this.settings.get_int('icon-padding-bottom');
        const left = this.settings.get_int('icon-padding-left');
        this.button.set_style(
            `padding: ${top}px ${right}px ${bottom}px ${left}px; ` +
            `min-width: ${this.iconSize + left + right}px; ` +
            `min-height: ${this.iconSize + top + bottom}px;`,
        );
    }

    getActor(): St.Button {
        return this.button;
    }

    setIconSize(size: number): void {
        this.iconSize = size;
        this.updateIcon();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        if (this.monitorSignal && this.monitor)
            this.monitor.disconnect(this.monitorSignal);
        this.monitor?.cancel();
        this.monitor = null;
        this.dragDrop.unregisterItem(this.button);
        this.button.destroy();
    }
}
