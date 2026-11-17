# G-OS Dock

GNOME Shell 51 dock extension, written in TypeScript and compiled to JavaScript. This repository includes the complete source snapshot in `g-os-dock-source.zip`.

## Build

Extract the archive, then run:

```sh
npm install
npm run check
npm run pack
```

The package output is `g-os-dock@cgreg21.github.io.zip`. Install with `gnome-extensions install --force g-os-dock@cgreg21.github.io.zip`, then enable with `gnome-extensions enable g-os-dock@cgreg21.github.io`.

The source README documents features, dependencies, and publication steps. The extension still requires runtime testing in a real GNOME Shell 51 session before release.

Repository: https://github.com/cgreg21/g-os-dock
