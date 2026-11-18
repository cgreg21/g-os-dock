import Gio from 'gi://Gio?version=2.0';
import Clutter from 'gi://Clutter?version=51';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { DockView } from './view.js';
import { dockCache } from '../features/cache.js';
import { CleanupManager } from '../features/cleanup-manager.js';

/** Owns one dock view per selected monitor and their GNOME signal lifecycle. */
export class DockManager {
    private settings: Gio.Settings;
    private views: DockView[] = [];
    private signalCleanup: CleanupManager | null = null;
    private enabled = false;
    private overviewDashParent: Clutter.Actor | null = null;
    private overviewDashIndex = -1;
    private overviewDashWasVisible: boolean | null = null;

    constructor(settings: Gio.Settings) {
        this.settings = settings;
    }

    enable(): void {
        if (this.enabled)
            return;

        this.enabled = true;
        try {
            const dash = Main.overview.dash as Clutter.Actor & {
                visible: boolean;
            };
            const parent = dash.get_parent();
            if (!parent)
                throw new Error('GNOME Overview Dash has no parent actor');

            this.overviewDashWasVisible = dash.visible;
            this.overviewDashParent = parent;
            this.overviewDashIndex = parent.get_children().indexOf(dash);
            parent.remove_child(dash);
            this.rebuild();
            this.signalCleanup = new CleanupManager();
            this.signalCleanup.addSignal(
                Main.layoutManager,
                Main.layoutManager.connect('monitors-changed', () => this.rebuild()),
            );
            this.signalCleanup.addSignal(
                this.settings,
                this.settings.connect('changed::show-on-all-monitors', () => this.rebuild()),
            );
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    private rebuild(): void {
        this.destroyViews();

        const monitors = Main.layoutManager.monitors;
        if (monitors.length === 0)
            return;

        const showAll = this.settings.get_boolean('show-on-all-monitors');
        const primary = Main.layoutManager.primaryIndex;
        const primaryIndex = primary >= 0 && primary < monitors.length ? primary : 0;
        const targets = showAll ? monitors.map((_, index) => index) : [primaryIndex];

        try {
            for (const index of targets) {
                const monitor = monitors[index];
                if (monitor)
                    this.views.push(new DockView(index, monitor, this.settings));
            }
        } catch (error) {
            this.destroyViews();
            throw error;
        }
    }

    disable(): void {
        if (!this.enabled)
            return;

        this.enabled = false;
        this.restoreOverviewDash();
        this.signalCleanup?.clear();
        this.signalCleanup = null;
        this.destroyViews();
        dockCache.clear();
    }

    private restoreOverviewDash(): void {
        const parent = this.overviewDashParent;
        if (parent) {
            const dash = Main.overview.dash as Clutter.Actor & {
                show(): void;
                hide(): void;
            };
            if (!dash.get_parent()) {
                if (this.overviewDashIndex >= 0)
                    parent.insert_child_at_index(dash, this.overviewDashIndex);
                else
                    parent.add_child(dash);
            }

            if (this.overviewDashWasVisible)
                dash.show();
            else
                dash.hide();
        }

        this.overviewDashParent = null;
        this.overviewDashIndex = -1;
        this.overviewDashWasVisible = null;
    }

    private destroyViews(): void {
        for (const view of this.views)
            view.destroy();
        this.views = [];
    }
}
