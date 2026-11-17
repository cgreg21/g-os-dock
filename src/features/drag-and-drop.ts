import Clutter from 'gi://Clutter?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import Shell from 'gi://Shell?version=51';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import type { DockAppButton } from './app-item.js';

export type DockDragSource = { app?: Shell.App };

/** Handles favorite-app drag sources and dock drop targets. */
export class DockDragDrop {
    private dropTarget: DockAppButton | null = null;
    private draggables = new Map<DockAppButton, DND.Draggable>();

    constructor(
        private actor: St.Widget,
        private settings: Gio.Settings,
        private favorites: ReturnType<typeof AppFavorites.getAppFavorites>,
        private getItems: () => DockAppButton[],
    ) {}

    makeFavoriteDraggable(item: DockAppButton, app: Shell.App, onStart: () => void): void {
        item._delegate = {
            app,
            actor: item,
            getDragActor: () => new Clutter.Clone({ source: item }),
            getDragActorSource: () => item,
        };
        const draggable = DND.makeDraggable(item, { dragActorOpacity: 210 });
        // Keep the GJS wrapper alive for as long as its dock actor is displayed.
        this.draggables.set(item, draggable);
        draggable.connect('drag-begin', () => {
            onStart();
            item.add_style_class_name('dragging');
        });
        draggable.connect('drag-end', () => {
            item.remove_style_class_name('dragging');
            this.clearDropTarget();
        });
        draggable.connect('drag-cancelled', () => {
            item.remove_style_class_name('dragging');
            this.clearDropTarget();
        });
    }

    handleDragOver(source: DockDragSource, _dragActor: Clutter.Actor, x: number, y: number, _time: number): number {
        const app = source?.app;
        if (!app || !this.favorites.isFavorite(app.get_id())) {
            this.clearDropTarget();
            return DND.DragMotionResult.NO_DROP;
        }

        const appId = app.get_id();
        const vertical = this.isVertical();
        const [localX, localY] = this.toLocalPoint(x, y);
        const coordinate = vertical ? localY : localX;
        this.autoScroll(vertical, localX, localY);
        const candidates = this.getItems().filter(item =>
            item._gOsDockApp &&
            item._gOsDockApp.get_id() !== appId &&
            this.favorites.isFavorite(item._gOsDockApp.get_id()));

        let nearest: DockAppButton | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const item of candidates) {
            const midpoint = this.getItemMidpoint(item, vertical);
            if (midpoint === null)
                continue;
            const distance = Math.abs(coordinate - midpoint);
            if (distance < nearestDistance) {
                nearest = item;
                nearestDistance = distance;
            }
        }

        if (nearest !== this.dropTarget) {
            this.clearDropTarget();
            this.dropTarget = nearest;
            this.dropTarget?.add_style_class_name('drop-target');
        }
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source: DockDragSource, _dragActor: Clutter.Actor, x: number, y: number, _time: number): boolean {
        this.clearDropTarget();
        const app = source?.app;
        if (!app)
            return false;

        const appId = app.get_id();
        if (!this.favorites.isFavorite(appId))
            return false;

        const vertical = this.isVertical();
        const [localX, localY] = this.toLocalPoint(x, y);
        const coordinate = vertical ? localY : localX;
        const favorites = this.favorites.getFavorites();
        const targets = this.getItems().filter(item =>
            item._gOsDockApp &&
            item._gOsDockApp.get_id() !== appId &&
            this.favorites.isFavorite(item._gOsDockApp.get_id()));

        let targetIndex = 0;
        for (const item of targets) {
            const midpoint = this.getItemMidpoint(item, vertical);
            if (midpoint !== null && coordinate > midpoint)
                targetIndex++;
        }

        targetIndex = Math.max(0, Math.min(targetIndex, favorites.length - 1));
        const currentIndex = favorites.findIndex(favorite => favorite.get_id() === appId);
        if (currentIndex >= 0 && currentIndex !== targetIndex)
            this.favorites.moveFavoriteToPos(appId, targetIndex);
        return true;
    }

    release(item: DockAppButton): void {
        this.draggables.delete(item);
        if (this.dropTarget === item)
            this.clearDropTarget();
    }

    clearDropTarget(): void {
        if (!this.dropTarget)
            return;
        this.dropTarget.remove_style_class_name('drop-target');
        this.dropTarget = null;
    }

    destroy(): void {
        this.clearDropTarget();
        this.draggables.clear();
    }

    private isVertical(): boolean {
        return ['left', 'right'].includes(this.settings.get_string('dock-position'));
    }


    /** Convert DND's stage coordinates into the scroll view's local space. */
    private toLocalPoint(stageX: number, stageY: number): [number, number] {
        const [valid, localX, localY] = this.actor.transform_stage_point(stageX, stageY);
        return valid ? [localX, localY] : [stageX, stageY];
    }

    /** Scroll the viewport while a favorite is dragged near its leading/trailing edge. */
    private autoScroll(vertical: boolean, x: number, y: number): void {
        const extent = vertical ? this.actor.height : this.actor.width;
        const coordinate = vertical ? y : x;
        const edge = Math.min(36, Math.max(18, extent * 0.15));
        let direction = 0;
        if (coordinate < edge)
            direction = -1;
        else if (coordinate > extent - edge)
            direction = 1;
        if (direction === 0)
            return;

        const adjustment = vertical
            ? (this.actor as St.ScrollView).get_vadjustment()
            : (this.actor as St.ScrollView).get_hadjustment();
        const lower = adjustment.get_lower();
        const maximum = Math.max(lower, adjustment.get_upper() - adjustment.get_page_size());
        const step = Math.max(12, Math.round(this.settings.get_int('icon-size') / 2));
        const next = Math.max(lower, Math.min(maximum, adjustment.get_value() + direction * step));
        if (next !== adjustment.get_value())
            adjustment.set_value(next);
    }

    private getItemMidpoint(item: DockAppButton, vertical: boolean): number | null {
        const [x, y] = item.get_transformed_position();
        const [valid, localX, localY] = this.actor.transform_stage_point(
            x + item.width / 2,
            y + item.height / 2,
        );
        if (!valid)
            return null;
        return vertical ? localY : localX;
    }
}
