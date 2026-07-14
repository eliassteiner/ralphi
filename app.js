const ROUTE_BASE = "/ralphi";
const API_BASE = window.location.pathname.startsWith(ROUTE_BASE) ? `${ROUTE_BASE}/api` : "/api";
const STATUS_ORDER = ["Aktiv", "Archiv", "Referenz"];

const app = document.querySelector("#app");
const state = {
  projects: [],
  query: "",
  loading: true,
  error: "",
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    ...options,
  });
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const error = await response.json();
      message = error.message || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }
  return response.json();
}

async function loadProjects() {
  state.loading = true;
  state.error = "";
  render();
  try {
    state.projects = await fetchJson(`${API_BASE}/projects`);
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
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

  const loopButton = project.imported
    ? `<button type="button" class="button" data-action="start-loop" data-project-id="${escapeHtml(project.id)}">Ralph Loop starten</button>`
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
    </section>
  `;
}

function render() {
  const currentRoute = routePath();
  if (currentRoute === "/" || currentRoute === "/projects") {
    renderProjectsPage();
    return;
  }

  if (currentRoute.startsWith("/projects/")) {
    renderDetailPage(decodeURIComponent(currentRoute.replace("/projects/", "")));
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
    await loadProjects();
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
    if (action === "refresh") {
      loadProjects();
      return;
    }
    if (action === "start-loop") {
      const notice = document.querySelector("#detail-notice");
      if (notice) {
        notice.textContent = "Ralph Loop start is ready for a follow-up spec.";
      }
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
});

document.addEventListener("input", (event) => {
  if (event.target.id === "project-search") {
    state.query = event.target.value;
    renderProjectsPage();
  }
});

window.addEventListener("popstate", render);

loadProjects();
