import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import GLib from 'gi://GLib?version=2.0';
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
}

interface MountedFolder extends DockFolderRecord {
    actor: St.Button;
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
                folders.push({ id: value.id, name: typeof value.name === 'string' ? value.name : 'Folder', appIds });
        } catch (_error) {
            // Ignore malformed records and preserve the remaining folders.
        }
    }
    return folders;
}

/** Owns persistent application folders and their popup launchers. */
export class DockFoldersController {
    private folders: MountedFolder[] = [];
    private destroyed = false;

    constructor(
        private readonly content: St.BoxLayout,
        private readonly settings: Gio.Settings,
        private readonly dragDrop: DockDragDrop,
        private readonly appSystem: Shell.AppSystem,
        private readonly dockPosition: () => string,
        private readonly onChanged: () => void,
    ) {}

    getHiddenAppIds(): Set<string> {
        return new Set(readFolders(this.settings).flatMap(folder => folder.appIds));
    }

    sync(): void {
        if (this.destroyed)
            return;
        const records = readFolders(this.settings);
        const byId = new Map(this.folders.map(folder => [folder.id, folder]));
        const next: MountedFolder[] = [];

        for (const record of records) {
            const validIds = record.appIds.filter(id => !!this.appSystem.lookup_app(id));
            if (validIds.length < 2)
                continue;
            let folder = byId.get(record.id);
            if (!folder) {
                folder = { ...record, appIds: validIds, actor: this.createActor(record) };
                this.content.add_child(folder.actor);
            } else {
                folder.name = record.name;
                folder.appIds = validIds;
            }
            next.push(folder);
        }

        for (const folder of this.folders) {
            if (next.some(candidate => candidate.id === folder.id))
                continue;
            this.dragDrop.unregisterItem(folder.actor);
            folder.actor.get_parent()?.remove_child(folder.actor);
            folder.actor.destroy();
        }
        this.folders = next;
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
        records.push({ id: targetId, name: targetFolder?.name ?? 'Folder', appIds: members });
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
        for (const folder of this.folders) {
            this.dragDrop.unregisterItem(folder.actor);
            folder.actor.get_parent()?.remove_child(folder.actor);
            folder.actor.destroy();
        }
        this.folders = [];
    }

    private createActor(folder: DockFolderRecord): St.Button {
        const icon = new St.Icon({
            icon_name: 'folder-symbolic',
            icon_size: 32,
            style_class: 'g-os-dock-folder-icon',
        });
        const actor = new St.Button({
            style_class: 'g-os-dock-item g-os-dock-folder',
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: icon,
            accessible_name: folder.name,
            x_expand: false,
            y_expand: false,
        });
        actor.connect('clicked', () => this.openFolder(folder.id));
        this.dragDrop.registerItem({
            id: folder.id,
            actor,
            onCreateFolder: target => this.addToFolder(folder.id, target),
        });
        return actor;
    }

    private openFolder(id: string): void {
        const folder = this.folders.find(candidate => candidate.id === id);
        if (!folder)
            return;

        const menu = new PopupMenu.PopupMenu(folder.actor, 0.5, getDockMenuSide(this.dockPosition()));
        Main.uiGroup.add_child(menu.actor);
        const mode = this.settings.get_string('folder-view-mode');
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
            mode === 'stack' ? 'Show as grid' : 'Show as stack',
        );
        switchMode.connect('activate', () => {
            this.settings.set_string('folder-view-mode', mode === 'stack' ? 'grid' : 'stack');
            menu.close();
            this.openFolder(id);
        });
        menu.addMenuItem(switchMode);

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
                    scale_x: 1,
                    scale_y: 1,
                    duration: 190,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            } else if (!closing) {
                closing = true;
                menu.actor.reactive = false;
                menu.actor.ease({
                    opacity: 0,
                    scale_x: 0.94,
                    scale_y: 0.94,
                    duration: 135,
                    mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                    onComplete: () => menu.destroy(),
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
                row.add_child(this.createFolderAppButton(entry.app));
            grid.add_child(row);
        }
        return grid;
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
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            ellipsize: 3,
            max_width_chars: 12,
        });
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'g-os-dock-folder-app-content',
            x_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(icon);
        if (!compact)
            box.add_child(label);
        const button = new St.Button({
            child: box,
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: 'g-os-dock-folder-app',
            accessible_name: app.get_name(),
            width: compact ? 60 : 76,
            height: compact ? 64 : 82,
        });
        button.connect('clicked', () => app.activate());
        return button;
    }
}
