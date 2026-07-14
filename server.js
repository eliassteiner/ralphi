const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { spawn } = require("node:child_process");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const APP_ROOT = __dirname;
const PORT = Number.parseInt(process.env.PORT || "80", 10);
const HOST = process.env.HOST || "0.0.0.0";
const VIBES_ROOT = path.resolve(process.env.VIBES_ROOT || "/Users/boot/Documents/vibes");
const VIBES_HOST_ROOT = process.env.VIBES_HOST_ROOT || VIBES_ROOT;
const PROJECTS_FILE = path.join(VIBES_ROOT, "PROJECTS.md");
const PROXY_CADDYFILE = path.join(VIBES_ROOT, "vibes-proxy", "Caddyfile");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(APP_ROOT, "data"));
const IMPORTED_FILE = path.join(DATA_DIR, "imported-projects.json");
const LOOPS_FILE = path.join(DATA_DIR, "loops.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const RALPH_PROJECT_ROOT = path.resolve(
  process.env.RALPH_PROJECT_ROOT ||
    (fs.existsSync(path.join(VIBES_ROOT, "ralph")) ? path.join(VIBES_ROOT, "ralph") : APP_ROOT),
);
const SPECS_ROOT = path.resolve(process.env.SPECS_ROOT || path.join(RALPH_PROJECT_ROOT, "specs"));
const SPEC_TEMPLATE_FILE = path.resolve(
  process.env.SPEC_TEMPLATE_FILE || path.join(RALPH_PROJECT_ROOT, "templates", "spec-template.md"),
);
const PI_MODELS_FILE = path.resolve(process.env.PI_MODELS_FILE || path.join(os.homedir(), ".pi", "agent", "models.json"));
const LOOP_TIMEOUT_MS = Number.parseInt(process.env.LOOP_TIMEOUT_MS || `${24 * 60 * 60 * 1000}`, 10);
const LOOP_SCRIPT_CANDIDATES = ["scripts/ralph-loop-codex.sh", "scripts/ralph-loop.sh"];
const LEGACY_DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_PROVIDER = Object.freeze({
  name: "wyna",
  baseUrl: "http://100.85.99.127:9002/v1",
  apiKey: "not-needed",
  api: "openai-completions",
  model: "deepseek-v4-flash",
});
const STATUS_TAGS = new Set(["pending", "running", "done"]);
const SPEC_STATUS_TO_HEADING = {
  pending: "PENDING",
  running: "RUNNING",
  done: "COMPLETE",
};
const SPEC_HEADING_TO_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETE: "done",
};

const STATUS_ORDER = ["Aktiv", "Archiv", "Referenz"];
const STATIC_FILES = new Map([
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/favicon.svg", "favicon.svg"],
  ["/favicon.ico", "favicon.svg"],
]);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const runningLoops = new Map();
const streamClients = new Map();
let loopsCachePromise = null;
let loopsSaveQueue = Promise.resolve();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": CONTENT_TYPES[".json"],
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "content-type": CONTENT_TYPES[".txt"],
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function sendError(res, status, message) {
  sendJson(res, status, { message });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isInsideDirectory(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isInsideVibesRoot(targetPath) {
  return isInsideDirectory(VIBES_ROOT, targetPath);
}

function projectPathFor(directoryName, status) {
  const cleanDirectory = String(directoryName || "")
    .replace(/^\/+|\/+$/g, "")
    .trim();

  if (!cleanDirectory) {
    return null;
  }

  const base = status === "Archiv" ? path.join(VIBES_ROOT, "archive") : VIBES_ROOT;
  const resolved = path.resolve(base, cleanDirectory);
  return isInsideVibesRoot(resolved) ? resolved : null;
}

function toHostPath(internalPath) {
  const relative = path.relative(VIBES_ROOT, internalPath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return path.join(VIBES_HOST_ROOT, relative);
  }
  return internalPath;
}

function cleanCell(cell) {
  return String(cell || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cleanCell);
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function normalizeHeader(header) {
  const normalized = header.toLowerCase().replace(/\?/g, "").trim();
  if (normalized === "projekt") return "project";
  if (normalized === "beschreibung") return "description";
  if (normalized === "status") return "sourceStatus";
  if (normalized === "ralph") return "ralph";
  if (normalized === "docker") return "docker";
  return normalized;
}

function parseProjectName(projectCell) {
  const clean = cleanCell(projectCell);
  const match = clean.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  const name = match ? match[1].trim() : clean;
  const directoryName = (match ? match[2].trim() : name).replace(/^\/+|\/+$/g, "");
  return { name, directoryName };
}

function slugify(value) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function isYes(value) {
  return /^ja\b/i.test(cleanCell(value));
}

function sourceSection(line) {
  if (/^###\s+Aktive\b/i.test(line)) return "Aktiv";
  if (/^###\s+Archiv\b/i.test(line)) return "Archiv";
  if (/^###\s+Referenzen\b/i.test(line)) return "Referenz";
  return null;
}

function parseProjectsMarkdown(markdown) {
  const projects = [];
  const usedIds = new Set();
  let status = null;
  let headers = null;

  for (const line of markdown.split(/\r?\n/)) {
    const newStatus = sourceSection(line);
    if (newStatus) {
      status = newStatus;
      headers = null;
      continue;
    }

    if (status && /^##\s+/.test(line) && !/^###\s+/.test(line)) {
      status = null;
      headers = null;
      continue;
    }

    if (!status || !line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitTableRow(line);
    if (isSeparatorRow(cells)) {
      continue;
    }

    if (cells.some((cell) => cell.toLowerCase() === "projekt")) {
      headers = cells.map(normalizeHeader);
      continue;
    }

    if (!headers || !headers.includes("project")) {
      continue;
    }

    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || "";
    });

    const { name, directoryName } = parseProjectName(row.project);
    if (!name) {
      continue;
    }

    const baseId = slugify(directoryName || name);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    projects.push({
      id,
      name,
      directoryName,
      description: row.description || "",
      status,
      sourceStatus: row.sourceStatus || status,
      source: "PROJECTS.md",
      table: row,
      internalPath: projectPathFor(directoryName, status),
    });
  }

  if (!projects.some((project) => project.id === "ralphi" || project.directoryName === "ralph")) {
    projects.push({
      id: "ralphi",
      name: "ralphi",
      directoryName: "ralph",
      description: "Ralphi - Ralph Wiggum Loop Manager",
      status: "Aktiv",
      sourceStatus: "Aktiv",
      source: "filesystem",
      table: {
        project: "ralphi",
        description: "Ralphi - Ralph Wiggum Loop Manager",
        sourceStatus: "Aktiv",
        ralph: "Ja",
        docker: "Ja",
      },
      internalPath: projectPathFor("ralph", "Aktiv"),
    });
  }

  return projects;
}

function isComposeFile(fileName) {
  return /^(docker-compose|compose)(\.[^.]+)*\.ya?ml$/i.test(fileName);
}

async function readTextIfExists(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function validationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeTag(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitTags(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitTags);
  }
  return String(value || "")
    .split(",")
    .map(normalizeTag)
    .filter(Boolean);
}

function statusFromTag(tag) {
  return STATUS_TAGS.has(tag) ? tag : "";
}

function statusFromHeading(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return SPEC_HEADING_TO_STATUS[normalized] || "";
}

function specStatusFromTags(tags) {
  return tags.map(statusFromTag).find(Boolean) || "";
}

function normalizeSpecTags(tags, preferredStatus = "pending") {
  const cleanTags = splitTags(tags);
  const status = statusFromTag(preferredStatus) || specStatusFromTags(cleanTags) || "pending";
  const tagSet = new Set(cleanTags.filter((tag) => !STATUS_TAGS.has(tag)));
  const ordered = [status, ...[...tagSet].sort((a, b) => a.localeCompare(b))];
  return ordered;
}

function specStatusHeading(status) {
  return SPEC_STATUS_TO_HEADING[statusFromTag(status) || "pending"];
}

function cleanSpecTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSpecDescription(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function cleanMetadataValue(value) {
  return String(value || "")
    .replace(/-->/g, "--\\>")
    .replace(/\r?\n/g, " ")
    .trim();
}

function slugifySpec(value) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "spec";
}

function extractSpecMetadata(raw) {
  const metadata = {};
  const pattern = /^<!--\s*([A-Z_]+):\s*([^\n]*?)\s*-->\s*$/gm;
  let match = pattern.exec(raw);
  while (match) {
    metadata[match[1]] = match[2].trim();
    match = pattern.exec(raw);
  }
  return metadata;
}

function extractSpecTitle(raw, fallbackId) {
  const titleMatch = raw.match(/^#\s+Specification:\s*(.+?)\s*$/m);
  if (titleMatch?.[1]) {
    return cleanSpecTitle(titleMatch[1]);
  }

  const featureMatch = raw.match(/^##\s+Feature:\s*(.+?)\s*$/m);
  if (featureMatch?.[1]) {
    return cleanSpecTitle(featureMatch[1]);
  }

  return cleanSpecTitle(fallbackId.replace(/^\d{3}-/, "").replace(/-/g, " "));
}

function extractSpecDescription(raw) {
  const overviewMatch = raw.match(/###\s+Overview\s*\n([\s\S]*?)(?=\n###\s+|\n---\s*\n|\n##\s+|\n#\s+|$)/i);
  if (!overviewMatch?.[1]) {
    return "";
  }
  return cleanSpecDescription(overviewMatch[1]);
}

function extractSpecStatus(raw) {
  const statusMatch = raw.match(/^##\s+Status:\s*([A-Z]+)\s*$/m);
  return statusFromHeading(statusMatch?.[1]) || "pending";
}

function specFileHostPath(specFile) {
  return isInsideDirectory(VIBES_ROOT, specFile) ? toHostPath(specFile) : specFile;
}

async function parseSpecFile(specFile, id, storageType) {
  const [raw, stat] = await Promise.all([fsp.readFile(specFile, "utf8"), fsp.stat(specFile)]);
  const metadata = extractSpecMetadata(raw);
  const metadataTags = splitTags(metadata.TAGS || "");
  const status = specStatusFromTags(metadataTags) || extractSpecStatus(raw);
  const tags = normalizeSpecTags(metadataTags, status);
  const createdAt = metadata.CREATED_AT || stat.birthtime.toISOString();
  const updatedAt = metadata.UPDATED_AT || stat.mtime.toISOString();

  return {
    id,
    title: extractSpecTitle(raw, id),
    description: extractSpecDescription(raw),
    projectId: cleanMetadataValue(metadata.PROJECT || ""),
    tags,
    status: specStatusFromTags(tags) || "pending",
    statusHeading: specStatusHeading(specStatusFromTags(tags) || "pending"),
    createdAt,
    updatedAt,
    path: specFile,
    hostPath: specFileHostPath(specFile),
    directoryPath: storageType === "directory" ? path.dirname(specFile) : null,
    storageType,
    raw,
  };
}

async function readAllSpecs() {
  let entries = [];
  try {
    entries = await fsp.readdir(SPECS_ROOT, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const seen = new Set();
  const specs = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isDirectory()) {
      const id = entry.name;
      const specFile = path.resolve(SPECS_ROOT, id, "spec.md");
      if (seen.has(id) || !isInsideDirectory(SPECS_ROOT, specFile) || !(await pathExists(specFile))) {
        continue;
      }
      seen.add(id);
      specs.push(await parseSpecFile(specFile, id, "directory"));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      const id = entry.name.replace(/\.md$/i, "");
      const specFile = path.resolve(SPECS_ROOT, entry.name);
      if (seen.has(id) || !isInsideDirectory(SPECS_ROOT, specFile)) {
        continue;
      }
      seen.add(id);
      specs.push(await parseSpecFile(specFile, id, "file"));
    }
  }

  return specs.sort((a, b) => {
    const dateDiff = Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id);
  });
}

function specMatchesFilters(spec, filters) {
  const tag = normalizeTag(filters.tag || "");
  const project = String(filters.project || "").trim();
  const query = String(filters.q || "").trim().toLowerCase();

  if (tag && !spec.tags.includes(tag)) {
    return false;
  }

  if (project && spec.projectId !== project) {
    return false;
  }

  if (query) {
    const haystack = [spec.title, spec.description, spec.projectId, spec.tags.join(" ")].join(" ").toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }

  return true;
}

function serializeSpec(spec, projects = []) {
  const project = spec.projectId
    ? projects.find(
        (entry) =>
          entry.id === spec.projectId ||
          entry.directoryName === spec.projectId ||
          entry.name === spec.projectId ||
          slugify(entry.name) === spec.projectId,
      )
    : null;

  return {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    projectId: spec.projectId,
    projectName: project?.name || spec.projectId || "",
    tags: spec.tags,
    status: spec.status,
    statusHeading: spec.statusHeading,
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt,
    hostPath: spec.hostPath,
    content: spec.raw,
  };
}

async function serializeSpecs(specs) {
  const projects = await loadProjects().catch(() => []);
  return specs.map((spec) => serializeSpec(spec, projects));
}

async function listSpecs(filters = {}) {
  const specs = await readAllSpecs();
  return specs.filter((spec) => specMatchesFilters(spec, filters));
}

function isSafeSpecId(id) {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(String(id || "")) && !String(id).includes("..");
}

async function findSpecById(id) {
  if (!isSafeSpecId(id)) {
    throw validationError("Invalid spec id");
  }
  return (await readAllSpecs()).find((spec) => spec.id === id) || null;
}

async function validateSpecProject(projectId) {
  const cleanProjectId = String(projectId || "").trim();
  if (!cleanProjectId) {
    return "";
  }

  if (!isSafeProjectKey(cleanProjectId)) {
    throw validationError("Invalid project id");
  }

  const project = findProject(await loadProjects(), cleanProjectId);
  if (!project) {
    throw validationError("Project not found", 404);
  }

  return project.id;
}

async function createSpecId(title) {
  const specs = await readAllSpecs();
  const usedIds = new Set(specs.map((spec) => spec.id));
  const maxNumber = specs.reduce((max, spec) => {
    const match = spec.id.match(/^(\d{3})-/);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  const prefix = String(maxNumber + 1).padStart(3, "0");
  const slug = slugifySpec(title);
  let id = `${prefix}-${slug}`;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${prefix}-${slug}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function formatSpecDescription(description) {
  return cleanSpecDescription(description) || "No description yet.";
}

function buildNewSpecMarkdown({ title, description, projectId, tags, createdAt, updatedAt }) {
  const status = specStatusFromTags(tags) || "pending";
  const body = formatSpecDescription(description);

  return `# Specification: ${title}

<!-- PROJECT: ${cleanMetadataValue(projectId)} -->
<!-- TAGS: ${tags.join(", ")} -->
<!-- CREATED_AT: ${createdAt} -->
<!-- UPDATED_AT: ${updatedAt} -->

## Feature: ${title}

### Overview
${body}

### User Stories
- As a user, I want ${title} so that the project can move forward.

---

## Functional Requirements

### FR-1: ${title}
${body}

**Acceptance Criteria:**
- [ ] The requested behavior is implemented.
- [ ] The change is verified through the app UI or API.

---

## Success Criteria

- The spec can be completed by a Ralph loop.

---

## Dependencies
- None identified.

## Assumptions
- Details can be refined during implementation.

---

## Completion Signal

### Implementation Checklist
- [ ] Implementation complete
- [ ] Verification complete

### Testing Requirements
- [ ] Acceptance criteria verified

**Only when ALL checks pass, output:** \`<promise>DONE</promise>\`

---

## Status: ${specStatusHeading(status)}
<!-- NR_OF_TRIES: 0 -->
`;
}

function replaceSpecTitle(raw, title) {
  if (/^#\s+Specification:/m.test(raw)) {
    return raw.replace(/^#\s+Specification:.*$/m, () => `# Specification: ${title}`);
  }
  return `# Specification: ${title}\n\n${raw}`;
}

function replaceFeatureTitle(raw, title) {
  if (/^##\s+Feature:/m.test(raw)) {
    return raw.replace(/^##\s+Feature:.*$/m, () => `## Feature: ${title}`);
  }
  return raw.replace(/^#\s+Specification:.*$/m, (match) => `${match}\n\n## Feature: ${title}`);
}

function replaceOverview(raw, description) {
  const body = formatSpecDescription(description);
  const overviewPattern = /(###\s+Overview\s*\n)([\s\S]*?)(?=\n###\s+|\n---\s*\n|\n##\s+|\n#\s+|$)/i;
  if (overviewPattern.test(raw)) {
    return raw.replace(overviewPattern, () => `### Overview\n${body}\n`);
  }

  if (/^##\s+Feature:.*$/m.test(raw)) {
    return raw.replace(/^##\s+Feature:.*$/m, (match) => `${match}\n\n### Overview\n${body}`);
  }

  return `${raw.trimEnd()}\n\n### Overview\n${body}\n`;
}

function upsertSpecMetadata(raw, metadata) {
  let updated = raw;
  const missingLines = [];

  for (const [key, value] of Object.entries(metadata)) {
    const line = `<!-- ${key}: ${cleanMetadataValue(value)} -->`;
    const pattern = new RegExp(`^<!--\\s*${key}:\\s*[^\\n]*?\\s*-->\\s*$`, "m");
    if (pattern.test(updated)) {
      updated = updated.replace(pattern, line);
    } else {
      missingLines.push(line);
    }
  }

  if (!missingLines.length) {
    return updated;
  }

  const lines = updated.split(/\n/);
  let insertIndex = lines[0]?.startsWith("# ") ? 1 : 0;
  while (lines[insertIndex] && /^<!--\s*[A-Z_]+:/.test(lines[insertIndex])) {
    insertIndex += 1;
  }
  lines.splice(insertIndex, 0, ...missingLines);
  return lines.join("\n");
}

function upsertSpecStatus(raw, status) {
  const heading = specStatusHeading(status);
  if (/^##\s+Status:/m.test(raw)) {
    return raw.replace(/^##\s+Status:.*$/m, () => `## Status: ${heading}`);
  }

  if (/<!--\s*NR_OF_TRIES:/m.test(raw)) {
    return raw.replace(/<!--\s*NR_OF_TRIES:/m, () => `## Status: ${heading}\n<!-- NR_OF_TRIES:`);
  }

  return `${raw.trimEnd()}\n\n## Status: ${heading}\n<!-- NR_OF_TRIES: 0 -->\n`;
}

function updateSpecMarkdown(spec, fields) {
  const title = cleanSpecTitle(fields.title || spec.title);
  const description = cleanSpecDescription(fields.description ?? spec.description);
  const projectId = fields.projectId ?? spec.projectId;
  const tags = normalizeSpecTags(fields.tags ?? spec.tags, fields.status || spec.status);
  const createdAt = spec.createdAt || fields.createdAt;
  const updatedAt = fields.updatedAt;
  let raw = spec.raw.trimEnd();

  raw = replaceSpecTitle(raw, title);
  raw = replaceFeatureTitle(raw, title);
  raw = replaceOverview(raw, description);
  raw = upsertSpecMetadata(raw, {
    PROJECT: projectId || "",
    TAGS: tags.join(", "),
    CREATED_AT: createdAt,
    UPDATED_AT: updatedAt,
  });
  raw = upsertSpecStatus(raw, specStatusFromTags(tags) || "pending");
  return `${raw.trimEnd()}\n`;
}

async function writeSpecMarkdown(specFile, markdown) {
  const resolved = path.resolve(specFile);
  if (!isInsideDirectory(SPECS_ROOT, resolved)) {
    throw validationError("Invalid spec path");
  }

  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  const tmpFile = `${resolved}.${process.pid}.tmp`;
  await fsp.writeFile(tmpFile, markdown, "utf8");
  await fsp.rename(tmpFile, resolved);
}

async function createSpec(payload) {
  const title = cleanSpecTitle(payload.title);
  if (!title) {
    throw validationError("Title is required");
  }

  const projectId = await validateSpecProject(payload.projectId || "");
  const tags = normalizeSpecTags(payload.tags || [], payload.status || "pending");
  const id = await createSpecId(title);
  const specFile = path.resolve(SPECS_ROOT, id, "spec.md");
  const now = new Date().toISOString();
  const markdown = buildNewSpecMarkdown({
    title,
    description: payload.description || "",
    projectId,
    tags,
    createdAt: now,
    updatedAt: now,
  });

  await writeSpecMarkdown(specFile, markdown);
  return findSpecById(id);
}

async function updateSpec(spec, payload) {
  const title = cleanSpecTitle(payload.title ?? spec.title);
  if (!title) {
    throw validationError("Title is required");
  }

  const projectId = await validateSpecProject(payload.projectId ?? spec.projectId);
  const now = new Date().toISOString();
  const raw = updateSpecMarkdown(spec, {
    title,
    description: payload.description ?? spec.description,
    projectId,
    tags: payload.tags ?? spec.tags,
    status: payload.status || spec.status,
    updatedAt: now,
  });

  await writeSpecMarkdown(spec.path, raw);
  return findSpecById(spec.id);
}

async function updateSpecTags(spec, tags) {
  const now = new Date().toISOString();
  const raw = updateSpecMarkdown(spec, {
    title: spec.title,
    description: spec.description,
    projectId: spec.projectId,
    tags,
    status: specStatusFromTags(tags) || "pending",
    updatedAt: now,
  });
  await writeSpecMarkdown(spec.path, raw);
  return findSpecById(spec.id);
}

async function deleteSpec(spec) {
  if (spec.storageType === "directory" && spec.directoryPath && isInsideDirectory(SPECS_ROOT, spec.directoryPath)) {
    await fsp.rm(spec.directoryPath, { recursive: true, force: true });
    return;
  }

  if (isInsideDirectory(SPECS_ROOT, spec.path)) {
    await fsp.rm(spec.path, { force: true });
  }
}

async function scanSpecs(specsPath) {
  try {
    const entries = await fsp.readdir(specsPath, { withFileTypes: true });
    const specs = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const specFile = path.join(specsPath, entry.name, "spec.md");
        if (await pathExists(specFile)) {
          specs.push({
            name: entry.name,
            path: specFile,
            hostPath: toHostPath(specFile),
          });
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const specFile = path.join(specsPath, entry.name);
        specs.push({
          name: entry.name,
          path: specFile,
          hostPath: toHostPath(specFile),
        });
      }
    }

    return specs.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function scanProject(internalPath) {
  const empty = {
    hasAgents: false,
    hasClaude: false,
    hasSpecs: false,
    hasConstitution: false,
    specs: [],
    specsPath: path.join(internalPath, "specs"),
    dockerFiles: [],
    composeFiles: [],
    composeMentionsProxy: false,
  };

  try {
    const entries = await fsp.readdir(internalPath, { withFileTypes: true });
    const names = entries.map((entry) => entry.name);
    const specsPath = path.join(internalPath, "specs");
    const composeFiles = names.filter(isComposeFile);
    const dockerFiles = names.filter((name) => name === "Dockerfile" || isComposeFile(name));
    const composeContents = await Promise.all(
      composeFiles.map((fileName) => readTextIfExists(path.join(internalPath, fileName))),
    );

    return {
      hasAgents: names.includes("AGENTS.md"),
      hasClaude: names.includes("CLAUDE.md"),
      hasSpecs: await pathExists(specsPath),
      hasConstitution: await pathExists(path.join(internalPath, ".specify", "memory", "constitution.md")),
      specs: await scanSpecs(specsPath),
      specsPath,
      dockerFiles,
      composeFiles,
      composeMentionsProxy: composeContents.some((content) => /\bvibes-proxy\b/i.test(content)),
    };
  } catch {
    return empty;
  }
}

function detectProxy(project, scan, proxyText) {
  const candidates = [project.id, project.name, project.directoryName]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (project.name === "ralphi") {
    candidates.push("ralphi");
  }

  const lowerProxy = proxyText.toLowerCase();
  const routeLine = proxyText
    .split(/\r?\n/)
    .find((line) => candidates.some((candidate) => line.toLowerCase().includes(candidate)));
  const fromCaddy = candidates.some((candidate) =>
    lowerProxy.includes(`/${candidate}`) || lowerProxy.includes(`${candidate}:`),
  );
  const fromTable = /\bvibes-proxy\b/i.test(project.table.docker || "");
  const isProxyProject = project.id === "vibes-proxy" || project.directoryName === "vibes-proxy";

  return {
    enabled: isProxyProject || fromTable || scan.composeMentionsProxy || fromCaddy,
    source: isProxyProject
      ? "proxy-project"
      : fromCaddy
        ? "Caddyfile"
        : scan.composeMentionsProxy
          ? "docker-compose"
          : fromTable
            ? "PROJECTS.md"
            : "not-detected",
    route: routeLine ? routeLine.trim() : "",
  };
}

async function loadImportedIds() {
  try {
    const raw = await fsp.readFile(IMPORTED_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : parsed.projects;
    return new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Set();
    }
    throw error;
  }
}

async function saveImportedIds(ids) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
  const tmpFile = `${IMPORTED_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tmpFile, `${JSON.stringify(sortedIds, null, 2)}\n`, "utf8");
  await fsp.rename(tmpFile, IMPORTED_FILE);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProvider(provider = DEFAULT_PROVIDER) {
  return {
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    api: provider.api,
    model: provider.model,
  };
}

function defaultSettings() {
  return { provider: cloneProvider(DEFAULT_PROVIDER) };
}

function normalizeToken(value, label, pattern, maxLength = 100) {
  const token = String(value ?? "").trim();
  if (!token) {
    throw validationError(`${label} is required`);
  }
  if (token.length > maxLength || !pattern.test(token)) {
    throw validationError(`${label} contains unsupported characters`);
  }
  return token;
}

function normalizeModelName(value) {
  const model = String(value ?? "").trim();
  if (!model) {
    throw validationError("AI model is required");
  }
  if (model.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) {
    throw validationError("AI model may only contain letters, numbers, dots, dashes, underscores, slashes, and colons");
  }
  return model;
}

function normalizeBaseUrl(value) {
  const baseUrl = String(value ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw validationError("Provider base URL is required");
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw validationError("Provider base URL must be a valid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw validationError("Provider base URL must use http or https");
  }

  return baseUrl;
}

function normalizeProvider(payload = {}) {
  const source = isPlainObject(payload) ? payload : {};
  const merged = { ...DEFAULT_PROVIDER };
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }

  return {
    name: normalizeToken(merged.name, "Provider name", /^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    baseUrl: normalizeBaseUrl(merged.baseUrl),
    apiKey: String(merged.apiKey ?? "").trim(),
    api: normalizeToken(merged.api, "Provider API type", /^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    model: normalizeModelName(merged.model),
  };
}

function normalizeSettings(payload = {}) {
  if (!isPlainObject(payload)) {
    return defaultSettings();
  }

  if (isPlainObject(payload.provider)) {
    return {
      provider: normalizeProvider(payload.provider),
    };
  }

  return {
    provider: normalizeProvider({
      ...DEFAULT_PROVIDER,
      model: payload.model ?? DEFAULT_PROVIDER.model,
    }),
  };
}

function providerFromPiConfig(parsed) {
  if (!isPlainObject(parsed?.providers)) {
    return null;
  }

  const providerNames = Object.keys(parsed.providers).filter((name) => isPlainObject(parsed.providers[name]));
  if (!providerNames.length) {
    return null;
  }

  const name = providerNames.includes(DEFAULT_PROVIDER.name) ? DEFAULT_PROVIDER.name : providerNames.sort()[0];
  const provider = parsed.providers[name];
  const models = Array.isArray(provider.models) ? provider.models : [];
  const firstModel = models.find((model) => isPlainObject(model) && (model.id || model.model || model.name));

  return normalizeProvider({
    name,
    baseUrl: provider.baseUrl ?? provider.base_url ?? provider.url,
    apiKey: provider.apiKey ?? provider.api_key ?? DEFAULT_PROVIDER.apiKey,
    api: provider.api ?? provider.type ?? DEFAULT_PROVIDER.api,
    model: firstModel?.id ?? firstModel?.model ?? provider.model ?? DEFAULT_PROVIDER.model,
  });
}

async function loadInitialSettings() {
  try {
    const raw = await fsp.readFile(PI_MODELS_FILE, "utf8");
    const provider = providerFromPiConfig(JSON.parse(raw));
    if (provider) {
      return { provider };
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not read pi model config from ${PI_MODELS_FILE}: ${error.message}`);
    }
  }

  return defaultSettings();
}

async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${SETTINGS_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tmpFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await fsp.rename(tmpFile, SETTINGS_FILE);
  return normalized;
}

async function loadSettings() {
  try {
    const raw = await fsp.readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const normalized =
      isPlainObject(parsed) &&
      !isPlainObject(parsed.provider) &&
      Object.hasOwn(parsed, "model") &&
      parsed.model === LEGACY_DEFAULT_MODEL
        ? await loadInitialSettings()
        : normalizeSettings(parsed);

    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await saveSettings(normalized);
    }

    return normalized;
  } catch (error) {
    if (error.code === "ENOENT") {
      return saveSettings(await loadInitialSettings());
    }
    throw error;
  }
}

async function readLoopsFromDisk() {
  try {
    const raw = await fsp.readFile(LOOPS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const loops = Array.isArray(parsed) ? parsed : parsed.loops;
    return (Array.isArray(loops) ? loops : []).map((loop) => ({
      ...loop,
      logs: Array.isArray(loop.logs) ? loop.logs : [],
    }));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function loadLoops() {
  if (!loopsCachePromise) {
    loopsCachePromise = readLoopsFromDisk();
  }
  return loopsCachePromise;
}

async function saveLoopsNow(loops) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${LOOPS_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tmpFile, `${JSON.stringify(loops, null, 2)}\n`, "utf8");
  await fsp.rename(tmpFile, LOOPS_FILE);
}

function queueSaveLoops(loops) {
  loopsSaveQueue = loopsSaveQueue
    .catch((error) => {
      console.error("Previous loop save failed", error);
    })
    .then(() => saveLoopsNow(loops));
  return loopsSaveQueue;
}

function isSafeLoopId(id) {
  return /^[a-z0-9][a-z0-9-]*$/i.test(String(id || ""));
}

function createLoopId(projectId) {
  const random = Math.random().toString(36).slice(2, 8);
  return `loop-${slugify(projectId)}-${Date.now().toString(36)}-${random}`;
}

function durationMs(loop) {
  const start = Date.parse(loop.startedAt || "");
  if (!Number.isFinite(start)) {
    return null;
  }
  const end = loop.finishedAt ? Date.parse(loop.finishedAt) : Date.now();
  return Number.isFinite(end) ? Math.max(0, end - start) : null;
}

function serializeLoop(loop, options = {}) {
  const providerName = loop.providerName || loop.provider?.name || "";
  const providerBaseUrl = loop.providerBaseUrl || loop.provider?.baseUrl || "";
  const providerApi = loop.providerApi || loop.provider?.api || "";
  const serialized = {
    id: loop.id,
    projectId: loop.projectId,
    projectName: loop.projectName,
    projectDirectoryName: loop.projectDirectoryName,
    status: loop.status,
    startedAt: loop.startedAt,
    finishedAt: loop.finishedAt || null,
    exitCode: Number.isInteger(loop.exitCode) ? loop.exitCode : loop.exitCode ?? null,
    signal: loop.signal || null,
    command: loop.command,
    args: loop.args || [],
    providerName,
    providerBaseUrl,
    providerApi,
    provider: providerName
      ? {
          name: providerName,
          baseUrl: providerBaseUrl,
          api: providerApi,
        }
      : null,
    model: loop.model || loop.provider?.model || DEFAULT_PROVIDER.model,
    cwd: loop.cwd,
    hostPath: loop.hostPath || null,
    timeoutMs: loop.timeoutMs || LOOP_TIMEOUT_MS,
    durationMs: durationMs(loop),
    failureReason: loop.failureReason || "",
    logLineCount: Array.isArray(loop.logs) ? loop.logs.length : 0,
  };

  if (options.includeLogs) {
    serialized.logs = Array.isArray(loop.logs) ? loop.logs : [];
  }

  return serialized;
}

function findLoop(loops, loopId) {
  return loops.find((loop) => loop.id === loopId);
}

function activeLoopForProject(loops, projectId) {
  return loops.find((loop) => loop.projectId === projectId && loop.status === "running");
}

function writeSse(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastLoop(loop, eventName, payload) {
  const clients = streamClients.get(loop.id);
  if (!clients) {
    return;
  }

  for (const res of [...clients]) {
    try {
      writeSse(res, eventName, payload);
    } catch {
      clients.delete(res);
    }
  }

  if (clients.size === 0) {
    streamClients.delete(loop.id);
  }
}

function closeLoopStreams(loop) {
  const clients = streamClients.get(loop.id);
  if (!clients) {
    return;
  }

  for (const res of [...clients]) {
    try {
      res.end();
    } catch {
      // The client may already have gone away.
    }
  }
  streamClients.delete(loop.id);
}

function appendLoopLog(loop, stream, text) {
  if (!text) {
    return;
  }

  const entry = {
    at: new Date().toISOString(),
    stream,
    text,
  };
  loop.logs.push(entry);
  broadcastLoop(loop, "log", entry);
  loadLoops()
    .then((loops) => queueSaveLoops(loops))
    .catch((error) => console.error("Failed to persist loop log", error));
}

function finishLoop(loop, status, exitCode, signal, failureReason = "") {
  if (loop.status !== "running") {
    return;
  }

  const running = runningLoops.get(loop.id);
  if (running?.timeout) {
    clearTimeout(running.timeout);
  }

  loop.status = status;
  loop.finishedAt = new Date().toISOString();
  loop.exitCode = Number.isInteger(exitCode) ? exitCode : null;
  loop.signal = signal || null;
  loop.failureReason = failureReason;

  runningLoops.delete(loop.id);
  const serialized = serializeLoop(loop);
  broadcastLoop(loop, "status", serialized);
  broadcastLoop(loop, "end", serialized);
  closeLoopStreams(loop);

  loadLoops()
    .then((loops) => queueSaveLoops(loops))
    .catch((error) => console.error("Failed to persist loop finish", error));
}

function killLoopProcess(child, signal) {
  if (!child || child.killed) {
    return;
  }

  try {
    if (child.pid) {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // Fall back to killing the direct child if the process group is gone.
  }

  try {
    child.kill(signal);
  } catch {
    // The process may already have exited.
  }
}

async function findLoopScript(projectPath) {
  for (const candidate of LOOP_SCRIPT_CANDIDATES) {
    const scriptPath = path.join(projectPath, candidate);
    if (await pathExists(scriptPath)) {
      return {
        command: `./${candidate}`,
        scriptPath,
      };
    }
  }
  return null;
}

async function markInterruptedLoops() {
  const loops = await loadLoops();
  let changed = false;

  for (const loop of loops) {
    if (loop.status === "running") {
      loop.status = "failed";
      loop.finishedAt = new Date().toISOString();
      loop.exitCode = null;
      loop.signal = null;
      loop.failureReason = "Ralphi restarted while this loop was running";
      loop.logs = Array.isArray(loop.logs) ? loop.logs : [];
      loop.logs.push({
        at: loop.finishedAt,
        stream: "stderr",
        text: "Ralphi restarted while this loop was running.\n",
      });
      changed = true;
    }
  }

  if (changed) {
    await saveLoopsNow(loops);
  }
}

async function startLoop(project) {
  if (!project.exists || !project.path || !isInsideVibesRoot(project.path)) {
    const error = new Error("Project folder does not exist");
    error.status = 400;
    throw error;
  }

  if (!project.imported) {
    const error = new Error("Project is not observed");
    error.status = 409;
    throw error;
  }

  const loops = await loadLoops();
  const existing = activeLoopForProject(loops, project.id);
  if (existing) {
    const error = new Error("Loop läuft bereits");
    error.status = 409;
    error.loop = serializeLoop(existing);
    throw error;
  }

  const script = await findLoopScript(project.path);
  if (!script) {
    const error = new Error("No Ralph loop script found");
    error.status = 400;
    throw error;
  }

  const settings = await loadSettings();
  const provider = settings.provider;
  const loop = {
    id: createLoopId(project.id),
    projectId: project.id,
    projectName: project.name,
    projectDirectoryName: project.directoryName,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    signal: null,
    command: script.command,
    args: ["1"],
    providerName: provider.name,
    providerBaseUrl: provider.baseUrl,
    providerApi: provider.api,
    provider: {
      name: provider.name,
      baseUrl: provider.baseUrl,
      api: provider.api,
    },
    model: provider.model,
    cwd: project.path,
    hostPath: project.hostPath,
    timeoutMs: LOOP_TIMEOUT_MS,
    failureReason: "",
    logs: [],
  };

  loops.unshift(loop);
  await queueSaveLoops(loops);

  const child = spawn(loop.command, loop.args, {
    cwd: loop.cwd,
    env: {
      ...process.env,
      CODEX_MODEL: loop.model,
      OPENAI_BASE_URL: provider.baseUrl,
      OPENAI_API_KEY: provider.apiKey || process.env.OPENAI_API_KEY || "",
      RALPHI_PROVIDER_NAME: provider.name,
      RALPHI_PROVIDER_BASE_URL: provider.baseUrl,
      RALPHI_PROVIDER_API: provider.api,
      RALPHI_LOOP_ID: loop.id,
      RALPHI_PROJECT_ID: loop.projectId,
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const timeout = setTimeout(() => {
    loop.timedOutAt = new Date().toISOString();
    appendLoopLog(loop, "stderr", `Loop timed out after ${Math.round(loop.timeoutMs / 1000)} seconds.\n`);
    killLoopProcess(child, "SIGTERM");
    setTimeout(() => killLoopProcess(child, "SIGKILL"), 5000).unref();
  }, loop.timeoutMs);
  timeout.unref();

  runningLoops.set(loop.id, { child, timeout });
  appendLoopLog(loop, "stdout", `Provider: ${provider.name} | Model: ${loop.model}\n`);
  appendLoopLog(loop, "stdout", `$ ${loop.command} ${loop.args.join(" ")}\n`);

  child.stdout.on("data", (chunk) => appendLoopLog(loop, "stdout", chunk.toString()));
  child.stderr.on("data", (chunk) => appendLoopLog(loop, "stderr", chunk.toString()));
  child.on("error", (error) => {
    appendLoopLog(loop, "stderr", `${error.message}\n`);
    finishLoop(loop, "failed", null, null, error.message);
  });
  child.on("close", (exitCode, signal) => {
    const status = loop.stopRequestedAt
      ? "stopped"
      : loop.timedOutAt
        ? "failed"
        : exitCode === 0
          ? "done"
          : "failed";
    const reason = loop.timedOutAt ? "Loop timed out" : "";
    finishLoop(loop, status, exitCode, signal, reason);
  });

  return loop;
}

async function stopLoop(loop) {
  if (loop.status !== "running") {
    const error = new Error("Loop is not running");
    error.status = 409;
    throw error;
  }

  const running = runningLoops.get(loop.id);
  if (!running?.child) {
    finishLoop(loop, "failed", null, null, "Loop process is not attached");
    return loop;
  }

  loop.stopRequestedAt = new Date().toISOString();
  appendLoopLog(loop, "stderr", "Stop requested by user.\n");
  killLoopProcess(running.child, "SIGTERM");
  setTimeout(() => killLoopProcess(running.child, "SIGKILL"), 5000).unref();
  await queueSaveLoops(await loadLoops());
  return loop;
}

async function streamLoop(req, res, loop) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(": connected\n\n");

  for (const entry of loop.logs || []) {
    writeSse(res, "log", entry);
  }
  writeSse(res, "status", serializeLoop(loop));

  if (loop.status !== "running") {
    writeSse(res, "end", serializeLoop(loop));
    res.end();
    return;
  }

  if (!streamClients.has(loop.id)) {
    streamClients.set(loop.id, new Set());
  }
  const clients = streamClients.get(loop.id);
  clients.add(res);

  req.on("close", () => {
    clients.delete(res);
    if (clients.size === 0) {
      streamClients.delete(loop.id);
    }
  });
}

async function loadProjects() {
  const [markdown, proxyText, importedIds] = await Promise.all([
    fsp.readFile(PROJECTS_FILE, "utf8"),
    readTextIfExists(PROXY_CADDYFILE),
    loadImportedIds(),
  ]);

  const projects = await Promise.all(
    parseProjectsMarkdown(markdown).map(async (project) => {
      const exists = project.internalPath ? await pathExists(project.internalPath) : false;
      const scan = exists ? await scanProject(project.internalPath) : await scanProject(project.internalPath || VIBES_ROOT);
      const proxyInfo = detectProxy(project, scan, proxyText);
      const hasRalph = isYes(project.table.ralph) || scan.hasAgents || scan.hasSpecs || scan.hasConstitution;
      const hasDocker = isYes(project.table.docker) || scan.dockerFiles.length > 0;
      const hostPath = project.internalPath ? toHostPath(project.internalPath) : null;
      const hostSpecsPath = scan.specsPath ? toHostPath(scan.specsPath) : null;

      return {
        id: project.id,
        name: project.name,
        directoryName: project.directoryName,
        description: project.description,
        status: project.status,
        sourceStatus: project.sourceStatus,
        source: project.source,
        exists,
        path: project.internalPath,
        hostPath,
        imported: importedIds.has(project.id),
        ralph: hasRalph,
        docker: hasDocker,
        proxy: proxyInfo.enabled,
        table: project.table,
        setup: {
          ralph: {
            enabled: hasRalph,
            hasAgents: scan.hasAgents,
            hasClaude: scan.hasClaude,
            hasSpecs: scan.hasSpecs,
            hasConstitution: scan.hasConstitution,
            specs: scan.specs,
            specsPath: scan.specsPath,
            hostSpecsPath,
          },
          docker: {
            enabled: hasDocker,
            files: scan.dockerFiles,
            composeFiles: scan.composeFiles,
            composeStatus: scan.composeFiles.length > 0 ? "Compose file found" : "No compose file in project root",
          },
          proxy: proxyInfo,
        },
      };
    }),
  );

  return projects.sort((a, b) => {
    const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (statusDiff !== 0) return statusDiff;
    return a.name.localeCompare(b.name);
  });
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function isSafeProjectKey(key) {
  return Boolean(key) && !key.includes("/") && !key.includes("\\") && !key.includes("..");
}

function findProject(projects, key) {
  return projects.find(
    (project) =>
      project.id === key ||
      project.directoryName === key ||
      project.name === key ||
      slugify(project.name) === key ||
      slugify(project.directoryName) === key,
  );
}

async function handleSettingsApi(req, res, segments) {
  if (segments.length !== 2) {
    sendError(res, 404, "API endpoint not found");
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, await loadSettings());
    return;
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    if (!isPlainObject(body) || (!Object.hasOwn(body, "provider") && !Object.hasOwn(body, "model"))) {
      throw validationError("Provider settings are required");
    }
    sendJson(res, 200, await saveSettings(body));
    return;
  }

  sendError(res, 405, "Method not allowed");
}

async function handleProjectsApi(req, res, segments) {
  if (req.method === "GET" && segments.length === 2) {
    sendJson(res, 200, await loadProjects());
    return;
  }

  if (req.method === "GET" && segments.length === 3 && segments[2] === "imported") {
    const projects = await loadProjects();
    sendJson(res, 200, projects.filter((project) => project.imported));
    return;
  }

  const projectKey = decodeSegment(segments[2] || "");
  if (!isSafeProjectKey(projectKey)) {
    sendError(res, 400, "Invalid project name");
    return;
  }

  const projects = await loadProjects();
  const project = findProject(projects, projectKey);
  if (!project) {
    sendError(res, 404, "Project not found");
    return;
  }

  if (req.method === "GET" && segments.length === 3) {
    sendJson(res, 200, project);
    return;
  }

  if (req.method === "POST" && segments.length === 4 && segments[3] === "import") {
    const importedIds = await loadImportedIds();
    importedIds.add(project.id);
    await saveImportedIds(importedIds);
    const updatedProject = findProject(await loadProjects(), project.id);
    sendJson(res, 200, updatedProject);
    return;
  }

  if (req.method === "POST" && segments.length === 4 && segments[3] === "unwatch") {
    const importedIds = await loadImportedIds();
    importedIds.delete(project.id);
    await saveImportedIds(importedIds);
    const updatedProject = findProject(await loadProjects(), project.id);
    sendJson(res, 200, updatedProject);
    return;
  }

  if (req.method === "POST" && segments.length === 5 && segments[3] === "loop" && segments[4] === "start") {
    try {
      const loop = await startLoop(project);
      sendJson(res, 201, serializeLoop(loop));
    } catch (error) {
      sendJson(res, error.status || 500, {
        message: error.message || "Failed to start loop",
        loop: error.loop || null,
      });
    }
    return;
  }

  sendError(res, 404, "API endpoint not found");
}

async function handleLoopsApi(req, res, segments) {
  const loops = await loadLoops();

  if (req.method === "GET" && segments.length === 2) {
    const sorted = [...loops].sort((a, b) => Date.parse(b.startedAt || 0) - Date.parse(a.startedAt || 0));
    sendJson(res, 200, sorted.map((loop) => serializeLoop(loop)));
    return;
  }

  const loopId = decodeSegment(segments[2] || "");
  if (!isSafeLoopId(loopId)) {
    sendError(res, 400, "Invalid loop id");
    return;
  }

  const loop = findLoop(loops, loopId);
  if (!loop) {
    sendError(res, 404, "Loop not found");
    return;
  }

  if (req.method === "GET" && segments.length === 3) {
    sendJson(res, 200, serializeLoop(loop));
    return;
  }

  if (req.method === "GET" && segments.length === 4 && segments[3] === "logs") {
    const logs = Array.isArray(loop.logs) ? loop.logs : [];
    sendJson(res, 200, {
      id: loop.id,
      logs,
      text: logs.map((entry) => entry.text).join(""),
    });
    return;
  }

  if (req.method === "GET" && segments.length === 4 && segments[3] === "stream") {
    await streamLoop(req, res, loop);
    return;
  }

  if (req.method === "POST" && segments.length === 4 && segments[3] === "stop") {
    try {
      const stopped = await stopLoop(loop);
      sendJson(res, 202, serializeLoop(stopped));
    } catch (error) {
      sendError(res, error.status || 500, error.message || "Failed to stop loop");
    }
    return;
  }

  sendError(res, 404, "API endpoint not found");
}

async function handleSpecsApi(req, res, segments) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && segments.length === 2) {
    const specs = await listSpecs({
      tag: requestUrl.searchParams.get("tag") || "",
      project: requestUrl.searchParams.get("project") || "",
      q: requestUrl.searchParams.get("q") || "",
    });
    sendJson(res, 200, await serializeSpecs(specs));
    return;
  }

  if (req.method === "POST" && segments.length === 2) {
    const spec = await createSpec(await readJsonBody(req));
    sendJson(res, 201, serializeSpec(spec, await loadProjects().catch(() => [])));
    return;
  }

  const specId = decodeSegment(segments[2] || "");
  if (!isSafeSpecId(specId)) {
    sendError(res, 400, "Invalid spec id");
    return;
  }

  const spec = await findSpecById(specId);
  if (!spec) {
    sendError(res, 404, "Spec not found");
    return;
  }

  if (req.method === "GET" && segments.length === 3) {
    sendJson(res, 200, serializeSpec(spec, await loadProjects().catch(() => [])));
    return;
  }

  if (req.method === "PUT" && segments.length === 3) {
    const updated = await updateSpec(spec, await readJsonBody(req));
    sendJson(res, 200, serializeSpec(updated, await loadProjects().catch(() => [])));
    return;
  }

  if (req.method === "DELETE" && segments.length === 3) {
    await deleteSpec(spec);
    sendJson(res, 200, { id: spec.id, deleted: true });
    return;
  }

  if (req.method === "POST" && segments.length === 4 && segments[3] === "tags") {
    const body = await readJsonBody(req);
    const tag = normalizeTag(body.tag);
    if (!tag) {
      throw validationError("Tag is required");
    }

    let tags = spec.tags.filter((entry) => entry !== tag);
    if (STATUS_TAGS.has(tag)) {
      tags = tags.filter((entry) => !STATUS_TAGS.has(entry));
    }
    tags = normalizeSpecTags([...tags, tag], STATUS_TAGS.has(tag) ? tag : spec.status);
    const updated = await updateSpecTags(spec, tags);
    sendJson(res, 200, serializeSpec(updated, await loadProjects().catch(() => [])));
    return;
  }

  if (req.method === "DELETE" && segments.length === 5 && segments[3] === "tags") {
    const tag = normalizeTag(decodeSegment(segments[4] || ""));
    if (!tag) {
      sendError(res, 400, "Invalid tag");
      return;
    }

    let tags = spec.tags.filter((entry) => entry !== tag);
    if (!tags.some((entry) => STATUS_TAGS.has(entry))) {
      tags = ["pending", ...tags];
    }
    tags = normalizeSpecTags(tags, specStatusFromTags(tags) || "pending");
    const updated = await updateSpecTags(spec, tags);
    sendJson(res, 200, serializeSpec(updated, await loadProjects().catch(() => [])));
    return;
  }

  sendError(res, 404, "API endpoint not found");
}

async function handleTagsApi(req, res, segments) {
  if (req.method !== "GET" || segments.length !== 2) {
    sendError(res, 404, "API endpoint not found");
    return;
  }

  const tags = new Set(["pending", "running", "done"]);
  for (const spec of await readAllSpecs()) {
    for (const tag of spec.tags) {
      tags.add(tag);
    }
  }

  const statusOrder = ["pending", "running", "done"];
  const sorted = [...tags].sort((a, b) => {
    const aIndex = statusOrder.indexOf(a);
    const bIndex = statusOrder.indexOf(b);
    if (aIndex >= 0 || bIndex >= 0) {
      return (aIndex >= 0 ? aIndex : 99) - (bIndex >= 0 ? bIndex : 99);
    }
    return a.localeCompare(b);
  });
  sendJson(res, 200, sorted);
}

async function handleApi(req, res, apiPath) {
  const segments = apiPath.split("/").filter(Boolean);

  if (segments[0] !== "api") {
    sendError(res, 404, "API endpoint not found");
    return;
  }

  if (segments[1] === "projects") {
    await handleProjectsApi(req, res, segments);
    return;
  }

  if (segments[1] === "settings") {
    await handleSettingsApi(req, res, segments);
    return;
  }

  if (segments[1] === "loops") {
    await handleLoopsApi(req, res, segments);
    return;
  }

  if (segments[1] === "specs") {
    await handleSpecsApi(req, res, segments);
    return;
  }

  if (segments[1] === "tags") {
    await handleTagsApi(req, res, segments);
    return;
  }

  sendError(res, 404, "API endpoint not found");
}

function normalizePathname(pathname) {
  if (pathname === "/ralphi") {
    return "/";
  }
  if (pathname.startsWith("/ralphi/")) {
    return pathname.slice("/ralphi".length) || "/";
  }
  return pathname;
}

function serveFile(res, localFileName) {
  const filePath = path.join(APP_ROOT, localFileName);
  const extension = path.extname(filePath);
  res.writeHead(200, {
    "content-type": CONTENT_TYPES[extension] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendError(res, 405, "Method not allowed");
    return;
  }

  const normalized = normalizePathname(pathname);

  if (normalized === "/healthz") {
    sendText(res, 200, "ok\n");
    return;
  }

  if (STATIC_FILES.has(normalized)) {
    serveFile(res, STATIC_FILES.get(normalized));
    return;
  }

  if (
    normalized === "/" ||
    normalized === "/projects" ||
    normalized.startsWith("/projects/") ||
    normalized === "/settings" ||
    normalized === "/loops" ||
    normalized.startsWith("/loops/") ||
    normalized === "/specs" ||
    normalized.startsWith("/specs/")
  ) {
    serveFile(res, "index.html");
    return;
  }

  sendError(res, 404, "Not found");
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let apiPath = url.pathname;
    if (apiPath === "/ralphi/api") {
      apiPath = "/api";
    } else if (apiPath.startsWith("/ralphi/api/")) {
      apiPath = apiPath.slice("/ralphi".length);
    }

    if (apiPath === "/api" || apiPath.startsWith("/api/")) {
      await handleApi(req, res, apiPath);
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendError(res, error.status || 500, error.status ? error.message : "Internal server error");
    } else {
      res.end();
    }
  }
});

markInterruptedLoops()
  .catch((error) => {
    console.error("Failed to recover loop state", error);
  })
  .finally(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Ralphi listening on http://${HOST}:${PORT}`);
      console.log(`Reading projects from ${PROJECTS_FILE}`);
      console.log(`Persisting watched projects in ${IMPORTED_FILE}`);
      console.log(`Persisting loop history in ${LOOPS_FILE}`);
      console.log(`Persisting settings in ${SETTINGS_FILE}`);
      console.log(`Reading specs from ${SPECS_ROOT}`);
    });
  });
