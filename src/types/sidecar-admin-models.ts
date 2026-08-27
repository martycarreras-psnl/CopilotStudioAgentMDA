export type SidecarLifecycleState = 'draft' | 'deployed' | 'disabled' | 'drift';
export type SidecarHealthState = 'healthy' | 'warning' | 'critical' | 'notValidated';
export type SidecarSurface = 'forms' | 'lists';
export type SidecarIconSource = 'default' | 'agent' | 'uploaded';
export type SidecarIconMimeType = 'image/png' | 'image/jpeg';
export type CopilotStudioHarness = 'standard' | 'github';

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
  available?: boolean;
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
  iconContent?: SidecarIconContent;
  iconDisplayIssue?: string;
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

export interface PublishedAgent extends AgentResolution {
  botId: string;
  harness: CopilotStudioHarness;
  connectionString: string;
  publishedOn: string;
}

export interface AdminAccessContext {
  displayName: string;
  isSystemAdministrator: boolean;
  tenantId?: string;
  dataverseOrgUrl?: string;
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
  agent: PublishedAgent;
  agentConnectionString: string;
  tenantId: string;
  publicClientApplicationId: string;
  paneTitle: string;
  paneWidth: number;
  bindingSolutionUniqueName: string;
  icon: SidecarIconSelection;
}

export interface SidecarEditModel {
  tables: TargetTable[];
  agentIcon?: SidecarIconContent;
  editVersion: string;
}

export interface SidecarMutableUpdate {
  tables: TargetTable[];
  icon?: SidecarIconSelection;
  expectedEditVersion: string;
}
