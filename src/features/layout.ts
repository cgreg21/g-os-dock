import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio?version=2.0';

type MonitorGeometry = (typeof Main.layoutManager.monitors)[number];

const EDGE_THICKNESS = 3;

/** Calculates dock and reveal-sensor geometry for its monitor. */
export class DockLayout {
    constructor(
        private actor: St.ScrollView,
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
        const width = Math.max(minWidth, naturalWidth);
        const height = Math.max(minHeight, naturalHeight);
        const viewportWidth = vertical
            ? width
            : Math.min(width, Math.max(1, this.monitor.width - 24));
        const viewportHeight = vertical
            ? Math.min(height, Math.max(1, this.monitor.height - 24))
            : height;

        this.actor.set_policy(
            vertical ? St.PolicyType.NEVER : St.PolicyType.AUTOMATIC,
            vertical ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER,
        );
        this.actor.set_size(viewportWidth, viewportHeight);

        let x = this.monitor.x + Math.round((this.monitor.width - viewportWidth) / 2);
        let y = this.monitor.y + this.monitor.height - viewportHeight - 12;

        if (position === 'top') {
            y = this.monitor.y + 12;
        } else if (position === 'left') {
            x = this.monitor.x;
            y = this.monitor.y + Math.round((this.monitor.height - viewportHeight) / 2);
        } else if (position === 'right') {
            x = this.monitor.x + this.monitor.width - viewportWidth;
            y = this.monitor.y + Math.round((this.monitor.height - viewportHeight) / 2);
        }

        // Keep oversized docks anchored to the monitor instead of centering
        // them at a negative stage coordinate. This is especially important
        // for vertical docks with many running/favorite applications.
        const maxX = Math.max(this.monitor.x, this.monitor.x + this.monitor.width - viewportWidth);
        const maxY = Math.max(this.monitor.y, this.monitor.y + this.monitor.height - viewportHeight);
        x = Math.max(this.monitor.x, Math.min(x, maxX));
        y = Math.max(this.monitor.y, Math.min(y, maxY));

        this.actor.set_position(Math.round(x), Math.round(y));
        this.positionSensor();
    }

    positionSensor(): void {
        if (this.isDestroyed())
            return;

        const position = this.settings.get_string('dock-position');
        if (position === 'top') {
            this.edgeSensor.set_position(this.monitor.x, this.monitor.y);
            this.edgeSensor.set_size(this.monitor.width, EDGE_THICKNESS);
        } else if (position === 'left') {
            this.edgeSensor.set_position(this.monitor.x, this.monitor.y);
            this.edgeSensor.set_size(EDGE_THICKNESS, this.monitor.height);
        } else if (position === 'right') {
            this.edgeSensor.set_position(
                this.monitor.x + this.monitor.width - EDGE_THICKNESS,
                this.monitor.y,
            );
            this.edgeSensor.set_size(EDGE_THICKNESS, this.monitor.height);
        } else {
            this.edgeSensor.set_position(
                this.monitor.x,
                this.monitor.y + this.monitor.height - EDGE_THICKNESS,
            );
            this.edgeSensor.set_size(this.monitor.width, EDGE_THICKNESS);
        }
    }
}
