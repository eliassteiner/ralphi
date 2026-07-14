const ROUTE_BASE = "/ralphi";
const API_BASE = window.location.pathname.startsWith(ROUTE_BASE) ? `${ROUTE_BASE}/api` : "/api";
const STATUS_ORDER = ["Aktiv", "Archiv", "Referenz"];
const DEFAULT_PROVIDER = {
  name: "wyna",
  baseUrl: "http://100.85.99.127:9002/v1",
  apiKey: "not-needed",
  api: "openai-completions",
  model: "deepseek-v4-flash",
};

const app = document.querySelector("#app");
const state = {
  settings: { provider: { ...DEFAULT_PROVIDER } },
  projects: [],
  loops: [],
  specs: [],
  loopLogs: {},
  query: "",
  specQuery: "",
  specTagFilter: "",
  specProjectFilter: "",
  specForm: null,
  storyFormOpen: false,
  dashboardProjectId: "",
  projectFiles: [],
  projectFilesLoading: false,
  selectedFilePath: "",
  selectedFileContent: "",
  selectedFileOriginal: "",
  selectedFileMeta: null,
  fileNotice: "",
  fileError: "",
  newFileOpen: false,
  terminalCollapsed: false,
  chatMessages: [],
  chatSystemPrompt: "Du hilfst mir Specs zu schreiben.",
  chatStreaming: false,
  chatError: "",
  settingsNotice: "",
  settingsError: "",
  loading: true,
  error: "",
};

let loopStream = {
  loopId: "",
  source: null,
};

function routePath() {
  let pathname = window.location.pathname;
  if (pathname === ROUTE_BASE) return "/";
  if (pathname.startsWith(`${ROUTE_BASE}/`)) {
    pathname = pathname.slice(ROUTE_BASE.length) || "/";
  }
  return pathname || "/";
}

function href(path) {
  return `${ROUTE_BASE}${path === "/" ? "/" : path}`;
}

function projectHref(project) {
  return href(`/projects/${encodeURIComponent(project.id)}`);
}

function loopHref(loop) {
  return href(`/loops/${encodeURIComponent(loop.id)}`);
}

function specHref(spec) {
  return href(`/specs/${encodeURIComponent(spec.id)}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fileHref(hostPath) {
  if (!hostPath) return "#";
  return `file://${hostPath.split("/").map(encodeURIComponent).join("/")}`;
}

function formatDate() {
  const now = new Date();
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
}

function formatTimestamp(value) {
  if (!value) return "Offen";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unbekannt";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "Offen";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function providerSettings(settings = state.settings) {
  const provider = settings?.provider || {};
  return {
    ...DEFAULT_PROVIDER,
    ...provider,
    model: provider.model || settings?.model || DEFAULT_PROVIDER.model,
  };
}

function providerSummary(settings = state.settings) {
  const provider = providerSettings(settings);
  return `${provider.name} / ${provider.model}`;
}

async function fetchJson(url, options = {}) {
  const { headers = {}, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: { accept: "application/json", ...headers },
  });
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    let payload = null;
    try {
      payload = await response.json();
      message = payload.message || message;
    } catch {
      message = await response.text();
    }
    const error = new Error(message);
    error.payload = payload;
    throw error;
  }
  return response.json();
}

async function loadData(options = {}) {
  if (!options.silent) {
    state.loading = true;
    state.error = "";
    render();
  }

  try {
    const [settings, projects, loops, specs] = await Promise.all([
      fetchJson(`${API_BASE}/settings`),
      fetchJson(`${API_BASE}/projects`),
      fetchJson(`${API_BASE}/loops`),
      fetchJson(`${API_BASE}/specs`),
    ]);
    state.settings = settings;
    state.projects = projects;
    state.loops = loops;
    state.specs = specs;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

function updateChrome() {
  const provider = providerSettings();
  const modelElement = document.querySelector("#active-model");
  if (modelElement) {
    modelElement.textContent = `Provider: ${provider.name} / ${provider.model}`;
    modelElement.title = `Active AI provider: ${provider.name} | ${provider.baseUrl}`;
  }
}

async function loadLoopLogs(loopId) {
  try {
    const data = await fetchJson(`${API_BASE}/loops/${encodeURIComponent(loopId)}/logs`);
    state.loopLogs[loopId] = data.logs || [];
    render();
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function updateLoop(loop) {
  const index = state.loops.findIndex((entry) => entry.id === loop.id);
  if (index >= 0) {
    state.loops[index] = loop;
  } else {
    state.loops.unshift(loop);
  }
}

function closeLoopStream() {
  if (loopStream.source) {
    loopStream.source.close();
  }
  loopStream = { loopId: "", source: null };
}

function scrollTerminal() {
  requestAnimationFrame(() => {
    const terminal = document.querySelector(".terminal-log");
    if (terminal) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  });
}

function openLoopStream(loopId) {
  if (loopStream.loopId === loopId && loopStream.source) {
    return;
  }

  closeLoopStream();
  state.loopLogs[loopId] = [];
  const source = new EventSource(`${API_BASE}/loops/${encodeURIComponent(loopId)}/stream`);
  loopStream = { loopId, source };

  source.addEventListener("log", (event) => {
    const entry = JSON.parse(event.data);
    state.loopLogs[loopId] = [...(state.loopLogs[loopId] || []), entry];
    if (routePath() === `/loops/${loopId}`) {
      render();
      scrollTerminal();
    }
  });

  source.addEventListener("status", (event) => {
    updateLoop(JSON.parse(event.data));
    if (routePath() === `/loops/${loopId}` || routePath() === "/loops") {
      render();
    }
  });

  source.addEventListener("end", (event) => {
    updateLoop(JSON.parse(event.data));
    closeLoopStream();
    render();
  });

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      closeLoopStream();
    }
  };
}

function badge(label, value, type = "neutral") {
  return `<span class="badge badge-${type}" title="${escapeHtml(label)}">${escapeHtml(value)}</span>`;
}

function capabilityBadges(project) {
  return [
    badge("Ralph setup", project.ralph ? "Ralph: Ja" : "Ralph: Nei", project.ralph ? "good" : "muted"),
    badge("Docker setup", project.docker ? "Docker: Ja" : "Docker: Nei", project.docker ? "info" : "muted"),
    badge("Proxy setup", project.proxy ? "Proxy: Ja" : "Proxy: Nei", project.proxy ? "warn" : "muted"),
    project.imported ? badge("Observed", "Beobachtet", "imported") : "",
  ].join("");
}

function loopStatusType(status) {
  if (status === "running") return "info";
  if (status === "done") return "good";
  if (status === "stopped") return "warn";
  if (status === "failed") return "danger";
  return "muted";
}

function loopStatusBadge(loop) {
  return badge("Loop status", loop.status || "unknown", loopStatusType(loop.status));
}

function providerForLoop(loop) {
  return loop.providerName || loop.provider?.name || "unknown";
}

function modelForLoop(loop) {
  return loop.model || loop.provider?.model || DEFAULT_PROVIDER.model;
}

function specStatusType(status) {
  if (status === "done") return "good";
  if (status === "running") return "info";
  if (status === "pending") return "warn";
  return "muted";
}

function tagType(tag) {
  if (tag === "done") return "good";
  if (tag === "running") return "info";
  if (tag === "pending") return "warn";
  return "imported";
}

function tagBadges(tags) {
  return (tags || []).map((tag) => badge("Tag", tag, tagType(tag))).join("");
}

function projectNameForId(projectId) {
  if (!projectId) return "Kein Projekt";
  const project = state.projects.find(
    (entry) =>
      entry.id === projectId ||
      entry.directoryName === projectId ||
      entry.name === projectId,
  );
  return project?.name || projectId;
}

function availableSpecProjects(selectedProjectId = "") {
  const imported = state.projects.filter((project) => project.imported);
  const selected = selectedProjectId
    ? state.projects.find((project) => project.id === selectedProjectId)
    : null;
  if (selected && !imported.some((project) => project.id === selected.id)) {
    return [...imported, selected];
  }
  return imported;
}

function projectMatches(project, query) {
  if (!query) return true;
  const haystack = [
    project.name,
    project.directoryName,
    project.description,
    project.status,
    project.sourceStatus,
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function groupedProjects() {
  const visible = state.projects.filter((project) => projectMatches(project, state.query));
  return STATUS_ORDER.map((status) => ({
    status,
    projects: visible.filter((project) => project.status === status),
  })).filter((group) => group.projects.length > 0);
}

function specMatches(spec) {
  if (state.specTagFilter && !(spec.tags || []).includes(state.specTagFilter)) {
    return false;
  }

  if (state.specProjectFilter && spec.projectId !== state.specProjectFilter) {
    return false;
  }

  if (!state.specQuery) {
    return true;
  }

  const query = state.specQuery.toLowerCase();
  const haystack = [
    spec.title,
    spec.description,
    spec.projectId,
    spec.projectName,
    (spec.tags || []).join(" "),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function filteredSpecs() {
  return state.specs.filter(specMatches);
}

function specProjectOptions(selectedProjectId = "") {
  const projects = availableSpecProjects(selectedProjectId);
  return [
    `<option value="">Kein Projekt</option>`,
    ...projects.map((project) => `
      <option value="${escapeHtml(project.id)}" ${project.id === selectedProjectId ? "selected" : ""}>
        ${escapeHtml(project.name)}
      </option>
    `),
  ].join("");
}

function renderSpecForm(spec = null) {
  const isEdit = Boolean(spec);
  const title = spec?.title || "";
  const description = spec?.description || "";
  const projectId = spec?.projectId || "";
  const tags = (spec?.tags || ["pending"]).join(", ");

  return `
    <form class="spec-form" data-spec-form data-mode="${isEdit ? "edit" : "create"}" data-spec-id="${escapeHtml(spec?.id || "")}">
      <div class="form-heading">
        <div>
          <p class="eyebrow">${isEdit ? "Spec bearbeiten" : "Neue Spec"}</p>
          <h2>${isEdit ? escapeHtml(spec.title) : "Spec erstellen"}</h2>
        </div>
        <button type="button" class="button button-secondary" data-action="cancel-spec-form">Abbrechen</button>
      </div>
      <div class="form-grid">
        <label class="form-field">
          <span>Titel</span>
          <input name="title" required maxlength="140" value="${escapeHtml(title)}">
        </label>
        <label class="form-field">
          <span>Projekt</span>
          <select name="projectId">
            ${specProjectOptions(projectId)}
          </select>
        </label>
        <label class="form-field form-field-wide">
          <span>Beschreibung</span>
          <textarea name="description" rows="7">${escapeHtml(description)}</textarea>
        </label>
        <label class="form-field form-field-wide">
          <span>Tags</span>
          <input name="tags" value="${escapeHtml(tags)}" placeholder="pending, ui, backend">
        </label>
      </div>
      <div class="form-actions">
        <button type="submit" class="button">${isEdit ? "Speichern" : "Spec speichern"}</button>
      </div>
      <p class="form-error" aria-live="polite"></p>
    </form>
  `;
}

function renderSpecCard(spec) {
  return `
    <article class="spec-card" data-spec-card-id="${escapeHtml(spec.id)}">
      <div class="spec-card-main">
        <div>
          <a class="project-name" href="${specHref(spec)}" data-route>${escapeHtml(spec.title)}</a>
          <p class="project-description">${escapeHtml(spec.description || "Keine Beschreibung")}</p>
        </div>
        ${badge("Status", spec.status, specStatusType(spec.status))}
      </div>
      <div class="badge-row">${tagBadges(spec.tags)}</div>
      <div class="spec-card-meta">
        <span>${escapeHtml(projectNameForId(spec.projectId))}</span>
        <span>Erstellt: ${escapeHtml(formatTimestamp(spec.createdAt))}</span>
      </div>
      <div class="project-card-actions">
        <a class="text-link" href="${specHref(spec)}" data-route>Details</a>
        <a class="text-link" href="${fileHref(spec.hostPath)}">Datei</a>
      </div>
    </article>
  `;
}

function renderSpecsPage() {
  if (state.loading) {
    app.innerHTML = `<section class="loading-panel" aria-live="polite">Loading specs...</section>`;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      <section class="error-panel" role="alert">
        <h1>Specs could not be loaded</h1>
        <p>${escapeHtml(state.error)}</p>
        <button type="button" class="button" data-action="refresh">Refresh</button>
      </section>
    `;
    return;
  }

  const specs = filteredSpecs();
  const importedProjects = availableSpecProjects();
  app.innerHTML = `
    <section class="detail-header">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Spec-Editor</p>
          <h1>Specs</h1>
          <p class="summary">${state.specs.length} Specs erkannt, ${state.specs.filter((spec) => spec.status !== "done").length} offen.</p>
        </div>
        <button type="button" class="button" data-action="open-spec-form">Neue Spec</button>
      </div>
    </section>

    ${state.specForm?.mode === "create" ? renderSpecForm() : ""}

    <section class="projects-section" aria-labelledby="specs-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Filter</p>
          <h2 id="specs-title">Spec-Liste</h2>
        </div>
        <div class="toolbar">
          <label class="search-field">
            <span>Search</span>
            <input id="spec-search" type="search" value="${escapeHtml(state.specQuery)}" placeholder="Spec suchen">
          </label>
          <label class="search-field">
            <span>Status</span>
            <select id="spec-status-filter">
              <option value="">Alle</option>
              <option value="pending" ${state.specTagFilter === "pending" ? "selected" : ""}>pending</option>
              <option value="running" ${state.specTagFilter === "running" ? "selected" : ""}>running</option>
              <option value="done" ${state.specTagFilter === "done" ? "selected" : ""}>done</option>
            </select>
          </label>
          <label class="search-field">
            <span>Projekt</span>
            <select id="spec-project-filter">
              <option value="">Alle</option>
              ${importedProjects.map((project) => `
                <option value="${escapeHtml(project.id)}" ${state.specProjectFilter === project.id ? "selected" : ""}>
                  ${escapeHtml(project.name)}
                </option>
              `).join("")}
            </select>
          </label>
          <button type="button" class="button button-secondary" data-action="refresh">Refresh</button>
        </div>
      </div>
      <div class="projects-meta">
        <span>${specs.length} sichtbar</span>
        <span>${state.specs.filter((spec) => spec.status === "pending").length} pending</span>
        <span>${state.specs.filter((spec) => spec.status === "running").length} running</span>
        <span>${state.specs.filter((spec) => spec.status === "done").length} done</span>
      </div>
      ${
        specs.length
          ? `<div class="spec-grid">${specs.map(renderSpecCard).join("")}</div>`
          : `<p class="empty-state">Keine Specs gefunden.</p>`
      }
    </section>
  `;

  if (!state.specForm) {
    const search = document.querySelector("#spec-search");
    search?.focus({ preventScroll: true });
    search?.setSelectionRange(search.value.length, search.value.length);
  }
}

function loopsForProject(projectId) {
  return state.loops
    .filter((loop) => loop.projectId === projectId)
    .sort((a, b) => Date.parse(b.startedAt || 0) - Date.parse(a.startedAt || 0));
}

function activeLoopForProject(projectId) {
  return state.loops.find((loop) => loop.projectId === projectId && loop.status === "running");
}

function specBelongsToProject(spec, project) {
  const candidates = [project.id, project.directoryName, project.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return candidates.includes(String(spec.projectId || "").toLowerCase());
}

function specsForProject(project) {
  return state.specs.filter((spec) => specBelongsToProject(spec, project));
}

function storyStatusLabel(status) {
  if (status === "running") return "In Arbeit";
  if (status === "done") return "Fertig";
  return "Offen";
}

function storyPriority(spec) {
  const explicit = (spec.tags || []).find((tag) => /^(p[0-3]|prio-[a-z]+|priority-[a-z]+)$/i.test(tag));
  if (explicit) return explicit;
  const number = String(spec.id || "").match(/^(\d{3})/);
  return number ? `#${number[1]}` : "normal";
}

function dashboardReset(projectId) {
  state.dashboardProjectId = projectId;
  state.projectFiles = [];
  state.projectFilesLoading = false;
  state.selectedFilePath = "";
  state.selectedFileContent = "";
  state.selectedFileOriginal = "";
  state.selectedFileMeta = null;
  state.fileNotice = "";
  state.fileError = "";
  state.newFileOpen = false;
  state.storyFormOpen = false;
}

function ensureDashboardProject(project) {
  if (state.dashboardProjectId !== project.id) {
    dashboardReset(project.id);
    state.projectFilesLoading = true;
    queueMicrotask(() => loadProjectFiles(project.id, { silent: true }));
  }
}

async function loadProjectFiles(projectId, options = {}) {
  if (!options.silent) {
    state.projectFilesLoading = true;
    state.fileError = "";
    render();
  }

  try {
    const payload = await fetchJson(`${API_BASE}/projects/${encodeURIComponent(projectId)}/files`);
    state.projectFiles = payload.files || [];
    state.projectFilesLoading = false;

    const stillSelected = state.projectFiles.some((file) => file.path === state.selectedFilePath);
    if (!state.selectedFilePath || !stillSelected) {
      const firstSpec = state.projectFiles.find((file) => /^specs\/.+\/spec\.md$/i.test(file.path));
      const firstFile = firstSpec || state.projectFiles[0];
      if (firstFile) {
        await openProjectFile(projectId, firstFile.path, { silent: true });
      }
    } else if (!options.silent) {
      render();
    }
    if (options.silent) {
      render();
    }
  } catch (error) {
    state.projectFilesLoading = false;
    state.fileError = error.message;
    render();
  }
}

async function openProjectFile(projectId, filePath, options = {}) {
  state.fileError = "";
  state.fileNotice = "";
  if (!options.silent) {
    state.selectedFilePath = filePath;
    render();
  }

  try {
    const file = await fetchJson(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(filePath)}`,
    );
    state.selectedFilePath = file.path;
    state.selectedFileContent = file.content;
    state.selectedFileOriginal = file.content;
    state.selectedFileMeta = file;
    if (!options.silent) {
      render();
    }
  } catch (error) {
    state.fileError = error.message;
    render();
  }
}

function selectedFileIsDirty() {
  return state.selectedFileContent !== state.selectedFileOriginal;
}

function selectedSpecForProject(project) {
  if (!state.selectedFilePath) return null;
  return specsForProject(project).find((spec) => spec.filePath === state.selectedFilePath) || null;
}

function upsertDoneMarkers(content) {
  let next = String(content || "");
  if (/^<!--\s*TAGS:/m.test(next)) {
    next = next.replace(/^<!--\s*TAGS:\s*([^\n]*?)\s*-->\s*$/m, (_match, tags) => {
      const cleanTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter((tag) => !["pending", "running", "done"].includes(tag));
      return `<!-- TAGS: done${cleanTags.length ? `, ${cleanTags.join(", ")}` : ""} -->`;
    });
  } else {
    const lines = next.split(/\n/);
    const insertIndex = lines[0]?.startsWith("# ") ? 1 : 0;
    lines.splice(insertIndex, 0, "<!-- TAGS: done -->");
    next = lines.join("\n");
  }

  if (/^##\s+Status:/m.test(next)) {
    next = next.replace(/^##\s+Status:.*$/m, "## Status: COMPLETE");
  } else if (/<!--\s*NR_OF_TRIES:/m.test(next)) {
    next = next.replace(/<!--\s*NR_OF_TRIES:/m, "## Status: COMPLETE\n<!-- NR_OF_TRIES:");
  } else {
    next = `${next.trimEnd()}\n\n## Status: COMPLETE\n<!-- NR_OF_TRIES: 0 -->\n`;
  }

  return next;
}

function parseSseEvents(buffer) {
  const events = [];
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() || "";
  let eventName = "message";

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.replace(/^event:\s*/, "").trim() || "message";
      continue;
    }
    if (line.startsWith("data:")) {
      const data = line.replace(/^data:\s*/, "");
      events.push({ eventName, data });
      eventName = "message";
    }
  }

  return { events, rest };
}

function projectCard(project) {
  const action = project.imported ? "unwatch" : "import";
  const actionLabel = project.imported ? "Nicht mehr beobachten" : "Importieren";
  const folder = project.hostPath
    ? `<a class="folder-link" href="${fileHref(project.hostPath)}" title="${escapeHtml(project.hostPath)}">Ordner</a>`
    : `<span class="folder-link disabled">Ordner fehlt</span>`;

  return `
    <article class="project-card" data-card-id="${escapeHtml(project.id)}">
      <div class="project-card-main">
        <div>
          <a class="project-name" href="${fileHref(project.hostPath)}" title="${escapeHtml(project.hostPath || "")}">
            ${escapeHtml(project.name)}
          </a>
          <p class="project-description">${escapeHtml(project.description || "Keine Beschreibung in PROJECTS.md")}</p>
        </div>
        <span class="status-pill status-${escapeHtml(project.status.toLowerCase())}">${escapeHtml(project.status)}</span>
      </div>
      <div class="badge-row">${capabilityBadges(project)}</div>
      <div class="project-card-actions">
        ${folder}
        <a class="text-link" href="${projectHref(project)}" data-route>Details</a>
        <button type="button" class="button ${project.imported ? "button-secondary" : ""}" data-action="${action}" data-project-id="${escapeHtml(project.id)}">
          ${actionLabel}
        </button>
      </div>
    </article>
  `;
}

function renderStatusPanel() {
  const provider = providerSettings();
  return `
    <section class="status-panel" aria-labelledby="app-title">
      <div>
        <p class="eyebrow">Ralph Loop Control</p>
        <h1 id="app-title">Ralphi – Ralph Wiggum Loop Manager</h1>
        <p class="summary">Ralph loops will be created, planned, monitored, and continued from here.</p>
      </div>
      <div class="status-stack" aria-live="polite">
        <div class="status-row">
          <span class="status-dot" aria-hidden="true"></span>
          <span>Status: Alive</span>
        </div>
        <div class="status-row status-row-secondary">
          <span>Provider: ${escapeHtml(provider.name)}</span>
        </div>
        <div class="status-row status-row-secondary">
          <span>Model: ${escapeHtml(provider.model)}</span>
        </div>
        <p class="date-line">Date: <time>${escapeHtml(formatDate())}</time></p>
      </div>
    </section>
  `;
}

function renderSettingsPage() {
  if (state.loading) {
    app.innerHTML = `<section class="loading-panel" aria-live="polite">Loading settings...</section>`;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      <section class="error-panel" role="alert">
        <h1>Settings could not be loaded</h1>
        <p>${escapeHtml(state.error)}</p>
        <button type="button" class="button" data-action="refresh">Refresh</button>
      </section>
    `;
    return;
  }

  const provider = providerSettings();

  app.innerHTML = `
    <section class="detail-header">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Einstellungen</p>
          <h1>Settings</h1>
          <p class="summary">Aktiver Provider: ${escapeHtml(providerSummary())}</p>
        </div>
      </div>
    </section>

    <form class="spec-form settings-form" data-settings-form>
      <div class="form-heading">
        <div>
          <p class="eyebrow">AI Provider</p>
          <h2>Loop-Konfiguration</h2>
        </div>
      </div>
      <p class="settings-hint muted-text">Pi-Config: ~/.pi/agent/models.json</p>
      <div class="form-grid">
        <label class="form-field">
          <span>Provider Name</span>
          <input
            name="providerName"
            required
            maxlength="100"
            pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
            value="${escapeHtml(provider.name)}"
            placeholder="wyna"
          >
        </label>
        <label class="form-field">
          <span>Model</span>
          <input
            name="model"
            required
            maxlength="200"
            pattern="[A-Za-z0-9][A-Za-z0-9._:/-]*"
            list="model-options"
            value="${escapeHtml(provider.model)}"
            placeholder="deepseek-v4-flash"
          >
        </label>
        <label class="form-field form-field-wide">
          <span>Base URL</span>
          <input
            name="baseUrl"
            required
            type="url"
            value="${escapeHtml(provider.baseUrl)}"
            placeholder="http://100.85.99.127:9002/v1"
          >
        </label>
        <label class="form-field">
          <span>API Key</span>
          <input
            name="apiKey"
            type="text"
            autocomplete="off"
            value="${escapeHtml(provider.apiKey)}"
            placeholder="not-needed"
          >
        </label>
        <label class="form-field">
          <span>API Type</span>
          <input
            name="api"
            required
            maxlength="100"
            pattern="[A-Za-z0-9][A-Za-z0-9._:-]*"
            list="api-options"
            value="${escapeHtml(provider.api)}"
            placeholder="openai-completions"
          >
        </label>
        <datalist id="model-options">
          <option value="deepseek-v4-flash"></option>
          <option value="gpt-5.5"></option>
          <option value="gpt-4.1"></option>
          <option value="o3"></option>
        </datalist>
        <datalist id="api-options">
          <option value="openai-completions"></option>
          <option value="openai-responses"></option>
        </datalist>
      </div>
      <div class="form-actions">
        <button type="submit" class="button">Speichern</button>
      </div>
      <p class="notice" aria-live="polite">${escapeHtml(state.settingsNotice)}</p>
      <p class="form-error" aria-live="polite">${escapeHtml(state.settingsError)}</p>
    </form>
  `;
}

function renderProjectsPage() {
  if (state.loading) {
    app.innerHTML = `${renderStatusPanel()}<section class="loading-panel" aria-live="polite">Loading projects...</section>`;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      ${renderStatusPanel()}
      <section class="error-panel" role="alert">
        <h2>Projects could not be loaded</h2>
        <p>${escapeHtml(state.error)}</p>
        <button type="button" class="button" data-action="refresh">Refresh</button>
      </section>
    `;
    return;
  }

  const groups = groupedProjects();
  app.innerHTML = `
    ${renderStatusPanel()}
    <section class="projects-section" aria-labelledby="projects-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Import</p>
          <h2 id="projects-title">Projekte</h2>
        </div>
        <div class="toolbar">
          <label class="search-field">
            <span>Search</span>
            <input id="project-search" type="search" value="${escapeHtml(state.query)}" placeholder="Projekt suchen">
          </label>
          <button type="button" class="button button-secondary" data-action="refresh">Refresh</button>
        </div>
      </div>
      <div class="projects-meta">
        <span>${state.projects.length} Projekte erkannt</span>
        <span>${state.projects.filter((project) => project.imported).length} beobachtet</span>
        <span>${state.loops.filter((loop) => loop.status === "running").length} Loops laufen</span>
      </div>
      <div class="groups">
        ${
          groups.length
            ? groups.map((group) => `
              <section class="project-group" aria-labelledby="group-${escapeHtml(group.status)}">
                <div class="group-heading">
                  <h3 id="group-${escapeHtml(group.status)}">${escapeHtml(group.status)}</h3>
                  <span>${group.projects.length}</span>
                </div>
                <div class="project-grid">
                  ${group.projects.map(projectCard).join("")}
                </div>
              </section>
            `).join("")
            : `<p class="empty-state">No projects match the current search.</p>`
        }
      </div>
    </section>
  `;

  const search = document.querySelector("#project-search");
  search?.focus({ preventScroll: true });
  search?.setSelectionRange(search.value.length, search.value.length);
}

function detailRow(label, value) {
  return `
    <div class="detail-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function yesNo(value) {
  return value ? "Ja" : "Nei";
}

function renderSpecs(project) {
  const specs = project.setup?.ralph?.specs || [];
  if (!project.setup?.ralph?.hasSpecs) {
    return "<p class=\"muted-text\">Keine Specs gefunden.</p>";
  }

  return `
    <p><a class="text-link" href="${fileHref(project.setup.ralph.hostSpecsPath)}">Specs-Ordner oeffnen</a></p>
    ${
      specs.length
        ? `<ul class="spec-list">${specs.map((spec) => `<li><a href="${fileHref(spec.hostPath)}">${escapeHtml(spec.name)}</a></li>`).join("")}</ul>`
        : `<p class="muted-text">Specs-Ordner vorhanden, aber keine spec.md gefunden.</p>`
    }
  `;
}

function renderProjectLoopHistory(project) {
  const loops = loopsForProject(project.id);
  if (!loops.length) {
    return `<p class="muted-text">Noch keine Loops gestartet.</p>`;
  }

  return `
    <div class="loop-history-list">
      ${loops.map((loop) => `
        <a class="loop-history-item" href="${loopHref(loop)}" data-route>
          <span>${escapeHtml(formatTimestamp(loop.startedAt))}</span>
          ${loopStatusBadge(loop)}
          <span>${escapeHtml(formatDuration(loop.durationMs))}</span>
          <span>Exit: ${escapeHtml(loop.exitCode ?? "offen")}</span>
        </a>
      `).join("")}
    </div>
  `;
}

function renderStoryForm(project) {
  if (!state.storyFormOpen) return "";
  return `
    <form class="story-form" data-story-form data-project-id="${escapeHtml(project.id)}">
      <label class="form-field">
        <span>Titel</span>
        <input name="title" required maxlength="140" placeholder="Neue Story">
      </label>
      <label class="form-field">
        <span>Beschreibung</span>
        <textarea name="description" rows="4" placeholder="Was soll Ralph erledigen?"></textarea>
      </label>
      <label class="form-field">
        <span>Tags</span>
        <input name="tags" value="pending" placeholder="pending, p1, ui">
      </label>
      <div class="form-actions">
        <button type="button" class="button button-secondary" data-action="cancel-story-form">Abbrechen</button>
        <button type="submit" class="button">Story speichern</button>
      </div>
      <p class="form-error" aria-live="polite"></p>
    </form>
  `;
}

function renderStoryCard(project, spec) {
  const canOpenFile = Boolean(spec.filePath);
  const moveButtons = [
    ["pending", "Offen"],
    ["running", "In Arbeit"],
    ["done", "Fertig"],
  ].map(([status, label]) => `
    <button
      type="button"
      class="tiny-button"
      data-action="move-story"
      data-spec-id="${escapeHtml(spec.id)}"
      data-status="${escapeHtml(status)}"
      ${spec.status === status ? "disabled" : ""}
    >${escapeHtml(label)}</button>
  `).join("");

  return `
    <article
      class="story-card"
      data-story-id="${escapeHtml(spec.id)}"
      data-story-file-path="${escapeHtml(spec.filePath || "")}"
      data-project-id="${escapeHtml(project.id)}"
    >
      <div class="story-card-head">
        <h3>${escapeHtml(spec.title)}</h3>
        ${badge("Priorität", storyPriority(spec), "muted")}
      </div>
      <p>${escapeHtml(spec.description || "Keine Beschreibung")}</p>
      <div class="badge-row">${tagBadges(spec.tags)}</div>
      <div class="story-actions">
        ${canOpenFile ? `<button type="button" class="tiny-button" data-action="open-story-file" data-project-id="${escapeHtml(project.id)}" data-path="${escapeHtml(spec.filePath)}">Öffnen</button>` : ""}
        ${moveButtons}
      </div>
    </article>
  `;
}

function renderStoryboard(project) {
  const stories = specsForProject(project);
  const columns = [
    ["pending", "Offen"],
    ["running", "In Arbeit"],
    ["done", "Fertig"],
  ];

  return `
    <article class="dashboard-pane storyboard-pane">
      <div class="pane-heading">
        <div>
          <p class="eyebrow">Storyboard</p>
          <h2>Stories</h2>
        </div>
        <button type="button" class="button button-secondary" data-action="open-story-form">Neue Story</button>
      </div>
      ${renderStoryForm(project)}
      <div class="kanban-board">
        ${columns.map(([status, label]) => {
          const columnStories = stories.filter((spec) => (spec.status || "pending") === status);
          return `
            <section class="kanban-column" aria-labelledby="kanban-${escapeHtml(status)}">
              <div class="kanban-heading">
                <h3 id="kanban-${escapeHtml(status)}">${escapeHtml(label)}</h3>
                <span>${columnStories.length}</span>
              </div>
              <div class="kanban-cards">
                ${
                  columnStories.length
                    ? columnStories.map((spec) => renderStoryCard(project, spec)).join("")
                    : `<p class="kanban-empty">Keine Stories</p>`
                }
              </div>
            </section>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function renderFileBrowser(project) {
  if (state.projectFilesLoading) {
    return `<p class="muted-text">Dateien werden geladen...</p>`;
  }
  if (state.fileError && !state.projectFiles.length) {
    return `<p class="form-error">${escapeHtml(state.fileError)}</p>`;
  }
  if (!state.projectFiles.length) {
    return `<p class="muted-text">Keine editierbaren Dateien gefunden.</p>`;
  }

  return `
    <div class="file-list" role="list">
      ${state.projectFiles.map((file) => `
        <button
          type="button"
          class="file-list-item ${file.path === state.selectedFilePath ? "is-active" : ""}"
          data-action="open-project-file"
          data-project-id="${escapeHtml(project.id)}"
          data-path="${escapeHtml(file.path)}"
          title="${escapeHtml(file.path)}"
        >
          <span>${escapeHtml(file.path)}</span>
          <small>${escapeHtml(file.extension.replace(".", ""))} · ${Math.ceil(file.size / 1024)} KB</small>
        </button>
      `).join("")}
    </div>
  `;
}

function renderNewFileForm(project) {
  if (!state.newFileOpen) return "";
  return `
    <form class="new-file-form" data-new-file-form data-project-id="${escapeHtml(project.id)}">
      <label class="form-field">
        <span>Pfad</span>
        <input name="path" required placeholder="specs/007-feature/spec.md">
      </label>
      <div class="form-actions">
        <button type="button" class="button button-secondary" data-action="cancel-new-file">Abbrechen</button>
        <button type="submit" class="button">Neue Datei</button>
      </div>
      <p class="form-error" aria-live="polite"></p>
    </form>
  `;
}

function renderFileEditor(project) {
  const selectedSpec = selectedSpecForProject(project);
  return `
    <article class="dashboard-pane editor-pane">
      <div class="pane-heading">
        <div>
          <p class="eyebrow">Dateien</p>
          <h2>Editor</h2>
        </div>
        <button type="button" class="button button-secondary" data-action="open-new-file">Neue Datei</button>
      </div>
      ${renderNewFileForm(project)}
      <div class="editor-workspace">
        ${renderFileBrowser(project)}
        <form class="file-editor" data-file-editor-form data-project-id="${escapeHtml(project.id)}">
          <div class="file-editor-bar">
            <strong>${escapeHtml(state.selectedFilePath || "Keine Datei gewählt")}</strong>
            <span>${selectedFileIsDirty() ? "Ungespeichert" : "Gespeichert"}</span>
          </div>
          <textarea
            id="project-file-content"
            name="content"
            spellcheck="false"
            ${state.selectedFilePath ? "" : "disabled"}
          >${escapeHtml(state.selectedFileContent)}</textarea>
          <div class="form-actions">
            ${
              state.selectedFilePath && /\.md$/i.test(state.selectedFilePath)
                ? `<button type="button" class="button button-secondary" data-action="mark-file-done" data-project-id="${escapeHtml(project.id)}" ${selectedSpec?.status === "done" ? "disabled" : ""}>Als done markieren</button>`
                : ""
            }
            <button type="submit" class="button" ${state.selectedFilePath ? "" : "disabled"}>Speichern</button>
          </div>
          <p class="notice" aria-live="polite">${escapeHtml(state.fileNotice)}</p>
          <p class="form-error" aria-live="polite">${escapeHtml(state.fileError)}</p>
        </form>
      </div>
    </article>
  `;
}

function renderDashboardSide(project, loopButton) {
  return `
    <aside class="dashboard-pane side-pane">
      <div class="pane-heading">
        <div>
          <p class="eyebrow">Projekt</p>
          <h2>Status</h2>
        </div>
      </div>
      <dl>
        ${detailRow("Ordner", project.hostPath ? `<a class="text-link" href="${fileHref(project.hostPath)}">${escapeHtml(project.hostPath)}</a>` : "Nicht gefunden")}
        ${detailRow("Status", escapeHtml(project.sourceStatus || project.status))}
        ${detailRow("Ralph", escapeHtml(yesNo(project.ralph)))}
        ${detailRow("Docker", escapeHtml(yesNo(project.docker)))}
        ${detailRow("Proxy", escapeHtml(yesNo(project.proxy)))}
        ${detailRow("Provider", escapeHtml(providerSummary()))}
      </dl>
      <div class="side-actions">${loopButton}</div>
      <section class="side-history">
        <h3>Loop-Historie</h3>
        ${renderProjectLoopHistory(project)}
      </section>
    </aside>
  `;
}

function renderChatMessages() {
  if (!state.chatMessages.length) {
    return `<p class="log-muted">Noch keine Nachrichten.</p>`;
  }

  return state.chatMessages.map((message) => `
    <div class="chat-message chat-${escapeHtml(message.role)}">
      <span>${escapeHtml(message.role === "assistant" ? "AI" : "Du")}</span>
      <p>${escapeHtml(message.content || (state.chatStreaming && message.role === "assistant" ? "..." : ""))}</p>
    </div>
  `).join("");
}

function renderAiTerminal() {
  return `
    <section class="ai-terminal ${state.terminalCollapsed ? "is-collapsed" : ""}">
      <div class="terminal-header">
        <div>
          <p class="eyebrow">AI-Terminal</p>
          <h2>${escapeHtml(providerSummary())}</h2>
        </div>
        <button type="button" class="button button-secondary" data-action="toggle-terminal">
          ${state.terminalCollapsed ? "Öffnen" : "Einklappen"}
        </button>
      </div>
      ${
        state.terminalCollapsed
          ? ""
          : `
            <div class="chat-log" aria-live="polite">${renderChatMessages()}</div>
            <form class="chat-form" data-chat-form>
              <label class="form-field">
                <span>System-Prompt</span>
                <input name="systemPrompt" value="${escapeHtml(state.chatSystemPrompt)}">
              </label>
              <label class="form-field chat-input-field">
                <span>Nachricht</span>
                <textarea name="message" rows="2" required ${state.chatStreaming ? "disabled" : ""}></textarea>
              </label>
              <div class="form-actions">
                <button type="submit" class="button" ${state.chatStreaming ? "disabled" : ""}>Senden</button>
              </div>
              <p class="form-error" aria-live="polite">${escapeHtml(state.chatError)}</p>
            </form>
          `
      }
    </section>
  `;
}

function renderDetailPage(projectId) {
  if (state.loading) {
    app.innerHTML = `<section class="loading-panel" aria-live="polite">Loading project...</section>`;
    return;
  }

  const project = state.projects.find((entry) => entry.id === projectId || entry.directoryName === projectId);
  if (!project) {
    app.innerHTML = `
      <section class="error-panel" role="alert">
        <h1>Project not found</h1>
        <a class="text-link" href="${href("/projects")}" data-route>Back to projects</a>
      </section>
    `;
    return;
  }

  ensureDashboardProject(project);
  const activeLoop = activeLoopForProject(project.id);
  const loopButton = project.imported
    ? activeLoop
      ? `
        <a class="button" href="${loopHref(activeLoop)}" data-route>Live-Log oeffnen</a>
        <button type="button" class="button button-secondary" disabled>Loop läuft bereits</button>
      `
      : `<button type="button" class="button" data-action="start-loop" data-project-id="${escapeHtml(project.id)}">Ralph Loop starten</button>`
    : `<button type="button" class="button" data-action="import" data-project-id="${escapeHtml(project.id)}">Importieren</button>`;

  app.innerHTML = `
    <section class="detail-header">
      <a class="text-link" href="${href("/projects")}" data-route>Back to projects</a>
      <div class="detail-title-row">
        <div>
          <p class="eyebrow">Projekt-Dashboard</p>
          <h1>${escapeHtml(project.name)}</h1>
          <p class="summary">${escapeHtml(project.description || "Keine Beschreibung in PROJECTS.md")}</p>
        </div>
        <div class="detail-actions">
          ${
            project.imported
              ? `<button type="button" class="button button-secondary" data-action="unwatch" data-project-id="${escapeHtml(project.id)}">Nicht mehr beobachten</button>`
              : ""
          }
        </div>
      </div>
      <div class="badge-row">${capabilityBadges(project)}</div>
      <p id="detail-notice" class="notice" aria-live="polite"></p>
    </section>

    <section class="dashboard-layout">
      ${renderStoryboard(project)}
      ${renderFileEditor(project)}
      ${renderDashboardSide(project, loopButton)}
    </section>
    ${renderAiTerminal()}
  `;
}

function renderSpecDetailPage(specId) {
  if (state.loading) {
    app.innerHTML = `<section class="loading-panel" aria-live="polite">Loading spec...</section>`;
    return;
  }

  const spec = state.specs.find((entry) => entry.id === specId);
  if (!spec) {
    app.innerHTML = `
      <section class="error-panel" role="alert">
        <h1>Spec not found</h1>
        <a class="text-link" href="${href("/specs")}" data-route>Back to specs</a>
      </section>
    `;
    return;
  }

  app.innerHTML = `
    <section class="detail-header">
      <a class="text-link" href="${href("/specs")}" data-route>Back to specs</a>
      <div class="detail-title-row">
        <div>
          <p class="eyebrow">${escapeHtml(projectNameForId(spec.projectId))}</p>
          <h1>${escapeHtml(spec.title)}</h1>
          <p class="summary">${escapeHtml(spec.description || "Keine Beschreibung")}</p>
        </div>
        <div class="detail-actions">
          <button type="button" class="button button-secondary" data-action="mark-spec-running" data-spec-id="${escapeHtml(spec.id)}" ${spec.status === "running" ? "disabled" : ""}>In Arbeit</button>
          <button type="button" class="button" data-action="mark-spec-done" data-spec-id="${escapeHtml(spec.id)}" ${spec.status === "done" ? "disabled" : ""}>Als done markieren</button>
          <button type="button" class="button button-secondary" data-action="edit-spec" data-spec-id="${escapeHtml(spec.id)}">Bearbeiten</button>
          <button type="button" class="button button-danger" data-action="delete-spec" data-spec-id="${escapeHtml(spec.id)}">Löschen</button>
        </div>
      </div>
      <div class="badge-row">${tagBadges(spec.tags)}</div>
      <p id="spec-notice" class="notice" aria-live="polite"></p>
    </section>

    ${state.specForm?.mode === "edit" && state.specForm.specId === spec.id ? renderSpecForm(spec) : ""}

    <section class="detail-layout">
      <article class="detail-section">
        <h2>Details</h2>
        <dl>
          ${detailRow("Status", badge("Status", spec.status, specStatusType(spec.status)))}
          ${detailRow("Projekt", escapeHtml(projectNameForId(spec.projectId)))}
          ${detailRow("Tags", `<span class="badge-row">${tagBadges(spec.tags)}</span>`)}
          ${detailRow("Erstellt", escapeHtml(formatTimestamp(spec.createdAt)))}
          ${detailRow("Geändert", escapeHtml(formatTimestamp(spec.updatedAt)))}
          ${detailRow("Datei", spec.hostPath ? `<a class="text-link" href="${fileHref(spec.hostPath)}">${escapeHtml(spec.hostPath)}</a>` : "Nicht gefunden")}
        </dl>
      </article>

      <article class="detail-section detail-section-wide">
        <h2>Beschreibung</h2>
        <p class="spec-description-full">${escapeHtml(spec.description || "Keine Beschreibung")}</p>
      </article>
    </section>
  `;
}

function renderLoopCard(loop) {
  return `
    <article class="loop-card">
      <div class="loop-card-main">
        <div>
          <a class="project-name" href="${loopHref(loop)}" data-route>${escapeHtml(loop.projectName || loop.projectId)}</a>
          <p class="project-description">${escapeHtml(formatTimestamp(loop.startedAt))} · ${escapeHtml(formatDuration(loop.durationMs))}</p>
        </div>
        ${loopStatusBadge(loop)}
      </div>
      <div class="loop-card-meta">
        <span>${escapeHtml(loop.projectId)}</span>
        <span>Provider: ${escapeHtml(providerForLoop(loop))}</span>
        <span>Model: ${escapeHtml(modelForLoop(loop))}</span>
        <span>Exit: ${escapeHtml(loop.exitCode ?? "offen")}</span>
        <span>${escapeHtml(loop.logLineCount || 0)} Log-Einträge</span>
      </div>
      <div class="project-card-actions">
        <a class="text-link" href="${projectHref({ id: loop.projectId })}" data-route>Projekt</a>
        <a class="text-link" href="${loopHref(loop)}" data-route>Logs</a>
        ${
          loop.status === "running"
            ? `<button type="button" class="button button-secondary" data-action="stop-loop" data-loop-id="${escapeHtml(loop.id)}">Abbrechen</button>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderLoopsPage() {
  if (state.loading) {
    app.innerHTML = `<section class="loading-panel" aria-live="polite">Loading loops...</section>`;
    return;
  }

  const runningCount = state.loops.filter((loop) => loop.status === "running").length;
  app.innerHTML = `
    <section class="detail-header">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Loop-Historie</p>
          <h1>Ralph Loops</h1>
          <p class="summary">${state.loops.length} Loops gespeichert, ${runningCount} laufen gerade.</p>
        </div>
        <button type="button" class="button button-secondary" data-action="refresh-loops">Refresh</button>
      </div>
    </section>
    <section class="loops-section">
      ${
        state.loops.length
          ? `<div class="loop-grid">${state.loops.map(renderLoopCard).join("")}</div>`
          : `<p class="empty-state">Noch keine Loops gestartet.</p>`
      }
    </section>
  `;
}

function renderTerminalLog(loopId) {
  const logs = state.loopLogs[loopId];
  if (!logs) {
    return `<div class="terminal-log" aria-live="polite">Loading logs...</div>`;
  }

  if (!logs.length) {
    return `<div class="terminal-log" aria-live="polite"><span class="log-muted">Waiting for output...</span></div>`;
  }

  return `
    <div class="terminal-log" aria-live="polite">
      ${logs.map((entry) => `<span class="log-entry log-${escapeHtml(entry.stream)}">${escapeHtml(entry.text)}</span>`).join("")}
    </div>
  `;
}

function renderLoopDetailPage(loopId) {
  if (state.loading) {
    app.innerHTML = `<section class="loading-panel" aria-live="polite">Loading loop...</section>`;
    return;
  }

  const loop = state.loops.find((entry) => entry.id === loopId);
  if (!loop) {
    app.innerHTML = `
      <section class="error-panel" role="alert">
        <h1>Loop not found</h1>
        <a class="text-link" href="${href("/loops")}" data-route>Back to loops</a>
      </section>
    `;
    return;
  }

  if (loop.status === "running") {
    openLoopStream(loop.id);
  } else if (!state.loopLogs[loop.id]) {
    loadLoopLogs(loop.id);
  }

  app.innerHTML = `
    <section class="detail-header loop-detail-header">
      <a class="text-link" href="${href("/loops")}" data-route>Back to loops</a>
      <div class="detail-title-row">
        <div>
          <p class="eyebrow">${escapeHtml(loop.projectId)}</p>
          <h1>${escapeHtml(loop.projectName || loop.projectId)}</h1>
          <p class="summary">${escapeHtml(loop.command)} ${escapeHtml((loop.args || []).join(" "))}</p>
        </div>
        <div class="detail-actions">
          ${loopStatusBadge(loop)}
          ${
            loop.status === "running"
              ? `<button type="button" class="button" data-action="stop-loop" data-loop-id="${escapeHtml(loop.id)}">Abbrechen</button>`
              : ""
          }
          <button type="button" class="button button-secondary" data-action="close-log" data-project-id="${escapeHtml(loop.projectId)}">Schliessen</button>
        </div>
      </div>
      <div class="loop-stats">
        <span>Start: ${escapeHtml(formatTimestamp(loop.startedAt))}</span>
        <span>Ende: ${escapeHtml(formatTimestamp(loop.finishedAt))}</span>
        <span>Dauer: ${escapeHtml(formatDuration(loop.durationMs))}</span>
        <span>Provider: ${escapeHtml(providerForLoop(loop))}</span>
        <span>Model: ${escapeHtml(modelForLoop(loop))}</span>
        <span>Exit: ${escapeHtml(loop.exitCode ?? "offen")}</span>
      </div>
    </section>
    <section class="terminal-section">
      ${renderTerminalLog(loop.id)}
    </section>
  `;
  scrollTerminal();
}

function render() {
  updateChrome();
  const currentRoute = routePath();
  if (loopStream.loopId && currentRoute !== `/loops/${loopStream.loopId}`) {
    closeLoopStream();
  }

  if (currentRoute === "/" || currentRoute === "/projects") {
    renderProjectsPage();
    return;
  }

  if (currentRoute.startsWith("/projects/")) {
    renderDetailPage(decodeURIComponent(currentRoute.replace("/projects/", "")));
    return;
  }

  if (currentRoute === "/specs") {
    renderSpecsPage();
    return;
  }

  if (currentRoute.startsWith("/specs/")) {
    renderSpecDetailPage(decodeURIComponent(currentRoute.replace("/specs/", "")));
    return;
  }

  if (currentRoute === "/settings") {
    renderSettingsPage();
    return;
  }

  if (currentRoute === "/loops") {
    renderLoopsPage();
    return;
  }

  if (currentRoute.startsWith("/loops/")) {
    renderLoopDetailPage(decodeURIComponent(currentRoute.replace("/loops/", "")));
    return;
  }

  window.history.replaceState({}, "", href("/projects"));
  renderProjectsPage();
}

async function performProjectAction(button, action, projectId) {
  button.disabled = true;
  const endpoint = action === "import" ? "import" : "unwatch";
  try {
    await fetchJson(`${API_BASE}/projects/${encodeURIComponent(projectId)}/${endpoint}`, { method: "POST" });
    await loadData({ silent: true });
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function startLoop(button, projectId) {
  button.disabled = true;
  const notice = document.querySelector("#detail-notice");
  if (notice) {
    notice.textContent = "Loop startet...";
  }

  try {
    const loop = await fetchJson(`${API_BASE}/projects/${encodeURIComponent(projectId)}/loop/start`, { method: "POST" });
    updateLoop(loop);
    window.history.pushState({}, "", loopHref(loop));
    render();
  } catch (error) {
    if (notice) {
      notice.textContent = error.message;
    } else {
      state.error = error.message;
      render();
    }
    button.disabled = false;
  }
}

async function stopLoop(button, loopId) {
  button.disabled = true;
  try {
    const loop = await fetchJson(`${API_BASE}/loops/${encodeURIComponent(loopId)}/stop`, { method: "POST" });
    updateLoop(loop);
    await loadData({ silent: true });
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function tagsFromInput(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function saveSpec(form) {
  const submitButton = form.querySelector("button[type='submit']");
  const errorLine = form.querySelector(".form-error");
  submitButton.disabled = true;
  if (errorLine) {
    errorLine.textContent = "";
  }

  const formData = new FormData(form);
  const payload = {
    title: formData.get("title"),
    description: formData.get("description"),
    projectId: formData.get("projectId"),
    tags: tagsFromInput(formData.get("tags")),
  };
  const specId = form.dataset.specId;
  const isEdit = form.dataset.mode === "edit";

  try {
    const spec = await fetchJson(`${API_BASE}/specs${isEdit ? `/${encodeURIComponent(specId)}` : ""}`, {
      method: isEdit ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.specForm = null;
    await loadData({ silent: true });
    window.history.pushState({}, "", specHref(spec));
    render();
  } catch (error) {
    if (errorLine) {
      errorLine.textContent = error.message;
    } else {
      state.error = error.message;
      render();
    }
    submitButton.disabled = false;
  }
}

async function saveSettings(form) {
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  state.settingsNotice = "";
  state.settingsError = "";

  const formData = new FormData(form);
  const payload = {
    provider: {
      name: formData.get("providerName"),
      model: formData.get("model"),
      baseUrl: formData.get("baseUrl"),
      apiKey: formData.get("apiKey"),
      api: formData.get("api"),
    },
  };

  try {
    const settings = await fetchJson(`${API_BASE}/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.settings = settings;
    state.settingsNotice = "Gespeichert.";
    render();
  } catch (error) {
    state.settingsError = error.message;
    render();
    const input = document.querySelector("form[data-settings-form] input[name='providerName']");
    input?.focus({ preventScroll: true });
  } finally {
    submitButton.disabled = false;
  }
}

async function setSpecStatus(button, specId, tag) {
  button.disabled = true;
  const notice = document.querySelector("#spec-notice");
  if (notice) {
    notice.textContent = "Speichern...";
  }

  try {
    await fetchJson(`${API_BASE}/specs/${encodeURIComponent(specId)}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    await loadData({ silent: true });
  } catch (error) {
    if (notice) {
      notice.textContent = error.message;
    } else {
      state.error = error.message;
      render();
    }
    button.disabled = false;
  }
}

async function deleteSpec(button, specId) {
  if (!window.confirm("Spec wirklich löschen?")) {
    return;
  }

  button.disabled = true;
  try {
    await fetchJson(`${API_BASE}/specs/${encodeURIComponent(specId)}`, { method: "DELETE" });
    state.specForm = null;
    await loadData({ silent: true });
    window.history.pushState({}, "", href("/specs"));
    render();
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function defaultContentForPath(filePath) {
  const extension = filePath.split(".").pop().toLowerCase();
  if (extension === "json") return "{\n  \n}\n";
  if (extension === "sh") return "#!/usr/bin/env bash\nset -euo pipefail\n";
  if (extension === "yml" || extension === "yaml") return "---\n";
  if (extension === "toml") return "";
  return `# ${filePath.split("/").pop().replace(/\.md$/i, "")}\n`;
}

async function saveProjectFile(form) {
  const projectId = form.dataset.projectId;
  const submitButton = form.querySelector("button[type='submit']");
  const textarea = form.querySelector("textarea[name='content']");
  if (!state.selectedFilePath || !textarea) return;

  submitButton.disabled = true;
  state.fileError = "";
  state.fileNotice = "Speichern...";
  state.selectedFileContent = textarea.value;
  render();

  try {
    const file = await fetchJson(`${API_BASE}/projects/${encodeURIComponent(projectId)}/files/content`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: state.selectedFilePath,
        content: state.selectedFileContent,
      }),
    });
    state.selectedFilePath = file.path;
    state.selectedFileContent = file.content;
    state.selectedFileOriginal = file.content;
    state.selectedFileMeta = file;
    state.fileNotice = "Gespeichert.";
    await loadProjectFiles(projectId, { silent: true });
    await loadData({ silent: true });
  } catch (error) {
    state.fileError = error.message;
    render();
  } finally {
    submitButton.disabled = false;
  }
}

async function createProjectFile(form) {
  const projectId = form.dataset.projectId;
  const errorLine = form.querySelector(".form-error");
  const submitButton = form.querySelector("button[type='submit']");
  const formData = new FormData(form);
  const filePath = String(formData.get("path") || "").trim();
  submitButton.disabled = true;
  if (errorLine) errorLine.textContent = "";

  try {
    const file = await fetchJson(`${API_BASE}/projects/${encodeURIComponent(projectId)}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        content: defaultContentForPath(filePath),
      }),
    });
    state.newFileOpen = false;
    await loadProjectFiles(projectId, { silent: true });
    await openProjectFile(projectId, file.path);
  } catch (error) {
    if (errorLine) {
      errorLine.textContent = error.message;
    } else {
      state.fileError = error.message;
      render();
    }
  } finally {
    submitButton.disabled = false;
  }
}

async function createStory(form) {
  const projectId = form.dataset.projectId;
  const submitButton = form.querySelector("button[type='submit']");
  const errorLine = form.querySelector(".form-error");
  const formData = new FormData(form);
  submitButton.disabled = true;
  if (errorLine) errorLine.textContent = "";

  try {
    const story = await fetchJson(`${API_BASE}/specs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"),
        description: formData.get("description"),
        projectId,
        tags: tagsFromInput(formData.get("tags") || "pending"),
      }),
    });
    state.storyFormOpen = false;
    await loadData({ silent: true });
    await loadProjectFiles(projectId, { silent: true });
    if (story.filePath) {
      await openProjectFile(projectId, story.filePath);
    }
  } catch (error) {
    if (errorLine) {
      errorLine.textContent = error.message;
    } else {
      state.error = error.message;
      render();
    }
  } finally {
    submitButton.disabled = false;
  }
}

async function moveStory(button, specId, status) {
  button.disabled = true;
  try {
    await fetchJson(`${API_BASE}/specs/${encodeURIComponent(specId)}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag: status }),
    });
    await loadData({ silent: true });
  } catch (error) {
    state.fileError = error.message;
    render();
  } finally {
    button.disabled = false;
  }
}

async function markSelectedFileDone(button, projectId) {
  button.disabled = true;
  const project = state.projects.find((entry) => entry.id === projectId);
  const spec = project ? selectedSpecForProject(project) : null;
  const textarea = document.querySelector("#project-file-content");

  try {
    if (spec) {
      await fetchJson(`${API_BASE}/specs/${encodeURIComponent(spec.id)}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag: "done" }),
      });
      await loadData({ silent: true });
      if (spec.filePath) {
        await openProjectFile(projectId, spec.filePath);
      }
      return;
    }

    state.selectedFileContent = upsertDoneMarkers(textarea?.value || state.selectedFileContent);
    await fetchJson(`${API_BASE}/projects/${encodeURIComponent(projectId)}/files/content`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: state.selectedFilePath,
        content: state.selectedFileContent,
      }),
    });
    state.fileNotice = "Als done markiert.";
    await openProjectFile(projectId, state.selectedFilePath, { silent: true });
    await loadData({ silent: true });
  } catch (error) {
    state.fileError = error.message;
    render();
  } finally {
    button.disabled = false;
  }
}

async function sendChat(form) {
  const formData = new FormData(form);
  const message = String(formData.get("message") || "").trim();
  if (!message || state.chatStreaming) return;

  const systemPrompt = String(formData.get("systemPrompt") || "");
  const outgoingMessages = [
    ...state.chatMessages.filter((entry) => entry.content).map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: "user", content: message },
  ];

  state.chatSystemPrompt = systemPrompt;
  state.chatMessages = [...state.chatMessages, { role: "user", content: message }, { role: "assistant", content: "" }];
  state.chatStreaming = true;
  state.chatError = "";
  render();

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemPrompt,
        messages: outgoingMessages,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Chat failed with ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const result = await reader.read();
      done = result.done;
      buffer += decoder.decode(result.value || new Uint8Array(), { stream: !done });
      const parsed = parseSseEvents(buffer);
      buffer = parsed.rest;

      for (const event of parsed.events) {
        const payload = JSON.parse(event.data);
        if (event.eventName === "delta") {
          const last = state.chatMessages[state.chatMessages.length - 1];
          last.content += payload.content || "";
          render();
        }
        if (event.eventName === "error") {
          state.chatError = payload.message || "Chat failed";
          render();
        }
      }
    }
  } catch (error) {
    state.chatError = error.message;
    render();
  } finally {
    state.chatStreaming = false;
    render();
  }
}

document.addEventListener("click", (event) => {
  const routeLink = event.target.closest("a[data-route]");
  if (routeLink) {
    event.preventDefault();
    window.history.pushState({}, "", routeLink.href);
    render();
    app.focus({ preventScroll: false });
    return;
  }

  const actionButton = event.target.closest("button[data-action]");
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "refresh" || action === "refresh-loops") {
      loadData();
      return;
    }
    if (action === "open-spec-form") {
      state.specForm = { mode: "create" };
      render();
      return;
    }
    if (action === "cancel-spec-form") {
      state.specForm = null;
      render();
      return;
    }
    if (action === "edit-spec") {
      state.specForm = { mode: "edit", specId: actionButton.dataset.specId };
      render();
      return;
    }
    if (action === "mark-spec-running") {
      setSpecStatus(actionButton, actionButton.dataset.specId, "running");
      return;
    }
    if (action === "mark-spec-done") {
      setSpecStatus(actionButton, actionButton.dataset.specId, "done");
      return;
    }
    if (action === "delete-spec") {
      deleteSpec(actionButton, actionButton.dataset.specId);
      return;
    }
    if (action === "open-story-form") {
      state.storyFormOpen = true;
      render();
      return;
    }
    if (action === "cancel-story-form") {
      state.storyFormOpen = false;
      render();
      return;
    }
    if (action === "move-story") {
      moveStory(actionButton, actionButton.dataset.specId, actionButton.dataset.status);
      return;
    }
    if (action === "open-story-file" || action === "open-project-file") {
      openProjectFile(actionButton.dataset.projectId, actionButton.dataset.path);
      return;
    }
    if (action === "open-new-file") {
      state.newFileOpen = true;
      render();
      return;
    }
    if (action === "cancel-new-file") {
      state.newFileOpen = false;
      render();
      return;
    }
    if (action === "mark-file-done") {
      markSelectedFileDone(actionButton, actionButton.dataset.projectId);
      return;
    }
    if (action === "toggle-terminal") {
      state.terminalCollapsed = !state.terminalCollapsed;
      render();
      return;
    }
    if (action === "start-loop") {
      startLoop(actionButton, actionButton.dataset.projectId);
      return;
    }
    if (action === "stop-loop") {
      stopLoop(actionButton, actionButton.dataset.loopId);
      return;
    }
    if (action === "close-log") {
      closeLoopStream();
      window.history.pushState({}, "", projectHref({ id: actionButton.dataset.projectId }));
      render();
      return;
    }
    performProjectAction(actionButton, action, actionButton.dataset.projectId);
    return;
  }

  const card = event.target.closest("[data-card-id]");
  if (card && !event.target.closest("a, button")) {
    window.history.pushState({}, "", projectHref({ id: card.dataset.cardId }));
    render();
  }

  const specCard = event.target.closest("[data-spec-card-id]");
  if (specCard && !event.target.closest("a, button")) {
    window.history.pushState({}, "", specHref({ id: specCard.dataset.specCardId }));
    render();
  }

  const storyCard = event.target.closest("[data-story-id]");
  if (storyCard && !event.target.closest("a, button") && storyCard.dataset.storyFilePath) {
    openProjectFile(storyCard.dataset.projectId, storyCard.dataset.storyFilePath);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "project-search") {
    state.query = event.target.value;
    renderProjectsPage();
  }
  if (event.target.id === "spec-search") {
    state.specQuery = event.target.value;
    renderSpecsPage();
  }
  if (event.target.id === "project-file-content") {
    state.selectedFileContent = event.target.value;
    const status = document.querySelector(".file-editor-bar span");
    if (status) {
      status.textContent = selectedFileIsDirty() ? "Ungespeichert" : "Gespeichert";
    }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "spec-status-filter") {
    state.specTagFilter = event.target.value;
    renderSpecsPage();
  }
  if (event.target.id === "spec-project-filter") {
    state.specProjectFilter = event.target.value;
    renderSpecsPage();
  }
});

document.addEventListener("submit", (event) => {
  const storyForm = event.target.closest("form[data-story-form]");
  if (storyForm) {
    event.preventDefault();
    createStory(storyForm);
    return;
  }

  const fileForm = event.target.closest("form[data-file-editor-form]");
  if (fileForm) {
    event.preventDefault();
    saveProjectFile(fileForm);
    return;
  }

  const newFileForm = event.target.closest("form[data-new-file-form]");
  if (newFileForm) {
    event.preventDefault();
    createProjectFile(newFileForm);
    return;
  }

  const chatForm = event.target.closest("form[data-chat-form]");
  if (chatForm) {
    event.preventDefault();
    sendChat(chatForm);
    return;
  }

  const form = event.target.closest("form[data-spec-form]");
  if (form) {
    event.preventDefault();
    saveSpec(form);
    return;
  }

  const settingsForm = event.target.closest("form[data-settings-form]");
  if (settingsForm) {
    event.preventDefault();
    saveSettings(settingsForm);
  }
});

window.addEventListener("popstate", render);

loadData();
