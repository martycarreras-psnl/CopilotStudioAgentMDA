import { describe, expect, it } from 'vitest';
import { isGuid, parseCopilotStudioConnectionString } from '@/utils/agent-link';

const environmentId = 'f9b87f8b-0abf-e629-affb-b13195d1ed14';
const connectionString = 'https://1234567890.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/contoso_FieldGuide/conversations?api-version=2022-03-01-preview';
const githubHarnessConnectionString = 'https://7d8dcd872e21e805b9be678794ecc8.0b.environment.api.powerplatform.com/copilotstudio/agenticruntime/3p/dataverse-backed/authenticated/bots/cr88d_insightsandactions_AChDbK?api-version=1';

describe('parseCopilotStudioConnectionString', () => {
  it('resolves the agent schema from an Agents SDK connection string and uses the supplied environment ID', () => {
    expect(parseCopilotStudioConnectionString(connectionString, environmentId)).toEqual({
      displayName: 'Field Guide',
      schemaName: 'contoso_FieldGuide',
      environmentId,
      published: true,
    });
  });

  it('resolves a GitHub Copilot harness connection string without a conversations segment', () => {
    expect(parseCopilotStudioConnectionString(githubHarnessConnectionString, environmentId)).toEqual({
      displayName: 'insightsandactions ACh Db K',
      schemaName: 'cr88d_insightsandactions_AChDbK',
      environmentId,
      published: true,
    });
  });

  it('rejects non-HTTPS links', () => {
    expect(() => parseCopilotStudioConnectionString(connectionString.replace('https:', 'http:'), environmentId)).toThrow('must use HTTPS');
  });

  it('rejects an invalid separately supplied environment ID', () => {
    expect(() => parseCopilotStudioConnectionString(connectionString, 'not-a-guid')).toThrow('valid Environment ID');
  });

  it('rejects a public web chat URL', () => {
    expect(() => parseCopilotStudioConnectionString('https://copilotstudio.microsoft.com/bots/contoso_FieldGuide/webchat', environmentId)).toThrow('supported Microsoft 365 Agents SDK connection string');
  });

  it('rejects an unrelated HTTPS URL containing a bots segment', () => {
    expect(() => parseCopilotStudioConnectionString('https://example.com/copilotstudio/agenticruntime/3p/dataverse-backed/authenticated/bots/contoso_FieldGuide?api-version=1', environmentId)).toThrow('supported Microsoft 365 Agents SDK connection string');
  });

  it('rejects a GitHub harness URL with the legacy API version', () => {
    expect(() => parseCopilotStudioConnectionString(githubHarnessConnectionString.replace('api-version=1', 'api-version=2022-03-01-preview'), environmentId)).toThrow('supported Microsoft 365 Agents SDK connection string');
  });

  it('rejects public iframe embed HTML with actionable guidance', () => {
    expect(() => parseCopilotStudioConnectionString('<iframe src="https://example.com"></iframe>', environmentId)).toThrow('not the public iframe embed code');
  });
});

describe('isGuid', () => {
  it('accepts trimmed GUIDs and rejects arbitrary text', () => {
    expect(isGuid(` ${environmentId} `)).toBe(true);
    expect(isGuid('not-a-guid')).toBe(false);
  });
});
