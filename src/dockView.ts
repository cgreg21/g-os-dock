import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import { AppContextMenu } from './appContextMenu.js';
import { DockDragDrop } from './features/drag-and-drop.js';
import { DockVisibility } from './features/visibility.js';
import { DockAppearance } from './features/appearance.js';
import { WindowPreviews } from './windowPreviews.js';

const EDGE_THICKNESS = 3;
const MAGNIFICATION_RADIUS = 2;
const MAGNIFICATION_FACTOR = 1.28;

export class DockView {
    private actor: any;
    private edgeSensor: any;
    private monitor: any;
    private monitorIndex: number;
    private settings: any;
    private desktopSettings: any;
    private desktopThemeSignal = 0;
    private appSystem: any;
    private favorites: any;
    private hoverSignal = 0;
    private sensorHoverSignal = 0;
    private settingsSignal = 0;
    private appStateSignal = 0;
    private favoritesSignal = 0;
    private focusSignal = 0;
    private restackedSignal = 0;
    private windowCreatedSignal = 0;
    private windowSignals: Array<{ window: any; ids: number[] }> = [];
    private destroyed = false;
    private contextMenu: AppContextMenu;
    private itemActors: any[] = [];
    private previews: WindowPreviews;
    private dragDrop: DockDragDrop;
    private visibility: DockVisibility;
    private appearance: DockAppearance;

    constructor(index: number, monitor: any, settings: any) {
        this.monitor = monitor;
        this.monitorIndex = index;
        this.settings = settings;
        this.desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this.desktopThemeSignal = this.desktopSettings.connect('changed::color-scheme', () => this.appearance.apply());
        this.appSystem = Shell.AppSystem.get_default();
        this.favorites = AppFavorites.getAppFavorites();
        this.actor = new St.BoxLayout({
            style_class: 'g-os-dock',
            orientation: Clutter.Orientation.HORIZONTAL,
            reactive: true,
            track_hover: true,
        });
        this.appearance = new DockAppearance(this.actor, this.settings, this.desktopSettings);
        this.contextMenu = new AppContextMenu(this.actor, this.favorites);
        this.dragDrop = new DockDragDrop(
            this.actor,
            this.settings,
            this.favorites,
            () => this.itemActors,
        );
        this.actor._delegate = this;
        this.previews = new WindowPreviews(
            this.settings,
            this.monitor,
            this.actor,
            () => this.destroyed,
        );
        this.edgeSensor = new St.Widget({
            style_class: 'g-os-dock-edge-sensor',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });
        this.visibility = new DockVisibility(
            this.actor,
            this.edgeSensor,
            this.settings,
            this.monitorIndex,
            () => this.destroyed,
        );

        Main.layoutManager.addChrome(this.actor, { affectsStruts: false, trackFullscreen: false });
        Main.layoutManager.addChrome(this.edgeSensor, { affectsStruts: false, trackFullscreen: false });
        this.hoverSignal = this.actor.connect('notify::hover', () => this.onPointerChanged());
        this.sensorHoverSignal = this.edgeSensor.connect('notify::hover', () => {
            if (this.edgeSensor.hover)
                this.visibility.show();
        });
        this.settingsSignal = this.settings.connect('changed', () => this.applySettings());
        this.appStateSignal = this.appSystem.connect('app-state-changed', () => this.refresh());
        this.favoritesSignal = this.favorites.connect('changed', () => this.refresh());
        this.focusSignal = global.display.connect('notify::focus-window', () => { this.updateIndicators(); this.visibility.queueSmartHideCheck(); });
        this.restackedSignal = global.display.connect('restacked', () => this.visibility.queueSmartHideCheck());
        this.windowCreatedSignal = global.display.connect('window-created', (_display: any, window: any) => this.trackWindow(window));
        this.trackExistingWindows();
        this.refresh();
        this.applySettings();
    }


    handleDragOver(source: any, dragActor: any, x: number, y: number, time: number): number {
        return this.dragDrop.handleDragOver(source, dragActor, x, y, time);
    }

    acceptDrop(source: any, dragActor: any, x: number, y: number, time: number): boolean {
        return this.dragDrop.acceptDrop(source, dragActor, x, y, time);
    }

    private getApplications(): any[] {
        const favorites = this.favorites.getFavorites();
        const running = this.appSystem.get_running();
        const result: any[] = [];
        const seen = new Set<string>();
        for (const app of [...favorites, ...running]) {
            const id = app.get_id();
            if (id && !seen.has(id)) {
                seen.add(id);
                result.push(app);
            }
        }
        return result;
    }

    private refresh(): void {
        if (this.destroyed)
            return;
        this.previews.hide();
        this.previews.cancelPending();
        this.dragDrop.clearDropTarget();
        for (const child of this.actor.get_children())
            child.destroy();
        this.itemActors = [];
        const size = this.settings.get_int('icon-size');
        for (const app of this.getApplications()) {
            const item = this.createItem(app, size);
            this.itemActors.push(item);
            this.actor.add_child(item);
        }
        this.appearance.apply();
        this.position();
        this.applyMagnification(-1, false);
        this.updateIndicators();
        this.visibility.queueSmartHideCheck();
    }

    private focusItem(index: number): void {
        if (this.itemActors.length === 0)
            return;
        const normalized = (index + this.itemActors.length) % this.itemActors.length;
        this.visibility.show();
        this.itemActors[normalized].grab_key_focus();
        this.applyMagnification(normalized, true);
    }

    private handleItemKeyPress(item: any, event: any): number {
        const key = event.get_key_symbol();
        const vertical = ['left', 'right'].includes(this.settings.get_string('dock-position'));
        const previousKey = vertical ? Clutter.KEY_Up : Clutter.KEY_Left;
        const nextKey = vertical ? Clutter.KEY_Down : Clutter.KEY_Right;
        const index = this.itemActors.indexOf(item);
        if (index < 0)
            return Clutter.EVENT_PROPAGATE;

        if (key === previousKey) {
            this.focusItem(index - 1);
            return Clutter.EVENT_STOP;
        }
        if (key === nextKey) {
            this.focusItem(index + 1);
            return Clutter.EVENT_STOP;
        }

        // Open the window switcher with the key pointing into the dock.
        const inwardKey = this.settings.get_string('dock-position') === 'top'
            ? Clutter.KEY_Down
            : this.settings.get_string('dock-position') === 'bottom'
                ? Clutter.KEY_Up
                : this.settings.get_string('dock-position') === 'left'
                    ? Clutter.KEY_Right
                    : Clutter.KEY_Left;
        if (key === inwardKey) {
            this.previews.show(item._gOsDockApp, item, true);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Home) {
            this.focusItem(0);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_End) {
            this.focusItem(this.itemActors.length - 1);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Escape) {
            this.previews.hide();
            this.applyMagnification(-1, false);
            item.grab_key_focus();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    private createItem(app: any, size: number): any {
        const item = new St.Button({
            style_class: 'g-os-dock-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: app.create_icon_texture(size),
            tooltip_text: app.get_name(),
            accessible_name: app.get_name(),
            x_expand: false,
            y_expand: false,
        });
        const icon = item.get_child();
        icon.set_size(size, size);
        // Keep the application reference on its actor so focus/window changes
        // can update badges without rebuilding the whole dock.
        item._gOsDockApp = app;
        if (this.favorites.isFavorite(app.get_id())) {
            this.dragDrop.makeFavoriteDraggable(item, app, () => this.previews.hide());
        }
        item.connect('clicked', () => this.activateApp(app));
        item.connect('key-press-event', (_actor: any, event: any) =>
            this.handleItemKeyPress(item, event));
        item.connect('notify::hover', () => {
            if (item.hover) {
                const index = this.itemActors.indexOf(item);
                this.applyMagnification(index, true);
                this.previews.scheduleShow(app, item);
            } else {
                if (!this.actor.hover)
                    this.applyMagnification(-1, false);
                this.previews.scheduleHide();
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
                this.contextMenu.show(item, app);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        const indicator = new St.Widget({ style_class: 'g-os-dock-running-indicator' });
        item.add_child(indicator);
        const badge = new St.Label({ style_class: 'g-os-dock-window-count' });
        item.add_child(badge);
        item._gOsDockIndicator = indicator;
        item._gOsDockBadge = badge;
        return item;
    }

    private updateIndicators(): void {
        if (this.destroyed)
            return;
        const focused = global.display.focus_window;
        const showRunning = this.settings.get_boolean('show-running-indicator');
        const showCount = this.settings.get_boolean('show-window-count');
        for (const item of this.itemActors) {
            const app = item._gOsDockApp;
            if (!app)
                continue;
            const windows = app.get_windows();
            const running = windows.length > 0 || app.get_state() === Shell.AppState.RUNNING;
            const active = !!focused && windows.includes(focused);
            if (item._gOsDockIndicator) {
                item._gOsDockIndicator.visible = showRunning && running;
                item._gOsDockIndicator.remove_style_class_name('active');
                if (active)
                    item._gOsDockIndicator.add_style_class_name('active');
            }
            if (item._gOsDockBadge) {
                const count = windows.length;
                item._gOsDockBadge.text = showCount && count > 1 ? String(count) : '';
                item._gOsDockBadge.visible = showCount && count > 1;
            }
            item.remove_style_class_name('active');
            if (active)
                item.add_style_class_name('active');
        }
    }

    private trackExistingWindows(): void {
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        for (const window of windows)
            this.trackWindow(window);
    }

    private trackWindow(window: any): void {
        if (!window || this.windowSignals.some(entry => entry.window === window))
            return;
        const ids: number[] = [];
        for (const signal of ['position-changed', 'size-changed', 'unmanaged']) {
            try {
                ids.push(window.connect(signal, () => {
                    if (signal === 'unmanaged')
                        this.untrackWindow(window);
                    this.visibility.queueSmartHideCheck();
                }));
            } catch (_error) {
                // Some special window types do not expose every geometry signal.
            }
        }
        this.windowSignals.push({ window, ids });
    }

    private untrackWindow(window: any): void {
        const index = this.windowSignals.findIndex(entry => entry.window === window);
        if (index < 0)
            return;
        const [entry] = this.windowSignals.splice(index, 1);
        for (const id of entry.ids) {
            try { entry.window.disconnect(id); } catch (_error) { /* already disposed */ }
        }
    }

    private activateApp(app: any): void {
        const windows = app.get_windows();
        if (windows.length > 0) {
            const focused = global.display.focus_window;
            const next = windows.find((window: any) => window !== focused) ?? windows[0];
            app.activate_window(next, global.get_current_time());
        } else {
            app.activate();
        }
    }

    private applyMagnification(index: number, enabled: boolean): void {
        const base = this.settings.get_int('icon-size');
        this.itemActors.forEach((item, i) => {
            const distance = Math.abs(i - index);
            const factor = enabled && distance <= MAGNIFICATION_RADIUS
                ? 1 + (MAGNIFICATION_FACTOR - 1) * (1 - distance / (MAGNIFICATION_RADIUS + 1))
                : 1;
            const size = Math.round(base * factor);
            const icon = item.get_child();
            if (icon)
                icon.ease({ width: size, height: size, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        });
        this.position();
    }

    private applySettings(): void {
        if (this.destroyed)
            return;
        this.refresh();
        this.position();
        this.visibility.applySettings();

        const autoHide = this.settings.get_boolean('auto-hide');
        const smartHide = this.settings.get_boolean('smart-hide');
        if (autoHide || smartHide) {
            this.edgeSensor.show();
            this.positionSensor();
        } else {
            this.edgeSensor.hide();
        }
    }

    private position(): void {
        if (this.destroyed)
            return;
        const position = this.settings.get_string('dock-position');
        const vertical = position === 'left' || position === 'right';
        this.actor.set_vertical(vertical);
        const [minWidth, naturalWidth] = this.actor.get_preferred_width(-1);
        const [minHeight, naturalHeight] = this.actor.get_preferred_height(-1);
        const width = Math.max(minWidth, naturalWidth);
        const height = Math.max(minHeight, naturalHeight);
        let x = this.monitor.x + Math.round((this.monitor.width - width) / 2);
        let y = this.monitor.y + this.monitor.height - height - 12;
        if (position === 'top')
            y = this.monitor.y + 12;
        else if (position === 'left') {
            x = this.monitor.x + 12;
            y = this.monitor.y + Math.round((this.monitor.height - height) / 2);
        } else if (position === 'right') {
            x = this.monitor.x + this.monitor.width - width - 12;
            y = this.monitor.y + Math.round((this.monitor.height - height) / 2);
        }
        this.actor.set_position(x, y);
        this.positionSensor();
    }

    private positionSensor(): void {
        if (!this.edgeSensor || this.destroyed)
            return;
        const position = this.settings.get_string('dock-position');
        if (position === 'top') {
            this.edgeSensor.set_position(this.monitor.x, this.monitor.y);
            this.edgeSensor.set_size(this.monitor.width, EDGE_THICKNESS);
        } else if (position === 'left') {
            this.edgeSensor.set_position(this.monitor.x, this.monitor.y);
            this.edgeSensor.set_size(EDGE_THICKNESS, this.monitor.height);
        } else if (position === 'right') {
            this.edgeSensor.set_position(this.monitor.x + this.monitor.width - EDGE_THICKNESS, this.monitor.y);
            this.edgeSensor.set_size(EDGE_THICKNESS, this.monitor.height);
        } else {
            this.edgeSensor.set_position(this.monitor.x, this.monitor.y + this.monitor.height - EDGE_THICKNESS);
            this.edgeSensor.set_size(this.monitor.width, EDGE_THICKNESS);
        }
    }

    private onPointerChanged(): void {
        this.visibility.onPointerChanged();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.visibility.destroy();
        this.previews.destroy();
        if (this.hoverSignal) this.actor.disconnect(this.hoverSignal);
        if (this.sensorHoverSignal) this.edgeSensor.disconnect(this.sensorHoverSignal);
        if (this.settingsSignal) this.settings.disconnect(this.settingsSignal);
        if (this.desktopThemeSignal) this.desktopSettings.disconnect(this.desktopThemeSignal);
        if (this.appStateSignal) this.appSystem.disconnect(this.appStateSignal);
        if (this.favoritesSignal) this.favorites.disconnect(this.favoritesSignal);
        if (this.focusSignal) global.display.disconnect(this.focusSignal);
        if (this.restackedSignal) global.display.disconnect(this.restackedSignal);
        if (this.windowCreatedSignal) global.display.disconnect(this.windowCreatedSignal);
        for (const entry of [...this.windowSignals]) this.untrackWindow(entry.window);
        this.contextMenu.destroy();
        this.dragDrop.destroy();
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager.removeChrome(this.edgeSensor);
        this.actor.destroy();
        this.edgeSensor.destroy();
    }
}
