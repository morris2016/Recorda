// Rasterises resources/icons/recorda.svg into PNGs at standard Windows icon
// sizes, then assembles them into a multi-resolution recorda.ico.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const iconsDir = path.join(root, "resources", "icons");
const svgPath = path.join(iconsDir, "recorda.svg");
const icoPath = path.join(iconsDir, "recorda.ico");
const pngHero = path.join(iconsDir, "icon.png");
const pngTray = path.join(iconsDir, "tray.png");

if (!fs.existsSync(svgPath)) {
  console.error("[recorda-icon] missing", svgPath);
  process.exit(1);
}
const svg = fs.readFileSync(svgPath);

// Windows icon sizes: 16, 24, 32, 48, 64, 128, 256.
// 256 is required for modern Vista+ resource icons.
const sizes = [16, 24, 32, 48, 64, 128, 256];

const renders = [];
for (const size of sizes) {
  const out = path.join(iconsDir, `recorda-${size}.png`);
  await sharp(svg, { density: 768 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(out);
  renders.push(out);
  console.log(`[recorda-icon] rendered ${size}x${size}`);
}

// Hero PNG (used by Linux + as fallback).
await sharp(svg, { density: 768 })
  .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(pngHero);

// Smaller tray PNG (Win tray uses 16-32 typically; we ship 32 with downscale).
await sharp(svg, { density: 768 })
  .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(pngTray);

// Combine into the multi-size .ico
const buf = await pngToIco(renders);
fs.writeFileSync(icoPath, buf);
console.log(`[recorda-icon] wrote ${icoPath}  (${buf.length.toLocaleString()} bytes, ${sizes.length} sizes)`);

// Clean up intermediate PNGs except the hero/tray.
for (const r of renders) fs.unlinkSync(r);
console.log("[recorda-icon] done");
