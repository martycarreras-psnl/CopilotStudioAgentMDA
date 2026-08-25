# Agent Sidecar Enhancement Handoff

**Prepared:** August 25, 2026  
**Repository:** `martycarreras-psnl/CopilotStudioAgentMDA`  
**Branch:** `main`  
**Latest pushed commit:** `19a310e chore(solution): package list analysis scoping`

## Purpose

This document is the starting point for the next Agent Sidecar enhancement session. The current effort is complete and deployed. The next likely refinement is support for multiple sidecars, including the possibility of multiple independent sidecars inside the same model-driven app.

Start the next session by reading this document, `README.md`, `CONTEXT.md`, and the root agent instructions before changing code.

## Current product state

Agent Sidecar is a reusable model-driven app side pane that:

- Connects to an existing Copilot Studio agent through Microsoft 365 Agents SDK 1.6.1.
- Uses delegated Microsoft Entra authentication with PKCE and no browser secret.
- Resolves current screen context immediately before a user prompt or explicit new-conversation action.
- Does not contact the agent merely because the user navigated.
- Persists user-owned conversation references and display-safe activities in Dataverse.
- Resumes the real Agents SDK conversation and replays its saved transcript.
- Deletes saved conversations and their related activities after confirmation.
- Hides greeting-only sessions from Recent conversations until the user sends a message.
- Uses an iPhone Messages-inspired chat treatment with blue outgoing bubbles.
- Conditionally supports list analysis with explicit Current view or All accessible records scope.

The runtime and solution package are deployed to the Sales CS environment described below.

## Deployed environment

| Item | Value |
|---|---|
| Environment | `carrema Sales CS` |
| Dataverse URL | `https://org862d1967.crm.dynamics.com` |
| Environment ID | `7d8dcd87-2e21-e805-b9be-678794ecc80b` |
| PAC profile | `carrema-sales-cs` |
| Solution unique name | `AgentSidecarCore` |
| Solution display name | `Agent Sidecar Core` |
| Publisher prefix | `maftagsc` |
| Sales Hub app ID | `3d77919b-a319-f111-8341-6045bd07e2cb` |
| Agent name | `Insights and actions` |
| Agent schema name | `cr88d_insightsandactions_AChDbK` |
| SPA client ID | `51733b88-b854-441d-a253-57156285344d` |
| Redirect web resource | `maftagsc_/copilot/authRedirect.html` |

The inactive Helix One PAC profile and any old Helix One MCP endpoint are unrelated to this repository and deployment.

## Deployment rule

**Always commit and push changes to GitHub before deploying them.**

The expected order is:

1. Implement and validate locally.
2. Commit the source and generated projections.
3. Push the commit to `origin/main`.
4. Publish or import into Power Platform.
5. Verify the ordinary model-driven app shell.
6. If an exported solution package changes, commit and push that package before any later deployment based on it.

Do not deploy an unpushed local state.

## Recent completed enhancements

| Commit | Change |
|---|---|
| `3c97aa3` | Kept navigation context local and removed proactive navigation activities. |
| `b8dc2fd`, `87a4329` | Added durable conversation references, transcript replay, and server-context resume. |
| `0be7861`, `47322aa` | Added conversation deletion and required security privileges. |
| `beb5bad`, `f1faab9` | Filtered greeting-only conversations from Recent conversations. |
| `cb160af`, `b357870` | Removed the redundant context event that caused false agent responses. |
| `6784cbf`, `92d6cf6` | Added the Messages-inspired visual design. |
| `ccb00e8`, `19a310e` | Added, packaged, deployed, and live-tested scoped list analysis. |

## Scoped list analysis: completed behavior

On an `entitylist` page, a local heuristic intercepts likely analysis or processing requests only when the prompt contains both an operation and a list target. It does not intercept ordinary instructional questions such as “How do I update these records?”

For an intercepted request:

1. The original message is not sent yet.
2. A modal asks for **Current view (all matching rows)** or **All accessible records**.
3. The modal warns that large datasets may be slow or exceed processing limits.
4. Current-view FetchXML is retrieved only after the user chooses Current view.
5. Cancel restores the original unsent text.
6. The selected scope is added to the trusted prompt envelope.
7. Internal scope-selection metadata is removed before the activity is forwarded.
8. The visible and persisted user message remains the user's original text.

**Current view** means every accessible row matching the active view's filters, not merely the currently rendered scroll page.

### Live validation evidence

The deployed runtime was exercised in the ordinary Sales Hub shell on the Contacts `My Active Contacts` view:

- Host context resolved `pageType: entitylist`, table `contact`, saved view ID `00000000-0000-0000-00aa-000010001003`.
- The scope dialog appeared before any user activity was sent.
- Cancel restored the original text and did not create a displayed user message.
- Current view sent one activity containing the exact active-view FetchXML.
- The agent analyzed the 16 matching Contacts and returned a record-grounded response.
- All accessible records sent table-wide scope without FetchXML or the current-view filter.
- `maftagscListAnalysisSelection` was absent from forwarded `channelData`.
- “How do I update these records?” bypassed the scope dialog and sent only ordinary screen context.

No source change is pending from this validation.

## Known lifecycle limitation

The pane is currently created by an OnLoad handler attached to selected main forms. If a user opens Sales Hub directly on a list in a fresh app shell, no bound form has run yet and the Agent Sidecar pane does not exist.

Once a bound form has initialized the pane, in-app navigation to a list preserves it and list analysis works. Direct-list-first initialization requires a separate app-level startup or command-bar binding design. Do not weaken the current form-owned lifecycle or reintroduce navigation-triggered agent activities to work around this.

## Current architecture and key files

| File | Responsibility |
|---|---|
| `model-driven/webresources/maftagsc_/copilot/agentSidePane.ts` | Main runtime: auth, Web Chat, context, list scoping, conversation persistence, replay, resume, and delete. |
| `model-driven/webresources/maftagsc_/copilot/agentSidePaneLauncher.ts` | Form OnLoad entry point; resolves one app configuration, writes local context, and creates/reuses the pane. |
| `model-driven/webresources/maftagsc_/copilot/sidecarListAnalysis.ts` | Pure list-intent detection, scope normalization, sanitization, and prompt formatting. |
| `model-driven/webresources/maftagsc_/copilot/sidecarConfiguration.ts` | Configuration contract and fail-closed app resolution. |
| `model-driven/webresources/maftagsc_/copilot/sidecarConfigurationRepository.ts` | Dataverse and bootstrap configuration lookup. |
| `model-driven/webresources/maftagsc_/copilot/sidecarConversationRepository.ts` | User-owned conversation and activity persistence. |
| `model-driven/webresources/maftagsc_/copilot/agentSidePane.template.html` | Accessible shell, Messages-inspired styles, conversation controls, and list-scope modal. |
| `src/services/real-sidecar-admin-provider.ts` | Live administration lifecycle, duplicate checks, binding solution creation, and form mutation. |
| `src/services/mock-sidecar-admin-provider.ts` | Mock administration behavior used by tests and prototype flows. |
| `tests/model-driven/sidecar-list-analysis.test.ts` | Focused intent and scope-safety tests. |
| `model-driven/build.test.mjs` | Generated runtime, projection, and package regression tests. |
| `solution-core/AgentSidecarCore.zip` | Current importable solution package. |

Generated files must not be edited directly:

- `model-driven/webresources/maftagsc_/copilot/agentSidePane.html`
- `model-driven/webresources/maftagsc_/copilot/agentSidePane.js`
- Their copies under `solution/WebResources/`

Regenerate them with the existing model-driven build.

## Conversation persistence

The core solution owns:

- `maftagsc_sidecarconversation`
- `maftagsc_sidecaractivity`

Recent-conversation lookup is scoped by:

- Signed-in Dataverse owner.
- Sidecar configuration ID.
- Model-driven app ID.
- Copilot Studio agent schema name.
- Presence of at least one persisted user activity.

This existing configuration-level scoping is useful for multiple sidecars. Preserve it rather than collapsing history to app ID alone.

Only bounded, display-safe activity text is persisted. Tokens, trusted context envelopes, full `channelData`, FetchXML scope envelopes, and connector payloads are not persisted.

## Multiple sidecars: current constraint

The current implementation supports multiple sidecars in one Dataverse environment **only when each sidecar targets a different model-driven app**. It deliberately enforces exactly one enabled configuration per app.

That constraint appears in several layers:

- `resolveSidecarConfiguration()` filters by app ID and throws `sidecar_configuration_ambiguous` when more than one enabled match exists.
- `SidecarConfigurationRepository.getByAppId()` returns one configuration rather than a collection.
- `agentSidePaneLauncher.ts` calls `getByAppId()` once and creates one pane.
- `real-sidecar-admin-provider.ts` rejects another configuration with the same `maftagsc_appid`.
- `mock-sidecar-admin-provider.ts` mirrors the same duplicate rule.
- The Dataverse configuration schema defines app identity as the current uniqueness boundary.
- Existing documentation describes one app-keyed assistant.

Supporting multiple sidecars **within the same app** therefore requires an intentional product-model change, not merely another pane call.

## Recommended multi-sidecar direction

Use **configuration identity**, not app ID, as the unique sidecar identity. App ID should become a non-unique parent grouping key.

A safe target model is:

- One model-driven app may have many Sidecar Configurations.
- Every configuration has its own immutable configuration ID and stable, unique pane ID.
- Every configuration selects its own Copilot Studio agent, identity settings, title, icon, width, enabled state, tables, and forms.
- A selected form may host one or more enabled sidecars only when their configuration bindings explicitly include that form.
- Each sidecar keeps independent authentication client state, Agents SDK connection, active conversation, recent conversations, and local navigation context.
- Conversation history remains scoped by configuration ID, app ID, and agent schema name.
- The administration app shows sidecars grouped by target app and prevents duplicate pane IDs or duplicate binding ownership, not duplicate app IDs.

This direction preserves current isolation boundaries and avoids inventing a special “primary” sidecar.

## Decisions to resolve before implementation

The next session should use the repository's one-question-at-a-time grilling cadence. Resolve these in order:

1. **Multiplicity boundary:** Does “multiple sidecars” mean multiple sidecars in the same app, or merely easier management of one sidecar per several apps? The current product already supports the latter.
2. **Visibility model:** Should every configured sidecar appear simultaneously in the side-pane switcher, or should table/form rules choose only one sidecar for the current screen?
3. **Binding overlap:** May two sidecars bind to the same form? If yes, each needs a distinct deterministic OnLoad handler identity and ownership record.
4. **Identity model:** May sidecars share one SPA registration, or must each keep an independent public client as the current plan recommends?
5. **Conversation UX:** Should each pane show only its own history, or should the UI provide an app-level conversation switcher across agents? Independent per-pane history is recommended.
6. **List-first startup:** Should supporting multiple sidecars also include app-level initialization so panes exist when the app opens directly on a list? Treat this as a related but separately testable capability.
7. **Limits and ordering:** Define a practical maximum number of sidecars per app and a deterministic switcher order.

The first question is the critical branch. Do not start schema or runtime changes until it is answered.

## Likely implementation slices

### 1. Configuration contract

- Replace singular `getByAppId()` with a collection-returning contract such as `listEnabledByAppId()`.
- Validate each configuration independently.
- Reject duplicate configuration IDs and pane IDs, but allow repeated app IDs.
- Preserve fail-closed behavior when any returned configuration is invalid.

### 2. Dataverse schema and administration

- Remove or replace app-ID uniqueness if it is enforced by an alternate key.
- Add a deterministic sort/order column if the side-pane switcher order is configurable.
- Change duplicate checks in both real and mock providers.
- Group portfolio entries by target app.
- Update health validation to detect pane-ID, handler-ID, and binding-ownership collisions.
- Use the Dataverse skills workflow and discover existing schema before changing the table.

### 3. Launcher and local context

- Resolve all enabled configurations for the current app.
- Filter configurations by current entity and form binding.
- Create/reuse one pane per matching configuration.
- Key local context by configuration or pane ID; the current `maftagsc.sidecar.context.<paneId>` pattern already supports this.
- Ensure one failing sidecar does not prevent other valid sidecars from initializing, while still surfacing a safe diagnostic.

### 4. Form mutation ownership

- Add one deterministic handler per configuration/form binding or one dispatcher that initializes all eligible configurations.
- Prefer a single core dispatcher where possible to reduce repeated form handlers.
- Preserve unrelated form XML and idempotent apply/uninstall behavior.
- Ensure uninstalling one sidecar never removes a shared launcher still used by another.

### 5. Runtime isolation

- Confirm module-level runtime state is isolated because each pane runs in a separate iframe.
- Keep MSAL, Agents SDK connection, conversation generation, recent-conversation map, and deletion tombstones pane-local.
- Include configuration identity in all persistence and cache boundaries.
- Verify that navigation updates every open sidecar locally without sending any agent activity.

### 6. Tests

Add coverage for:

- Two configurations for one app produce two unique panes.
- Two sidecars may use different agents and entity bindings.
- Overlapping form bindings behave according to the chosen visibility policy.
- Conversation history cannot cross configuration or agent boundaries.
- New conversation, resume, delete, and greeting filtering remain independent per pane.
- List analysis scope appears only in the pane receiving the prompt.
- Disabling or uninstalling one sidecar leaves the other operational.
- A duplicate pane ID or binding owner fails closed.
- Direct-list-first startup behavior is tested separately if added.

## Validation commands

Run the smallest relevant commands first, then the full established baseline before packaging:

```bash
npm run typecheck
npm test -- --run
npm run lint
npm run build
npm run typecheck:model-driven
npm run build:model-driven
npm run test:model-driven
```

Do not install new test or build tooling. The last completed baseline had 58 Vitest tests passing, including 18 focused list-analysis tests, plus 9 model-driven package tests.

## Deployment and live-test checklist

After the multi-sidecar change is committed and pushed:

1. Confirm the active PAC profile and target environment are `carrema-sales-cs` / Sales CS.
2. Import or publish only the intended pushed package.
3. Verify each configured pane has a distinct version-stamped web-resource iframe and pane ID.
4. Navigate among bound records and lists; confirm no agent request occurs from navigation alone.
5. Send a prompt in sidecar A; confirm sidecar B receives no activity and keeps its own transcript.
6. Start, resume, and delete conversations independently in both panes.
7. Exercise Current view and All accessible records in each applicable pane.
8. Disable or uninstall one sidecar; confirm the other remains registered and functional.
9. Open the app directly on a list if list-first initialization is in scope.
10. Read back Dataverse configuration, form XML, conversation ownership, and solution import status.

## Repository state at handoff

- Branch: `main`
- Remote: `https://github.com/martycarreras-psnl/CopilotStudioAgentMDA`
- Latest pushed commit: `19a310e`
- No tracked source changes were pending when this document was started.
- `.playwright-mcp/` is an unrelated untracked browser artifact. Do not stage or delete it as part of sidecar work.
- All previously tracked enhancement todos were complete.

## Suggested opening prompt for the next session

> Read `docs/enhancement-handoff-2026-08-25.md`, `README.md`, `CONTEXT.md`, and the repository instructions. Continue the Agent Sidecar enhancement effort. Start by clarifying whether multiple sidecars means multiple independently configured panes in the same model-driven app. Use the one-question-at-a-time grilling cadence, recommend the independent per-configuration pane model, and do not implement until that product boundary is resolved.
