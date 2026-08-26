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
      const { apiKey, baseUrl } = resolveConfig(name);
      if (provider.envKey && !apiKey) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `${provider.label} is not configured: set the ${provider.envKey} environment variable and restart the MCP server.`,
            },
          ],
        };
      }
      try {
        const text = await provider.call({
          apiKey,
          baseUrl,
          model: model || provider.defaultModel,
          prompt,
          system,
        });
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: "text", text: `${provider.label} request failed: ${err.message}` },
          ],
        };
      }
    }
  );
}

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
