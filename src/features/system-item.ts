import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

/** Configurable app-grid launcher and GNOME system actions. */
export class DockSystemItem {
    private button: St.Button;
    private menuManager: PopupMenu.PopupMenuManager;
    private menu: PopupMenu.PopupMenu | null = null;
    private iconSignal = 0;
    private destroyed = false;
    private draggable: DND.Draggable;

    constructor(private content: St.BoxLayout, private settings: Gio.Settings,
        private iconSize: number, private dockPosition: () => string) {
        this.button = new St.Button({
            style_class: 'g-os-dock-item g-os-dock-system-item', reactive: true,
            can_focus: true, track_hover: true, x_expand: false, y_expand: false,
            accessible_name: 'Applications and system actions',
        });
        this.updateIcon();
        this.button.connect('clicked', () => Main.overview.showApps());
        this.button.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 3) return Clutter.EVENT_PROPAGATE;
            this.showMenu();
            return Clutter.EVENT_STOP;
        });
        (this.button as St.Button & { _delegate?: unknown })._delegate = {
            systemItem: true,
            actor: this.button,
            getDragActor: () => new Clutter.Clone({ source: this.button }),
            getDragActorSource: () => this.button,
        };
        this.draggable = DND.makeDraggable(this.button, { dragActorOpacity: 210 });
        this.draggable.connect('drag-begin', () => this.button.add_style_class_name('dragging'));
        this.draggable.connect('drag-end', () => this.button.remove_style_class_name('dragging'));
        this.draggable.connect('drag-cancelled', () => this.button.remove_style_class_name('dragging'));
        this.iconSignal = settings.connect('changed::system-icon-name', () => this.updateIcon());
        this.menuManager = new PopupMenu.PopupMenuManager(this.button);
        this.content.add_child(this.button);
    }

    private updateIcon(): void {
        const name = this.settings.get_string('system-icon-name') || 'view-app-grid-symbolic';
        this.button.set_child(new St.Icon({ icon_name: name, icon_size: this.iconSize,
            style_class: 'g-os-dock-system-icon' }));
        this.button.set_style('min-width: ' + (this.iconSize + 8) + 'px; min-height: ' +
            (this.iconSize + 8) + 'px;');
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
            catch (error) { logError(error, 'Unable to open GNOME Settings'); }
        });
        this.addItem(menu, 'Dock settings', () => Main.extensionManager.openExtensionPrefs(
            'g-os-dock@cgreg21.github.io', '', {}));
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.addItem(menu, 'Log out…', () => Main.systemActions.activateLogout());
        this.addItem(menu, 'Restart…', () => Main.systemActions.activateReboot());
        this.addItem(menu, 'Shut down…', () => Main.systemActions.activatePowerOff());
        menu.connect('open-state-changed', (_menu, open) => {
            if (!open && this.menu === menu) {
                this.menu = null;
                this.menuManager.removeMenu(menu);
                menu.destroy();
            }
        });
        menu.open();
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
        if (this.menu) {
            this.menu.close();
            this.menuManager.removeMenu(this.menu);
            this.menu.destroy();
            this.menu = null;
        }
        this.button.destroy();
    }
}
