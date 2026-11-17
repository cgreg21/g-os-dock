import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import Meta from 'gi://Meta?version=51';
import Gio from 'gi://Gio?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import { AppContextMenu } from '../features/context-menu/index.js';
import { DockDragDrop, type DockDragSource } from '../features/drag-and-drop.js';
import { DockVisibility } from '../features/visibility.js';
import { DockAppearance } from '../features/appearance.js';
import { DockLayout } from '../features/layout.js';
import { DockIndicators } from '../features/indicators.js';
import { WindowTracker } from '../features/window-tracker.js';
import { DockAppItemFactory, type DockAppButton } from '../features/app-item.js';
import { DockKeyboardNavigation } from '../features/keyboard-navigation.js';
import { WindowPreviews } from '../features/window-previews/index.js';

type MonitorGeometry = (typeof Main.layoutManager.monitors)[number];

const MAGNIFICATION_RADIUS = 2;
const MAGNIFICATION_FACTOR = 1.28;

export class DockView {
    private actor: St.ScrollView & { _delegate?: unknown };
    private content: St.BoxLayout;
    private edgeSensor: St.Widget;
    private monitor: MonitorGeometry;
    private monitorIndex: number;
    private settings: Gio.Settings;
    private desktopSettings: Gio.Settings;
    private desktopThemeSignal = 0;
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
    private previews: WindowPreviews;
    private dragDrop: DockDragDrop;
    private visibility: DockVisibility;
    private appearance: DockAppearance;
    private layout: DockLayout;
    private indicators: DockIndicators;
    private windowTracker: WindowTracker;
    private appItemFactory: DockAppItemFactory;
    private keyboard: DockKeyboardNavigation;

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
        this.actor = new St.ScrollView({
            style_class: 'g-os-dock',
            child: this.content,
            overlay_scrollbars: true,
            mouse_scrolling: true,
            reactive: true,
            track_hover: true,
        });
        this.actor.set_policy(St.PolicyType.NEVER, vertical
            ? St.PolicyType.AUTOMATIC
            : St.PolicyType.NEVER);
        this.appearance = new DockAppearance(this.actor, this.settings, this.desktopSettings);
        this.contextMenu = new AppContextMenu(this.actor, this.favorites);
        this.dragDrop = new DockDragDrop(
            this.content,
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
        this.layout = new DockLayout(
            this.actor,
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
            magnify: (index, enabled) => this.applyMagnification(index, enabled),
        });
        this.appItemFactory = new DockAppItemFactory({
            favorites: this.favorites,
            dragDrop: this.dragDrop,
            previews: this.previews,
            contextMenu: this.contextMenu,
            getItems: () => this.itemActors,
            isDockHovered: () => this.actor.hover,
            activateApp: app => this.activateApp(app),
            handleKeyPress: (item, event) => this.keyboard.handle(item, event),
            magnify: (index, enabled) => this.applyMagnification(index, enabled),
        });

        try {
            this.desktopThemeSignal = this.desktopSettings.connect(
                'changed::color-scheme',
                () => this.appearance.apply(),
            );
            Main.layoutManager.addChrome(this.actor, {
                affectsStruts: false,
                trackFullscreen: false,
            });
            Main.layoutManager.addChrome(this.edgeSensor, {
                affectsStruts: false,
                trackFullscreen: false,
            });
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
        const favorites = this.favorites.getFavorites();
        const running = this.appSystem.get_running();
        const result: Shell.App[] = [];
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

        const pendingItems: DockAppButton[] = [];
        try {
            const size = this.settings.get_int('icon-size');
            for (const app of this.getApplications()) {
                const item = this.createItem(app, size);
                pendingItems.push(item);
                this.content.add_child(item);
            }
        } catch (error) {
            for (const item of pendingItems) {
                this.dragDrop.release(item);
                if (item.get_parent())
                    item.get_parent()?.remove_child(item);
                item.destroy();
            }
            throw error;
        }

        const previousItems = this.itemActors;
        for (const item of previousItems) {
            this.dragDrop.release(item);
            item.destroy();
        }
        this.itemActors = pendingItems;
        this.appearance.apply();
        this.layout.position();
        this.applyMagnification(-1, false);
        this.updateIndicators();
        this.visibility.queueSmartHideCheck();
    }

    private createItem(app: Shell.App, size: number): DockAppButton {
        return this.appItemFactory.create(app, size);
    }

    private updateIndicators(): void {
        this.indicators.update(this.itemActors);
    }

    private activateApp(app: Shell.App): void {
        const windows = app.get_windows();
        if (windows.length > 0) {
            const focused = global.display.focus_window;
            const next = windows.find((window: Meta.Window) => window !== focused) ?? windows[0];
            if (next)
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
        this.layout.position();
    }

    private applySettings(): void {
        if (this.destroyed)
            return;
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
        if (this.workspaceSignal) global.workspace_manager.disconnect(this.workspaceSignal);
        if (this.windowCreatedSignal) global.display.disconnect(this.windowCreatedSignal);
        this.windowTracker.destroy();
        this.contextMenu.destroy();
        this.dragDrop.destroy();
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager.removeChrome(this.edgeSensor);
        this.actor.destroy();
        this.edgeSensor.destroy();
    }
}
