import GLib from 'gi://GLib?version=2.0';
import St from 'gi://St?version=51';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { LifecycleScope } from '../../core/lifecycle-scope.js';
import { DockPositioner } from '../layout/dock-positioner.js';

/** Displays an application name after the pointer has rested on its dock item. */
export class DockTooltip {
    private actor: St.Label;
    private lifecycle = new LifecycleScope<St.Widget>({
        timeout: (delay, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, callback),
        idle: callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, callback),
        remove: sourceId => GLib.Source.remove(sourceId),
    },
    (actor, options) => Main.layoutManager.addTopChrome(actor, options),
    actor => Main.layoutManager.removeChrome(actor));
    private hoverSignal: number;
    private destroySignal: number;
    private destroyed = false;

    constructor(
        private parent: St.Widget,
        text: string,
        private position: () => string,
    ) {
        this.actor = new St.Label({
            text,
            style_class: 'g-os-dock-tooltip',
            visible: false,
            reactive: false,
            opacity: 0,
        });

        this.hoverSignal = parent.connect('notify::hover', () => {
            if (parent.hover)
                this.scheduleShow();
            else
                this.hide();
        });
        this.destroySignal = parent.connect('destroy', () => this.destroy());
        this.lifecycle.addSignal(parent, this.hoverSignal);
        this.lifecycle.addSignal(parent, this.destroySignal);
        this.lifecycle.chrome.add(this.actor, {
            affectsStruts: false,
            trackFullscreen: false,
        });
    }

    setText(text: string): void {
        this.actor.text = text;
        this.hide();
    }

    private scheduleShow(): void {
        this.lifecycle.tasks.timeout('show', 700, () => {
            if (!this.destroyed && this.parent.hover)
                this.show();
        });
    }

    private show(): void {
        const [x, y] = this.parent.get_transformed_position();
        const width = this.parent.width;
        const height = this.parent.height;
        this.actor.show();
        this.actor.opacity = 255;
        this.actor.set_position(0, 0);
        const [, , tooltipWidth, tooltipHeight] = this.actor.get_preferred_size();
        const point = DockPositioner.placeFloating(
            { x, y, width, height },
            { width: tooltipWidth, height: tooltipHeight },
            this.position() as 'top' | 'right' | 'bottom' | 'left',
            8,
            { x: 0, y: 0, width: global.stage.width, height: global.stage.height },
            8,
        );
        this.actor.set_position(point.x, point.y);
    }

    private hide(): void {
        this.lifecycle.tasks.cancel('show');
        this.actor.hide();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.lifecycle.destroy();
        this.actor.destroy();
    }
}
