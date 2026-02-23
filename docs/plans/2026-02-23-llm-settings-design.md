# LLM Settings Management Design

Date: 2026-02-23

## Context

Lysmata manages local OpenClaw bots that share a single `~/.openclaw/openclaw.json` config file. The current codebase has partial LLM config support (per-bot `llm_config` in SQLite, `openclaw-config-file.ts` that only handles `agents.defaults.model`), but does not cover `models.providers` management and has no dedicated UI for global LLM settings.

**Scope:** Local bots only. Remote bots are managed by their own operators.

## Goal

A dedicated Settings page in Lysmata that lets users manage:
1. Custom LLM providers (`models.providers`) — add, edit, delete providers with baseUrl, apiKey, and model list
2. Default model selection (`agents.defaults.model`) — choose primary model and fallbacks from configured providers

## Architecture

```
Frontend (React)
  └── SettingsPage (/settings)
        ├── ProviderList
        │     ├── ProviderCard × N  →  ProviderFormDrawer (add/edit)
        │     └── [+ Add Provider]  →  ProviderFormDrawer
        └── DefaultModelSection
              ├── Primary model dropdown  (aggregated from all providers)
              └── Fallbacks multi-select

Backend (Hono sidecar)
  └── GET  /settings/llm   — read openclaw.json, return providers + defaultModel
  └── PUT  /settings/llm   — write providers + defaultModel back to openclaw.json

Core
  └── openclaw-config-file.ts  (extended)
        ├── readProvidersConfig()    — reads models.providers
        └── updateProvidersConfig()  — writes models.providers + syncs agents.defaults.models alias table
```

## API Contract

### GET /settings/llm

```typescript
{
  providers: {
    [providerKey: string]: {
      baseUrl: string;
      apiKey: string;
      api: string;           // e.g. "openai-completions"
      models: Array<{
        id: string;
        name: string;
        contextWindow?: number;
        maxTokens?: number;
      }>
    }
  },
  defaultModel: {
    primary: string;         // e.g. "zenmux-ai/anthropic/claude-sonnet-4.6"
    fallbacks: string[];
  }
}
```

### PUT /settings/llm

Accepts the same shape. Performs a full replacement of:
- `models.providers`
- `agents.defaults.model`
- `agents.defaults.models` (auto-synced alias table from providers)

All other fields in `openclaw.json` are preserved.

## Data Flow

1. User opens Settings page → frontend calls `GET /settings/llm`
2. User edits a provider or changes default model
3. Frontend calls `PUT /settings/llm` with full updated payload
4. Sidecar calls `updateProvidersConfig()` → writes `~/.openclaw/openclaw.json`
5. OpenClaw picks up changes on next restart

## Database

- `bots.llm_config` column: retained in schema to avoid migration risk, but no longer written or read by the UI
- `BotFormDrawer`: remove the `llm_config` form fields

## Out of Scope

- MCP and Skills configuration (separate future feature)
- Remote bot configuration
- `tools`, `gateway`, `channels` config management
- Live reload of OpenClaw without restart
