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
- [ ] Projekt-Dashboard hat 2 Hauptspalten: Storyboard (links, breit) + Editor (rechts, schmaler)
- [ ] Keine separate Sidebar mehr (Projekt-Info, Loop-Historie etc. wandert nach oben)
- [ ] Kompakte Projekt-Leiste: Name, Badges (Ralph/Docker/Proxy), Aktionen, Provider in einer Reihe
- [ ] AI-Terminal bleibt unten (einklappbar)

### FR-2: Projekt-Leiste

**Acceptance Criteria:**
- [ ] Schmale Leiste oben (kein eigener Section-Block)
- [ ] Enthält: Projektname, Status-Badge, Ralph/Docker/Proxy Badges, Loop starten/import Button
- [ ] Provider-Info als kleiner Hinweis
- [ ] Kein separates "Back to projects" – das ist im Navi

### FR-3: Storyboard breiter

**Acceptance Criteria:**
- [ ] Storyboard nimmt linke Hälfte (ca 60% der Breite)
- [ ] Kanban-Spalten haben genug Platz (keine überfüllten Karten)
- [ ] Spalten-Header kompakt (Titel + Anzahl)
- [ ] Story-Karten: kompakt, Titel + Beschreibung + Actions in einer Reihe

### FR-4: Editor schmaler

**Acceptance Criteria:**
- [ ] Editor rechts (ca 40% der Breite)
- [ ] File-Browser als kompakte Liste (keine extra Section)
- [ ] Editor-Textarea nutzt den verfügbaren Platz
- [ ] "Idea→Spec" und "Neue Story" Buttons im Storyboard-Header

### FR-5: Responsive

**Acceptance Criteria:**
- [ ] Desktop (≥1024px): 2 Spalten (60/40)
- [ ] Tablet (768-1023px): untereinander (Storyboard über Editor)
- [ ] Mobile (<768px): 1 Spalte, alles untereinander
- [ ] Kein horizontaler Overflow
- [ ] Terminal auf Mobile eingeklappt

---

## Dependencies

- Spec 006 (Projekt-Dashboard) – aktuelles Layout

## Assumptions

- Kein neues Backend nötig, nur CSS + kleine HTML-Anpassungen
- Sidebar-Inhalt wird in die Kopfzeile integriert

---

## Completion Signal

### Implementation Checklist

- [ ] CSS: 2-Spalten-Layout statt 3 (60/40)
- [ ] CSS: Projekt-Leiste oben (kompakt)
- [ ] CSS: Storyboard breiter, Kanban-Karten kompakter
- [ ] CSS: Editor schmaler, File-Browser kompakt
- [ ] HTML: Sidebar-Inhalt in Kopfzeile integriert
- [ ] HTML: "Back to projects" entfernt (Navi reicht)
- [ ] Responsive Breakpoints (Desktop/Tablet/Mobile)
- [ ] Build + Deployment

### Testing Requirements

#### Code Quality
- [ ] `docker compose config` kein Fehler

#### Visual Verification
- [ ] Layout ist sauber und nicht verschachtelt
- [ ] Storyboard hat genug Platz
- [ ] Editor funktioniert trotz schmalerer Spalte
- [ ] Projekt-Leiste zeigt alle wichtigen Infos
- [ ] Mobile-Ansicht ohne Overflow

### Iteration Instructions

Wenn etwas fehlschlägt:
1. Fixen
2. Docker neubauen
3. Prüfen
4. Commit

**Only when ALL checks pass, output:** `<promise>DONE</promise>`

---

## Status: PENDING
<!-- NR_OF_TRIES: 0 -->
