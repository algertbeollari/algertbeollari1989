---
name: ai-tool-security-audit
description: Audits and locks down the AI tooling attached to this account — claude.ai connectors (MCP servers), enabled skills, and this Claude Code session's permission posture — for someone who needs least-privilege, confirm-before-act control, especially in a regulated or compliance-sensitive role. Use this whenever the user asks to audit, review, or lock down their connectors, skills, plugins, or MCP tools; asks "what do I have connected / installed and is it safe"; asks to reduce what Claude can do without asking first; or wants a durable permission policy so connector actions (sending email, messaging, sharing or deleting files, creating contracts/envelopes) always require explicit confirmation regardless of mode. Also use it as a periodic re-check after a prior audit, since connectors and skills drift over time.
---

# AI tool security audit

## Why this exists

The risk in a heavily-connected AI setup is rarely the AI acting maliciously —
it's **breadth**: more connectors and skills than the user's actual work needs,
several with write/send/delete capability, sitting there as exposure even when
never deliberately misused. For someone in a regulated or compliance-sensitive
role, that exposure is also a governance gap (undocumented third-party data
flows, no record of what's connected or why).

The guiding principle throughout is **least privilege and confirm-before-act**:
default to read-only, make anything that changes state require explicit
confirmation, and never assume a tool is safe just because it's "disconnected
for now" — state drifts, so re-check rather than trust memory.

## Step 1 — Enumerate the live state, never assume

Call `ListConnectors`, `ListSkills`, and `ListPlugins` fresh, every time this
audit runs (including a re-run). A prior review's findings go stale the moment
the user changes anything — don't report from memory of an earlier check in
this same conversation either; re-call the tools.

## Step 2 — Classify each connector

For every connector `ListConnectors` shows as connected, sort it into one of
four buckets:

1. **Remove now (highest priority)** — connectors with broad, effectively
   unauditable reach into other third-party systems: generic automation/meta
   connectors that can trigger thousands of other apps (e.g. Zapier-style
   "automate workflows across apps" connectors), or multi-tool execution
   connectors (e.g. ones offering "remote bash" / "multi-execute" style tools).
   These carry the most risk per connector and the least ability to reason
   about what they might touch.
2. **Remove — no stated purpose** — connected, but the user can't name a
   reason it's there tied to their actual work. Don't assume connectors are
   fine just because they're not exotic; "no clear use" is reason enough to
   flag, since every connector is attack surface for zero benefit if unused.
3. **Keep, but gate the write side** — connectors the user actively uses
   that also carry send/share/delete/create-binding-document capability
   (email, messaging, cloud storage, e-signature/contract platforms,
   calendar). These aren't removal candidates, but their state-changing
   actions are exactly what Step 7's permission policy should gate.
4. **Keep, low risk** — connectors that are read-only in practice, or
   genuinely low-stakes (e.g. a weather widget), and actively used.

A connector showing `needs_reconnect` or `connect_incomplete` is a loose end
either way — tell the user to finish connecting it properly or remove the
stub; don't leave it half-configured.

## Step 3 — Classify each skill

Skills are lower-risk per-item than connectors (they're instructions, not
live access to external systems), but they accumulate fast — large
marketplaces mean dozens or hundreds can end up enabled. Sort into:

- **Keep** — tied to the user's actual professional domain or genuinely
  useful cross-cutting hygiene tools (anything that scans other skills/code
  for security issues, git-secret-safety helpers, doc-conversion utilities).
- **Prune — irrelevant personal/lifestyle skills** — energy-mapping,
  habit-tracking, body-doubling, and similar tools with zero connection to
  the user's stated work. Not dangerous individually; the issue is bulk and
  irrelevance, not threat.
- **Prune — whole unrelated skill families** — when an entire multi-skill
  toolkit (e.g. a full video-production pipeline: rendering, captions,
  audio, 3D, maps) shows up with no connection to what the user does, flag
  the whole family together rather than picking through it piece by piece.

Skill content is instructions that run with the user's authority — if a
skill looks internally authored (references a specific company/firm by
name) or came from an unfamiliar source, say so and suggest it get verified
before being relied on for real work, rather than assuming marketplace
installation implies vetting.

## Step 4 — Report, then stop and let the user act

There is no tool available here to disable a claude.ai skill or disconnect a
connector directly — that's a deliberate boundary (the user controls their
own account), not a gap to route around. Present the classification as a
clear list (table or grouped bullets) of what to remove, what to reconsider,
and what to keep, and tell the user where to go do it (claude.ai Settings →
Connectors / Capabilities). Don't claim anything is "done" until it's been
verified in Step 5.

## Step 5 — Re-check, don't trust self-reports

When the user says they've made changes, call `ListConnectors`/`ListSkills`
again rather than taking their word for it — partial progress across several
passes is the norm, not the exception. Diff against the last known state and
report exactly what changed and what's still outstanding. Expect to do this
more than once; each pass should feel like real progress, not a repeat of
the same list.

## Step 6 — Permission-mode hygiene (Claude Code sessions only)

If this is running in a Claude Code cloud session (not a plain claude.ai
chat), there's a mode dropdown next to the prompt box: **Plan**, **Accept
Edits**, **Auto**. Two things worth knowing before recommending one:

- File edits run without a prompt in *every* mode in a cloud session — the
  mode choice is really about whether *other* tool calls (connector actions,
  shell commands) need confirmation.
- **Plan** is the most conservative: it gates those other actions behind
  approval. Recommend it for anything sensitive, and never recommend "Auto"
  for a user whose stated goal is confirm-before-act — Auto exists for the
  opposite priority (speed over confirmation).

## Step 7 — Build a durable, mode-independent policy

A mode selection is easy to forget to re-pick next session. For something
durable, Claude Code reads `.claude/settings.json` (committed, applies to
anyone working in the repo) or `.claude/settings.local.json` (gitignored,
personal to this user on this machine). Default to **local** unless the
user explicitly wants this enforced for collaborators too — this is almost
always a personal control preference, not a team policy.

Inside `permissions`:

```json
{
  "permissions": {
    "defaultMode": "plan",
    "ask": [ "mcp__<Server>__<tool>", "..." ]
  }
}
```

**Use `ask`, not `deny`, for anything the user might legitimately want to do
sometimes.** `deny` is a hard block with no way to approve in the moment —
reserve it for things that should be off the table entirely (e.g. a
connector already removed in Step 2 for having no purpose at all). `ask`
keeps the tool usable but makes every call stop for explicit confirmation,
which is what "confirm before act" actually means in practice — and it
applies regardless of mode, including Auto, so it survives a forgotten mode
switch.

**Building the `ask` list:** walk the *current* session's live MCP tool
catalog connector by connector (the tools actually loaded this session, not
a remembered list from a past audit — reconnecting a connector can change
its tool set). For each tool, classify by its verb:

- **Read-only, leave off the list:** get, list, search, read, download,
  query, describe.
- **State-changing, put it on the list:** create, update, delete, send,
  share, trash, forward, reply, export, publish, deploy, run, write,
  execute, upload, merge, move, remove, cancel, trigger, pause, resume.

Address each tool by its exact name as it appears in the tool list
(`mcp__<Server>__<tool_name>`, e.g. `mcp__Gmail__send_message`,
`mcp__Google_Drive__share_file`). Leaving read-only tools off the list is
deliberate, not an oversight — gating reads adds prompt fatigue without
reducing the risk the user actually cares about (something happening
without them, not something being looked at).

## Step 8 — Make the policy file safe and verified

1. Check whether `.gitignore` already excludes `.claude/settings.local.json`;
   create or extend it if not, so the personal policy is never accidentally
   committed or pushed.
2. Validate the JSON (`jq empty <file>`) before considering the step done —
   a malformed settings file fails silently in ways that are hard to notice
   later.
3. Confirm with `git check-ignore -v .claude/settings.local.json` that it's
   actually excluded, and with `git status` that nothing unintended got
   staged.
4. Spot-check a couple of expected entries are present
   (`jq '.permissions.ask' <file> | grep <tool-name>`) rather than assuming
   the list was built correctly.

## Step 9 — Record the outcome in project memory

Write (or update) `CLAUDE.md` at the repo root with a summary: what's
currently connected/enabled, what was removed and why, what's still flagged
for the user to decide on, the permission policy now in place and its
rationale, and any open items that weren't resolved this session (2FA
status, revoking OAuth grants at the provider's own security pages — a
claude.ai disconnect doesn't always pull the token on Google's/Microsoft's
side — and any formal risk-assessment follow-up). This means the next
session picks up from here instead of re-deriving the whole audit from
scratch, and gives the user something to actually point to if anyone ever
asks what their AI tooling's data-handling posture looks like.

## Step 10 — Know which surface you're actually on

Permission modes and `.claude/settings.json` are **Claude Code** concepts,
tied to a session and (for settings files) a git repository. A plain
claude.ai Project (the regular chat product, with its own per-conversation
Skills/Connectors toggles) is a different surface — Steps 6–8 do not apply
there, and should not be described as if they do. If the user's actual
workflow lives in a claude.ai Project rather than a Claude Code session, say
so plainly rather than assuming the settings-file mechanism carries over,
and scope the audit's connector/skill findings (Steps 1–5, which are account-
wide) accordingly — those still apply either way.

## A note on tone

This is a security and governance exercise for someone who may be
non-technical about the tooling even while being an expert in their own
domain (compliance, risk, legal, etc.). Explain *why* a connector or setting
matters in plain terms before using jargon, and don't let the audit become
a wall of text — a clear keep/remove table beats a long narrative every
time.
