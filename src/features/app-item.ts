import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import { DockDragDrop } from './drag-and-drop.js';
import { WindowPreviews } from './window-previews/index.js';
import { AppContextMenu } from './context-menu/index.js';

export type DockAppButton = St.Button & {
    _gOsDockApp: Shell.App;
    _gOsDockIndicator: St.Widget;
    _gOsDockBadge: St.Label;
};

interface DockAppItemDependencies {
    favorites: ReturnType<typeof AppFavorites.getAppFavorites>;
    dragDrop: DockDragDrop;
    previews: WindowPreviews;
    contextMenu: AppContextMenu;
    getItems: () => DockAppButton[];
    isDockHovered: () => boolean;
    activateApp: (app: Shell.App) => void;
    handleKeyPress: (item: DockAppButton, event: Clutter.Event) => boolean;
    magnify: (index: number, enabled: boolean) => void;
}

/** Builds one interactive application button for the dock. */
export class DockAppItemFactory {
    constructor(private dependencies: DockAppItemDependencies) {}

    create(app: Shell.App, size: number): DockAppButton {
        // St.Button is a single-child container. Keep the icon and its
        // indicator/badge inside one content box instead of adding siblings
        // directly to the button (which throws and aborts extension startup).
        const content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: false,
            y_expand: false,
        });
        const icon = app.create_icon_texture(size);
        icon.set_size(size, size);
        content.add_child(icon);

        const item = new St.Button({
            style_class: 'g-os-dock-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: content,
            accessible_name: app.get_name(),
            x_expand: false,
            y_expand: false,
        }) as DockAppButton;

        try {
            item._gOsDockApp = app;

            if (this.dependencies.favorites.isFavorite(app.get_id())) {
                this.dependencies.dragDrop.makeFavoriteDraggable(
                    item,
                    app,
                    () => this.dependencies.previews.hide(),
                );
            }

            item.connect('clicked', () => this.dependencies.activateApp(app));
            item.connect('key-press-event', (_actor: St.Button, event: Clutter.Event) =>
                this.dependencies.handleKeyPress(item, event));

            item.connect('notify::hover', () => {
                if (item.hover) {
                    const index = this.dependencies.getItems().indexOf(item);
                    this.dependencies.magnify(index, true);
                    this.dependencies.previews.scheduleShow(app, item);
                } else {
                    if (!this.dependencies.isDockHovered())
                        this.dependencies.magnify(-1, false);
                    this.dependencies.previews.scheduleHide();
                }
            });

            item.connect('scroll-event', (_actor: St.Button, event: Clutter.Event) => {
                const direction = event.get_scroll_direction();
                if (direction !== Clutter.ScrollDirection.UP &&
                    direction !== Clutter.ScrollDirection.DOWN)
                    return Clutter.EVENT_PROPAGATE;

                const windows = app.get_windows();
                if (windows.length < 2)
                    return Clutter.EVENT_PROPAGATE;

                const focused = global.display.focus_window;
                const currentIndex = windows.indexOf(focused);
                const step = direction === Clutter.ScrollDirection.UP ? -1 : 1;
                const nextIndex = currentIndex < 0
                    ? (step > 0 ? 0 : windows.length - 1)
                    : (currentIndex + step + windows.length) % windows.length;
                const nextWindow = windows[nextIndex];
                if (nextWindow)
                    app.activate_window(nextWindow, global.get_current_time());
                return Clutter.EVENT_STOP;
            });

            item.connect('button-press-event', (_actor: St.Button, event: Clutter.Event) => {
                const button = event.get_button();
                if (button === 2) {
                    app.open_new_window(global.get_current_time());
                    return Clutter.EVENT_STOP;
                }
                if (button === 3) {
                    this.dependencies.contextMenu.show(item, app);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });

            const indicator = new St.Widget({ style_class: 'g-os-dock-running-indicator' });
            content.add_child(indicator);
            const badge = new St.Label({ style_class: 'g-os-dock-window-count' });
            content.add_child(badge);
            item._gOsDockIndicator = indicator;
            item._gOsDockBadge = badge;
            return item;
        } catch (error) {
            this.dependencies.dragDrop.release(item);
            item.destroy();
            throw error;
        }
    }
}
