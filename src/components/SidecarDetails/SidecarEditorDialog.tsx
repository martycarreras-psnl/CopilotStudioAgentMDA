import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
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
  Tab,
  TabList,
  Text,
  Title3,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  CheckmarkCircleFilled,
  EditRegular,
  ImageRegular,
  LockClosedRegular,
  TableRegular,
} from '@fluentui/react-icons';
import { defaultFormId } from '@/lib/target-forms';
import { OperationProgress } from '@/components/OperationProgress/OperationProgress';
import { SidecarIcon } from '@/components/SidecarIcon/SidecarIcon';
import { SidecarIconPicker } from '@/components/SidecarWizard/SidecarIconPicker';
import type { OperationLogEntry } from '@/hooks/useOperationReport';
import type {
  SidecarEditModel,
  SidecarIconContent,
  SidecarIconSelection,
  SidecarIconSource,
  SidecarMutableUpdate,
  SidecarProgress,
  TargetTable,
} from '@/types/sidecar-admin-models';

const useStyles = makeStyles({
  surface: {
    width: 'min(960px, calc(100vw - 32px))',
    maxWidth: '960px',
    maxHeight: 'min(760px, calc(100vh - 32px))',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minHeight: 0,
  },
  intro: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  eyebrow: { color: tokens.colorBrandForeground1, textTransform: 'uppercase', letterSpacing: '0.08em' },
  identityNote: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  editor: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  tabs: {
    paddingInline: tokens.spacingHorizontalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  placementWorkspace: {
    display: 'grid',
    gridTemplateColumns: '240px minmax(0, 1fr)',
    minHeight: '390px',
    maxHeight: 'min(480px, calc(100vh - 260px))',
    '@media (max-width: 700px)': {
      gridTemplateColumns: '1fr',
      maxHeight: 'none',
    },
  },
  tableNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalS,
    overflowY: 'auto',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    '@media (max-width: 700px)': {
      maxHeight: '170px',
      borderRight: '0',
      borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    },
  },
  tableNavLabel: {
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalS,
  },
  tableButton: {
    width: '100%',
    height: 'auto',
    minHeight: '54px',
    justifyContent: 'flex-start',
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalS,
  },
  tableButtonSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    boxShadow: tokens.shadow2,
  },
  tableButtonContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXXS,
    width: '100%',
    minWidth: 0,
  },
  tableButtonStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  formsPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    minWidth: 0,
    overflowY: 'auto',
  },
  formsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  formsHeaderCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalS,
    '@media (max-width: 760px)': { gridTemplateColumns: '1fr' },
  },
  formOption: {
    display: 'flex',
    minHeight: '44px',
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  emptyForms: {
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  appearanceWorkspace: {
    display: 'grid',
    gridTemplateColumns: '220px minmax(0, 1fr)',
    gap: tokens.spacingHorizontalXL,
    minHeight: '240px',
    padding: tokens.spacingHorizontalXL,
    '@media (max-width: 700px)': {
      gridTemplateColumns: '1fr',
      minHeight: 0,
    },
  },
  appearancePreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground3,
    textAlign: 'center',
    alignSelf: 'start',
  },
  appearanceControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  muted: { color: tokens.colorNeutralForeground2 },
  selectionSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorPaletteGreenForeground1,
  },
  footer: {
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  savingPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  savingIntro: {
    display: 'grid',
    gridTemplateColumns: '40px minmax(0, 1fr)',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  savingCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  saveStages: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalS,
    '@media (max-width: 700px)': { gridTemplateColumns: '1fr' },
  },
  saveStage: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  saveStageIcon: {
    color: tokens.colorBrandForeground1,
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
  initialSection?: 'placement' | 'appearance';
  configurationName?: string;
  currentIconSource?: SidecarIconSource;
  currentIconContent?: SidecarIconContent;
  currentIconWebResourceName?: string;
  dataverseOrgUrl?: string;
  operationReport?: {
    progress?: SidecarProgress;
    entries: OperationLogEntry[];
    errorCount: number;
    onDownload: () => void;
  };
  onOpen: () => void;
  onDialogOpenChange?: (open: boolean) => void;
  onSave: (update: SidecarMutableUpdate) => Promise<void>;
}

export function SidecarEditorDialog({
  model,
  loading,
  busy,
  error,
  triggerLabel = 'Edit tables & icon',
  initialSection = 'placement',
  configurationName = 'sidecar',
  currentIconSource = 'default',
  currentIconContent,
  currentIconWebResourceName,
  dataverseOrgUrl,
  operationReport,
  onOpen,
  onDialogOpenChange,
  onSave,
}: SidecarEditorDialogProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<TargetTable[]>([]);
  const [iconMode, setIconMode] = useState<'keep' | 'replace'>('keep');
  const [icon, setIcon] = useState<SidecarIconSelection>({ source: 'default' });
  const [iconError, setIconError] = useState<string>();
  const [section, setSection] = useState<'placement' | 'appearance'>(initialSection);
  const [selectedTableName, setSelectedTableName] = useState<string>();
  const initializedVersion = useRef<string>();

  useEffect(() => {
    if (!open) {
      initializedVersion.current = undefined;
      setSection(initialSection);
      return;
    }
    if (!model || initializedVersion.current !== undefined) return;
    initializedVersion.current = model.editVersion;
    setTables(cloneTables(model.tables));
    setIconMode('keep');
    setIcon(model.agentIcon
      ? { source: 'agent', content: model.agentIcon }
      : { source: 'default' });
    setSelectedTableName(
      model.tables.find((table) => table.enabled)?.logicalName
      ?? model.tables[0]?.logicalName,
    );
    setIconError(undefined);
  }, [initialSection, model, open]);

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
  const selectedTable = useMemo(
    () => tables.find((table) => table.logicalName === selectedTableName) ?? tables[0],
    [selectedTableName, tables],
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
      onDialogOpenChange?.(false);
    } catch {
      // The page mutation exposes the actionable error inside this dialog.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        if (busy) return;
        setOpen(data.open);
        onDialogOpenChange?.(data.open);
      }}
    >
      <Button
        icon={<EditRegular />}
        onClick={() => {
          onOpen();
          setSection(initialSection);
          setOpen(true);
          onDialogOpenChange?.(true);
        }}
        disabled={busy}
      >
        {triggerLabel}
      </Button>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <div className={styles.intro}>
            <Text size={200} weight="semibold" className={styles.eyebrow}>Sidecar settings</Text>
            <DialogTitle>Edit sidecar settings</DialogTitle>
            <Text className={styles.muted}>
              Update where {configurationName} appears and how people recognize it in the target app.
            </Text>
          </div>
          <DialogContent className={styles.stack}>
            <div className={styles.identityNote}>
              <LockClosedRegular />
              <Text size={200}>
                <strong>Safe in-place update.</strong> Sidecar identity and conversation history stay unchanged.
              </Text>
            </div>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody><MessageBarTitle>Update failed</MessageBarTitle>{error}</MessageBarBody>
              </MessageBar>
            )}
            {busy ? (
              <div className={styles.savingPanel} aria-label="Saving sidecar settings">
                <div className={styles.savingIntro}>
                  <Spinner size="medium" />
                  <div className={styles.savingCopy}>
                    <Title3 as="h3">Applying your changes</Title3>
                    <Text className={styles.muted}>
                      Keep this window open while Agent Sidecar safely updates and verifies the configuration.
                    </Text>
                  </div>
                </div>
                <OperationProgress
                  active
                  progress={operationReport?.progress}
                  entries={operationReport?.entries}
                  errorCount={operationReport?.errorCount ?? 0}
                  downloadable={Boolean(operationReport?.entries.length)}
                  onDownload={operationReport?.onDownload ?? (() => undefined)}
                  activeNote="This can take a few minutes. The editor will close after the live configuration passes verification."
                />
                <div className={styles.saveStages} aria-label="Save workflow">
                  <div className={styles.saveStage}>
                    <TableRegular className={styles.saveStageIcon} />
                    <Text weight="semibold">Update placement</Text>
                    <Text size={200} className={styles.muted}>
                      Apply the selected form bindings without changing the sidecar identity.
                    </Text>
                  </div>
                  <div className={styles.saveStage}>
                    <EditRegular className={styles.saveStageIcon} />
                    <Text weight="semibold">Publish changes</Text>
                    <Text size={200} className={styles.muted}>
                      Publish the affected app customizations so the new placement becomes available.
                    </Text>
                  </div>
                  <div className={styles.saveStage}>
                    <CheckmarkCircleFilled className={styles.saveStageIcon} />
                    <Text weight="semibold">Verify the result</Text>
                    <Text size={200} className={styles.muted}>
                      Read back the live forms and restore the last known good state if validation fails.
                    </Text>
                  </div>
                </div>
              </div>
            ) : loading || !model ? <Spinner label="Loading current app tables and forms" /> : (
              <div className={styles.editor}>
                <TabList
                  className={styles.tabs}
                  selectedValue={section}
                  onTabSelect={(_, data) =>
                    setSection(data.value as 'placement' | 'appearance')}
                >
                  <Tab value="placement" icon={<TableRegular />}>
                    Placement <Badge appearance="tint">{selectedFormCount}</Badge>
                  </Tab>
                  <Tab value="appearance" icon={<ImageRegular />}>Appearance</Tab>
                </TabList>
                {section === 'placement' ? (
                  <div className={styles.placementWorkspace}>
                    <nav className={styles.tableNav} aria-label="Available tables">
                      <Text className={styles.tableNavLabel} size={200} weight="semibold">
                        TABLES
                      </Text>
                      {tables.map((table) => {
                        const tableFormCount = table.forms.filter((form) => table.enabled && form.enabled).length;
                        const selected = table.logicalName === selectedTable?.logicalName;
                        return (
                          <Button
                            key={table.logicalName}
                            appearance="subtle"
                            className={mergeClasses(
                              styles.tableButton,
                              selected && styles.tableButtonSelected,
                            )}
                            aria-current={selected ? 'page' : undefined}
                            onClick={() => setSelectedTableName(table.logicalName)}
                          >
                            <span className={styles.tableButtonContent}>
                              <Text weight="semibold">{table.displayName}</Text>
                              <span className={styles.tableButtonStatus}>
                                {table.enabled && <CheckmarkCircleFilled />}
                                <Text size={200}>
                                  {table.enabled
                                    ? `${tableFormCount} form${tableFormCount === 1 ? '' : 's'} selected`
                                    : 'Not enabled'}
                                </Text>
                              </span>
                            </span>
                          </Button>
                        );
                      })}
                    </nav>
                    {selectedTable && (
                      <section className={styles.formsPanel} aria-label={`${selectedTable.displayName} forms`}>
                        <div className={styles.formsHeader}>
                          <div className={styles.formsHeaderCopy}>
                            <Text size={500} weight="semibold">{selectedTable.displayName}</Text>
                            <Text size={200} className={styles.muted}>{selectedTable.logicalName}</Text>
                          </div>
                          <Checkbox
                            checked={selectedTable.enabled}
                            label="Enable on this table"
                            onChange={(_, data) =>
                              setTableEnabled(selectedTable.logicalName, Boolean(data.checked))}
                          />
                        </div>
                        <Text size={200} className={styles.muted}>
                          Choose the main forms where the sidecar should appear.
                        </Text>
                        {unavailableSelectedCount > 0 && (
                          <MessageBar intent="warning">
                            <MessageBarBody>
                              <MessageBarTitle>Previously bound forms are no longer available</MessageBarTitle>
                              Deselect each unavailable form to confirm its binding should be removed.
                            </MessageBarBody>
                          </MessageBar>
                        )}
                        {selectedTable.enabled ? (
                          <div className={styles.formGrid}>
                            {selectedTable.forms.map((form) => (
                              <div className={styles.formOption} key={form.formId}>
                                <Checkbox
                                  checked={form.enabled}
                                  disabled={form.available === false && !form.enabled}
                                  label={form.available === false
                                    ? `${form.name} (no longer available)`
                                    : form.name}
                                  onChange={(_, data) =>
                                    setFormEnabled(
                                      selectedTable.logicalName,
                                      form.formId,
                                      Boolean(data.checked),
                                    )}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={styles.emptyForms}>
                            <Text weight="semibold">This table is not enabled.</Text><br />
                            <Text size={200} className={styles.muted}>
                              Enable it to choose the forms where the sidecar should appear.
                            </Text>
                          </div>
                        )}
                        <div className={styles.selectionSummary}>
                          <CheckmarkCircleFilled />
                          <Text size={200}>
                            {selectedFormCount} form{selectedFormCount === 1 ? '' : 's'} selected across all tables
                          </Text>
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <div className={styles.appearanceWorkspace}>
                    <div className={styles.appearancePreview}>
                      <Text size={200} className={styles.muted}>CURRENT ICON</Text>
                    <SidecarIcon
                      label={configurationName}
                      content={currentIconContent}
                      webResourceName={currentIconWebResourceName}
                      dataverseOrgUrl={dataverseOrgUrl}
                      size={72}
                    />
                      <Text weight="semibold">
                        {currentIconSource === 'agent'
                          ? 'Copilot Studio agent logo'
                          : currentIconSource === 'uploaded'
                            ? 'Custom uploaded logo'
                            : 'Agent Sidecar default'}
                      </Text>
                    </div>
                    <div className={styles.appearanceControls}>
                      <div>
                        <Text size={500} weight="semibold">Sidecar icon</Text><br />
                        <Text size={200} className={styles.muted}>
                          Choose the icon people will recognize on the model-driven app rail.
                        </Text>
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
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
          <DialogActions className={styles.footer}>
            <Button
              appearance="secondary"
              onClick={() => {
                setOpen(false);
                onDialogOpenChange?.(false);
              }}
              disabled={busy}
            >
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
              {busy ? 'Saving changes…' : 'Save changes'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
