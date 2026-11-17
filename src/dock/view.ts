import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import Meta from 'gi://Meta?version=51';
import Mtk from 'gi://Mtk?version=51';
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import { AppContextMenu } from '../features/context-menu/index.js';
import { DockDragDrop, type DockDragSource, type DockDndItem } from '../features/drag-and-drop.js';
import { DockVisibility } from '../features/visibility.js';
import { DockAppearance } from '../features/appearance.js';
import { DockLayout } from '../features/layout.js';
import { DockIndicators } from '../features/indicators.js';
import { WindowTracker } from '../features/window-tracker.js';
import { DockAppItemFactory, type DockAppButton } from '../features/app-item.js';
import { DockKeyboardNavigation } from '../features/keyboard-navigation.js';
import { WindowPreviews } from '../features/window-previews/index.js';
import { DockSystemItem } from '../features/system-item.js';

type MonitorGeometry = (typeof Main.layoutManager.monitors)[number];

export class DockView {
    private actor: St.BoxLayout & { _delegate?: unknown };
    private background: St.Widget;
    private content: St.BoxLayout;
    private edgeSensor: St.Widget;
    private monitor: MonitorGeometry;
    private monitorIndex: number;
    private settings: Gio.Settings;
    private desktopSettings: Gio.Settings;
    private desktopThemeSignal = 0;
    private panelGeometrySignals: number[] = [];
    private contentGeometrySignals: number[] = [];
    private layoutIdleSource = 0;
    private appSystem: Shell.AppSystem;
    private favorites: ReturnType<typeof AppFavorites.getAppFavorites>;
    private hoverSignal = 0;
    private sensorHoverSignal = 0;
    private settingsSignal = 0;
    private appStateSignal = 0;
    private favoritesSignal = 0;
    private focusSignal = 0;
    private restackedSignal = 0;
    private workspaceSignal = 0;
    private windowCreatedSignal = 0;

    private destroyed = false;
    private contextMenu: AppContextMenu;
    private itemActors: DockAppButton[] = [];
    private itemSize = 0;
    private previews: WindowPreviews;
    private dragDrop: DockDragDrop;
    private visibility: DockVisibility;
    private appearance: DockAppearance;
    private layout: DockLayout;
    private indicators: DockIndicators;
    private windowTracker: WindowTracker;
    private appItemFactory: DockAppItemFactory;
    private keyboard: DockKeyboardNavigation;
    private systemItem: DockSystemItem | null = null;
    private favoritesSeparator: St.Widget | null = null;

    constructor(index: number, monitor: MonitorGeometry, settings: Gio.Settings) {
        this.monitor = monitor;
        this.monitorIndex = index;
        this.settings = settings;
        this.desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this.appSystem = Shell.AppSystem.get_default();
        this.favorites = AppFavorites.getAppFavorites();
        const dockPosition = this.settings.get_string('dock-position');
        const vertical = dockPosition === 'left' || dockPosition === 'right';
        this.content = new St.BoxLayout({
            orientation: vertical
                ? Clutter.Orientation.VERTICAL
                : Clutter.Orientation.HORIZONTAL,
            reactive: true,
            track_hover: true,
        });
        this.background = new St.Widget({
            style_class: 'g-os-dock-background',
            reactive: false,
            can_focus: false,
        });
        this.actor = new St.BoxLayout({
            style_class: 'g-os-dock-content',
            orientation: vertical
                ? Clutter.Orientation.VERTICAL
                : Clutter.Orientation.HORIZONTAL,
            reactive: true,
            track_hover: true,
        });
        // The interactive content container sits above the independent background.
        this.actor.add_child(this.content);
        this.appearance = new DockAppearance(this.background, this.actor, this.content, this.settings, this.desktopSettings);
        this.contextMenu = new AppContextMenu(this.actor, this.favorites);
        this.dragDrop = new DockDragDrop(
            this.actor,
            this.content,
            this.settings,
            () => this.getDndItems(),
            ids => this.persistItemOrder(ids),
            this.monitor,
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
        // Keep both visual layers hidden while the dock is being assembled.
        // DockVisibility reveals them after the first refresh and layout pass.
        this.actor.hide();
        this.background.hide();
        this.visibility = new DockVisibility(
            this.actor,
            this.background,
            this.edgeSensor,
            this.settings,
            this.monitorIndex,
            () => this.destroyed,
        );
        this.layout = new DockLayout(
            this.actor,
            this.background,
            this.content,
            this.edgeSensor,
            this.monitor,
            this.settings,
            () => this.destroyed,
        );
        this.indicators = new DockIndicators(this.settings, () => this.destroyed);
        this.windowTracker = new WindowTracker(global.display, () => this.visibility.queueSmartHideCheck());
        this.keyboard = new DockKeyboardNavigation({
            settings: this.settings,
            getItems: () => this.itemActors,
            showDock: () => this.visibility.show(),
            showPreviews: (app, item, focusFirst) => this.previews.show(app, item, focusFirst),
            hidePreviews: () => this.previews.hide(),
        });
        this.appItemFactory = new DockAppItemFactory({
            favorites: this.favorites,
            dragDrop: this.dragDrop,
            previews: this.previews,
            contextMenu: this.contextMenu,
            activateApp: app => this.activateApp(app),
            handleKeyPress: (item, event) => this.keyboard.handle(item, event),
            dockPosition: () => this.settings.get_string('dock-position'),
            settings: this.settings,
        });

        try {
            this.desktopThemeSignal = this.desktopSettings.connect(
                'changed::color-scheme',
                () => {
                    this.appearance.apply();
                    this.queueLayoutUpdate();
                },
            );
            Main.layoutManager.addChrome(this.background, {
                affectsStruts: false,
                trackFullscreen: false,
            });
            Main.layoutManager.addChrome(this.actor, {
                affectsStruts: false,
                trackFullscreen: false,
            });
            Main.layoutManager.addChrome(this.edgeSensor, {
                affectsStruts: false,
                trackFullscreen: false,
            });
            // Recalculate available dock space when the top panel changes
            // size or position (for example after a scale/theme/layout change).
            const panel = Main.panel as St.Widget;
            for (const property of ['x', 'y', 'width', 'height']) {
                this.panelGeometrySignals.push(panel.connect(
                    `notify::${property}`,
                    () => {
                        if (this.destroyed)
                            return;
                        this.layout.position();
                        this.layout.positionSensor();
                    },
                ));
            }
            this.hoverSignal = this.actor.connect(
                'notify::hover',
                () => this.onPointerChanged(),
            );
            this.sensorHoverSignal = this.edgeSensor.connect('notify::hover', () => {
                if (this.edgeSensor.hover)
                    this.visibility.show();
            });
            this.settingsSignal = this.settings.connect(
                'changed',
                () => this.applySettings(),
            );
            this.appStateSignal = this.appSystem.connect(
                'app-state-changed',
                () => this.refresh(),
            );
            this.favoritesSignal = this.favorites.connect(
                'changed',
                () => this.refresh(),
            );
            this.focusSignal = global.display.connect(
                'notify::focus-window',
                () => {
                    this.updateIndicators();
                    this.visibility.queueSmartHideCheck();
                },
            );
            this.restackedSignal = global.display.connect(
                'restacked',
                () => this.visibility.queueSmartHideCheck(),
            );
            this.workspaceSignal = global.workspace_manager.connect(
                'active-workspace-changed',
                () => this.visibility.queueSmartHideCheck(),
            );
            this.windowCreatedSignal = global.display.connect(
                'window-created',
                (_display: Meta.Display, window: Meta.Window) => this.windowTracker.track(window),
            );
            // Recompute the dock's natural size whenever its content tree
            // changes or Clutter reallocates it. The idle callback coalesces
            // bursts of relayout notifications into one geometry update.
            // Content changes made by refresh() already trigger a layout pass.
            // Keep only the allocation notification here: actor-added/removed
            // are not part of St.BoxLayout's typed signal signatures.
            this.contentGeometrySignals.push(
                this.content.connect('notify::allocation', () => this.queueLayoutUpdate()),
            );
            this.windowTracker.trackExisting();
            this.applySettings();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    handleDragOver(source: DockDragSource, dragActor: Clutter.Actor, x: number, y: number, time: number): number {
        return this.dragDrop.handleDragOver(source, dragActor, x, y, time);
    }

    acceptDrop(source: DockDragSource, dragActor: Clutter.Actor, x: number, y: number, time: number): boolean {
        return this.dragDrop.acceptDrop(source, dragActor, x, y, time);
    }

    private getApplications(): Shell.App[] {
        // Keep the dock in two strict sections: favorites in their configured
        // order, followed by running applications that are not favorites.
        // Do not rely on AppSystem.get_running() ordering for this invariant.
        const favorites = this.favorites.getFavorites();
        const running = this.appSystem.get_running();
        const favoriteIds = new Set<string>();
        const runningById = new Map<string, Shell.App>();

        for (const app of running) {
            const id = app.get_id();
            if (id)
                runningById.set(id, app);
        }

        const result: Shell.App[] = [];
        for (const app of favorites) {
            const id = app.get_id();
            if (!id || favoriteIds.has(id))
                continue;
            favoriteIds.add(id);
            result.push(app);
        }

        // Running favorites are already represented in the first section.
        // Only non-favorites are appended, in the order reported by GNOME.
        for (const app of running) {
            const id = app.get_id();
            if (id && !favoriteIds.has(id) && runningById.has(id)) {
                favoriteIds.add(id);
                result.push(app);
            }
        }

        const savedOrder = this.settings.get_strv('dock-item-order');
        const order = new Map(savedOrder.map((id, index) => [id, index]));
        result.sort((a, b) => {
            const aFavorite = this.favorites.isFavorite(a.get_id());
            const bFavorite = this.favorites.isFavorite(b.get_id());
            if (aFavorite !== bFavorite)
                return aFavorite ? -1 : 1;
            return (order.get(`app:${a.get_id()}`) ?? Number.MAX_SAFE_INTEGER) -
                (order.get(`app:${b.get_id()}`) ?? Number.MAX_SAFE_INTEGER);
        });
        return result;
    }

    private getDndItems(): DockDndItem[] {
        const items: DockDndItem[] = this.itemActors.map(item => ({
            id: `app:${item._gOsDockApp.get_id()}`,
            actor: item,
            app: item._gOsDockApp,
            canRemove: () => this.favorites.isFavorite(item._gOsDockApp.get_id()),
            onRemove: () => this.favorites.removeFavorite(item._gOsDockApp.get_id()),
        }));
        if (this.systemItem)
            items.push({ id: 'system:launcher', actor: this.systemItem.getActor() });
        const children = this.content.get_children();
        items.sort((a, b) =>
            children.indexOf(a.actor) - children.indexOf(b.actor),
        );
        return items;
    }

    private persistItemOrder(ids: string[]): void {
        // The favorites boundary is defined by the number of favorite apps,
        // not by raw dock slots (the launcher may be placed anywhere).
        const appIds = ids
            .filter(id => id.startsWith('app:'))
            .map(id => id.slice(4));
        const favoriteCount = this.favorites.getFavorites().length;
        // With no favorites yet, the first app slot acts as the pinning area
        // so the user can create the first favorite with the same gesture.
        const pinningBoundary = Math.max(1, favoriteCount);

        this.settings.set_strv('dock-item-order', ids);

        // Dropping a running, non-favorite app into the favorites section pins
        // it in GNOME. Persist the order first because addFavorite emits
        // favorites.changed and can synchronously trigger a dock refresh.
        for (const id of appIds.slice(0, pinningBoundary)) {
            if (!this.favorites.isFavorite(id))
                this.favorites.addFavorite(id);
        }
        const currentFavorites = this.favorites.getFavorites().map(app => app.get_id());
        const orderedFavorites = appIds.filter(id => currentFavorites.includes(id));
        for (const [index, id] of orderedFavorites.entries()) {
            const current = this.favorites.getFavorites().findIndex(app => app.get_id() === id);
            if (current >= 0 && current !== index)
                this.favorites.moveFavoriteToPos(id, index);
        }
    }

    private applySavedItemOrder(): void {
        const actors = this.getDndItems();
        let saved = this.settings.get_strv('dock-item-order');
        if (saved.length === 0) {
            // One-time migration from the old launcher-only position setting.
            const legacy = actors.filter(item => item.id !== 'system:launcher').map(item => item.id);
            const launcherIndex = actors.findIndex(item => item.id === 'system:launcher');
            if (launcherIndex >= 0) {
                const target = Math.max(0, Math.min(
                    this.settings.get_int('system-icon-position'), legacy.length,
                ));
                legacy.splice(target, 0, 'system:launcher');
            }
            saved = legacy;
            if (saved.length > 0)
                this.settings.set_strv('dock-item-order', saved);
        }
        const rank = new Map(saved.map((id, index) => [id, index]));
        actors.sort((a, b) =>
            (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        );
        for (const [index, item] of actors.entries()) {
            const current = this.content.get_children().indexOf(item.actor);
            if (current >= 0 && current !== index)
                this.content.set_child_at_index(item.actor, index);
        }
    }

    private refresh(): void {
        if (this.destroyed)
            return;

        const pendingItems: DockAppButton[] = [];
        try {
            const applications = this.getApplications();
            const configuredSize = this.settings.get_int('icon-size');
            const vertical = ['left', 'right'].includes(this.settings.get_string('dock-position'));
            const spacing = this.settings.get_int('dock-spacing');
            const edgeDistance = this.settings.get_int('edge-distance');
            const paddingTop = this.settings.get_int('background-padding-top');
            const paddingRight = this.settings.get_int('background-padding-right');
            const paddingBottom = this.settings.get_int('background-padding-bottom');
            const paddingLeft = this.settings.get_int('background-padding-left');
            const border = this.settings.get_int('border-size');
            const iconPadding = vertical
                ? this.settings.get_int('icon-padding-top') + this.settings.get_int('icon-padding-bottom')
                : this.settings.get_int('icon-padding-left') + this.settings.get_int('icon-padding-right');
            const panel = Main.panel as St.Widget;
            const [panelX, panelY] = panel.get_transformed_position();
            const panelBottom = panelY + panel.height;
            const panelAtMonitorTop =
                panelX < this.monitor.x + this.monitor.width &&
                panelX + panel.width > this.monitor.x &&
                panelY <= this.monitor.y + 2 &&
                panelBottom > this.monitor.y;
            const usableTop = panelAtMonitorTop
                ? Math.min(this.monitor.y + this.monitor.height, panelBottom + edgeDistance)
                : this.monitor.y;
            const available = vertical
                ? this.monitor.y + this.monitor.height - usableTop - edgeDistance -
                    paddingTop - paddingBottom - border * 2
                : this.monitor.width - edgeDistance * 2 -
                    paddingLeft - paddingRight - border * 2;
            const itemOverhead = vertical ? 25 : 4;
            const hasFavoriteSection = applications.some(app =>
                this.favorites.isFavorite(app.get_id()),
            );
            const hasRunningSection = applications.some(app =>
                !this.favorites.isFavorite(app.get_id()),
            );
            const showSeparator = this.settings.get_boolean('show-favorites-separator') &&
                hasFavoriteSection && hasRunningSection;
            const separatorSpace = showSeparator
                ? this.settings.get_int('favorites-separator-size') + spacing
                : 0;
            const itemCount = applications.length + (this.settings.get_boolean('show-system-icon') ? 1 : 0);
            const fittedSize = itemCount > 0
                ? Math.floor(
                    (available - separatorSpace - spacing * Math.max(0, itemCount - 1)) /
                    itemCount,
                ) - itemOverhead - iconPadding
                : configuredSize;
            const size = Math.min(configuredSize, Math.max(16, fittedSize));

            // Rebuild only when the effective icon size changes. Ordinary
            // app/window state changes keep the existing actors alive.
            const sizeChanged = this.itemSize !== 0 && this.itemSize !== size;
            const previousById = new Map<string, DockAppButton>();
            if (!sizeChanged) {
                for (const item of this.itemActors) {
                    const id = item._gOsDockApp?.get_id();
                    if (id)
                        previousById.set(id, item);
                }
            }

            for (const app of applications) {
                const id = app.get_id();
                let item = id ? previousById.get(id) : undefined;
                if (item) {
                    previousById.delete(id!);
                } else {
                    item = this.createItem(app, size);
                }
                this.updateItemPadding(item, size);
                if (item.get_parent() !== this.content)
                    this.content.add_child(item);
                pendingItems.push(item);
            }

            // Remove actors for apps no longer present, and all old actors
            // when a genuine size change requires rebuilding the icon widgets.
            const previousIds = this.itemActors.map(item => item._gOsDockApp.get_id());
            const nextIds = pendingItems.map(item => item._gOsDockApp.get_id());
            const structureChanged = sizeChanged ||
                previousIds.length !== nextIds.length ||
                previousIds.some((id, index) => id !== nextIds[index]);
            const retained = new Set(pendingItems);
            for (const item of this.itemActors) {
                if (!retained.has(item)) {
                    this.dragDrop.unregisterItem(item);
                    if (item.get_parent())
                        item.get_parent()?.remove_child(item);
                    item.destroy();
                }
            }

            this.itemActors = pendingItems;
            this.itemSize = size;
            const systemItemChanged = this.syncSystemItem(size);
            this.applySavedItemOrder();
            this.syncFavoritesSeparator(size, vertical);
            if (structureChanged || systemItemChanged)
                this.layout.position();
        } catch (error) {
            for (const item of pendingItems) {
                if (!this.itemActors.includes(item)) {
                    this.dragDrop.unregisterItem(item);
                    if (item.get_parent())
                        item.get_parent()?.remove_child(item);
                    item.destroy();
                }
            }
            throw error;
        }

        this.updateIndicators();
        this.visibility.queueSmartHideCheck();
    }

    private syncFavoritesSeparator(size: number, vertical: boolean): void {
        const enabled = this.settings.get_boolean('show-favorites-separator');
        const hasFavorite = this.itemActors.some(item =>
            this.favorites.isFavorite(item._gOsDockApp.get_id()),
        );
        const firstNonFavorite = this.itemActors.find(item =>
            !this.favorites.isFavorite(item._gOsDockApp.get_id()),
        );

        if (!enabled || !hasFavorite || !firstNonFavorite) {
            if (this.favoritesSeparator) {
                this.favoritesSeparator.get_parent()?.remove_child(this.favoritesSeparator);
                this.favoritesSeparator.destroy();
                this.favoritesSeparator = null;
            }
            return;
        }

        if (!this.favoritesSeparator) {
            this.favoritesSeparator = new St.Widget({
                style_class: 'g-os-dock-favorites-separator',
                reactive: false,
                can_focus: false,
                x_expand: false,
                y_expand: false,
            });
            this.content.add_child(this.favoritesSeparator);
        }

        const thickness = this.settings.get_int('favorites-separator-size');
        const length = Math.max(4, Math.round(
            size * this.settings.get_int('favorites-separator-length') / 100,
        ));
        const color = this.settings.get_string('favorites-separator-color');
        const opacity = this.settings.get_double('favorites-separator-opacity');
        this.favoritesSeparator.set_size(
            vertical ? length : thickness,
            vertical ? thickness : length,
        );
        this.favoritesSeparator.set_style(
            `background-color: ${color}; opacity: ${opacity}; ` +
            `border-radius: ${Math.ceil(thickness / 2)}px; ` +
            (vertical
                ? `margin: 4px ${Math.max(2, Math.floor(size * 0.12))}px;`
                : `margin: ${Math.max(2, Math.floor(size * 0.12))}px 4px;`),
        );

        const targetIndex = this.content.get_children().indexOf(firstNonFavorite);
        if (targetIndex >= 0 &&
            this.content.get_children()[targetIndex - 1] !== this.favoritesSeparator) {
            this.content.set_child_at_index(this.favoritesSeparator, targetIndex);
        }
    }

    private syncSystemItem(size: number): boolean {
        const enabled = this.settings.get_boolean('show-system-icon');
        if (!enabled) {
            if (!this.systemItem)
                return false;
            this.systemItem.destroy();
            this.systemItem = null;
            return true;
        }
        if (!this.systemItem) {
            this.systemItem = new DockSystemItem(
                this.content, this.settings, size,
                () => this.settings.get_string('dock-position'),
                this.dragDrop,
            );
            return true;
        }
        this.systemItem.setIconSize(size);
        return false;
    }


    /** Update per-side icon padding on retained actors when preferences change. */
    private updateItemPadding(item: DockAppButton, size: number): void {
        const top = this.settings.get_int('icon-padding-top');
        const right = this.settings.get_int('icon-padding-right');
        const bottom = this.settings.get_int('icon-padding-bottom');
        const left = this.settings.get_int('icon-padding-left');
        const style = `padding: ${top}px ${right}px ${bottom}px ${left}px; ` +
            `min-width: ${size + left + right}px; ` +
            `min-height: ${size + top + bottom}px;`;
        if (item._gOsDockPaddingStyle === style)
            return;
        item.set_style(style);
        item._gOsDockPaddingStyle = style;
    }

    private createItem(app: Shell.App, size: number): DockAppButton {
        return this.appItemFactory.create(app, size);
    }

    private updateIndicators(): void {
        this.indicators.update(this.itemActors);
    }

    private activateApp(app: Shell.App): void {
        const windows = app.get_windows();
        this.updateWindowIconGeometry(app, windows);
        if (windows.length === 0) {
            app.activate();
            return;
        }

        const focused = global.display.focus_window;
        // Clicking the currently focused application's icon toggles its
        // active window to the minimized state, like a conventional dock.
        if (focused && windows.includes(focused)) {
            focused.minimize();
            return;
        }

        // Prefer a visible window; if every window is minimized, restore the
        // first one before activating it.
        const target = windows.find(window => !window.minimized) ?? windows[0];
        if (!target)
            return;
        if (target.minimized)
            target.unminimize();

        app.activate_window(target, global.get_current_time());
    }

    /** Tell Mutter where this application's dock icon is for minimize/restore animations. */
    private updateWindowIconGeometry(app: Shell.App, windows: Meta.Window[]): void {
        const item = this.itemActors.find(candidate =>
            candidate._gOsDockApp.get_id() === app.get_id(),
        );
        const icon = item?._gOsDockIcon;
        if (!icon || !icon.is_mapped())
            return;

        const [x, y] = icon.get_transformed_position();
        const [width, height] = icon.get_transformed_size();
        if (width <= 0 || height <= 0)
            return;

        // Mutter's built-in minimize and unminimize animations use this
        // root-window-relative rectangle as their destination/source.
        const geometry = Mtk.Rectangle.new(
            Math.round(x), Math.round(y), Math.round(width), Math.round(height),
        );
        for (const window of windows)
            window.set_icon_geometry(geometry);
    }

    private applySettings(): void {
        if (this.destroyed)
            return;

        // Apply development styling immediately when the preference changes.
        const devMode = this.settings.get_boolean('dev-mode');
        for (const actor of [this.actor, this.background, this.edgeSensor]) {
            if (devMode)
                actor.add_style_class_name('g-os-dock-dev');
            else
                actor.remove_style_class_name('g-os-dock-dev');
        }

        this.appearance.apply();
        this.refresh();
        this.layout.position();
        this.visibility.applySettings();

        const autoHide = this.settings.get_boolean('auto-hide');
        const smartHide = this.settings.get_boolean('smart-hide');
        if (autoHide || smartHide) {
            this.edgeSensor.show();
            this.layout.positionSensor();
        } else {
            this.edgeSensor.hide();
        }
    }

    private queueLayoutUpdate(): void {
        if (this.destroyed || this.layoutIdleSource)
            return;

        this.layoutIdleSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.layoutIdleSource = 0;
            if (!this.destroyed) {
                this.layout.position();
                this.layout.positionSensor();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    private onPointerChanged(): void {
        this.visibility.onPointerChanged();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        if (this.layoutIdleSource) {
            GLib.Source.remove(this.layoutIdleSource);
            this.layoutIdleSource = 0;
        }
        for (const signal of this.contentGeometrySignals)
            this.content.disconnect(signal);
        this.contentGeometrySignals = [];
        this.visibility.destroy();
        this.previews.destroy();
        if (this.hoverSignal) this.actor.disconnect(this.hoverSignal);
        if (this.sensorHoverSignal) this.edgeSensor.disconnect(this.sensorHoverSignal);
        if (this.settingsSignal) this.settings.disconnect(this.settingsSignal);
        if (this.desktopThemeSignal) this.desktopSettings.disconnect(this.desktopThemeSignal);
        const panel = Main.panel as St.Widget;
        for (const signal of this.panelGeometrySignals)
            panel.disconnect(signal);
        this.panelGeometrySignals = [];
        if (this.appStateSignal) this.appSystem.disconnect(this.appStateSignal);
        if (this.favoritesSignal) this.favorites.disconnect(this.favoritesSignal);
        if (this.focusSignal) global.display.disconnect(this.focusSignal);
        if (this.restackedSignal) global.display.disconnect(this.restackedSignal);
        if (this.workspaceSignal) global.workspace_manager.disconnect(this.workspaceSignal);
        if (this.windowCreatedSignal) global.display.disconnect(this.windowCreatedSignal);
        this.windowTracker.destroy();
        this.contextMenu.destroy();
        if (this.favoritesSeparator) {
            this.favoritesSeparator.get_parent()?.remove_child(this.favoritesSeparator);
            this.favoritesSeparator.destroy();
            this.favoritesSeparator = null;
        }
        this.systemItem?.destroy();
        this.systemItem = null;
        this.dragDrop.destroy();
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager.removeChrome(this.background);
        Main.layoutManager.removeChrome(this.edgeSensor);
        this.actor.destroy();
        this.background.destroy();
        this.edgeSensor.destroy();
    }
}
