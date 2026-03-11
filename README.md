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
- Un provider AI (vedi sotto — Ollama è gratuito!)
- (Opzionale) VS Code con l'estensione pixel-agents installata

## Scegliere il Provider AI

Il progetto supporta **4 provider**, configurabili via variabile d'ambiente `AI_PROVIDER`:

| Provider | Costo | Requisiti |
|----------|-------|-----------|
| `ollama` | **GRATUITO** (locale) | Installare Ollama + scaricare un modello |
| `gemini` | **Gratuito** (1M token/giorno) | Chiave API Google Gemini |
| `openai` | Pay-per-token | Chiave API OpenAI |
| `anthropic` | Pay-per-token | Chiave API Anthropic |

### Opzione 1: Ollama (gratuito, tutto locale)

```bash
# Installa Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Scarica un modello (scegli uno):
ollama pull llama3.2          # consigliato, buon equilibrio
ollama pull qwen2.5-coder     # ottimo per codice
ollama pull mistral           # veloce e leggero

# Configura e avvia
export AI_PROVIDER=ollama
export OLLAMA_MODEL=llama3.2   # o il modello che hai scaricato
cd agent && npm run dev
```

### Opzione 2: Google Gemini (free tier generoso)

```bash
# Ottieni la chiave su https://aistudio.google.com/apikey
export AI_PROVIDER=gemini
export GEMINI_API_KEY="..."
export GEMINI_MODEL=gemini-1.5-flash   # 1M token/giorno gratis
cd agent && npm run dev
```

### Opzione 3: OpenAI GPT

```bash
export AI_PROVIDER=openai
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL=gpt-4o-mini   # economico
cd agent && npm run dev
```

### Opzione 4: Anthropic Claude

```bash
export AI_PROVIDER=anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
cd agent && npm run dev
```

### Configurazione via file .env

In alternativa, copia il template e modifica:

```bash
cd agent
cp .env.example .env
# Modifica .env con il tuo editor
```

## Setup e Avvio

### 1. Installa le dipendenze

```bash
cd agent
npm install
```

### 2. Configura il provider (vedi sopra)

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

## GitHub Codespaces

Su GitHub Codespaces puoi configurare i secrets una volta sola:

1. GitHub → Settings → Codespaces → **Secrets**
2. Aggiungi i secrets che vuoi usare:
   - `AI_PROVIDER` = `gemini` (o il tuo provider preferito)
   - `GEMINI_API_KEY` = la tua chiave (oppure `OPENAI_API_KEY`, ecc.)
3. Autorizza il repository e apri un nuovo Codespace

> **Nota Ollama su Codespaces:** Ollama non è disponibile di default su Codespaces (richiede una macchina locale). Usa Gemini (free tier) come alternativa gratuita su Codespaces.

## Struttura Provider

```
agent/src/
├── config.ts                    # Lettura env vars
├── providers/
│   ├── index.ts                 # Interfaccia AIProvider + factory getProvider()
│   ├── anthropic.ts             # Adapter Anthropic (thinking + web_search)
│   └── openai-compatible.ts    # Adapter OpenAI / Ollama / Gemini
└── agents/
    ├── fileAgent.ts             # Usa provider.runAgent()
    ├── searchAgent.ts           # Usa web_search (Anthropic) o DuckDuckGo (altri)
    └── codeAgent.ts             # Usa provider.runAgent()
```

## Licenza

MIT
