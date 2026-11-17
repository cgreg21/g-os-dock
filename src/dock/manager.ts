import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { DockView } from './view.js';

export class DockManager {
    private settings: any;
    private views: DockView[] = [];
    private monitorSignal = 0;
    private settingsSignal = 0;

    constructor(settings: any) {
        this.settings = settings;
    }

    enable(): void {
        this.rebuild();
        // GNOME Shell emits this JS-level signal; it is not exposed in the generated GIR type.
        this.monitorSignal = (Main.layoutManager as any).connect('monitors-changed', () => this.rebuild());
        this.settingsSignal = this.settings.connect('changed::show-on-all-monitors', () => this.rebuild());
    }

    private rebuild(): void {
        this.views.forEach(view => view.destroy());
        this.views = [];
        const monitors = Main.layoutManager.monitors;
        if (monitors.length === 0) return;
        const showAll = this.settings.get_boolean('show-on-all-monitors');
        const primary = Main.layoutManager.primaryIndex;
        const targets = showAll ? monitors.map((_: any, index: number) => index) : [primary];
        for (const index of targets) {
            const monitor = monitors[index];
            if (monitor) this.views.push(new DockView(index, monitor, this.settings));
        }
    }

    disable(): void {
        if (this.monitorSignal) Main.layoutManager.disconnect(this.monitorSignal);
        if (this.settingsSignal) this.settings.disconnect(this.settingsSignal);
        this.monitorSignal = 0;
        this.settingsSignal = 0;
        this.views.forEach(view => view.destroy());
        this.views = [];
    }
}
