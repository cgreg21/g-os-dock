import Clutter from 'gi://Clutter?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import Shell from 'gi://Shell?version=51';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export interface DockDndItem {
    id: string;
    actor: St.Widget;
    app?: Shell.App;
    canRemove?: () => boolean;
    isFavorite?: () => boolean;
    onRemove?: () => void;
}

export type DockDragSource = {
    dockItemId?: string;
};

/**
 * Generic drag-and-drop controller for every dock item.
 *
 * Item-specific behavior is deliberately kept outside this class: callers
 * provide stable IDs, actors and an order persistence callback. New dock item
 * types only need to register with this controller.
 */
export class DockDragDrop {
    private draggedItem: DockDndItem | null = null;
    private previewSlot: St.Widget | null = null;
    private previewIndex: number | null = null;
    private draggables = new Map<St.Widget, DND.Draggable>();
    private removingItemId: string | null = null;
    private removalZone: St.Widget;
    private removalZoneDelegate: {
        handleDragOver: (source: DockDragSource) => number;
        acceptDrop: (source: DockDragSource) => boolean;
    };

    constructor(
        private actor: St.Widget,
        private content: St.BoxLayout,
        private settings: Gio.Settings,
        private getItems: () => DockDndItem[],
        private persistOrder: (ids: string[]) => void,
        private monitor: { x: number; y: number; width: number; height: number },
    ) {
        this.removalZone = new St.Widget({
            style_class: 'g-os-dock-removal-zone',
            reactive: false,
            can_focus: false,
        });
        this.removalZoneDelegate = {
            handleDragOver: source => this.handleRemovalDragOver(source),
            acceptDrop: source => this.acceptRemovalDrop(source),
        };
        (this.removalZone as St.Widget & { _delegate?: unknown })._delegate = this.removalZoneDelegate;
        this.updateRemovalZoneGeometry();
        Main.layoutManager.addChrome(this.removalZone, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this.removalZone.hide();
    }

    registerItem(item: DockDndItem, onStart: () => void = () => {}): void {
        const actor = item.actor;
        (actor as St.Widget & { _delegate?: unknown })._delegate = {
            dockItemId: item.id,
            app: item.app,
            actor,
            getDragActor: () => new Clutter.Clone({ source: actor }),
            getDragActorSource: () => actor,
        };
        const draggable = DND.makeDraggable(actor, { dragActorOpacity: 210 });
        this.draggables.set(actor, draggable);
        draggable.connect('drag-begin', () => {
            this.draggedItem = item;
            this.showRemovalZone();
            onStart();
            actor.add_style_class_name('dragging');
            this.beginPreview(item);
        });
        draggable.connect('drag-end', () => this.finishDrag(actor));
        draggable.connect('drag-cancelled', () => this.finishDrag(actor));
    }

    unregisterItem(actor: St.Widget): void {
        this.draggables.delete(actor);
        if (this.draggedItem?.actor === actor)
            this.endPreview();
    }

    handleDragOver(source: DockDragSource, _dragActor: Clutter.Actor,
        x: number, y: number, _time: number): number {
        const sourceId = source?.dockItemId;
        if (!sourceId)
            return DND.DragMotionResult.NO_DROP;
        const items = this.getItems();
        const dragged = items.find(item => item.id === sourceId);
        const targets = items.filter(item => item.id !== sourceId);
        const vertical = this.isVertical();
        const coordinate = vertical ? y : x;
        let index = 0;
        for (const item of targets) {
            const midpoint = this.getItemMidpoint(item.actor, vertical);
            if (midpoint !== null && coordinate > midpoint)
                index++;
        }
        const favoriteCount = targets.filter(item =>
            item.app && this.isFavorite(item),
        ).length;
        if (dragged?.app && this.isFavorite(dragged) && index > favoriteCount)
            return DND.DragMotionResult.NO_DROP;

        this.movePreview(index, targets);
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source: DockDragSource, _dragActor: Clutter.Actor,
        x: number, y: number, _time: number): boolean {
        const sourceId = source?.dockItemId;
        if (!sourceId)
            return false;
        const items = this.getItems();
        const sourceIndex = items.findIndex(item => item.id === sourceId);
        if (sourceIndex < 0)
            return false;
        const remaining = items.filter(item => item.id !== sourceId);
        const vertical = this.isVertical();
        const coordinate = vertical ? y : x;
        let target = this.previewIndex;
        if (target === null) {
            target = 0;
            for (const item of remaining) {
                const midpoint = this.getItemMidpoint(item.actor, vertical);
                if (midpoint !== null && coordinate > midpoint)
                    target++;
            }
        }
        target = Math.max(0, Math.min(target, remaining.length));
        const dragged = items[sourceIndex]!;
        const favoriteCount = remaining.filter(item =>
            item.app && this.isFavorite(item),
        ).length;
        // Favorite applications must remain in the favorites section.
        // Non-favorites may still be dropped into that section to be pinned.
        if (dragged.app && this.isFavorite(dragged) && target > favoriteCount)
            return false;

        const ordered = [...remaining];
        ordered.splice(target, 0, items[sourceIndex]!);
        this.persistOrder(ordered.map(item => item.id));
        return true;
    }

    private isFavorite(item: DockDndItem): boolean {
        return item.isFavorite?.() ?? false;
    }

    private beginPreview(item: DockDndItem): void {
        this.endPreview();
        this.draggedItem = item;
        this.previewSlot = new St.Widget({
            style_class: 'g-os-dock-dnd-preview',
            reactive: false,
            can_focus: false,
        });
        this.previewSlot.set_size(item.actor.width, item.actor.height);
        this.previewSlot.set_style(
            'background-color: rgba(90, 150, 255, 0.28); ' +
            'border: 2px dashed rgba(120, 175, 255, 0.95); border-radius: 8px;',
        );
        item.actor.hide();
        this.content.add_child(this.previewSlot);
        this.movePreview(this.content.get_children().indexOf(item.actor));
    }

    private movePreview(index: number, items?: DockDndItem[]): void {
        if (!this.previewSlot || !this.draggedItem)
            return;
        const targets = items ?? this.getItems().filter(item =>
            item.id !== this.draggedItem?.id,
        );
        const target = Math.max(0, Math.min(index, targets.length));
        this.previewIndex = target;
        // Resolve the slot from registered dock items only. Structural
        // actors such as the favorites separator are intentionally ignored.
        const children = this.content.get_children();
        const reference = targets[target]?.actor;
        const childIndex = reference
            ? children.indexOf(reference)
            : children.length - 1;
        this.content.set_child_at_index(
            this.previewSlot,
            Math.max(0, Math.min(childIndex, children.length - 1)),
        );
    }

    private finishDrag(actor: St.Widget): void {
        actor.remove_style_class_name('dragging');
        this.hideRemovalZone();
        this.endPreview();
    }

    private endPreview(): void {
        if (this.previewSlot) {
            this.previewSlot.get_parent()?.remove_child(this.previewSlot);
            this.previewSlot.destroy();
            this.previewSlot = null;
        }
        this.previewIndex = null;
        if (this.draggedItem) {
            if (this.draggedItem.id !== this.removingItemId) {
                this.draggedItem.actor.opacity = 255;
                this.draggedItem.actor.scale_x = 1;
                this.draggedItem.actor.scale_y = 1;
            }
            this.draggedItem.actor.show();
            this.draggedItem = null;
        }
    }

    private updateRemovalZoneGeometry(): void {
        const extent = Math.floor((this.isVertical() ? this.monitor.width : this.monitor.height) * 2 / 3);
        const position = this.settings.get_string('dock-position');
        let x = this.monitor.x;
        let y = this.monitor.y;
        let width = this.monitor.width;
        let height = this.monitor.height;
        if (position === 'bottom') height = extent;
        else if (position === 'top') { y += this.monitor.height - extent; height = extent; }
        else if (position === 'left') { x += this.monitor.width - extent; width = extent; }
        else width = extent;
        this.removalZone.set_position(x, y);
        this.removalZone.set_size(width, height);
    }

    private showRemovalZone(): void {
        this.updateRemovalZoneGeometry();
        this.removalZone.reactive = true;
        this.removalZone.show();
    }

    private hideRemovalZone(): void {
        this.removalZone.reactive = false;
        this.removalZone.hide();
    }

    private handleRemovalDragOver(source: DockDragSource): number {
        const item = this.getItems().find(candidate => candidate.id === source?.dockItemId);
        return item?.canRemove?.()
            ? DND.DragMotionResult.MOVE_DROP
            : DND.DragMotionResult.NO_DROP;
    }

    private acceptRemovalDrop(source: DockDragSource): boolean {
        const item = this.getItems().find(candidate => candidate.id === source?.dockItemId);
        if (!item?.canRemove?.() || !item.onRemove)
            return false;
        this.removingItemId = item.id;
        item.actor.ease({
            opacity: 0,
            scaleX: 0.08,
            scaleY: 0.08,
            duration: 240,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                item.actor.opacity = 255;
                item.actor.scale_x = 1;
                item.actor.scale_y = 1;
                item.onRemove?.();
                this.removingItemId = null;
            },
        });
        return true;
    }

    private getItemMidpoint(item: St.Widget, vertical: boolean): number | null {
        const [x, y] = item.get_transformed_position();
        const [valid, localX, localY] = this.actor.transform_stage_point(
            x + item.width / 2, y + item.height / 2,
        );
        if (!valid)
            return null;
        return vertical ? localY : localX;
    }

    private isVertical(): boolean {
        return ['left', 'right'].includes(this.settings.get_string('dock-position'));
    }

    destroy(): void {
        this.hideRemovalZone();
        this.endPreview();
        this.draggables.clear();
        Main.layoutManager.removeChrome(this.removalZone);
        this.removalZone.destroy();
    }
}
