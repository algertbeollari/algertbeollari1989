# Project memory

## AI tool security review (this session)

The repo owner is Head of Compliance, MLRO and Risk Officer for a DFSA-regulated
DIFC firm, and ran a security review of their claude.ai account (skills and MCP
connectors) plus this Claude Code session's permission posture, with the goal of
nothing acting on their behalf without explicit confirmation — especially before
using this tooling for client onboarding (CDD/KYC) work.

### Connectors
- **Disconnected during this review**: AccuWeather, Booking.com, Microsoft Learn,
  Send, Zoom for Claude, Zapier, Composio for you (the last two were the highest
  risk — broad/unauditable third-party reach).
- **Still connected, flagged as having no clear compliance purpose**: Base44,
  Canva, Coursera (stale/needs_reconnect), Lovable, Spotify. Owner's call whether
  to remove — not done as of this session.
- **Still connected, legitimate if actively used**: Gmail, Google Calendar,
  Google Drive, Granola, Notion, Slack, Docusign.
- **Half-connected, needs a decision**: Microsoft 365 (`connect_incomplete`) —
  either finish setup or remove the stub.

### Skills
A large personal/lifestyle and video-production (Remotion) skill set was pruned
down from 41 flagged items to a handful remaining, done manually by the owner via
claude.ai Settings → Capabilities. The DFSA/AML/compliance skill set (`dfsa-*`,
`uae-*`, `difc-data-protection`, `onboarding-process`, `it-cybersecurity`, etc.)
was kept — those are purpose-built for this Firm's compliance work.

### Permission policy (this repo)
`.claude/settings.local.json` (gitignored, **not** committed — personal to this
user, not a team policy) sets:
- `defaultMode: "plan"`
- `permissions.ask` listing ~134 write-capable MCP tool names across every
  connector connected at the time (Base44, Canva, Docusign, Gmail, Google
  Calendar, Google Drive, Lovable, Notion, Slack, Spotify) — every send/share/
  create/update/delete/export/publish-type action requires explicit confirmation
  regardless of session mode (including Auto). Read-only tools were deliberately
  left off the list.

If connectors change (new ones added, old ones removed), this list should be
revisited — it was built by hand from the tool catalog available at review time,
not generated dynamically.

### Still open / not yet done
- 2FA status on the claude.ai account — not confirmed.
- OAuth grants at the provider side (Google/Microsoft account security pages) —
  disconnecting in claude.ai doesn't always revoke the token on their end; worth
  checking separately for anything actually removed.
- A formal AI-use risk assessment / register entry was drafted in conversation
  (not saved as a file) — classification: Moderate Risk for general productivity
  use, Restricted Use for any CDD/EDD/UBO/SoW-SoF/transaction/STR-SAR data until
  outsourcing characterisation and third-party due diligence are completed.
  **Hard rule regardless of tooling: no STR/SAR or MLRO suspicion material in any
  AI tool.**

### Separate surface: claude.ai Projects
The owner also has an "MLRO" Project on claude.ai (the regular chat product,
distinct from Claude Code). Permission modes and `.claude/settings.json` are
Claude Code concepts and do **not** apply there — Project-level control is
whatever connectors/skills are enabled for that conversation, which was not
separately verified.

### Onboarding workflow guidance (for the MLRO Project or future sessions)
- Client-specific documents (passports, bank statements, UBO registers) should
  go into the individual chat/session for that client, not into shared Project
  Knowledge (which is visible to every chat in that Project).
- One client per chat/session — keep onboarding work separable for audit.
- AI drafts (CRAAF, completeness checks, risk narratives); the MLRO makes the
  actual acceptance/risk-rating decision. Never treat an AI output as an approval.
- Verify any DFSA Rule citation independently before relying on it.
