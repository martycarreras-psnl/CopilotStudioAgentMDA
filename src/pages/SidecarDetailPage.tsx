import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SidecarDetails } from '@/components/SidecarDetails/SidecarDetails';
import { useOperationReport } from '@/hooks/useOperationReport';
import {
  useReconcileSidecar,
  useAdminAccess,
  useSetSidecarEnabled,
  useSidecarConfiguration,
  useSidecarEditModel,
  useUninstallSidecar,
  useUpdateSidecar,
  useValidateSidecar,
} from '@/hooks/useSidecarAdministration';

export function SidecarDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editRequested, setEditRequested] = useState(false);
  const access = useAdminAccess();
  const configuration = useSidecarConfiguration(id);
  const editModel = useSidecarEditModel(id, editRequested);
  const update = useUpdateSidecar();
  const validate = useValidateSidecar();
  const reconcile = useReconcileSidecar();
  const setEnabled = useSetSidecarEnabled();
  const uninstall = useUninstallSidecar();
  const report = useOperationReport();
  const error = [configuration.error, validate.error, reconcile.error, setEnabled.error, uninstall.error]
    .find((item): item is Error => item instanceof Error);
  const editError = [editModel.error, update.error]
    .find((item): item is Error => item instanceof Error);
  const busy = validate.isPending || update.isPending || reconcile.isPending || setEnabled.isPending || uninstall.isPending;

  return (
    <SidecarDetails
      configuration={configuration.data}
      dataverseOrgUrl={access.data?.dataverseOrgUrl}
      loading={configuration.isLoading}
      busy={busy}
      error={error?.message}
      editModel={editModel.data}
      editLoading={editModel.isLoading}
      editError={editError?.message}
      report={{ active: busy, progress: report.progress, entries: report.log, errorCount: report.errorCount, hasEntries: report.hasEntries, onDownload: report.download }}
      onBack={() => navigate('/')}
      onEditOpen={() => setEditRequested(true)}
      onValidate={async () => { if (id) await validate.mutateAsync(id); }}
      onUpdate={async (mutableUpdate) => {
        if (!id) return;
        report.begin('Update sidecar', {
          id,
          selectedForms: mutableUpdate.tables.reduce(
            (count, table) =>
              count + table.forms.filter((form) => table.enabled && form.enabled).length,
            0,
          ),
          iconChange: mutableUpdate.icon?.source ?? 'keep',
        });
        try {
          await update.mutateAsync({
            id,
            update: mutableUpdate,
            onProgress: report.onProgress,
          });
          report.recordSuccess('Tables, forms, and icon updated in place.');
        } catch (caught) {
          const updateError = caught instanceof Error ? caught : new Error('Sidecar update failed.');
          report.recordError(updateError.message);
          throw updateError;
        }
      }}
      onReconcile={async () => {
        if (!id) return;
        report.begin('Reconcile sidecar', { id });
        try { await reconcile.mutateAsync({ id, onProgress: report.onProgress }); report.recordSuccess('Reconciliation completed.'); }
        catch (caught) { report.recordError(caught instanceof Error ? caught.message : 'Reconciliation failed.'); }
      }}
      onSetEnabled={async (enabled) => {
        if (!id) return;
        report.begin(enabled ? 'Enable sidecar' : 'Disable sidecar', { id, enabled });
        try { await setEnabled.mutateAsync({ id, enabled, onProgress: report.onProgress }); report.recordSuccess(enabled ? 'Sidecar enabled.' : 'Sidecar disabled.'); }
        catch (caught) { report.recordError(caught instanceof Error ? caught.message : 'Operation failed.'); }
      }}
      onUninstall={async () => {
        if (!id) return;
        report.begin('Uninstall sidecar', { id });
        try { await uninstall.mutateAsync({ id, onProgress: report.onProgress }); report.recordSuccess('Uninstall completed.'); navigate('/'); }
        catch (caught) { report.recordError(caught instanceof Error ? caught.message : 'Uninstall failed.'); }
      }}
    />
  );
}
