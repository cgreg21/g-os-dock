import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio?version=2.0';

type MonitorGeometry = (typeof Main.layoutManager.monitors)[number];

const EDGE_THICKNESS = 3;

/** Calculates dock and reveal-sensor geometry for its monitor. */
export class DockLayout {
    constructor(
        private actor: St.BoxLayout,
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
        this.actor.orientation = vertical
            ? Clutter.Orientation.VERTICAL
            : Clutter.Orientation.HORIZONTAL;

        const [minWidth, naturalWidth] = this.actor.get_preferred_width(-1);
        const [minHeight, naturalHeight] = this.actor.get_preferred_height(-1);
        const width = Math.max(minWidth, naturalWidth);
        const height = Math.max(minHeight, naturalHeight);

        let x = this.monitor.x + Math.round((this.monitor.width - width) / 2);
        let y = this.monitor.y + this.monitor.height - height - 12;

        if (position === 'top') {
            y = this.monitor.y + 12;
        } else if (position === 'left') {
            x = this.monitor.x;
            y = this.monitor.y + Math.round((this.monitor.height - height) / 2);
        } else if (position === 'right') {
            x = this.monitor.x + this.monitor.width - width;
            y = this.monitor.y + Math.round((this.monitor.height - height) / 2);
        }

        this.actor.set_position(x, y);
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
