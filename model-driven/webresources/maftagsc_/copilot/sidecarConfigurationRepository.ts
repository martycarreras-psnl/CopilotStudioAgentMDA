import {
    filterSidecarConfigurations,
    normalizeGuid,
    resolveSidecarConfigurationFromConfigurations,
    type SidecarConfiguration,
    type SidecarEntityBinding
} from "./sidecarConfiguration";

export interface SidecarConfigurationRepository {
    listByAppId(appId: unknown): Promise<SidecarConfiguration[]>;
    getByConfigurationId(
        configurationId: unknown,
        appId: unknown,
        paneId: unknown
    ): Promise<SidecarConfiguration>;
}

export class BootstrapSidecarConfigurationRepository
implements SidecarConfigurationRepository {
    constructor(private readonly configurations: readonly SidecarConfiguration[]) {}

    async listByAppId(appId: unknown): Promise<SidecarConfiguration[]> {
        return filterSidecarConfigurations(this.configurations, appId);
    }

    async getByConfigurationId(
        configurationId: unknown,
        appId: unknown,
        paneId: unknown
    ): Promise<SidecarConfiguration> {
        return resolveSidecarConfigurationFromConfigurations(
            this.configurations,
            configurationId,
            appId,
            paneId
        );
    }
}

interface DataverseResult {
    entities: Record<string, unknown>[];
}

interface DataverseWebApi {
    retrieveMultipleRecords(
        entityLogicalName: string,
        options: string,
        maxPageSize?: number
    ): Promise<DataverseResult>;
}

export const DEFAULT_SIDECAR_ICON =
    "WebResources/maftagsc_/copilot/agentGuideLibrary.svg";

export function resolveSidecarIconWebResource(
    value: unknown,
    configurationId: string
): string {
    const name = String(value ?? "").trim();
    const configurationKey = configurationId.replace(/-/g, "");
    const expectedPrefix = `maftagsc_/sidecars/${configurationKey}/`;
    if (
        name.startsWith(expectedPrefix)
        && /^icon_[0-9a-f]{16}\.(?:png|jpg)$/i.test(name.slice(expectedPrefix.length))
    ) {
        return `WebResources/${name}`;
    }
    return DEFAULT_SIDECAR_ICON;
}

export class DataverseSidecarConfigurationRepository
implements SidecarConfigurationRepository {
    constructor(private readonly getWebApi: () => DataverseWebApi) {}

    async listByAppId(appId: unknown): Promise<SidecarConfiguration[]> {
        const normalizedAppId = normalizeGuid(appId);
        if (!normalizedAppId) {
            return filterSidecarConfigurations([], appId);
        }

        const escapedAppId = normalizedAppId.replace(/'/g, "''");
        const configurationResult = await this.getWebApi().retrieveMultipleRecords(
            "maftagsc_sidecarconfiguration",
            `?$select=maftagsc_sidecarconfigurationid,maftagsc_appid,maftagsc_panetitle,maftagsc_panewidth,maftagsc_publicclientapplicationid,maftagsc_tenantid,maftagsc_environmentid,maftagsc_agentschemaname,maftagsc_agentconnectionstring,maftagsc_iconwebresourcename,statecode,statuscode&$filter=maftagsc_appid eq '${escapedAppId}' and statecode eq 0`,
            50
        );
        const configurations: Array<SidecarConfiguration | null> = await Promise.all(
            configurationResult.entities.map(async record => {
            const configurationId = normalizeGuid(record.maftagsc_sidecarconfigurationid);
            if (!configurationId) return null;
            try {
                const bindingResult = await this.getWebApi().retrieveMultipleRecords(
                    "maftagsc_targetbinding",
                    `?$select=maftagsc_tablelogicalname,maftagsc_tabledisplayname,maftagsc_formid,maftagsc_enabled&$filter=_maftagsc_sidecarconfiguration_value eq ${configurationId} and statecode eq 0 and maftagsc_enabled eq true`,
                    500
                );
                const entityBindings: Record<string, SidecarEntityBinding> = {};
                for (const binding of bindingResult.entities) {
                    const logicalName = String(binding.maftagsc_tablelogicalname ?? "").trim().toLowerCase();
                    const formId = normalizeGuid(binding.maftagsc_formid);
                    if (!logicalName || !formId) continue;
                    const existing = entityBindings[logicalName];
                    entityBindings[logicalName] = {
                        logicalName,
                        screenName: existing?.screenName ??
                            `${String(binding.maftagsc_tabledisplayname ?? logicalName)} record form`,
                        formIds: [...(existing?.formIds ?? []), formId]
                    };
                }
                return {
                    configurationId,
                    appId: normalizedAppId,
                    enabled: true,
                    paneId: `maftagsc_sidecar_${configurationId.replace(/-/g, "")}`,
                    paneTitle: String(record.maftagsc_panetitle ?? "Agent Sidecar"),
                    paneWidth: Number(record.maftagsc_panewidth ?? 420),
                    webResourceName: "maftagsc_/copilot/agentSidePane.html",
                    iconWebResource: resolveSidecarIconWebResource(
                        record.maftagsc_iconwebresourcename,
                        configurationId
                    ),
                    clientId: String(record.maftagsc_publicclientapplicationid ?? ""),
                    tenantId: String(record.maftagsc_tenantid ?? ""),
                    environmentId: String(record.maftagsc_environmentid ?? ""),
                    agentSchemaName: String(record.maftagsc_agentschemaname ?? ""),
                    agentConnectionString: String(record.maftagsc_agentconnectionstring ?? ""),
                    scope: "https://api.powerplatform.com/CopilotStudio.Copilots.Invoke",
                    redirectPath: "/WebResources/maftagsc_/copilot/authRedirect.html",
                    contextLabel: `${String(record.maftagsc_panetitle ?? "Agent Sidecar")} app`,
                    defaultScreenName: "Model-driven App record form",
                    entityBindings
                } satisfies SidecarConfiguration;
            } catch {
                return null;
            }
            })
        );
        return filterSidecarConfigurations(
            configurations.filter((value): value is SidecarConfiguration => value !== null),
            appId
        );
    }

    async getByConfigurationId(
        configurationId: unknown,
        appId: unknown,
        paneId: unknown
    ): Promise<SidecarConfiguration> {
        return resolveSidecarConfigurationFromConfigurations(
            await this.listByAppId(appId),
            configurationId,
            appId,
            paneId
        );
    }
}

export class FallbackSidecarConfigurationRepository
implements SidecarConfigurationRepository {
    constructor(
        private readonly primary: SidecarConfigurationRepository,
        private readonly fallback: SidecarConfigurationRepository
    ) {}

    async listByAppId(appId: unknown): Promise<SidecarConfiguration[]> {
        try {
            return await this.primary.listByAppId(appId);
        } catch (error) {
            const code = error && typeof error === "object" && "errorCode" in error
                ? String(error.errorCode)
                : error instanceof Error ? error.message : "";
            if (code !== "sidecar_dataverse_webapi_unavailable") {
                throw error;
            }
            return this.fallback.listByAppId(appId);
        }
    }

    async getByConfigurationId(
        configurationId: unknown,
        appId: unknown,
        paneId: unknown
    ): Promise<SidecarConfiguration> {
        const configurations = await this.listByAppId(appId);
        return resolveSidecarConfigurationFromConfigurations(
            configurations,
            configurationId,
            appId,
            paneId
        );
    }
}
