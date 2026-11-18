import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
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
import { DockFoldersController } from '../features/applications/dock-folders-controller.js';
import { DockKeyboardNavigation } from '../features/keyboard-navigation.js';
import { WindowPreviews } from '../features/window-previews/index.js';
import { DockItemsController } from '../features/dock-items-controller.js';
import { DockItemBase } from '../features/items/dock-item-base.js';
import { DockFavoritesSeparatorController } from '../features/favorites-separator-controller.js';
import { DockItemOrderController } from '../features/dock-item-order-controller.js';
import { FavoriteOrderController } from '../features/favorite-order-controller.js';
import { DockSettingsController } from './controllers/settings-controller.js';
import { DockRuntimeSignalsController } from './controllers/runtime-signals-controller.js';
import { DockActorSignalsController } from './controllers/actor-signals-controller.js';
import { LifecycleScope } from '../features/lifecycle-scope.js';
import { resolveApplicationOrder } from '../features/application-order.js';
import { DockRefreshController } from './controllers/refresh-controller.js';
import { DockApplicationActivationController } from '../features/application-activation-controller.js';
import { resolveFavoritesSeparatorTarget } from '../features/favorites-separator.js';
import { resolveDockDndOrder } from '../features/dock-dnd-order.js';
import { isVerticalDockPosition } from '../features/dock-positioner.js';

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
    private settingsController: DockSettingsController;
    private runtimeSignals: DockRuntimeSignalsController;
    private actorSignals: DockActorSignalsController;
    private contextMenu: AppContextMenu;
    private applicationItems!: DockApplicationItemsController;
    private folders!: DockFoldersController;
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
    private favoriteOrder: FavoriteOrderController;
    private refreshController: DockRefreshController;
    private activation: DockApplicationActivationController;

    constructor(index: number, monitor: MonitorGeometry, settings: Gio.Settings) {
        this.monitor = monitor;
        this.monitorIndex = index;
        this.settings = settings;
        this.desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this.appSystem = Shell.AppSystem.get_default();
        this.favorites = AppFavorites.getAppFavorites();
        const dockPosition = this.settings.get_string('dock-position');
        const vertical = isVerticalDockPosition(dockPosition);
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
        this.folders = new DockFoldersController(
            this.content,
            this.settings,
            this.dragDrop,
            this.appSystem,
            () => this.settings.get_string('dock-position'),
            () => this.itemSize,
            () => this.refresh(),
        );
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
        DockItemBase.setMagnificationSurfaceHandler(
            this.content,
            (leading, trailing) => this.layout.setMagnificationInsets(leading, trailing),
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
            content: this.content,
            favorites: this.favorites,
            dragDrop: this.dragDrop,
            previews: this.previews,
            contextMenu: this.contextMenu,
            activateApp: app => this.activateApp(app),
            handleKeyPress: (item, event) => this.keyboard.handle(item, event),
            dockPosition: () => this.settings.get_string('dock-position'),
            settings: this.settings,
        });
        this.activation = new DockApplicationActivationController(
            () => this.itemActors,
            global.display,
            () => global.get_current_time(),
        );
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
        this.favoriteOrder = new FavoriteOrderController(this.settings, {
            getFavoriteIds: () => this.favorites.getFavorites().map(app => app.get_id()),
            addFavorite: id => this.favorites.addFavorite(id),
            moveFavoriteToPos: (id, position) => this.favorites.moveFavoriteToPos(id, position),
        });

        this.refreshController = new DockRefreshController(
            this.settings,
            this.layout,
            this.dockItems,
            () => this.favorites.getFavorites().map(app => app.get_id()),
            {
                getApplications: () => this.getApplications(),
                syncApplications: (applications, size) => this.syncApplicationItems(applications, size),
                applyItemOrder: () => this.itemOrder.apply(),
                syncFavoritesSeparator: vertical => this.syncFavoritesSeparator(vertical),
                positionDock: () => this.positionDock(),
                updateIndicators: () => this.indicators.update(this.itemActors),
                queueSmartHideCheck: () => this.visibility.queueSmartHideCheck(),
            },
        );

        this.settingsController = new DockSettingsController(
            this.settings,
            this.desktopSettings,
            {
                applyAppearance: () => this.appearance.apply(),
                queueLayoutUpdate: () => this.queueLayoutUpdate(),
                refresh: syncVolumes => this.refresh(syncVolumes),
                positionDock: () => this.positionDock(),
                getItemSize: () => this.itemSize,
                getDockPosition: () => this.settings.get_string('dock-position'),
                syncFavoritesSeparator: vertical => this.syncFavoritesSeparator(vertical),
                applyVisibilitySettings: () => this.visibility.applySettings(),
                syncEdgeSensor: () => this.syncEdgeSensor(),
                applyDevelopmentStyle: () => this.applyDevelopmentStyle(),
                updateIndicators: () => this.indicators.update(this.itemActors, false),
            },
        );
        this.runtimeSignals = new DockRuntimeSignalsController(
            this.appSystem,
            this.favorites,
            global.display,
            global.workspace_manager,
            {
                refresh: () => this.refresh(),
                updateIndicators: () => this.indicators.update(this.itemActors),
                queueSmartHideCheck: () => this.visibility.queueSmartHideCheck(),
                trackWindow: window => this.windowTracker.track(window),
            },
        );
        this.actorSignals = new DockActorSignalsController(
            Main.panel,
            this.actor,
            this.content,
            this.edgeSensor,
            {
                positionDock: () => this.positionDock(),
                queueLayoutUpdate: () => this.queueLayoutUpdate(),
                onDockPointerChanged: () => this.visibility.onPointerChanged(),
                onEdgeSensorHoverChanged: hovered => {
                    if (hovered)
                        this.visibility.show();
                },
            },
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

    private connectSignals(): void {
        this.settingsController.connectTheme();
        this.actorSignals.connect();
        this.settingsController.connectSettings();
        this.runtimeSignals.connect();
    }

    handleDragOver(source: DockDragSource, dragActor: Clutter.Actor, x: number, y: number, time: number): number {
        return this.dragDrop.handleDragOver(source, dragActor, x, y, time);
    }

    acceptDrop(source: DockDragSource, dragActor: Clutter.Actor, x: number, y: number, time: number): boolean {
        return this.dragDrop.acceptDrop(source, dragActor, x, y, time);
    }

    private getApplications(): Shell.App[] {
        const ranks = this.itemOrder.getRanks(this.settings.get_strv('dock-item-order'));
        const hiddenAppIds = this.folders.getHiddenAppIds();
        return resolveApplicationOrder(
            this.favorites.getFavorites(),
            this.appSystem.get_running(),
            ranks,
        ).filter(app => !hiddenAppIds.has(app.get_id()));
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
        items.push(...this.folders.getDndItems());
        return resolveDockDndOrder(items, this.content.get_children());
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
            onCreateFolder: target => this.folders.addToFolder(`app:${appId}`, target),
        };
    }

    private persistItemOrder(ids: string[]): void {
        this.favoriteOrder.persist(ids);
    }

    private syncApplicationItems(applications: Shell.App[], size: number): boolean {
        return this.applicationItems.sync(applications, size);
    }

    private refresh(syncVolumes = false): void {
        if (this.destroyed)
            return;
        this.refreshController.refresh(syncVolumes);
        // Application reconciliation may change the effective icon size.
        // Sync folders afterwards so they inherit the exact same current slot size.
        this.folders.sync();
        // Folder actors are created after the refresh controller's first order
        // pass. Reapply the shared mixed-item order now that every dock item
        // (applications, folders and system items) is mounted.
        this.itemOrder.apply();
        this.positionDock();
    }

    private syncFavoritesSeparator(vertical: boolean): void {
        const enabled = this.settings.get_boolean('show-favorites-separator');
        const favoriteIds = new Set(
            this.favorites.getFavorites().map(app => app.get_id()),
        );
        const firstNonFavorite = resolveFavoritesSeparatorTarget(
            this.itemActors.map(item => item._gOsDockApp),
            favoriteIds,
        );

        this.favoritesSeparator.sync(
            enabled ? this.itemActors.find(item =>
                item._gOsDockApp === firstNonFavorite,
            ) ?? null : null,
            vertical,
        );
    }

    private activateApp(app: Shell.App): void {
        this.activation.activate(app);
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
        this.actorSignals.destroy();
        this.runtimeSignals.destroy();
        this.settingsController.destroy();
        this.refreshController.destroy();
        this.layout.destroy();
        this.lifecycle.destroy();
        this.visibility.destroy();
        this.previews.destroy();
        this.windowTracker.destroy();
        this.contextMenu.destroy();
        this.applicationItems.destroy();
        this.folders.destroy();
        this.favoritesSeparator.destroy();
        this.dockItems.destroy();
        this.dragDrop.destroy();
        this.actor.destroy();
        this.background.destroy();
        this.edgeSensor.destroy();
    }
}
