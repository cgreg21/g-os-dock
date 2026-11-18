import St from 'gi://St?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import Clutter from 'gi://Clutter?version=51';
import { AnimationManager, type AnimationTarget } from '../../core/animation-manager.js';
import { DockAppItemFactory, type DockAppButton } from './app-item.js';

/**
 * Owns the reconciliation lifecycle for application buttons in the dock.
 * It reuses actors when possible and replaces them transactionally on resize.
 */
export class DockApplicationItemsController {
    private currentItems: DockAppButton[] = [];
    private currentSize = 0;
    private readonly animations = new AnimationManager();
    private nextAnimationId = 0;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly factory: DockAppItemFactory,
        private readonly settings: Gio.Settings,
    ) {}

    get items(): DockAppButton[] {
        return this.currentItems;
    }

    get size(): number {
        return this.currentSize;
    }

    sync(applications: Shell.App[], size: number): boolean {
        const pending: DockAppButton[] = [];
        const sizeChanged = this.currentSize !== 0 && this.currentSize !== size;
        const previousById = new Map<string, DockAppButton>();
        const existingItems = new Set(this.currentItems);
        const createdItems = new Set<DockAppButton>();

        if (!sizeChanged) {
            for (const item of this.currentItems) {
                const id = item._gOsDockApp?.get_id();
                if (id)
                    previousById.set(id, item);
            }
        }

        try {
            for (const app of applications) {
                const id = app.get_id();
                let item: DockAppButton | undefined;
                if (id) {
                    item = previousById.get(id);
                    if (item)
                        previousById.delete(id);
                }
                if (!item) {
                    item = this.factory.create(app, size);
                    createdItems.add(item);
                }

                // Register newly created actors before any operation that can
                // throw, so the rollback also covers padding and parenting.
                pending.push(item);
                item._gOsDockBase.setIconPadding(this.settings, size);
                if (item.get_parent() !== this.content)
                    this.content.add_child(item);
                if (createdItems.has(item))
                    this.animateIn(item);
            }
        } catch (error) {
            for (const item of pending) {
                if (!existingItems.has(item))
                    this.destroyItem(item);
            }
            throw error;
        }

        const structureChanged = sizeChanged ||
            this.currentItems.length !== pending.length ||
            this.currentItems.some((item, index) =>
                item._gOsDockApp.get_id() !== pending[index]?._gOsDockApp.get_id(),
            );
        const retained = new Set(pending);

        for (const item of this.currentItems) {
            if (retained.has(item))
                continue;
            this.animateOut(item);
        }

        this.currentItems = pending;
        this.currentSize = size;
        return structureChanged;
    }

    destroy(): void {
        this.animations.destroy();
        for (const item of this.currentItems)
            this.destroyItem(item);
        this.currentItems = [];
        this.currentSize = 0;
    }

    private animateIn(item: DockAppButton): void {
        item.opacity = 0;
        item.scale_x = 0.82;
        item.scale_y = 0.82;
        this.animations.animate(
            `item-enter-${++this.nextAnimationId}`,
            item as unknown as AnimationTarget,
            { opacity: 255, scaleX: 1, scaleY: 1 },
            { durationMs: 210, mode: Clutter.AnimationMode.EASE_OUT_BACK },
        );
    }

    private animateOut(item: DockAppButton): void {
        this.animations.animate(
            `item-exit-${++this.nextAnimationId}`,
            item as unknown as AnimationTarget,
            { opacity: 0, scaleX: 0.78, scaleY: 0.78 },
            {
                durationMs: 170,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => this.destroyItem(item),
            },
        );
    }

    private destroyItem(item: DockAppButton): void {
        item.get_parent()?.remove_child(item);
        item._gOsDockBase.destroy();
    }
}
