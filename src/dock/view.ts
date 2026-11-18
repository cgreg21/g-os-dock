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
import { DockTrashItem } from '../features/trash-item.js';
import { DockVolumeItems } from '../features/volume-items.js';

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
    private trashItem: DockTrashItem | null = null;
    private volumeItems: DockVolumeItems | null = null;
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
    }

    private connectPanelGeometrySignals(): void {
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
    }

    private connectContentGeometrySignal(): void {
        // Coalesce allocation notifications into one geometry update.
        this.contentGeometrySignals.push(
            this.content.connect('notify::allocation', () => this.queueLayoutUpdate()),
        );
    }

    private connectWindowSignals(): void {
        this.focusSignal = global.display.connect(
            'notify::focus-window',
            () => {
                this.indicators.update(this.itemActors);
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
    }

    private connectApplicationSignals(): void {
        this.appStateSignal = this.appSystem.connect(
            'app-state-changed',
            () => this.refresh(),
        );
        this.favoritesSignal = this.favorites.connect(
            'changed',
            () => this.refresh(),
        );
    }

    private connectThemeSignal(): void {
        this.desktopThemeSignal = this.desktopSettings.connect(
            'changed::color-scheme',
            () => {
                this.appearance.apply();
                this.queueLayoutUpdate();
            },
        );
    }

    private connectPointerSignals(): void {
        this.hoverSignal = this.actor.connect(
            'notify::hover',
            () => this.visibility.onPointerChanged(),
        );
        this.sensorHoverSignal = this.edgeSensor.connect('notify::hover', () => {
            if (this.edgeSensor.hover)
                this.visibility.show();
        });
    }

    private connectSettingsSignal(): void {
        this.settingsSignal = this.settings.connect(
            'changed',
            () => this.applySettings(),
        );
    }

    private connectSignals(): void {
        this.connectThemeSignal();
        this.connectPanelGeometrySignals();
        this.connectPointerSignals();
        this.connectSettingsSignal();
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
        // Keep the dock in two strict sections: favorites in their configured
        // order, followed by running applications that are not favorites.
        // Do not rely on AppSystem.get_running() ordering for this invariant.
        const favorites = this.favorites.getFavorites();
        const running = this.appSystem.get_running();
        const favoriteIds = new Set<string>();
        const seenIds = new Set<string>();
        const result: Shell.App[] = [];

        for (const app of favorites) {
            const id = app.get_id();
            if (!id || seenIds.has(id))
                continue;
            favoriteIds.add(id);
            seenIds.add(id);
            result.push(app);
        }

        // Running favorites are already represented in the first section.
        // Only non-favorites are appended, in the order reported by GNOME.
        for (const app of running) {
            const id = app.get_id();
            if (id && !seenIds.has(id)) {
                seenIds.add(id);
                result.push(app);
            }
        }

        const order = new Map(
            this.settings.get_strv('dock-item-order')
                .map((id, index) => [id, index]),
        );
        result.sort((a, b) => {
            const aId = a.get_id();
            const bId = b.get_id();
            const aFavorite = favoriteIds.has(aId);
            const bFavorite = favoriteIds.has(bId);

            if (aFavorite !== bFavorite)
                return aFavorite ? -1 : 1;

            return (order.get(`app:${aId}`) ?? Number.MAX_SAFE_INTEGER) -
                (order.get(`app:${bId}`) ?? Number.MAX_SAFE_INTEGER);
        });
        return result;
    }

    private getDndItems(): DockDndItem[] {
        const items: DockDndItem[] = this.itemActors.map(item =>
            this.createAppDndItem(item),
        );
        if (this.systemItem)
            items.push({ id: 'system:launcher', actor: this.systemItem.getActor() });
        if (this.trashItem)
            items.push({ id: 'system:trash', actor: this.trashItem.getActor() });
        if (this.volumeItems)
            items.push(...this.volumeItems.getDndItems());
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
        for (const id of appIds.slice(0, pinningBoundary)) {
            if (!this.favorites.isFavorite(id))
                this.favorites.addFavorite(id);
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
            for (let position = firstChanged; position <= lastChanged; position++)
                currentPositions.set(currentFavorites[position], position);
        }
    }

    private applySavedItemOrder(): void {
        const actors = this.getDndItems();
        const saved = this.getSavedItemOrder(actors);
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

    private getSavedItemOrder(actors: DockDndItem[]): string[] {
        const saved = this.settings.get_strv('dock-item-order');
        if (saved.length > 0)
            return saved;

        // One-time migration from the old launcher-only position setting.
        const legacy = actors
            .filter(item => item.id !== 'system:launcher')
            .map(item => item.id);
        const launcherIndex = actors.findIndex(item => item.id === 'system:launcher');
        if (launcherIndex >= 0) {
            const target = Math.max(0, Math.min(
                this.settings.get_int('system-icon-position'),
                legacy.length,
            ));
            legacy.splice(target, 0, 'system:launcher');
        }
        if (legacy.length > 0)
            this.settings.set_strv('dock-item-order', legacy);
        return legacy;
    }

    private getAvailableSpace(vertical: boolean): number {
        const edge = this.settings.get_int('edge-distance');
        const border = this.settings.get_int('border-size') * 2;
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
            return this.monitor.y + this.monitor.height - usableTop - edge -
                this.settings.get_int('background-padding-top') -
                this.settings.get_int('background-padding-bottom') - border;
        }

        return this.monitor.width - edge * 2 -
            this.settings.get_int('background-padding-left') -
            this.settings.get_int('background-padding-right') - border;
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
            (this.volumeItems?.getCount() ?? 0);
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
        const pending: DockAppButton[] = [];
        const sizeChanged = this.itemSize !== 0 && this.itemSize !== size;
        const previousById = new Map<string, DockAppButton>();
        const existingItems = new Set(this.itemActors);

        if (!sizeChanged) {
            for (const item of this.itemActors) {
                const id = item._gOsDockApp?.get_id();
                if (id)
                    previousById.set(id, item);
            }
        }

        try {
            for (const app of applications) {
                const id = app.get_id();
                let item: DockAppButton | undefined;
                if (id) {
                    item = previousById.get(id);
                    if (item)
                        previousById.delete(id);
                }
                if (!item)
                    item = this.appItemFactory.create(app, size);

                this.updateItemPadding(item, size);
                if (item.get_parent() !== this.content)
                    this.content.add_child(item);
                pending.push(item);
            }
        } catch (error) {
            for (const item of pending) {
                if (!existingItems.has(item))
                    this.destroyAppItem(item);
            }
            throw error;
        }

        const structureChanged = sizeChanged ||
            this.itemActors.length !== pending.length ||
            this.itemActors.some((item, index) =>
                item._gOsDockApp.get_id() !== pending[index]?._gOsDockApp.get_id(),
            );
        const retained = new Set(pending);

        for (const item of this.itemActors) {
            if (retained.has(item))
                continue;
            this.destroyAppItem(item);
        }

        this.itemActors = pending;
        this.itemSize = size;
        return structureChanged;
    }

    private destroyAppItem(item: DockAppButton): void {
        this.dragDrop.unregisterItem(item);
        item.get_parent()?.remove_child(item);
        item.destroy();
    }

    private refresh(): void {
        if (this.destroyed)
            return;

        const applications = this.getApplications();
        const configuredSize = this.settings.get_int('icon-size');
        const volumeItemsChanged = this.syncVolumeItems(configuredSize);
        const vertical = ['left', 'right'].includes(this.settings.get_string('dock-position'));
        const available = this.getAvailableSpace(vertical);
        const size = this.getIconSize(applications, available, vertical, configuredSize);

        const structureChanged = this.syncApplicationItems(applications, size);
        const systemItemChanged = this.syncSystemItem(size);
        const trashItemChanged = this.syncTrashItem(size);
        this.volumeItems?.setIconSize(size);
        this.applySavedItemOrder();
        this.syncFavoritesSeparator(size, vertical);

        if (structureChanged || systemItemChanged || trashItemChanged || volumeItemsChanged)
            this.layout.position();

        this.indicators.update(this.itemActors);
        this.visibility.queueSmartHideCheck();
    }

    private syncFavoritesSeparator(size: number, vertical: boolean): void {
        const enabled = this.settings.get_boolean('show-favorites-separator');
        const favoriteIds = new Set(
            this.favorites.getFavorites().map(app => app.get_id()),
        );
        let hasFavorite = false;
        let firstNonFavorite: DockAppButton | undefined;
        for (const item of this.itemActors) {
            if (favoriteIds.has(item._gOsDockApp.get_id())) {
                hasFavorite = true;
            } else {
                firstNonFavorite = item;
                break;
            }
        }

        if (!enabled || !hasFavorite || !firstNonFavorite) {
            this.removeFavoritesSeparator();
            return;
        }

        if (!this.favoritesSeparator) {
            this.favoritesSeparator = new St.Widget({
                style_class: 'g-os-dock-favorites-separator',
                reactive: false,
                can_focus: false,
                x_expand: false,
                y_expand: false,
                // BoxLayout otherwise fills children across its cross axis,
                // making a short separator occupy the full dock width/height.
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.content.add_child(this.favoritesSeparator);
        }

        const thickness = Math.max(1, this.settings.get_int('favorites-separator-size'));
        const length = Math.max(1, this.settings.get_int('favorites-separator-length'));
        const color = this.settings.get_string('favorites-separator-color');
        const opacity = this.settings.get_double('favorites-separator-opacity');
        // In a vertical dock the separator is horizontal (length = width);
        // in a horizontal dock it is vertical (length = height).
        const separatorWidth = vertical ? length : thickness;
        const separatorHeight = vertical ? thickness : length;
        this.favoritesSeparator.set_size(separatorWidth, separatorHeight);
        this.favoritesSeparator.set_style(
            `background-color: ${color}; opacity: ${opacity}; ` +
            `border-radius: ${Math.ceil(thickness / 2)}px; ` +
            `width: ${separatorWidth}px; min-width: ${separatorWidth}px; max-width: ${separatorWidth}px; ` +
            `height: ${separatorHeight}px; min-height: ${separatorHeight}px; max-height: ${separatorHeight}px; ` +
            (vertical ? 'margin: 4px 0;' : 'margin: 0 4px;'),
        );

        const targetIndex = this.content.get_children().indexOf(firstNonFavorite);
        if (targetIndex >= 0 &&
            this.content.get_children()[targetIndex - 1] !== this.favoritesSeparator) {
            this.content.set_child_at_index(this.favoritesSeparator, targetIndex);
        }
    }

    private removeFavoritesSeparator(): void {
        if (!this.favoritesSeparator)
            return;
        this.favoritesSeparator.get_parent()?.remove_child(this.favoritesSeparator);
        this.favoritesSeparator.destroy();
        this.favoritesSeparator = null;
    }

    private syncSystemItem(size: number): boolean {
        const result = this.syncOptionalItem(
            this.systemItem,
            this.settings.get_boolean('show-system-icon'),
            () => new DockSystemItem(
                this.content, this.settings, size,
                () => this.settings.get_string('dock-position'),
                this.dragDrop,
            ),
            size,
        );
        this.systemItem = result.item;
        return result.changed;
    }

    private syncOptionalItem<T extends {
        setIconSize(size: number): void;
        destroy(): void;
    }>(
        current: T | null,
        enabled: boolean,
        create: () => T,
        size: number,
    ): { item: T | null; changed: boolean } {
        if (!enabled) {
            if (!current)
                return { item: null, changed: false };
            current.destroy();
            return { item: null, changed: true };
        }

        if (!current)
            return { item: create(), changed: true };

        current.setIconSize(size);
        return { item: current, changed: false };
    }

    private syncVolumeItems(size: number): boolean {
        if (!this.volumeItems) {
            this.volumeItems = new DockVolumeItems(
                this.content,
                this.settings,
                this.dragDrop,
                size,
                () => this.refresh(),
                () => this.settings.get_string('dock-position'),
            );
            return true;
        }
        return this.volumeItems.sync();
    }

    private syncTrashItem(size: number): boolean {
        const result = this.syncOptionalItem(
            this.trashItem,
            this.settings.get_boolean('show-trash-icon'),
            () => new DockTrashItem(
                this.content,
                this.settings,
                size,
                this.dragDrop,
                () => this.settings.get_string('dock-position'),
            ),
            size,
        );
        this.trashItem = result.item;
        return result.changed;
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

    private applySettings(): void {
        if (this.destroyed)
            return;

        this.applyDevelopmentStyle();
        this.appearance.apply();
        this.refresh();
        this.layout.position();
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

    private disconnectGeometrySignals(): void {
        const panel = Main.panel as St.Widget;
        for (const signal of this.panelGeometrySignals)
            panel.disconnect(signal);
        this.panelGeometrySignals = [];

        for (const signal of this.contentGeometrySignals)
            this.content.disconnect(signal);
        this.contentGeometrySignals = [];
    }

    private disconnectPointerSignals(): void {
        if (this.hoverSignal) this.actor.disconnect(this.hoverSignal);
        if (this.sensorHoverSignal) this.edgeSensor.disconnect(this.sensorHoverSignal);
    }

    private disconnectSettingsSignals(): void {
        if (this.settingsSignal) this.settings.disconnect(this.settingsSignal);
        if (this.desktopThemeSignal) this.desktopSettings.disconnect(this.desktopThemeSignal);
    }

    private disconnectApplicationSignals(): void {
        if (this.appStateSignal) this.appSystem.disconnect(this.appStateSignal);
        if (this.favoritesSignal) this.favorites.disconnect(this.favoritesSignal);
    }

    private disconnectWindowSignals(): void {
        if (this.focusSignal) global.display.disconnect(this.focusSignal);
        if (this.restackedSignal) global.display.disconnect(this.restackedSignal);
        if (this.workspaceSignal) global.workspace_manager.disconnect(this.workspaceSignal);
        if (this.windowCreatedSignal) global.display.disconnect(this.windowCreatedSignal);
    }

    private disconnectSignals(): void {
        this.disconnectPointerSignals();
        this.disconnectSettingsSignals();
        this.disconnectApplicationSignals();
        this.disconnectWindowSignals();
        this.disconnectGeometrySignals();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        if (this.layoutIdleSource) {
            GLib.Source.remove(this.layoutIdleSource);
            this.layoutIdleSource = 0;
        }
        this.disconnectSignals();
        this.visibility.destroy();
        this.previews.destroy();
        this.windowTracker.destroy();
        this.contextMenu.destroy();
        this.removeFavoritesSeparator();
        this.systemItem?.destroy();
        this.systemItem = null;
        this.trashItem?.destroy();
        this.trashItem = null;
        this.volumeItems?.destroy();
        this.volumeItems = null;
        this.dragDrop.destroy();
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager.removeChrome(this.background);
        Main.layoutManager.removeChrome(this.edgeSensor);
        this.actor.destroy();
        this.background.destroy();
        this.edgeSensor.destroy();
    }
}
