# mcp-ai-connector

A single [MCP](https://modelcontextprotocol.io) server that lets any MCP-capable
agent (Claude Code, OpenAI Codex CLI, Gemini CLI, GitHub Copilot Chat) call out
to **Claude, Codex/ChatGPT, Gemini, DeepSeek, Ollama** and a **GitHub Copilot
bridge** as plain tools. Register it once in each client and every client
gains the same seven tools:

- `ask_claude`
- `ask_codex`
- `ask_gemini`
- `ask_deepseek`
- `ask_ollama`
- `ask_copilot`
- `omniroute` — **the combo tool.** Fans one prompt out to every connected
  provider in parallel and synthesizes a single reconciled combo answer from
  whichever responses succeeded (plus every individual answer, for
  comparison). Use this instead of picking one `ask_*` tool when you want a
  cross-model second opinion or one merged best answer.
  - `providers`: optional subset, e.g. `["claude", "codex"]` — defaults to all.
  - `combine`: set `false` to skip synthesis and just get the raw fan-out.
  - `synthesizer`: which provider writes the combo answer (default: first
    successful provider in `claude → codex → gemini → deepseek → copilot → ollama` order).
- `list_connectors` — reports which providers are configured/reachable

> **Why an "ask_copilot" bridge?** GitHub Copilot has no public chat-completions
> API for arbitrary prompts. `ask_copilot` calls
> [GitHub Models](https://docs.github.com/en/github-models) (`models.github.ai`)
> instead, authenticated with the same `GITHUB_TOKEN` — the closest first-party
> equivalent for programmatic access.

## Setup

```bash
cd mcp-ai-connector
npm install
```

Set whichever API keys you have as environment variables (any provider
without a key simply reports `NOT CONFIGURED` instead of failing the whole
server):

| Variable | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | `ask_claude` |
| `OPENAI_API_KEY` | `ask_codex` |
| `GEMINI_API_KEY` | `ask_gemini` |
| `DEEPSEEK_API_KEY` | `ask_deepseek` |
| `GITHUB_TOKEN` | `ask_copilot` (GitHub Models) |
| `OLLAMA_HOST` | `ask_ollama` (defaults to `http://localhost:11434`, no key needed) |

Verify it starts and reports status correctly:

```bash
node smoke-test.mjs
```

## Registering it with each client

- **Claude Code** — already wired up via `.mcp.json` at the repo root. Restart
  Claude Code (or run `/mcp` to reload) and the tools above appear.
- **Codex CLI** — merge [`examples/codex-config.toml`](examples/codex-config.toml)
  into `~/.codex/config.toml`.
- **Gemini CLI** — merge [`examples/gemini-settings.json`](examples/gemini-settings.json)
  into `~/.gemini/settings.json`.
- **GitHub Copilot Chat (VS Code)** — copy
  [`examples/vscode-mcp.json`](examples/vscode-mcp.json) to `.vscode/mcp.json`.
- **Ollama / DeepSeek** — these are backends the server calls, not MCP clients;
  nothing to register, just make sure `ollama serve` is running locally and/or
  `DEEPSEEK_API_KEY` is set.

Once registered everywhere, any one of these agents can ask any of the
others' underlying models for a second opinion, delegate a sub-task to a
cheaper/local model (Ollama), or compare answers across providers — all
through the same tool interface.

## Troubleshooting ("fixing" a connector)

Call `list_connectors` from any client. Each line tells you exactly what's
wrong:

```
- ask_claude (Claude (Anthropic API)): NOT CONFIGURED — ANTHROPIC_API_KEY MISSING, baseUrl=https://api.anthropic.com
- ask_ollama (Ollama (local models)): READY — no key required, baseUrl=http://localhost:11434
```

`NOT CONFIGURED` → set the named environment variable and restart the MCP
server (clients restart it automatically on their next tool call after a
config reload). A `READY` provider that still errors at call time means the
key is invalid/expired or the base URL is unreachable (e.g. Ollama not
running) — the tool's error text includes the upstream HTTP status and
message to make that quick to diagnose.
