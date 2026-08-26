#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "ai-connector",
  version: "1.0.0",
});

/**
 * Every provider is defined declaratively so adding one is a single object,
 * not a new code path. `envKey` gates availability; `call` does the HTTP request.
 */
const PROVIDERS = {
  claude: {
    label: "Claude (Anthropic API)",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-5",
    extraEnv: { baseUrl: ["ANTHROPIC_BASE_URL", "https://api.anthropic.com"] },
    async call({ apiKey, baseUrl, model, prompt, system }) {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: system || undefined,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await assertOk(res);
      return data.content?.map((c) => c.text).join("") ?? JSON.stringify(data);
    },
  },

  codex: {
    label: "Codex / ChatGPT (OpenAI API)",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4.1",
    extraEnv: { baseUrl: ["OPENAI_BASE_URL", "https://api.openai.com"] },
    async call({ apiKey, baseUrl, model, prompt, system }) {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });
      const data = await assertOk(res);
      return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
    },
  },

  gemini: {
    label: "Gemini (Google Generative Language API)",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    extraEnv: {
      baseUrl: ["GEMINI_BASE_URL", "https://generativelanguage.googleapis.com"],
    },
    async call({ apiKey, baseUrl, model, prompt, system }) {
      const res = await fetch(
        `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: system
              ? { parts: [{ text: system }] }
              : undefined,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          }),
        }
      );
      const data = await assertOk(res);
      return (
        data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ??
        JSON.stringify(data)
      );
    },
  },

  deepseek: {
    label: "DeepSeek (OpenAI-compatible API)",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    extraEnv: { baseUrl: ["DEEPSEEK_BASE_URL", "https://api.deepseek.com"] },
    async call({ apiKey, baseUrl, model, prompt, system }) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });
      const data = await assertOk(res);
      return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
    },
  },

  ollama: {
    label: "Ollama (local models)",
    envKey: null, // no API key: local daemon, presence of OLLAMA_HOST (or default) is enough
    defaultModel: "llama3.1",
    extraEnv: { baseUrl: ["OLLAMA_HOST", "http://localhost:11434"] },
    async call({ baseUrl, model, prompt, system }) {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });
      const data = await assertOk(res);
      return data.message?.content ?? JSON.stringify(data);
    },
  },

  copilot: {
    label: "GitHub Copilot bridge (GitHub Models inference API)",
    envKey: "GITHUB_TOKEN",
    defaultModel: "gpt-4o",
    extraEnv: { baseUrl: ["GITHUB_MODELS_BASE_URL", "https://models.github.ai"] },
    note:
      "GitHub Copilot has no public chat-completions API. This bridges to " +
      "GitHub Models (models.github.ai), which authenticates with the same " +
      "GITHUB_TOKEN and is the closest first-party equivalent for tool use.",
    async call({ apiKey, baseUrl, model, prompt, system }) {
      const res = await fetch(`${baseUrl}/inference/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });
      const data = await assertOk(res);
      return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
    },
  },
};

async function assertOk(res) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message =
      data?.error?.message || data?.error || data?.raw || res.statusText;
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
  return data;
}

function resolveConfig(name) {
  const provider = PROVIDERS[name];
  const apiKey = provider.envKey ? process.env[provider.envKey] : undefined;
  const [baseUrlEnv, baseUrlDefault] = provider.extraEnv.baseUrl;
  const baseUrl = (process.env[baseUrlEnv] || baseUrlDefault).replace(/\/$/, "");
  return { provider, apiKey, baseUrl };
}

function isConfigured(name) {
  const { provider, apiKey } = resolveConfig(name);
  return !provider.envKey || Boolean(apiKey);
}

/** Calls one provider, always resolving (never throws) with a uniform result shape. */
async function callProvider(name, { prompt, system, model }) {
  const provider = PROVIDERS[name];
  const { apiKey, baseUrl } = resolveConfig(name);
  if (provider.envKey && !apiKey) {
    return {
      name,
      label: provider.label,
      ok: false,
      error: `NOT CONFIGURED — set ${provider.envKey} and restart the MCP server`,
    };
  }
  const started = Date.now();
  try {
    const text = await provider.call({
      apiKey,
      baseUrl,
      model: model || provider.defaultModel,
      prompt,
      system,
    });
    return { name, label: provider.label, ok: true, text, ms: Date.now() - started };
  } catch (err) {
    return {
      name,
      label: provider.label,
      ok: false,
      error: err.message,
      ms: Date.now() - started,
    };
  }
}

for (const [name, provider] of Object.entries(PROVIDERS)) {
  server.registerTool(
    `ask_${name}`,
    {
      title: `Ask ${provider.label}`,
      description: `Send a prompt to ${provider.label} and return its response. ${
        provider.note ?? ""
      }`.trim(),
      inputSchema: {
        prompt: z.string().describe("The user prompt / question to send."),
        system: z
          .string()
          .optional()
          .describe("Optional system prompt / instructions."),
        model: z
          .string()
          .optional()
          .describe(`Model override. Defaults to "${provider.defaultModel}".`),
      },
    },
    async ({ prompt, system, model }) => {
      const result = await callProvider(name, { prompt, system, model });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `${provider.label}: ${result.error}` }],
        };
      }
      return { content: [{ type: "text", text: result.text }] };
    }
  );
}

// Preference order used to auto-pick a synthesizer for omniroute's combo answer.
const SYNTHESIS_PREFERENCE = ["claude", "codex", "gemini", "deepseek", "copilot", "ollama"];

server.registerTool(
  "omniroute",
  {
    title: "OmniRoute — fan out to every connected model and combine",
    description:
      "The combo tool: sends one prompt to every connected provider (Claude, Codex, " +
      "Gemini, DeepSeek, Ollama, Copilot bridge) in parallel, then synthesizes a " +
      "single reconciled combo answer from whichever responses succeeded. Use this " +
      "instead of calling ask_* one at a time when you want a cross-model second " +
      "opinion or one merged best answer instead of picking a provider yourself.",
    inputSchema: {
      prompt: z.string().describe("The prompt to send to every provider."),
      system: z.string().optional().describe("Optional shared system prompt."),
      providers: z
        .array(z.enum(Object.keys(PROVIDERS)))
        .optional()
        .describe(
          "Subset of providers to route to, e.g. [\"claude\",\"codex\"]. Defaults to all of them."
        ),
      combine: z
        .boolean()
        .optional()
        .describe("Also synthesize a single combo answer from the individual responses. Default true."),
      synthesizer: z
        .enum(Object.keys(PROVIDERS))
        .optional()
        .describe(
          "Which provider writes the combo answer. Defaults to the first successful " +
            `provider in preference order (${SYNTHESIS_PREFERENCE.join(", ")}).`
        ),
    },
  },
  async ({ prompt, system, providers, combine = true, synthesizer }) => {
    const targets = providers && providers.length ? providers : Object.keys(PROVIDERS);
    const results = await Promise.all(
      targets.map((name) => callProvider(name, { prompt, system }))
    );

    const succeeded = results.filter((r) => r.ok);
    const sections = results.map((r) =>
      r.ok
        ? `### ${r.name} (${r.label}, ${r.ms}ms)\n${r.text}`
        : `### ${r.name} (${r.label})\nFAILED — ${r.error}`
    );

    let comboSection = "";
    if (combine && succeeded.length > 0) {
      const chosenName =
        (synthesizer && succeeded.find((r) => r.name === synthesizer)?.name) ||
        SYNTHESIS_PREFERENCE.find((name) => succeeded.some((r) => r.name === name)) ||
        succeeded[0].name;

      const synthesisPrompt =
        `Multiple AI models were asked the same question. Combine their answers into ` +
        `one best, reconciled response. Call out any meaningful disagreement instead of ` +
        `silently picking one side.\n\nQuestion:\n${prompt}\n\nAnswers:\n` +
        succeeded.map((r) => `--- ${r.name} ---\n${r.text}`).join("\n\n");

      const combo = await callProvider(chosenName, {
        prompt: synthesisPrompt,
        system: "You are an impartial synthesizer reconciling answers from several AI models.",
      });

      comboSection = combo.ok
        ? `## Combo answer (via ${chosenName})\n${combo.text}\n\n`
        : `## Combo answer\nSynthesis via ${chosenName} failed — ${combo.error}\n\n`;
    } else if (combine) {
      comboSection = "## Combo answer\nNo provider succeeded, nothing to combine.\n\n";
    }

    const text = `${comboSection}## Individual answers\n${sections.join("\n\n")}`;
    return {
      isError: succeeded.length === 0,
      content: [{ type: "text", text }],
    };
  }
);

server.registerTool(
  "list_connectors",
  {
    title: "List AI connector status",
    description:
      "Report which model providers (Claude, Codex/OpenAI, Gemini, DeepSeek, Ollama, Copilot bridge) are configured and reachable in this environment.",
    inputSchema: {},
  },
  async () => {
    const lines = Object.entries(PROVIDERS).map(([name, provider]) => {
      const { baseUrl } = resolveConfig(name);
      const configured = isConfigured(name);
      const keyNote = provider.envKey
        ? configured
          ? `${provider.envKey} set`
          : `${provider.envKey} MISSING`
        : "no key required";
      return `- ask_${name} (${provider.label}): ${
        configured ? "READY" : "NOT CONFIGURED"
      } — ${keyNote}, baseUrl=${baseUrl}`;
    });
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
