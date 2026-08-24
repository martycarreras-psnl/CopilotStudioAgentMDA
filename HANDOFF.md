# Agent Sidecar — Session Handoff

## What this project is now

Agent Sidecar is a **reusable capability** that adds a persistent, context-aware Copilot Studio assistant to any Dataverse model-driven app. It is deployed by importing one solution (`solution-core/AgentSidecarCore.zip`) and configured through an in-app admin wizard. **HR Management is the optional reference implementation only.** See `README.md` for the product framing.

The core capability is **complete and working end to end** in two environments. This handoff sets up a new session to build **new features**.

## Start the next session with this request

> Continue from HANDOFF.md. The core Agent Sidecar capability is complete and deployed to dev and Sales CS. I want to add new features — <describe the feature>. Preserve the architecture constraints (delegated auth via the localStorage handshake, per-form binding model, deploy through the admin app, no CLI in the user-facing path). Validate with the full baseline and ship via the standard deployment pipeline below.

## Current status — all working and deployed

- **Admin app** (Power Apps Code App, System Administrator only): 5-step wizard — Application → Tables & forms → Agent → Identity → Review/Deploy. Deploy, disable, reconcile, and uninstall all work with **live per-form progress** and a **downloadable JSON report**.
- **Per-form selection**: tables default off; expand a table to pick individual forms; the **Information** form is selected by default. Deploy binds only selected forms.
- **Sign-in**: delegated MSAL PKCE completed via a same-origin **localStorage handshake** (COOP-proof); succeeds on the first attempt; loading splash title comes from the configured pane title.
- **Navigation context**: the launcher writes the current form context to localStorage on every OnLoad without contacting the agent. The pane sends `pvaSetContext` and a trusted context envelope only when the user submits a prompt or explicitly starts a new conversation.
- **Durable conversations**: user-owned `maftagsc_sidecarconversation` and `maftagsc_sidecaractivity` tables retain real Agents SDK conversation IDs and display-safe message history. **Recent conversations** resumes server context and replays the transcript without sending navigation context.
- **Security**: the unassigned **Agent Sidecar User** role is packaged in `AgentSidecarCore`; assign it alongside each end user's normal application role.
- **Deployed** to dev (`carremacodeapps`) and destination (`carrema Sales CS` / `org862d1967`). README repositioned as a reusable product.
- **Green baseline**: `npm run typecheck`, `npm test` (38), `npm run lint`, `npm run build`; model-driven `npm run typecheck:model-driven`, `npm run build:model-driven`, `npm run test:model-driven` (8).

## Environments and identity

| Item | Dev (source) | Destination |
|---|---|---|
| Name | carremacodeapps | carrema Sales CS |
| URL | `https://carremacodeapps.crm.dynamics.com` | `https://org862d1967.crm.dynamics.com` |
| Env ID | `f9b87f8b-0abf-e629-affb-b13195d1ed14` | `7d8dcd87-2e21-e805-b9be-678794ecc80b` |
| SPA app reg | `9d03cd77-5246-4c9c-8e9d-262bff547a25` | `51733b88-b854-441d-a253-57156285344d` |

- Tenant `d92190b9-98e7-46da-8b11-580e06c7d15d`; user `macarrer@msftbapb2bcommercial.onmicrosoft.com`.
- Publisher `agentsidecar`, prefix `maftagsc`.
- Solutions: **`AgentSidecarCore`** (reusable — the deliverable), `HRAgentSidecar` (HR reference).
- Code App id `71d3fa20-9990-4622-9775-11b56f2ed893` (canvasapp `maftagsc_agentsidecar_4b928`).
- Both SPA app regs are single-tenant SPA with delegated `CopilotStudio.Copilots.Invoke` + admin consent; redirect URI is `<org>/WebResources/maftagsc_/copilot/authRedirect.html`.
- GitHub: `https://github.com/martycarreras-psnl/CopilotStudioAgentMDA` (branch `main`).

## Deployment pipeline

**Code App changes** (wizard/admin UI in `src/`):
1. `npm run build && pac code push -s AgentSidecarCore` (dev)
2. `pac solution export --name AgentSidecarCore --path ./solution-core/AgentSidecarCore.zip --managed false --overwrite`
3. `pac solution import --path ./solution-core/AgentSidecarCore.zip --environment 7d8dcd87-2e21-e805-b9be-678794ecc80b --publish-changes --force-overwrite`
4. Commit the refreshed zip and push.

**Web-resource changes** (side-pane runtime in `model-driven/`):
1. `npm run build:model-driven` (rebuilds `solution/WebResources/maftagsc_/copilot/*`).
2. Commit and push the complete change to GitHub.
3. PATCH each changed web resource's `content` through the authenticated Dataverse Web API, then call `PublishXml`.
4. Export `AgentSidecarCore` and refresh `solution-core/AgentSidecarCore.zip`.

## Architecture facts to preserve

- **Runtime auth is delegated MSAL PKCE** (scope `CopilotStudio.Copilots.Invoke`) + `CopilotStudioWebChat`. The runtime passes the configured Agents SDK connection string as `directConnectUrl`, preserving the Copilot Studio-selected standard or GitHub Copilot harness endpoint. It does **not** call the token-broker Custom API (`maftagsc_GetDirectLineToken`); that plugin/step is disabled and off the critical path.
- **Sign-in completion**: `authRedirect.ts` is a self-contained MSAL redirect client that reports via same-origin `localStorage`; `agentSidePane.ts` opens it as a popup and polls. **Do not** reintroduce `acquireTokenPopup` or the MSAL redirect-bridge (`broadcastResponseToMainFrame`) — Dynamics' COOP header breaks it.
- **Context sync**: `agentSidePaneLauncher.ts` writes `maftagsc.sidecar.context.<paneId>` on each OnLoad; `agentSidePane.ts` reads it only for prompt submission and explicit new-conversation context. Navigation never sends an agent activity.
- **Conversation resume**: `sidecarConversationRepository.ts` stores only bounded display text. The Agents SDK resumes with `createConnection({ conversationId })`; Web Chat history is replayed separately with a private marker that prevents duplicate persistence.
- **Per-form model**: `TargetTable.forms[] {formId, name, enabled}`; deploy binds only `enabled` forms; `src/lib/target-forms.ts` picks the Information default.
- Three-layer: components render, hooks orchestrate, providers/services behind adapters; `src/generated/**` is read-only. `HashRouter`. Vite port 3001 / PAC host port 3000. `base: './'` for production build.

## Key files

- `src/components/SidecarWizard/SidecarWizard.tsx` — wizard (per-form selection, progress banner).
- `src/services/real-sidecar-admin-provider.ts` — connected provider + deploy/lifecycle engine.
- `src/services/mock-sidecar-admin-provider.ts`, `src/mockData/sidecarAdministration.ts` — mock/dev provider and data.
- `src/hooks/useOperationReport.ts`, `src/components/OperationProgress/OperationProgress.tsx` — progress + downloadable report.
- `src/lib/target-forms.ts` — Information-form default helper.
- `model-driven/webresources/maftagsc_/copilot/agentSidePane.ts` (sidecar), `agentSidePaneLauncher.ts` (launcher), `authRedirect.ts` (sign-in), `agentSidePane.template.html`.
- `model-driven/webresources/maftagsc_/copilot/sidecarConversationRepository.ts` — user-scoped conversation/history persistence.
- `model-driven/build.mjs`, `model-driven/build.test.mjs`.
- `docs/setup-guide/AgentSidecarSetupGuide.html` — interactive setup guide + values worksheet (includes the Agents SDK connection string).
- `README.md` — product framing. `AGENTS.md` — repo constraints. `CONTEXT.md` — glossary.
- Repo memory: `/memories/repo/environments.md`, `/memories/repo/dataverse-auth.md`.

## Backlog / candidate new features

- Package `AgentSidecarCore` as a **managed** solution for distribution (currently unmanaged).
- Validate **multiple sidecars** across several apps in one environment (already keyed per app).
- **Auto-enable newly added tables** via drift reconcile (`autoEnableNewTables` flag exists).
- Cleanup UX for **Conflict** validation bindings (deprecated/system forms).
- **Automated tests** for the new surfaces: `useOperationReport`, per-form wizard behavior, navigation watcher.
- Optional: real screenshots in the setup guide (`figure.shot` is currently hidden).
- Optional: remove the unused token-broker Custom API/plugin from the Core solution.

## Guardrails

- **Deploy performs live form mutations.** Get explicit approval before deploying in an environment you care about — testing deploy in dev mutates the HR forms.
- Reverify the environment (`pac org who`) before any write/publish/import.
- Do not edit `src/generated/**`. Do not reintroduce CLI/build steps into the user-facing README path.
- Preserve delegated identity and user-scoped authorization; no secrets, no direct DB clients, no non-Power-Platform hosting.
