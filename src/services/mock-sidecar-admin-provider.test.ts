import { describe, expect, it } from 'vitest';
import { createMockSidecarAdministrationProvider } from '@/services/mock-sidecar-admin-provider';

const immutableKeys = [
  'id',
  'appId',
  'appUniqueName',
  'agentDisplayName',
  'agentSchemaName',
  'agentConnectionString',
  'tenantId',
  'publicClientApplicationId',
  'environmentId',
  'bindingSolutionUniqueName',
] as const;

describe('sidecar mutable configuration updates', () => {
  it('preserves identity and conversation-scoping fields', async () => {
    const provider = createMockSidecarAdministrationProvider();
    const id = 'sidecar-hr-management';
    const before = await provider.getConfiguration(id);
    const edit = await provider.getEditModel(id);

    const updated = await provider.updateMutableConfiguration(id, {
      tables: edit.tables,
      icon: { source: 'default' },
      expectedEditVersion: edit.editVersion,
    });

    expect(before).not.toBeNull();
    for (const key of immutableKeys) {
      expect(updated[key]).toBe(before?.[key]);
    }
    expect(updated.iconSource).toBe('default');
    expect(updated.lastOperationSummary).toBe('Tables, forms, and icon updated in place.');
  });

  it('rejects stale edits and an empty form selection', async () => {
    const provider = createMockSidecarAdministrationProvider();
    const id = 'sidecar-hr-management';
    const edit = await provider.getEditModel(id);

    await expect(provider.updateMutableConfiguration(id, {
      tables: edit.tables,
      expectedEditVersion: 'stale-version',
    })).rejects.toThrow('changed after editing began');

    await expect(provider.updateMutableConfiguration(id, {
      tables: edit.tables.map((table) => ({
        ...table,
        enabled: false,
        forms: table.forms.map((form) => ({ ...form, enabled: false })),
      })),
      expectedEditVersion: edit.editVersion,
    })).rejects.toThrow('Select at least one form');
  });

  it('keeps retained targets selected when editing a disabled sidecar', async () => {
    const provider = createMockSidecarAdministrationProvider();
    const edit = await provider.getEditModel('sidecar-finance-operations');

    expect(edit.tables.some((table) =>
      table.enabled && table.forms.some((form) => form.enabled),
    )).toBe(true);
  });
});
