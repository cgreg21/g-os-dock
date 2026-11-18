import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
import { AnimationManager, type AnimationTarget } from '../../core/animation-manager.js';
import { DockItemBase } from '../items/dock-item-base.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { getDockMenuSide } from '../layout/menu-position.js';
import { DockDragDrop, type DockDndItem } from '../interaction/drag-and-drop.js';
import {
    mergeDockFolderMembers,
    resolveDockFolderDropOrder,
    resolveDockFolderRemoval,
} from './folder-state.js';

interface DockFolderRecord {
    id: string;
    name: string;
    appIds: string[];
    viewMode?: 'grid' | 'stack';
}

interface MountedFolder extends DockFolderRecord {
    actor: St.Button;
    base: DockItemBase;
    iconSize: number;
}

function readFolders(settings: Gio.Settings): DockFolderRecord[] {
    const folders: DockFolderRecord[] = [];
    for (const raw of settings.get_strv('dock-folders')) {
        try {
            const value = JSON.parse(raw) as Partial<DockFolderRecord>;
            if (typeof value.id !== 'string' || !value.id.startsWith('folder:') ||
                !Array.isArray(value.appIds) ||
                !value.appIds.every(id => typeof id === 'string'))
                continue;
            const appIds = [...new Set(value.appIds)].filter(Boolean);
            if (appIds.length >= 2)
                folders.push({
                    id: value.id,
                    name: typeof value.name === 'string' ? value.name : 'Folder',
                    appIds,
                    ...(value.viewMode === 'grid' || value.viewMode === 'stack'
                        ? { viewMode: value.viewMode }
                        : {}),
                });
        } catch (_error) {
            // Ignore malformed records and preserve the remaining folders.
        }
    }
    return folders;
}

/** Owns persistent application folders and their popup launchers. */
export class DockFoldersController {
    private folders: MountedFolder[] = [];
    private readonly retiringFolders = new Set<MountedFolder>();
    private readonly animations = new AnimationManager();
    private readonly menuManager: PopupMenu.PopupMenuManager;
    private readonly folderMenus = new Set<PopupMenu.PopupMenu>();
    private nextAnimationId = 0;
    private destroyed = false;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly settings: Gio.Settings,
        private readonly dragDrop: DockDragDrop,
        private readonly appSystem: Shell.AppSystem,
        private readonly dockPosition: () => string,
        private readonly getItemSize: () => number,
        private readonly onChanged: () => void,
    ) {
        this.menuManager = new PopupMenu.PopupMenuManager(content);
    }

    getHiddenAppIds(): Set<string> {
        return new Set(readFolders(this.settings).flatMap(folder => folder.appIds));
    }

    sync(): void {
        if (this.destroyed)
            return;
        const records = readFolders(this.settings);
        const iconSize = Math.max(16, this.getItemSize() || 32);
        const byId = new Map(this.folders.map(folder => [folder.id, folder]));
        const next: MountedFolder[] = [];

        for (const record of records) {
            const validIds = record.appIds.filter(id => !!this.appSystem.lookup_app(id));
            if (validIds.length < 2)
                continue;
            let folder = byId.get(record.id);
            if (!folder) {
                folder = this.createMountedFolder(record, validIds, iconSize);
                if (folder.actor.get_parent() !== this.content)
                    this.content.add_child(folder.actor);
                this.animateIn(folder.actor);
            } else {
                const membersChanged = folder.appIds.join('\\0') !== validIds.join('\\0');
                folder.name = record.name;
                folder.base.setTooltip(record.name);
                if (record.viewMode)
                    folder.viewMode = record.viewMode;
                else
                    delete folder.viewMode;
                folder.appIds = validIds;
                if (folder.iconSize !== iconSize || membersChanged) {
                    const previousPreview = folder.actor.get_first_child();
                    folder.actor.set_child(this.createFolderPreview(folder, iconSize));
                    previousPreview?.destroy();
                    folder.iconSize = iconSize;
                }
                folder.base.setIconPadding(this.settings, iconSize, folder.actor.get_first_child() ?? folder.actor);
            }
            next.push(folder);
        }

        for (const folder of this.folders) {
            if (next.some(candidate => candidate.id === folder.id))
                continue;
            this.animateOut(folder);
        }
        this.folders = next;
    }

    renameFolder(folderId: string, name: string): void {
        const folder = this.folders.find(candidate => candidate.id === folderId);
        const normalizedName = name.trim().slice(0, 48);
        if (!folder || !normalizedName || normalizedName === folder.name)
            return;
        this.updateFolderRecord(folderId, record => ({ ...record, name: normalizedName }));
        folder.base.setTooltip(normalizedName);
        this.onChanged();
    }

    setFolderViewMode(folderId: string, viewMode: 'grid' | 'stack'): void {
        const folder = this.folders.find(candidate => candidate.id === folderId);
        if (!folder || folder.viewMode === viewMode)
            return;
        this.updateFolderRecord(folderId, record => ({ ...record, viewMode }));
        this.onChanged();
    }

    private updateFolderRecord(
        folderId: string,
        update: (folder: DockFolderRecord) => DockFolderRecord,
    ): void {
        const records = readFolders(this.settings).map(folder =>
            folder.id === folderId ? update(folder) : folder,
        );
        this.settings.set_strv('dock-folders', records.map(folder => JSON.stringify(folder)));
    }

    removeFromFolder(folderId: string, appId: string): void {
        const folder = this.folders.find(candidate => candidate.id === folderId);
        if (!folder || !folder.appIds.includes(appId))
            return;
        const state = resolveDockFolderRemoval(
            readFolders(this.settings),
            this.settings.get_strv('dock-item-order'),
            folderId,
            appId,
        );
        if (!state)
            return;
        this.settings.set_strv('dock-item-order', state.order);
        this.settings.set_strv('dock-folders', state.folders.map(candidate => JSON.stringify(candidate)));
        this.onChanged();
    }

    getDndItems(): DockDndItem[] {
        return this.folders.map(folder => ({
            id: folder.id,
            actor: folder.actor,
            onCreateFolder: target => this.addToFolder(folder.id, target),
        }));
    }

    addToFolder(sourceId: string, target: DockDndItem): void {
        if (this.destroyed)
            return;
        const sourceFolder = this.folders.find(folder => folder.id === sourceId);
        const sourceAppIds = sourceFolder
            ? [...sourceFolder.appIds]
            : sourceId.startsWith('app:') ? [sourceId.slice(4)] : [];
        const targetFolder = this.folders.find(folder => folder.id === target.id);
        const targetAppIds = targetFolder
            ? [...targetFolder.appIds]
            : target.id.startsWith('app:') ? [target.id.slice(4)] : [];
        if (sourceAppIds.length === 0 || targetAppIds.length === 0)
            return;

        const members = mergeDockFolderMembers(targetAppIds, sourceAppIds);
        if (members.length < 2)
            return;
        const records = readFolders(this.settings).filter(folder =>
            folder.id !== sourceId && folder.id !== target.id,
        );
        const targetId = targetFolder?.id ?? `folder:${GLib.uuid_string_random()}`;
        const inheritedViewMode = targetFolder?.viewMode ?? sourceFolder?.viewMode;
        records.push({
            id: targetId,
            name: targetFolder?.name ?? sourceFolder?.name ?? 'Folder',
            appIds: members,
            ...(inheritedViewMode ? { viewMode: inheritedViewMode } : {}),
        });
        this.settings.set_strv('dock-folders', records.map(folder => JSON.stringify(folder)));

        const order = this.settings.get_strv('dock-item-order');
        this.settings.set_strv(
            'dock-item-order',
            resolveDockFolderDropOrder(order, sourceId, target.id, targetId),
        );
        this.onChanged();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.animations.destroy();
        for (const menu of [...this.folderMenus]) {
            this.folderMenus.delete(menu);
            this.menuManager.removeMenu(menu);
            menu.close();
            menu.destroy();
        }
        for (const folder of [...this.folders, ...this.retiringFolders])
            this.destroyFolder(folder);
        this.retiringFolders.clear();
        this.folders = [];
    }

    private createMountedFolder(
        folder: DockFolderRecord,
        appIds: string[],
        iconSize: number,
    ): MountedFolder {
        const mounted: MountedFolder = {
            ...folder,
            appIds,
            iconSize,
            actor: new St.Button({
                style_class: 'g-os-dock-item g-os-dock-folder',
                reactive: true,
                can_focus: true,
                track_hover: true,
                child: this.createFolderPreview({ ...folder, appIds }, iconSize),
                accessible_name: folder.name,
                x_expand: false,
                y_expand: false,
            }),
            base: null as unknown as DockItemBase,
        };
        mounted.actor.connect('clicked', () => this.openFolder(folder.id));
        mounted.base = new DockItemBase(
            this.content,
            mounted.actor,
            folder.name,
            this.dockPosition,
            this.dragDrop,
            folder.id,
            { onCreateFolder: target => this.addToFolder(folder.id, target) },
        );
        mounted.base.setIconPadding(this.settings, iconSize, mounted.actor.get_first_child() ?? mounted.actor);
        return mounted;
    }

    private animateIn(actor: St.Button): void {
        actor.opacity = 0;
        actor.scale_x = 0.82;
        actor.scale_y = 0.82;
        this.animations.animate(
            `folder-enter-${++this.nextAnimationId}`,
            actor as unknown as AnimationTarget,
            { opacity: 255, scaleX: 1, scaleY: 1 },
            { durationMs: 210, mode: Clutter.AnimationMode.EASE_OUT_BACK },
        );
    }

    private animateOut(folder: MountedFolder): void {
        this.retiringFolders.add(folder);
        this.animations.animate(
            `folder-exit-${++this.nextAnimationId}`,
            folder.actor as unknown as AnimationTarget,
            { opacity: 0, scaleX: 0.78, scaleY: 0.78 },
            {
                durationMs: 170,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    this.retiringFolders.delete(folder);
                    this.destroyFolder(folder);
                },
            },
        );
    }

    private destroyFolder(folder: MountedFolder): void {
        folder.base.destroy();
    }

    /** Render four live application icons in a square preview matching the dock slot. */
    private createFolderPreview(folder: DockFolderRecord, size: number): St.Widget {
        const preview = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'g-os-dock-folder-preview',
            width: size,
            height: size,
        });
        const iconSize = Math.max(8, Math.floor((size - 4) / 2));
        for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
            const row = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                style_class: 'g-os-dock-folder-preview-row',
            });
            for (let columnIndex = 0; columnIndex < 2; columnIndex++) {
                const appId = folder.appIds[rowIndex * 2 + columnIndex];
                const app = appId ? this.appSystem.lookup_app(appId) : null;
                const cell = new St.Widget({
                    width: iconSize,
                    height: iconSize,
                    x_expand: false,
                    y_expand: false,
                });
                if (app) {
                    const icon = app.create_icon_texture(iconSize * 4);
                    icon.set_size(iconSize, iconSize);
                    cell.add_child(icon);
                }
                row.add_child(cell);
            }
            preview.add_child(row);
        }
        return preview;
    }

    private openFolder(id: string): void {
        const folder = this.folders.find(candidate => candidate.id === id);
        if (!folder)
            return;

        const menu = new PopupMenu.PopupMenu(folder.actor, 0.5, getDockMenuSide(this.dockPosition()));
        Main.uiGroup.add_child(menu.actor);
        // Register with GNOME's menu manager so clicks outside the popup close it.
        this.menuManager.addMenu(menu);
        this.folderMenus.add(menu);
        const mode = folder.viewMode ?? this.settings.get_string('folder-view-mode');
        const applications = folder.appIds
            .map(appId => ({ appId, app: this.appSystem.lookup_app(appId) }))
            .filter(entry => !!entry.app);
        const content = mode === 'stack'
            ? this.createStackView(applications)
            : this.createGridView(applications);
        const viewItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'g-os-dock-folder-view-item',
        });
        viewItem.add_child(content);
        menu.addMenuItem(viewItem);

        const switchMode = new PopupMenu.PopupMenuItem(
            mode === 'stack' ? 'Use grid for this folder' : 'Use stack for this folder',
        );
        switchMode.connect('activate', () => {
            this.setFolderViewMode(id, mode === 'stack' ? 'grid' : 'stack');
            menu.close();
            this.openFolder(id);
        });
        menu.addMenuItem(switchMode);

        const renameItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'g-os-dock-folder-rename-item',
        });
        const nameEntry = new St.Entry({
            text: folder.name,
            hint_text: 'Folder name',
            can_focus: true,
            x_expand: true,
        });
        const renameButton = new St.Button({
            label: 'Rename',
            can_focus: true,
            reactive: true,
            style_class: 'button',
        });
        const applyRename = () => {
            const nextName = nameEntry.get_text().trim();
            if (!nextName)
                return;
            this.renameFolder(id, nextName);
            menu.close();
        };
        renameButton.connect('clicked', applyRename);
        nameEntry.clutter_text.connect('activate', applyRename);
        renameItem.add_child(nameEntry);
        renameItem.add_child(renameButton);
        menu.addMenuItem(renameItem);

        for (const { appId, app } of applications) {
            const remove = new PopupMenu.PopupMenuItem(`Remove ${app.get_name()} from folder`);
            remove.connect('activate', () => this.removeFromFolder(id, appId));
            menu.addMenuItem(remove);
        }

        let closing = false;
        menu.actor.opacity = 0;
        menu.actor.scale_x = 0.92;
        menu.actor.scale_y = 0.92;
        menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                menu.actor.ease({
                    opacity: 255,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 190,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            } else if (!closing) {
                closing = true;
                this.menuManager.removeMenu(menu);
                menu.actor.reactive = false;
                menu.actor.ease({
                    opacity: 0,
                    scaleX: 0.94,
                    scaleY: 0.94,
                    duration: 135,
                    mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                    onComplete: () => {
                        if (this.folderMenus.delete(menu))
                            menu.destroy();
                    },
                });
            }
        });
        menu.open();
    }

    private createGridView(
        applications: Array<{ appId: string; app: Shell.App }>,
    ): St.BoxLayout {
        const grid = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'g-os-dock-folder-grid',
        });
        const columns = 3;
        for (let index = 0; index < applications.length; index += columns) {
            const row = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                style_class: 'g-os-dock-folder-grid-row',
            });
            for (const entry of applications.slice(index, index + columns))
                row.add_child(this.createFolderAppCard(entry.app));
            grid.add_child(row);
        }
        return grid;
    }

    /** Give grid entries the same translucent card treatment as window previews. */
    private createFolderAppCard(app: Shell.App): St.BoxLayout {
        const card = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'g-os-dock-folder-app-card',
            reactive: true,
            track_hover: true,
            x_expand: false,
            y_expand: false,
        });
        card.add_child(this.createFolderAppButton(app));
        return card;
    }

    private createStackView(
        applications: Array<{ appId: string; app: Shell.App }>,
    ): St.Widget {
        const width = 236;
        const height = 132;
        const stack = new St.Widget({
            style_class: 'g-os-dock-folder-stack',
            layout_manager: new Clutter.FixedLayout(),
            width,
            height,
        });
        const visible = applications.slice(0, 8);
        const columns = visible.length > 4 ? 4 : Math.max(1, visible.length);
        visible.forEach(({ app }, index) => {
            const button = this.createFolderAppButton(app, true);
            const column = index % columns;
            const row = Math.floor(index / columns);
            button.set_position(12 + column * 48 + row * 7, 12 + row * 12);
            button.set_size(68, 76);
            stack.add_child(button);
        });
        return stack;
    }

    private createFolderAppButton(app: Shell.App, compact = false): St.Button {
        const icon = app.create_icon_texture(compact ? 34 : 40);
        const label = new St.Label({
            text: app.get_name(),
            style_class: 'g-os-dock-folder-app-label',
        });
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'g-os-dock-folder-app-content',
        });
        box.add_child(icon);
        if (!compact)
            box.add_child(label);
        const button = new St.Button({
            child: box,
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: compact
                ? 'g-os-dock-folder-app'
                : 'g-os-dock-folder-app g-os-dock-preview-open',
            accessible_name: app.get_name(),
            width: compact ? 60 : 76,
            height: compact ? 64 : 82,
        });
        button.connect('clicked', () => app.activate());
        return button;
    }
}
