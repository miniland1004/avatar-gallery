import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const galleryRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(galleryRoot, "..");
const xmlRoot = path.resolve(workspaceRoot, "avatar-remove");
const apply = process.argv.includes("--apply");
const reportPath = path.join(galleryRoot, "duplicate-removal-report.txt");

function assertInside(child, parent) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch path outside ${parent}: ${child}`);
  }
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function pngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function idFromImgDir(name) {
  return name.replace(/\.img$/, "");
}

function formatId(value) {
  return String(value).padStart(8, "0");
}

function itemSignature(dirName) {
  const dirPath = path.join(galleryRoot, dirName);
  const imageHashes = [];

  for (const file of fs.readdirSync(dirPath).filter((name) => name.endsWith(".png")).sort()) {
    if (file === "info.iconRaw.png") continue;

    const filePath = path.join(dirPath, file);
    const size = pngSize(filePath);
    if (size.width === 1 && size.height === 1) continue;

    imageHashes.push(hashFile(filePath));
  }

  return crypto.createHash("sha256").update(imageHashes.sort().join("\n")).digest("hex");
}

function readItems() {
  return fs
    .readdirSync(galleryRoot, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && /^\d+\.img$/.test(dirent.name))
    .map((dirent) => ({
      id: idFromImgDir(dirent.name),
      dirName: dirent.name,
      dirPath: path.join(galleryRoot, dirent.name),
      xmlName: `${idFromImgDir(dirent.name)}.img.xml`,
      xmlPath: path.join(xmlRoot, `${idFromImgDir(dirent.name)}.img.xml`),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildPlan(items) {
  const groupsBySignature = new Map();

  for (const item of items) {
    const signature = itemSignature(item.dirName);
    const group = groupsBySignature.get(signature) ?? [];
    group.push(item);
    groupsBySignature.set(signature, group);
  }

  const duplicateGroups = [...groupsBySignature.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.sort((a, b) => a.id.localeCompare(b.id)));

  const removedIds = new Set(duplicateGroups.flatMap((group) => group.slice(1).map((item) => item.id)));
  const keptItems = items.filter((item) => !removedIds.has(item.id));
  const renames = keptItems.map((item) => ({
    oldId: item.id,
    newId: item.id,
  }));

  return {
    duplicateGroups,
    removedIds,
    keptItems,
    renames,
  };
}

function writeReport(items, plan) {
  const lines = [];

  lines.push("Avatar Gallery Duplicate Removal Report");
  lines.push(`Generated at: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  lines.push("");
  lines.push("Criteria:");
  lines.push("- Exact duplicate visible PNG set.");
  lines.push("- Excluded info.iconRaw.png.");
  lines.push("- Excluded 1x1 empty PNG layers.");
  lines.push("");
  lines.push(`Original items: ${items.length}`);
  lines.push(`Duplicate groups: ${plan.duplicateGroups.length}`);
  lines.push(`Removed duplicate items: ${plan.removedIds.size}`);
  lines.push(`Final items: ${plan.keptItems.length}`);
  lines.push("");
  lines.push("[Removed duplicates]");

  plan.duplicateGroups.forEach((group, index) => {
    const keep = group[0];
    const removed = group.slice(1);
    lines.push(
      `${String(index + 1).padStart(2, "0")}. KEEP ${keep.id} -> ${keep.id}; REMOVE ${removed
        .map((item) => item.id)
        .join(", ")}`,
    );
  });

  lines.push("");
  lines.push("[Renumber map]");
  plan.renames.forEach((entry) => {
    const no = Number(entry.oldId) - 1009000;
    lines.push(`No.${String(no).padStart(2, "0")} ${entry.oldId} -> ${entry.newId}`);
  });

  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
}

function removePath(targetPath) {
  const resolved = path.resolve(targetPath);
  assertInside(resolved, workspaceRoot);
  fs.rmSync(resolved, { recursive: true, force: true });
}

function applyPlan(plan) {
  for (const item of plan.keptItems) {
    if (!fs.existsSync(item.xmlPath)) {
      throw new Error(`Missing XML for kept item: ${item.xmlPath}`);
    }
  }

  for (const group of plan.duplicateGroups) {
    for (const item of group.slice(1)) {
      removePath(item.dirPath);
      removePath(item.xmlPath);
    }
  }
}

const items = readItems();

if (!items.length) {
  throw new Error(`No .img folders found in ${galleryRoot}`);
}

if (!fs.existsSync(xmlRoot)) {
  throw new Error(`XML folder not found: ${xmlRoot}`);
}

for (const item of items) {
  if (!fs.existsSync(item.xmlPath)) {
    throw new Error(`Missing XML: ${item.xmlPath}`);
  }
}

const plan = buildPlan(items);
writeReport(items, plan);

console.log(`Original items: ${items.length}`);
console.log(`Duplicate groups: ${plan.duplicateGroups.length}`);
console.log(`Removed duplicate items: ${plan.removedIds.size}`);
console.log(`Final items: ${plan.keptItems.length}`);
console.log(`Report: ${reportPath}`);

if (apply) {
  applyPlan(plan);
  console.log("Applied duplicate removal.");
} else {
  console.log("Dry run only. Re-run with --apply to modify files.");
}