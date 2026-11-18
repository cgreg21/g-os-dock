import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio?version=2.0';
import {
    resolveDockEdgeSensor,
    resolveDockSurfacePosition,
    type DockEdge,
    isVerticalDockPosition,
} from './dock-positioner.js';
import { calculateAvailableDockSpace } from './icon-sizing.js';

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

    availableSpace(vertical: boolean): number {
        const edge = this.settings.get_int('edge-distance');
        const border = this.settings.get_int('border-size') * 2;
        const padding = vertical
            ? this.settings.get_int('background-padding-top') +
                this.settings.get_int('background-padding-bottom')
            : this.settings.get_int('background-padding-left') +
                this.settings.get_int('background-padding-right');
        const panelBottom = this.getPanelBottom();
        const usableTop = panelBottom === null
            ? this.monitor.y
            : Math.min(this.monitor.y + this.monitor.height, panelBottom + edge);

        return calculateAvailableDockSpace({
            monitorWidth: this.monitor.width,
            monitorY: this.monitor.y,
            monitorHeight: this.monitor.height,
            usableTop,
            edgeDistance: edge,
            padding,
            border,
            vertical,
        });
    }

    position(): void {
        if (this.isDestroyed())
            return;

        const position = this.settings.get_string('dock-position');
        const vertical = isVerticalDockPosition(position);
        const orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;
        if (this.content.orientation !== orientation) {
            this.content.orientation = orientation;
            (this.actor as St.BoxLayout).orientation = orientation;
        }

        // Measure the content, not the outer actor: set_size() on the actor is
        // an explicit Clutter size request and would otherwise become the next
        // preferred size, preventing the dock from growing or shrinking later.
        // Child changes and orientation updates already invalidate layout;
        // avoid forcing another relayout on every position-only update.
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

        const panelBottom = this.getPanelBottom();
        const usableTop = panelBottom === null
            ? this.monitor.y
            : Math.min(this.monitor.y + this.monitor.height, panelBottom + edgeDistance);

        this.actor.set_size(width, height);
        this.background.set_size(width, height);

        const surfacePosition = resolveDockSurfacePosition(
            {
                x: this.monitor.x,
                y: this.monitor.y,
                width: this.monitor.width,
                height: this.monitor.height,
            },
            { width, height },
            position as DockEdge,
            edgeDistance,
            usableTop,
        );
        const x = surfacePosition.x;
        const y = surfacePosition.y;
        this.actor.set_position(Math.round(x), Math.round(y));

        // Center the decorative background on the actual icon content.
        // This keeps it visually centered even when the four padding values
        // are different, rather than centering it on the padded outer actor.
        this.syncBackgroundToContent(x, y, width, height, contentWidth, paddingLeft);
        this.positionSensor(panelBottom);
    }

    private syncBackgroundToContent(
        actorX: number,
        actorY: number,
        backgroundWidth: number,
        backgroundHeight: number,
        contentWidth: number,
        paddingLeft: number,
    ): void {
        if (this.isDestroyed())
            return;

        // Center the background on the actual content allocation. The content
        // starts after the actor's left padding, so account for that offset;
        // centering from actorX alone incorrectly shifts it when horizontal
        // background margins are added (or are asymmetric).
        const x = actorX + paddingLeft + (contentWidth - backgroundWidth) / 2;
        const y = actorY;
        this.background.set_size(backgroundWidth, backgroundHeight);
        this.background.set_position(Math.round(x), Math.round(y));
    }

    private getPanelBottom(): number | null {
        const panel = Main.panel as unknown as St.Widget;
        const [panelX, panelY] = panel.get_transformed_position();
        const panelBottom = panelY + panel.height;
        const intersectsMonitor =
            panelX < this.monitor.x + this.monitor.width &&
            panelX + panel.width > this.monitor.x;
        return intersectsMonitor && panelY <= this.monitor.y + 2 &&
            panelBottom > this.monitor.y
            ? panelBottom
            : null;
    }

    positionSensor(panelBottom = this.getPanelBottom()): void {
        if (this.isDestroyed())
            return;

        const position = this.settings.get_string('dock-position');
        const monitor = {
            x: this.monitor.x,
            y: this.monitor.y,
            width: this.monitor.width,
            height: this.monitor.height,
        };
        const topInset = panelBottom === null
            ? 0
            : Math.min(
                this.monitor.y + this.monitor.height,
                panelBottom + 8,
            ) - this.monitor.y;
        const sensor = resolveDockEdgeSensor({
            monitor,
            edge: position as DockEdge,
            thickness: EDGE_THICKNESS,
            topInset,
        });
        this.edgeSensor.set_position(sensor.x, sensor.y);
        this.edgeSensor.set_size(sensor.width, sensor.height);
    }
}
