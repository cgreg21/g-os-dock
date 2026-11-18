import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { DockDragDrop } from './drag-and-drop.js';
import { DockTooltip } from './tooltip.js';

/** Configurable app-grid launcher and GNOME system actions. */
export class DockSystemItem {
    private button: St.Button;
    private menuManager: PopupMenu.PopupMenuManager;
    private menu: PopupMenu.PopupMenu | null = null;
    private iconSignal = 0;
    private destroyed = false;

    constructor(private content: St.BoxLayout, private settings: Gio.Settings,
        private iconSize: number, private dockPosition: () => string,
        private dragDrop: DockDragDrop) {
        this.button = new St.Button({
            style_class: 'g-os-dock-item g-os-dock-system-item', reactive: true,
            can_focus: true, track_hover: true, x_expand: false, y_expand: false,
            accessible_name: 'Applications and system actions',
        });
        this.updateIcon();
        new DockTooltip(this.button, 'Applications', this.dockPosition());
        this.button.connect('clicked', () => Main.overview.toggleApps());
        this.button.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 3) return Clutter.EVENT_PROPAGATE;
            this.showMenu();
            return Clutter.EVENT_STOP;
        });
        this.iconSignal = settings.connect('changed::system-icon-name', () => this.updateIcon());
        this.menuManager = new PopupMenu.PopupMenuManager(this.button);
        // Register only after parenting: GNOME's draggable setup expects the
        // source actor to belong to the live dock hierarchy.
        this.content.add_child(this.button);
        dragDrop.registerItem({ id: 'system:launcher', actor: this.button });
    }

    private updateIcon(): void {
        const name = this.settings.get_string('system-icon-name') || 'view-app-grid-symbolic';
        this.button.set_child(new St.Icon({ icon_name: name, icon_size: this.iconSize,
            style_class: 'g-os-dock-system-icon' }));
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

    private showMenu(): void {
        if (this.destroyed) return;
        if (this.menu) {
            this.menu.close();
            this.menuManager.removeMenu(this.menu);
            this.menu.destroy();
        }
        const position = this.dockPosition();
        const side = position === 'top' ? St.Side.BOTTOM : position === 'bottom' ? St.Side.TOP :
            position === 'left' ? St.Side.RIGHT : St.Side.LEFT;
        const menu = new PopupMenu.PopupMenu(this.button, 0.5, side);
        this.menu = menu;
        Main.uiGroup.add_child(menu.actor);
        this.menuManager.addMenu(menu);
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
        menu.connect('open-state-changed', (_menu, open) => {
            if (!open && this.menu === menu) {
                this.menu = null;
                this.menuManager.removeMenu(menu);
                menu.destroy();
            }
        });
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

    private addItem(menu: PopupMenu.PopupMenu, label: string, action: () => void): void {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', action);
        menu.addMenuItem(item);
    }

    getActor(): St.Button { return this.button; }

    setIconSize(size: number): void { this.iconSize = size; this.updateIcon(); }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.iconSignal) this.settings.disconnect(this.iconSignal);
        this.dragDrop.unregisterItem(this.button);
        if (this.menu) {
            this.menu.close();
            this.menuManager.removeMenu(this.menu);
            this.menu.destroy();
            this.menu = null;
        }
        this.button.destroy();
    }
}
