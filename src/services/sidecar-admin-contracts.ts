import type {
  AdminAccessContext,
  AgentResolution,
  DeploymentImpact,
  PublishedAgent,
  SidecarConfiguration,
  SidecarDraft,
  SidecarEditModel,
  SidecarMutableUpdate,
  SidecarProgressCallback,
  TargetModelDrivenApp,
} from '@/types/sidecar-admin-models';

export interface SidecarAdministrationProvider {
  getAccessContext(): Promise<AdminAccessContext>;
  listConfigurations(): Promise<SidecarConfiguration[]>;
  getConfiguration(id: string): Promise<SidecarConfiguration | null>;
  discoverTargetApps(): Promise<TargetModelDrivenApp[]>;
  resolveManualTargetApp(appId: string): Promise<TargetModelDrivenApp>;
  listPublishedAgents(): Promise<PublishedAgent[]>;
  resolveAgentLink(connectionString: string, environmentId: string): Promise<AgentResolution>;
  previewDeployment(draft: SidecarDraft): Promise<DeploymentImpact[]>;
  deploy(draft: SidecarDraft, onProgress?: SidecarProgressCallback): Promise<SidecarConfiguration>;
  getEditModel(id: string): Promise<SidecarEditModel>;
  updateMutableConfiguration(id: string, update: SidecarMutableUpdate, onProgress?: SidecarProgressCallback): Promise<SidecarConfiguration>;
  validate(id: string): Promise<SidecarConfiguration>;
  reconcile(id: string, onProgress?: SidecarProgressCallback): Promise<SidecarConfiguration>;
  setEnabled(id: string, enabled: boolean, onProgress?: SidecarProgressCallback): Promise<SidecarConfiguration>;
  uninstall(id: string, onProgress?: SidecarProgressCallback): Promise<void>;
}
