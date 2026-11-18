import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { DockDragDrop } from './drag-and-drop.js';
import { DockTooltip } from './tooltip.js';
import { getIconPaddingStyle } from './icon-padding.js';

type DriveCategory = 'network' | 'usb' | 'system';

const NETWORK_SCHEMES = new Set([
    'smb', 'sftp', 'ssh', 'ftp', 'ftps', 'dav', 'davs', 'nfs', 'afp',
]);

interface MountedDrive {
    id: string;
    mount: Gio.Mount;
    category: DriveCategory;
}

/** Keeps mounted network, internal and removable volumes represented in the dock. */
export class DockVolumeItems {
    private monitor: Gio.VolumeMonitor;
    private signals: number[] = [];
    private items = new Map<string, {
        button: St.Button;
        icon: St.Icon;
        mount: Gio.Mount;
        name: string;
        iconKey: string;
        tooltip: DockTooltip;
    }>();
    private destroyed = false;

    constructor(
        private content: St.BoxLayout,
        private settings: Gio.Settings,
        private dragDrop: DockDragDrop,
        private iconSize: number,
        private onChanged: () => void,
        private dockPosition: () => string,
    ) {
        this.monitor = Gio.VolumeMonitor.get();
        this.signals.push(
            this.monitor.connect('mount-added', () => this.handleMonitorChange()),
            this.monitor.connect('mount-removed', () => this.handleMonitorChange()),
            this.monitor.connect('mount-changed', () => this.handleMonitorChange()),
        );
        this.sync();
    }

    private handleMonitorChange(): void {
        if (this.sync())
            this.onChanged();
    }

    /** Reconcile mounted volumes with the three visibility preferences. */
    sync(): boolean {
        if (this.destroyed)
            return false;
        let changed = false;
        const visible = new Map<string, MountedDrive>();
        for (const mount of this.monitor.get_mounts()) {
            const entry = this.describeMount(mount);
            if (entry && this.isEnabled(entry.category))
                visible.set(entry.id, entry);
        }

        for (const [id, item] of this.items) {
            const entry = visible.get(id);
            if (!entry || entry.mount !== item.mount) {
                this.dragDrop.unregisterItem(item.button);
                item.button.destroy();
                this.items.delete(id);
                changed = true;
            }
        }

        for (const [id, entry] of visible) {
            const existing = this.items.get(id);
            if (existing) {
                existing.icon.icon_size = this.iconSize;
                this.updateButtonPadding(existing.button);
                const name = entry.mount.get_name();
                if (existing.name !== name) {
                    existing.name = name;
                    existing.button.accessible_name = name;
                    existing.tooltip.setText(name);
                }
                // Avoid replacing the icon actor's GIcon when the mount icon is unchanged.
                const icon = entry.mount.get_icon();
                const iconKey = icon.to_string() ?? '';
                // Some custom GIcons cannot be serialized; refresh those defensively.
                if (!iconKey || existing.iconKey !== iconKey) {
                    existing.icon.set_gicon(icon);
                    existing.iconKey = iconKey;
                }
                continue;
            }
            this.createItem(entry);
            changed = true;
        }
        return changed;
    }

    private describeMount(mount: Gio.Mount): MountedDrive | null {
        const root = mount.get_root();
        const uri = root.get_uri();
        const scheme = root.get_uri_scheme()?.toLowerCase() ?? '';
        const volume = mount.get_volume();
        const drive = volume?.get_drive() ?? null;
        const network = !root.is_native() || NETWORK_SCHEMES.has(scheme);
        const removable = !!drive && (drive.is_removable() || drive.is_media_removable());
        const category: DriveCategory = network ? 'network' : removable ? 'usb' : 'system';
        const uuid = mount.get_uuid();
        const id = `volume:${uuid || uri}`;
        return { id, mount, category };
    }

    private isEnabled(category: DriveCategory): boolean {
        switch (category) {
        case 'network':
            return this.settings.get_boolean('show-network-drives');
        case 'usb':
            return this.settings.get_boolean('show-usb-drives');
        case 'system':
            return this.settings.get_boolean('show-system-drives');
        }
    }

    private createItem(entry: MountedDrive): void {
        // Gio.Mount.get_icon() provides the same themed, non-symbolic icon
        // used by GNOME Files for this mounted volume.
        const gicon = entry.mount.get_icon();
        const icon = new St.Icon({
            gicon,
            icon_size: this.iconSize,
            style_class: 'g-os-dock-volume-icon',
        });
        const button = new St.Button({
            style_class: 'g-os-dock-item g-os-dock-volume-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: false,
            y_expand: false,
            accessible_name: entry.mount.get_name(),
            child: icon,
        });
        button.connect('clicked', () => {
            try {
                Gio.AppInfo.launch_default_for_uri(entry.mount.get_root().get_uri(), null);
            } catch (error) {
                logError(error as Error, 'Unable to open mounted volume');
            }
        });
        const name = entry.mount.get_name();
        const tooltip = new DockTooltip(button, name, this.dockPosition);
        this.content.add_child(button);
        this.updateButtonPadding(button);
        this.items.set(entry.id, {
            button, icon, mount: entry.mount, name,
            iconKey: gicon.to_string() ?? '', tooltip,
        });
        this.dragDrop.registerItem({ id: entry.id, actor: button });
    }

    /** Apply the same configurable icon box geometry as app, launcher and trash items. */
    private updateButtonPadding(button: St.Button): void {
        button.set_style(getIconPaddingStyle(this.settings, this.iconSize));
    }

    getCount(): number {
        return this.items.size;
    }

    setIconSize(size: number): void {
        this.iconSize = size;
        for (const item of this.items.values()) {
            item.icon.icon_size = size;
            this.updateButtonPadding(item.button);
        }
    }

    getDndItems(): Array<{ id: string; actor: St.Button }> {
        return [...this.items.entries()].map(([id, item]) => ({
            id,
            actor: item.button,
        }));
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        for (const signal of this.signals)
            this.monitor.disconnect(signal);
        this.signals = [];
        for (const item of this.items.values()) {
            this.dragDrop.unregisterItem(item.button);
            item.button.destroy();
        }
        this.items.clear();
    }
}
