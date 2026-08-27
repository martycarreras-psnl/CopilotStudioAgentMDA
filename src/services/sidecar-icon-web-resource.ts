import { getClient } from '@microsoft/power-apps/data';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import type { Webresourceset } from '@/generated/models/WebresourcesetModel';
import type { IGetAllOptions } from '@/generated/models/CommonModels';

export interface SidecarIconWebResourceCreate {
  name: string;
  displayname: string;
  description: string;
  content: string;
  webresourcetype: 5 | 6;
}

const client = getClient(dataSourcesInfo);
const dataSourceName = 'webresourceset';

export function createSidecarIconWebResource(
  record: SidecarIconWebResourceCreate,
): Promise<IOperationResult<Webresourceset>> {
  return client.createRecordAsync<SidecarIconWebResourceCreate, Webresourceset>(
    dataSourceName,
    record,
  );
}

export function listSidecarIconWebResources(
  options: IGetAllOptions,
): Promise<IOperationResult<Webresourceset[]>> {
  return client.retrieveMultipleRecordsAsync<Webresourceset>(dataSourceName, options);
}

export function deleteSidecarIconWebResource(id: string): Promise<void> {
  return client.deleteRecordAsync(dataSourceName, id).then(() => undefined);
}
