# Agent Sidecar Enhancement Handoff

**Prepared:** August 27, 2026  
**Repository:** `martycarreras-psnl/CopilotStudioAgentMDA`  
**Branch:** `main`  
**Latest pushed commit:** `32d249355fa33c2df40960b79af7714d158b828c`  
**Deployed Core version:** `1.0.0.19`

## Purpose

Use this document to begin the next Agent Sidecar product-enhancement session. The current implementation is committed, pushed, deployed, and live-verified. The next session should preserve the deployed behavior while defining and implementing the next enhancement through the repository's one-question-at-a-time grilling cadence.

Before changing anything, read:

1. This handoff.
2. `README.md`.
3. `CONTEXT.md`.
4. `AGENTS.md`.
5. `.github/instructions/README.md`.
6. Every path-specific instruction that applies to files being changed.

Also confirm the live repository and deployment state rather than assuming this snapshot is still current.

## Permanent workflow rule

**Every intended change must be committed and pushed to GitHub before it is deployed.**

Use this order:

1. Inspect the current implementation and live state.
2. Refine the enhancement scope one question at a time.
3. Implement source and focused tests.
4. Regenerate maintained web-resource projections and solution artifacts.
5. Run the established validations.
6. Commit all intended source, generated, documentation, and package changes.
7. Push the commit to `origin/main`.
8. Deploy only the pushed package.
9. Verify the result in the ordinary model-driven app shell.

Never deploy an uncommitted or unpushed local state.

Treat `.playwright-mcp/` as an unrelated untracked artifact. Do not stage, modify, or delete it.

## Current repository state

At handoff creation:

- `HEAD` and `origin/main` both point to `32d249355fa33c2df40960b79af7714d158b828c`.
- Commit title: `feat(sidecar): restore agent discovery and enable editing`.
- The only untracked path is `.playwright-mcp/`.
- All 22 session-tracked implementation and validation tasks are complete.

Recheck these facts at the start of the next session.

## Deployed environment

| Item | Value |
|---|---|
| Environment | `carrema Sales CS` |
| Dataverse URL | `https://org862d1967.crm.dynamics.com` |
| Environment ID | `7d8dcd87-2e21-e805-b9be-678794ecc80b` |
| Core solution | `AgentSidecarCore` |
| Live solution version | `1.0.0.19` |
| Core package | `solution-core/AgentSidecarCore.zip` |
| Pushed package SHA-256 | `63998259c667b52a8fbfd2f725b5fc8745775e056fad25eada5d8f615d9fc2b0` |
| Import job | `99dc3cb6-e420-46b5-9e36-03006fb81fc8` |
| Administration Code App ID | `bb1935e1-fc29-49b2-97a4-3c0de0c1b50b` |
| Sales Hub app ID | `3d77919b-a319-f111-8341-6045bd07e2cb` |
| SPA client ID | `51733b88-b854-441d-a253-57156285344d` |
| Tenant ID | `d92190b9-98e7-46da-8b11-580e06c7d15d` |

The package was imported only after commit `32d2493` was pushed. The live solution and Code App were verified after import.

## Current production sidecars

### Sales Hub Assistant

| Item | Value |
|---|---|
| Configuration ID | `79e1c0da-db9f-f111-aaad-0022480b10ac` |
| Agent | `Insights and actions` |
| Agent schema | `cr88d_insightsandactions_AChDbK` |
| Harness | GitHub Copilot |
| Binding solution | `msdyncesaleshubSidecarBinding` |
| Target app | Sales Hub |
| Target table | `contact` |

### Sales Hub HR Assistant

| Item | Value |
|---|---|
| Configuration ID | `d6e09600-8ba1-f111-aaad-0022480b10ac` |
| Agent | `HR Mgmt Classic` |
| Agent schema | `cr0b1_HRMgmtClassic` |
| Harness | Standard Copilot Studio |
| Binding solution | `msdyncesaleshubHRSidecarBinding` |
| Target app | Sales Hub |
| Target table | `contact` |

Both configurations are active and deployed. Four active Target Binding rows cover the two selected Contact main forms for both configurations. The application ID is intentionally a non-unique grouping key; configuration GUID is the sidecar identity.

## Deployed product baseline

Preserve all of the following unless the user explicitly changes the requirement:

- Up to 10 independently configured sidecars may coexist in one model-driven app.
- Each pane is keyed by immutable configuration GUID.
- Agent connection, authentication, conversation, consent, and dialog state are pane-local.
- App ID groups configurations and is not a uniqueness boundary.
- Overlapping form bindings use one shared, reference-counted form dispatcher.
- Navigation updates local context only and does not send an agent activity by itself.
- Unsupported entities collapse the side-pane rail without deleting pane state.
- Durable user-owned conversation references and display-safe activities are stored in Dataverse.
- Recent conversations resume the real Agents SDK conversation and replay the saved transcript.
- Saved conversations and related activities can be deleted after confirmation.
- Greeting-only sessions stay out of Recent conversations.
- The chat uses the Messages-inspired treatment with blue outgoing bubbles.
- List analysis asks for **Current view (all matching rows)** or **All accessible records** before sending list details.
- Repeated submission of the same connector-consent decision is deduplicated.
- Distinct MCP write-consent requests remain distinct and are never auto-approved.
- No `AdminConsentBypass` administration feature exists.
- Security-role names are context only and never authorization.
- Direct-list-first startup remains out of scope: a selected main form must initialize the panes before list navigation can preserve and use them.

Do not reintroduce proactive navigation or context activities. Do not solve lifecycle gaps by contacting the agent during navigation.

## Administration experience

Creation now:

1. Discovers published Copilot Studio agents in the current environment.
2. Shows a Fluent UI published-agent dropdown.
3. Infers standard versus GitHub Copilot harness from bot metadata.
4. Generates the correct cloud-aware endpoint.
5. Revalidates the selected agent immediately before deployment.
6. Offers the Copilot Studio agent logo, a custom upload, or the default icon.

Custom icon guidance:

- PNG or JPEG only.
- Square image recommended.
- 128x128 or 256x256 preferred.
- Maximum 512x512.
- Maximum 256 KB.
- Transparent PNG recommended.
- SVG uploads are not accepted.

Existing deployed sidecars expose **Edit tables & icon**. The edit flow:

- Rediscovers the target app's current tables and forms when opened.
- Allows table/form association and icon changes only.
- Preserves configuration ID, pane ID, app, agent connection, Entra identity, binding solution, and conversation history.
- Shows missing or deactivated forms explicitly.
- Requires at least one available selected form.
- Adds new form ownership before removing old ownership.
- Preserves the shared dispatcher while another active configuration owns the form.
- Creates and verifies a replacement custom icon before deleting the previous owned icon.
- Rejects stale edits.
- Uses an atomic transient edit lease so two administrators cannot mutate the same sidecar concurrently.
- Performs rollback compensation and post-operation readback.

The transient lease uses:

- Reserved form ID: `ffffffff-ffff-4fff-bfff-ffffffffffff`
- Table marker: `__sidecar_edit_lock__`
- Reclaim threshold: two hours

Lease rows must never appear as product bindings and must be cleaned up after success or failure.

## Live verification completed

The deployed administration app was verified to:

- List published agents from the current environment.
- Identify `HR Mgmt Classic` as standard harness.
- Identify `Insights and actions` as GitHub Copilot harness.
- Show agent, upload, and default icon options.
- Open the deployed-sidecar editor with current form selections.
- Default to **Keep the current icon**.
- Display the immutable identity notice.
- Complete a no-op save successfully.
- Leave no edit lease row.
- Preserve both configurations' immutable identity fields.

The ordinary Sales Hub shell was verified to:

- Create both independent panes on a supported Contact form.
- Connect each pane independently.
- Return different pane-specific verification responses.
- Keep each pane's transcript out of the other pane.
- Save, resume, replay, and delete each temporary verification conversation.
- Remove all temporary `PANE-OK` activities after deletion.
- Show the Current view versus All accessible records list-scope dialog.
- Cancel list analysis without sending the prompt.
- Collapse the side-pane rail on unsupported Accounts navigation.
- Disable the HR sidecar without affecting the Insights sidecar.
- Restore both panes after re-enabling the HR sidecar.

The production sidecars were not uninstalled during live verification. Scoped uninstall remains covered by focused tests and package checks; do not uninstall either retained sidecar merely to repeat that test.

The administration host emitted one React warning from the Power Apps `es6.webplayer-host-ui.js` bundle. No Agent Sidecar source appeared in the stack, and administration operations completed successfully. Treat it as host noise unless a future reproduction links it to product behavior.

## Important runtime constraints

### Standard and GitHub harness endpoints

Both harnesses use the dotted public-cloud environment host:

`7d8dcd872e21e805b9be678794ecc8.0b.environment.api.powerplatform.com`

Standard harness path:

`/copilotstudio/dataverse-backed/authenticated/bots/{schema}/conversations?api-version=2022-03-01-preview`

GitHub Copilot harness path:

`/copilotstudio/agenticruntime/3p/dataverse-backed/authenticated/bots/{schema}?api-version=1`

Bot templates beginning with `cliagent-` use the GitHub Copilot harness. Other published bot templates use the standard harness.

Cloud inference uses `getContext().app.dataverseOrgUrl` when available and supports public, US Government, GCC High, DoD/appsplatform, and China clouds.

### Conversation identity

Conversation history remains scoped by:

- Signed-in Dataverse owner.
- Sidecar configuration ID.
- Model-driven app ID.
- Agent schema name.
- Presence of at least one persisted user activity for Recent conversations.

Do not collapse history to app ID or share one conversation selector across panes.

### Configuration edit invariants

An in-place edit must never change:

- Configuration GUID.
- App ID or app unique name.
- Agent schema or connection.
- Tenant or public-client application ID.
- Binding solution unique name.
- Pane identity.
- Existing conversations.

## Key files

| File | Responsibility |
|---|---|
| `src/services/real-sidecar-admin-provider.ts` | Live administration discovery, deployment, editing, leases, rollback, icon lifecycle, binding ownership, and readback. |
| `src/lib/copilot-studio-agent.ts` | Harness inference, cloud inference, endpoint generation, and strict URL validation. |
| `src/components/SidecarWizard/SidecarWizard.tsx` | Published-agent and icon-selection creation UX. |
| `src/components/SidecarDetails/SidecarEditorDialog.tsx` | In-place tables/forms/icon editor. |
| `src/pages/SidecarDetailPage.tsx` | Editor loading, mutations, progress, and error presentation. |
| `src/hooks/useSidecarAdministration.ts` | React Query orchestration and cache invalidation. |
| `src/services/sidecar-admin-contracts.ts` | Administration provider contract. |
| `src/types/sidecar-admin-models.ts` | Published-agent, harness, edit, update, and unavailable-form models. |
| `model-driven/webresources/maftagsc_/copilot/agentSidePane.ts` | Sidecar runtime, auth, Web Chat, context, history, consent, and list analysis. |
| `model-driven/webresources/maftagsc_/copilot/agentSidePaneLauncher.ts` | Shared form dispatcher and multi-pane initialization. |
| `model-driven/webresources/maftagsc_/copilot/sidecarConfigurationRepository.ts` | Multi-configuration lookup for the current app/form. |
| `model-driven/webresources/maftagsc_/copilot/sidecarConversationRepository.ts` | Conversation and activity persistence. |
| `model-driven/webresources/maftagsc_/copilot/sidecarListAnalysis.ts` | List-intent detection and selected-scope envelope. |
| `model-driven/webresources/maftagsc_/copilot/sidecarConnectorConsent.ts` | Same-request consent deduplication. |
| `src/App.test.tsx` | Creation and editor interaction coverage. |
| `src/services/mock-sidecar-admin-provider.test.ts` | Edit invariants and stale-version coverage. |
| `src/lib/copilot-studio-agent.test.ts` | Harness and sovereign-cloud endpoint coverage. |
| `model-driven/build.test.mjs` | Maintained web-resource and packaged Code App regression checks. |
| `solution-core/AgentSidecarCore.zip` | Importable production Core solution. |

## Generated artifacts

Do not manually edit generated or maintained projections:

- `src/generated/`
- `model-driven/webresources/maftagsc_/copilot/agentSidePane.js`
- `model-driven/webresources/maftagsc_/copilot/agentSidePane.html`
- Projected copies under `solution/WebResources/`
- Packaged Code App files inside `solution-core/AgentSidecarCore.zip`

Change canonical source, then use the repository's established generation and packaging commands. Confirm byte-level projection/package consistency before deployment.

## Established validation baseline

The release passed:

- Application lint with zero warnings.
- TypeScript checks.
- 13 application test files and 88 tests.
- Production Code App build.
- Model-driven TypeScript checks.
- Maintained web-resource build.
- 9 model-driven tests.
- Core package regression checks.
- ZIP integrity checks.
- Exact `dist`-to-package byte comparison for all seven Code App files.
- `index.html` as the first `CodeAppPackageUri`.

For a new enhancement, run the smallest focused tests while iterating, then rerun the established release validations before packaging.

## Enhancement-session guidance

The user intends to make additional Agent Sidecar enhancements but has not yet defined the next feature in this handoff. Follow the planning cadence:

1. Read the implementation before asking anything the code already answers.
2. Ask one atomic question per turn.
3. Give a recommended answer with each question.
4. Use lettered options whenever more than one answer is plausible.
5. Resolve dependencies depth-first.
6. Update `CONTEXT.md` inline when business terminology is sharpened.
7. Offer an ADR only for a hard-to-reverse, surprising decision with a real trade-off.
8. Do not begin schema or runtime changes while the behavior boundary is unstable.

When scope becomes stable, implement the enhancement end to end rather than stopping at a plan.

## Ready-to-paste prompt for the next session

```text
Continue the Agent Sidecar enhancement effort in
`martycarreras-psnl/CopilotStudioAgentMDA` on `main`.

First read:
- `docs/enhancement-handoff-2026-08-27.md`
- `README.md`
- `CONTEXT.md`
- `AGENTS.md`
- `.github/instructions/README.md`
- Any path-specific repository instructions that apply to files you may change

Confirm the current repository and deployment state before changing anything.
Preserve the permanent workflow rule: every intended change must be committed
and pushed to GitHub before deployment. Treat `.playwright-mcp/` as an unrelated
untracked artifact; do not stage, modify, or delete it.

The deployed baseline is Agent Sidecar Core `1.0.0.19` in `carrema Sales CS`,
with multiple independent same-app sidecars, published-agent discovery,
standard/GitHub harness inference, agent/custom/default icons, in-place
table/form/icon editing, durable pane-local conversations, navigation-local
context, list-analysis scope selection, unsupported-entity collapse, and
same-request connector-consent deduplication.

Do not reintroduce proactive navigation/context events. Do not auto-approve
distinct MCP write-consent requests. Do not add `AdminConsentBypass` unless I
explicitly reopen that scope. Preserve configuration GUID as pane identity and
app ID as a non-unique grouping key.

I want to define and implement the next Agent Sidecar enhancement. Follow the
repository's one-question-at-a-time grilling cadence. Read the existing
implementation before asking anything the code already answers, recommend an
answer with every question, present multiple choices as lettered options, and
walk dependencies depth-first.

Once scope is stable, implement the enhancement end to end. Add focused tests,
regenerate maintained web-resource projections, update the Core solution
package, run the established validations, commit and push all intended changes,
then deploy only the pushed package to `carrema Sales CS` and verify it in the
ordinary model-driven app shell.
```
