import GLib from 'gi://GLib?version=2.0';
import St from 'gi://St?version=51';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** Displays an application name after the pointer has rested on its dock item. */
export class DockTooltip {
    private actor: St.Label;
    private timeoutId = 0;
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
        Main.layoutManager.addTopChrome(this.actor, {
            affectsStruts: false,
            trackFullscreen: false,
        });
    }

    setText(text: string): void {
        this.actor.text = text;
        this.hide();
    }

    private scheduleShow(): void {
        this.cancelTimeout();
        this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => {
            this.timeoutId = 0;
            if (!this.destroyed && this.parent.hover)
                this.show();
            return GLib.SOURCE_REMOVE;
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
        let left = x + (width - tooltipWidth) / 2;
        let top = y + (height - tooltipHeight) / 2;

        switch (this.position()) {
            case 'top':
                top = y + height + 8;
                break;
            case 'bottom':
                top = y - tooltipHeight - 8;
                break;
            case 'left':
                left = x + width + 8;
                break;
            case 'right':
                left = x - tooltipWidth - 8;
                break;
        }

        left = Math.max(8, Math.min(left, global.stage.width - tooltipWidth - 8));
        top = Math.max(8, Math.min(top, global.stage.height - tooltipHeight - 8));
        this.actor.set_position(Math.round(left), Math.round(top));
    }

    private hide(): void {
        this.cancelTimeout();
        this.actor.hide();
    }

    private cancelTimeout(): void {
        if (this.timeoutId) {
            GLib.source_remove(this.timeoutId);
            this.timeoutId = 0;
        }
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cancelTimeout();
        if (this.hoverSignal)
            this.parent.disconnect(this.hoverSignal);
        if (this.destroySignal)
            this.parent.disconnect(this.destroySignal);
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }
}
