import { Children, cloneElement, isValidElement, useEffect, useMemo, useState, type ComponentProps, type ReactElement } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  Field as FluentField,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  SpinButton,
  Spinner,
  Text,
  Title1,
  Title2,
  Title3,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  ArrowRightRegular,
  CheckmarkCircleFilled,
  CheckmarkCircleRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  CircleRegular,
  DatabaseRegular,
  SearchRegular,
  ShieldKeyholeRegular,
} from '@fluentui/react-icons';
import type {
  DeploymentImpact,
  PublishedAgent,
  SidecarDraft,
  SidecarProgressCallback,
  TargetModelDrivenApp,
  TargetTable,
} from '@/types/sidecar-admin-models';
import { isGuid } from '@/utils/agent-link';
import { defaultFormId } from '@/lib/target-forms';
import { DataverseFieldLabel } from '@/components/DataverseFieldLabel';
import { OperationProgress } from '@/components/OperationProgress/OperationProgress';
import { SidecarIconPicker } from '@/components/SidecarWizard/SidecarIconPicker';
import { useOperationReport } from '@/hooks/useOperationReport';
import { useDataverseFieldMetadata } from '@/hooks/use-dataverse-field-metadata';
import { toDataverseFieldName } from '@/lib/dataverse-field-name';

const steps = ['Application', 'Tables', 'Agent', 'Identity', 'Review'] as const;
const stepDescriptions = [
  'Choose the model-driven app',
  'Place the pane on forms',
  'Connect a published agent',
  'Confirm pane identity',
  'Verify and deploy',
] as const;
const CONFIG_TABLE = 'maftagsc_sidecarconfiguration';

type ConfigFieldProps = Omit<ComponentProps<typeof FluentField>, 'label'> & {
  label: string;
  field?: string;
};

function ConfigField({ label, field, required, children, ...props }: ConfigFieldProps) {
  const logicalName = toDataverseFieldName(field);
  const { data: metadata } = useDataverseFieldMetadata(
    logicalName ? CONFIG_TABLE : '',
    logicalName ?? '',
  );
  const isRequired = metadata?.isRequired ?? required ?? false;
  const child = Children.only(children);
  const constrainedChild = isValidElement(child)
    ? cloneElement(child as ReactElement<Record<string, unknown>>, {
        'aria-required': isRequired || undefined,
        ...(metadata?.maxLength ? { maxLength: metadata.maxLength } : {}),
      })
    : child;
  return (
    <FluentField
      {...props}
      label={
        <DataverseFieldLabel
          tableLogicalName={logicalName ? CONFIG_TABLE : undefined}
          fieldLogicalName={logicalName}
          fallback={label}
          required={Boolean(required)}
        />
      }
    >
      {constrainedChild}
    </FluentField>
  );
}

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXL, paddingBlock: tokens.spacingVerticalXXL },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalXL,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundImage: `linear-gradient(135deg, ${tokens.colorBrandBackground2}, ${tokens.colorNeutralBackground1} 72%)`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  backButton: { alignSelf: 'flex-start' },
  eyebrow: { color: tokens.colorBrandForeground1, letterSpacing: '0.08em', textTransform: 'uppercase' },
  progress: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: tokens.spacingHorizontalXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 800px)': { gridTemplateColumns: '1fr' },
  },
  progressStep: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
  },
  progressStepCurrent: { backgroundColor: tokens.colorBrandBackground2 },
  stepCircle: {
    display: 'grid',
    placeItems: 'center',
    width: '28px',
    height: '28px',
    borderRadius: tokens.borderRadiusCircular,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  stepCircleCurrent: {
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorBrandBackground,
    border: `1px solid ${tokens.colorBrandBackground}`,
  },
  stepCircleDone: {
    color: tokens.colorPaletteGreenForeground1,
    backgroundColor: tokens.colorPaletteGreenBackground1,
    border: `1px solid ${tokens.colorPaletteGreenBorder1}`,
  },
  stepText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  muted: { color: tokens.colorNeutralForeground2 },
  content: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: tokens.spacingHorizontalXL, alignItems: 'start', '@media (max-width: 900px)': { gridTemplateColumns: '1fr' } },
  panel: {
    padding: tokens.spacingHorizontalXL,
    gap: tokens.spacingVerticalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow4,
  },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  sectionIntro: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  appGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: tokens.spacingHorizontalM },
  appCard: { padding: tokens.spacingHorizontalM, cursor: 'pointer', minHeight: '130px', position: 'relative', border: `1px solid ${tokens.colorNeutralStroke1}` },
  selectedCard: { outline: `2px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  selectedIcon: { color: tokens.colorBrandForeground1, position: 'absolute', top: tokens.spacingVerticalS, right: tokens.spacingHorizontalS },
  tableRow: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: tokens.spacingHorizontalM, paddingBlock: tokens.spacingVerticalS, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  fields: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: tokens.spacingHorizontalM, '@media (max-width: 650px)': { gridTemplateColumns: '1fr' } },
  tableHeadRow: { display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: tokens.spacingHorizontalS, paddingBlock: tokens.spacingVerticalS, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  expandButton: { minWidth: '28px', padding: '0' },
  formList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, paddingLeft: tokens.spacingHorizontalXXL, paddingBottom: tokens.spacingVerticalS },
  formRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  full: { gridColumnStart: 1, gridColumnEnd: 3, '@media (max-width: 650px)': { gridColumnEnd: 2 } },
  actions: { display: 'flex', justifyContent: 'space-between', gap: tokens.spacingHorizontalM },
  summary: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, position: 'sticky', top: '80px', '@media (max-width: 900px)': { position: 'static' } },
  summaryItem: { display: 'grid', gridTemplateColumns: '20px 1fr', alignItems: 'start', gap: tokens.spacingHorizontalS },
  summaryIcon: { color: tokens.colorPaletteGreenForeground1, marginTop: '2px' },
  summaryPending: { color: tokens.colorNeutralForeground3, marginTop: '2px' },
  impact: { padding: tokens.spacingHorizontalM, gap: tokens.spacingVerticalXS },
  surface: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  tableToolbar: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexWrap: 'wrap' },
  tableSearch: { flexGrow: 1, minWidth: '220px' },
});

interface SidecarWizardProps {
  apps?: TargetModelDrivenApp[];
  appsLoading: boolean;
  defaultTenantId?: string;
  agents?: PublishedAgent[];
  agentsLoading: boolean;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onResolveManualApp: (appId: string) => Promise<TargetModelDrivenApp>;
  onPreview: (draft: SidecarDraft) => Promise<DeploymentImpact[]>;
  onDeploy: (draft: SidecarDraft, onProgress: SidecarProgressCallback) => Promise<void>;
}

export function SidecarWizard({
  apps = [],
  appsLoading,
  defaultTenantId,
  agents = [],
  agentsLoading,
  busy,
  error,
  onCancel,
  onResolveManualApp,
  onPreview,
  onDeploy,
}: SidecarWizardProps) {
  const styles = useStyles();
  const report = useOperationReport();
  const [step, setStep] = useState(0);
  const [targetApp, setTargetApp] = useState<TargetModelDrivenApp>();
  const [tables, setTables] = useState<TargetTable[]>([]);
  const [manualAppId, setManualAppId] = useState('');
  const [agent, setAgent] = useState<PublishedAgent>();
  const [icon, setIcon] = useState<SidecarDraft['icon']>({ source: 'default' });
  const [tenantId, setTenantId] = useState(defaultTenantId ?? '');
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [paneTitle, setPaneTitle] = useState('');
  const [paneWidth, setPaneWidth] = useState(420);
  const [solutionName, setSolutionName] = useState('');
  const [impacts, setImpacts] = useState<DeploymentImpact[]>([]);
  const [localError, setLocalError] = useState<string>();
  const [deploying, setDeploying] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!tenantId && defaultTenantId) setTenantId(defaultTenantId);
  }, [defaultTenantId, tenantId]);

  const enabledTableCount = tables.filter((table) => table.enabled).length;
  const enabledFormCount = tables.filter((table) => table.enabled).reduce((total, table) => total + table.forms.filter((form) => form.enabled).length, 0);
  const visibleTables = useMemo(() => {
    const queryText = tableSearch.trim().toLowerCase();
    if (!queryText) return tables;
    return tables.filter((table) =>
      table.displayName.toLowerCase().includes(queryText) || table.logicalName.toLowerCase().includes(queryText),
    );
  }, [tables, tableSearch]);
  // Enabling a table guarantees at least one selected form (Information, else the first).
  const withEnsuredForm = (table: TargetTable): TargetTable => {
    if (table.forms.some((form) => form.enabled)) return table;
    const preferred = defaultFormId(table.forms);
    return { ...table, forms: table.forms.map((form) => (form.formId === preferred ? { ...form, enabled: true } : form)) };
  };
  const setTableEnabled = (logicalName: string, enabled: boolean) => {
    setTables((current) => current.map((table) => {
      if (table.logicalName !== logicalName) return table;
      return enabled ? withEnsuredForm({ ...table, enabled: true }) : { ...table, enabled: false };
    }));
  };
  const setFormEnabled = (logicalName: string, formId: string, enabled: boolean) => {
    setTables((current) => current.map((table) => {
      if (table.logicalName !== logicalName) return table;
      const forms = table.forms.map((form) => (form.formId === formId ? { ...form, enabled } : form));
      return { ...table, forms, enabled: enabled ? true : table.enabled };
    }));
  };
  const setVisibleTablesEnabled = (enabled: boolean) => {
    const names = new Set(visibleTables.map((table) => table.logicalName));
    setTables((current) => current.map((table) => {
      if (!names.has(table.logicalName)) return table;
      return enabled ? withEnsuredForm({ ...table, enabled: true }) : { ...table, enabled: false };
    }));
  };
  const toggleExpanded = (logicalName: string) => {
    setExpandedTables((current) => {
      const next = new Set(current);
      if (next.has(logicalName)) next.delete(logicalName); else next.add(logicalName);
      return next;
    });
  };
  const draft = useMemo<SidecarDraft | undefined>(() => {
    if (!targetApp || !agent) return undefined;
    return {
      name,
      targetApp,
      tables,
      agent,
      agentConnectionString: agent.connectionString,
      tenantId,
      publicClientApplicationId: clientId,
      paneTitle,
      paneWidth,
      bindingSolutionUniqueName: solutionName,
      icon,
    };
  }, [agent, clientId, icon, name, paneTitle, paneWidth, solutionName, tables, targetApp, tenantId]);

  const selectApp = (app: TargetModelDrivenApp) => {
    setTargetApp(app);
    setTables(app.tables.map((table) => ({ ...table, enabled: false, forms: table.forms.map((form) => ({ ...form })) })));
    setTableSearch('');
    setExpandedTables(new Set());
    setName(`${app.displayName} Assistant`);
    setPaneTitle(`${app.displayName} Assistant`);
    setSolutionName(
      `${app.uniqueName.replace(/[^A-Za-z0-9]/g, '')}Sidecar${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
    );
    setLocalError(undefined);
  };

  const validateStep = (): string | undefined => {
    if (step === 0 && !targetApp) return 'Select a Model-driven App or resolve an App ID.';
    if (step === 1 && enabledTableCount === 0) return 'Enable at least one table.';
    if (step === 2 && !agent) return 'Select a published Copilot Studio agent.';
    if (step === 3 && !name.trim()) return 'Configuration name is required.';
    if (step === 3 && !paneTitle.trim()) return 'Pane title is required.';
    if (step === 3 && !isGuid(tenantId)) return 'Tenant ID must be a valid GUID.';
    if (step === 3 && !isGuid(clientId)) return 'Public-client Application ID must be a valid GUID.';
    if (step === 3 && !solutionName.trim()) return 'Target Binding solution is required.';
    return undefined;
  };

  const next = async () => {
    const validationError = validateStep();
    if (validationError) { setLocalError(validationError); return; }
    setLocalError(undefined);
    if (step === 3 && draft) {
      try {
        setImpacts(await onPreview(draft));
      } catch (caught) {
        setLocalError(caught instanceof Error ? caught.message : 'Impact preview failed.');
        return;
      }
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const resolveManual = async () => {
    try { selectApp(await onResolveManualApp(manualAppId)); }
    catch (caught) { setLocalError(caught instanceof Error ? caught.message : 'App discovery failed.'); }
  };

  const selectAgent = (botId: string) => {
    const selected = agents.find((candidate) => candidate.botId === botId);
    setAgent(selected);
    if (!selected) {
      setIcon({ source: 'default' });
    } else if (icon.source !== 'uploaded') {
      setIcon(selected.icon
        ? { source: 'agent', content: selected.icon }
        : { source: 'default' });
    }
    setLocalError(undefined);
  };

  const deploy = async () => {
    if (!draft) return;
    setLocalError(undefined);
    setDeploying(true);
    report.begin('Deploy sidecar', {
      app: draft.targetApp.displayName,
      appId: draft.targetApp.appId,
      tablesEnabled: enabledTableCount,
      formsTargeted: enabledFormCount,
      bindingSolution: draft.bindingSolutionUniqueName,
    });
    try {
      await onDeploy(draft, report.onProgress);
      report.recordSuccess('Deployment completed and read-back passed.');
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : 'Deployment failed.';
      report.recordError(messageText);
      setLocalError(messageText);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Button className={styles.backButton} appearance="subtle" icon={<ArrowLeftRegular />} onClick={onCancel}>Back to dashboard</Button>
        <Text size={200} weight="semibold" className={styles.eyebrow}>Guided setup</Text>
        <Title1 as="h1">Create a sidecar</Title1>
        <Text size={400} className={styles.muted}>We discover what we can, guide each decision, and verify every change before the sidecar becomes active.</Text>
      </div>

      <div className={styles.progress} aria-label={`Step ${step + 1} of ${steps.length}: ${steps[step]}`}>
        {steps.map((label, index) => (
          <div
            className={mergeClasses(styles.progressStep, index === step && styles.progressStepCurrent)}
            key={label}
            aria-current={index === step ? 'step' : undefined}
          >
            <span className={mergeClasses(
              styles.stepCircle,
              index === step && styles.stepCircleCurrent,
              index < step && styles.stepCircleDone,
            )}>
              {index < step ? <CheckmarkCircleFilled aria-label={`${label} completed`} /> : index + 1}
            </span>
            <span className={styles.stepText}>
              <Text weight={index === step ? 'semibold' : 'regular'}>{label}</Text>
              <Text size={100} className={styles.muted}>{stepDescriptions[index]}</Text>
            </span>
          </div>
        ))}
      </div>

      {(localError || error) && <MessageBar intent="error"><MessageBarBody><MessageBarTitle>Action needed</MessageBarTitle>{localError ?? error}</MessageBarBody></MessageBar>}

      <div className={styles.content}>
        <Card className={styles.panel}>
          {step === 0 && (
            <div className={styles.stack}>
              <div className={styles.sectionIntro}><Title2 as="h2">Select application</Title2><Text className={styles.muted}>Eligible Model-driven Apps are discovered from the current environment.</Text></div>
              {appsLoading ? <Spinner label="Discovering Model-driven Apps" /> : (
                <div className={styles.appGrid}>
                  {apps.map((app) => (
                    <Card
                      key={app.id}
                      className={mergeClasses(styles.appCard, targetApp?.id === app.id && styles.selectedCard)}
                      role="button"
                      tabIndex={0}
                      aria-pressed={targetApp?.id === app.id}
                      onClick={() => selectApp(app)}
                      onKeyDown={(event) => event.key === 'Enter' && selectApp(app)}
                    >
                      {targetApp?.id === app.id && <CheckmarkCircleFilled className={styles.selectedIcon} aria-label="Selected" />}
                      <Title3>{app.displayName}</Title3><Text>{app.description}</Text><Text size={200}>{app.tables.length} eligible tables</Text>
                    </Card>
                  ))}
                </div>
              )}
              <ConfigField label="Manual App ID fallback" hint="Use this when app discovery does not return the target app.">
                <div className={styles.surface}><Input value={manualAppId} onChange={(_, data) => setManualAppId(data.value)} placeholder="00000000-0000-0000-0000-000000000000" /><Button onClick={resolveManual} disabled={busy}>Resolve App ID</Button></div>
              </ConfigField>
            </div>
          )}

          {step === 1 && (
            <div className={styles.stack}>
              <div className={styles.sectionIntro}><Title2 as="h2">Select tables &amp; forms</Title2><Text className={styles.muted}>Choose the tables that should show the sidecar. All tables start off &mdash; enable only what you need. Each enabled table uses its <strong>Information</strong> form by default; expand a table to pick other forms.</Text></div>
              <MessageBar intent="info"><MessageBarBody><MessageBarTitle>New tables require approval</MessageBarTitle>If the app gains a table, it appears in drift review as selected. Nothing changes until you approve.</MessageBarBody></MessageBar>
              <div className={styles.tableToolbar}>
                <Input
                  className={styles.tableSearch}
                  value={tableSearch}
                  onChange={(_, data) => setTableSearch(data.value)}
                  placeholder="Search tables by name…"
                  contentBefore={<SearchRegular />}
                />
                <Button appearance="secondary" onClick={() => setVisibleTablesEnabled(true)}>Select all{tableSearch.trim() ? ' shown' : ''}</Button>
                <Button appearance="secondary" onClick={() => setVisibleTablesEnabled(false)}>Select none{tableSearch.trim() ? ' shown' : ''}</Button>
                <Text size={200} className={styles.muted}>{enabledTableCount} of {tables.length} selected</Text>
              </div>
              {visibleTables.length === 0 ? (
                <Text className={styles.muted}>No tables match &ldquo;{tableSearch.trim()}&rdquo;.</Text>
              ) : visibleTables.map((table) => {
                const expanded = expandedTables.has(table.logicalName);
                const selectedForms = table.forms.filter((form) => form.enabled).length;
                return (
                  <div key={table.logicalName}>
                    <div className={styles.tableHeadRow}>
                      <Button
                        className={styles.expandButton}
                        appearance="subtle"
                        aria-label={expanded ? `Collapse ${table.displayName} forms` : `Expand ${table.displayName} forms`}
                        aria-expanded={expanded}
                        icon={expanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
                        onClick={() => toggleExpanded(table.logicalName)}
                      />
                      <div>
                        <Text weight="semibold">{table.displayName}</Text><br />
                        <Text size={200} className={styles.muted}>{table.logicalName} · {table.enabled ? `${selectedForms} of ${table.formCount}` : table.formCount} form{table.formCount === 1 ? '' : 's'}{table.enabled ? ' selected' : ''}</Text>
                      </div>
                      <Checkbox checked={table.enabled} label="Enable" onChange={(_, data) => setTableEnabled(table.logicalName, Boolean(data.checked))} />
                    </div>
                    {expanded && (
                      <div className={styles.formList}>
                        {table.forms.map((form) => (
                          <div className={styles.formRow} key={form.formId}>
                            <Checkbox
                              checked={form.enabled}
                              label={form.name}
                              onChange={(_, data) => setFormEnabled(table.logicalName, form.formId, Boolean(data.checked))}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className={styles.stack}>
              <div className={styles.sectionIntro}><Title2 as="h2">Select the agent</Title2><Text className={styles.muted}>Published Copilot Studio agents are discovered from this Power Platform environment. The environment and supported connection pattern are configured automatically.</Text></div>
              <ConfigField label="Published Copilot Studio agent" required>
                {agentsLoading ? (
                  <Spinner label="Discovering published agents" />
                ) : (
                  <Dropdown
                    value={agent ? `${agent.displayName} (${agent.schemaName})` : ''}
                    selectedOptions={agent ? [agent.botId] : []}
                    placeholder={agents.length ? 'Select an agent' : 'No published agents found'}
                    onOptionSelect={(_, data) => selectAgent(String(data.optionValue ?? ''))}
                    disabled={!agents.length}
                  >
                    {agents.map((candidate) => (
                      <Option
                        key={candidate.botId}
                        value={candidate.botId}
                        text={`${candidate.displayName} (${candidate.schemaName})`}
                      >
                        {candidate.displayName} — {candidate.schemaName}
                      </Option>
                    ))}
                  </Dropdown>
                )}
              </ConfigField>
              {agent && <MessageBar intent="success"><MessageBarBody><MessageBarTitle>{agent.displayName}</MessageBarTitle>{agent.schemaName} · published · {agent.harness === 'github' ? 'GitHub Copilot harness' : 'standard harness'} · current environment</MessageBarBody></MessageBar>}
              {!agentsLoading && !agents.length && <MessageBar intent="warning"><MessageBarBody><MessageBarTitle>No published agents found</MessageBarTitle>Publish an agent in this environment, then reopen the wizard.</MessageBarBody></MessageBar>}
              <ConfigField
                field="iconSource"
                label="Sidecar icon"
                hint="The selected image is copied into the sidecar's Target Binding solution. Existing panes refresh after the Model-driven App is reloaded."
              >
                <SidecarIconPicker
                  agentIcon={agent?.icon}
                  value={icon}
                  onChange={setIcon}
                  onError={setLocalError}
                />
              </ConfigField>
            </div>
          )}

          {step === 3 && (
            <div className={styles.stack}>
              <div className={styles.sectionIntro}><Title2 as="h2">Configure identity and pane</Title2><Text className={styles.muted}>Use a separate single-tenant public-client registration for this sidecar. Never create a client secret.</Text></div>
              <div className={styles.fields}>
                <ConfigField field="name" label="Configuration name" required><Input value={name} onChange={(_, data) => setName(data.value)} /></ConfigField>
                <ConfigField field="paneTitle" label="Pane title" required><Input value={paneTitle} onChange={(_, data) => setPaneTitle(data.value)} /></ConfigField>
                <ConfigField
                  field="tenantId"
                  label="Tenant ID"
                  required
                  hint={defaultTenantId ? 'Detected from the signed-in Power Apps environment. You can correct it if needed.' : 'Enter the tenant used by the single-tenant SPA registration.'}
                >
                  <Input
                    value={tenantId}
                    onChange={(_, data) => setTenantId(data.value)}
                    contentAfter={defaultTenantId && tenantId === defaultTenantId ? <Badge appearance="tint" color="success">Detected</Badge> : undefined}
                  />
                </ConfigField>
                <ConfigField field="publicClientApplicationId" label="Public-client Application ID" required><Input value={clientId} onChange={(_, data) => setClientId(data.value)} placeholder="Create a separate Entra registration" /></ConfigField>
                <ConfigField field="paneWidth" label="Pane width"><SpinButton min={320} max={600} value={paneWidth} onChange={(_, data) => setPaneWidth(data.value ?? 420)} /></ConfigField>
                <ConfigField field="bindingSolutionUniqueName" label="Target Binding solution" required><Input value={solutionName} onChange={(_, data) => setSolutionName(data.value.replace(/[^A-Za-z0-9_]/g, ''))} /></ConfigField>
                <ConfigField className={styles.full} label="Redirect URI" hint="Use the redirect URI you registered in your Entra SPA app registration.">
                  <Text className={styles.muted}>Register the redirect URI you recorded in your setup worksheet on the Entra SPA app registration &mdash; this environment&rsquo;s organization URL followed by <code>/WebResources/maftagsc_/copilot/authRedirect.html</code>. It must match exactly. The sidecar resolves it automatically at runtime from the current environment, so it is not stored here.</Text>
                </ConfigField>
              </div>
              <MessageBar intent="warning"><MessageBarBody><MessageBarTitle>Administrator action required</MessageBarTitle>Add the delegated Power Platform API permission, grant tenant admin consent, and leave Certificates & secrets empty.</MessageBarBody></MessageBar>
            </div>
          )}

          {step === 4 && (
            <div className={styles.stack}>
              <div className={styles.sectionIntro}><Title2 as="h2">Review deployment impact</Title2><Text className={styles.muted}>Nothing changes until a System Administrator selects Deploy sidecar.</Text></div>
              {impacts.map((impact) => <Card className={styles.impact} key={impact.title}><Text weight="semibold">{impact.title}</Text><Text>{impact.detail}</Text></Card>)}
              {deploying || report.hasEntries ? (
                <OperationProgress
                  active={deploying}
                  progress={report.progress}
                  entries={report.log}
                  errorCount={report.errorCount}
                  downloadable={report.hasEntries}
                  onDownload={report.download}
                  activeNote="This can take a minute or two for larger apps. Keep this tab open — you’ll be taken to the new sidecar’s page automatically when it finishes. If anything fails, the changes roll back and the error appears above."
                  idleNote={report.errorCount > 0 ? 'Deployment did not complete. Download the report for details, then retry once the issue is resolved.' : undefined}
                />
              ) : (
                <MessageBar intent="success"><MessageBarBody><MessageBarTitle>Ready to deploy</MessageBarTitle>{enabledTableCount} tables · {enabledFormCount} active main form{enabledFormCount === 1 ? '' : 's'} · one existing agent · automatic rollback protection</MessageBarBody></MessageBar>
              )}
            </div>
          )}

          <div className={styles.actions}>
            <Button disabled={step === 0 || busy} onClick={() => { setLocalError(undefined); setStep((current) => current - 1); }} icon={<ArrowLeftRegular />}>Previous</Button>
            {step < steps.length - 1 ? <Button appearance="primary" onClick={next} disabled={busy} icon={<ArrowRightRegular />} iconPosition="after">Continue</Button> : <Button appearance="primary" onClick={deploy} disabled={busy || !draft} icon={<CheckmarkCircleRegular />}>{busy ? 'Deploying…' : 'Deploy sidecar'}</Button>}
          </div>
        </Card>

        <Card className={mergeClasses(styles.panel, styles.summary)}>
          <Title3>Configuration summary</Title3>
          <div className={styles.summaryItem}>{targetApp ? <CheckmarkCircleFilled className={styles.summaryIcon} /> : <CircleRegular className={styles.summaryPending} />}<span><Text size={200} className={styles.muted}>Application</Text><br /><Text weight="semibold">{targetApp?.displayName ?? 'Not selected'}</Text></span></div>
          <div className={styles.summaryItem}><DatabaseRegular className={enabledTableCount ? styles.summaryIcon : styles.summaryPending} /><span><Text size={200} className={styles.muted}>Placement</Text><br /><Text weight="semibold">{enabledTableCount ? `${enabledTableCount} tables · ${enabledFormCount} forms` : 'Not selected'}</Text></span></div>
          <div className={styles.summaryItem}>{agent ? <CheckmarkCircleFilled className={styles.summaryIcon} /> : <CircleRegular className={styles.summaryPending} />}<span><Text size={200} className={styles.muted}>Published agent</Text><br /><Text weight="semibold">{agent?.displayName ?? 'Not resolved'}</Text></span></div>
          <div className={styles.summaryItem}><CheckmarkCircleFilled className={styles.summaryIcon} /><span><Text size={200} className={styles.muted}>Icon</Text><br /><Text weight="semibold">{icon.source === 'agent' ? 'Copilot Studio logo' : icon.source === 'uploaded' ? 'Uploaded logo' : 'Default Agent Sidecar icon'}</Text></span></div>
          <div className={styles.summaryItem}><ShieldKeyholeRegular className={styles.summaryIcon} /><span><Text size={200} className={styles.muted}>Security</Text><br /><Text weight="semibold">System Administrators only</Text></span></div>
          <Text size={200} className={styles.muted}>Knowledge authoring and publication remain outside installer scope.</Text>
        </Card>
      </div>
    </div>
  );
}
