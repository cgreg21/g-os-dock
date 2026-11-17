import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import Meta from 'gi://Meta?version=51';
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
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

const MAGNIFICATION_RADIUS = 2.4;
const MAGNIFICATION_FACTOR = 1.55;
const MAGNIFICATION_DURATION = 190;

export class DockView {
    private actor: St.ScrollView & { _delegate?: unknown };
    private content: St.BoxLayout;
    private edgeSensor: St.Widget;
    private scrollStartZone: St.Widget;
    private scrollEndZone: St.Widget;
    private scrollStartHoverSignal = 0;
    private scrollEndHoverSignal = 0;
    private edgeScrollTimer = 0;
    private edgeScrollDirection = 0;
    private scrollAdjustmentSignals: Array<{ adjustment: { disconnect(id: number): void }; signal: number }> = [];
    private monitor: MonitorGeometry;
    private monitorIndex: number;
    private settings: Gio.Settings;
    private desktopSettings: Gio.Settings;
    private desktopThemeSignal = 0;
    private panelGeometrySignals: number[] = [];
    private appSystem: Shell.AppSystem;
    private favorites: ReturnType<typeof AppFavorites.getAppFavorites>;
    private hoverSignal = 0;
    private scrollSignal = 0;
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
            reactive: true,
            track_hover: true,
        });
        // Keep the adjustments available for scrolling without displaying scrollbars.
        this.actor.set_policy(St.PolicyType.NEVER, St.PolicyType.NEVER);
        this.actor.set_mouse_scrolling(true);
        this.appearance = new DockAppearance(this.actor, this.content, this.settings, this.desktopSettings);
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
        // Invisible hover zones at the two ends of the viewport replace
        // visible arrow buttons. Moving the pointer to an edge scrolls the
        // application icons continuously in that direction.
        this.scrollStartZone = new St.Widget({
            style_class: 'g-os-dock-edge-scroll-zone',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });
        this.scrollEndZone = new St.Widget({
            style_class: 'g-os-dock-edge-scroll-zone',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });
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
            ensureVisible: item => this.ensureItemVisible(item),
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
            Main.layoutManager.addChrome(this.scrollStartZone, {
                affectsStruts: false,
                trackFullscreen: false,
            });
            Main.layoutManager.addChrome(this.scrollEndZone, {
                affectsStruts: false,
                trackFullscreen: false,
            });
            this.scrollStartHoverSignal = this.scrollStartZone.connect('notify::hover', () => {
                this.setEdgeScrollDirection(this.scrollStartZone.hover ? -1 : 0);
            });
            this.scrollEndHoverSignal = this.scrollEndZone.connect('notify::hover', () => {
                this.setEdgeScrollDirection(this.scrollEndZone.hover ? 1 : 0);
            });
            for (const adjustment of [this.actor.get_hadjustment(), this.actor.get_vadjustment()]) {
                for (const property of ['upper', 'page-size']) {
                    this.scrollAdjustmentSignals.push({
                        adjustment,
                        signal: adjustment.connect(
                            `notify::${property}`,
                            () => this.updateScrollControls(),
                        ),
                    });
                }
            }
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
                        this.updateScrollControls();
                    },
                ));
            }
            this.hoverSignal = this.actor.connect(
                'notify::hover',
                () => this.onPointerChanged(),
            );
            this.scrollSignal = this.actor.connect('scroll-event', (_actor: St.ScrollView, event: Clutter.Event) => {
                const direction = event.get_scroll_direction();
                const position = this.settings.get_string('dock-position');
                const vertical = position === 'left' || position === 'right';
                const adjustment = vertical
                    ? this.actor.get_vadjustment()
                    : this.actor.get_hadjustment();
                const iconSize = this.settings.get_int('icon-size');
                const step = Math.max(iconSize, iconSize + this.settings.get_int('dock-spacing'));

                if (direction === Clutter.ScrollDirection.SMOOTH) {
                    const [dx, dy] = event.get_scroll_delta();

                    // Touchpads report smooth deltas instead of discrete directions.
                    // A vertical gesture remains useful on horizontal docks, while
                    // a native horizontal gesture takes precedence when available.
                    const smoothDelta = vertical
                        ? dy
                        : (Math.abs(dx) > 0.01 ? dx : dy);
                    if (Math.abs(smoothDelta) < 0.01)
                        return Clutter.EVENT_PROPAGATE;

                    adjustment.set_value(adjustment.get_value() + smoothDelta * step);
                    return Clutter.EVENT_STOP;
                }

                let delta = 0;
                if (vertical) {
                    if (direction === Clutter.ScrollDirection.UP)
                        delta = -1;
                    else if (direction === Clutter.ScrollDirection.DOWN)
                        delta = 1;
                } else {
                    if (direction === Clutter.ScrollDirection.LEFT || direction === Clutter.ScrollDirection.UP)
                        delta = -1;
                    else if (direction === Clutter.ScrollDirection.RIGHT || direction === Clutter.ScrollDirection.DOWN)
                        delta = 1;
                }

                if (delta === 0)
                    return Clutter.EVENT_PROPAGATE;

                adjustment.set_value(adjustment.get_value() + delta * step);
                return Clutter.EVENT_STOP;
            });
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
        this.updateScrollControls();
        this.applyMagnification(-1, false);
        this.updateIndicators();
        this.visibility.queueSmartHideCheck();
    }

    private createItem(app: Shell.App, size: number): DockAppButton {
        return this.appItemFactory.create(app, size);
    }

    private setEdgeScrollDirection(direction: number): void {
        this.edgeScrollDirection = direction;
        if (direction === 0) {
            if (this.edgeScrollTimer) {
                GLib.Source.remove(this.edgeScrollTimer);
                this.edgeScrollTimer = 0;
            }
            return;
        }
        if (this.edgeScrollTimer)
            return;

        this.edgeScrollTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (this.destroyed || this.edgeScrollDirection === 0) {
                this.edgeScrollTimer = 0;
                return GLib.SOURCE_REMOVE;
            }

            const vertical = this.isVerticalDock();
            const adjustment = vertical
                ? this.actor.get_vadjustment()
                : this.actor.get_hadjustment();
            const maximum = Math.max(0, adjustment.get_upper() - adjustment.get_page_size());
            const next = Math.max(0, Math.min(
                maximum,
                adjustment.get_value() + this.edgeScrollDirection * 10,
            ));
            if (Math.abs(next - adjustment.get_value()) < 0.5) {
                this.edgeScrollTimer = 0;
                return GLib.SOURCE_REMOVE;
            }

            adjustment.set_value(next);
            return GLib.SOURCE_CONTINUE;
        });
    }

    private isVerticalDock(): boolean {
        const position = this.settings.get_string('dock-position');
        return position === 'left' || position === 'right';
    }

    private updateScrollControls(): void {
        if (this.destroyed)
            return;
        const vertical = this.isVerticalDock();
        const adjustment = vertical
            ? this.actor.get_vadjustment()
            : this.actor.get_hadjustment();
        const overflow = adjustment.get_upper() > adjustment.get_page_size() + 1;
        const [x, y] = this.actor.get_transformed_position();
        const zoneSize = 24;

        if (vertical) {
            this.scrollStartZone.set_position(
                Math.round(x + (this.actor.width - zoneSize) / 2),
                Math.round(y),
            );
            this.scrollStartZone.set_size(zoneSize, Math.min(zoneSize, this.actor.height / 2));
            this.scrollEndZone.set_position(
                Math.round(x + (this.actor.width - zoneSize) / 2),
                Math.round(y + this.actor.height - zoneSize),
            );
            this.scrollEndZone.set_size(zoneSize, Math.min(zoneSize, this.actor.height / 2));
        } else {
            this.scrollStartZone.set_position(
                Math.round(x),
                Math.round(y + (this.actor.height - zoneSize) / 2),
            );
            this.scrollStartZone.set_size(Math.min(zoneSize, this.actor.width / 2), zoneSize);
            this.scrollEndZone.set_position(
                Math.round(x + this.actor.width - zoneSize),
                Math.round(y + (this.actor.height - zoneSize) / 2),
            );
            this.scrollEndZone.set_size(Math.min(zoneSize, this.actor.width / 2), zoneSize);
        }

        if (overflow) {
            this.scrollStartZone.show();
            this.scrollEndZone.show();
        } else {
            this.scrollStartZone.hide();
            this.scrollEndZone.hide();
            this.setEdgeScrollDirection(0);
        }
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

    private ensureItemVisible(item: DockAppButton): void {
        const position = this.settings.get_string('dock-position');
        const vertical = position === 'left' || position === 'right';
        const [itemX, itemY] = item.get_transformed_position();
        const [actorX, actorY] = this.actor.get_transformed_position();
        const margin = 4;

        if (vertical) {
            const itemTop = itemY - actorY;
            const itemBottom = itemTop + item.height;
            let delta = 0;
            if (itemTop < margin)
                delta = itemTop - margin;
            else if (itemBottom > this.actor.height - margin)
                delta = itemBottom - (this.actor.height - margin);

            if (delta !== 0) {
                const adjustment = this.actor.get_vadjustment();
                adjustment.set_value(adjustment.get_value() + delta);
            }
        } else {
            const itemLeft = itemX - actorX;
            const itemRight = itemLeft + item.width;
            let delta = 0;
            if (itemLeft < margin)
                delta = itemLeft - margin;
            else if (itemRight > this.actor.width - margin)
                delta = itemRight - (this.actor.width - margin);

            if (delta !== 0) {
                const adjustment = this.actor.get_hadjustment();
                adjustment.set_value(adjustment.get_value() + delta);
            }
        }
    }

    private applyMagnification(index: number, enabled: boolean): void {
        const base = this.settings.get_int('icon-size');
        const vertical = this.isVerticalDock();
        const lastIndex = this.itemActors.length - 1;

        this.itemActors.forEach((item, i) => {
            const distance = Math.abs(i - index);
            // A smooth bell-shaped curve avoids abrupt size steps between
            // the focused icon and its neighbours.
            const influence = enabled && index >= 0
                ? Math.exp(-0.5 * Math.pow(distance / MAGNIFICATION_RADIUS, 2))
                : 0;
            const scale = 1 + (MAGNIFICATION_FACTOR - 1) * influence;
            const push = index >= 0 && enabled
                ? Math.sign(i - index) * (scale - 1) * base * 0.42
                : 0;

            item.set_pivot_point(0.5, 0.5);
            item.ease({
                scaleX: scale,
                scaleY: scale,
                translationX: vertical ? 0 : push,
                translationY: vertical ? push : 0,
                duration: MAGNIFICATION_DURATION,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                ...(i === lastIndex ? {
                    onComplete: () => {
                        if (!this.destroyed) {
                            this.layout.position();
                            this.updateScrollControls();
                        }
                    },
                } : {}),
            });
        });
    }

    private applySettings(): void {
        if (this.destroyed)
            return;
        this.refresh();
        this.layout.position();
        this.updateScrollControls();
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
        if (this.scrollSignal) this.actor.disconnect(this.scrollSignal);
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
        this.dragDrop.destroy();
        for (const { adjustment, signal } of this.scrollAdjustmentSignals)
            adjustment.disconnect(signal);
        this.scrollAdjustmentSignals = [];
        Main.layoutManager.removeChrome(this.actor);
        Main.layoutManager.removeChrome(this.edgeSensor);
        if (this.scrollStartHoverSignal) this.scrollStartZone.disconnect(this.scrollStartHoverSignal);
        if (this.scrollEndHoverSignal) this.scrollEndZone.disconnect(this.scrollEndHoverSignal);
        this.setEdgeScrollDirection(0);
        Main.layoutManager.removeChrome(this.scrollStartZone);
        Main.layoutManager.removeChrome(this.scrollEndZone);
        this.actor.destroy();
        this.edgeSensor.destroy();
        this.scrollStartZone.destroy();
        this.scrollEndZone.destroy();
    }
}
