import { DataverseSidecarConfigurationRepository } from "./sidecarConfigurationRepository";

export const sidecarConfigurationRepository = new DataverseSidecarConfigurationRepository(() => {
    const host = globalThis as typeof globalThis & {
        Xrm?: { WebApi?: { retrieveMultipleRecords: (...args: [string, string, number?]) => Promise<{ entities: Record<string, unknown>[] }> } };
        parent?: { Xrm?: { WebApi?: { retrieveMultipleRecords: (...args: [string, string, number?]) => Promise<{ entities: Record<string, unknown>[] }> } } };
    };
    const webApi = host.Xrm?.WebApi ?? host.parent?.Xrm?.WebApi;
    if (!webApi) throw new Error("sidecar_dataverse_webapi_unavailable");
    return webApi;
});
