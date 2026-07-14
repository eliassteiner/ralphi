# Specification: 006 Projekt-Dashboard

## Feature: Vollständiges Projekt-Dashboard mit Storyboard, Editor und AI-Terminal

### Overview

Ralphi wird zum zentralen Arbeitsplatz für Ralph Wiggum Projekte. Jedes importierte Projekt bekommt ein Dashboard mit:

1. **Storyboard** – Features/Stories definieren, priorisieren und abarbeiten
2. **File-Editor** – Einfache Oberfläche um Specs, Prompts und Configs zu erstellen/bearbeiten
3. **AI-Terminal** – Integriertes Terminal um direkt mit der AI zu kommunizieren (via konfiguriertem Provider)

Alles in einer Seite: links das Board, rechts der Editor, unten das Terminal.

### User Stories
- As a user, ich will ein Dashboard pro Projekt mit allen Features/Stories sehen
- As a user, ich will Stories als "To Do", "In Arbeit" und "Done" organisieren (Kanban)
- As a user, ich will Spec-Dateien direkt im Browser öffnen und bearbeiten
- As a user, ich will ein Terminal, wo ich mit der AI chatten kann
- As a user, ich will dass das AI-Terminal den konfigurierten Provider verwendet (Wyna/DeepSeek)
- As a user, ich will eine Idee eingeben und per Knopfdruck als Spec aufbereiten lassen
- As a user, ich will pro Projekt einen eigenen Chat-Kontext

---

## Functional Requirements

### FR-1: Projekt-Dashboard

**Acceptance Criteria:**
- [x] Route `/ralphi/projects/{id}` zeigt das Dashboard (ersetzt die aktuelle Detailseite)
- [x] Dashboard-Layout: 3-Spalten (Storyboard | Editor | Sidebar)
- [x] Oben: Projekt-Name, Status, Ralph/Docker/Proxy Badges
- [x] Linke Spalte: Storyboard (Kanban-ähnlich)
- [x] Rechte Spalte: Datei-Browser + Editor
- [x] Unten: AI-Terminal (einklappbar)

### FR-2: Storyboard (Kanban)

**Acceptance Criteria:**
- [x] Stories/Features als Karten in 3 Spalten: "Offen", "In Arbeit", "Fertig"
- [x] Jede Story hat: Titel, Beschreibung, Tags, Priorität
- [x] Klicken auf eine Story öffnet sie im Editor
- [x] Story kann per Button oder Drag in andere Spalte verschoben werden
- [x] "Neue Story"-Button erstellt eine neue Story
- [x] Stories werden als Spec-Dateien im Projekt gespeichert (`specs/{id}/spec.md`)
- [x] Lösch-Button pro Story-Karte (mit Bestätigung)
- [x] Nach Löschen: Spec-Datei wird vom Dateisystem entfernt
- [x] Nach Löschen: Dashboard wird sofort aktualisiert (Spec taucht nicht wieder auf)
- [x] Löschen funktioniert auch für Specs in importierten Projekten

### FR-3: File-Editor

**Acceptance Criteria:**
- [x] Rechte Spalte zeigt Datei-Browser für das Projekt
- [x] Klick auf eine Datei öffnet sie im Editor
- [x] Editor ist ein Textarea mit monospace Font
- [x] Unterstützte Dateien: `.md`, `.json`, `.sh`, `.yml`, `.yaml`, `.toml`
- [x] Button "Speichern" schreibt die Datei zurück
- [x] Button "Neue Datei" erstellt eine neue Datei
- [x] Spec-Dateien haben einen Ready-Checkbox (setzt Status auf done)

### FR-4: AI-Terminal (pro Projekt)

**Acceptance Criteria:**
- [x] Unterer Bereich: Terminal-ähnliches Chat-Fenster
- [x] Kann ein-/ausgeklappt werden (Toggle-Button)
- [x] Text-Input am unteren Rand, Nachrichten erscheinen darüber
- [x] Nachrichten werden an die konfigurierte AI-API gesendet:
  - Base URL: aus Settings (Default: `http://100.85.99.127:9002/v1`)
  - Model: aus Settings (Default: `deepseek-v4-flash`)
  - API Key: aus Settings
- [x] Nachrichten werden im Chat-Verlauf gespeichert (pro Projekt)
- [x] Antworten werden gestreamt (SSE-ähnlich, zeichenweise)
- [x] System-Prompt kann im Terminal gesetzt werden
- [x] Jedes Projekt hat seinen eigenen Chat-Verlauf
- [x] Beim Wechsel des Projekts wird der Chat-Verlauf mitgenommen

### FR-5: API-Chat-Endpoint

**Acceptance Criteria:**
- [x] `POST /api/chat` – Sendet Nachricht an AI (body: { messages: [...], systemPrompt: "" })
- [x] Antwort wird via SSE gestreamt (`text/event-stream`)
- [x] Verwendet den konfigurierten Provider (baseUrl, apiKey, model)
- [x] Implementiert OpenAI Chat Completions API (`/v1/chat/completions`)
- [x] Streamt die Antwort zeichenweise (`chunk.choices[0].delta.content`)
- [x] Fehler werden als SSE-error Events gemeldet
- [x] Timeout nach 60s

### FR-6: Dashboard als Startseite

**Acceptance Criteria:**
- [x] `/ralphi/` zeigt die Projekt-Übersicht (SPA)
- [x] Wenn kein Projekt ausgewählt: Projekt-Übersicht
- [x] Wenn ein Projekt ausgewählt: Projekt-Dashboard

### FR-7: Gegenlesen-Button (Idea → Spec)

**Acceptance Criteria:**
- [x] Im Dashboard gibt es einen "Idea→Spec"-Button
- [x] Klick öffnet ein Textfeld für die Idee (Rohtext)
- [x] Klick auf "Gegenlesen" sendet die Idee an die AI mit Prompt:
  "Erstelle eine Ralph-Wiggum-Spec aus dieser Idee: Format mit Titel, Beschreibung, Acceptance Criteria, Completion Signal"
- [x] Die AI-Antwort wird als neue Spec-Datei gespeichert
- [x] Nach Erstellung: Spec wird im Editor geöffnet
- [x] User kann die Spec weiter bearbeiten
- [x] Spec kann mit Ready-Checkbox als "done" markiert werden

### FR-8: Layout-Fix (responsive Dashboard)

**Acceptance Criteria:**
- [x] Dashboard-Layout ist responsive
  - Desktop (≥1024px): 3 Spalten (Storyboard | Editor | Sidebar)
  - Tablet (768-1023px): 2 Spalten (Storyboard+Editor gestapelt | Sidebar)
  - Mobile (<768px): 1 Spalte (alles untereinander)
- [x] Kanban-Board auf Mobile: 3 Spalten bleiben, aber schmaler
- [x] Terminal ist auf Mobile standardmässig eingeklappt
- [x] Editor auf Mobile: File-Browser und Editor untereinander (nicht nebeneinander)
- [x] Kein horizontaler Overflow
- [x] Buttons sind auf Mobile full-width

---

## Dependencies

- Spec 005 (AI Model Config) – Provider-Einstellungen
- Spec 004 (Spec-Editor) – Spec-Datei-Struktur
- Spec 002 (Projekt-Import) – Importierte Projekte
- Der Wyna-Endpoint muss vom ralphi-Container aus erreichbar sein

## Assumptions

- Der AI-Provider ist ein OpenAI-kompatibler Endpoint (`/v1/chat/completions`)
- Der konfigurierte Provider (Default: `http://100.85.99.127:9002/v1`) antwortet
- Antworten werden als Server-Sent Events gestreamt
- Das Terminal ist eine einfache Chat-Oberfläche, kein vollständiges TTY

---

## Completion Signal

### Implementation Checklist

- [x] Backend: Chat-API mit Projekt-Kontext (projektbezogener Chat)
- [x] Backend: Idea→Spec Endpoint (AI generiert Spec aus Idee)
- [x] Frontend: Dashboard-Layout (responsive, 3/2/1 Spalten)
- [x] Frontend: "Idea→Spec"-Button mit Textfeld
- [x] Frontend: "Ready"-Checkbox pro Spec
- [x] Frontend: Pro-Projekt-Chat (Chat-Verlauf pro Projekt)
- [x] Integration: Terminal verwendet konfigurierten Provider
- [x] Docker-Neubau und Deployment

### Testing Requirements

#### Code Quality
- [x] `node --check server.js` kein Syntax-Fehler
- [x] `docker compose config` kein Fehler

#### Functional Verification
- [x] `POST /api/chat` streamt eine Antwort
- [x] `POST /api/chat` akzeptiert `projectId` für Projekt-Kontext
- [x] `POST /api/specs/from-idea` generiert Spec aus Idee
- [x] `/ralphi/projects/{id}` zeigt das Dashboard
- [x] Dashboard-Layout ist responsive (Desktop 3, Tablet 2, Mobile 1 Spalte)
- [x] Idea→Spec-Button funktioniert
- [x] Story kann erstellt und verschoben werden
- [x] Datei kann geöffnet und bearbeitet werden
- [x] Terminal zeigt Chat-Nachrichten an
- [x] Terminal verwendet Provider aus Settings
- [x] Chat-Verlauf ist pro Projekt getrennt

#### Visual Verification
- [x] Dashboard-Layout ist sauber (3 Spalten + Terminal)
- [x] Terminal ist einklappbar
- [x] Mobile-Ansicht funktioniert (kein Overflow, sauberes Stacking)
- [x] Editor ist monospace und lesbar
- [x] Idea→Spec-Button ist sichtbar und verständlich

### Iteration Instructions

Wenn etwas fehlschlägt:
1. Fehler identifizieren
2. Fixen
3. Docker neubauen
4. Erneut prüfen
5. Commit und push

**Only when ALL checks pass, output:** `<promise>DONE</promise>`

---

## Status: COMPLETE

### Summary

Vollständiges Projekt-Dashboard mit Storyboard (Kanban mit 3 Spalten, Drag&Drop, Löschen), File-Editor (Browser + Textarea), AI-Terminal (Chat mit SSE-Streaming, System-Prompt, Projekt-Kontext), Idea→Spec (AI-generierte Specs), responsive Layout (3/2/1 Spalten). Verwendet den konfigurierten Provider (Wyna/DeepSeek).

## Status: COMPLETE
<!-- NR_OF_TRIES: 3 -->
