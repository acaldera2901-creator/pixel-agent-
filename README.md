# Pixel Agent — Multi-Task Orchestrator

Un agente AI multi-task che coordina sub-agenti specializzati, visualizzabili in tempo reale attraverso **[pixel-agents](https://github.com/pablodelucca/pixel-agents)** — un'estensione VS Code che rappresenta gli agenti come personaggi pixel art in un ufficio virtuale.

## Struttura del Repository

```
pixel-agent-/
├── pixel-agents/        # Estensione VS Code (sorgente)
│   ├── src/             # TypeScript extension source
│   └── webview-ui/      # React UI
├── agent/               # Agente orchestratore multi-task
│   ├── src/
│   │   ├── index.ts          # Entry point CLI
│   │   ├── orchestrator.ts   # Orchestratore principale
│   │   ├── transcript.ts     # Scrittore JSONL per pixel-agents
│   │   └── agents/
│   │       ├── fileAgent.ts    # Operazioni su file
│   │       ├── searchAgent.ts  # Ricerca web
│   │       └── codeAgent.ts    # Analisi e generazione codice
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## Come Funziona

```
[Utente] → Orchestrator → Planner (Claude)
                       ↓
              ┌─────────────────┐
              │   Sub-Agents    │
              ├─────────────────┤
              │ 📁 fileAgent    │ → operazioni su file
              │ 🔍 searchAgent  │ → ricerca web
              │ 💻 codeAgent    │ → analisi codice
              └─────────────────┘
                       ↓
              Synthesiser → Risposta finale
```

Ogni delegazione viene scritta nel file JSONL → pixel-agents la visualizza come sub-agente nel pixel office.

## Prerequisiti

- Node.js 18+
- Una `ANTHROPIC_API_KEY` valida
- (Opzionale) VS Code con l'estensione pixel-agents installata

## Setup e Avvio

### 1. Installa le dipendenze

```bash
cd agent
npm install
```

### 2. Configura la API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 3. Avvia l'agente

**Modalità interattiva:**
```bash
npm run dev
```

**Modalità singolo task:**
```bash
npm run dev -- "Analizza il codice in src/ e scrivi un report sui potenziali bug"
```

### 4. Visualizza con pixel-agents

Quando l'agente parte, mostra il path del file JSONL:
```
📝 Transcript JSONL: /home/user/.claude/projects/home-user-pixel-agent-/abc123.jsonl
```

Per vedere il tuo agente in pixel art:

1. Apri VS Code
2. Installa e builda l'estensione pixel-agents (`cd pixel-agents && npm install && npm run compile`)
3. Premi `F5` per avviare l'estensione in modalità debug
4. Premi `Ctrl+Shift+P` → `Pixel Agents: Open View`
5. L'agente comparirà automaticamente quando rileva il file JSONL

## Esempi di Task

```
📁 File operations:
"Lista tutti i file TypeScript in questo progetto e analizza le loro dipendenze"

🔍 Ricerca web:
"Cerca le ultime novità su Claude 4 e fammi un riassunto"

💻 Codice:
"Genera una funzione TypeScript per il sorting merge sort con spiegazione"

🔄 Multi-task:
"Leggi il file package.json, cerca la versione più recente di ogni dipendenza, e genera un report con eventuali aggiornamenti disponibili"
```

## Architettura JSONL

L'agente scrive trascrizioni compatibili con il formato Claude Code in:
```
~/.claude/projects/<sanitized-cwd>/<session-uuid>.jsonl
```

Ogni riga è un oggetto JSON (formato Claude Code):
- `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Task",...}]}}` — delegazione a sub-agente
- `{"type":"user","message":{"content":[{"type":"tool_result",...}]}}` — risultato
- `{"type":"system","subtype":"turn_duration",...}` — fine turno (segnala idle a pixel-agents)

## Licenza

MIT
