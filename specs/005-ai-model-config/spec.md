# Specification: 005 AI Model Config

## Feature: Vollständige Provider-Konfiguration für AI-Modell (Default: Wyna/DeepSeek)

### Overview

Ralphi soll nicht nur einen Model-Namen speichern, sondern die vollständige Provider-Konfiguration inklusive Base-URL, API-Key und Model-Details. Standardmässig wird der lokale Wyna-DeepSeek-Endpoint verwendet (`http://100.85.99.127:9002/v1`), der bereits in pi konfiguriert ist.

### User Stories
- As a user, I want in ralphi zu sehen, welcher Provider und welches Modell verwendet wird
- As a user, I want Provider-URL, API-Key und Modell-Name konfigurieren zu können
- As a user, I want die Default-Konfiguration aus pi zu übernehmen (Wyna/DeepSeek)

---

## Functional Requirements

### FR-1: Settings mit vollständiger Provider-Konfiguration

**Acceptance Criteria:**
- [ ] Settings speichern: `provider.model`, `provider.baseUrl`, `provider.apiKey`, `provider.api`
- [ ] Default-Werte:
  ```json
  {
    "provider": {
      "name": "wyna",
      "baseUrl": "http://100.85.99.127:9002/v1",
      "apiKey": "not-needed",
      "api": "openai-completions",
      "model": "deepseek-v4-flash"
    }
  }
  ```
- [ ] Settings werden in `/data/settings.json` persistiert

### FR-2: API-Endpoints

**Acceptance Criteria:**
- [ ] `GET /api/settings` – Aktuelle Einstellungen (gesamtes Provider-Objekt)
- [ ] `PUT /api/settings` – Settings aktualisieren
- [ ] Bei erstem Start: Defaults aus der Spec werden geschrieben

### FR-3: UI: Settings-Seite

**Acceptance Criteria:**
- [ ] Route `/ralphi/settings` zeigt Einstellungs-Formular
- [ ] Felder: Provider Name, Model, Base URL, API Key, API Type
- [ ] Aktuelle Werte sind im Formular vorausgefüllt
- [ ] Button "Speichern" mit Erfolgsmeldung

### FR-4: Loop verwendet Provider-Konfiguration

**Acceptance Criteria:**
- [ ] Beim Loop-Start wird `CODEX_MODEL` auf `provider.model` gesetzt
- [ ] Loop-Log zeigt: `Provider: wyna | Model: deepseek-v4-flash`
- [ ] Loop-Karten und Detailseite zeigen Provider + Model an

### FR-5: Integration mit vorhandener pi-Konfiguration

**Acceptance Criteria:**
- [ ] Settings-Seite zeigt Hinweis: "Pi-Config: ~/.pi/agent/models.json"
- [ ] Beim ersten Start wird versucht, die pi-Config zu lesen
- [ ] Falls vorhanden, werden die pi-Provider-Einstellungen übernommen

---

## Dependencies

- Spec 003 (Loop-Management) – Loop starten mit Modell-Variable
- Zugriff auf `~/.pi/agent/models.json` (optional, für Default-Import)

## Assumptions

- Der Wyna-Endpoint ist vom ralphi-Container aus erreichbar (100.x.x.x im Tailnet)
- Falls nicht, kann der User die URL überschreiben
- `CODEX_MODEL=deepseek-v4-flash` wird als Umgebungsvariable gesetzt

---

## Completion Signal

### Implementation Checklist

- [ ] Backend: Settings mit Provider-Objekt (baseUrl, apiKey, model, api)
- [ ] Default: Wyna/DeepSeek-Konfiguration
- [ ] Frontend: Settings-Seite mit allen Provider-Feldern
- [ ] pi-Config als Default-Quelle (optional)
- [ ] Model/Provider-Anzeige in Loop-Detail und Loop-Liste

### Testing Requirements

#### Code Quality
- [ ] `docker compose config` gibt keinen Fehler
- [ ] Backend startet ohne Fehler

#### Functional Verification
- [ ] `GET /api/settings` liefert vollständige Provider-Config
- [ ] `PUT /api/settings` speichert neue Provider-Werte
- [ ] Default: `baseUrl: http://100.85.99.127:9002/v1`, `model: deepseek-v4-flash`

#### Visual Verification
- [ ] Settings-Seite zeigt alle Felder
- [ ] Loop-Detail zeigt Provider und Model

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
