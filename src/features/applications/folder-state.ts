export interface DockFolderRecord {
    id: string;
    name: string;
    appIds: string[];
    viewMode?: 'grid' | 'stack';
}

export interface DockFolderRemovalState {
    folders: DockFolderRecord[];
    order: string[];
}

/** Merge two application groups without duplicates or empty identifiers. */
export function mergeDockFolderMembers(
    targetIds: readonly string[],
    sourceIds: readonly string[],
): string[] {
    return [...new Set([...targetIds, ...sourceIds].filter(id => id.length > 0))];
}

/** Replace two dock entries with one folder at the earliest previous position. */
export function resolveDockFolderDropOrder(
    order: readonly string[],
    sourceId: string,
    targetId: string,
    folderId: string,
): string[] {
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    const insertionIndex = Math.min(
        sourceIndex < 0 ? Number.MAX_SAFE_INTEGER : sourceIndex,
        targetIndex < 0 ? Number.MAX_SAFE_INTEGER : targetIndex,
    );
    const remaining = order.filter(id => id !== sourceId && id !== targetId);
    if (insertionIndex === Number.MAX_SAFE_INTEGER)
        remaining.push(folderId);
    else
        remaining.splice(Math.min(insertionIndex, remaining.length), 0, folderId);
    return remaining;
}

/** Remove an application from a folder and restore it as a dock entry. */
export function resolveDockFolderRemoval(
    folders: readonly DockFolderRecord[],
    order: readonly string[],
    folderId: string,
    appId: string,
): DockFolderRemovalState | null {
    const folder = folders.find(candidate => candidate.id === folderId);
    if (!folder || !folder.appIds.includes(appId))
        return null;

    const remaining = folder.appIds.filter(id => id !== appId);
    const nextFolders = folders
        .filter(candidate => candidate.id !== folderId)
        .map(candidate => ({ ...candidate, appIds: [...candidate.appIds] }));
    const index = order.indexOf(folderId);
    const nextOrder = order.filter(id => id !== folderId);
    if (remaining.length >= 2) {
        nextFolders.push({ ...folder, appIds: remaining });
        const folderIndex = index < 0 ? nextOrder.length : Math.min(index, nextOrder.length);
        nextOrder.splice(folderIndex, 0, folderId);
        nextOrder.splice(folderIndex + 1, 0, `app:${appId}`);
    } else {
        const restoredIds = [...remaining, appId].map(id => `app:${id}`);
        nextOrder.splice(index < 0 ? nextOrder.length : Math.min(index, nextOrder.length), 0, ...restoredIds);
    }
    return { folders: nextFolders, order: nextOrder };
}
