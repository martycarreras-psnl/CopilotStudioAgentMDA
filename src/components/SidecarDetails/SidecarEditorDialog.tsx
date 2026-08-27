import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkCircleFilled, EditRegular, ImageRegular, TableRegular } from '@fluentui/react-icons';
import { defaultFormId } from '@/lib/target-forms';
import { SidecarIcon } from '@/components/SidecarIcon/SidecarIcon';
import { SidecarIconPicker } from '@/components/SidecarWizard/SidecarIconPicker';
import type {
  SidecarEditModel,
  SidecarIconContent,
  SidecarIconSelection,
  SidecarIconSource,
  SidecarMutableUpdate,
  TargetTable,
} from '@/types/sidecar-admin-models';

const useStyles = makeStyles({
  surface: {
    width: 'min(1040px, calc(100vw - 32px))',
    maxWidth: '1040px',
    maxHeight: 'min(900px, calc(100vh - 32px))',
  },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  intro: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  eyebrow: { color: tokens.colorBrandForeground1, textTransform: 'uppercase', letterSpacing: '0.08em' },
  editorGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.45fr) minmax(300px, .55fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 820px)': { gridTemplateColumns: '1fr' },
  },
  sectionCard: {
    padding: tokens.spacingHorizontalL,
    gap: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: 'none',
  },
  sectionHeading: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  placementHeader: {
    display: 'grid',
    gridTemplateColumns: 'minmax(150px, .8fr) minmax(240px, 1.4fr) auto',
    gap: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground2,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(150px, .8fr) minmax(240px, 1.4fr) auto',
    alignItems: 'start',
    gap: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  forms: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
  muted: { color: tokens.colorNeutralForeground2 },
  selectionSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorPaletteGreenForeground1,
  },
  currentIcon: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  currentIconCopy: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  footer: {
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

function cloneTables(tables: TargetTable[]): TargetTable[] {
  return tables.map((table) => ({
    ...table,
    forms: table.forms.map((form) => ({ ...form })),
  }));
}

interface SidecarEditorDialogProps {
  model?: SidecarEditModel;
  loading: boolean;
  busy: boolean;
  error?: string;
  triggerLabel?: string;
  configurationName?: string;
  currentIconSource?: SidecarIconSource;
  currentIconContent?: SidecarIconContent;
  currentIconWebResourceName?: string;
  dataverseOrgUrl?: string;
  onOpen: () => void;
  onSave: (update: SidecarMutableUpdate) => Promise<void>;
}

export function SidecarEditorDialog({
  model,
  loading,
  busy,
  error,
  triggerLabel = 'Edit tables & icon',
  configurationName = 'sidecar',
  currentIconSource = 'default',
  currentIconContent,
  currentIconWebResourceName,
  dataverseOrgUrl,
  onOpen,
  onSave,
}: SidecarEditorDialogProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<TargetTable[]>([]);
  const [iconMode, setIconMode] = useState<'keep' | 'replace'>('keep');
  const [icon, setIcon] = useState<SidecarIconSelection>({ source: 'default' });
  const [iconError, setIconError] = useState<string>();
  const initializedVersion = useRef<string>();

  useEffect(() => {
    if (!open) {
      initializedVersion.current = undefined;
      return;
    }
    if (!model || initializedVersion.current !== undefined) return;
    initializedVersion.current = model.editVersion;
    setTables(cloneTables(model.tables));
    setIconMode('keep');
    setIcon(model.agentIcon
      ? { source: 'agent', content: model.agentIcon }
      : { source: 'default' });
    setIconError(undefined);
  }, [model, open]);

  const selectedFormCount = useMemo(
    () => tables.reduce((count, table) =>
      count + table.forms.filter((form) => table.enabled && form.enabled).length, 0),
    [tables],
  );
  const unavailableSelectedCount = useMemo(
    () => tables.reduce((count, table) =>
      count + table.forms.filter((form) =>
        table.enabled && form.enabled && form.available === false).length, 0),
    [tables],
  );

  const setTableEnabled = (logicalName: string, enabled: boolean) => {
    setTables((current) => current.map((table) => {
      if (table.logicalName !== logicalName) return table;
      const hasSelectedForm = table.forms.some((form) => form.enabled);
      const fallback = defaultFormId(table.forms.filter((form) => form.available !== false));
      return {
        ...table,
        enabled,
        forms: table.forms.map((form) => ({
          ...form,
          enabled: enabled && (hasSelectedForm ? form.enabled : form.formId === fallback),
        })),
      };
    }));
  };

  const setFormEnabled = (logicalName: string, formId: string, enabled: boolean) => {
    setTables((current) => current.map((table) => {
      if (table.logicalName !== logicalName) return table;
      const forms = table.forms.map((form) =>
        form.formId === formId ? { ...form, enabled } : form);
      return { ...table, enabled: forms.some((form) => form.enabled), forms };
    }));
  };

  const save = async () => {
    if (!model || selectedFormCount === 0 || unavailableSelectedCount > 0 || iconError) return;
    try {
      await onSave({
        tables,
        icon: iconMode === 'replace' ? icon : undefined,
        expectedEditVersion: model.editVersion,
      });
      setOpen(false);
    } catch {
      // The page mutation exposes the actionable error inside this dialog.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !busy && setOpen(data.open)}>
      <Button
        icon={<EditRegular />}
        onClick={() => {
          onOpen();
          setOpen(true);
        }}
        disabled={busy}
      >
        {triggerLabel}
      </Button>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <div className={styles.intro}>
            <Text size={200} weight="semibold" className={styles.eyebrow}>Sidecar settings</Text>
            <DialogTitle>Refine placement and appearance</DialogTitle>
            <Text className={styles.muted}>
              Update where {configurationName} appears and how people recognize it in the target app.
            </Text>
          </div>
          <DialogContent className={styles.stack}>
            <MessageBar intent="info">
              <MessageBarBody>
                <MessageBarTitle>Identity stays unchanged</MessageBarTitle>
                The app, agent connection, pane identity, Entra identity, binding solution,
                and conversation history are preserved.
              </MessageBarBody>
            </MessageBar>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody><MessageBarTitle>Update failed</MessageBarTitle>{error}</MessageBarBody>
              </MessageBar>
            )}
            {loading || !model ? <Spinner label="Loading current app tables and forms" /> : (
              <div className={styles.editorGrid}>
                <Card className={styles.sectionCard}>
                  <div className={styles.sectionHeading}>
                    <TableRegular />
                    <Text weight="semibold" size={400}>Placement</Text>
                    <Badge appearance="tint">{selectedFormCount} selected</Badge>
                  </div>
                  <Text size={200} className={styles.muted}>Choose the exact main forms where this sidecar should be available.</Text>
                  {unavailableSelectedCount > 0 && (
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        <MessageBarTitle>Previously bound forms are no longer available</MessageBarTitle>
                        Deselect each unavailable form to confirm its binding should be removed.
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  <div className={styles.placementHeader} aria-hidden="true">
                    <Text size={200} weight="semibold">Table</Text>
                    <Text size={200} weight="semibold">Forms</Text>
                    <Text size={200} weight="semibold">Status</Text>
                  </div>
                  {tables.map((table) => (
                    <div className={styles.tableRow} key={table.logicalName}>
                      <div>
                        <Text weight="semibold">{table.displayName}</Text><br />
                        <Text size={200} className={styles.muted}>{table.logicalName}</Text>
                      </div>
                      <div className={styles.forms}>
                        {table.forms.map((form) => (
                          <Checkbox
                            key={form.formId}
                            checked={form.enabled}
                            disabled={form.available === false && !form.enabled}
                            label={form.available === false
                              ? `${form.name} (no longer available)`
                              : form.name}
                            onChange={(_, data) =>
                              setFormEnabled(table.logicalName, form.formId, Boolean(data.checked))}
                          />
                        ))}
                      </div>
                      <Checkbox
                          checked={table.enabled}
                          label="Enabled"
                          onChange={(_, data) =>
                            setTableEnabled(table.logicalName, Boolean(data.checked))}
                        />
                    </div>
                  ))}
                  <div className={styles.selectionSummary}>
                    <CheckmarkCircleFilled />
                    <Text size={200}>{selectedFormCount} form{selectedFormCount === 1 ? '' : 's'} selected</Text>
                  </div>
                </Card>
                <Card className={styles.sectionCard}>
                  <div className={styles.sectionHeading}>
                    <ImageRegular />
                    <Text weight="semibold" size={400}>Appearance</Text>
                  </div>
                  <div className={styles.currentIcon}>
                    <SidecarIcon
                      label={configurationName}
                      content={currentIconContent}
                      webResourceName={currentIconWebResourceName}
                      dataverseOrgUrl={dataverseOrgUrl}
                      size={56}
                    />
                    <div className={styles.currentIconCopy}>
                      <Text size={200} className={styles.muted}>Current icon</Text>
                      <Text weight="semibold">
                        {currentIconSource === 'agent' ? 'Copilot Studio agent logo' : currentIconSource === 'uploaded' ? 'Custom uploaded logo' : 'Agent Sidecar default'}
                      </Text>
                    </div>
                  </div>
                  <RadioGroup
                    value={iconMode}
                    onChange={(_, data) => setIconMode(data.value as 'keep' | 'replace')}
                  >
                    <Radio value="keep" label="Keep the current icon" />
                    <Radio value="replace" label="Choose a different icon" />
                  </RadioGroup>
                  {iconMode === 'replace' && (
                    <SidecarIconPicker
                      agentIcon={model.agentIcon}
                      value={icon}
                      onChange={setIcon}
                      onError={setIconError}
                    />
                  )}
                  {iconError && <Text className={styles.muted}>{iconError}</Text>}
                </Card>
              </div>
            )}
          </DialogContent>
          <DialogActions className={styles.footer}>
            <Button appearance="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={() => void save()}
              disabled={
                loading
                || busy
                || !model
                || selectedFormCount === 0
                || unavailableSelectedCount > 0
                || Boolean(iconError)
              }
            >
              Save changes
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
