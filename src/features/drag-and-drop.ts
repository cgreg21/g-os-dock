import Clutter from 'gi://Clutter?version=51';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

/** Handles favorite-app drag sources and dock drop targets. */
export class DockDragDrop {
    private dropTarget: any = null;

    constructor(
        private actor: any,
        private settings: any,
        private favorites: any,
        private getItems: () => any[],
    ) {}

    makeFavoriteDraggable(item: any, app: any, onStart: () => void): void {
        item._delegate = {
            app,
            actor: item,
            getDragActor: () => new Clutter.Clone({ source: item }),
            getDragActorSource: () => item,
        };
        item._gOsDockDraggable = DND.makeDraggable(item, { dragActorOpacity: 210 });
        item._gOsDockDraggable.connect('drag-begin', () => {
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

    handleDragOver(source: any, _dragActor: any, x: number, y: number, _time: number): number {
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

        let nearest: any = null;
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

    acceptDrop(source: any, _dragActor: any, x: number, y: number, _time: number): boolean {
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
        const currentIndex = favorites.findIndex((app: any) => app.get_id() === appId);
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

    private getItemMidpoint(item: any, vertical: boolean): number | null {
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
