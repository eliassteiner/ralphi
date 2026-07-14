const ROUTE_BASE = "/ralphi";
const API_BASE = window.location.pathname.startsWith(ROUTE_BASE) ? `${ROUTE_BASE}/api` : "/api";
const STATUS_ORDER = ["Aktiv", "Archiv", "Referenz"];

const app = document.querySelector("#app");
const state = {
  projects: [],
  loops: [],
  specs: [],
  loopLogs: {},
  query: "",
  specQuery: "",
  specTagFilter: "",
  specProjectFilter: "",
  specForm: null,
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
    const [projects, loops, specs] = await Promise.all([
      fetchJson(`${API_BASE}/projects`),
      fetchJson(`${API_BASE}/loops`),
      fetchJson(`${API_BASE}/specs`),
    ]);
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
        <p class="date-line">Date: <time>${escapeHtml(formatDate())}</time></p>
      </div>
    </section>
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
          <p class="eyebrow">${escapeHtml(project.status)}</p>
          <h1>${escapeHtml(project.name)}</h1>
          <p class="summary">${escapeHtml(project.description || "Keine Beschreibung in PROJECTS.md")}</p>
        </div>
        <div class="detail-actions">
          ${loopButton}
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

    <section class="detail-layout">
      <article class="detail-section">
        <h2>PROJECTS.md</h2>
        <dl>
          ${detailRow("Ordner", project.hostPath ? `<a class="text-link" href="${fileHref(project.hostPath)}">${escapeHtml(project.hostPath)}</a>` : "Nicht gefunden")}
          ${detailRow("Status", escapeHtml(project.sourceStatus || project.status))}
          ${detailRow("Quelle", escapeHtml(project.source))}
          ${detailRow("Dateisystem", escapeHtml(project.exists ? "Ordner existiert" : "Ordner fehlt"))}
        </dl>
      </article>

      <article class="detail-section">
        <h2>Ralph Setup</h2>
        <dl>
          ${detailRow("AGENTS.md", escapeHtml(yesNo(project.setup?.ralph?.hasAgents)))}
          ${detailRow("CLAUDE.md", escapeHtml(yesNo(project.setup?.ralph?.hasClaude)))}
          ${detailRow("Constitution", escapeHtml(yesNo(project.setup?.ralph?.hasConstitution)))}
          ${detailRow("Specs", escapeHtml(yesNo(project.setup?.ralph?.hasSpecs)))}
        </dl>
        ${renderSpecs(project)}
      </article>

      <article class="detail-section">
        <h2>Docker / Proxy</h2>
        <dl>
          ${detailRow("Docker-Compose-Status", escapeHtml(project.setup?.docker?.composeStatus || "Unknown"))}
          ${detailRow("Docker Files", escapeHtml((project.setup?.docker?.files || []).join(", ") || "Keine"))}
          ${detailRow("Proxy", escapeHtml(project.proxy ? "Ja" : "Nei"))}
          ${detailRow("Proxy-Quelle", escapeHtml(project.setup?.proxy?.source || "not-detected"))}
          ${detailRow("Proxy-Route", escapeHtml(project.setup?.proxy?.route || "Keine Route erkannt"))}
        </dl>
      </article>

      <article class="detail-section">
        <h2>Loop-Historie</h2>
        ${renderProjectLoopHistory(project)}
      </article>
    </section>
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
  const form = event.target.closest("form[data-spec-form]");
  if (form) {
    event.preventDefault();
    saveSpec(form);
  }
});

window.addEventListener("popstate", render);

loadData();
