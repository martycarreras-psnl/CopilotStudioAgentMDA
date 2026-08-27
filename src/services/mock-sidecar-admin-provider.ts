import {
  mockAdminAccess,
  mockSidecarConfigurations,
  mockTable,
  mockTargetApps,
} from '@/mockData/sidecarAdministration';
import type { SidecarAdministrationProvider } from '@/services/sidecar-admin-contracts';
import type {
  DeploymentImpact,
  PublishedAgent,
  SidecarConfiguration,
  SidecarDraft,
  SidecarProgressCallback,
  TargetModelDrivenApp,
} from '@/types/sidecar-admin-models';
import { isGuid, parseCopilotStudioConnectionString } from '@/utils/agent-link';
import {
  buildCopilotStudioConnectionString,
} from '@/lib/copilot-studio-agent';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireConfiguration(store: SidecarConfiguration[], id: string): SidecarConfiguration {
  const configuration = store.find((item) => item.id === id);
  if (!configuration) throw new Error('The sidecar configuration could not be found.');
  return configuration;
}

function now(): string {
  return new Date().toISOString();
}

function editVersion(configuration: SidecarConfiguration): string {
  return JSON.stringify({
    tables: configuration.tables
      .flatMap((table) => table.forms.map((form) => `${table.logicalName}:${form.formId}`))
      .sort(),
    iconSource: configuration.iconSource,
    iconContentHash: configuration.iconContentHash,
  });
}

export function createMockSidecarAdministrationProvider(): SidecarAdministrationProvider {
  const configurations = clone(mockSidecarConfigurations);
  const targetApps = clone(mockTargetApps);
  const environmentId = 'f9b87f8b-0abf-e629-affb-b13195d1ed14';
  const publishedAgents: PublishedAgent[] = [
    {
      botId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Field Guide',
      schemaName: 'contoso_FieldGuide',
      environmentId,
      published: true,
      publishedOn: '2026-08-20T12:00:00Z',
      harness: 'standard',
      connectionString: buildCopilotStudioConnectionString(
        environmentId,
        'contoso_FieldGuide',
        'standard',
      ),
    },
    {
      botId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Insights and actions',
      schemaName: 'cr88d_insightsandactions_AChDbK',
      environmentId,
      published: true,
      publishedOn: '2026-08-21T12:00:00Z',
      harness: 'github',
      connectionString: buildCopilotStudioConnectionString(
        environmentId,
        'cr88d_insightsandactions_AChDbK',
        'github',
      ),
    },
  ];

  return {
    async getAccessContext() {
      return clone(mockAdminAccess);
    },
    async listConfigurations() {
      return clone(configurations);
    },
    async getConfiguration(id) {
      const configuration = configurations.find((item) => item.id === id);
      if (!configuration) return null;
      configuration.lastValidatedAt = now();
      return clone(configuration);
    },
    async discoverTargetApps() {
      return clone(targetApps);
    },
    async resolveManualTargetApp(appId) {
      if (!isGuid(appId)) throw new Error('Enter a valid Model-driven App ID.');
      const existing = targetApps.find((item) => item.appId.toLowerCase() === appId.toLowerCase());
      if (existing) return clone(existing);
      const manual: TargetModelDrivenApp = {
        id: `manual-${appId}`,
        appId,
        uniqueName: `manual_${appId.slice(0, 8)}`,
        displayName: 'Manually entered app',
        description: 'Metadata will be discovered before deployment.',
        tables: [
          mockTable('account', 'Account', 1),
          mockTable('contact', 'Contact', 1),
        ],
      };
      targetApps.push(manual);
      return clone(manual);
    },
    async listPublishedAgents() {
      return clone(publishedAgents);
    },
    async resolveAgentLink(connectionString, environmentId) {
      return parseCopilotStudioConnectionString(connectionString, environmentId);
    },
    async previewDeployment(draft) {
      const enabledCount = draft.tables.filter((table) => table.enabled).length;
      const impacts: DeploymentImpact[] = [
        {
          title: 'Create a dedicated Target Binding solution',
          detail: `${draft.bindingSolutionUniqueName} will contain only sidecar-owned structural bindings for ${draft.targetApp.displayName}.`,
          intent: 'change',
        },
        {
          title: `Enable active main forms for ${enabledCount} tables`,
          detail: 'All selected tables are enabled by default. Future app tables still require drift-review approval before form mutation.',
          intent: 'change',
        },
        {
          title: 'Reuse the existing Copilot Studio agent',
          detail: `${draft.agent.displayName} (${draft.agent.schemaName}) will be referenced; no agent or knowledge source will be created.`,
          intent: 'info',
        },
        {
          title: 'Capture a last-known-good snapshot',
          detail: 'A failed deployment will automatically restore the pre-change state and report any incomplete rollback as a blocking health issue.',
          intent: 'safety',
        },
      ];
      return clone(impacts);
    },
    async deploy(draft: SidecarDraft, onProgress?: SidecarProgressCallback) {
      const enabledForApp = configurations.filter((item) =>
        item.appId.toLowerCase() === draft.targetApp.appId.toLowerCase()
        && item.lifecycleState !== 'disabled',
      );
      if (enabledForApp.length >= 10) {
        throw new Error('A Model-driven App can have at most 10 enabled sidecar configurations.');
      }
      if (configurations.some((item) =>
        item.bindingSolutionUniqueName.toLowerCase() === draft.bindingSolutionUniqueName.trim().toLowerCase()
      )) {
        throw new Error('Choose a unique Target Binding solution name.');
      }
      const forms = draft.tables.filter((table) => table.enabled).flatMap((table) => table.forms.filter((form) => form.enabled).map((form) => `${table.displayName} — ${form.name}`));
      for (let index = 0; index < forms.length; index += 1) {
        onProgress?.({ phase: 'forms', current: index + 1, total: forms.length, label: forms[index] });
      }
      onProgress?.({ phase: 'publish', current: forms.length, total: forms.length, label: 'Publishing form changes' });
      onProgress?.({ phase: 'finalize', current: 1, total: 1, label: 'Finalizing configuration' });
      const deployed: SidecarConfiguration = {
        id: crypto.randomUUID(),
        name: draft.name,
        appId: draft.targetApp.appId,
        appUniqueName: draft.targetApp.uniqueName,
        appDisplayName: draft.targetApp.displayName,
        paneTitle: draft.paneTitle,
        paneWidth: draft.paneWidth,
        agentDisplayName: draft.agent.displayName,
        agentSchemaName: draft.agent.schemaName,
        agentConnectionString: draft.agentConnectionString,
        tenantId: draft.tenantId,
        publicClientApplicationId: draft.publicClientApplicationId,
        environmentId: draft.agent.environmentId,
        bindingSolutionUniqueName: draft.bindingSolutionUniqueName,
        iconSource: draft.icon.source,
        iconContentHash: draft.icon.content?.contentHash,
        iconMimeType: draft.icon.content?.mimeType,
        lifecycleState: 'deployed',
        healthState: 'healthy',
        enabledSurfaces: ['forms'],
        autoEnableNewTables: true,
        tables: draft.tables.filter((table) => table.enabled),
        driftItems: [],
        lastValidatedAt: now(),
        lastOperationSummary: 'Deployment completed and live metadata read-back passed.',
        healthChecks: [
          { id: 'config', label: 'Configuration', state: 'pass', detail: 'The configuration resolves by its immutable ID.' },
          { id: 'forms', label: 'Active main forms', state: 'pass', detail: 'Selected forms passed read-back verification.' },
          { id: 'identity', label: 'Delegated identity', state: 'pass', detail: 'Public-client setup values are complete.' },
          { id: 'agent', label: 'Copilot Studio agent', state: 'pass', detail: 'Existing published agent resolved successfully.' },
        ],
      };
      configurations.unshift(deployed);
      return clone(deployed);
    },
    async getEditModel(id) {
      const configuration = requireConfiguration(configurations, id);
      const target = targetApps.find((item) => item.appId === configuration.appId);
      if (!target) throw new Error('The target Model-driven App could not be rediscovered.');
      const selected = new Set(
        configuration.tables.flatMap((table) =>
          table.forms.map((form) => `${table.logicalName}:${form.formId}`),
        ),
      );
      const agentIcon = publishedAgents.find(
        (agent) => agent.schemaName === configuration.agentSchemaName,
      )?.icon;
      return {
        tables: clone(target.tables.map((table) => ({
          ...table,
          enabled: table.forms.some((form) => selected.has(`${table.logicalName}:${form.formId}`)),
          forms: table.forms.map((form) => ({
            ...form,
            enabled: selected.has(`${table.logicalName}:${form.formId}`),
          })),
        }))),
        agentIcon: agentIcon ? clone(agentIcon) : undefined,
        editVersion: editVersion(configuration),
      };
    },
    async updateMutableConfiguration(id, update, onProgress) {
      const configuration = requireConfiguration(configurations, id);
      if (update.expectedEditVersion !== editVersion(configuration)) {
        throw new Error('This sidecar changed after editing began. Reload it before saving.');
      }
      const selected = update.tables
        .filter((table) => table.enabled)
        .map((table) => ({
          ...table,
          forms: table.forms.filter((form) => form.enabled),
          formCount: table.forms.filter((form) => form.enabled).length,
        }))
        .filter((table) => table.forms.length > 0);
      if (!selected.length) throw new Error('Select at least one form.');
      onProgress?.({ phase: 'forms', current: 1, total: 1, label: 'Updating table and form bindings' });
      configuration.tables = clone(selected);
      if (update.icon) {
        configuration.iconSource = update.icon.source;
        configuration.iconContentHash = update.icon.content?.contentHash;
        configuration.iconMimeType = update.icon.content?.mimeType;
        configuration.iconWebResourceName = update.icon.source === 'default'
          ? undefined
          : `mock/${update.icon.content?.contentHash ?? 'icon'}`;
      }
      configuration.healthState = 'healthy';
      configuration.lastValidatedAt = now();
      configuration.lastOperationSummary = 'Tables, forms, and icon updated in place.';
      await new Promise((resolve) => setTimeout(resolve, 150));
      return clone(configuration);
    },
    async validate(id) {
      const configuration = requireConfiguration(configurations, id);
      configuration.lastValidatedAt = now();
      configuration.lastOperationSummary = configuration.driftItems.length
        ? 'Validation detected drift; no changes were applied.'
        : 'Manual health validation completed.';
      return clone(configuration);
    },
    async reconcile(id, onProgress?: SidecarProgressCallback) {
      const configuration = requireConfiguration(configurations, id);
      onProgress?.({ phase: 'forms', current: 1, total: 1, label: 'Reapplying handlers' });
      const target = targetApps.find((item) => item.appId === configuration.appId);
      configuration.tables = target ? target.tables.filter((table) => table.enabled) : configuration.tables;
      configuration.driftItems = [];
      configuration.lifecycleState = 'deployed';
      configuration.healthState = 'healthy';
      configuration.lastValidatedAt = now();
      configuration.lastOperationSummary = 'Administrator-approved reconciliation completed and read-back passed.';
      configuration.healthChecks = configuration.healthChecks.map((check) => ({
        ...check,
        state: 'pass',
        detail: check.id === 'forms' ? 'Live metadata matches the approved configuration.' : check.detail,
      }));
      return clone(configuration);
    },
    async setEnabled(id, enabled, onProgress?: SidecarProgressCallback) {
      const configuration = requireConfiguration(configurations, id);
      if (enabled && configuration.healthState === 'critical') {
        throw new Error('Resolve blocking health failures before enabling this sidecar.');
      }
      if (enabled) {
        const enabledForApp = configurations.filter((item) =>
          item.id !== id
          && item.appId.toLowerCase() === configuration.appId.toLowerCase()
          && item.lifecycleState !== 'disabled',
        );
        if (enabledForApp.length >= 10) {
          throw new Error('A Model-driven App can have at most 10 enabled sidecar configurations.');
        }
      }
      onProgress?.({ phase: 'forms', current: 1, total: 1, label: enabled ? 'Enabling bindings' : 'Disabling bindings' });
      configuration.lifecycleState = enabled ? 'deployed' : 'disabled';
      configuration.healthState = enabled ? 'healthy' : configuration.healthState;
      configuration.lastValidatedAt = now();
      configuration.lastOperationSummary = enabled
        ? 'Sidecar enabled after health validation.'
        : 'Sidecar disabled; configuration and owned bindings were retained.';
      return clone(configuration);
    },
    async uninstall(id, onProgress?: SidecarProgressCallback) {
      const index = configurations.findIndex((item) => item.id === id);
      if (index < 0) throw new Error('The sidecar configuration could not be found.');
      onProgress?.({ phase: 'cleanup', current: 1, total: 1, label: 'Removing bindings and configuration' });
      configurations.splice(index, 1);
    },
  };
}
