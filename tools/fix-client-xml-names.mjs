import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const galleryRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(galleryRoot, "..");
const xmlRoot = path.resolve(workspaceRoot, "avatar-remove");
const duplicateReportPath = path.join(galleryRoot, "duplicate-removal-report.txt");
const outputReportPath = path.join(xmlRoot, "client-xml-name-report.txt");
const apply = process.argv.includes("--apply");

function assertInside(child, parent) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch path outside ${parent}: ${child}`);
  }
}

function imgIdToEqpId(imgId) {
  return String(Number(imgId));
}

function displayName(no) {
  return `미니랜드 No.${String(no).padStart(2, "0")}`;
}

function clientDisplayName(no) {
  return `\uBBF8\uB2C8\uB79C\uB4DC No.${String(no).padStart(2, "0")}`;
}

function parseDuplicateReport() {
  const text = fs.readFileSync(duplicateReportPath, "utf8");
  const kept = [];
  const removedIds = new Set();

  for (const line of text.split(/\r?\n/)) {
    const renameMatch = line.match(/^No\.(\d+)\s+(\d{8})\s+->\s+(\d{8})$/);
    if (renameMatch) {
      kept.push({
        no: Number(renameMatch[1]),
        oldId: renameMatch[2],
        currentId: renameMatch[3],
      });
      continue;
    }

    const removeMatch = line.match(/;\s+REMOVE\s+(.+)$/);
    if (removeMatch) {
      removeMatch[1]
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .forEach((id) => removedIds.add(id));
    }
  }

  if (!kept.length) {
    throw new Error(`No renumber map found in ${duplicateReportPath}`);
  }

  return { kept, removedIds };
}

function restoreXmlFileNames(kept) {
  const tempSuffix = `.__restore_code_tmp_${Date.now()}`;
  const tempEntries = kept.map((entry) => ({
    ...entry,
    currentPath: path.join(xmlRoot, `${entry.currentId}.img.xml`),
    tempPath: path.join(xmlRoot, `${entry.currentId}.img.xml${tempSuffix}`),
    finalPath: path.join(xmlRoot, `${entry.oldId}.img.xml`),
  }));

  for (const entry of tempEntries) {
    if (!fs.existsSync(entry.currentPath)) {
      throw new Error(`Missing current XML for ${entry.oldId}: ${entry.currentPath}`);
    }
  }

  for (const entry of tempEntries) {
    assertInside(entry.currentPath, workspaceRoot);
    assertInside(entry.tempPath, workspaceRoot);
    fs.renameSync(entry.currentPath, entry.tempPath);
  }

  for (const entry of tempEntries) {
    assertInside(entry.tempPath, workspaceRoot);
    assertInside(entry.finalPath, workspaceRoot);
    let xml = fs.readFileSync(entry.tempPath, "utf8");
    const from = `<imgdir name="${entry.currentId}.img">`;
    const to = `<imgdir name="${entry.oldId}.img">`;

    if (!xml.includes(from)) {
      throw new Error(`Cannot find XML root ${from} in temp XML for ${entry.oldId}`);
    }

    xml = xml.replace(from, to);
    fs.writeFileSync(entry.tempPath, xml, "utf8");
    fs.renameSync(entry.tempPath, entry.finalPath);
  }
}

function removeEqpEntry(xml, eqpId) {
  const pattern = new RegExp(`<imgdir name="${eqpId}">[\\s\\S]*?<\\/imgdir>`, "g");
  return xml.replace(pattern, "");
}

function setEqpName(xml, eqpId, name) {
  const pattern = new RegExp(`(<imgdir name="${eqpId}">)([\\s\\S]*?)(<\\/imgdir>)`);
  const match = xml.match(pattern);

  if (!match) {
    throw new Error(`Missing Eqp.img.xml entry for ${eqpId}`);
  }

  const [, open, body, close] = match;
  const namePattern = /<string name="name" value="[^"]*"\/>/;
  const escapedName = name.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const nameNode = `<string name="name" value="${escapedName}"/>`;
  const nextBody = namePattern.test(body) ? body.replace(namePattern, nameNode) : `${nameNode}${body}`;

  return xml.replace(pattern, `${open}${nextBody}${close}`);
}

function makeEqpEntry(eqpId, name) {
  const escapedName = name.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<imgdir name="${eqpId}"><string name="name" value="${escapedName}"/></imgdir>`;
}

function insertEqpEntriesIntoCap(xml, entries) {
  if (!entries.length) {
    return xml;
  }

  const capStart = xml.indexOf(`<imgdir name="Cap">`);
  const capEnd = xml.indexOf(`</imgdir><imgdir name="Face">`, capStart);

  if (capStart === -1 || capEnd === -1) {
    throw new Error("Cannot find Cap section insertion point in Eqp.img.xml");
  }

  return `${xml.slice(0, capEnd)}${entries.join("")}${xml.slice(capEnd)}`;
}

function updateEqpNames(kept, removedIds) {
  const eqpPath = path.join(xmlRoot, "Eqp.img.xml");
  let eqpXml = fs.readFileSync(eqpPath, "utf8");
  const entriesToInsert = [];

  for (const removedId of removedIds) {
    eqpXml = removeEqpEntry(eqpXml, imgIdToEqpId(removedId));
  }

  for (const entry of kept) {
    const eqpId = imgIdToEqpId(entry.oldId);
    const name = clientDisplayName(entry.no);

    if (eqpXml.includes(`<imgdir name="${eqpId}">`)) {
      eqpXml = setEqpName(eqpXml, eqpId, name);
    } else {
      entriesToInsert.push(makeEqpEntry(eqpId, name));
    }
  }

  eqpXml = insertEqpEntriesIntoCap(eqpXml, entriesToInsert);
  fs.writeFileSync(eqpPath, eqpXml, "utf8");
}

function writeReport(kept, removedIds) {
  const lines = [];
  lines.push("Client XML Name Report");
  lines.push(`Generated at: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  lines.push("");
  lines.push("Policy:");
  lines.push("- Keep client item code numbers unchanged.");
  lines.push("- Remove duplicate item XMLs only.");
  lines.push("- Rename only Eqp.img.xml string name values to shifted Miniland numbers.");
  lines.push("");
  lines.push(`Final kept items: ${kept.length}`);
  lines.push(`Removed duplicate item codes: ${removedIds.size}`);
  lines.push("");
  lines.push("[Removed duplicate codes]");
  [...removedIds].sort().forEach((id) => {
    lines.push(`${id} / Eqp ${imgIdToEqpId(id)}`);
  });
  lines.push("");
  lines.push("[Kept code -> string name]");
  kept.forEach((entry) => {
    lines.push(`${entry.oldId} / Eqp ${imgIdToEqpId(entry.oldId)} -> ${clientDisplayName(entry.no)}`);
  });

  fs.writeFileSync(outputReportPath, `${lines.join("\n")}\n`, "utf8");
}

function validateDryRun(kept, removedIds) {
  const currentMissing = kept
    .map((entry) => path.join(xmlRoot, `${entry.currentId}.img.xml`))
    .filter((filePath) => !fs.existsSync(filePath));
  const eqpXml = fs.readFileSync(path.join(xmlRoot, "Eqp.img.xml"), "utf8");
  const eqpEntriesToInsert = kept
    .map((entry) => imgIdToEqpId(entry.oldId))
    .filter((eqpId) => !eqpXml.includes(`<imgdir name="${eqpId}">`));
  const canInsertEqp =
    !eqpEntriesToInsert.length ||
    (eqpXml.includes(`<imgdir name="Cap">`) && eqpXml.includes(`</imgdir><imgdir name="Face">`));

  return {
    kept: kept.length,
    removed: removedIds.size,
    currentMissing,
    eqpEntriesToInsert,
    canInsertEqp,
  };
}

if (!fs.existsSync(xmlRoot)) {
  throw new Error(`XML folder not found: ${xmlRoot}`);
}

const { kept, removedIds } = parseDuplicateReport();
const dryRun = validateDryRun(kept, removedIds);

console.log(`Kept items: ${dryRun.kept}`);
console.log(`Removed duplicate codes: ${dryRun.removed}`);
console.log(`Missing current XML files: ${dryRun.currentMissing.length}`);
console.log(`Eqp entries to insert: ${dryRun.eqpEntriesToInsert.length}`);

if (dryRun.currentMissing.length || !dryRun.canInsertEqp) {
  console.log(JSON.stringify({ currentMissing: dryRun.currentMissing.slice(0, 10), eqpEntriesToInsert: dryRun.eqpEntriesToInsert.slice(0, 10), canInsertEqp: dryRun.canInsertEqp }, null, 2));
  throw new Error("Dry-run validation failed.");
}

writeReport(kept, removedIds);

if (apply) {
  restoreXmlFileNames(kept);
  updateEqpNames(kept, removedIds);
  writeReport(kept, removedIds);
  console.log(`Applied client XML code restore and string renaming.`);
} else {
  console.log(`Dry run only. Report: ${outputReportPath}`);
  console.log("Re-run with --apply to modify avatar-remove.");
}
