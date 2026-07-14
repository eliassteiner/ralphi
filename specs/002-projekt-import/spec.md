# Specification: 002 Projekt-Import

## Feature: Bestehende Projekte aus /Users/boot/Documents/vibes/ importieren

### Overview

Ralphi soll bestehende Projekte aus dem vibes-Ordner erkennen und importieren können. Dazu wird die vorhandene `PROJECTS.md` gelesen – das ist die lebende Doku der Projekte. Der Import zeigt an, welche Projekte existieren, ob sie Ralph-fähig sind, ob sie Docker/Proxy haben, und erlaubt sie als "beobachtet" in ralphi aufzunehmen, damit Ralph dort automatisch Loops starten kann.

### User Stories
- As a user, ich will auf ralphi sehen, welche Projekte im vibes-Ordner liegen
- As a user, ich will sehen, welche Projekte schon Ralph-Setup haben (AGENTS.md, specs/)
- As a user, ich will sehen, welche Projekte Docker und Proxy-Anbindung haben
- As a user, ich will ein Projekt per Klick "importieren" – d.h. in ralphos UI aufnehmen
- As a user, ich will den Status jedes Projekts sehen (Aktiv, Archiv, Referenz)

---

## Functional Requirements

### FR-1: PROJECTS.md als Datenquelle

**Acceptance Criteria:**
- [ ] ralphi liest `/Users/boot/Documents/vibes/PROJECTS.md` und parst die Projektliste
- [ ] Die Tabelle aus PROJECTS.md wird als Datenbasis genutzt
- [ ] Jedes Projekt bekommt eine Import-Karte mit: Name, Beschreibung, Status, Ralph, Docker, Proxy
- [ ] Der Import scannt auch tatsächlich das Dateisystem (Check ob Ordner existiert)

### FR-2: Dashboard-Ansicht "Projekte"

**Acceptance Criteria:**
- [ ] Neue Seite/Route `/ralphi/projects` zeigt alle erkannten Projekte
- [ ] Projekte sind gefiltert/grouped nach Status (Aktiv, Archiv, Referenz)
- [ ] Jede Projektkarte zeigt:
  - Projektname (als Link zum Ordner)
  - Beschreibung
  - Badges: Ralph? Docker? Proxy?
  - Import-Button (wenn noch nicht importiert)
  - Status-Indikator (Aktiv/Archiv/Referenz)
- [ ] Die Ansicht ist responsive und suchbar
- [ ] Es gibt einen "Refresh"-Button zum erneuten Scannen

### FR-3: Import-Funktion

**Acceptance Criteria:**
- [ ] Klick auf "Importieren" nimmt ein Projekt in ralphis beobachtete Liste auf
- [ ] Importierte Projekte werden persistent gespeichert (JSON-Datei oder ähnlich – leicht halten)
- [ ] Einmal importierte Projekte zeigen "Beobachtet" statt "Importieren"
- [ ] Man kann Projekte auch wieder entfernen (nicht mehr beobachten)
- [ ] Daten werden im Container gespeichert (Volume oder bind mount)

### FR-4: Detail-Ansicht pro Projekt

**Acceptance Criteria:**
- [ ] Klick auf ein Projekt öffnet eine Detailseite (`/ralphi/projects/{name}`)
- [ ] Detailseite zeigt:
  - Vollständige Infos aus PROJECTS.md
  - Ob Ralph-Setup existiert (AGENTS.md, specs/)
  - Docker-Compose-Status
  - Proxy-Route (falls vorhanden)
  - Button "Ralph Loop starten" (für importierte Projekte)
- [ ] Bei Projekten mit Ralph-Setup: Link zu den Specs

### FR-5: API-Endpoints (Backend)

**Acceptance Criteria:**
- [ ] `GET /api/projects` – Liste aller erkannten Projekte
- [ ] `GET /api/projects/{name}` – Detail-Infos zu einem Projekt
- [ ] `POST /api/projects/{name}/import` – Projekt importieren
- [ ] `POST /api/projects/{name}/unwatch` – Projekt nicht mehr beobachten
- [ ] `GET /api/projects/imported` – Liste der importierten Projekte
- [ ] API liefert JSON, Fehler als 4xx/5xx mit message

---

## Dependencies

- Zugriff auf `/Users/boot/Documents/vibes/` (bind mount im Container)
- `PROJECTS.md` existiert und ist aktuell

## Assumptions

- Der vibes-Ordner wird als Read-Only-Volume ins ralphi-Container gemountet
- PROJECTS.md wird regelmässig aktualisiert (ist bereits der Fall)
- Backend kann in Node.js, Python oder einfachem Shell-Script laufen (einfach halten)

---

## Completion Signal

### Implementation Checklist

- [x] Volume-Mount für `/Users/boot/Documents/vibes/` im docker-compose.yml ergänzt
- [x] Backend (API) implementiert: Projekte scannen, parsen, importieren
- [x] Frontend-Seite `/ralphi/projects` mit Projektliste und Karten
- [x] Import-Funktion mit persistenter Speicherung
- [x] Detail-Ansicht pro Projekt
- [x] Refresh/Rescan-Funktion
- [x] Filterung nach Status (Aktiv/Archiv/Referenz)
- [x] Badges für Ralph/Docker/Proxy

### Testing Requirements

#### Code Quality
- [ ] `docker compose config` gibt keinen Fehler
- [ ] Backend startet ohne Fehler
- [ ] Keine Sicherheitslücken (Read-Only-Mount, Path traversal check)

#### Functional Verification
- [ ] `GET /api/projects` liefert eine Liste von Projekten
- [ ] Die Liste enthält ralphi selbst, planed1, vibes-proxy u.a.
- [ ] `POST /api/projects/planed1/import` funktioniert
- [ ] `GET /api/projects/imported` zeigt importierte Projekte
- [ ] `/ralphi/projects` zeigt die GUI an
- [ ] Detailseite eines Projekts ist erreichbar
- [ ] "Nicht mehr beobachten" funktioniert

#### Visual Verification
- [ ] Projektkarten sehen sauber aus
- [ ] Badges sind farblich unterscheidbar
- [ ] Mobil-Ansicht funktioniert
- [ ] Keine horizontalen Scrollbars

#### Console/Network Check
- [ ] Keine 404er für API-Calls
- [ ] Keine JS-Fehler in der Konsole
- [ ] API-Responses sind valides JSON

### Iteration Instructions

Wenn etwas fehlschlägt:
1. Fehler identifizieren
2. Fixen
3. Docker neubauen (`docker compose build && docker compose up -d`)
4. Erneut prüfen
5. Commit (Push folgt nach GitHub-Setup)

**Only when ALL checks pass, output:** `<promise>DONE</promise>`

---

## Status: COMPLETE
<!-- NR_OF_TRIES: 1 -->
