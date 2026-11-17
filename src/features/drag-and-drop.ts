import Clutter from 'gi://Clutter?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import Shell from 'gi://Shell?version=51';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import type { DockAppButton } from './app-item.js';

type DragSource = { app?: Shell.App };
type DraggableDockItem = DockAppButton & {
    _delegate?: unknown;
    _gOsDockDraggable: ReturnType<typeof DND.makeDraggable>;
};
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

/** Handles favorite-app drag sources and dock drop targets. */
export class DockDragDrop {
    private dropTarget: DockAppButton | null = null;

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
        (item as DraggableDockItem)._gOsDockDraggable = DND.makeDraggable(item, { dragActorOpacity: 210 });
        (item as DraggableDockItem)._gOsDockDraggable.connect('drag-begin', () => {
            onStart();
            item.add_style_class_name('dragging');
        });
        item._gOsDockDraggable.connect('drag-end', () => {
            item.remove_style_class_name('dragging');
            this.clearDropTarget();
        });
        item._gOsDockDraggable.connect('drag-cancelled', () => {
            item.remove_style_class_name('dragging');
            this.clearDropTarget();
        });
    }

    handleDragOver(source: DragSource, _dragActor: Clutter.Actor, x: number, y: number, _time: number): number {
        if (!source?.app || !this.favorites.isFavorite(source.app.get_id())) {
            this.clearDropTarget();
            return DND.DragMotionResult.NO_DROP;
        }

        const vertical = this.isVertical();
        const coordinate = vertical ? y : x;
        const candidates = this.getItems().filter(item =>
            item._gOsDockApp &&
            item._gOsDockApp.get_id() !== source.app.get_id() &&
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

    acceptDrop(source: DragSource, _dragActor: Clutter.Actor, x: number, y: number, _time: number): boolean {
        this.clearDropTarget();
        if (!source?.app)
            return false;

        const appId = source.app.get_id();
        if (!this.favorites.isFavorite(appId))
            return false;

        const vertical = this.isVertical();
        const coordinate = vertical ? y : x;
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
        const currentIndex = favorites.findIndex(app => app.get_id() === appId);
        if (currentIndex >= 0 && currentIndex !== targetIndex)
            this.favorites.moveFavoriteToPos(appId, targetIndex);
        return true;
    }

    clearDropTarget(): void {
        if (!this.dropTarget)
            return;
        this.dropTarget.remove_style_class_name('drop-target');
        this.dropTarget = null;
    }

    destroy(): void {
        this.clearDropTarget();
    }

    private isVertical(): boolean {
        return ['left', 'right'].includes(this.settings.get_string('dock-position'));
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
