import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio?version=2.0';

type MonitorGeometry = (typeof Main.layoutManager.monitors)[number];

const EDGE_THICKNESS = 3;
const DOCK_SCREEN_MARGIN = 12;
// The ScrollView frame has 8px padding and may have a 1px border on each side.
const DOCK_FRAME_INSET = 18;

/** Calculates dock and reveal-sensor geometry for its monitor. */
export class DockLayout {
    constructor(
        private actor: St.ScrollView,
        private background: St.Widget,
        private content: St.BoxLayout,
        private edgeSensor: St.Widget,
        private monitor: MonitorGeometry,
        private settings: Gio.Settings,
        private isDestroyed: () => boolean,
    ) {}

    position(): void {
        if (this.isDestroyed())
            return;

        const position = this.settings.get_string('dock-position');
        const vertical = position === 'left' || position === 'right';
        this.content.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;

        const [minWidth, naturalWidth] = this.content.get_preferred_width(-1);
        const [minHeight, naturalHeight] = this.content.get_preferred_height(-1);
        // Measure the full natural content in both axes. The viewport must also
        // include the ScrollView's CSS padding/border, otherwise the first/last
        // icons are clipped and the dock appears smaller than its contents.
        const contentWidth = Math.max(minWidth, naturalWidth);
        const contentHeight = Math.max(minHeight, naturalHeight);
        const width = contentWidth + DOCK_FRAME_INSET;
        const height = contentHeight + DOCK_FRAME_INSET;

        // GNOME's top panel is a separate chrome actor. Keep the dock and its
        // reveal sensor below it on the primary monitor instead of allowing
        // either actor to cover the panel.
        const panel = Main.panel as unknown as St.Widget;
        const [panelX, panelY] = panel.get_transformed_position();
        const panelBottom = panelY + panel.height;
        const panelIntersectsMonitor =
            panelX < this.monitor.x + this.monitor.width &&
            panelX + panel.width > this.monitor.x;
        const panelAtMonitorTop = panelIntersectsMonitor &&
            panelY <= this.monitor.y + 2 &&
            panelBottom > this.monitor.y;
        const usableTop = panelAtMonitorTop
            ? Math.min(this.monitor.y + this.monitor.height, panelBottom + 8)
            : this.monitor.y;
        // Reserve a small margin on every side. Clamp both dimensions, not
        // only the scrolling axis: large icons or magnification must never
        // make a vertical dock wider than its monitor (or a horizontal dock
        // taller than its monitor).
        const viewportWidth = Math.min(width, Math.max(1, this.monitor.width - DOCK_SCREEN_MARGIN * 2));
        const availableHeight = Math.max(1, this.monitor.y + this.monitor.height - usableTop - DOCK_SCREEN_MARGIN * 2);
        const viewportHeight = Math.min(height, availableHeight);

        this.actor.set_policy(
            vertical ? St.PolicyType.NEVER : St.PolicyType.AUTOMATIC,
            vertical ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER,
        );
        this.background.set_size(viewportWidth, viewportHeight);
        this.actor.set_size(viewportWidth, viewportHeight);

        const minX = this.monitor.x + DOCK_SCREEN_MARGIN;
        const maxX = Math.max(
            minX,
            this.monitor.x + this.monitor.width - viewportWidth - DOCK_SCREEN_MARGIN,
        );
        let x = minX + Math.round((this.monitor.width - DOCK_SCREEN_MARGIN * 2 - viewportWidth) / 2);
        let y = this.monitor.y + this.monitor.height - viewportHeight - DOCK_SCREEN_MARGIN;

        if (position === 'top') {
            y = usableTop + DOCK_SCREEN_MARGIN;
        } else if (position === 'left') {
            x = minX;
            y = usableTop + Math.round((this.monitor.y + this.monitor.height - usableTop - viewportHeight) / 2);
        } else if (position === 'right') {
            x = maxX;
            y = usableTop + Math.round((this.monitor.y + this.monitor.height - usableTop - viewportHeight) / 2);
        }

        // Keep oversized docks anchored to the monitor instead of centering
        // them at a negative stage coordinate. This is especially important
        // for vertical docks with many running/favorite applications.
        const minY = usableTop;
        const maxY = Math.max(minY, this.monitor.y + this.monitor.height - viewportHeight - DOCK_SCREEN_MARGIN);
        x = Math.max(minX, Math.min(x, maxX));
        y = Math.max(minY, Math.min(y, maxY));

        this.background.set_position(Math.round(x), Math.round(y));
        this.actor.set_position(Math.round(x), Math.round(y));
        this.positionSensor();
    }

    positionSensor(): void {
        if (this.isDestroyed())
            return;

        const position = this.settings.get_string('dock-position');
        const panel = Main.panel as unknown as St.Widget;
        const [panelX, panelY] = panel.get_transformed_position();
        const panelBottom = panelY + panel.height;
        const panelIntersectsMonitor =
            panelX < this.monitor.x + this.monitor.width &&
            panelX + panel.width > this.monitor.x;
        const panelAtMonitorTop = panelIntersectsMonitor &&
            panelY <= this.monitor.y + 2 &&
            panelBottom > this.monitor.y;
        const sensorTop = panelAtMonitorTop
            ? Math.min(this.monitor.y + this.monitor.height, panelBottom + 8)
            : this.monitor.y;
        const sensorHeight = Math.max(EDGE_THICKNESS, this.monitor.y + this.monitor.height - sensorTop);

        if (position === 'top') {
            this.edgeSensor.set_position(this.monitor.x, sensorTop);
            this.edgeSensor.set_size(this.monitor.width, EDGE_THICKNESS);
        } else if (position === 'left') {
            this.edgeSensor.set_position(this.monitor.x, sensorTop);
            this.edgeSensor.set_size(EDGE_THICKNESS, sensorHeight);
        } else if (position === 'right') {
            this.edgeSensor.set_position(
                this.monitor.x + this.monitor.width - EDGE_THICKNESS,
                sensorTop,
            );
            this.edgeSensor.set_size(EDGE_THICKNESS, sensorHeight);
        } else {
            this.edgeSensor.set_position(
                this.monitor.x,
                this.monitor.y + this.monitor.height - EDGE_THICKNESS,
            );
            this.edgeSensor.set_size(this.monitor.width, EDGE_THICKNESS);
        }
    }
}
