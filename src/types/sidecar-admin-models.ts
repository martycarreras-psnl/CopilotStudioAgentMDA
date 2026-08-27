export type SidecarLifecycleState = 'draft' | 'deployed' | 'disabled' | 'drift';
export type SidecarHealthState = 'healthy' | 'warning' | 'critical' | 'notValidated';
export type SidecarSurface = 'forms' | 'lists';
export type SidecarIconSource = 'default' | 'agent' | 'uploaded';
export type SidecarIconMimeType = 'image/png' | 'image/jpeg';

export interface SidecarIconContent {
  base64: string;
  mimeType: SidecarIconMimeType;
  width: number;
  height: number;
  contentHash: string;
}

export interface SidecarIconSelection {
  source: SidecarIconSource;
  content?: SidecarIconContent;
}

export interface TargetForm {
  formId: string;
  name: string;
  enabled: boolean;
}

export interface TargetTable {
  logicalName: string;
  displayName: string;
  enabled: boolean;
  formCount: number;
  forms: TargetForm[];
}

export interface TargetModelDrivenApp {
  id: string;
  appId: string;
  uniqueName: string;
  displayName: string;
  description: string;
  tables: TargetTable[];
}

export interface SidecarDriftItem {
  id: string;
  kind: 'addition' | 'removal' | 'conflict';
  title: string;
  detail: string;
}

export interface SidecarHealthCheck {
  id: string;
  label: string;
  state: 'pass' | 'warning' | 'fail';
  detail: string;
}

export interface SidecarConfiguration {
  id: string;
  name: string;
  appId: string;
  appUniqueName: string;
  appDisplayName: string;
  paneTitle: string;
  paneWidth: number;
  agentDisplayName: string;
  agentSchemaName: string;
  agentConnectionString: string;
  tenantId: string;
  publicClientApplicationId: string;
  environmentId: string;
  bindingSolutionUniqueName: string;
  iconSource: SidecarIconSource;
  iconWebResourceName?: string;
  iconContentHash?: string;
  iconMimeType?: string;
  lifecycleState: SidecarLifecycleState;
  healthState: SidecarHealthState;
  enabledSurfaces: SidecarSurface[];
  autoEnableNewTables: boolean;
  tables: TargetTable[];
  driftItems: SidecarDriftItem[];
  healthChecks: SidecarHealthCheck[];
  lastValidatedAt?: string;
  lastOperationSummary?: string;
}

export interface AgentResolution {
  displayName: string;
  schemaName: string;
  environmentId: string;
  published: boolean;
  icon?: SidecarIconContent;
}

export interface AdminAccessContext {
  displayName: string;
  isSystemAdministrator: boolean;
}

export interface DeploymentImpact {
  title: string;
  detail: string;
  intent: 'info' | 'change' | 'safety';
}

export type SidecarOperationPhase = 'icon' | 'forms' | 'publish' | 'readback' | 'finalize' | 'cleanup' | 'rollback';

export interface SidecarProgress {
  phase: SidecarOperationPhase;
  current: number;
  total: number;
  label: string;
}

export type SidecarProgressCallback = (progress: SidecarProgress) => void;

export interface SidecarDraft {
  name: string;
  targetApp: TargetModelDrivenApp;
  tables: TargetTable[];
  agent: AgentResolution;
  agentConnectionString: string;
  tenantId: string;
  publicClientApplicationId: string;
  paneTitle: string;
  paneWidth: number;
  bindingSolutionUniqueName: string;
  icon: SidecarIconSelection;
}
