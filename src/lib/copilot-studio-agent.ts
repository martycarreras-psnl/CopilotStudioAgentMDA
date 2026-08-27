import type {
  CopilotStudioHarness,
} from '@/types/sidecar-admin-models';
import { isGuid } from '@/utils/agent-link';
import { parseSupportedCopilotStudioConnectionUrl } from '../../shared/copilotStudioConnectionString';

const SCHEMA_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,199}$/;

const CLOUD_SUFFIXES = {
  public: '.environment.api.powerplatform.com',
  gov: '.environment.api.gov.powerplatform.microsoft.us',
  high: '.environment.api.high.powerplatform.microsoft.us',
  dod: '.environment.api.appsplatform.us',
  china: '.environment.api.powerplatform.partner.microsoftonline.cn',
} as const;

export function inferCopilotStudioHarness(template?: string): CopilotStudioHarness {
  return template?.trim().toLowerCase().startsWith('cliagent-') ? 'github' : 'standard';
}

export function inferCopilotStudioApiSuffix(hostname: string): string {
  const host = hostname.trim().toLowerCase();
  if (host.endsWith('.high.powerapps.us') || host.endsWith('.microsoftdynamics.us')) {
    return CLOUD_SUFFIXES.high;
  }
  if (host.endsWith('.appsplatform.us')) return CLOUD_SUFFIXES.dod;
  if (host.endsWith('.powerapps.us') || host.endsWith('.crm9.dynamics.com')) {
    return CLOUD_SUFFIXES.gov;
  }
  if (host.endsWith('.powerapps.cn') || host.endsWith('.dynamics.cn')) {
    return CLOUD_SUFFIXES.china;
  }
  return CLOUD_SUFFIXES.public;
}

export function buildCopilotStudioConnectionString(
  environmentId: string,
  schemaName: string,
  harness: CopilotStudioHarness,
  apiSuffix: string = CLOUD_SUFFIXES.public,
): string {
  if (!isGuid(environmentId)) {
    throw new Error('The current Power Platform environment ID is invalid.');
  }
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error('The selected Copilot Studio agent schema name is invalid.');
  }
  if (!Object.values(CLOUD_SUFFIXES).includes(apiSuffix as typeof CLOUD_SUFFIXES[keyof typeof CLOUD_SUFFIXES])) {
    throw new Error('The current Power Platform cloud is unsupported.');
  }

  const environmentKey = environmentId.replace(/-/g, '').toLowerCase();
  const hostKey = `${environmentKey.slice(0, -2)}.${environmentKey.slice(-2)}`;
  const encodedSchemaName = encodeURIComponent(schemaName);
  const path = harness === 'github'
    ? `/copilotstudio/agenticruntime/3p/dataverse-backed/authenticated/bots/${encodedSchemaName}?api-version=1`
    : `/copilotstudio/dataverse-backed/authenticated/bots/${encodedSchemaName}/conversations?api-version=2022-03-01-preview`;
  const value = `https://${hostKey}${apiSuffix}${path}`;
  const parsed = parseSupportedCopilotStudioConnectionUrl(value);
  if (!parsed || parsed.harness !== harness || parsed.schemaName !== schemaName) {
    throw new Error('The selected Copilot Studio agent connection could not be generated safely.');
  }
  return value;
}
