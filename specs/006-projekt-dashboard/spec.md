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

---

## Functional Requirements

### FR-1: Projekt-Dashboard

**Acceptance Criteria:**
- [ ] Route `/ralphi/projects/{id}` zeigt das Dashboard (ersetzt die aktuelle Detailseite)
- [ ] Dashboard-Layout: 3-Spalten (Storyboard | Editor | optional)
- [ ] Oben: Projekt-Name, Status, Ralph/Docker/Proxy Badges
- [ ] Linke Spalte: Storyboard (Kanban-ähnlich)
- [ ] Rechte Spalte: Datei-Browser + Editor
- [ ] Unten: AI-Terminal (einklappbar)

### FR-2: Storyboard (Kanban)

**Acceptance Criteria:**
- [ ] Stories/Features als Karten in 3 Spalten: "Offen", "In Arbeit", "Fertig"
- [ ] Jede Story hat: Titel, Beschreibung, Tags, Priorität
- [ ] Klicken auf eine Story öffnet sie im Editor
- [ ] Story kann per Button oder Drag in andere Spalte verschoben werden
- [ ] "Neue Story"-Button erstellt eine neue Story
- [ ] Stories werden als Spec-Dateien im Projekt gespeichert (`specs/{id}/spec.md`)

### FR-3: File-Editor

**Acceptance Criteria:**
- [ ] Rechte Spalte zeigt Datei-Browser für das Projekt
- [ ] Klick auf eine Datei öffnet sie im Editor
- [ ] Editor ist ein Textarea mit monospace Font
- [ ] Unterstützte Dateien: `.md`, `.json`, `.sh`, `.yml`, `.yaml`, `.toml`
- [ ] Button "Speichern" schreibt die Datei zurück
- [ ] Button "Neue Datei" erstellt eine neue Datei
- [ ] Spec-Dateien haben einen "Als done markieren"-Button (setzt Tag)

### FR-4: AI-Terminal

**Acceptance Criteria:**
- [ ] Unterer Bereich: Terminal-ähnliches Chat-Fenster
- [ ] Kann ein-/ausgeklappt werden (Toggle-Button)
- [ ] Text-Input am unteren Rand, Nachrichten erscheinen darüber
- [ ] Nachrichten werden an die konfigurierte AI-API gesendet:
  - Base URL: aus Settings (Default: `http://100.85.99.127:9002/v1`)
  - Model: aus Settings (Default: `deepseek-v4-flash`)
  - API Key: aus Settings
- [ ] Nachrichten werden im Chat-Verlauf gespeichert (pro Session)
- [ ] Antworten werden gestreamt (SSE-ähnlich, zeichenweise)
- [ ] System-Prompt kann im Terminal gesetzt werden (z.B. "Du hilfst mir Specs zu schreiben")

### FR-5: API-Chat-Endpoint

**Acceptance Criteria:**
- [ ] `POST /api/chat` – Sendet Nachricht an AI (body: { messages: [...], systemPrompt: "" })
- [ ] Antwort wird via SSE gestreamt (`text/event-stream`)
- [ ] Verwendet den konfigurierten Provider (baseUrl, apiKey, model)
- [ ] Implementiert OpenAI Chat Completions API (`/v1/chat/completions`)
- [ ] Streamt die Antwort zeichenweise (`chunk.choices[0].delta.content`)
- [ ] Fehler werden als SSE-error Events gemeldet
- [ ] Timeout nach 60s

### FR-6: Dashboard als Startseite

**Acceptance Criteria:**
- [ ] `/ralphi/` zeigt nach Login das Dashboard
- [ ] Wenn kein Projekt ausgewählt: Projekt-Übersicht (aktuell)
- [ ] Wenn ein Projekt ausgewählt: Projekt-Dashboard

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

- [ ] Backend: Chat-API (`POST /api/chat` mit SSE-Streaming)
- [ ] Backend: File-Editor API (Dateien lesen/schreiben im Projekt)
- [ ] Frontend: Dashboard-Layout (3 Spalten + Terminal unten)
- [ ] Frontend: Storyboard (Kanban mit Offen/Arbeit/Fertig)
- [ ] Frontend: File-Editor mit Datei-Browser
- [ ] Frontend: AI-Terminal (Chat-Fenster)
- [ ] Integration: Terminal verwendet konfigurierten Provider
- [ ] Docker-Neubau und Deployment

### Testing Requirements

#### Code Quality
- [ ] `node --check server.js` kein Syntax-Fehler
- [ ] `docker compose config` kein Fehler

#### Functional Verification
- [ ] `POST /api/chat` streamt eine Antwort
- [ ] `/ralphi/projects/{id}` zeigt das Dashboard
- [ ] Story kann erstellt und verschoben werden
- [ ] Datei kann geöffnet und bearbeitet werden
- [ ] Terminal zeigt Chat-Nachrichten an
- [ ] Terminal verwendet Provider aus Settings

#### Visual Verification
- [ ] Dashboard-Layout ist sauber (3 Spalten + Terminal)
- [ ] Terminal ist einklappbar
- [ ] Mobile-Ansicht funktioniert
- [ ] Editor ist monospace und lesbar

### Iteration Instructions

Wenn etwas fehlschlägt:
1. Fehler identifizieren
2. Fixen
3. Docker neubauen
4. Erneut prüfen
5. Commit und push

**Only when ALL checks pass, output:** `<promise>DONE</promise>`

---

## Status: PENDING
<!-- NR_OF_TRIES: 0 -->
