import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Meta from 'gi://Meta?version=51';
import Shell from 'gi://Shell?version=51';
import { dockCache } from '../cache.js';

/** Builds a single window preview card and its window actions. */
export function createWindowPreviewCard(
    app: Shell.App,
    window: Meta.Window,
    index: number,
    onClose: () => void,
    closeOnLeft: boolean,
): { card: St.BoxLayout; previewButton: St.Button } {
    const card = new St.BoxLayout({
        style_class: 'g-os-dock-preview-card',
        orientation: Clutter.Orientation.VERTICAL,
        reactive: true,
        track_hover: true,
        x_expand: false,
        y_expand: false,
    });
    card.set_style(dockCache.getOrCreate(
        'preview-card-style',
        () => 'spacing: 5px; padding: 6px; border-radius: 9px; background-color: rgba(255,255,255,0.07);',
    ));

    const previewButton = new St.Button({
        style_class: 'g-os-dock-preview-open',
        reactive: true,
        can_focus: true,
        track_hover: true,
        x_expand: false,
        y_expand: false,
    });
    previewButton.set_style(dockCache.getOrCreate(
        'preview-open-button-style',
        () => 'padding: 0; background-color: transparent;',
    ));

    const content = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
    });
    content.set_style(dockCache.getOrCreate(
        'preview-card-content-style',
        () => 'spacing: 5px;',
    ));
    let compositorActor: Clutter.Actor | null = null;
    try {
        compositorActor = window.get_compositor_private();
    } catch (_error) {
        // A compositor actor may not be available for special windows.
    }

    const thumbnail = new St.Widget({
        style_class: 'g-os-dock-preview-thumbnail',
        width: 176,
        height: 104,
        layout_manager: new Clutter.FixedLayout(),
    });
    if (compositorActor && !window.minimized) {
        const clone = new Clutter.Clone({ source: compositorActor });
        clone.set_size(176, 104);
        clone.set_position(0, 0);
        thumbnail.add_child(clone);
    } else {
        thumbnail.add_child(new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: app.create_icon_texture(56),
        }));
    }

    // Place the close control according to GNOME's titlebar button layout.
    const closeButton = new St.Button({
        style_class: 'g-os-dock-preview-close',
        child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 14 }),
        can_focus: true,
        reactive: true,
        accessible_name: 'Close window',
    });
    // FixedLayout makes the close control an explicit overlay, independent
    // of BinLayout's child alignment and the thumbnail clone's allocation.
    const closeButtonSize = 28;
    closeButton.set_size(closeButtonSize, closeButtonSize);
    closeButton.set_position(
        closeOnLeft ? 0 : 176 - closeButtonSize,
        0,
    );
    // Prevent the nested close control from activating the parent preview button.
    closeButton.connect('button-press-event', () => Clutter.EVENT_STOP);
    closeButton.connect('clicked', () => {
        window.delete(global.get_current_time());
        onClose();
    });
    thumbnail.add_child(closeButton);
    content.add_child(thumbnail);

    const workspaceInfo = getWorkspaceInfo(window);

    previewButton.set_child(content);
    previewButton.accessible_name = `Activate window ${index + 1}`;
    previewButton.connect('clicked', () => {
        activateWindow(app, window);
        onClose();
    });
    card.add_child(previewButton);

    const actions = new St.BoxLayout({
        style_class: 'g-os-dock-preview-actions',
        x_expand: true,
        y_expand: false,
    });

    const workspace = workspaceInfo.workspace;
    if (workspace && !workspaceInfo.onAllWorkspaces &&
        workspaceInfo.index >= 0 &&
        workspaceInfo.index !== global.workspace_manager.get_active_workspace_index()) {
        const switchWorkspace = new St.Button({
            style_class: 'g-os-dock-preview-action workspace',
            child: new St.Label({ text: 'Go to workspace' }),
            can_focus: true,
            reactive: true,
            accessible_name: `Switch to workspace ${workspaceInfo.index + 1}`,
            x_expand: true,
        });
        switchWorkspace.connect('clicked', () => {
            const timestamp = global.get_current_time();
            workspace.activate(timestamp);
            activateWindow(app, window, timestamp);
            onClose();
        });
        actions.add_child(switchWorkspace);
        card.add_child(actions);
    }

    return { card, previewButton };
}

function getWorkspaceInfo(window: Meta.Window): {
    workspace: Meta.Workspace | null;
    index: number;
    onAllWorkspaces: boolean;
} {
    let workspace: Meta.Workspace | null = null;
    let index = -1;
    let onAllWorkspaces = false;
    try {
        workspace = window.get_workspace();
        index = workspace?.index?.() ?? -1;
        onAllWorkspaces = window.is_on_all_workspaces();
    } catch (_error) {
        // Special windows may not expose normal workspace metadata.
    }

    return { workspace, index, onAllWorkspaces };
}

function activateWindow(app: Shell.App, window: Meta.Window, timestamp = global.get_current_time()): void {
    try {
        app.activate_window(window, timestamp);
    } catch (_error) {
        window.activate(timestamp);
    }
}
