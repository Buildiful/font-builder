# Font Builder by Buildiful®

A free, open-source, browser-based font maker. Draw characters with your mouse, stylus, or finger, or upload a graphic for each character. Preview the results and export an installable **TrueType (`.ttf`) font**.

**No account, backend, subscription, build step, or font-conversion API is required.** All font artwork and generated files are processed locally in the browser.

## Features

- A printable Basic Latin character set: **A–Z, a–z, 0–9, and 32 punctuation/symbol characters** (94 drawable characters), plus automatic space support.
- Pressure-independent drawing, eraser, brush-size setting, undo/redo, per-character clearing.
- PNG, JPG, and WebP uploads for any character, including drag-and-drop onto the editor. Opaque graphics are converted into contrasting silhouettes; transparency is preserved where possible.
- Per-glyph character advance/spacing and outline-smoothing adjustments.
- Live text preview using the actual generated font in browsers that support `FontFace`.
- Save and reopen an editable `.fontbuilder.json` project; draft autosave in browser storage.
- Installable TrueType `.ttf` export with a Unicode character map, font metadata, correctly wound outlines, and counter shapes (holes).
- Consent-gated Google Analytics 4 integration, with action tracking that does not include artwork or text content.

## Quick start

1. Open `index.html` in a modern browser. For normal website functionality, GitHub Pages is recommended.
2. Select a character on the left, draw a shape or upload an image, and repeat for any other characters you want.
3. Name the font and type into the live preview to see your work. Uncreated characters appear in a fallback font on the page and are omitted from the exported font.
4. Click **Export TTF**. Install the file using your operating system's font installation feature. Some apps may require a restart before the new font appears.
5. Use **Save project** to keep an editable backup. **Open** restores it.

**Note:** An exported typeface can contain only one customized character, but it will only substitute for characters you actually created. For a complete alphabet, draw all characters you need. The exported font uses monochrome outlines; original image colors and gradients are not retained.

## Publish with GitHub Pages

1. Create a new GitHub repository (for example, `font-builder`).
2. Upload **all files and folders from this project directory** to the repository root, including files beginning with a dot.
3. Commit to `main`.
4. In GitHub, open **Settings → Pages → Build and deployment**. Select **Deploy from a branch**, choose `main`, and set the folder to `/ (root)`.
5. Save; when Pages reports the published address, open it and test a draw-and-export flow.

This project uses relative paths, so it can be served from a GitHub Pages project subpath such as `https://YOUR-USERNAME.github.io/font-builder/` without modification.

No Node.js, npm install, CI pipeline, or server-side runtime is required.

## Repository layout

```text
.
├── index.html
├── styles.css
├── privacy.html
├── buildiful-analytics-consent.js
├── js/
│   ├── app.js
│   └── font-engine.js
├── assets/
│   ├── buildiful-logo-white.png
│   ├── favicon.ico
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png
│   ├── android-chrome-192x192.png
│   └── android-chrome-512x512.png
├── tests/
│   └── font-engine.test.cjs
├── .gitignore
├── .nojekyll
└── LICENSE
```

## How font creation works

The editor records each character on a transparent 320 × 320 pixel canvas. When generating the font, the app converts visible alpha pixels into directed boundary contours, simplifies the resulting polygons, and maps them into TrueType glyph coordinates. Closed inner boundaries retain the opposite winding, preserving letter counters. The included dependency-free TrueType writer assembles the `glyf`, `loca`, `cmap`, `hmtx`, `name`, `head`, `hhea`, `maxp`, `OS/2`, and `post` tables.

This is a **first-release, basic font maker**, not a full typography suite. Known limitations: no kerning pairs, ligatures, connected-script shaping, OpenType advanced features, hinting, or multicolor font data. Drawn and imported contours are approximated from a binary mask, so very small details can be lost and text may look less smooth than a professionally designed font. For best results, upload simple, high-contrast artwork or draw with a medium to thick brush.

## Privacy and analytics

The editor works without GA4. The consent banner lets visitors choose optional analytics; no Google Analytics script is requested until consent is granted. Consent is remembered using browser storage, and visitors can change it using the sidebar **Analytics settings** link.

The measurement ID is configured in `index.html`:

```html
<script defer src="./buildiful-analytics-consent.js"
        data-measurement-id="G-TG14RBXLTF"
        data-tool-name="Font Builder"
        data-privacy-url="./privacy.html"></script>
```

Available consent-gated events: `font_export` (`glyph_count`, `file_format`), `graphic_import` (`file_type`), `project_save` (`glyph_count`), `project_open` (`glyph_count`). No names, user-drawn artwork, or preview text are sent as event attributes. Browser page URLs sent to GA4 exclude query strings and URL fragments.

For additional details, see [`privacy.html`](privacy.html).

## License

MIT. See [`LICENSE`](LICENSE).

Buildiful® is a trademark of its respective owner. The included Buildiful® visual assets are provided for this project; the MIT code license does **not** grant permission to use Buildiful® branding in unrelated products.

Built by Buildiful®.

## Optional source tests

If Node.js is installed, run `node --test tests/font-engine.test.cjs` in the project folder. The tests cover TrueType table structure, global checksum, and preservation of enclosed shapes in traced artwork. Testing does not need npm or downloaded dependencies.
