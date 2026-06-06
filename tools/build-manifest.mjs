import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "assets");
const outputFile = path.join(outputDir, "manifest.js");

const movementActions = [
  "stand1",
  "stand2",
  "walk1",
  "walk2",
  "jump",
  "sit",
  "ladder",
  "rope",
  "fly",
  "prone",
  "heal",
  "alert",
];

const attackActions = [
  "swingO1",
  "swingO2",
  "swingO3",
  "swingOF",
  "swingP1",
  "swingP2",
  "swingPF",
  "swingT1",
  "swingT2",
  "swingT3",
  "swingTF",
  "stabO1",
  "stabO2",
  "stabOF",
  "stabT1",
  "stabT2",
  "stabTF",
  "shoot1",
  "shoot2",
  "shootF",
  "proneStab",
];

const knownActions = new Set([...movementActions, ...attackActions]);
const actionOrder = new Map([...movementActions, ...attackActions].map((action, index) => [action, index]));

function pngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function layerRank(layer) {
  if (layer === "body") return 10;
  if (layer === "default") return 20;
  if (layer === "default1") return 30;
  if (layer === "cape") return 40;
  if (layer === "weapon") return 50;

  const canvasMatch = layer.match(/^WeaponCanvas(\d+)$/);
  if (canvasMatch) {
    return 100 + Number(canvasMatch[1]);
  }

  return 1000;
}

function classify(layerCounts) {
  const layers = new Set(Object.keys(layerCounts));
  const hasWeaponCanvas = [...layers].some((layer) => layer.startsWith("WeaponCanvas"));

  if (layers.has("weapon") || hasWeaponCanvas) return "weapon";
  if (layers.has("cape")) return "cape";
  if (layers.has("body")) return "body";
  return "outfit";
}

function parseItem(dirent) {
  const itemDir = path.join(root, dirent.name);
  const files = fs.readdirSync(itemDir).filter((file) => file.endsWith(".png"));
  const groups = new Map();
  const layerCounts = {};

  for (const file of files) {
    const match = file.match(/^(.+?)(?:\.(\d+))?\.([^.]+)\.png$/);
    if (!match) continue;

    const [, action, frameText, layer] = match;
    layerCounts[layer] = (layerCounts[layer] || 0) + 1;

    if (!knownActions.has(action)) continue;

    const filePath = path.join(itemDir, file);
    const size = pngSize(filePath);
    if (size.width === 1 && size.height === 1) continue;

    const frame = Number(frameText ?? 0);
    const actionGroup = groups.get(action) ?? new Map();
    const frameGroup = actionGroup.get(frame) ?? [];
    frameGroup.push({ file, layer });
    actionGroup.set(frame, frameGroup);
    groups.set(action, actionGroup);
  }

  const actions = {};
  [...groups.entries()]
    .sort((a, b) => actionOrder.get(a[0]) - actionOrder.get(b[0]))
    .forEach(([action, frames]) => {
      actions[action] = [...frames.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([index, frameFiles]) => ({
          index,
          files: frameFiles
            .sort((a, b) => layerRank(a.layer) - layerRank(b.layer) || a.file.localeCompare(b.file))
            .map((entry) => entry.file),
        }));
    });

  return {
    id: dirent.name.replace(/\.img$/, ""),
    dir: dirent.name,
    icon: `${dirent.name}/info.icon.png`,
    kind: classify(layerCounts),
    actions,
  };
}

const items = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory() && /^\d+\.img$/.test(dirent.name))
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(parseItem);

const manifest = {
  generatedAt: new Date().toISOString(),
  totalItems: items.length,
  items,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  outputFile,
  `window.AVATAR_MANIFEST = ${JSON.stringify(manifest)};\n`,
  "utf8",
);

console.log(`Generated ${path.relative(root, outputFile)} with ${items.length} items.`);
