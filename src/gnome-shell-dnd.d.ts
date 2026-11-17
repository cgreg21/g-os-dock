declare module 'resource:///org/gnome/shell/ui/dnd.js' {
    export enum DragMotionResult {
        NO_DROP = 0,
        COPY_DROP = 1,
        MOVE_DROP = 2,
    }

    export function makeDraggable(actor: any, params?: any): any;
}
