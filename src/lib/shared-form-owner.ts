interface SharedFormBinding {
  maftagsc_formid: string;
  maftagsc_enabled: boolean;
  _maftagsc_sidecarconfiguration_value?: string;
}

function normalizeGuid(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/[{}]/g, '').toLowerCase() ?? '';
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

export function hasOtherEnabledFormOwner(
  bindings: readonly SharedFormBinding[],
  activeConfigurationIds: ReadonlySet<string>,
  formId: string,
  configurationId: string,
): boolean {
  const normalizedFormId = normalizeGuid(formId);
  const normalizedConfigurationId = normalizeGuid(configurationId);
  if (!normalizedFormId || !normalizedConfigurationId) return false;
  const normalizedActiveConfigurationIds = new Set(
    [...activeConfigurationIds]
      .map((id) => normalizeGuid(id))
      .filter((id): id is string => id !== null),
  );

  return bindings.some((binding) => {
    const bindingFormId = normalizeGuid(binding.maftagsc_formid);
    const ownerId = normalizeGuid(binding._maftagsc_sidecarconfiguration_value);
    return binding.maftagsc_enabled
      && bindingFormId === normalizedFormId
      && ownerId !== normalizedConfigurationId
      && Boolean(ownerId && normalizedActiveConfigurationIds.has(ownerId));
  });
}
