import St from 'gi://St?version=51';

/** Avoids redundant GTK/Clutter style recalculation for unchanged styles. */
export class DockStyleManager {
    private styles = new WeakMap<St.Widget, string>();

    apply(actor: St.Widget, style: string): boolean {
        if (this.styles.get(actor) === style)
            return false;
        actor.set_style(style);
        this.styles.set(actor, style);
        return true;
    }

    forget(actor: St.Widget): void {
        this.styles.delete(actor);
    }
}

/** Shared style manager for dock actors. */
export const dockStyles = new DockStyleManager();
