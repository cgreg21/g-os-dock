import Clutter from 'gi://Clutter?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import Shell from 'gi://Shell?version=51';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { dockCache } from '../../core/cache.js';
import { ChromeActorManager } from '../../core/chrome-actor-manager.js';
import { AnimationManager, type AnimationTarget } from '../../core/animation-manager.js';
import {
    canDropDockItemAtIndex,
    isDockDndFavoriteBoundaryInsertion,
    resolveDockDndInsertionIndex,
    resolveDockDndPreviewChildIndex,
    resolveDockRemovalZoneGeometry,
} from './dnd-geometry.js';

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
    private draggables = new Map<St.Widget, {
        draggable: DND.Draggable;
        signals: number[];
        item: DockDndItem;
        onStart: () => void;
    }>();
    private removingItemId: string | null = null;
    private removingActor: St.Widget | null = null;
    private destroyed = false;
    private animations = new AnimationManager();
    private chromeActors = new ChromeActorManager<St.Widget>(
        (actor, options) => Main.layoutManager.addChrome(actor, options),
        actor => Main.layoutManager.removeChrome(actor),
    );
    private removalZone: St.Widget | null = null;
    private smokeActors = new Set<St.Widget>();
    private smokeSequence = 0;

    constructor(
        private actor: St.Widget,
        private content: St.BoxLayout,
        private settings: Gio.Settings,
        private getItems: () => DockDndItem[],
        private persistOrder: (ids: string[]) => void,
        private monitor: { x: number; y: number; width: number; height: number },
    ) {

    }

    registerItem(item: DockDndItem, onStart: () => void = () => {}): void {
        if (this.destroyed)
            return;
        const actor = item.actor;
        const existing = this.draggables.get(actor);
        if (existing) {
            existing.item = item;
            existing.onStart = onStart;
            this.setDragDelegate(item);
            if (this.draggedItem?.actor === actor)
                this.draggedItem = item;
            return;
        }

        this.setDragDelegate(item);
        const registration = {
            draggable: DND.makeDraggable(actor, { dragActorOpacity: 210 }),
            signals: [] as number[],
            item,
            onStart,
        };
        registration.signals = [
            registration.draggable.connect('drag-begin', () => {
                const current = registration.item;
                if (current.canRemove?.())
                    this.showRemovalZone();
                else
                    this.hideRemovalZone();
                registration.onStart();
                actor.add_style_class_name('dragging');
                this.beginPreview(current);
            }),
            registration.draggable.connect('drag-end', () => this.finishDrag(actor)),
            registration.draggable.connect('drag-cancelled', () => this.finishDrag(actor)),
        ];
        this.draggables.set(actor, registration);
    }

    private setDragDelegate(item: DockDndItem): void {
        const actor = item.actor;
        (actor as St.Widget & { _delegate?: unknown })._delegate = {
            dockItemId: item.id,
            app: item.app,
            actor,
            getDragActor: () => {
                const clone = new Clutter.Clone({ source: actor });
                clone.set_size(actor.width, actor.height);
                return clone;
            },
            getDragActorSource: () => actor,
        };
    }

    unregisterItem(actor: St.Widget): void {
        const itemId = this.draggedItem?.actor === actor ? this.draggedItem.id :
            (actor as St.Widget & { _delegate?: DockDragSource })._delegate?.dockItemId;
        const registration = this.draggables.get(actor);
        if (registration) {
            const signalObject = registration.draggable as DND.Draggable & {
                disconnect: (signal: number) => void;
            };
            for (const signal of registration.signals)
                signalObject.disconnect(signal);
            this.draggables.delete(actor);
        }

        this.clearDragDelegate(actor);

        if (itemId && this.removingItemId === itemId) {
            this.removingItemId = null;
            this.removingActor = null;
            this.animations.cancel(`remove:${itemId}`);
            actor.opacity = 255;
            actor.scale_x = 1;
            actor.scale_y = 1;
        }

        if (this.draggedItem?.actor === actor) {
            actor.remove_style_class_name('dragging');
            this.hideRemovalZone();
            this.endPreview();
        }
    }

    handleDragOver(source: DockDragSource, _dragActor: Clutter.Actor,
        x: number, y: number, _time: number): number {
        if (this.destroyed)
            return DND.DragMotionResult.NO_DROP;
        const sourceId = source?.dockItemId;
        if (!sourceId) {
            this.previewSlot?.hide();
            return DND.DragMotionResult.NO_DROP;
        }
        const items = this.getItems();
        const dragged = items.find(item => item.id === sourceId);
        if (!dragged) {
            this.previewSlot?.hide();
            return DND.DragMotionResult.NO_DROP;
        }
        const targets = items.filter(item => item.id !== sourceId);
        const index = this.getDropIndex(targets, x, y);
        if (index === null) {
            this.previewSlot?.hide();
            return DND.DragMotionResult.NO_DROP;
        }
        const favoriteCount = targets.filter(item =>
            item.app && this.isFavorite(item),
        ).length;
        const applicationsBefore = targets
            .slice(0, index)
            .filter(item => item.app).length;
        if (!canDropDockItemAtIndex(
            !!dragged.app && this.isFavorite(dragged),
            applicationsBefore,
            favoriteCount,
        )) {
            // Do not let acceptDrop reuse a previously valid preview position.
            this.previewSlot?.hide();
            return DND.DragMotionResult.NO_DROP;
        }

        this.movePreview(index, targets);
        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source: DockDragSource, _dragActor: Clutter.Actor,
        x: number, y: number, _time: number): boolean {
        if (this.destroyed)
            return false;
        const sourceId = source?.dockItemId;
        if (!sourceId)
            return false;
        const items = this.getItems();
        const sourceIndex = items.findIndex(item => item.id === sourceId);
        if (sourceIndex < 0)
            return false;
        const remaining = items.filter(item => item.id !== sourceId);
        // Use the final pointer position, not a potentially stale hover index.
        const target = this.getDropIndex(remaining, x, y);
        if (target === null)
            return false;
        const dragged = items[sourceIndex]!;
        const favoriteCount = remaining.filter(item =>
            item.app && this.isFavorite(item),
        ).length;
        const applicationsBefore = remaining
            .slice(0, target)
            .filter(item => item.app).length;
        // Ignore system items when enforcing the favorites boundary.
        // Non-favorites may still be dropped into that section to be pinned.
        if (!canDropDockItemAtIndex(
            !!dragged.app && this.isFavorite(dragged),
            applicationsBefore,
            favoriteCount,
        ))
            return false;

        const ordered = [...remaining];
        ordered.splice(target, 0, items[sourceIndex]!);
        this.persistOrder(ordered.map(item => item.id));
        return true;
    }

    private clearDragDelegate(actor: St.Widget): void {
        const draggableActor = actor as St.Widget & {
            _delegate?: { actor?: St.Widget };
        };
        if (draggableActor._delegate?.actor === actor)
            delete draggableActor._delegate;
    }

    private getDropIndex(items: DockDndItem[], x: number, y: number): number | null {
        const vertical = this.isVertical();
        const coordinate = vertical ? y : x;
        const midpoints = items.map(item => this.getItemMidpoint(item.actor, vertical));
        return resolveDockDndInsertionIndex(midpoints, coordinate);
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
        this.previewSlot.set_style(dockCache.getOrCreate(
            'drag-preview-slot-style',
            () =>
                'background-color: rgba(90, 150, 255, 0.28); ' +
                'border: 2px dashed rgba(120, 175, 255, 0.95); border-radius: 8px;',
        ));
        item.actor.hide();
        this.content.add_child(this.previewSlot);

        const items = this.getItems();
        const index = items.findIndex(candidate => candidate.id === item.id);
        if (index < 0) {
            this.endPreview();
            return;
        }
        this.movePreview(index, items.filter(candidate => candidate.id !== item.id));
    }

    private movePreview(index: number, items?: DockDndItem[]): void {
        if (!this.previewSlot || !this.draggedItem)
            return;
        this.previewSlot.show();
        const draggedItem = this.draggedItem;
        const targets = items ?? this.getItems().filter(item =>
            item.id !== draggedItem.id,
        );
        const target = Math.max(0, Math.min(index, targets.length));
        // Resolve the slot from registered dock items only. Structural
        // actors such as the favorites separator are intentionally ignored.
        const children = this.content.get_children();
        const referenceItem = targets[target];
        const referenceIndex = referenceItem ? children.indexOf(referenceItem.actor) : -1;
        const favoriteCount = targets.filter(item =>
            item.app && this.isFavorite(item),
        ).length;
        const applicationsBefore = targets
            .slice(0, target)
            .filter(item => item.app).length;
        const isFavoriteBoundary = isDockDndFavoriteBoundaryInsertion(
            !!draggedItem.app && this.isFavorite(draggedItem),
            !!referenceItem?.app && this.isFavorite(referenceItem),
            applicationsBefore,
            favoriteCount,
        );
        const separatorIndex = children.findIndex(child =>
            (child as St.Widget & { _gOsDockStructuralRole?: string })
                ._gOsDockStructuralRole === 'favorites-separator',
        );
        const childIndex = resolveDockDndPreviewChildIndex(
            referenceIndex,
            separatorIndex,
            children.length - 1,
            isFavoriteBoundary,
        );
        this.content.set_child_at_index(
            this.previewSlot,
            Math.max(0, Math.min(childIndex, children.length - 1)),
        );
    }

    private finishDrag(actor: St.Widget): void {
        if (this.draggedItem?.actor !== actor)
            return;

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
        if (!this.removalZone)
            return;
        const geometry = resolveDockRemovalZoneGeometry(
            this.monitor,
            this.settings.get_string('dock-position'),
            Main.panel.height,
        );
        this.removalZone.set_position(geometry.x, geometry.y);
        this.removalZone.set_size(geometry.width, geometry.height);
    }

    private showRemovalZone(): void {
        if (this.destroyed)
            return;
        if (!this.removalZone) {
            const zone = new St.Widget({
                style_class: 'g-os-dock-removal-zone',
                reactive: true,
                can_focus: false,
            });
            (zone as St.Widget & { _delegate?: unknown })._delegate = {
                handleDragOver: (source: DockDragSource) => this.handleRemovalDragOver(source),
                acceptDrop: (source: DockDragSource) => this.acceptRemovalDrop(source),
            };
            this.removalZone = zone;
            this.updateRemovalZoneGeometry();
            this.chromeActors.add(zone, {
                affectsStruts: false,
                trackFullscreen: false,
            });
        }
        const zone = this.removalZone;
        zone.reactive = true;
        zone.opacity = 0;
        zone.scale_x = 0.97;
        zone.scale_y = 0.97;
        zone.show();
        this.animations.animate('removal-zone', zone as unknown as AnimationTarget, {
            opacity: 255,
            scaleX: 1,
            scaleY: 1,
        }, {
            durationMs: 150,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    private hideRemovalZone(): void {
        this.animations.cancel('removal-zone');
        const zone = this.removalZone;
        if (!zone)
            return;
        zone.reactive = false;
        this.chromeActors.remove(zone);
        zone.destroy();
        this.removalZone = null;
    }

    private handleRemovalDragOver(source: DockDragSource): number {
        if (this.destroyed || this.removingItemId)
            return DND.DragMotionResult.NO_DROP;
        const item = this.getItems().find(candidate => candidate.id === source?.dockItemId);
        return item?.canRemove?.()
            ? DND.DragMotionResult.MOVE_DROP
            : DND.DragMotionResult.NO_DROP;
    }

    /** Emit short-lived smoke puffs at the icon's stage position. */
    private spawnRemovalSmoke(actor: St.Widget): void {
        const [stageX, stageY] = actor.get_transformed_position();
        const width = Math.max(1, actor.width);
        const height = Math.max(1, actor.height);
        const centerX = stageX + width / 2;
        const centerY = stageY + height / 2;
        const puffs = [
            { x: -13, y: 4, size: 17, drift: -18, rise: -58, duration: 620 },
            { x: 7, y: 0, size: 21, drift: 13, rise: -72, duration: 760 },
            { x: -3, y: -9, size: 14, drift: -7, rise: -48, duration: 540 },
            { x: 15, y: 10, size: 16, drift: 24, rise: -64, duration: 700 },
            { x: -17, y: 12, size: 13, drift: -25, rise: -43, duration: 580 },
            { x: 2, y: 13, size: 19, drift: 5, rise: -82, duration: 820 },
        ];

        for (const puff of puffs) {
            const smoke = new St.Widget({
                reactive: false,
                can_focus: false,
                style: 'background-color: rgba(190, 195, 205, 0.58); ' +
                    'border-radius: 999px;',
            });
            smoke.set_size(puff.size, puff.size);
            smoke.set_position(
                centerX - puff.size / 2 + puff.x,
                centerY - puff.size / 2 + puff.y,
            );
            smoke.opacity = 0;
            smoke.scale_x = 0.45;
            smoke.scale_y = 0.45;
            this.smokeActors.add(smoke);
            this.chromeActors.add(smoke, {
                affectsStruts: false,
                trackFullscreen: false,
            });
            smoke.opacity = 155;
            const key = `removal-smoke:${++this.smokeSequence}`;
            this.animations.animate(key, smoke as unknown as AnimationTarget, {
                opacity: 0,
                scaleX: 2.15,
                scaleY: 2.15,
                translationX: puff.drift,
                translationY: puff.rise,
            }, {
                durationMs: puff.duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this.destroySmokePuff(smoke),
            });
        }
    }

    private destroySmokePuff(smoke: St.Widget): void {
        if (!this.smokeActors.delete(smoke))
            return;
        this.chromeActors.remove(smoke);
        smoke.destroy();
    }

    private acceptRemovalDrop(source: DockDragSource): boolean {
        if (this.destroyed || this.removingItemId)
            return false;
        const item = this.getItems().find(candidate => candidate.id === source?.dockItemId);
        if (!item?.canRemove?.() || !item.onRemove)
            return false;
        this.removingItemId = item.id;
        this.removingActor = item.actor;
        this.spawnRemovalSmoke(item.actor);
        this.animations.animate(`remove:${item.id}`, item.actor as unknown as AnimationTarget, {
            opacity: 0,
            scaleX: 0.08,
            scaleY: 0.08,
        }, {
            durationMs: 240,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this.destroyed || this.removingItemId !== item.id ||
                    this.removingActor !== item.actor)
                    return;
                this.removingItemId = null;
                this.removingActor = null;
                item.actor.opacity = 255;
                item.actor.scale_x = 1;
                item.actor.scale_y = 1;
                item.onRemove?.();
            },
        });
        return true;
    }

    private getItemMidpoint(item: St.Widget, vertical: boolean): number | null {
        const extent = vertical ? item.height : item.width;
        if (!Number.isFinite(extent) || extent <= 0)
            return null;
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
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.animations.destroy();
        for (const smoke of [...this.smokeActors]) {
            this.chromeActors.remove(smoke);
            smoke.destroy();
        }
        this.smokeActors.clear();
        if (this.removingActor) {
            this.removingActor = null;
            this.removingItemId = null;
        }
        this.hideRemovalZone();
        this.endPreview();
        for (const actor of [...this.draggables.keys()]) {
            actor.remove_style_class_name('dragging');
            this.unregisterItem(actor);
        }
        this.chromeActors.destroy();
        if (this.removalZone) {
            this.chromeActors.remove(this.removalZone);
            this.removalZone.destroy();
            this.removalZone = null;
        }
    }
}
