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
import { DockApplicationItemsController } from '../features/application-items-controller.js';
import { DockKeyboardNavigation } from '../features/keyboard-navigation.js';
import { WindowPreviews } from '../features/window-previews/index.js';
import { DockItemsController } from '../features/dock-items-controller.js';
import { DockFavoritesSeparatorController } from '../features/favorites-separator-controller.js';
import { DockItemOrderController } from '../features/dock-item-order-controller.js';
import { SettingsObserver } from '../features/settings-observer.js';
import { LifecycleScope } from '../features/lifecycle-scope.js';
import { resolveApplicationOrder } from '../features/application-order.js';

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
    private lifecycle = new LifecycleScope<St.Widget>({
        timeout: (delay, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, callback),
        idle: callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, callback),
        remove: sourceId => GLib.Source.remove(sourceId),
    },
    (actor, options) => Main.layoutManager.addChrome(actor, options),
    actor => Main.layoutManager.removeChrome(actor));
    private appSystem: Shell.AppSystem;
    private favorites: ReturnType<typeof AppFavorites.getAppFavorites>;

    private destroyed = false;
    private settingsObserver = new SettingsObserver();
    private contextMenu: AppContextMenu;
    private applicationItems!: DockApplicationItemsController;
    private previews: WindowPreviews;
    private dragDrop: DockDragDrop;
    private visibility: DockVisibility;
    private appearance: DockAppearance;
    private layout: DockLayout;
    private indicators: DockIndicators;
    private windowTracker: WindowTracker;
    private appItemFactory: DockAppItemFactory;
    private keyboard: DockKeyboardNavigation;
    private dockItems: DockItemsController;
    private favoritesSeparator: DockFavoritesSeparatorController;
    private itemOrder: DockItemOrderController<DockDndItem>;

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
        this.contextMenu = new AppContextMenu(
            this.actor,
            this.favorites,
            () => this.settings.get_string('dock-position'),
        );
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
        this.windowTracker = new WindowTracker(
            global.display,
            () => this.visibility.queueSmartHideCheck(),
            () => {
                this.indicators.update(this.itemActors);
                this.visibility.queueSmartHideCheck();
            },
        );
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
        this.applicationItems = new DockApplicationItemsController(
            this.content,
            this.appItemFactory,
            this.settings,
        );
        this.dockItems = new DockItemsController(
            this.content,
            this.settings,
            this.dragDrop,
            () => this.settings.get_string('dock-position'),
            () => this.refresh(),
        );
        this.favoritesSeparator = new DockFavoritesSeparatorController(
            this.content,
            this.settings,
        );
        this.itemOrder = new DockItemOrderController(
            this.content,
            this.settings,
            () => this.getDndItems(),
        );

        try {
            this.addToStage();
            this.connectSignals();
            this.windowTracker.trackExisting();
            this.applySettings();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }


    private addToStage(): void {
        const options = { affectsStruts: false, trackFullscreen: false };
        this.lifecycle.chrome.add(this.background, options);
        this.lifecycle.chrome.add(this.actor, options);
        this.lifecycle.chrome.add(this.edgeSensor, options);
    }

    private connectPanelGeometrySignals(): void {
        const panel = Main.panel as St.Widget;
        for (const property of ['x', 'y', 'width', 'height']) {
            this.lifecycle.addSignal(panel, panel.connect(
                `notify::${property}`,
                () => {
                    if (this.destroyed)
                        return;
                    this.positionDock();
                },
            ));
        }
    }

    private connectContentGeometrySignal(): void {
        // Coalesce allocation notifications into one geometry update.
        this.lifecycle.addSignal(
            this.content,
            this.content.connect('notify::allocation', () => this.queueLayoutUpdate()),
        );
    }

    private connectWindowSignals(): void {
        this.lifecycle.addSignal(global.display, global.display.connect(
            'notify::focus-window',
            () => {
                this.indicators.update(this.itemActors);
                this.visibility.queueSmartHideCheck();
            },
        ));
        this.lifecycle.addSignal(global.display, global.display.connect(
            'restacked',
            () => this.visibility.queueSmartHideCheck(),
        ));
        this.lifecycle.addSignal(global.workspace_manager, global.workspace_manager.connect(
            'active-workspace-changed',
            () => this.visibility.queueSmartHideCheck(),
        ));
        this.lifecycle.addSignal(global.display, global.display.connect(
            'window-created',
            (_display: Meta.Display, window: Meta.Window) => this.windowTracker.track(window),
        ));
    }

    private connectApplicationSignals(): void {
        this.lifecycle.addSignal(this.appSystem, this.appSystem.connect(
            'app-state-changed',
            () => this.refresh(),
        ));
        this.lifecycle.addSignal(this.favorites, this.favorites.connect(
            'changed',
            () => this.refresh(),
        ));
    }

    private connectThemeSignal(): void {
        this.settingsObserver.watch(this.desktopSettings, 'color-scheme', () => {
            this.appearance.apply();
            this.queueLayoutUpdate();
        });
    }

    private connectPointerSignals(): void {
        this.lifecycle.addSignal(this.actor, this.actor.connect(
            'notify::hover',
            () => this.visibility.onPointerChanged(),
        ));
        this.lifecycle.addSignal(this.edgeSensor, this.edgeSensor.connect('notify::hover', () => {
            if (this.edgeSensor.hover)
                this.visibility.show();
        }));
    }

    private connectSettingsSignals(): void {
        this.settingsObserver.watchMany(this.settings, [
            'theme',
            'acrylic-enabled',
            'background-color',
            'background-opacity',
            'border-color',
            'border-opacity',
            'border-size',
            'radius-top-left',
            'radius-top-right',
            'radius-bottom-right',
            'radius-bottom-left',
            'background-padding-top',
            'background-padding-right',
            'background-padding-bottom',
            'background-padding-left',
            'dock-spacing',
            'background-shadow-enabled',
            'background-shadow-color',
            'background-shadow-opacity',
            'background-shadow-offset-x',
            'background-shadow-offset-y',
            'background-shadow-blur',
            'background-shadow-spread',
        ], () => this.appearance.apply());

        this.settingsObserver.watchMany(this.settings, [
            'show-system-icon',
            'show-trash-icon',
            'dock-position',
            'icon-size',
            'dock-spacing',
            'border-size',
            'background-padding-top',
            'background-padding-right',
            'background-padding-bottom',
            'background-padding-left',
            'edge-distance',
            'icon-padding-top',
            'icon-padding-right',
            'icon-padding-bottom',
            'icon-padding-left',
            'dock-item-order',
            'show-favorites-separator',
            'favorites-separator-size',
        ], () => {
            this.refresh();
            this.positionDock();
        });

        this.settingsObserver.watchMany(this.settings, [
            'show-network-drives',
            'show-system-drives',
            'show-usb-drives',
        ], () => {
            this.refresh(true);
            this.positionDock();
        });

        this.settingsObserver.watchMany(this.settings, [
            'favorites-separator-color',
            'favorites-separator-opacity',
            'favorites-separator-length',
        ], () => {
            if (this.itemSize === 0)
                return;
            const position = this.settings.get_string('dock-position');
            this.syncFavoritesSeparator(position === 'left' || position === 'right');
            this.positionDock();
        });

        this.settingsObserver.watchMany(this.settings, [
            'auto-hide',
            'smart-hide',
        ], () => {
            this.visibility.applySettings();
            this.syncEdgeSensor();
        });

        this.settingsObserver.watch(this.settings, 'dev-mode', () => {
            this.applyDevelopmentStyle();
        });

        this.settingsObserver.watchMany(this.settings, [
            'show-running-indicator',
            'indicator-show-open',
            'indicator-show-focused',
            'indicator-show-minimized',
            'show-window-count',
            'indicator-mode',
            'indicator-shape',
            'indicator-color',
            'indicator-opacity',
            'indicator-bottom-offset',
            'indicator-size',
            'indicator-border-size',
            'indicator-border-color',
            'indicator-border-opacity',
        ], () => this.indicators.update(this.itemActors, false));
    }

    private connectSignals(): void {
        this.connectThemeSignal();
        this.connectPanelGeometrySignals();
        this.connectPointerSignals();
        this.connectSettingsSignals();
        this.connectApplicationSignals();
        this.connectWindowSignals();
        this.connectContentGeometrySignal();
    }

    handleDragOver(source: DockDragSource, dragActor: Clutter.Actor, x: number, y: number, time: number): number {
        return this.dragDrop.handleDragOver(source, dragActor, x, y, time);
    }

    acceptDrop(source: DockDragSource, dragActor: Clutter.Actor, x: number, y: number, time: number): boolean {
        return this.dragDrop.acceptDrop(source, dragActor, x, y, time);
    }

    private getApplications(): Shell.App[] {
        const ranks = this.itemOrder.getRanks(this.settings.get_strv('dock-item-order'));
        return resolveApplicationOrder(
            this.favorites.getFavorites(),
            this.appSystem.get_running(),
            ranks,
        );
    }

    private get itemActors(): DockAppButton[] {
        return this.applicationItems.items;
    }

    private get itemSize(): number {
        return this.applicationItems.size;
    }

    private getDndItems(): DockDndItem[] {
        const items: DockDndItem[] = this.itemActors.map(item =>
            this.createAppDndItem(item),
        );
        items.push(...this.dockItems.getDndItems());
        const positions = new Map(
            this.content.get_children().map((child, index) => [child, index]),
        );
        items.sort((a, b) =>
            (positions.get(a.actor) ?? -1) - (positions.get(b.actor) ?? -1),
        );
        return items;
    }

    private createAppDndItem(item: DockAppButton): DockDndItem {
        const appId = item._gOsDockApp.get_id();
        return {
            id: `app:${appId}`,
            actor: item,
            app: item._gOsDockApp,
            isFavorite: () => this.favorites.isFavorite(appId),
            canRemove: () => this.favorites.isFavorite(appId),
            onRemove: () => this.favorites.removeFavorite(appId),
        };
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

        this.syncFavoriteOrder(appIds, pinningBoundary);
    }

    private syncFavoriteOrder(appIds: string[], pinningBoundary: number): void {
        // Persist the dock order before pinning: addFavorite emits favorites.changed
        // and can synchronously trigger a dock refresh.
        const favoriteIds = new Set(
            this.favorites.getFavorites().map(app => app.get_id()),
        );
        for (let index = 0; index < pinningBoundary && index < appIds.length; index++) {
            const id = appIds[index];
            if (!id || favoriteIds.has(id))
                continue;
            this.favorites.addFavorite(id);
            favoriteIds.add(id);
        }

        const currentFavorites = this.favorites.getFavorites().map(app => app.get_id());
        const currentPositions = new Map(
            currentFavorites.map((id, index) => [id, index]),
        );
        const orderedFavorites = appIds.filter(id => currentPositions.has(id));

        for (const [index, id] of orderedFavorites.entries()) {
            const current = currentPositions.get(id);
            if (current === undefined || current === index)
                continue;

            this.favorites.moveFavoriteToPos(id, index);
            currentFavorites.splice(current, 1);
            currentFavorites.splice(index, 0, id);
            const firstChanged = Math.min(current, index);
            const lastChanged = Math.max(current, index);
            for (let position = firstChanged; position <= lastChanged; position++) {
                const favoriteId = currentFavorites[position];
                if (favoriteId !== undefined)
                    currentPositions.set(favoriteId, position);
            }
        }
    }

    private getAvailableSpace(vertical: boolean): number {
        const edge = this.settings.get_int('edge-distance');
        const border = this.settings.get_int('border-size') * 2;
        const padding = vertical
            ? this.settings.get_int('background-padding-top') +
                this.settings.get_int('background-padding-bottom')
            : this.settings.get_int('background-padding-left') +
                this.settings.get_int('background-padding-right');
        const panel = Main.panel as St.Widget;
        const [panelX, panelY] = panel.get_transformed_position();
        const panelBottom = panelY + panel.height;
        const panelOverlapsMonitorTop =
            panelX < this.monitor.x + this.monitor.width &&
            panelX + panel.width > this.monitor.x &&
            panelY <= this.monitor.y + 2 &&
            panelBottom > this.monitor.y;
        const usableTop = panelOverlapsMonitorTop
            ? Math.min(this.monitor.y + this.monitor.height, panelBottom + edge)
            : this.monitor.y;

        if (vertical) {
            return this.monitor.y + this.monitor.height - usableTop -
                edge - padding - border;
        }

        return this.monitor.width - edge * 2 - padding - border;
    }

    private getIconSize(
        applications: Shell.App[],
        available: number,
        vertical: boolean,
        configuredSize: number,
    ): number {
        const spacing = this.settings.get_int('dock-spacing');
        const favoriteIds = new Set(
            this.favorites.getFavorites().map(app => app.get_id()),
        );
        let hasFavorites = false;
        let hasRunningApps = false;
        for (const app of applications) {
            if (favoriteIds.has(app.get_id()))
                hasFavorites = true;
            else
                hasRunningApps = true;
            if (hasFavorites && hasRunningApps)
                break;
        }
        const separatorSpace = this.settings.get_boolean('show-favorites-separator') &&
            hasFavorites && hasRunningApps
            ? this.settings.get_int('favorites-separator-size') + spacing
            : 0;
        const itemCount = applications.length +
            Number(this.settings.get_boolean('show-system-icon')) +
            Number(this.settings.get_boolean('show-trash-icon')) +
            this.dockItems.volumeCount;
        const iconPadding = vertical
            ? this.settings.get_int('icon-padding-top') + this.settings.get_int('icon-padding-bottom')
            : this.settings.get_int('icon-padding-left') + this.settings.get_int('icon-padding-right');
        const overhead = vertical ? 25 : 4;
        const fittedSize = itemCount > 0
            ? Math.floor(
                (available - separatorSpace - spacing * Math.max(0, itemCount - 1)) /
                itemCount,
            ) - overhead - iconPadding
            : configuredSize;

        return Math.min(configuredSize, Math.max(16, fittedSize));
    }

    private syncApplicationItems(applications: Shell.App[], size: number): boolean {
        return this.applicationItems.sync(applications, size);
    }

    private refresh(syncVolumes = false): void {
        if (this.destroyed)
            return;

        const applications = this.getApplications();
        const configuredSize = this.settings.get_int('icon-size');
        const volumeItemsChanged = syncVolumes ? this.dockItems.syncVolumes(configuredSize) : false;
        const vertical = ['left', 'right'].includes(this.settings.get_string('dock-position'));
        const available = this.getAvailableSpace(vertical);
        const size = this.getIconSize(applications, available, vertical, configuredSize);

        const structureChanged = this.syncApplicationItems(applications, size);
        const dockItemsChanged = this.dockItems.sync(size);
        this.itemOrder.apply();
        this.syncFavoritesSeparator(vertical);

        if (structureChanged || dockItemsChanged || volumeItemsChanged)
            this.positionDock();

        this.indicators.update(this.itemActors);
        this.visibility.queueSmartHideCheck();
    }

    private syncFavoritesSeparator(vertical: boolean): void {
        const enabled = this.settings.get_boolean('show-favorites-separator');
        const favoriteIds = new Set(
            this.favorites.getFavorites().map(app => app.get_id()),
        );
        let hasFavorite = false;
        let firstNonFavorite: St.Widget | null = null;
        for (const item of this.itemActors) {
            if (favoriteIds.has(item._gOsDockApp.get_id())) {
                hasFavorite = true;
            } else {
                firstNonFavorite = item;
                break;
            }
        }

        this.favoritesSeparator.sync(
            enabled && hasFavorite ? firstNonFavorite : null,
            vertical,
        );
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

    private applyDevelopmentStyle(): void {
        const enabled = this.settings.get_boolean('dev-mode');
        for (const actor of [this.actor, this.background, this.edgeSensor]) {
            if (enabled)
                actor.add_style_class_name('g-os-dock-dev');
            else
                actor.remove_style_class_name('g-os-dock-dev');
        }
    }

    private positionDock(): void {
        this.layout.position();
        this.visibility.syncHiddenPosition();
    }

    private applySettings(): void {
        if (this.destroyed)
            return;

        this.applyDevelopmentStyle();
        this.appearance.apply();
        this.refresh(true);
        this.positionDock();
        this.visibility.applySettings();

        this.syncEdgeSensor();
    }

    private syncEdgeSensor(): void {
        const shouldShow = this.settings.get_boolean('auto-hide') ||
            this.settings.get_boolean('smart-hide');
        if (!shouldShow) {
            this.edgeSensor.hide();
            return;
        }

        this.edgeSensor.show();
        this.layout.positionSensor();
    }

    private queueLayoutUpdate(): void {
        if (this.destroyed)
            return;

        this.lifecycle.tasks.idle('layout-update', () => {
            if (!this.destroyed)
                this.positionDock();
        });
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.settingsObserver.destroy();
        this.lifecycle.destroy();
        this.visibility.destroy();
        this.previews.destroy();
        this.windowTracker.destroy();
        this.contextMenu.destroy();
        this.applicationItems.destroy();
        this.favoritesSeparator.destroy();
        this.dockItems.destroy();
        this.dragDrop.destroy();
        this.actor.destroy();
        this.background.destroy();
        this.edgeSensor.destroy();
    }
}
