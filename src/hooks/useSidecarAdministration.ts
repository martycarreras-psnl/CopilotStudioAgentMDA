import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSidecarAdministrationProvider } from '@/services/sidecar-provider-factory';
import type { SidecarConfiguration, SidecarDraft, SidecarMutableUpdate, SidecarProgressCallback } from '@/types/sidecar-admin-models';

const provider = createSidecarAdministrationProvider();

export const sidecarQueryKeys = {
  access: ['sidecar-admin', 'access'] as const,
  configurations: ['sidecar-admin', 'configurations'] as const,
  configuration: (id: string) => ['sidecar-admin', 'configurations', id] as const,
  editModel: (id: string) => ['sidecar-admin', 'configurations', id, 'edit'] as const,
  targetApps: ['sidecar-admin', 'target-apps'] as const,
  publishedAgents: ['sidecar-admin', 'published-agents'] as const,
};

function useConfigurationMutation<TInput>(
  mutationFn: (input: TInput) => Promise<SidecarConfiguration>,
  options?: {
    onSuccess?: (configuration: SidecarConfiguration) => void;
    onSettled?: () => void;
  },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (configuration) => {
      queryClient.setQueryData(sidecarQueryKeys.configuration(configuration.id), configuration);
      queryClient.setQueryData<SidecarConfiguration[]>(sidecarQueryKeys.configurations, (current) => {
        if (!current) return [configuration];
        const exists = current.some((item) => item.id === configuration.id);
        return exists
          ? current.map((item) => (item.id === configuration.id ? configuration : item))
          : [configuration, ...current];
      });
      options?.onSuccess?.(configuration);
    },
    onSettled: () => options?.onSettled?.(),
  });
}

export function useAdminAccess() {
  return useQuery({ queryKey: sidecarQueryKeys.access, queryFn: () => provider.getAccessContext() });
}

export function useSidecarConfigurations() {
  return useQuery({
    queryKey: sidecarQueryKeys.configurations,
    queryFn: () => provider.listConfigurations(),
  });
}

export function useSidecarConfiguration(id: string | undefined) {
  return useQuery({
    queryKey: sidecarQueryKeys.configuration(id ?? 'missing'),
    queryFn: () => (id ? provider.getConfiguration(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useTargetApps() {
  return useQuery({ queryKey: sidecarQueryKeys.targetApps, queryFn: () => provider.discoverTargetApps() });
}

export function usePublishedAgents() {
  return useQuery({
    queryKey: sidecarQueryKeys.publishedAgents,
    queryFn: () => provider.listPublishedAgents(),
  });
}

export function useResolveManualTargetApp() {
  return useMutation({ mutationFn: (appId: string) => provider.resolveManualTargetApp(appId) });
}

export function useResolveAgentLink() {
  return useMutation({
    mutationFn: ({ connectionString, environmentId }: { connectionString: string; environmentId: string }) =>
      provider.resolveAgentLink(connectionString, environmentId),
  });
}

export function useDeploymentPreview() {
  return useMutation({ mutationFn: (draft: SidecarDraft) => provider.previewDeployment(draft) });
}

export function useDeploySidecar() {
  return useConfigurationMutation((input: { draft: SidecarDraft; onProgress?: SidecarProgressCallback }) => provider.deploy(input.draft, input.onProgress));
}

export function useSidecarEditModel(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: sidecarQueryKeys.editModel(id ?? 'missing'),
    queryFn: () => (id ? provider.getEditModel(id) : Promise.reject(new Error('Configuration ID is required.'))),
    enabled: Boolean(id) && enabled,
  });
}

export function useUpdateSidecar() {
  const queryClient = useQueryClient();
  return useConfigurationMutation((input: {
    id: string;
    update: SidecarMutableUpdate;
    onProgress?: SidecarProgressCallback;
  }) => provider.updateMutableConfiguration(input.id, input.update, input.onProgress), {
    onSuccess: (configuration) => {
      void queryClient.invalidateQueries({ queryKey: sidecarQueryKeys.editModel(configuration.id) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sidecarQueryKeys.configurations });
    },
  });
}

export function useValidateSidecar() {
  return useConfigurationMutation((id: string) => provider.validate(id));
}

export function useReconcileSidecar() {
  return useConfigurationMutation((input: { id: string; onProgress?: SidecarProgressCallback }) => provider.reconcile(input.id, input.onProgress));
}

export function useSetSidecarEnabled() {
  return useConfigurationMutation((input: { id: string; enabled: boolean; onProgress?: SidecarProgressCallback }) =>
    provider.setEnabled(input.id, input.enabled, input.onProgress),
  );
}

export function useUninstallSidecar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; onProgress?: SidecarProgressCallback }) => provider.uninstall(input.id, input.onProgress),
    onSuccess: (_, input) => {
      const id = input.id;
      queryClient.removeQueries({ queryKey: sidecarQueryKeys.configuration(id) });
      const current = queryClient.getQueryData<SidecarConfiguration[]>(sidecarQueryKeys.configurations);
      if (current) {
        queryClient.setQueryData(sidecarQueryKeys.configurations, current.filter((item) => item.id !== id));
      } else {
        void queryClient.invalidateQueries({ queryKey: sidecarQueryKeys.configurations });
      }
    },
  });
}
