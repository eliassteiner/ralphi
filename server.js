const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
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

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isInsideVibesRoot(targetPath) {
  const relative = path.relative(VIBES_ROOT, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

async function handleApi(req, res, apiPath) {
  const segments = apiPath.split("/").filter(Boolean);

  if (segments[0] !== "api" || segments[1] !== "projects") {
    sendError(res, 404, "API endpoint not found");
    return;
  }

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

  if (normalized === "/" || normalized === "/projects" || normalized.startsWith("/projects/")) {
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
    sendError(res, 500, "Internal server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Ralphi listening on http://${HOST}:${PORT}`);
  console.log(`Reading projects from ${PROJECTS_FILE}`);
  console.log(`Persisting watched projects in ${IMPORTED_FILE}`);
});
