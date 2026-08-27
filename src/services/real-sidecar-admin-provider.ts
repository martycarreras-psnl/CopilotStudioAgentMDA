import { getContext } from '@microsoft/power-apps/app';
import { AppmodulesService } from '@/generated/services/AppmodulesService';
import { BotsService } from '@/generated/services/BotsService';
import type { Bots } from '@/generated/models/BotsModel';
import { Maftagsc_sidecarconfigurationsService as Configurations } from '@/generated/services/Maftagsc_sidecarconfigurationsService';
import { Maftagsc_targetbindingsService as Bindings } from '@/generated/services/Maftagsc_targetbindingsService';
import { PublishersService } from '@/generated/services/PublishersService';
import { RolesService } from '@/generated/services/RolesService';
import { SolutionsService } from '@/generated/services/SolutionsService';
import { SystemformsService } from '@/generated/services/SystemformsService';
import { SystemuserrolescollectionService } from '@/generated/services/SystemuserrolescollectionService';
import { SystemusersService } from '@/generated/services/SystemusersService';
import { Maftagsc_sidecarconfigurationsmaftagsc_healthstate as HealthOptions, Maftagsc_sidecarconfigurationsstatuscode as StatusOptions, type Maftagsc_sidecarconfigurations } from '@/generated/models/Maftagsc_sidecarconfigurationsModel';
import { Maftagsc_targetbindingsmaftagsc_validationstate as ValidationOptions, type Maftagsc_targetbindings } from '@/generated/models/Maftagsc_targetbindingsModel';
import type { SidecarAdministrationProvider } from '@/services/sidecar-admin-contracts';
import {
  addSolutionComponent,
  assertSidecarActionsAvailable,
  publishTables,
  publishWebResources,
} from '@/services/dataverse-custom-api';
import type { PublishedAgent, SidecarConfiguration, SidecarDraft, SidecarEditModel, SidecarHealthCheck, SidecarHealthState, SidecarLifecycleState, SidecarMutableUpdate, SidecarProgressCallback, TargetModelDrivenApp, TargetTable } from '@/types/sidecar-admin-models';
import { parseCopilotStudioConnectionString } from '@/utils/agent-link';
import { discoverAppForms, type DiscoveredForm } from '@/services/model-driven-app-discovery';
import { isInformationFormName } from '@/lib/target-forms';
import { hasOtherEnabledFormOwner } from '@/lib/shared-form-owner';
import {
  inspectSidecarIconBase64,
  sidecarIconWebResourceName,
} from '@/lib/sidecar-icon';
import {
  createSidecarIconWebResource,
  deleteSidecarIconWebResource,
  listSidecarIconWebResources,
} from '@/services/sidecar-icon-web-resource';
import {
  buildCopilotStudioConnectionString,
  inferCopilotStudioApiSuffix,
  inferCopilotStudioHarness,
} from '@/lib/copilot-studio-agent';

const ADMIN_ROLE_TEMPLATE = '627090ff-40a3-4053-8790-584edc5be201';
const SIDECAR_PUBLISHER = 'agentsidecar';
const LIBRARY = 'maftagsc_/copilot/agentSidePane.js';
const HANDLER = 'AgentSidecar.initializeGuide';
const ICON_OWNER_ROOT = 'maftagsc_/sidecars/';
const EDIT_LOCK_FORM_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
const EDIT_LOCK_TABLE = '__sidecar_edit_lock__';
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T> = { data?: T; error?: unknown };
type Form = DiscoveredForm;

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown };
    if (typeof record.message === 'string') return record.message;
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return String(error ?? 'Unknown Dataverse error');
}
function data<T>(result: Result<T>, operation: string): T {
  if (result.error) throw new Error(`${operation} failed: ${message(result.error)}`);
  if (result.data === undefined) throw new Error(`${operation} returned no data.`);
  return result.data;
}
function option<T extends number>(values: Record<T, string>, label: string): T {
  const found = Object.entries(values).find(([, value]) => value === label);
  if (!found) throw new Error(`Dataverse option '${label}' is unavailable.`);
  return Number(found[0]) as T;
}
function guid(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required.`);
  const normalized = value.trim().replace(/[{}]/g, '').toLowerCase();
  if (!GUID_PATTERN.test(normalized)) throw new Error(`${label} must be a valid GUID.`);
  return normalized;
}
function odataString(value: string): string {
  return value.trim().replace(/'/g, "''");
}
function cloudHostname(dataverseOrgUrl?: string): string {
  if (dataverseOrgUrl) {
    try {
      return new URL(dataverseOrgUrl).hostname;
    } catch {
      throw new Error('The current Dataverse organization URL is invalid.');
    }
  }
  return window.location.hostname;
}
function isOwnedIconName(value: string | undefined, configurationId: string): value is string {
  if (!value) return false;
  const key = guid(configurationId, 'Configuration ID').replace(/-/g, '');
  return value.startsWith(`${ICON_OWNER_ROOT}${key}/`)
    && /^icon_[0-9a-f]{16}\.(?:png|jpg)$/i.test(value.slice(`${ICON_OWNER_ROOT}${key}/`.length));
}
async function mapPublishedAgent(
  record: Bots,
  environmentId: string,
  apiSuffix: string,
): Promise<PublishedAgent> {
  const harness = inferCopilotStudioHarness(record.template);
  let icon;
  if (record.iconbase64) {
    try {
      icon = await inspectSidecarIconBase64(record.iconbase64);
    } catch {
      icon = undefined;
    }
  }
  return {
    botId: guid(record.botid, 'Copilot Studio agent ID'),
    displayName: record.name?.trim() || record.schemaname,
    schemaName: record.schemaname,
    environmentId,
    published: true,
    publishedOn: record.publishedon as string,
    harness,
    connectionString: buildCopilotStudioConnectionString(
      environmentId,
      record.schemaname,
      harness,
      apiSuffix,
    ),
    icon,
  };
}
const HEALTH = {
  none: option(HealthOptions, 'NotValidated'), healthy: option(HealthOptions, 'Healthy'),
  warning: option(HealthOptions, 'Warning'), critical: option(HealthOptions, 'Critical'),
};
const STATUS = {
  draft: option(StatusOptions, 'Draft'), deployed: option(StatusOptions, 'Deployed'),
  drift: option(StatusOptions, 'DriftDetected'), disabled: option(StatusOptions, 'Disabled'),
};
const VALIDATION = {
  none: option(ValidationOptions, 'NotValidated'), pass: option(ValidationOptions, 'Pass'),
  warning: option(ValidationOptions, 'Warning'), conflict: option(ValidationOptions, 'Conflict'),
};
function health(value: number): SidecarHealthState {
  return value === HEALTH.healthy ? 'healthy' : value === HEALTH.warning ? 'warning' : value === HEALTH.critical ? 'critical' : 'notValidated';
}
function lifecycle(record: Maftagsc_sidecarconfigurations): SidecarLifecycleState {
  return record.statecode === 1 || record.statuscode === STATUS.disabled ? 'disabled'
    : record.statuscode === STATUS.deployed ? 'deployed'
      : record.statuscode === STATUS.drift ? 'drift' : 'draft';
}
async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, '0')).join('');
}
function xml(value: string): XMLDocument {
  const document = new DOMParser().parseFromString(value, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('The target form XML is invalid.');
  return document;
}
interface HandlerMutation {
  value: string;
  handlerId: string;
  added: boolean;
}
function addHandler(value: string, id: string): HandlerMutation {
  const document = xml(value);
  const form = document.querySelector('form') ?? document.documentElement;
  let libraries = form.querySelector(':scope > formLibraries');
  if (!libraries) { libraries = document.createElement('formLibraries'); form.append(libraries); }
  if (![...libraries.querySelectorAll('Library')].some((item) => item.getAttribute('name') === LIBRARY)) {
    const library = document.createElement('Library');
    library.setAttribute('name', LIBRARY); library.setAttribute('libraryUniqueId', `{${crypto.randomUUID()}}`); libraries.append(library);
  }
  let events = form.querySelector(':scope > events');
  if (!events) { events = document.createElement('events'); form.append(events); }
  let onload = [...events.querySelectorAll(':scope > event')].find((item) => item.getAttribute('name')?.toLowerCase() === 'onload');
  if (!onload) { onload = document.createElement('event'); onload.setAttribute('name', 'onload'); onload.setAttribute('application', 'false'); onload.setAttribute('active', 'true'); events.append(onload); }
  let handlers = onload.querySelector(':scope > Handlers');
  if (!handlers) { handlers = document.createElement('Handlers'); onload.append(handlers); }
  const normalized = guid(id, 'Handler ID');
  const existing = [...handlers.querySelectorAll('Handler')].find((item) =>
    item.getAttribute('functionName') === HANDLER && item.getAttribute('libraryName') === LIBRARY,
  );
  if (existing) {
    const existingId = existing.getAttribute('handlerUniqueId');
    if (existingId) {
      return { value: new XMLSerializer().serializeToString(document), handlerId: guid(existingId, 'Existing handler ID'), added: false };
    }
    existing.setAttribute('handlerUniqueId', `{${normalized}}`);
    return { value: new XMLSerializer().serializeToString(document), handlerId: normalized, added: false };
  }
  if (![...handlers.querySelectorAll('Handler')].some((item) => item.getAttribute('handlerUniqueId')?.replace(/[{}]/g, '').toLowerCase() === normalized)) {
    const handler = document.createElement('Handler');
    handler.setAttribute('functionName', HANDLER); handler.setAttribute('libraryName', LIBRARY);
    handler.setAttribute('handlerUniqueId', `{${normalized}}`); handler.setAttribute('enabled', 'true');
    handler.setAttribute('parameters', ''); handler.setAttribute('passExecutionContext', 'true'); handlers.append(handler);
  }
  return { value: new XMLSerializer().serializeToString(document), handlerId: normalized, added: true };
}
function removeHandler(value: string, id: string): string {
  const document = xml(value); const normalized = guid(id, 'Handler ID');
  for (const handler of document.querySelectorAll('Handler')) {
    if (handler.getAttribute('handlerUniqueId')?.replace(/[{}]/g, '').toLowerCase() === normalized) handler.remove();
  }
  if (![...document.querySelectorAll('Handler')].some((item) => item.getAttribute('libraryName') === LIBRARY)) {
    for (const library of document.querySelectorAll('Library')) if (library.getAttribute('name') === LIBRARY) library.remove();
  }
  // Drop containers we may have emptied. Dataverse form-XML schema rejects an empty
  // <formLibraries>, <Handlers>, onload <event>, or <events> element
  // ("The element 'formLibraries' has incomplete content ... expected: 'Library'").
  // Remove inner-to-outer so a container emptied by a child removal is also cleaned up.
  for (const handlers of [...document.querySelectorAll('Handlers')]) if (!handlers.children.length) handlers.remove();
  for (const event of [...document.querySelectorAll('event')]) {
    if (event.getAttribute('name')?.toLowerCase() === 'onload' && !event.children.length) event.remove();
  }
  for (const events of [...document.querySelectorAll('events')]) if (!events.children.length) events.remove();
  for (const libraries of [...document.querySelectorAll('formLibraries')]) if (!libraries.children.length) libraries.remove();
  return new XMLSerializer().serializeToString(document);
}
function includesHandler(value: string, id: string): boolean {
  const normalized = guid(id, 'Handler ID');
  return [...xml(value).querySelectorAll('Handler')].some((item) =>
    item.getAttribute('handlerUniqueId')?.replace(/[{}]/g, '').toLowerCase() === normalized
    && item.getAttribute('functionName') === HANDLER
    && item.getAttribute('libraryName') === LIBRARY,
  );
}
function map(record: Maftagsc_sidecarconfigurations, bindings: Maftagsc_targetbindings[], checks: SidecarHealthCheck[] = []): SidecarConfiguration {
  const tables = new Map<string, TargetTable>();
  for (const binding of bindings) {
    const form = { formId: binding.maftagsc_formid, name: binding.maftagsc_formname ?? binding.maftagsc_formid, enabled: binding.maftagsc_enabled };
    const current = tables.get(binding.maftagsc_tablelogicalname);
    if (current) { current.formCount += 1; current.forms.push(form); current.enabled = current.enabled || binding.maftagsc_enabled; }
    else tables.set(binding.maftagsc_tablelogicalname, { logicalName: binding.maftagsc_tablelogicalname, displayName: binding.maftagsc_tabledisplayname, enabled: binding.maftagsc_enabled, formCount: 1, forms: [form] });
  }
  const healthState = health(record.maftagsc_healthstate);
  return {
    id: record.maftagsc_sidecarconfigurationid, name: record.maftagsc_name,
    appId: record.maftagsc_appid, appUniqueName: record.maftagsc_appuniquename, appDisplayName: record.maftagsc_appdisplayname,
    paneTitle: record.maftagsc_panetitle, paneWidth: record.maftagsc_panewidth,
    agentDisplayName: record.maftagsc_agentdisplayname, agentSchemaName: record.maftagsc_agentschemaname,
    agentConnectionString: record.maftagsc_agentconnectionstring, tenantId: record.maftagsc_tenantid,
    publicClientApplicationId: record.maftagsc_publicclientapplicationid, environmentId: record.maftagsc_environmentid,
    bindingSolutionUniqueName: record.maftagsc_bindingsolutionuniquename, lifecycleState: lifecycle(record), healthState,
    iconSource: record.maftagsc_iconsource === 'agent' || record.maftagsc_iconsource === 'uploaded'
      ? record.maftagsc_iconsource
      : 'default',
    iconWebResourceName: record.maftagsc_iconwebresourcename,
    iconContentHash: record.maftagsc_iconcontenthash,
    iconMimeType: record.maftagsc_iconmimetype,
    enabledSurfaces: ['forms'], autoEnableNewTables: record.maftagsc_autoenablenewtables,
    tables: [...tables.values()],
    driftItems: healthState === 'warning' ? [{ id: 'form-drift', kind: 'conflict', title: 'Live form metadata differs from the approved binding', detail: 'Review and approve reconciliation before changing live metadata.' }] : [],
    healthChecks: checks, lastValidatedAt: record.maftagsc_lastvalidatedat, lastOperationSummary: record.maftagsc_lastoperationsummary,
  };
}

export function createRealSidecarAdministrationProvider(): SidecarAdministrationProvider {
  const appForms = new Map<string, Map<string, Form[]>>();
  const appTableDisplayNames = new Map<string, Map<string, string>>();
  async function bindingsFor(id?: string): Promise<Maftagsc_targetbindings[]> {
    const configurationFilter = id
      ? `_maftagsc_sidecarconfiguration_value eq ${guid(id, 'Configuration ID')} and `
      : '';
    return data(await Bindings.getAll({
      filter: `${configurationFilter}maftagsc_formid ne '${EDIT_LOCK_FORM_ID}'`,
      top: 5000,
    }), 'List target bindings');
  }
  async function acquireEditLock(configurationId: string): Promise<string> {
    const existing = data(await Bindings.getAll({
      select: ['maftagsc_targetbindingid', 'createdon'],
      filter: `_maftagsc_sidecarconfiguration_value eq ${configurationId} and maftagsc_formid eq '${EDIT_LOCK_FORM_ID}'`,
      top: 1,
    }), 'Check sidecar edit lease')[0];
    if (existing) {
      const createdAt = existing.createdon ? Date.parse(existing.createdon) : Number.NaN;
      if (Number.isFinite(createdAt) && Date.now() - createdAt > 2 * 60 * 60 * 1000) {
        await Bindings.delete(existing.maftagsc_targetbindingid);
      } else {
        throw new Error('Another administrator is updating this sidecar. Try again after that update finishes.');
      }
    }
    try {
      const lease = data(await Bindings.create({
        maftagsc_name: 'Sidecar edit lease',
        maftagsc_tablelogicalname: EDIT_LOCK_TABLE,
        maftagsc_tabledisplayname: 'Sidecar edit lease',
        maftagsc_formid: EDIT_LOCK_FORM_ID,
        maftagsc_formname: 'Sidecar edit lease',
        maftagsc_enabled: false,
        maftagsc_handleruniqueid: crypto.randomUUID(),
        maftagsc_originalformfingerprint: 'lease',
        maftagsc_lastappliedfingerprint: 'lease',
        maftagsc_validationstate: VALIDATION.none,
        'maftagsc_sidecarconfiguration@odata.bind': `/maftagsc_sidecarconfigurations(${configurationId})`,
        statecode: 0,
        statuscode: 1,
      }), 'Acquire sidecar edit lease');
      return lease.maftagsc_targetbindingid;
    } catch (error) {
      throw new Error(
        /duplicate|key|already exists/i.test(message(error))
          ? 'Another administrator is updating this sidecar. Try again after that update finishes.'
          : `The sidecar edit lease could not be acquired: ${message(error)}`,
      );
    }
  }
  async function mutableEditVersion(
    record: Maftagsc_sidecarconfigurations,
    bindings: Maftagsc_targetbindings[],
  ): Promise<string> {
    return hash(JSON.stringify({
      lifecycleState: lifecycle(record),
      bindings: bindings.map((binding) => ({
        id: binding.maftagsc_targetbindingid,
        table: binding.maftagsc_tablelogicalname,
        form: binding.maftagsc_formid.toLowerCase(),
        enabled: binding.maftagsc_enabled,
      })).sort((left, right) => left.id.localeCompare(right.id)),
      icon: {
        source: record.maftagsc_iconsource || 'default',
        name: record.maftagsc_iconwebresourcename || '',
        hash: record.maftagsc_iconcontenthash || '',
        mime: record.maftagsc_iconmimetype || '',
      },
    }));
  }
  async function editModel(id: string): Promise<SidecarEditModel> {
    const configurationId = guid(id, 'Configuration ID');
    const [recordResult, currentBindings] = await Promise.all([
      Configurations.get(configurationId),
      bindingsFor(configurationId),
    ]);
    const record = data(recordResult, 'Read sidecar configuration');
    const app = await targetApp(record.maftagsc_appid);
    const selected = new Set(
      currentBindings
        .filter((binding) => record.statecode === 1 || binding.maftagsc_enabled)
        .map((binding) => `${binding.maftagsc_tablelogicalname}:${binding.maftagsc_formid.toLowerCase()}`),
    );
    const agents = data(await BotsService.getAll({
      select: ['botid', 'name', 'schemaname', 'publishedon', 'iconbase64', 'template'],
      filter: `schemaname eq '${odataString(record.maftagsc_agentschemaname)}' and statecode eq 0 and componentstate eq 0 and publishedon ne null`,
      top: 1,
    }), 'Read configured Copilot Studio agent');
    let agentIcon;
    if (agents[0]?.iconbase64) {
      try {
        agentIcon = await inspectSidecarIconBase64(agents[0].iconbase64);
      } catch {
        agentIcon = undefined;
      }
    }
    const tables = app.tables.map((table) => ({
      ...table,
      enabled: table.forms.some((form) => selected.has(`${table.logicalName}:${form.formId.toLowerCase()}`)),
      forms: table.forms.map((form) => ({
        ...form,
        available: true,
        enabled: selected.has(`${table.logicalName}:${form.formId.toLowerCase()}`),
      })),
    }));
    const tablesByName = new Map(tables.map((table) => [table.logicalName, table]));
    for (const binding of currentBindings.filter((item) =>
      selected.has(`${item.maftagsc_tablelogicalname}:${item.maftagsc_formid.toLowerCase()}`),
    )) {
      const key = `${binding.maftagsc_tablelogicalname}:${binding.maftagsc_formid.toLowerCase()}`;
      if (app.tables.some((table) =>
        table.forms.some((form) => `${table.logicalName}:${form.formId.toLowerCase()}` === key),
      )) continue;
      let table = tablesByName.get(binding.maftagsc_tablelogicalname);
      if (!table) {
        table = {
          logicalName: binding.maftagsc_tablelogicalname,
          displayName: binding.maftagsc_tabledisplayname,
          enabled: true,
          formCount: 0,
          forms: [],
        };
        tables.push(table);
        tablesByName.set(table.logicalName, table);
      }
      table.enabled = true;
      table.formCount += 1;
      table.forms.push({
        formId: binding.maftagsc_formid,
        name: binding.maftagsc_formname ?? binding.maftagsc_formid,
        enabled: true,
        available: false,
      });
    }
    return {
      tables,
      agentIcon,
      editVersion: await mutableEditVersion(record, currentBindings),
    };
  }
  async function formsFor(appIdUnique: string): Promise<Map<string, Form[]>> {
    const normalizedId = guid(appIdUnique, 'App metadata ID');
    const discovery = await discoverAppForms(normalizedId);
    appTableDisplayNames.set(normalizedId, discovery.tableDisplayNames);
    return discovery.formsByTable;
  }
  async function targetApp(id: string): Promise<TargetModelDrivenApp> {
    const app = data(await AppmodulesService.get(guid(id, 'Model-driven App ID'), { select: ['appmoduleid', 'appmoduleidunique', 'uniquename', 'name', 'description'] }), 'Read Model-driven App');
    const forms = await formsFor(app.appmoduleidunique); appForms.set(app.appmoduleid, forms);
    const displayNames = appTableDisplayNames.get(app.appmoduleidunique) ?? new Map<string, string>();
    return { id: app.appmoduleid, appId: app.appmoduleid, uniqueName: app.uniquename, displayName: app.name,
      description: app.description ?? 'Model-driven App in the current environment.',
      tables: [...forms.entries()].map(([logicalName, items]) => ({
        logicalName,
        displayName: displayNames.get(logicalName) ?? logicalName,
        enabled: true,
        formCount: items.length,
        forms: items.map((item) => ({ formId: item.formid, name: item.name ?? item.formid, enabled: isInformationFormName(item.name) })),
      })) };
  }
  async function sidecarPublisherId(): Promise<string> {
    const publishers = data(await PublishersService.getAll({
      select: ['publisherid'], filter: `uniquename eq '${SIDECAR_PUBLISHER}'`, top: 1,
    }), 'Find Agent Sidecar publisher');
    if (!publishers[0]) throw new Error('The Agent Sidecar publisher is unavailable.');
    return publishers[0].publisherid;
  }
  function bindingSolutionMarker(appId: string, configurationId: string): string {
    return `Agent Sidecar Target Binding for app ${guid(appId, 'Model-driven App ID')} configuration ${guid(configurationId, 'Configuration ID')}`;
  }
  async function findBindingSolution(uniqueName: string) {
    const normalizedName = uniqueName.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,64}$/.test(normalizedName)) {
      throw new Error('Target Binding solution must start with a letter and contain at most 65 letters, numbers, or underscores.');
    }
    return data(await SolutionsService.getAll({
      select: ['solutionid', 'description', 'ismanaged', '_publisherid_value'], filter: `uniquename eq '${odataString(normalizedName)}'`, top: 1,
    }), 'Find Target Binding solution')[0];
  }
  async function validateBindingSolutionName(uniqueName: string): Promise<void> {
    if (await findBindingSolution(uniqueName)) {
      throw new Error(`Solution ${uniqueName.trim()} already exists. Choose a unique Target Binding solution name.`);
    }
  }
  async function createBindingSolution(uniqueName: string, appId: string, configurationId: string): Promise<string> {
    const normalizedName = uniqueName.trim();
    const publisherId = await sidecarPublisherId();
    const created = data(await SolutionsService.create({
      friendlyname: normalizedName, uniquename: normalizedName,
      description: bindingSolutionMarker(appId, configurationId), version: '1.0.0.0',
      enabledforsourcecontrolintegration: false, sourcecontrolsyncstatus: 0,
      'publisherid@odata.bind': `/publishers(${publisherId})`,
    } as unknown as Parameters<typeof SolutionsService.create>[0]), 'Create Target Binding solution');
    return created.solutionid;
  }
  async function provisionIcon(
    draft: Pick<SidecarDraft, 'name' | 'bindingSolutionUniqueName' | 'icon'>,
    configurationId: string,
    onProgress?: SidecarProgressCallback,
  ): Promise<string | undefined> {
    if (draft.icon.source === 'default') return undefined;
    if (!draft.icon.content) throw new Error('The selected sidecar icon is unavailable.');
    onProgress?.({ phase: 'icon', current: 0, total: 1, label: 'Publishing sidecar icon' });
    const name = sidecarIconWebResourceName(configurationId, draft.icon.content);
    const created = data(await createSidecarIconWebResource({
      name,
      displayname: `${draft.name.trim()} icon`,
      description: `Agent Sidecar icon owned by configuration ${guid(configurationId, 'Configuration ID')}.`,
      content: draft.icon.content.base64,
      webresourcetype: draft.icon.content.mimeType === 'image/png' ? 5 : 6,
    }), 'Create sidecar icon web resource');
    try {
      await addSolutionComponent(draft.bindingSolutionUniqueName.trim(), created.webresourceid, 61);
      await publishWebResources([created.webresourceid]);
      const readBack = data(await listSidecarIconWebResources({
        select: ['webresourceid', 'name', 'content', 'webresourcetype'],
        filter: `webresourceid eq ${guid(created.webresourceid, 'Web resource ID')}`,
        top: 1,
      }), 'Read back sidecar icon web resource')[0];
      if (
        !readBack
        || readBack.name !== name
        || readBack.content !== draft.icon.content.base64
      ) {
        throw new Error('The sidecar icon web resource failed read-back validation.');
      }
      data(await Configurations.update(configurationId, {
        maftagsc_iconsource: draft.icon.source,
        maftagsc_iconwebresourcename: name,
        maftagsc_iconcontenthash: draft.icon.content.contentHash,
        maftagsc_iconmimetype: draft.icon.content.mimeType,
      }), 'Save sidecar icon metadata');
    } catch (error) {
      await deleteSidecarIconWebResource(created.webresourceid).catch(() => undefined);
      throw error;
    }
    onProgress?.({ phase: 'icon', current: 1, total: 1, label: 'Publishing sidecar icon' });
    return created.webresourceid;
  }
  async function deleteOwnedIcon(
    record: Maftagsc_sidecarconfigurations,
  ): Promise<void> {
    await deleteOwnedIconName(
      record.maftagsc_iconwebresourcename,
      record.maftagsc_sidecarconfigurationid,
    );
  }
  async function deleteOwnedIconName(
    name: string | undefined,
    configurationId: string,
  ): Promise<void> {
    if (!isOwnedIconName(name, configurationId)) {
      return;
    }
    const resources = data(await listSidecarIconWebResources({
      select: ['webresourceid', 'name'],
      filter: `name eq '${odataString(name)}'`,
      top: 2,
    }), 'Find owned sidecar icon');
    for (const resource of resources) {
      if (resource.name === name) {
        await deleteSidecarIconWebResource(resource.webresourceid);
      }
    }
  }
  async function validate(id: string): Promise<SidecarConfiguration> {
    const configurationId = guid(id, 'Configuration ID');
    const record = data(await Configurations.get(configurationId), 'Read sidecar configuration'); const bindings = await bindingsFor(configurationId);
    const [allBindings, activeConfigurations] = await Promise.all([
      bindingsFor(),
      Configurations.getAll({ select: ['maftagsc_sidecarconfigurationid'], filter: 'statecode eq 0', top: 5000 }),
    ]);
    const activeConfigurationIds = new Set(
      data(activeConfigurations, 'List enabled sidecar configurations')
        .map((configuration) => configuration.maftagsc_sidecarconfigurationid.toLowerCase()),
    );
    let warnings = 0; let failures = 0;
    for (const binding of bindings) {
      try {
        const form = data(await SystemformsService.get(guid(binding.maftagsc_formid, 'Form ID'), { select: ['formxml'] }), 'Read bound form');
        const present = includesHandler(form.formxml, binding.maftagsc_handleruniqueid);
        const shouldBePresent = (record.statecode === 0 && binding.maftagsc_enabled)
          || hasOtherEnabledFormOwner(
            allBindings,
            activeConfigurationIds,
            binding.maftagsc_formid,
            configurationId,
          );
        const presenceConflict = present !== shouldBePresent;
        const changed = record.statecode === 0
          && binding.maftagsc_enabled
          && await hash(form.formxml) !== binding.maftagsc_lastappliedfingerprint;
        const state = presenceConflict ? VALIDATION.conflict : changed ? VALIDATION.warning : VALIDATION.pass;
        if (presenceConflict) failures += 1; else if (changed) warnings += 1;
        if (state !== binding.maftagsc_validationstate) data(await Bindings.update(binding.maftagsc_targetbindingid, { maftagsc_validationstate: state }), 'Save binding validation');
      } catch { failures += 1; }
    }
    const state = failures ? HEALTH.critical : warnings ? HEALTH.warning : HEALTH.healthy;
    const summary = failures ? `${failures} target binding(s) failed validation.` : warnings ? `${warnings} live form change(s) require review.` : 'Health validation completed; configuration and live bindings match.';
    const updated = data(await Configurations.update(configurationId, { maftagsc_healthstate: state, maftagsc_lastvalidatedat: new Date().toISOString(), maftagsc_lastoperationsummary: summary, ...(warnings ? { statuscode: STATUS.drift } : {}) }), 'Save health status');
    const checks: SidecarHealthCheck[] = [
      { id: 'config', label: 'Configuration', state: 'pass', detail: 'The configuration resolves by its immutable ID.' },
      { id: 'forms', label: 'Active main forms', state: failures ? 'fail' : warnings ? 'warning' : 'pass', detail: summary },
      { id: 'identity', label: 'Delegated identity', state: record.maftagsc_tenantid && record.maftagsc_publicclientapplicationid ? 'pass' : 'fail', detail: 'Tenant and public-client identifiers are stored without secrets.' },
      { id: 'agent', label: 'Copilot Studio agent', state: 'pass', detail: `Configured agent: ${record.maftagsc_agentschemaname}.` },
    ];
    return map(updated, bindings, checks);
  }
  async function mutate(id: string, mode: 'apply' | 'remove', onProgress?: SidecarProgressCallback): Promise<Maftagsc_targetbindings[]> {
    assertSidecarActionsAvailable();
    const configurationId = guid(id, 'Configuration ID');
    const bindings = await bindingsFor(configurationId); const tables: string[] = [];
    async function hasLiveOtherOwner(formId: string): Promise<boolean> {
      const [allBindings, activeConfigurationsResult] = await Promise.all([
        bindingsFor(),
        Configurations.getAll({ select: ['maftagsc_sidecarconfigurationid'], filter: 'statecode eq 0', top: 5000 }),
      ]);
      const activeConfigurationIds = new Set(
        data(activeConfigurationsResult, 'List enabled sidecar configurations')
          .map((configuration) => configuration.maftagsc_sidecarconfigurationid.toLowerCase()),
      );
      return hasOtherEnabledFormOwner(
        allBindings,
        activeConfigurationIds,
        formId,
        configurationId,
      );
    }
    const changedBindings: Array<{ binding: Maftagsc_targetbindings; formId: string; handlerId: string }> = [];
    let processed = 0;
    for (const binding of bindings) {
      onProgress?.({ phase: 'forms', current: processed, total: bindings.length, label: `${binding.maftagsc_tabledisplayname} — ${binding.maftagsc_formname}` });
      const formId = guid(binding.maftagsc_formid, 'Form ID');
      const form = data(await SystemformsService.get(formId, { select: ['formid', 'formxml', 'objecttypecode'] }), 'Read bound form');
      const mutation = mode === 'apply' ? addHandler(form.formxml, binding.maftagsc_handleruniqueid) : undefined;
      if (mode === 'remove') {
        data(await Bindings.update(binding.maftagsc_targetbindingid, {
          maftagsc_enabled: false,
          maftagsc_validationstate: VALIDATION.none,
        }), 'Disable target binding');
      }
      const keepSharedHandler = mode === 'remove' && await hasLiveOtherOwner(formId);
      const next = mutation?.value ?? (keepSharedHandler
        ? form.formxml
        : removeHandler(form.formxml, binding.maftagsc_handleruniqueid));
      if (next !== form.formxml) data(await SystemformsService.update(form.formid, { formxml: next }), 'Update bound form');
      changedBindings.push({ binding, formId, handlerId: mutation?.handlerId ?? binding.maftagsc_handleruniqueid });
      if (form.objecttypecode) tables.push(form.objecttypecode);
      processed += 1;
      onProgress?.({ phase: 'forms', current: processed, total: bindings.length, label: `${binding.maftagsc_tabledisplayname} — ${binding.maftagsc_formname}` });
    }
    if (tables.length) { onProgress?.({ phase: 'publish', current: bindings.length, total: bindings.length, label: 'Publishing form changes' }); await publishTables(tables); }
    for (const { binding, formId, handlerId } of changedBindings) {
      if (mode === 'apply') {
        const readBack = data(await SystemformsService.get(formId, { select: ['formxml'] }), 'Read back bound form');
        data(await Bindings.update(binding.maftagsc_targetbindingid, {
          maftagsc_enabled: true,
          maftagsc_handleruniqueid: handlerId,
          maftagsc_lastappliedfingerprint: await hash(readBack.formxml),
          maftagsc_validationstate: VALIDATION.pass,
        }), 'Update target binding');
      }
    }
    return bindings;
  }

  return {
    async getAccessContext() {
      const context = await getContext();
      const users = data(await SystemusersService.getAll({ select: ['systemuserid', 'fullname'], filter: `azureactivedirectoryobjectid eq ${guid(context.user.objectId, 'Current user object ID')}`, top: 1 }), 'Resolve user');
      const environmentContext = {
        tenantId: context.user.tenantId,
        dataverseOrgUrl: context.app.dataverseOrgUrl,
      };
      if (!users[0]) return {
        displayName: context.user.fullName ?? context.user.userPrincipalName ?? 'Current user',
        isSystemAdministrator: false,
        ...environmentContext,
      };
      const roles = data(await RolesService.getAll({ select: ['roleid'], filter: `_roletemplateid_value eq ${ADMIN_ROLE_TEMPLATE}`, top: 50 }), 'Resolve administrator roles');
      const roleIds = new Set(roles.map((item) => item.roleid.toLowerCase()));
      const assignments = data(await SystemuserrolescollectionService.getAll({ select: ['roleid', 'systemuserid'], filter: `systemuserid eq ${guid(users[0].systemuserid, 'System user ID')}`, top: 500 }), 'Read role assignments');
      return {
        displayName: context.user.fullName || users[0].fullname || context.user.userPrincipalName || 'Current user',
        isSystemAdministrator: assignments.some((item) => roleIds.has(item.roleid.toLowerCase())),
        ...environmentContext,
      };
    },
    async listConfigurations() {
      const [records, bindings] = await Promise.all([Configurations.getAll({ orderBy: ['modifiedon desc'], top: 5000 }), bindingsFor()]);
      return data(records, 'List configurations').map((record) => map(record, bindings.filter((binding) => binding._maftagsc_sidecarconfiguration_value === record.maftagsc_sidecarconfigurationid)));
    },
    async getConfiguration(id) { try { const configurationId = guid(id, 'Configuration ID'); return map(data(await Configurations.get(configurationId), 'Read configuration'), await bindingsFor(configurationId)); } catch (error) { if (/not found|does not exist|404/i.test(message(error))) return null; throw error; } },
    async discoverTargetApps() {
      const apps = data(await AppmodulesService.getAll({ select: ['appmoduleid'], filter: 'statecode eq 0 and componentstate eq 0', orderBy: ['name asc'], top: 500 }), 'Discover apps');
      return Promise.all(apps.map((app) => targetApp(app.appmoduleid)));
    },
    resolveManualTargetApp: (appId) => targetApp(guid(appId, 'Model-driven App ID')),
    async listPublishedAgents() {
      const context = await getContext();
      const environmentId = guid(context.app.environmentId, 'Current environment ID');
      const apiSuffix = inferCopilotStudioApiSuffix(
        cloudHostname(context.app.dataverseOrgUrl),
      );
      const records = data(await BotsService.getAll({
        select: ['botid', 'name', 'schemaname', 'publishedon', 'iconbase64', 'template'],
        filter: 'statecode eq 0 and componentstate eq 0 and publishedon ne null',
        orderBy: ['name asc', 'schemaname asc'],
        top: 5000,
      }), 'List published Copilot Studio agents');
      return Promise.all(records.map((record) =>
        mapPublishedAgent(record, environmentId, apiSuffix),
      ));
    },
    async resolveAgentLink(connectionString, environmentId) {
      const parsed = parseCopilotStudioConnectionString(connectionString, environmentId); const context = await getContext();
      if (context.app.environmentId.toLowerCase() !== parsed.environmentId.toLowerCase()) throw new Error('The Copilot Studio agent must belong to the Code App environment.');
      const agents = data(await BotsService.getAll({ select: ['name', 'schemaname', 'publishedon', 'iconbase64'], filter: `schemaname eq '${odataString(parsed.schemaName)}' and statecode eq 0`, top: 1 }), 'Resolve agent');
      if (!agents[0]) throw new Error(`No active Copilot Studio agent named ${parsed.schemaName} was found.`);
      if (!agents[0].publishedon) throw new Error(`Copilot Studio agent ${parsed.schemaName} is not published.`);
      let icon;
      if (agents[0].iconbase64) {
        try {
          icon = await inspectSidecarIconBase64(agents[0].iconbase64);
        } catch {
          icon = undefined;
        }
      }
      return { ...parsed, displayName: agents[0].name || parsed.displayName, published: true, icon };
    },
    async previewDeployment(draft) {
      const selected = draft.tables.filter((item) => item.enabled);
      const count = selected.reduce((total, item) => total + item.forms.filter((form) => form.enabled).length, 0);
      return [
        { title: 'Create or reuse the Target Binding solution', detail: `${draft.bindingSolutionUniqueName} will own selected form components.`, intent: 'change' },
        { title: `Bind ${selected.length} tables and ${count} active main forms`, detail: 'The launcher is added idempotently with an owned handler identifier.', intent: 'change' },
        { title: 'Reuse the existing Copilot Studio agent', detail: `${draft.agent.displayName} is referenced; no agent is created.`, intent: 'info' },
        {
          title: draft.icon.source === 'default' ? 'Use the packaged sidecar icon' : 'Publish a configuration-specific sidecar icon',
          detail: draft.icon.source === 'agent'
            ? 'The Copilot Studio agent logo will be copied into the Target Binding solution.'
            : draft.icon.source === 'uploaded'
              ? 'The normalized uploaded logo will be copied into the Target Binding solution.'
              : 'No additional image web resource will be created.',
          intent: draft.icon.source === 'default' ? 'info' : 'change',
        },
        { title: 'Automatic rollback', detail: 'Failure removes only newly-added sidecar handlers and preserves unrelated form XML.', intent: 'safety' },
      ];
    },
    async deploy(draft: SidecarDraft, onProgress?: SidecarProgressCallback) {
      assertSidecarActionsAvailable();
      const context = await getContext();
      const currentEnvironmentId = guid(context.app.environmentId, 'Current environment ID');
      const selectedAgent = data(await BotsService.get(guid(draft.agent.botId, 'Copilot Studio agent ID'), {
        select: ['botid', 'name', 'schemaname', 'publishedon', 'iconbase64', 'template', 'statecode', 'componentstate'],
      }), 'Revalidate selected Copilot Studio agent');
      if (
        selectedAgent.statecode !== 0
        || selectedAgent.componentstate !== 0
        || !selectedAgent.publishedon
      ) {
        throw new Error('The selected Copilot Studio agent is no longer active and published.');
      }
      const refreshedAgent = await mapPublishedAgent(
        selectedAgent,
        currentEnvironmentId,
        inferCopilotStudioApiSuffix(cloudHostname(context.app.dataverseOrgUrl)),
      );
      if (
        refreshedAgent.schemaName !== draft.agent.schemaName
        || refreshedAgent.connectionString !== draft.agentConnectionString
      ) {
        throw new Error('The selected Copilot Studio agent changed after discovery. Select it again before deploying.');
      }
      const appId = guid(draft.targetApp.appId, 'Model-driven App ID');
      const tenantId = guid(draft.tenantId, 'Tenant ID');
      const clientId = guid(draft.publicClientApplicationId, 'Public-client Application ID');
      const environmentId = guid(draft.agent.environmentId, 'Environment ID');
      const enabledForApp = data(await Configurations.getAll({ select: ['maftagsc_sidecarconfigurationid'], filter: `maftagsc_appid eq '${appId}' and statecode eq 0`, top: 11 }), 'Check app sidecar limit');
      if (enabledForApp.length >= 10) throw new Error('A Model-driven App can have at most 10 enabled sidecar configurations.');
      await validateBindingSolutionName(draft.bindingSolutionUniqueName);
      const forms = appForms.get(draft.targetApp.appId) ?? await formsFor(draft.targetApp.id);
      const selectedForms = draft.tables
        .filter((item) => item.enabled)
        .flatMap((table) => {
          const enabledFormIds = new Set(table.forms.filter((form) => form.enabled).map((form) => form.formId));
          return (forms.get(table.logicalName) ?? [])
            .filter((form) => enabledFormIds.has(form.formid))
            .map((form) => ({ table, form }));
        });
      if (!selectedForms.length) throw new Error('Select at least one form under an enabled table.');
      const created: Maftagsc_sidecarconfigurations = data(await Configurations.create({
          maftagsc_name: draft.name.trim(), maftagsc_appid: appId, maftagsc_appuniquename: draft.targetApp.uniqueName,
          maftagsc_appdisplayname: draft.targetApp.displayName, maftagsc_panetitle: draft.paneTitle.trim(), maftagsc_panewidth: draft.paneWidth,
          maftagsc_agentdisplayname: draft.agent.displayName, maftagsc_agentschemaname: draft.agent.schemaName,
          maftagsc_agentconnectionstring: draft.agentConnectionString.trim(), maftagsc_tenantid: tenantId,
          maftagsc_publicclientapplicationid: clientId, maftagsc_environmentid: environmentId,
          maftagsc_bindingsolutionuniquename: draft.bindingSolutionUniqueName.trim(), maftagsc_autoenablenewtables: true,
          maftagsc_iconsource: draft.icon.source,
          maftagsc_healthstate: HEALTH.none, maftagsc_lastoperationsummary: 'Deployment is in progress.', statecode: 0, statuscode: STATUS.draft,
      }), 'Create configuration');
      const enabledAfterCreate = data(await Configurations.getAll({
        select: ['maftagsc_sidecarconfigurationid'],
        filter: `maftagsc_appid eq '${appId}' and statecode eq 0`,
        top: 11,
      }), 'Verify app sidecar limit');
      if (enabledAfterCreate.length > 10) {
        await Configurations.delete(created.maftagsc_sidecarconfigurationid);
        throw new Error('A concurrent deployment reached the 10-sidecar limit. No sidecar was added.');
      }
      let bindingSolutionId: string;
      try {
        bindingSolutionId = await createBindingSolution(
          draft.bindingSolutionUniqueName,
          appId,
          created.maftagsc_sidecarconfigurationid,
        );
      } catch (error) {
        await Configurations.delete(created.maftagsc_sidecarconfigurationid).catch(() => undefined);
        throw error;
      }
      const addedHandlers = new Map<string, string>();
      const createdBindings: Array<{ bindingId: string; formId: string }> = [];
      const tables: string[] = [];
      let createdIconId: string | undefined;
      try {
        createdIconId = await provisionIcon(
          draft,
          created.maftagsc_sidecarconfigurationid,
          onProgress,
        );
        let processed = 0;
        for (const { table, form } of selectedForms) {
          onProgress?.({ phase: 'forms', current: processed, total: selectedForms.length, label: `${table.displayName} — ${form.name}` });
          const formId = guid(form.formid, 'Form ID');
          const currentForm = data(
            await SystemformsService.get(formId, { select: ['formid', 'formxml', 'objecttypecode'] }),
            'Read current target form',
          );
          const mutation = addHandler(currentForm.formxml, crypto.randomUUID());
          if (mutation.value !== currentForm.formxml) data(await SystemformsService.update(formId, { formxml: mutation.value }), 'Update target form');
          if (mutation.added) addedHandlers.set(formId, mutation.handlerId);
          await addSolutionComponent(draft.bindingSolutionUniqueName.trim(), formId, 60);
          const binding = data(await Bindings.create({
            maftagsc_name: `${table.displayName} - ${form.name}`, maftagsc_tablelogicalname: table.logicalName,
            maftagsc_tabledisplayname: table.displayName, maftagsc_formid: formId, maftagsc_formname: form.name,
            maftagsc_enabled: true, maftagsc_handleruniqueid: mutation.handlerId, maftagsc_originalformfingerprint: await hash(currentForm.formxml),
            maftagsc_lastappliedfingerprint: await hash(mutation.value), maftagsc_validationstate: VALIDATION.pass,
            'maftagsc_sidecarconfiguration@odata.bind': `/maftagsc_sidecarconfigurations(${created.maftagsc_sidecarconfigurationid})`, statecode: 0, statuscode: 1,
          }), 'Create binding'); createdBindings.push({ bindingId: binding.maftagsc_targetbindingid, formId }); tables.push(table.logicalName);
          processed += 1;
          onProgress?.({ phase: 'forms', current: processed, total: selectedForms.length, label: `${table.displayName} — ${form.name}` });
        }
        if (tables.length) { onProgress?.({ phase: 'publish', current: selectedForms.length, total: selectedForms.length, label: 'Publishing form changes' }); await publishTables(tables); }
        let readBackDone = 0;
        for (const { bindingId, formId } of createdBindings) {
          onProgress?.({ phase: 'readback', current: readBackDone, total: createdBindings.length, label: 'Verifying deployed forms' });
          const readBack = data(await SystemformsService.get(formId, { select: ['formxml'] }), 'Read back deployed form');
          data(await Bindings.update(bindingId, { maftagsc_lastappliedfingerprint: await hash(readBack.formxml) }), 'Save deployed form fingerprint');
          readBackDone += 1;
          onProgress?.({ phase: 'readback', current: readBackDone, total: createdBindings.length, label: 'Verifying deployed forms' });
        }
        onProgress?.({ phase: 'finalize', current: 1, total: 1, label: 'Finalizing configuration' });
        data(await Configurations.update(created.maftagsc_sidecarconfigurationid, { maftagsc_healthstate: HEALTH.healthy, maftagsc_lastvalidatedat: new Date().toISOString(), maftagsc_lastoperationsummary: 'Deployment completed and read-back passed.', statuscode: STATUS.deployed }), 'Complete deployment');
        return validate(created.maftagsc_sidecarconfigurationid);
      } catch (error) {
        for (const [formId, handlerId] of addedHandlers) {
          try {
            const current = data(await SystemformsService.get(formId, { select: ['formxml'] }), 'Read form for rollback');
            data(await SystemformsService.update(formId, { formxml: removeHandler(current.formxml, handlerId) }), 'Remove sidecar handler');
          } catch { /* surfaced by the deployment failure */ }
        }
        if (tables.length) await publishTables(tables).catch(() => undefined);
        await Promise.all(createdBindings.map(({ bindingId }) => Bindings.delete(bindingId).catch(() => undefined)));
        let iconRollbackError: unknown;
        if (draft.icon.content) {
          try {
            await deleteOwnedIconName(
              sidecarIconWebResourceName(
                created.maftagsc_sidecarconfigurationid,
                draft.icon.content,
              ),
              created.maftagsc_sidecarconfigurationid,
            );
          } catch (cleanupError) {
            iconRollbackError = cleanupError;
          }
        } else if (createdIconId) {
          try {
            await deleteSidecarIconWebResource(createdIconId);
          } catch (cleanupError) {
            iconRollbackError = cleanupError;
          }
        }
        if (iconRollbackError) {
          await Configurations.update(created.maftagsc_sidecarconfigurationid, {
            maftagsc_healthstate: HEALTH.critical,
            maftagsc_lastoperationsummary: `Deployment failed and icon cleanup is incomplete: ${message(iconRollbackError)}`,
            statuscode: STATUS.draft,
          }).catch(() => undefined);
          throw new Error(
            `Deployment failed and rollback could not remove the configuration-owned icon. `
            + `The draft configuration and Target Binding solution were retained for recovery: ${message(error)}`,
          );
        }
        await Configurations.delete(created.maftagsc_sidecarconfigurationid).catch(() => undefined);
        await SolutionsService.delete(bindingSolutionId).catch(() => undefined);
        throw new Error(`Deployment failed and rollback was attempted: ${message(error)}`);
      }
    },
    getEditModel: editModel,
    async updateMutableConfiguration(
      id: string,
      update: SidecarMutableUpdate,
      onProgress?: SidecarProgressCallback,
    ) {
      assertSidecarActionsAvailable();
      const unexpected = Object.keys(update).filter(
        (key) => !['tables', 'icon', 'expectedEditVersion'].includes(key),
      );
      if (unexpected.length) {
        throw new Error(`Unsupported sidecar update field: ${unexpected[0]}.`);
      }
      const configurationId = guid(id, 'Configuration ID');
      const [recordResult, currentBindings, allBindings] = await Promise.all([
        Configurations.get(configurationId),
        bindingsFor(configurationId),
        bindingsFor(),
      ]);
      const record = data(recordResult, 'Read sidecar configuration');
      if (await mutableEditVersion(record, currentBindings) !== update.expectedEditVersion) {
        throw new Error('This sidecar changed after editing began. Reload it before saving.');
      }
      const app = await targetApp(record.maftagsc_appid);
      const availableForms = new Map<string, { table: TargetTable; form: TargetTable['forms'][number] }>();
      for (const table of app.tables) {
        for (const form of table.forms) {
          availableForms.set(`${table.logicalName}:${form.formId.toLowerCase()}`, { table, form });
        }
      }
      const desiredForms = new Map<string, { table: TargetTable; form: TargetTable['forms'][number] }>();
      for (const table of update.tables.filter((item) => item.enabled)) {
        for (const form of table.forms.filter((item) => item.enabled)) {
          const key = `${table.logicalName}:${guid(form.formId, 'Form ID')}`;
          const available = availableForms.get(key);
          if (!available) {
            throw new Error(`${table.displayName} — ${form.name} is no longer an active form in the target app.`);
          }
          desiredForms.set(key, available);
        }
      }
      if (!desiredForms.size) throw new Error('Select at least one form.');
      const currentByKey = new Map(currentBindings.map((binding) => [
        `${binding.maftagsc_tablelogicalname}:${guid(binding.maftagsc_formid, 'Form ID')}`,
        binding,
      ]));
      const additions = [...desiredForms].filter(([key]) => !currentByKey.has(key));
      const removals = [...currentByKey].filter(([key]) => !desiredForms.has(key));
      const configurationEnabled = record.statecode === 0;
      const activeConfigurationIds = new Set(
        data(await Configurations.getAll({
          select: ['maftagsc_sidecarconfigurationid'],
          filter: 'statecode eq 0',
          top: 5000,
        }), 'List enabled sidecar configurations')
          .map((configuration) => configuration.maftagsc_sidecarconfigurationid.toLowerCase()),
      );
      const changedForms = new Map<string, {
        undo: 'add' | 'remove';
        handlerId: string;
        table: string;
      }>();
      const addedBindingIds: string[] = [];
      const disabledBindings: Array<{ binding: Maftagsc_targetbindings; enabled: boolean }> = [];
      const tablesToPublish = new Set<string>();
      const oldIcon = {
        source: record.maftagsc_iconsource || 'default',
        name: record.maftagsc_iconwebresourcename,
        hash: record.maftagsc_iconcontenthash,
        mime: record.maftagsc_iconmimetype,
      };
      let newIconName: string | undefined;
      let iconChanged = false;
      let editLockId: string | undefined;
      try {
        editLockId = await acquireEditLock(configurationId);
        const [lockedRecord, lockedBindings] = await Promise.all([
          Configurations.get(configurationId),
          bindingsFor(configurationId),
        ]);
        if (
          await mutableEditVersion(
            data(lockedRecord, 'Recheck sidecar configuration'),
            lockedBindings,
          ) !== update.expectedEditVersion
        ) {
          throw new Error('This sidecar changed after editing began. Reload it before saving.');
        }
        if (update.icon) {
          if (update.icon.source === 'default') {
            data(await Configurations.update(configurationId, {
              maftagsc_iconsource: 'default',
              maftagsc_iconwebresourcename: '',
              maftagsc_iconcontenthash: '',
              maftagsc_iconmimetype: '',
            }), 'Use default sidecar icon');
            iconChanged = oldIcon.source !== 'default' || Boolean(oldIcon.name);
          } else {
            if (!update.icon.content) throw new Error('The selected sidecar icon is unavailable.');
            if (update.icon.content.contentHash === oldIcon.hash && oldIcon.name) {
              data(await Configurations.update(configurationId, {
                maftagsc_iconsource: update.icon.source,
              }), 'Update sidecar icon source');
              newIconName = oldIcon.name;
              iconChanged = oldIcon.source !== update.icon.source;
            } else {
              await provisionIcon({
                name: record.maftagsc_name,
                bindingSolutionUniqueName: record.maftagsc_bindingsolutionuniquename,
                icon: update.icon,
              }, configurationId, onProgress);
              newIconName = sidecarIconWebResourceName(configurationId, update.icon.content);
              iconChanged = true;
            }
          }
        }

        let processed = 0;
        const total = additions.length + removals.length;
        for (const [, desired] of additions) {
          onProgress?.({
            phase: 'forms',
            current: processed,
            total,
            label: `Adding ${desired.table.displayName} — ${desired.form.name}`,
          });
          const formId = guid(desired.form.formId, 'Form ID');
          const liveForm = data(await SystemformsService.get(formId, {
            select: ['formid', 'formxml', 'objecttypecode'],
          }), 'Read added target form');
          const handlerId = crypto.randomUUID();
          const mutation = configurationEnabled
            ? addHandler(liveForm.formxml, handlerId)
            : { value: liveForm.formxml, handlerId, added: false };
          if (mutation.value !== liveForm.formxml) {
            data(await SystemformsService.update(formId, { formxml: mutation.value }), 'Add sidecar to target form');
            changedForms.set(formId, {
              undo: 'remove',
              handlerId: mutation.handlerId,
              table: desired.table.logicalName,
            });
            tablesToPublish.add(desired.table.logicalName);
          }
          await addSolutionComponent(record.maftagsc_bindingsolutionuniquename, formId, 60);
          const binding = data(await Bindings.create({
            maftagsc_name: `${desired.table.displayName} - ${desired.form.name}`,
            maftagsc_tablelogicalname: desired.table.logicalName,
            maftagsc_tabledisplayname: desired.table.displayName,
            maftagsc_formid: formId,
            maftagsc_formname: desired.form.name,
            maftagsc_enabled: configurationEnabled,
            maftagsc_handleruniqueid: mutation.handlerId,
            maftagsc_originalformfingerprint: await hash(liveForm.formxml),
            maftagsc_lastappliedfingerprint: await hash(mutation.value),
            maftagsc_validationstate: configurationEnabled ? VALIDATION.pass : VALIDATION.none,
            'maftagsc_sidecarconfiguration@odata.bind': `/maftagsc_sidecarconfigurations(${configurationId})`,
            statecode: 0,
            statuscode: 1,
          }), 'Create target binding');
          addedBindingIds.push(binding.maftagsc_targetbindingid);
          processed += 1;
          onProgress?.({ phase: 'forms', current: processed, total, label: `Added ${desired.table.displayName} — ${desired.form.name}` });
        }

        for (const [, binding] of removals) {
          onProgress?.({
            phase: 'forms',
            current: processed,
            total,
            label: `Removing ${binding.maftagsc_tabledisplayname} — ${binding.maftagsc_formname ?? binding.maftagsc_formid}`,
          });
          disabledBindings.push({ binding, enabled: binding.maftagsc_enabled });
          data(await Bindings.update(binding.maftagsc_targetbindingid, {
            maftagsc_enabled: false,
            maftagsc_validationstate: VALIDATION.none,
          }), 'Disable removed target binding');
          if (
            configurationEnabled
            && !hasOtherEnabledFormOwner(
              allBindings,
              activeConfigurationIds,
              binding.maftagsc_formid,
              configurationId,
            )
          ) {
            const formId = guid(binding.maftagsc_formid, 'Form ID');
            try {
              const liveForm = data(await SystemformsService.get(formId, {
                select: ['formid', 'formxml', 'objecttypecode'],
              }), 'Read removed target form');
              const next = removeHandler(liveForm.formxml, binding.maftagsc_handleruniqueid);
              if (next !== liveForm.formxml) {
                data(await SystemformsService.update(formId, { formxml: next }), 'Remove sidecar from target form');
                changedForms.set(formId, {
                  undo: 'add',
                  handlerId: binding.maftagsc_handleruniqueid,
                  table: binding.maftagsc_tablelogicalname,
                });
                tablesToPublish.add(binding.maftagsc_tablelogicalname);
              }
            } catch (error) {
              if (!/not found|does not exist|404/i.test(message(error))) throw error;
            }
          }
          processed += 1;
          onProgress?.({ phase: 'forms', current: processed, total, label: `Removed ${binding.maftagsc_tabledisplayname} — ${binding.maftagsc_formname ?? binding.maftagsc_formid}` });
        }

        if (tablesToPublish.size) {
          onProgress?.({ phase: 'publish', current: processed, total, label: 'Publishing form changes' });
          await publishTables([...tablesToPublish]);
        }
        const bindingsToRefresh = (await bindingsFor(configurationId)).filter((binding) =>
          binding.maftagsc_enabled
          && tablesToPublish.has(binding.maftagsc_tablelogicalname)
          && desiredForms.has(
            `${binding.maftagsc_tablelogicalname}:${binding.maftagsc_formid.toLowerCase()}`,
          ),
        );
        for (const binding of bindingsToRefresh) {
          const liveForm = data(await SystemformsService.get(binding.maftagsc_formid, {
            select: ['formxml'],
          }), 'Verify updated target form');
          data(await Bindings.update(binding.maftagsc_targetbindingid, {
            maftagsc_lastappliedfingerprint: await hash(liveForm.formxml),
          }), 'Save updated target binding fingerprint');
        }
        data(await Configurations.update(configurationId, {
          maftagsc_healthstate: configurationEnabled ? HEALTH.healthy : HEALTH.none,
          maftagsc_lastvalidatedat: new Date().toISOString(),
          maftagsc_lastoperationsummary: 'Tables, forms, and icon updated in place.',
          statuscode: configurationEnabled ? STATUS.deployed : STATUS.disabled,
        }), 'Complete sidecar update');
      } catch (error) {
        let rollbackFailed = false;
        for (const [formId, snapshot] of changedForms) {
          try {
            const live = data(await SystemformsService.get(formId, { select: ['formxml'] }), 'Read form for update rollback');
            const restored = snapshot.undo === 'remove'
              ? removeHandler(live.formxml, snapshot.handlerId)
              : addHandler(live.formxml, snapshot.handlerId).value;
            if (restored !== live.formxml) {
              data(await SystemformsService.update(formId, { formxml: restored }), 'Restore form after failed update');
            }
            tablesToPublish.add(snapshot.table);
          } catch {
            rollbackFailed = true;
          }
        }
        await Promise.all(addedBindingIds.map((bindingId) =>
          Bindings.delete(bindingId).catch(() => { rollbackFailed = true; }),
        ));
        for (const { binding, enabled } of disabledBindings) {
          await Bindings.update(binding.maftagsc_targetbindingid, {
            maftagsc_enabled: enabled,
            maftagsc_validationstate: binding.maftagsc_validationstate,
          }).catch(() => { rollbackFailed = true; });
        }
        if (update.icon) {
          await Configurations.update(configurationId, {
            maftagsc_iconsource: oldIcon.source,
            maftagsc_iconwebresourcename: oldIcon.name ?? '',
            maftagsc_iconcontenthash: oldIcon.hash ?? '',
            maftagsc_iconmimetype: oldIcon.mime ?? '',
          }).catch(() => { rollbackFailed = true; });
          if (newIconName && newIconName !== oldIcon.name) {
            await deleteOwnedIconName(newIconName, configurationId)
              .catch(() => { rollbackFailed = true; });
          }
        }
        if (tablesToPublish.size) {
          await publishTables([...tablesToPublish]).catch(() => { rollbackFailed = true; });
        }
        let lockCleanupFailed = false;
        if (editLockId) {
          await Bindings.delete(editLockId).catch(() => { lockCleanupFailed = true; });
          editLockId = undefined;
        }
        if (rollbackFailed) {
          await Configurations.update(configurationId, {
            statecode: 1,
            statuscode: STATUS.disabled,
            maftagsc_healthstate: HEALTH.critical,
            maftagsc_lastoperationsummary: `Update failed and rollback is incomplete: ${message(error)}`,
          }).catch(() => undefined);
          throw new Error(`Sidecar update failed and rollback is incomplete. The sidecar was disabled: ${message(error)}`);
        }
        if (lockCleanupFailed) {
          throw new Error(`Sidecar update failed and was rolled back, but its edit lease needs cleanup: ${message(error)}`);
        }
        throw new Error(`Sidecar update failed and was rolled back: ${message(error)}`);
      }

      let cleanupWarning: string | undefined;
      if (editLockId) {
        try {
          await Bindings.delete(editLockId);
          editLockId = undefined;
        } catch (error) {
          cleanupWarning = `The update succeeded, but its edit lease needs cleanup: ${message(error)}`;
        }
      }
      for (const { binding } of disabledBindings) {
        try {
          await Bindings.delete(binding.maftagsc_targetbindingid);
        } catch (error) {
          cleanupWarning = `The update succeeded, but an obsolete binding needs cleanup: ${message(error)}`;
        }
      }
      if (iconChanged && oldIcon.name && oldIcon.name !== newIconName) {
        try {
          await deleteOwnedIconName(oldIcon.name, configurationId);
        } catch (error) {
          cleanupWarning = `The update succeeded, but the previous icon needs cleanup: ${message(error)}`;
        }
      }
      if (cleanupWarning) {
        data(await Configurations.update(configurationId, {
          maftagsc_healthstate: HEALTH.warning,
          maftagsc_lastoperationsummary: cleanupWarning,
        }), 'Save sidecar update cleanup warning');
      }
      return configurationEnabled
        ? validate(configurationId)
        : map(data(await Configurations.get(configurationId), 'Read updated configuration'), await bindingsFor(configurationId));
    },
    validate,
    async reconcile(id, onProgress) { const configurationId = guid(id, 'Configuration ID'); await mutate(configurationId, 'apply', onProgress); data(await Configurations.update(configurationId, { statecode: 0, statuscode: STATUS.deployed, maftagsc_healthstate: HEALTH.healthy, maftagsc_lastoperationsummary: 'Approved reconciliation completed.' }), 'Complete reconciliation'); return validate(configurationId); },
    async setEnabled(id, enabled, onProgress) {
      const configurationId = guid(id, 'Configuration ID');
      if (enabled) {
        const configuration = data(await Configurations.get(configurationId), 'Read sidecar configuration');
        const enabledForApp = data(await Configurations.getAll({
          select: ['maftagsc_sidecarconfigurationid'],
          filter: `maftagsc_appid eq '${odataString(configuration.maftagsc_appid)}' and statecode eq 0 and maftagsc_sidecarconfigurationid ne ${configurationId}`,
          top: 10,
        }), 'Check app sidecar limit');
        if (enabledForApp.length >= 10) {
          throw new Error('A Model-driven App can have at most 10 enabled sidecar configurations.');
        }
      }
      await mutate(configurationId, enabled ? 'apply' : 'remove', onProgress);
      data(await Configurations.update(configurationId, { statecode: enabled ? 0 : 1, statuscode: enabled ? STATUS.deployed : STATUS.disabled, maftagsc_healthstate: enabled ? HEALTH.healthy : HEALTH.none, maftagsc_lastvalidatedat: new Date().toISOString(), maftagsc_lastoperationsummary: enabled ? 'Sidecar enabled.' : 'Sidecar disabled; configuration retained.' }), enabled ? 'Enable sidecar' : 'Disable sidecar');
      if (enabled) {
        const configuration = data(await Configurations.get(configurationId), 'Read enabled sidecar configuration');
        const enabledAfterUpdate = data(await Configurations.getAll({
          select: ['maftagsc_sidecarconfigurationid'],
          filter: `maftagsc_appid eq '${odataString(configuration.maftagsc_appid)}' and statecode eq 0`,
          top: 11,
        }), 'Verify app sidecar limit');
        if (enabledAfterUpdate.length > 10) {
          data(await Configurations.update(configurationId, {
            statecode: 1,
            statuscode: STATUS.disabled,
            maftagsc_healthstate: HEALTH.none,
            maftagsc_lastoperationsummary: 'Enable was rolled back because a concurrent operation reached the 10-sidecar limit.',
          }), 'Roll back sidecar enable');
          await mutate(configurationId, 'remove', onProgress);
          throw new Error('A concurrent enable reached the 10-sidecar limit. This sidecar remains disabled.');
        }
      }
      return enabled ? validate(configurationId) : map(data(await Configurations.get(configurationId), 'Read configuration'), await bindingsFor(configurationId));
    },
    async uninstall(id, onProgress) {
      const configurationId = guid(id, 'Configuration ID');
      const configuration = data(await Configurations.get(configurationId), 'Read configuration');
      const bindings = await mutate(configurationId, 'remove', onProgress);
      onProgress?.({ phase: 'cleanup', current: 0, total: 1, label: 'Removing bindings, icon, and configuration' });
      await Promise.all(bindings.map((binding) => Bindings.delete(binding.maftagsc_targetbindingid)));
      await deleteOwnedIcon(configuration);
      await Configurations.delete(configurationId);
      const ownershipMarker = bindingSolutionMarker(configuration.maftagsc_appid, configurationId);
      const legacyOwnershipMarker = `Agent Sidecar Target Binding for app ${guid(configuration.maftagsc_appid, 'Model-driven App ID')}`;
      const publisherId = await sidecarPublisherId();
      const [solutionsResult, remainingOwnersResult] = await Promise.all([
        SolutionsService.getAll({
          select: ['solutionid', 'description', '_publisherid_value'],
          filter: `uniquename eq '${odataString(configuration.maftagsc_bindingsolutionuniquename)}' and ismanaged eq false`,
          top: 1,
        }),
        Configurations.getAll({
          select: ['maftagsc_sidecarconfigurationid'],
          filter: `maftagsc_bindingsolutionuniquename eq '${odataString(configuration.maftagsc_bindingsolutionuniquename)}'`,
          top: 1,
        }),
      ]);
      const solutions = data(solutionsResult, 'Find scoped Target Binding solution');
      const remainingOwners = data(remainingOwnersResult, 'Check Target Binding solution owners');
      const ownedSolution = solutions[0];
      const markerIsOwned = ownedSolution?.description === ownershipMarker
        || ownedSolution?.description === legacyOwnershipMarker;
      if (
        ownedSolution
        &&
        markerIsOwned
        && remainingOwners.length === 0
        && (ownedSolution._publisherid_value ?? '').toLowerCase() === publisherId.toLowerCase()
      ) {
        await SolutionsService.delete(ownedSolution.solutionid);
      }
      onProgress?.({ phase: 'cleanup', current: 1, total: 1, label: 'Removing bindings, icon, and configuration' });
    },
  };
}
