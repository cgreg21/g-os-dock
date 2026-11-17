import St from 'gi://St';
import Clutter from 'gi://Clutter';

interface DockAppItemDependencies {
    favorites: any;
    dragDrop: any;
    previews: any;
    contextMenu: any;
    getItems: () => any[];
    isDockHovered: () => boolean;
    activateApp: (app: any) => void;
    handleKeyPress: (item: any, event: any) => number;
    magnify: (index: number, enabled: boolean) => void;
}

/** Builds one interactive application button for the dock. */
export class DockAppItemFactory {
    constructor(private dependencies: DockAppItemDependencies) {}

    create(app: any, size: number): any {
        // St.Button is a single-child container. Keep the icon and its
        // indicator/badge inside one content box instead of adding siblings
        // directly to the button (which throws and aborts extension startup).
        const content = new St.BoxLayout({
            vertical: true,
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
            tooltip_text: app.get_name(),
            accessible_name: app.get_name(),
            x_expand: false,
            y_expand: false,
        });
        item._gOsDockApp = app;

        if (this.dependencies.favorites.isFavorite(app.get_id())) {
            this.dependencies.dragDrop.makeFavoriteDraggable(
                item,
                app,
                () => this.dependencies.previews.hide(),
            );
        }

        item.connect('clicked', () => this.dependencies.activateApp(app));
        item.connect('key-press-event', (_actor: any, event: any) =>
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

        item.connect('scroll-event', (_actor: any, event: any) => {
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
            app.activate_window(windows[nextIndex], global.get_current_time());
            return Clutter.EVENT_STOP;
        });

        item.connect('button-press-event', (_actor: any, event: any) => {
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
    }
}
