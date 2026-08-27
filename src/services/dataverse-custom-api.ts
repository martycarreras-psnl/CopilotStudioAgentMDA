import { AddSolutionComponentService } from '@/generated/services/AddSolutionComponentService';
import { PublishXmlService } from '@/generated/services/PublishXmlService';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error ?? 'Unknown Dataverse error');
}

export function assertSidecarActionsAvailable(): void {
  const missing = [
    dataSourcesInfo.publishxml.apis.PublishXml ? undefined : 'PublishXml',
    dataSourcesInfo.addsolutioncomponent.apis.AddSolutionComponent
      ? undefined
      : 'AddSolutionComponent',
  ].filter((operationName): operationName is string => Boolean(operationName));
  if (missing.length) {
    throw new Error(
      `Connected deployment is blocked because the Code App data source does not register ${missing.join(' and ')}. No live form changes were applied.`,
    );
  }
}

export async function publishTables(tableLogicalNames: string[]): Promise<void> {
  const entities = [...new Set(tableLogicalNames)]
    .map((name) => `<entity>${name}</entity>`)
    .join('');
  const result = await PublishXmlService.PublishXml(
    `<importexportxml><entities>${entities}</entities></importexportxml>`,
  );
  if (result.error) {
    throw new Error(`PublishXml failed: ${errorMessage(result.error)}`);
  }
}

export async function publishWebResources(webResourceIds: string[]): Promise<void> {
  const webResources = [...new Set(webResourceIds)]
    .map((id) => `<webresource>{${id.replace(/[{}]/g, '')}}</webresource>`)
    .join('');
  const result = await PublishXmlService.PublishXml(
    `<importexportxml><webresources>${webResources}</webresources></importexportxml>`,
  );
  if (result.error) {
    throw new Error(`PublishXml failed: ${errorMessage(result.error)}`);
  }
}

export async function addSolutionComponent(
  solutionUniqueName: string,
  componentId: string,
  componentType: number,
): Promise<void> {
  const result = await AddSolutionComponentService.AddSolutionComponent(
    componentId,
    componentType,
    solutionUniqueName,
    true,
    false,
  );
  if (result.error) {
    throw new Error(`AddSolutionComponent failed: ${errorMessage(result.error)}`);
  }
}
