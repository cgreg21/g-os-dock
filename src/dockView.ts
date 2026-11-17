import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

const HIDE_DELAY_MS = 650;
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
    private smartHideSource = 0;
    private hideSource = 0;
    private destroyed = false;
    private menuManager: any;
    private itemActors: any[] = [];
    private menus: any[] = [];
    private previewActor: any = null;
    private previewSource = 0;
    private previewHideSource = 0;
    private previewHoverSignal = 0;

    constructor(index: number, monitor: any, settings: any) {
        this.monitor = monitor;
        this.monitorIndex = index;
        this.settings = settings;
        this.desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this.desktopThemeSignal = this.desktopSettings.connect('changed::color-scheme', () => this.applyStyle());
        this.appSystem = Shell.AppSystem.get_default();
        this.favorites = AppFavorites.getAppFavorites();
        this.actor = new St.BoxLayout({
            style_class: 'g-os-dock',
            orientation: Clutter.Orientation.HORIZONTAL,
            reactive: true,
            track_hover: true,
        });
        this.menuManager = new PopupMenu.PopupMenuManager(this.actor);
        this.actor._delegate = this;
        this.edgeSensor = new St.Widget({
            style_class: 'g-os-dock-edge-sensor',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        Main.layoutManager.addChrome(this.actor, { affectsStruts: false, trackFullscreen: false });
        Main.layoutManager.addChrome(this.edgeSensor, { affectsStruts: false, trackFullscreen: false });
        this.hoverSignal = this.actor.connect('notify::hover', () => this.onPointerChanged());
        this.sensorHoverSignal = this.edgeSensor.connect('notify::hover', () => {
            if (this.edgeSensor.hover)
                this.show();
        });
        this.settingsSignal = this.settings.connect('changed', () => this.applySettings());
        this.appStateSignal = this.appSystem.connect('app-state-changed', () => this.refresh());
        this.favoritesSignal = this.favorites.connect('changed', () => this.refresh());
        this.focusSignal = global.display.connect('notify::focus-window', () => { this.updateIndicators(); this.queueSmartHideCheck(); });
        this.restackedSignal = global.display.connect('restacked', () => this.queueSmartHideCheck());
        this.windowCreatedSignal = global.display.connect('window-created', (_display: any, window: any) => this.trackWindow(window));
        this.trackExistingWindows();
        this.refresh();
        this.applySettings();
    }


    handleDragOver(source: any, _dragActor: any, _x: number, _y: number, _time: number): number {
        if (!source?.app || !this.favorites.isFavorite(source.app.get_id()))
            return DND.DragMotionResult.NO_DROP;
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source: any, _dragActor: any, x: number, y: number, _time: number): boolean {
        if (!source?.app)
            return false;
        const appId = source.app.get_id();
        if (!this.favorites.isFavorite(appId))
            return false;

        const vertical = ['left', 'right'].includes(this.settings.get_string('dock-position'));
        const coordinate = vertical ? y : x;
        const favorites = this.favorites.getFavorites();
        const targetItems = this.itemActors.filter(item =>
            item._gOsDockApp &&
            item._gOsDockApp.get_id() !== appId &&
            this.favorites.isFavorite(item._gOsDockApp.get_id()));

        let targetIndex = 0;
        for (const item of targetItems) {
            const [itemX, itemY] = item.get_transformed_position();
            const [valid, localX, localY] = this.actor.transform_stage_point(
                itemX + item.width / 2, itemY + item.height / 2);
            if (!valid)
                continue;
            const midpoint = vertical ? localY : localX;
            if (coordinate > midpoint)
                targetIndex++;
        }

        targetIndex = Math.max(0, Math.min(targetIndex, favorites.length - 1));
        const currentIndex = favorites.findIndex((app: any) => app.get_id() === appId);
        if (currentIndex >= 0 && currentIndex !== targetIndex)
            this.favorites.moveFavoriteToPos(appId, targetIndex);
        return true;
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
        this.hideWindowPreviews();
        if (this.previewSource) {
            GLib.source_remove(this.previewSource);
            this.previewSource = 0;
        }
        if (this.previewHideSource) {
            GLib.source_remove(this.previewHideSource);
            this.previewHideSource = 0;
        }
        for (const child of this.actor.get_children())
            child.destroy();
        this.itemActors = [];
        const size = this.settings.get_int('icon-size');
        for (const app of this.getApplications()) {
            const item = this.createItem(app, size);
            this.itemActors.push(item);
            this.actor.add_child(item);
        }
        this.applyStyle();
        this.position();
        this.applyMagnification(-1, false);
        this.updateIndicators();
        this.queueSmartHideCheck();
    }

    private createItem(app: any, size: number): any {
        const item = new St.Button({
            style_class: 'g-os-dock-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: app.create_icon_texture(size),
            tooltip_text: app.get_name(),
            x_expand: false,
            y_expand: false,
        });
        const icon = item.get_child();
        icon.set_size(size, size);
        // Keep the application reference on its actor so focus/window changes
        // can update badges without rebuilding the whole dock.
        item._gOsDockApp = app;
        item._delegate = {
            app,
            actor: item,
            getDragActor: () => new Clutter.Clone({ source: item }),
            getDragActorSource: () => item,
        };
        item._gOsDockDraggable = DND.makeDraggable(item, { dragActorOpacity: 210 });
        item._gOsDockDraggable.connect('drag-begin', () => {
            this.hideWindowPreviews();
            item.add_style_class_name('dragging');
        });
        item._gOsDockDraggable.connect('drag-end', () => item.remove_style_class_name('dragging'));
        item._gOsDockDraggable.connect('drag-cancelled', () => item.remove_style_class_name('dragging'));
        item.connect('clicked', () => this.activateApp(app));
        item.connect('notify::hover', () => {
            if (item.hover) {
                const index = this.itemActors.indexOf(item);
                this.applyMagnification(index, true);
                this.schedulePreview(app, item);
            } else {
                if (!this.actor.hover)
                    this.applyMagnification(-1, false);
                this.schedulePreviewHide();
            }
        });
        item.connect('button-press-event', (_actor: any, event: any) => {
            if (event.get_button() === 3) {
                this.openContextMenu(item, app);
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

    private schedulePreview(app: any, item: any): void {
        if (!this.settings.get_boolean('show-window-previews'))
            return;
        if (this.previewSource)
            GLib.source_remove(this.previewSource);
        if (this.previewHideSource) {
            GLib.source_remove(this.previewHideSource);
            this.previewHideSource = 0;
        }
        this.previewSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 320, () => {
            this.previewSource = 0;
            if (!this.destroyed && item.hover)
                this.showWindowPreviews(app, item);
            return GLib.SOURCE_REMOVE;
        });
    }

    private schedulePreviewHide(): void {
        if (this.previewSource) {
            GLib.source_remove(this.previewSource);
            this.previewSource = 0;
        }
        if (this.previewHideSource)
            GLib.source_remove(this.previewHideSource);
        this.previewHideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 260, () => {
            this.previewHideSource = 0;
            if (!this.destroyed && !this.actor.hover && !this.previewActor?.hover)
                this.hideWindowPreviews();
            return GLib.SOURCE_REMOVE;
        });
    }

    private showWindowPreviews(app: any, item: any): void {
        if (!this.settings.get_boolean('show-window-previews'))
            return;
        this.hideWindowPreviews();
        const windows = app.get_windows();
        if (windows.length === 0)
            return;

        const verticalDock = ['left', 'right'].includes(this.settings.get_string('dock-position'));
        const previews = new St.BoxLayout({
            style_class: 'g-os-dock-previews',
            vertical: verticalDock,
            reactive: true,
            track_hover: true,
            x_expand: false,
            y_expand: false,
        });
        previews.set_style('spacing: 8px; padding: 8px; border-radius: 14px; background-color: rgba(24,26,33,0.96); border: 1px solid rgba(255,255,255,0.18);');
        for (const [index, window] of windows.entries()) {
            const card = new St.Button({
                style_class: 'g-os-dock-preview-card',
                reactive: true,
                can_focus: true,
                track_hover: true,
                x_expand: false,
                y_expand: false,
            });
            card.set_style('padding: 6px; border-radius: 9px; background-color: rgba(255,255,255,0.07);');
            const content = new St.BoxLayout({ vertical: true, style: 'spacing: 5px;' });
            let compositorActor: any = null;
            try { compositorActor = window.get_compositor_private(); } catch (_error) { /* unavailable */ }
            if (compositorActor && !window.minimized) {
                const clone = new Clutter.Clone({ source: compositorActor });
                clone.set_size(176, 104);
                const thumbnail = new St.Bin({
                    style_class: 'g-os-dock-preview-thumbnail',
                    width: 176,
                    height: 104,
                    child: clone,
                });
                content.add_child(thumbnail);
            } else {
                const fallback = app.create_icon_texture(56);
                const placeholder = new St.Bin({
                    width: 176,
                    height: 104,
                    child: fallback,
                });
                content.add_child(placeholder);
            }
            let title = '';
            try { title = window.get_title() || ''; } catch (_error) { /* title unavailable */ }
            const label = new St.Label({
                text: (title.trim() || `Window ${index + 1}`).slice(0, 42),
                style: 'max-width: 176px;',
                x_align: Clutter.ActorAlign.CENTER,
            });
            content.add_child(label);
            card.set_child(content);
            card.connect('clicked', () => {
                try { app.activate_window(window, global.get_current_time()); }
                catch (_error) { window.activate(global.get_current_time()); }
                this.hideWindowPreviews();
            });
            previews.add_child(card);
        }

        Main.layoutManager.addChrome(previews, { affectsStruts: false, trackFullscreen: false });
        this.previewActor = previews;
        this.previewHoverSignal = previews.connect('notify::hover', () => {
            if (!previews.hover)
                this.schedulePreviewHide();
            else if (this.previewHideSource) {
                GLib.source_remove(this.previewHideSource);
                this.previewHideSource = 0;
            }
        });
        const [itemX, itemY] = item.get_transformed_position();
        const itemWidth = item.width;
        const itemHeight = item.height;
        const [previewMinWidth, previewNaturalWidth] = previews.get_preferred_width(-1);
        const [previewMinHeight, previewNaturalHeight] = previews.get_preferred_height(-1);
        const previewWidth = Math.max(previewMinWidth, previewNaturalWidth);
        const previewHeight = Math.max(previewMinHeight, previewNaturalHeight);
        const position = this.settings.get_string('dock-position');
        let x = itemX + itemWidth / 2 - previewWidth / 2;
        let y = itemY - previewHeight - 12;
        if (position === 'top')
            y = itemY + itemHeight + 12;
        else if (position === 'left') {
            x = itemX + itemWidth + 12;
            y = itemY + itemHeight / 2 - previewHeight / 2;
        } else if (position === 'right') {
            x = itemX - previewWidth - 12;
            y = itemY + itemHeight / 2 - previewHeight / 2;
        }
        x = Math.max(this.monitor.x + 8, Math.min(x, this.monitor.x + this.monitor.width - previewWidth - 8));
        y = Math.max(this.monitor.y + 8, Math.min(y, this.monitor.y + this.monitor.height - previewHeight - 8));
        previews.set_position(Math.round(x), Math.round(y));
        previews.show();
    }

    private hideWindowPreviews(): void {
        if (this.previewActor) {
            if (this.previewHoverSignal) {
                try { this.previewActor.disconnect(this.previewHoverSignal); } catch (_error) { /* already destroyed */ }
            }
            Main.layoutManager.removeChrome(this.previewActor);
            this.previewActor.destroy();
            this.previewActor = null;
            this.previewHoverSignal = 0;
        }
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
                    this.queueSmartHideCheck();
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

    private queueSmartHideCheck(): void {
        if (this.destroyed || !this.settings.get_boolean('smart-hide'))
            return;
        if (this.smartHideSource)
            GLib.source_remove(this.smartHideSource);
        this.smartHideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            this.smartHideSource = 0;
            this.checkWindowOverlap();
            return GLib.SOURCE_REMOVE;
        });
    }

    private checkWindowOverlap(): void {
        if (this.destroyed || !this.settings.get_boolean('smart-hide'))
            return;
        const [dockX, dockY] = this.actor.get_transformed_position();
        const dockRect = {
            x: dockX, y: dockY,
            width: this.actor.width, height: this.actor.height,
        };
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        const overlaps = windows.some((window: any) => {
            if (!window || window.minimized || window.get_monitor() !== this.monitorIndex)
                return false;
            const type = window.get_window_type();
            if (type !== Meta.WindowType.NORMAL && type !== Meta.WindowType.DIALOG && type !== Meta.WindowType.MODAL_DIALOG)
                return false;
            const rect = window.get_frame_rect();
            return rect.x < dockRect.x + dockRect.width &&
                rect.x + rect.width > dockRect.x &&
                rect.y < dockRect.y + dockRect.height &&
                rect.y + rect.height > dockRect.y;
        });
        if (overlaps) {
            this.cancelHide();
            this.hide();
        } else if (!this.actor.hover && !this.edgeSensor.hover) {
            if (this.settings.get_boolean('auto-hide'))
                this.scheduleHide();
            else
                this.show();
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

    private openContextMenu(source: any, app: any): void {
        const menu = new PopupMenu.PopupMenu(source, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(menu.actor);
        this.menuManager.addMenu(menu);
        this.menus.push(menu);
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
            minimize.connect('activate', () => windows.forEach((window: any) => window.minimize()));
            menu.addMenuItem(minimize);
            const close = new PopupMenu.PopupMenuItem('Close all windows');
            close.connect('activate', () => windows.forEach((window: any) => window.delete(global.get_current_time())));
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
            const favoriteIds = this.favorites.getFavorites().map((entry: any) => entry.get_id());
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
        menu.connect('open-state-changed', (_menu: any, isOpen: boolean) => {
            if (!isOpen) {
                this.menuManager.removeMenu(menu);
                this.menus = this.menus.filter((entry: any) => entry !== menu);
                menu.destroy();
            }
        });
        menu.open();
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

    private applyStyle(): void {
        const acrylic = this.settings.get_boolean('acrylic-enabled');
        const opacity = this.settings.get_double('acrylic-opacity');
        const spacing = this.settings.get_int('dock-spacing');
        const theme = this.settings.get_string('theme');
        const colorScheme = this.desktopSettings.get_string('color-scheme');
        const dark = theme === 'dark' || (theme === 'system' && colorScheme !== 'prefer-light');
        const background = dark ? '32,35,45' : '246,247,250';
        const foreground = dark ? '255,255,255' : '30,32,38';
        this.actor.set_style(`spacing: ${spacing}px; color: rgb(${foreground}); ` + (acrylic
            ? `background-color: rgba(${background}, ${opacity}); border: 1px solid rgba(255,255,255,0.16); border-radius: 18px; padding: 8px;`
            : `background-color: rgba(${background},0.97); border-radius: 18px; padding: 8px;`));
    }

    private applySettings(): void {
        if (this.destroyed)
            return;
        this.refresh();
        this.position();
        const autoHide = this.settings.get_boolean('auto-hide');
        const smartHide = this.settings.get_boolean('smart-hide');
        if (!autoHide && !smartHide) {
            this.cancelHide();
            this.actor.show();
            this.actor.opacity = 255;
        } else if (autoHide) {
            this.scheduleHide();
        }

        // Keep a reveal sensor available when either hiding mode is enabled.
        if (autoHide || smartHide) {
            this.edgeSensor.show();
            this.positionSensor();
        } else {
            this.edgeSensor.hide();
        }
        if (smartHide)
            this.queueSmartHideCheck();
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
        if (this.actor.hover) {
            this.cancelHide();
            this.show();
        } else if (this.settings.get_boolean('auto-hide')) {
            this.scheduleHide();
        }
    }

    private scheduleHide(): void {
        this.cancelHide();
        if (!this.settings.get_boolean('auto-hide') || this.actor.hover || this.edgeSensor.hover)
            return;
        this.hideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY_MS, () => {
            this.hideSource = 0;
            if (!this.actor.hover && !this.edgeSensor.hover)
                this.hide();
            return GLib.SOURCE_REMOVE;
        });
    }

    private cancelHide(): void {
        if (this.hideSource) {
            GLib.source_remove(this.hideSource);
            this.hideSource = 0;
        }
    }

    private show(): void {
        this.cancelHide();
        this.actor.show();
        this.actor.ease({ opacity: 255, duration: 160, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        this.actor.reactive = true;
    }

    private hide(): void {
        if (!this.settings.get_boolean('auto-hide') && !this.settings.get_boolean('smart-hide'))
            return;
        this.actor.ease({ opacity: 0, duration: 160, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => { if (!this.destroyed) this.actor.reactive = false; } });
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cancelHide();
        if (this.previewSource) GLib.source_remove(this.previewSource);
        if (this.previewHideSource) GLib.source_remove(this.previewHideSource);
        this.previewSource = 0;
        this.previewHideSource = 0;
        this.hideWindowPreviews();
        if (this.hoverSignal) this.actor.disconnect(this.hoverSignal);
        if (this.sensorHoverSignal) this.edgeSensor.disconnect(this.sensorHoverSignal);
        if (this.settingsSignal) this.settings.disconnect(this.settingsSignal);
        if (this.desktopThemeSignal) this.desktopSettings.disconnect(this.desktopThemeSignal);
        if (this.appStateSignal) this.appSystem.disconnect(this.appStateSignal);
        if (this.favoritesSignal) this.favorites.disconnect(this.favoritesSignal);
        if (this.focusSignal) global.display.disconnect(this.focusSignal);
        if (this.restackedSignal) global.display.disconnect(this.restackedSignal);
        if (this.windowCreatedSignal) global.display.disconnect(this.windowCreatedSignal);
        if (this.smartHideSource) GLib.source_remove(this.smartHideSource);
        this.smartHideSource = 0;
        for (const entry of [...this.windowSignals]) this.untrackWindow(entry.window);
        for (const menu of this.menus) {
            menu.close();
            this.menuManager.removeMenu(menu);
            menu.destroy();
        }
        this.menus = [];
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager.removeChrome(this.edgeSensor);
        this.actor.destroy();
        this.edgeSensor.destroy();
    }
}
