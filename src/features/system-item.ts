import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { DockDragDrop } from './drag-and-drop.js';
import { getDockMenuSide } from './menu-position.js';
import { DockItemBase } from './dock-item-base.js';
import { PopupMenuLifecycle } from './popup-menu-lifecycle.js';

/** Configurable app-grid launcher and GNOME system actions. */
export class DockSystemItem {
    private button: St.Button;
    private menuLifecycle: PopupMenuLifecycle;
    private menu: PopupMenu.PopupMenu | null = null;
    private item: DockItemBase;
    private destroyed = false;

    constructor(private content: St.BoxLayout, private settings: Gio.Settings,
        private iconSize: number, private dockPosition: () => string,
        private dragDrop: DockDragDrop) {
        this.button = new St.Button({
            style_class: 'g-os-dock-item g-os-dock-system-item', reactive: true,
            can_focus: true, track_hover: true, x_expand: false, y_expand: false,
            accessible_name: 'Applications and system actions',
        });
        this.item = new DockItemBase(
            this.content, this.button, 'Applications', this.dockPosition,
            this.dragDrop, 'system:launcher',
        );
        this.updateIcon();
        this.item.cleanup.addSignal(this.button, this.button.connect('clicked', () => {
            if (Main.overview.visible)
                Main.overview.hide();
            else
                Main.overview.showApps();
        }));
        this.item.cleanup.addSignal(this.button, this.button.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 3) return Clutter.EVENT_PROPAGATE;
            this.showMenu();
            return Clutter.EVENT_STOP;
        }));
        const iconSignal = settings.connect('changed::system-icon-name', () => this.updateIcon());
        this.item.cleanup.addSignal(settings, iconSignal);
        this.menuLifecycle = new PopupMenuLifecycle(new PopupMenu.PopupMenuManager(this.button));
    }

    private updateIcon(): void {
        const name = this.settings.get_string('system-icon-name') || 'view-app-grid-symbolic';
        this.button.set_child(new St.Icon({ icon_name: name, icon_size: this.iconSize,
            style_class: 'g-os-dock-system-icon' }));
        this.item.setIconPadding(this.settings, this.iconSize);
    }

    private showMenu(): void {
        if (this.destroyed) return;
        this.closeMenu();
        const side = getDockMenuSide(this.dockPosition());
        const menu = new PopupMenu.PopupMenu(this.button, 0.5, side);
        this.menu = menu;
        Main.uiGroup.add_child(menu.actor);
        this.menuLifecycle.track(menu);
        this.addItem(menu, 'System settings', () => {
            try { Gio.Subprocess.new(['gnome-control-center'], Gio.SubprocessFlags.NONE); }
            catch (error) { logError(error as Error, 'Unable to open GNOME Settings'); }
        });
        this.addItem(menu, 'Dock settings', () => Main.extensionManager.openExtensionPrefs(
            'g-os-dock@cgreg21.github.io', '', {}));
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.addItem(menu, 'Log out…', () => this.requestSessionAction(
            'Logout', new GLib.Variant('(u)', [0]),
        ));
        this.addItem(menu, 'Restart…', () => this.requestSessionAction('Reboot'));
        this.addItem(menu, 'Shut down…', () => this.requestSessionAction('Shutdown'));
        menu.open();
    }

    /** Ask GNOME SessionManager to show its normal end-session confirmation. */
    private requestSessionAction(method: string, parameters: GLib.Variant | null = null): void {
        Gio.DBus.session.call(
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager',
            'org.gnome.SessionManager',
            method,
            parameters,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (connection, result) => {
                if (!connection)
                    return;
                try {
                    connection.call_finish(result);
                } catch (error) {
                    logError(error as Error, 'Unable to request session action: ' + method);
                }
            },
        );
    }

    /** Close and dispose the current menu without re-entering its close handler. */
    private closeMenu(): void {
        const menu = this.menu;
        if (!menu)
            return;

        // Clear the reference before close(): open-state-changed may fire
        // synchronously and must not dispose this menu a second time.
        this.menu = null;
        this.menuLifecycle.dispose(menu);
    }

    private addItem(menu: PopupMenu.PopupMenu, label: string, action: () => void): void {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', action);
        menu.addMenuItem(item);
    }

    getActor(): St.Button { return this.button; }

    setIconSize(size: number): void {
        if (this.iconSize === size)
            return;
        this.iconSize = size;
        this.updateIcon();
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.closeMenu();
        this.item.destroy();
    }
}
