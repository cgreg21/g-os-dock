# G-OS Dock — GNOME Shell 51

G-OS Dock is a GNOME Shell extension written in TypeScript and compiled to JavaScript. The extension runs inside GNOME Shell; it does not use a Rust daemon, D-Bus service, or distribution-specific RPM/DEB/Arch package builders.

## Features in this source version

- A dock view on each monitor, sharing GNOME's favorites list.
- Applications list combines favorites and running applications.
- Bottom, top, left, and right positioning.
- Per-monitor edge sensor and auto-hide.
- Acrylic-like translucent styling (CSS transparency, not compositor backdrop blur).
- Running-application indicator and focused-application highlight.
- Optional window-count badges.
- Per-application context menu: launch a new window, select an open window, minimize/close windows, pin/unpin favorites, reorder favorites.
- Configurable icon size, spacing, theme, auto-hide and smart-hide.
- Hover magnification.
- Preferences through GNOME Extensions.

## Requirements

- GNOME Shell 51 (Wayland or X11; runtime behavior still needs testing on the target session).
- Node.js 20+ and npm for development builds.
- `glib-compile-schemas` and `zip`.

## Build and validate

```sh
npm install
npm run check
npm run pack
```

This creates `g-os-dock@cgreg21.github.io.zip`, containing the compiled extension JavaScript, metadata, stylesheet and compiled GSettings schema. No Node runtime or TypeScript compiler is needed on the target desktop.

## Install locally

```sh
gnome-extensions install --force g-os-dock@cgreg21.github.io.zip
gnome-extensions enable g-os-dock@cgreg21.github.io
```

Or run `scripts/install-local.sh`. To uninstall, run `scripts/uninstall-local.sh`.

## Publish on extensions.gnome.org

Build the ZIP with `npm run pack`, test it in an actual GNOME Shell 51 session, then upload the ZIP at https://extensions.gnome.org/upload/. Publication is subject to GNOME Extensions review; this repository workflow does not publish automatically to extensions.gnome.org.

## Limitations

The acrylic effect is translucent CSS only. GNOME Shell's public extension APIs do not expose a general backdrop-blur API for arbitrary extension actors. Shell APIs and menu/window behavior must be validated against a real GNOME 51 session before release.
