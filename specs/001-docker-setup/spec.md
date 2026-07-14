# Specification: 001 Docker Setup

## Feature: Docker-Grundgerüst mit Web-GUI

### Overview

Ralphi wird als Docker-Container betrieben, eingebunden ins bestehende `vibes-proxy`-Netzwerk. Die Spec stellt das Fundament: Ein lauffähiges Web-GUI (minimal, aber erweiterbar), das über den Proxy unter `/ralphi/` erreichbar ist.

### User Stories

- As a user, I want ralphi unter `https://mac-mini-von-est.tailfb7eca.ts.net/ralphi/` aufrufen zu können
- As a user, ich will eine leere Seite sehen, die mir sagt, dass ralphi lebt
- As a developer, ich will `docker compose up` ausführen und ralphi läuft

---

## Functional Requirements

### FR-1: Docker-Compose mit Proxy-Anbindung

**Acceptance Criteria:**
- [x] `docker-compose.yml` definiert einen Service `ralphi`
- [x] ralphi ist im Netzwerk `vibes-proxy` (external)
- [x] ralphi hat network alias `ralphi`
- [x] Container startet mit `docker compose up` ohne Fehler
- [x] Container restartet bei Absturz (restart: unless-stopped)
- [x] Healthcheck prüft, ob die Web-Oberfläche antwortet

### FR-2: Caddyfile-Integration

**Acceptance Criteria:**
- [x] `Caddyfile.local` wird erstellt (als Vorlage/Einbindungshinweis)
- [x] ODER die `Caddyfile` im vibes-proxy wird dokumentiert

Hinweis: Die eigentliche Caddyfile-Änderung liegt im vibes-proxy-Projekt (`/Users/boot/Documents/vibes/vibes-proxy/Caddyfile`). Ralph kann das nach dieser Spec selbstständig machen, wenn das Zielverzeichnis bekannt ist.

### FR-3: Minimales Web-GUI

**Acceptance Criteria:**
- [x] Eine Webseite wird ausgeliefert unter `/ralphi/` (Pfad-basiertes Routing)
- [x] Seite zeigt "Ralphi – Ralph Wiggum Loop Manager" als Überschrift
- [x] Seite zeigt "Status: Alive" und das aktuelle Datum
- [x] Es gibt einen Hinweis, dass hier Ralph Loops verwaltet werden
- [x] Statisches HTML/JS/CSS – kein Framework-Overkill für den Start
- [x] Alle Assets sind relativ gepfadet (wegen `/ralphi/`-Subpfad)

### FR-4: Logging

**Acceptance Criteria:**
- [x] Logs werden auf stdout geschrieben (Docker-konform)
- [x] Healthcheck-Logs sind sichtbar mit `docker compose logs`

---

## Dependencies

- vibes-proxy unter `/Users/boot/Documents/vibes/vibes-proxy/`
- Docker-Netzwerk `vibes-proxy` existiert (wird vom Proxy bereitgestellt)

## Assumptions

- Der Proxy läuft bereits (`make start` im vibes-proxy)
- Ralph darf die Caddyfile im vibes-proxy-Projekt bearbeiten
- Der Pfad lautet `/ralphi/` (mit Slash)

---

## Completion Signal

### Implementation Checklist

- [x] `ralphi/docker-compose.yml` erstellt
- [x] `ralphi/Dockerfile` erstellt (oder Ein-Image-Lösung)
- [x] `ralphi/index.html` existiert (minimales GUI)
- [x] `ralphi/Caddyfile.local` oder Dokumentation zur Proxy-Einbindung
- [x] Ralph hat die Caddyfile im vibes-proxy Projekt aktualisiert
- [x] Ralph hat den Proxy neugestartet
- [x] Seite ist unter `/ralphi/` erreichbar

### Testing Requirements

#### Code Quality
- [x] Docker compose lint: `docker compose config` gibt keinen Fehler
- [x] Dockerfile ist valide

#### Functional Verification
- [x] `docker compose up` startet ohne Fehler
- [x] Healthcheck schlägt nicht fehl (nach Startup-Zeit)
- [x] Seite erreichbar unter `http://localhost:8081/ralphi/` (konfigurierter Port; 8080 war bereits belegt)
- [x] Seite erreichbar unter `https://mac-mini-von-est.tailfb7eca.ts.net/ralphi/`

#### Visual Verification
- [x] Überschrift "Ralphi – Ralph Wiggum Loop Manager" sichtbar
- [x] Status-Alive-Meldung sichtbar
- [x] Layout ist nicht kaputt

#### Console/Network Check
- [x] Keine 404er für Assets (CSS/JS)
- [x] Keine gebrochenen relativen Pfade

### Iteration Instructions

Wenn etwas fehlschlägt:
1. Fehler identifizieren
2. Fixen
3. Docker neubauen (`docker compose build` / `docker compose up -d`)
4. Erneut prüfen
5. Commit und push

**Only when ALL checks pass, output:** `<promise>DONE</promise>`

---

## Status: COMPLETE
<!-- NR_OF_TRIES: 1 -->
