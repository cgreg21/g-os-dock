import Clutter from 'gi://Clutter?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { dockCache } from './cache.js';

/**
 * Owns the presentation and lifecycle of the separator between favorites
 * and running applications. The caller supplies the first running app actor,
 * keeping application ordering and favorite semantics outside this component.
 */
export class DockFavoritesSeparatorController {
    private actor: St.Widget | null = null;
    private style = '';
    private dimensions = '';
    private destroyed = false;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly settings: Gio.Settings,
    ) {}

    sync(firstRunningItem: St.Widget | null, vertical: boolean): void {
        if (this.destroyed)
            return;

        if (!this.settings.get_boolean('show-favorites-separator') || !firstRunningItem) {
            this.remove();
            return;
        }

        const actor = this.ensureActor();
        const thickness = Math.max(1, this.settings.get_int('favorites-separator-size'));
        const length = Math.max(1, this.settings.get_int('favorites-separator-length'));
        const color = this.settings.get_string('favorites-separator-color');
        const opacity = this.settings.get_double('favorites-separator-opacity');
        // A vertical dock uses a horizontal separator, and vice versa.
        const width = vertical ? length : thickness;
        const height = vertical ? thickness : length;
        const style = dockCache.getOrCreate(
            `favorites-separator-style:${color}:${opacity}:${thickness}:${width}:${height}:${vertical}`,
            () =>
                `background-color: ${color}; opacity: ${opacity}; ` +
                `border-radius: ${Math.ceil(thickness / 2)}px; ` +
                `width: ${width}px; min-width: ${width}px; max-width: ${width}px; ` +
                `height: ${height}px; min-height: ${height}px; max-height: ${height}px; ` +
                (vertical ? 'margin: 4px 0;' : 'margin: 0 4px;'),
        );
        const dimensions = `${width}x${height}`;
        if (this.dimensions !== dimensions) {
            actor.set_size(width, height);
            this.dimensions = dimensions;
        }
        if (this.style !== style) {
            actor.set_style(style);
            this.style = style;
        }

        const children = this.content.get_children();
        const targetIndex = children.indexOf(firstRunningItem);
        if (targetIndex >= 0 && children[targetIndex - 1] !== actor)
            this.content.set_child_at_index(actor, targetIndex);
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.remove();
    }

    private ensureActor(): St.Widget {
        if (this.actor)
            return this.actor;

        const actor = new St.Widget({
            style_class: 'g-os-dock-favorites-separator',
            reactive: false,
            can_focus: false,
            x_expand: false,
            y_expand: false,
            // Prevent BoxLayout from stretching the separator across its cross axis.
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.content.add_child(actor);
        this.actor = actor;
        return actor;
    }

    private remove(): void {
        if (!this.actor)
            return;
        this.actor.get_parent()?.remove_child(this.actor);
        this.actor.destroy();
        this.actor = null;
        this.style = '';
        this.dimensions = '';
    }
}
