import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { EditRegular } from '@fluentui/react-icons';
import { defaultFormId } from '@/lib/target-forms';
import { SidecarIconPicker } from '@/components/SidecarWizard/SidecarIconPicker';
import type {
  SidecarEditModel,
  SidecarIconSelection,
  SidecarMutableUpdate,
  TargetTable,
} from '@/types/sidecar-admin-models';

const useStyles = makeStyles({
  surface: { width: 'min(760px, calc(100vw - 32px))', maxWidth: '760px' },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingBlock: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  table: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  forms: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalXL,
  },
  muted: { color: tokens.colorNeutralForeground2 },
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
  onOpen: () => void;
  onSave: (update: SidecarMutableUpdate) => Promise<void>;
}

export function SidecarEditorDialog({
  model,
  loading,
  busy,
  error,
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
        Edit tables &amp; icon
      </Button>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Edit tables, forms, and icon</DialogTitle>
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
              <>
                <section className={styles.section}>
                  <Text weight="semibold" size={400}>Tables and forms</Text>
                  <Text size={200} className={styles.muted}>
                    The list is refreshed from the current model-driven app. Select at least one form.
                  </Text>
                  {unavailableSelectedCount > 0 && (
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        <MessageBarTitle>Previously bound forms are no longer available</MessageBarTitle>
                        Deselect each unavailable form to confirm its binding should be removed.
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  {tables.map((table) => (
                    <div className={styles.section} key={table.logicalName}>
                      <div className={styles.table}>
                        <div>
                          <Text weight="semibold">{table.displayName}</Text><br />
                          <Text size={200} className={styles.muted}>{table.logicalName}</Text>
                        </div>
                        <Checkbox
                          checked={table.enabled}
                          label="Enabled"
                          onChange={(_, data) =>
                            setTableEnabled(table.logicalName, Boolean(data.checked))}
                        />
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
                    </div>
                  ))}
                  <Text size={200}>{selectedFormCount} form{selectedFormCount === 1 ? '' : 's'} selected</Text>
                </section>
                <section className={styles.section}>
                  <Text weight="semibold" size={400}>Sidecar icon</Text>
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
                </section>
              </>
            )}
          </DialogContent>
          <DialogActions>
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
