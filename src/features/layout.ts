import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio?version=2.0';

type MonitorGeometry = (typeof Main.layoutManager.monitors)[number];

const EDGE_THICKNESS = 3;

/** Positions the content-sized dock and its reveal sensor on the selected monitor. */
export class DockLayout {
    constructor(
        private actor: St.Widget,
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
        (this.actor as St.BoxLayout).orientation = this.content.orientation;

        // Measure the content, not the outer actor: set_size() on the actor is
        // an explicit Clutter size request and would otherwise become the next
        // preferred size, preventing the dock from growing or shrinking later.
        this.content.queue_relayout();
        this.actor.queue_relayout();
        const [contentMinWidth, contentNaturalWidth] = this.content.get_preferred_width(-1);
        const contentWidth = Math.max(contentMinWidth, contentNaturalWidth);
        const [contentMinHeight, contentNaturalHeight] =
            this.content.get_preferred_height(contentWidth);
        const contentHeight = Math.max(contentMinHeight, contentNaturalHeight);
        const paddingTop = this.settings.get_int('background-padding-top');
        const paddingRight = this.settings.get_int('background-padding-right');
        const paddingBottom = this.settings.get_int('background-padding-bottom');
        const paddingLeft = this.settings.get_int('background-padding-left');
        // The border is drawn by the background's CSS theme node. Its
        // thickness must not be added here as well, otherwise the border is
        // counted twice in the dock's outer dimensions.
        const width = Math.ceil(contentWidth + paddingLeft + paddingRight);
        const height = Math.ceil(contentHeight + paddingTop + paddingBottom);
        const edgeDistance = this.settings.get_int('edge-distance');

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
            ? Math.min(this.monitor.y + this.monitor.height, panelBottom + edgeDistance)
            : this.monitor.y;

        this.actor.set_size(width, height);
        this.background.set_size(width, height);

        const minX = this.monitor.x + edgeDistance;
        const maxX = Math.max(minX, this.monitor.x + this.monitor.width - width - edgeDistance);
        const minY = usableTop;
        const maxY = Math.max(minY, this.monitor.y + this.monitor.height - height - edgeDistance);

        let x = this.monitor.x + Math.round((this.monitor.width - width) / 2);
        let y = this.monitor.y + this.monitor.height - height - edgeDistance;
        if (position === 'top') {
            y = usableTop;
        } else if (position === 'left' || position === 'right') {
            x = position === 'left'
                ? minX
                : this.monitor.x + this.monitor.width - width - edgeDistance;
            y = usableTop + Math.round(
                (this.monitor.y + this.monitor.height - usableTop - height - edgeDistance) / 2,
            );
        }

        x = Math.max(minX, Math.min(x, maxX));
        y = Math.max(minY, Math.min(y, maxY));
        this.actor.set_position(Math.round(x), Math.round(y));

        // Center the decorative background on the actual icon content.
        // This keeps it visually centered even when the four padding values
        // are different, rather than centering it on the padded outer actor.
        this.syncBackgroundToContent(x, y, width, height, contentWidth);
        this.positionSensor();
    }

    private syncBackgroundToContent(
        actorX: number,
        actorY: number,
        backgroundWidth: number,
        backgroundHeight: number,
        contentWidth: number,
    ): void {
        if (this.isDestroyed())
            return;

        // Keep the background horizontally centered under the content,
        // but align its lower edge with the dock's lower edge.
        const x = actorX + (contentWidth - backgroundWidth) / 2;
        const y = actorY;
        this.background.set_size(backgroundWidth, backgroundHeight);
        this.background.set_position(Math.round(x), Math.round(y));
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
            this.edgeSensor.set_position(this.monitor.x + this.monitor.width - EDGE_THICKNESS, sensorTop);
            this.edgeSensor.set_size(EDGE_THICKNESS, sensorHeight);
        } else {
            this.edgeSensor.set_position(this.monitor.x, this.monitor.y + this.monitor.height - EDGE_THICKNESS);
            this.edgeSensor.set_size(this.monitor.width, EDGE_THICKNESS);
        }
    }
}
