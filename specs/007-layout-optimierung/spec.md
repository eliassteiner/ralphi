# Specification: 007 Layout-Optimierung

## Feature: Übersichtlicheres Projekt-Dashboard mit weniger Verschachtelung

### Overview

Das aktuelle Dashboard ist zu verschachtelt (3 Spalten, davon eine mit 3 Kanban-Spalten, dazu File-Browser + Editor + Sidebar). Ziel: Aufgeräumtes, luftiges Layout das auf einen Blick zeigt was wichtig ist.

Neues Layout:
- **Kompakte Projekt-Leiste** oben (Name, Status, Aktionen – keine separate Sidebar mehr)
- **2 Hauptspalten**: Links Storyboard (breit), Rechts Editor (schmaler)
- **Sidebar-Info** wird in die Projekt-Leiste integriert oder als Tabs
- **AI-Terminal** unten (einklappbar)

### User Stories
- As a user, ich will nicht 3 verschachtelte Spalten + Sidebar + Terminal sehen
- As a user, ich will das Storyboard gross sehen (Kanban-Spalten mit Platz)
- As a user, ich will Projekt-Info kompakt oben, nicht als Sidebar

---

## Functional Requirements

### FR-1: Vereinfachtes Layout

**Acceptance Criteria:**
- [x] Projekt-Dashboard hat 2 Hauptspalten: Storyboard (links, breit) + Editor (rechts)
- [x] Keine separate Sidebar mehr (Projekt-Info wandert in Projekt-Leiste)
- [x] Kompakte Projekt-Leiste: ← Projekte, Name, Badges, Aktionen, Provider-Pill in einer Reihe
- [x] AI-Terminal bleibt unten (einklappbar)

### FR-2: Projekt-Leiste

**Acceptance Criteria:**
- [x] Schmale Leiste oben (kein eigener Section-Block)
- [x] Enthält: Projektname, Status-Badge, Ralph/Docker/Proxy Badges, Loop starten/import Button
- [x] Provider-Info als kleiner Pill-Hinweis
- [x] "← Projekte" Link in der Leiste (kein separater Section-Block)

### FR-3: Storyboard breiter

**Acceptance Criteria:**
- [x] Storyboard nimmt linke Hälfte (ca 60% der Breite)
- [x] Kanban-Spalten haben genug Platz (keine überfüllten Karten)
- [x] Spalten-Header kompakt (Titel + Anzahl als Circle-Badge)
- [x] Story-Karten: kompakt, Titel + Beschreibung + Actions

### FR-4: Editor schmaler

**Acceptance Criteria:**
- [x] Editor rechts (ca 40% der Breite)
- [x] File-Browser als kompakte Tabs (Jira-Stil)
- [x] Editor-Textarea nutzt den verfügbaren Platz
- [x] "Idea→Spec" und "Neue Story" Buttons im Storyboard-Header

### FR-5: Responsive

**Acceptance Criteria:**
- [x] Desktop (≥1024px): 2 Spalten (60/40)
- [x] Tablet (<1024px): untereinander (Storyboard über Editor)
- [x] Mobile (<760px): 1 Spalte, alles untereinander
- [x] Kein horizontaler Overflow
- [x] Terminal auf Mobile eingeklappt

---

## Dependencies

- Spec 006 (Projekt-Dashboard) – aktuelles Layout

## Assumptions

- Kein neues Backend nötig, nur CSS + kleine HTML-Anpassungen
- Sidebar-Inhalt wird in die Kopfzeile integriert

---

## Completion Signal

### Implementation Checklist

- [x] CSS: 2-Spalten-Layout statt 3 (60/40)
- [x] CSS: Projekt-Leiste oben (kompakt, sticky)
- [x] CSS: Storyboard breiter, Kanban-Karten kompakter
- [x] CSS: Editor schmaler, File-Tabs kompakt (Jira-Stil)
- [x] HTML: Sidebar-Inhalt in Projekt-Leiste integriert
- [x] HTML: "← Projekte" Link in der Projekt-Leiste
- [x] Responsive Breakpoints (Desktop/Tablet/Mobile)
- [x] Build + Deployment

### Testing Requirements

#### Code Quality
- [x] `docker compose config` kein Fehler

#### Visual Verification
- [x] Layout ist sauber und nicht verschachtelt (2 Spalten)
- [x] Storyboard hat genug Platz (60%)
- [x] Editor funktioniert mit File-Tabs
- [x] Projekt-Leiste zeigt alle wichtigen Infos
- [x] Mobile-Ansicht ohne Overflow

### Iteration Instructions

Wenn etwas fehlschlägt:
1. Fixen
2. Docker neubauen
3. Prüfen
4. Commit

**Only when ALL checks pass, output:** `<promise>DONE</promise>`

---

## Status: COMPLETE

### Summary

Jira-inspiriertes Redesign des Projekt-Dashboards:
- Full-Width statt max-width
- Projekt-Leiste oben (sticky) mit Name, Badges, Aktionen, Provider-Pill
- 2 Hauptspalten: Storyboard (links, ~60%) + Editor (rechts, ~40%)
- File-Tabs statt File-Browser-Liste (Jira-Stil)
- Kompaktere Kanban-Karten und Buttons (button-sm)
- Keine separate Sidebar mehr
- Responsive: 2 Spalten Desktop, untereinander auf Tablet/Mobile
- AI-Terminal unten, einklappbar

## Status: COMPLETE
<!-- NR_OF_TRIES: 1 -->
