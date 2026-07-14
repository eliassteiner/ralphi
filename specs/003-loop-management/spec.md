# Specification: 003 Loop-Management

## Feature: Ralph Loops über die Web-GUI starten, überwachen und verwalten

### Overview

Ralphi soll Ralph Wiggum Loops für importierte Projekte starten und überwachen können. Der User klickt in der Projekt-Detailansicht auf "Ralph Loop starten", und ralphi führt `ralph-loop.sh` (oder `ralph-loop-codex.sh`) im entsprechenden Projektverzeichnis aus. Der Output wird live gestreamt, Logs werden gespeichert, und der User sieht den Status (running, done, failed).

### User Stories
- As a user, ich will für ein importiertes Projekt einen Ralph Loop starten können
- As a user, ich will live sehen, was Ralph gerade macht (Log-Output)
- As a user, ich will sehen, ob ein Loop läuft, fertig ist oder fehlgeschlagen ist
- As a user, ich will laufende Loops abbrechen können
- As a user, ich will die Historie aller Loops sehen

---

## Functional Requirements

### FR-1: Loop starten

**Acceptance Criteria:**
- [ ] Button "Ralph Loop starten" in der Projekt-Detailansicht startet einen Loop
- [ ] Der Loop wird als Subprozess gestartet im Projektverzeichnis
- [ ] Es wird `./scripts/ralph-loop-codex.sh 1` (oder `ralph-loop.sh`) ausgeführt
- [ ] Mehrere Loops können parallel laufen (ein Loop pro Projekt)
- [ ] Versuch einen zweiten Loop fürs gleiche Projekt zu starten → Fehlermeldung "Loop läuft bereits"

### FR-2: Live-Logs via SSE (Server-Sent Events)

**Acceptance Criteria:**
- [ ] `GET /api/loops/{id}/stream` liefert SSE mit Live-Log-Output
- [ ] Der Client zeigt Logs in einem Terminal-ähnlichen Fenster an
- [ ] Neue Zeilen erscheinen automatisch (kein manuelles Refreshen)
- [ ] Logs sind farbig (stderr rot, stdout normal)
- [ ] Verbindung wird geschlossen wenn der Loop endet

### FR-3: Loop-Status-API

**Acceptance Criteria:**
- [ ] `GET /api/loops` – Liste aller Loops (aktiv + historisch)
- [ ] `GET /api/loops/{id}` – Details zu einem Loop
- [ ] `POST /api/projects/{name}/loop/start` – Loop starten
- [ ] `POST /api/loops/{id}/stop` – Loop abbrechen
- [ ] `GET /api/loops/{id}/logs` – Komplette Logs abrufen
- [ ] Jeder Loop hat: id, projectId, status (running/done/failed/stopped), startedAt, finishedAt, exitCode

### FR-4: UI: Live-Log-Ansicht

**Acceptance Criteria:**
- [ ] Nach Klick auf "Ralph Loop starten" öffnet sich eine Log-Ansicht
- [ ] Log-Ansicht ist ein Terminal-ähnliches Fenster (monospace, schwarzer Hintergrund)
- [ ] Auto-scrollt bei neuem Output
- [ ] Button "Abbrechen" um den Loop zu stoppen
- [ ] Button "Schliessen" um die Log-Ansicht zu schliessen (Loop läuft im Hintergrund weiter)
- [ ] Status-Badge zeigt live ob der Loop läuft

### FR-5: UI: Loop-Historie

**Acceptance Criteria:**
- [ ] Projekt-Detailseite zeigt Historie der Loops für dieses Projekt
- [ ] Jeder Eintrag zeigt: Datum, Status, Dauer, Exit-Code
- [ ] Klick auf einen historischen Eintrag öffnet die Logs (Read-only)
- [ ] Seite `/ralphi/loops` zeigt alle Loops aller Projekte

### FR-6: Sicherheit

**Acceptance Criteria:**
- [ ] Loops laufen nur für Projekte die tatsächlich auf der Festplatte existieren
- [ ] Kein Path-Traversal beim Projektnamen
- [ ] Subprozesse werden mit timeout gestartet (max 24h)
- [ ] Wenn der ralphi-Container neustartet, werden laufende Loops als "failed" markiert

---

## Dependencies

- `scripts/ralph-loop-codex.sh` existiert in den importierten Projekten
- vibes-Ordner ist Read-Only gemountet (Loops schreiben in die Projekte, also braucht's Write-Zugriff)

## Assumptions

- Die importierten Projekte haben tatsächlich Ralph-Setup (scripts/)
- Fürs Starten braucht ralphi Write-Zugriff auf das Projektverzeichnis
- Der Pfad zum Projekt ist `/vibes/{directoryName}` im Container
- Codex CLI (`codex`) ist im ralphi-Container verfügbar (oder wird per Host-Exec ausgeführt)

---

## Completion Signal

### Implementation Checklist

- [ ] Backend: Loop-Manager mit Subprozess-Steuerung
- [ ] SSE-Streaming für Live-Logs
- [ ] CRUD-API für Loops (start, stop, list, detail, logs)
- [ ] Frontend: Log-Ansicht (Terminal-Stil, monospace, auto-scroll)
- [ ] Frontend: Loop-Historie pro Projekt
- [ ] Frontend: Loop starten/stoppen aus Projekt-Detail
- [ ] Persistenz: Loop-Historie in `/data/loops.json`

### Testing Requirements

#### Code Quality
- [ ] `docker compose config` gibt keinen Fehler
- [ ] Backend startet ohne Fehler
- [ ] Subprozesse werden korrekt gemanagt (keine Zombie-Prozesse)

#### Functional Verification
- [ ] `POST /api/projects/planed1/loop/start` startet einen Loop
- [ ] `GET /api/loops` zeigt den laufenden Loop
- [ ] SSE-Endpoint liefert Event-Stream
- [ ] `POST /api/loops/{id}/stop` stoppt den Loop
- [ ] Nach Loop-Ende: Status ist "done" oder "failed"
- [ ] Zweiter Start für gleiches Projekt wird abgewiesen
- [ ] Loop-Historie bleibt nach Neustart erhalten

#### Visual Verification
- [ ] Log-Ansicht sieht aus wie ein Terminal
- [ ] Auto-scroll funktioniert
- [ ] "Abbrechen"-Button ist sichtbar und funktioniert
- [ ] Status-Badge zeigt korrekten Zustand

#### Console/Network Check
- [ ] SSE-Verbindung wird sauber auf- und abgebaut
- [ ] Keine 404er
- [ ] Keine Speicherlecks bei langen SSE-Verbindungen

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
