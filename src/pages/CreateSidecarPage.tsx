import { useNavigate } from 'react-router-dom';
import { SidecarWizard } from '@/components/SidecarWizard/SidecarWizard';
import {
  useDeploySidecar,
  useDeploymentPreview,
  usePublishedAgents,
  useResolveManualTargetApp,
  useTargetApps,
} from '@/hooks/useSidecarAdministration';

export function CreateSidecarPage() {
  const navigate = useNavigate();
  const targetApps = useTargetApps();
  const publishedAgents = usePublishedAgents();
  const resolveManual = useResolveManualTargetApp();
  const preview = useDeploymentPreview();
  const deploy = useDeploySidecar();
  const error = [targetApps.error, publishedAgents.error, resolveManual.error, preview.error, deploy.error]
    .find((item): item is Error => item instanceof Error);

  return (
    <SidecarWizard
      apps={targetApps.data}
      appsLoading={targetApps.isLoading}
      agents={publishedAgents.data}
      agentsLoading={publishedAgents.isLoading}
      busy={resolveManual.isPending || preview.isPending || deploy.isPending}
      error={error?.message}
      onCancel={() => navigate('/')}
      onResolveManualApp={(appId) => resolveManual.mutateAsync(appId)}
      onPreview={(draft) => preview.mutateAsync(draft)}
      onDeploy={async (draft, onProgress) => {
        const configuration = await deploy.mutateAsync({ draft, onProgress });
        navigate(`/sidecars/${configuration.id}`);
      }}
    />
  );
}
