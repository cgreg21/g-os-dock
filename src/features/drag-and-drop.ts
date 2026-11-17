import Clutter from 'gi://Clutter?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import Shell from 'gi://Shell?version=51';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import type { DockAppButton } from './app-item.js';

export type DockDragSource = { app?: Shell.App; systemItem?: boolean };

/** Handles favorite-app drag sources and dock drop targets. */
export class DockDragDrop {
    private dropTarget: DockAppButton | null = null;
    private draggedItem: DockAppButton | null = null;
    private previewSlot: St.Widget | null = null;
    private previewIndex: number | null = null;
    private systemDropIndex: number | null = null;
    private draggables = new Map<DockAppButton, DND.Draggable>();

    constructor(
        private actor: St.Widget,
        private content: St.BoxLayout,
        private settings: Gio.Settings,
        private favorites: ReturnType<typeof AppFavorites.getAppFavorites>,
        private getItems: () => DockAppButton[],
        private setSystemPosition: (index: number) => void,
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
            this.beginPreview(item);
        });
        draggable.connect('drag-end', () => {
            item.remove_style_class_name('dragging');
            this.clearDropTarget();
            this.endPreview();
        });
        draggable.connect('drag-cancelled', () => {
            item.remove_style_class_name('dragging');
            this.clearDropTarget();
            this.endPreview();
        });
    }

    handleDragOver(source: DockDragSource, _dragActor: Clutter.Actor, x: number, y: number, _time: number): number {
        if (source?.systemItem) {
            const vertical = this.isVertical();
            const coordinate = vertical ? y : x;
            let index = 0;
            for (const item of this.getItems()) {
                const midpoint = this.getItemMidpoint(item, vertical);
                if (midpoint !== null && coordinate > midpoint)
                    index++;
            }
            this.systemDropIndex = index;
            return DND.DragMotionResult.MOVE_DROP;
        }
        const app = source?.app;
        if (!app || !this.favorites.isFavorite(app.get_id())) {
            this.clearDropTarget();
            return DND.DragMotionResult.NO_DROP;
        }

        const appId = app.get_id();
        const vertical = this.isVertical();
        // GNOME Shell already passes target-local coordinates to DND delegates.
        // Transforming them from stage space again collapses the coordinate
        // toward the actor origin and makes every drop resolve to index zero.
        const coordinate = vertical ? y : x;
        const candidates = this.getItems().filter(item =>
            item !== this.draggedItem &&
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

        // Move a same-sized slot through the real layout while dragging. This
        // previews the final icon order without committing favorites yet.
        const targets = candidates;
        let insertionIndex = 0;
        for (const item of targets) {
            const midpoint = this.getItemMidpoint(item, vertical);
            if (midpoint !== null && coordinate > midpoint)
                insertionIndex++;
        }
        this.movePreview(insertionIndex);
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source: DockDragSource, _dragActor: Clutter.Actor, x: number, y: number, _time: number): boolean {
        if (source?.systemItem) {
            const vertical = this.isVertical();
            const coordinate = vertical ? y : x;
            let index = 0;
            for (const item of this.getItems()) {
                const midpoint = this.getItemMidpoint(item, vertical);
                if (midpoint !== null && coordinate > midpoint)
                    index++;
            }
            this.setSystemPosition(this.systemDropIndex ?? index);
            this.systemDropIndex = null;
            return true;
        }
        const app = source?.app;
        if (!app)
            return false;

        const appId = app.get_id();
        if (!this.favorites.isFavorite(appId))
            return false;

        const vertical = this.isVertical();
        // acceptDrop receives coordinates in this target actor's local space.
        const coordinate = vertical ? y : x;
        const favorites = this.favorites.getFavorites();
        const targets = this.getItems().filter(item =>
            item !== this.draggedItem &&
            item._gOsDockApp &&
            item._gOsDockApp.get_id() !== appId &&
            this.favorites.isFavorite(item._gOsDockApp.get_id()));

        let targetIndex = 0;
        if (this.previewIndex !== null) {
            targetIndex = this.previewIndex;
        } else {
            for (const item of targets) {
                const midpoint = this.getItemMidpoint(item, vertical);
                if (midpoint !== null && coordinate > midpoint)
                    targetIndex++;
            }
        }

        targetIndex = Math.max(0, Math.min(targetIndex, favorites.length - 1));
        this.clearDropTarget();
        this.endPreview();
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

    private beginPreview(item: DockAppButton): void {
        this.endPreview();
        this.draggedItem = item;
        this.previewSlot = new St.Widget({
            style_class: 'g-os-dock-dnd-preview',
            reactive: false,
            can_focus: false,
        });
        this.previewSlot.set_size(item.width, item.height);
        this.previewSlot.set_style(
            'background-color: rgba(90, 150, 255, 0.28); ' +
            'border: 2px dashed rgba(120, 175, 255, 0.95); ' +
            'border-radius: 8px;',
        );
        // Hidden actors are excluded from BoxLayout measurement. Opacity zero
        // would leave the original item occupying space beside the preview slot.
        item.hide();
        this.content.add_child(this.previewSlot);
        this.movePreview(this.content.get_children().indexOf(item));
    }

    private movePreview(index: number): void {
        if (!this.previewSlot || !this.draggedItem)
            return;

        const items = this.getItems().filter(item => item !== this.draggedItem);
        const target = Math.max(0, Math.min(index, items.length));
        this.previewIndex = target;

        // The hidden source actor is still a child of the BoxLayout and thus
        // still participates in child indices. Compensate when inserting the
        // visible placeholder after the source's original position.
        const sourceChildIndex = this.content.get_children().indexOf(this.draggedItem);
        const childIndex = target + (sourceChildIndex >= 0 && sourceChildIndex <= target ? 1 : 0);
        this.content.set_child_at_index(this.previewSlot, childIndex);
    }

    private endPreview(): void {
        if (this.previewSlot) {
            const parent = this.previewSlot.get_parent();
            if (parent)
                parent.remove_child(this.previewSlot);
            this.previewSlot.destroy();
            this.previewSlot = null;
        }
        this.previewIndex = null;
        this.systemDropIndex = null;
        if (this.draggedItem) {
            this.draggedItem.show();
            this.draggedItem = null;
        }
    }

    clearDropTarget(): void {
        if (!this.dropTarget)
            return;
        this.dropTarget.remove_style_class_name('drop-target');
        this.dropTarget = null;
    }

    destroy(): void {
        this.clearDropTarget();
        this.endPreview();
        this.draggables.clear();
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
