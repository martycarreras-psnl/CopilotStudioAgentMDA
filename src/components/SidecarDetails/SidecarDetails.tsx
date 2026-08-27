import { useState } from 'react';
import {
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
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
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  DeleteRegular,
  DismissCircleRegular,
  ImageRegular,
  PauseRegular,
  PlayRegular,
  ShieldCheckmarkRegular,
  TableRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { SidecarEditorDialog } from '@/components/SidecarDetails/SidecarEditorDialog';
import { HealthBadge, LifecycleBadge } from '@/components/SidecarStatusBadge/SidecarStatusBadge';
import { OperationProgress } from '@/components/OperationProgress/OperationProgress';
import type { OperationLogEntry } from '@/hooks/useOperationReport';
import { SidecarIcon } from '@/components/SidecarIcon/SidecarIcon';
import type { SidecarConfiguration, SidecarEditModel, SidecarMutableUpdate, SidecarProgress } from '@/types/sidecar-admin-models';

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXL, paddingBlock: tokens.spacingVerticalXXL },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXL,
    padding: tokens.spacingHorizontalXL,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundImage: `linear-gradient(135deg, ${tokens.colorBrandBackground2}, ${tokens.colorNeutralBackground1} 72%)`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow4,
    '@media (max-width: 720px)': { alignItems: 'stretch', flexDirection: 'column' },
  },
  identity: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalL },
  heading: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  badges: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: tokens.spacingHorizontalL, alignItems: 'start', '@media (max-width: 900px)': { gridTemplateColumns: '1fr' } },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  card: {
    padding: tokens.spacingHorizontalL,
    gap: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
  },
  facts: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: tokens.spacingHorizontalL, '@media (max-width: 520px)': { gridTemplateColumns: '1fr' } },
  fact: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  muted: { color: tokens.colorNeutralForeground2 },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 560px)': { flexDirection: 'column' },
  },
  cardHeading: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  headingIcon: { color: tokens.colorBrandForeground1 },
  appearance: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
  lifecycleAction: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  healthRow: { display: 'grid', gridTemplateColumns: '24px 1fr', gap: tokens.spacingHorizontalS, paddingBlock: tokens.spacingVerticalS, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  healthPass: { color: tokens.colorPaletteGreenForeground1 },
  healthWarning: { color: tokens.colorPaletteMarigoldForeground2 },
  healthFail: { color: tokens.colorPaletteRedForeground1 },
  tableRow: { display: 'grid', gridTemplateColumns: 'minmax(180px, .7fr) minmax(0, 1.3fr)', gap: tokens.spacingHorizontalL, paddingBlock: tokens.spacingVerticalM, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  formNames: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS },
  formName: {
    paddingInline: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalXXS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  danger: { border: `1px solid ${tokens.colorPaletteRedBorder2}` },
});

interface SidecarDetailsProps {
  configuration?: SidecarConfiguration | null;
  dataverseOrgUrl?: string;
  loading: boolean;
  busy: boolean;
  error?: string;
  editModel?: SidecarEditModel;
  editLoading: boolean;
  editError?: string;
  report?: {
    active: boolean;
    progress?: SidecarProgress;
    entries: OperationLogEntry[];
    errorCount: number;
    hasEntries: boolean;
    onDownload: () => void;
  };
  onBack: () => void;
  onEditOpen: () => void;
  onValidate: () => Promise<void>;
  onUpdate: (update: SidecarMutableUpdate) => Promise<void>;
  onReconcile: () => Promise<void>;
  onSetEnabled: (enabled: boolean) => Promise<void>;
  onUninstall: () => Promise<void>;
}

export function SidecarDetails({
  configuration,
  dataverseOrgUrl,
  loading,
  busy,
  error,
  editModel,
  editLoading,
  editError,
  report,
  onBack,
  onEditOpen,
  onValidate,
  onUpdate,
  onReconcile,
  onSetEnabled,
  onUninstall,
}: SidecarDetailsProps) {
  const styles = useStyles();
  const [editorOpen, setEditorOpen] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);

  const confirmUninstall = () => {
    setUninstallOpen(false);
    void onUninstall();
  };

  if (loading) return <div className={styles.page}><Spinner label="Validating sidecar health" /></div>;
  if (!configuration) return <div className={styles.page}><Button icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button><MessageBar intent="error"><MessageBarBody><MessageBarTitle>Sidecar not found</MessageBarTitle>The configuration may have been removed.</MessageBarBody></MessageBar></div>;

  const validationTime = configuration.lastValidatedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(configuration.lastValidatedAt))
    : 'Never';

  return (
    <div className={styles.page}>
      <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back to dashboard</Button>
      <section className={styles.header}>
        <div className={styles.identity}>
          <SidecarIcon
            label={configuration.name}
            content={configuration.iconContent}
            webResourceName={configuration.iconWebResourceName}
            dataverseOrgUrl={dataverseOrgUrl}
            size={64}
          />
          <div className={styles.heading}>
            <Title1 as="h1">{configuration.name}</Title1>
            <Text size={400} className={styles.muted}>{configuration.appDisplayName} · {configuration.agentDisplayName}</Text>
            <div className={styles.badges}><HealthBadge state={configuration.healthState} /><LifecycleBadge state={configuration.lifecycleState} /></div>
          </div>
        </div>
      </section>

      {error && <MessageBar intent="error"><MessageBarBody><MessageBarTitle>Operation failed</MessageBarTitle>{error}</MessageBarBody></MessageBar>}
      {report && !editorOpen && (report.active || report.hasEntries) && (
        <OperationProgress
          active={report.active}
          progress={report.progress}
          entries={report.entries}
          errorCount={report.errorCount}
          downloadable={report.hasEntries}
          onDownload={report.onDownload}
          activeNote="Working through the bound forms. Keep this tab open until it finishes."
        />
      )}
      {configuration.healthState === 'critical' && <MessageBar intent="error"><MessageBarBody><MessageBarTitle>Rollback incomplete</MessageBarTitle>The sidecar remains disabled. Resolve the failed health check before enabling it.</MessageBarBody></MessageBar>}

      <div className={styles.grid}>
        <div className={styles.stack}>
          {configuration.driftItems.length > 0 && (
            <Card className={styles.card}>
              <Title2 as="h2">Drift review</Title2>
              <Text>Live metadata differs from the saved configuration. Review the differences before approving reconciliation.</Text>
              {configuration.driftItems.map((item) => <MessageBar key={item.id} intent={item.kind === 'conflict' ? 'warning' : 'info'}><MessageBarBody><MessageBarTitle>{item.title}</MessageBarTitle>{item.detail}</MessageBarBody></MessageBar>)}
              <Button appearance="primary" icon={<ArrowSyncRegular />} onClick={onReconcile} disabled={busy}>Approve reconciliation</Button>
            </Card>
          )}

          <Card className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeading}>
                <Title2 as="h2">Health validation</Title2>
                <Text className={styles.muted}>Last validated: {validationTime}</Text>
              </div>
              <Button icon={<ShieldCheckmarkRegular />} onClick={onValidate} disabled={busy}>Validate health</Button>
            </div>
            {configuration.healthChecks.map((check) => (
              <div className={styles.healthRow} key={check.id}>
                {check.state === 'pass'
                  ? <CheckmarkCircleRegular className={styles.healthPass} aria-label="Passed" />
                  : check.state === 'warning'
                    ? <WarningRegular className={styles.healthWarning} aria-label="Warning" />
                    : <DismissCircleRegular className={styles.healthFail} aria-label="Failed" />}
                <div><Text weight="semibold">{check.label}</Text><br /><Text className={styles.muted}>{check.detail}</Text></div>
              </div>
            ))}
            <Text>{configuration.lastOperationSummary}</Text>
          </Card>

          <Card className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeading}>
                <div className={styles.identity}><TableRegular className={styles.headingIcon} /><Title2 as="h2">Placement</Title2></div>
                <Text className={styles.muted}>Tables and exact forms where this sidecar is available.</Text>
              </div>
              <SidecarEditorDialog
                triggerLabel="Edit placement"
                initialSection="placement"
                configurationName={configuration.name}
                currentIconSource={configuration.iconSource}
                currentIconContent={configuration.iconContent}
                currentIconWebResourceName={configuration.iconWebResourceName}
                dataverseOrgUrl={dataverseOrgUrl}
                model={editModel}
                loading={editLoading}
                busy={busy}
                error={editError}
                operationReport={report}
                onOpen={onEditOpen}
                onDialogOpenChange={setEditorOpen}
                onSave={onUpdate}
              />
            </div>
            {configuration.tables.map((table) => (
              <div className={styles.tableRow} key={table.logicalName}>
                <div><Text weight="semibold">{table.displayName}</Text><br /><Text size={200} className={styles.muted}>{table.logicalName}</Text></div>
                <div className={styles.formNames}>
                  {table.forms.map((form) => (
                    <Text className={styles.formName} size={200} key={form.formId}>{form.name}</Text>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </div>

        <aside className={styles.stack}>
          <Card className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeading}>
                <div className={styles.identity}><ImageRegular className={styles.headingIcon} /><Title3>Appearance</Title3></div>
                <Text className={styles.muted}>The icon people see on the sidecar rail.</Text>
              </div>
              <SidecarEditorDialog
                triggerLabel="Change icon"
                initialSection="appearance"
                configurationName={configuration.name}
                currentIconSource={configuration.iconSource}
                currentIconContent={configuration.iconContent}
                currentIconWebResourceName={configuration.iconWebResourceName}
                dataverseOrgUrl={dataverseOrgUrl}
                model={editModel}
                loading={editLoading}
                busy={busy}
                error={editError}
                operationReport={report}
                onOpen={onEditOpen}
                onDialogOpenChange={setEditorOpen}
                onSave={onUpdate}
              />
            </div>
            <div className={styles.appearance}>
              <SidecarIcon
                label={configuration.name}
                content={configuration.iconContent}
                webResourceName={configuration.iconWebResourceName}
                dataverseOrgUrl={dataverseOrgUrl}
                size={56}
              />
              <div className={styles.fact}>
                <Text size={200} className={styles.muted}>Icon source</Text>
                <Text weight="semibold">{configuration.iconSource === 'agent' ? 'Copilot Studio agent logo' : configuration.iconSource === 'uploaded' ? 'Custom uploaded logo' : 'Agent Sidecar default'}</Text>
              </div>
            </div>
            {configuration.iconDisplayIssue && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>Configured icon unavailable</MessageBarTitle>
                  {configuration.iconDisplayIssue} The packaged icon is shown as a fallback.
                </MessageBarBody>
              </MessageBar>
            )}
          </Card>
          <Card className={styles.card}>
            <div className={styles.cardHeading}>
              <Title3>Availability</Title3>
              <Text className={styles.muted}>Control whether the configured panes are available without deleting the sidecar.</Text>
            </div>
            <Text weight="semibold">{configuration.lifecycleState === 'disabled' ? 'Currently disabled' : 'Currently enabled'}</Text>
            <div className={styles.lifecycleAction}>
              {configuration.lifecycleState === 'disabled'
                ? <Button appearance="primary" icon={<PlayRegular />} onClick={() => onSetEnabled(true)} disabled={busy || configuration.healthState === 'critical'} title={configuration.healthState === 'critical' ? 'Resolve blocking health failures before enabling.' : undefined}>Enable sidecar</Button>
                : <Button icon={<PauseRegular />} onClick={() => onSetEnabled(false)} disabled={busy}>Disable sidecar</Button>}
            </div>
            <Text size={200} className={styles.muted}>Changes use rollback protection and preserve this configuration identity.</Text>
          </Card>
          <Card className={styles.card}>
            <Title3>Technical details</Title3>
            <div className={styles.facts}>
              <div className={styles.fact}><Text size={200} className={styles.muted}>App unique name</Text><Text>{configuration.appUniqueName}</Text></div>
              <div className={styles.fact}><Text size={200} className={styles.muted}>Pane width</Text><Text>{configuration.paneWidth}px</Text></div>
              <div className={styles.fact}><Text size={200} className={styles.muted}>Agent schema</Text><Text>{configuration.agentSchemaName}</Text></div>
              <div className={styles.fact}><Text size={200} className={styles.muted}>Binding solution</Text><Text>{configuration.bindingSolutionUniqueName}</Text></div>
            </div>
          </Card>
          <Card className={mergeClasses(styles.card, styles.danger)}>
            <Title3>Scoped uninstall</Title3>
            <Text>Remove only sidecar-owned handlers, libraries, configuration, and Target Binding components. Shared or unrelated customizations remain untouched.</Text>
            <Dialog modalType="non-modal" open={uninstallOpen} onOpenChange={(_, data) => setUninstallOpen(data.open)}>
              <DialogTrigger disableButtonEnhancement><Button appearance="secondary" icon={<DeleteRegular />} disabled={busy}>Uninstall sidecar</Button></DialogTrigger>
              <DialogSurface>
                <DialogBody>
                  <DialogTitle>Uninstall {configuration.name}?</DialogTitle>
                  <DialogContent>Dependency checks run first. Only components owned by this binding are removed. This action cannot restore deleted configuration automatically.</DialogContent>
                  <DialogActions>
                    <DialogTrigger disableButtonEnhancement><Button appearance="secondary">Cancel</Button></DialogTrigger>
                    <Button appearance="primary" onClick={confirmUninstall}>Confirm scoped uninstall</Button>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>
          </Card>
        </aside>
      </div>
    </div>
  );
}
