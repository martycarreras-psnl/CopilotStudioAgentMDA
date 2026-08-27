import { describe, expect, it } from 'vitest';
import {
  buildCopilotStudioConnectionString,
  inferCopilotStudioApiSuffix,
  inferCopilotStudioHarness,
} from '@/lib/copilot-studio-agent';

const environmentId = '7d8dcd87-2e21-e805-b9be-678794ecc80b';

describe('Copilot Studio agent discovery', () => {
  it('infers the GitHub Copilot harness from cliagent templates', () => {
    expect(inferCopilotStudioHarness('cliagent-1.0.0')).toBe('github');
    expect(inferCopilotStudioHarness('default-2.1.0')).toBe('standard');
    expect(inferCopilotStudioHarness(undefined)).toBe('standard');
  });

  it('builds the standard connection string from the current environment', () => {
    expect(buildCopilotStudioConnectionString(
      environmentId,
      'cr0b1_HRMgmtClassic',
      'standard',
    )).toBe(
      'https://7d8dcd872e21e805b9be678794ecc8.0b.environment.api.powerplatform.com'
      + '/copilotstudio/dataverse-backed/authenticated/bots/cr0b1_HRMgmtClassic/conversations'
      + '?api-version=2022-03-01-preview',
    );
  });

  it('builds the GitHub Copilot harness connection string from the current environment', () => {
    expect(buildCopilotStudioConnectionString(
      environmentId,
      'cr88d_insightsandactions_AChDbK',
      'github',
    )).toBe(
      'https://7d8dcd872e21e805b9be678794ecc8.0b.environment.api.powerplatform.com'
      + '/copilotstudio/agenticruntime/3p/dataverse-backed/authenticated/bots/'
      + 'cr88d_insightsandactions_AChDbK?api-version=1',
    );
  });

  it('distinguishes sovereign Power Apps hosts from the most-specific suffix first', () => {
    expect(inferCopilotStudioApiSuffix('contoso.high.powerapps.us'))
      .toBe('.environment.api.high.powerplatform.microsoft.us');
    expect(inferCopilotStudioApiSuffix('contoso.powerapps.us'))
      .toBe('.environment.api.gov.powerplatform.microsoft.us');
    expect(inferCopilotStudioApiSuffix('contoso.appsplatform.us'))
      .toBe('.environment.api.appsplatform.us');
    expect(inferCopilotStudioApiSuffix('contoso.powerapps.cn'))
      .toBe('.environment.api.powerplatform.partner.microsoftonline.cn');
    expect(inferCopilotStudioApiSuffix('contoso.crm.microsoftdynamics.us'))
      .toBe('.environment.api.high.powerplatform.microsoft.us');
    expect(inferCopilotStudioApiSuffix('contoso.crm9.dynamics.com'))
      .toBe('.environment.api.gov.powerplatform.microsoft.us');
    expect(inferCopilotStudioApiSuffix('contoso.crm.appsplatform.us'))
      .toBe('.environment.api.appsplatform.us');
    expect(inferCopilotStudioApiSuffix('contoso.crm.dynamics.cn'))
      .toBe('.environment.api.powerplatform.partner.microsoftonline.cn');
  });
});
