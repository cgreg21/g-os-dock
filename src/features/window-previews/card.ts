import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Meta from 'gi://Meta?version=51';
import Shell from 'gi://Shell?version=51';

/** Builds a single window preview card and its window actions. */
export function createWindowPreviewCard(
    app: Shell.App,
    window: Meta.Window,
    index: number,
    onClose: () => void,
): { card: St.BoxLayout; previewButton: St.Button } {
    const card = new St.BoxLayout({
        style_class: 'g-os-dock-preview-card',
        vertical: true,
        reactive: true,
        track_hover: true,
        x_expand: false,
        y_expand: false,
    });
    card.set_style('spacing: 5px; padding: 6px; border-radius: 9px; background-color: rgba(255,255,255,0.07);');

    const previewButton = new St.Button({
        style_class: 'g-os-dock-preview-open',
        reactive: true,
        can_focus: true,
        track_hover: true,
        x_expand: false,
        y_expand: false,
    });
    previewButton.set_style('padding: 0; background-color: transparent;');

    const content = new St.BoxLayout({ vertical: true, style: 'spacing: 5px;' });
    let compositorActor: Clutter.Actor | null = null;
    try {
        compositorActor = window.get_compositor_private();
    } catch (_error) {
        // A compositor actor may not be available for special windows.
    }

    if (compositorActor && !window.minimized) {
        const clone = new Clutter.Clone({ source: compositorActor });
        clone.set_size(176, 104);
        content.add_child(new St.Bin({
            style_class: 'g-os-dock-preview-thumbnail',
            width: 176,
            height: 104,
            child: clone,
        }));
    } else {
        content.add_child(new St.Bin({
            width: 176,
            height: 104,
            child: app.create_icon_texture(56),
        }));
    }

    let title = '';
    try {
        title = window.get_title() || '';
    } catch (_error) {
        // The title is optional.
    }

    content.add_child(new St.Label({
        text: (title.trim() || `Window ${index + 1}`).slice(0, 42),
        style: 'max-width: 176px;',
        x_align: Clutter.ActorAlign.CENTER,
    }));

    const workspaceInfo = getWorkspaceInfo(window);
    content.add_child(new St.Label({
        text: workspaceInfo.label,
        style_class: 'g-os-dock-preview-workspace',
        x_align: Clutter.ActorAlign.CENTER,
    }));

    previewButton.set_child(content);
    previewButton.accessible_name = `Activate ${title.trim() || `window ${index + 1}`}`;
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
    const minimize = new St.Button({
        style_class: 'g-os-dock-preview-action',
        child: new St.Icon({ icon_name: 'window-minimize-symbolic', icon_size: 14 }),
        can_focus: true,
        reactive: true,
        accessible_name: 'Minimize window',
        x_expand: true,
    });
    minimize.connect('clicked', () => {
        window.minimize();
        onClose();
    });
    actions.add_child(minimize);

    if (workspaceInfo.workspace && !workspaceInfo.onAllWorkspaces &&
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
            workspaceInfo.workspace.activate(timestamp);
            activateWindow(app, window, timestamp);
            onClose();
        });
        actions.add_child(switchWorkspace);
    }

    const close = new St.Button({
        style_class: 'g-os-dock-preview-action close',
        child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 14 }),
        can_focus: true,
        reactive: true,
        accessible_name: 'Close window',
        x_expand: true,
    });
    close.connect('clicked', () => {
        window.delete(global.get_current_time());
        onClose();
    });
    actions.add_child(close);
    card.add_child(actions);

    return { card, previewButton };
}

function getWorkspaceInfo(window: Meta.Window): {
    workspace: Meta.Workspace | null;
    index: number;
    onAllWorkspaces: boolean;
    label: string;
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

    const label = onAllWorkspaces
        ? 'All workspaces'
        : index >= 0 ? `Workspace ${index + 1}` : 'Workspace unavailable';
    return { workspace, index, onAllWorkspaces, label };
}

function activateWindow(app: Shell.App, window: Meta.Window, timestamp = global.get_current_time()): void {
    try {
        app.activate_window(window, timestamp);
    } catch (_error) {
        window.activate(timestamp);
    }
}
