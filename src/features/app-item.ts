import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import { DockDragDrop } from './drag-and-drop.js';
import { WindowPreviews } from './window-previews/index.js';
import { AppContextMenu } from './context-menu/index.js';
import { DockTooltip } from './tooltip.js';

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
    activateApp: (app: Shell.App) => void;
    handleKeyPress: (item: DockAppButton, event: Clutter.Event) => boolean;
    dockPosition: () => string;
    settings: Gio.Settings;
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
        const iconLayout = new Clutter.FixedLayout();
        const iconContainer = new St.Widget({
            layout_manager: iconLayout,
            x_expand: false,
            y_expand: false,
        });
        iconContainer.set_size(size, size);
        const icon = app.create_icon_texture(size);
        icon.set_size(size, size);
        icon.set_position(0, 0);
        iconContainer.add_child(icon);
        content.add_child(iconContainer);

        // Keep the indicator overlaid and align it to the icon's bottom edge.
        const indicator = new St.BoxLayout({
            style_class: 'g-os-dock-running-indicator',
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: false,
            y_expand: false,
        });
        indicator.set_size(10, 5);
        indicator.set_position((size - 10) / 2, size - 5);
        iconContainer.add_child(indicator);

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
        const settings = this.dependencies.settings;
        const padTop = settings.get_int('icon-padding-top');
        const padRight = settings.get_int('icon-padding-right');
        const padBottom = settings.get_int('icon-padding-bottom');
        const padLeft = settings.get_int('icon-padding-left');
        item.set_style(
            `padding: ${padTop}px ${padRight}px ${padBottom}px ${padLeft}px; ` +
            `min-width: ${size + padLeft + padRight}px; ` +
            `min-height: ${size + padTop + padBottom}px;`,
        );
        new DockTooltip(item, app.get_name(), this.dependencies.dockPosition());

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
                    this.dependencies.previews.scheduleShow(app, item);
                } else {
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
