import type { AgentResolution } from '@/types/sidecar-admin-models';
import { parseSupportedCopilotStudioConnectionUrl } from '../../shared/copilotStudioConnectionString';

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCopilotStudioConnectionString(connectionString: string, environmentId: string): AgentResolution {
  const value = connectionString.trim();
  if (/<iframe\b|<script\b|<html\b/i.test(value)) {
    throw new Error('Paste the Microsoft 365 Agents SDK connection string from Channels > Web app, not the public iframe embed code.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Paste a valid Microsoft 365 Agents SDK connection string from Channels > Web app.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('The Agents SDK connection string must use HTTPS.');
  }

  const normalizedEnvironmentId = environmentId.trim();
  if (!guidPattern.test(normalizedEnvironmentId)) {
    throw new Error('Enter a valid Environment ID from Copilot Studio Settings > Advanced > Metadata.');
  }

  const connection = parseSupportedCopilotStudioConnectionUrl(value);
  if (!connection) {
    throw new Error('Paste a supported Microsoft 365 Agents SDK connection string from Channels > Web app.');
  }
  const { schemaName } = connection;

  const displayName = schemaName
    .replace(/^[a-z0-9]+_/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  return {
    displayName: displayName || schemaName,
    schemaName,
    environmentId: normalizedEnvironmentId,
    published: true,
  };
}

export function isGuid(value: string): boolean {
  return guidPattern.test(value.trim());
}
