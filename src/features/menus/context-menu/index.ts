import St from 'gi://St?version=51';
import Shell from 'gi://Shell?version=51';
import Meta from 'gi://Meta?version=51';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { getDockMenuSide } from '../menu-position.js';
import { PopupMenuLifecycle } from '../popup-menu-lifecycle.js';

/** Keeps application context-menu construction and cleanup out of DockView. */
export class AppContextMenu {
    private lifecycle: PopupMenuLifecycle;
    private destroyed = false;

    constructor(
        actor: St.Widget,
        private favorites: ReturnType<typeof AppFavorites.getAppFavorites>,
        private dockPosition: () => string,
    ) {
        this.lifecycle = new PopupMenuLifecycle(new PopupMenu.PopupMenuManager(actor));
    }

    show(source: St.Widget, app: Shell.App): void {
        if (this.destroyed)
            return;

        const menu = new PopupMenu.PopupMenu(source, 0.5, getDockMenuSide(this.dockPosition()));
        Main.uiGroup.add_child(menu.actor);
        this.lifecycle.track(menu);
        const appInfo = app.get_app_info();
        const actions = appInfo?.list_actions() ?? [];
        if (actions.length > 0) {
            for (const action of actions) {
                const label = appInfo?.get_action_name(action) || action;
                const item = new PopupMenu.PopupMenuItem(label);
                item.connect('activate', () => {
                    try {
                        app.launch_action(
                            action,
                            global.get_current_time(),
                            global.workspace_manager.get_active_workspace_index(),
                        );
                    } catch (error) {
                        logError(error as Error, `Unable to launch application action: ${action}`);
                    }
                });
                menu.addMenuItem(item);
            }
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        const windows = app.get_windows();
        const open = new PopupMenu.PopupMenuItem('Open new window');
        open.connect('activate', () => app.open_new_window(global.get_current_time()));
        menu.addMenuItem(open);
        if (windows.length > 0) {
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const windowHeading = new PopupMenu.PopupMenuItem(`Windows (${windows.length})`);
            windowHeading.setSensitive(false);
            menu.addMenuItem(windowHeading);
            for (const [index, window] of windows.entries()) {
                let title = '';
                try { title = window.get_title() || ''; } catch (_error) { /* title unavailable */ }
                const label = title.trim() || `Window ${index + 1}`;
                const entry = new PopupMenu.PopupMenuItem(label.length > 48 ? `${label.slice(0, 45)}…` : label);
                entry.connect('activate', () => {
                    try { app.activate_window(window, global.get_current_time()); }
                    catch (_error) { window.activate(global.get_current_time()); }
                });
                menu.addMenuItem(entry);
            }
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const minimize = new PopupMenu.PopupMenuItem('Minimize all windows');
            minimize.connect('activate', () => windows.forEach((window: Meta.Window) => window.minimize()));
            menu.addMenuItem(minimize);
            const close = new PopupMenu.PopupMenuItem('Close all windows');
            close.connect('activate', () => windows.forEach((window: Meta.Window) => window.delete(global.get_current_time())));
            menu.addMenuItem(close);
        }
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const appId = app.get_id();
        const favorite = this.favorites.isFavorite(appId);
        const pin = new PopupMenu.PopupMenuItem(favorite ? 'Remove from favorites' : 'Add to favorites');
        pin.connect('activate', () => favorite
            ? this.favorites.removeFavorite(appId)
            : this.favorites.addFavorite(appId));
        menu.addMenuItem(pin);
        if (favorite) {
            const favoriteIds = this.favorites.getFavorites().map(entry => entry.get_id());
            const favoriteIndex = favoriteIds.indexOf(appId);
            const moveEarlier = new PopupMenu.PopupMenuItem('Move earlier in dock');
            moveEarlier.setSensitive(favoriteIndex > 0);
            moveEarlier.connect('activate', () => this.favorites.moveFavoriteToPos(appId, Math.max(0, favoriteIndex - 1)));
            menu.addMenuItem(moveEarlier);
            const moveLater = new PopupMenu.PopupMenuItem('Move later in dock');
            moveLater.setSensitive(favoriteIndex >= 0 && favoriteIndex < favoriteIds.length - 1);
            moveLater.connect('activate', () => this.favorites.moveFavoriteToPos(appId, Math.min(favoriteIds.length - 1, favoriteIndex + 1)));
            menu.addMenuItem(moveLater);
        }
        menu.open();
    }

    destroy(): void {
        if (this.destroyed)
            return;

        this.destroyed = true;
        this.lifecycle.destroy();
    }
}
