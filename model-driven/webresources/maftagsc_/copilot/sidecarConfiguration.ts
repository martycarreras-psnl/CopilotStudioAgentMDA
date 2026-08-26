import { parseSupportedCopilotStudioConnectionUrl } from "../../../../shared/copilotStudioConnectionString";

export interface SidecarEntityBinding {
    logicalName: string;
    screenName: string;
    formIds: readonly string[];
}

export interface SidecarConfiguration {
    configurationId: string;
    appId: string;
    enabled: boolean;
    paneId: string;
    paneTitle: string;
    paneWidth: number;
    webResourceName: string;
    iconWebResource: string;
    clientId: string;
    tenantId: string;
    environmentId: string;
    agentSchemaName: string;
    agentConnectionString: string;
    scope: string;
    redirectPath: string;
    contextLabel: string;
    defaultScreenName: string;
    entityBindings: Readonly<Record<string, SidecarEntityBinding>>;
}

export interface SidecarConfigurationResolverRepository {
    listByAppId(appId: unknown): Promise<SidecarConfiguration[]>;
    getByConfigurationId(
        configurationId: unknown,
        appId: unknown,
        paneId: unknown
    ): Promise<SidecarConfiguration>;
}

export class SidecarConfigurationError extends Error {
    readonly errorCode: string;

    constructor(errorCode: string, message = errorCode) {
        super(message);
        this.name = "SidecarConfigurationError";
        this.errorCode = errorCode;
    }
}

const GUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const LOGICAL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const AGENT_SCHEMA_NAME_PATTERN = /^[a-z0-9_]+$/i;
export const MAX_ENABLED_SIDECARS_PER_APP = 10;

export function normalizeGuid(value: unknown): string | null {
    const normalized = String(value ?? "")
        .trim()
        .replace(/^\{([^{}]+)\}$/, "$1")
        .toLowerCase();
    return GUID_PATTERN.test(normalized) ? normalized : null;
}

export function deriveSidecarPaneId(configurationId: unknown): string | null {
    const normalized = normalizeGuid(configurationId);
    return normalized ? `maftagsc_sidecar_${normalized.replace(/-/g, "")}` : null;
}

export function filterSidecarConfigurations(
    configurations: readonly SidecarConfiguration[],
    appId: unknown
): SidecarConfiguration[] {
    const normalizedAppId = normalizeGuid(appId);
    if (!normalizedAppId) {
        throw new SidecarConfigurationError("sidecar_app_id_invalid");
    }

    const candidates = configurations.filter(configuration =>
        configuration.enabled && normalizeGuid(configuration.appId) === normalizedAppId
    );
    const valid = candidates.filter(configuration => {
        try {
            assertSidecarConfiguration(configuration);
            return true;
        } catch {
            return false;
        }
    });

    const configurationIdCounts = new Map<string, number>();
    const paneIdCounts = new Map<string, number>();
    for (const configuration of valid) {
        const configurationId = normalizeGuid(configuration.configurationId);
        if (!configurationId) continue;
        configurationIdCounts.set(
            configurationId,
            (configurationIdCounts.get(configurationId) ?? 0) + 1
        );
        paneIdCounts.set(
            configuration.paneId,
            (paneIdCounts.get(configuration.paneId) ?? 0) + 1
        );
    }

    const matches = valid
        .filter(configuration => {
            const configurationId = normalizeGuid(configuration.configurationId);
            return Boolean(
                configurationId &&
                configurationIdCounts.get(configurationId) === 1 &&
                paneIdCounts.get(configuration.paneId) === 1
            );
        })
        .sort((left, right) =>
            left.paneTitle.localeCompare(right.paneTitle, undefined, { sensitivity: "base" }) ||
            String(left.configurationId).localeCompare(String(right.configurationId))
        )
        .slice(0, MAX_ENABLED_SIDECARS_PER_APP);

    if (matches.length === 0) {
        throw new SidecarConfigurationError("sidecar_configuration_not_found");
    }
    return matches;
}

function resolveSidecarConfigurationFromCandidates(
    configurations: readonly SidecarConfiguration[],
    configurationId: unknown,
    appId: unknown,
    paneId: unknown
): SidecarConfiguration {
    const normalizedConfigurationId = normalizeGuid(configurationId);
    const normalizedAppId = normalizeGuid(appId);
    if (!normalizedConfigurationId) {
        throw new SidecarConfigurationError("sidecar_configuration_id_invalid");
    }
    if (!normalizedAppId) {
        throw new SidecarConfigurationError("sidecar_app_id_invalid");
    }

    const expectedPaneId = deriveSidecarPaneId(normalizedConfigurationId);
    if (paneId !== expectedPaneId) {
        throw new SidecarConfigurationError(
            "sidecar_pane_id_invalid",
            "The sidecar configuration does not match the expected configuration pane."
        );
    }

    const matches = filterSidecarConfigurations(configurations, normalizedAppId)
        .filter(configuration =>
            normalizeGuid(configuration.configurationId) === normalizedConfigurationId &&
            configuration.paneId === expectedPaneId
        );
    if (matches.length !== 1) {
        throw new SidecarConfigurationError("sidecar_configuration_not_found");
    }
    return matches[0];
}

export async function resolveSidecarConfigurations(
    appId: unknown,
    repository: SidecarConfigurationResolverRepository
): Promise<SidecarConfiguration[]> {
    return filterSidecarConfigurations(await repository.listByAppId(appId), appId);
}

export async function resolveSidecarConfiguration(
    configurationId: unknown,
    appId: unknown,
    paneId: unknown,
    repository: SidecarConfigurationResolverRepository
): Promise<SidecarConfiguration> {
    const normalizedConfigurationId = normalizeGuid(configurationId);
    const normalizedAppId = normalizeGuid(appId);
    if (!normalizedConfigurationId) {
        throw new SidecarConfigurationError("sidecar_configuration_id_invalid");
    }
    if (!normalizedAppId) {
        throw new SidecarConfigurationError("sidecar_app_id_invalid");
    }

    const expectedPaneId = deriveSidecarPaneId(normalizedConfigurationId);
    if (paneId !== expectedPaneId) {
        throw new SidecarConfigurationError(
            "sidecar_pane_id_invalid",
            "The sidecar configuration does not match the expected configuration pane."
        );
    }

    const candidate = await repository.getByConfigurationId(
        normalizedConfigurationId,
        normalizedAppId,
        expectedPaneId
    );
    if (normalizeGuid(candidate.appId) !== normalizedAppId) {
        throw new SidecarConfigurationError(
            "sidecar_configuration_app_mismatch",
            "The sidecar configuration does not match the active model-driven app."
        );
    }
    return resolveSidecarConfigurationFromCandidates(
        [candidate],
        normalizedConfigurationId,
        normalizedAppId,
        expectedPaneId
    );
}

export function resolveSidecarConfigurationFromConfigurations(
    configurations: readonly SidecarConfiguration[],
    configurationId: unknown,
    appId: unknown,
    paneId: unknown
): SidecarConfiguration {
    return resolveSidecarConfigurationFromCandidates(
        configurations,
        configurationId,
        appId,
        paneId
    );
}

export function assertSidecarConfiguration(configuration: SidecarConfiguration): void {
    const identifiers = [
        configuration.appId,
        configuration.clientId,
        configuration.tenantId,
        configuration.environmentId
    ];
    const textValues = [
        configuration.paneId,
        configuration.paneTitle,
        configuration.webResourceName,
        configuration.iconWebResource,
        configuration.scope,
        configuration.contextLabel,
        configuration.defaultScreenName
    ];
    const bindingEntries = Object.entries(configuration.entityBindings);
    const agentConnection = parseSupportedCopilotStudioConnectionUrl(
        configuration.agentConnectionString
    );

    if (
        !normalizeGuid(configuration.configurationId) ||
        configuration.paneId !== deriveSidecarPaneId(configuration.configurationId) ||
        identifiers.some(identifier => !normalizeGuid(identifier)) ||
        textValues.some(value => typeof value !== "string" || !value.trim()) ||
        !Number.isInteger(configuration.paneWidth) ||
        configuration.paneWidth < 300 ||
        configuration.paneWidth > 1000 ||
        !configuration.webResourceName.endsWith(".html") ||
        !AGENT_SCHEMA_NAME_PATTERN.test(configuration.agentSchemaName) ||
        !agentConnection ||
        agentConnection.schemaName !== configuration.agentSchemaName ||
        !configuration.redirectPath.startsWith("/WebResources/") ||
        bindingEntries.length === 0 ||
        bindingEntries.some(([key, binding]) =>
            !LOGICAL_NAME_PATTERN.test(key) ||
            binding.logicalName !== key ||
            !binding.screenName.trim() ||
            (
                binding.formIds.length === 0 ||
                binding.formIds.some(formId => !normalizeGuid(formId))
            )
        )
    ) {
        throw new SidecarConfigurationError("sidecar_configuration_invalid");
    }
}

export function isFormBound(
    configuration: SidecarConfiguration,
    entityName: unknown,
    formId: unknown
): boolean {
    const binding = getEntityBinding(configuration, entityName);
    if (!binding) return false;
    const normalizedFormId = normalizeGuid(formId);
    return Boolean(
        normalizedFormId &&
        binding.formIds.some(candidate => normalizeGuid(candidate) === normalizedFormId)
    );
}

export function getEntityBinding(
    configuration: SidecarConfiguration,
    entityName: unknown
): SidecarEntityBinding | null {
    const logicalName = String(entityName ?? "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(configuration.entityBindings, logicalName)
        ? configuration.entityBindings[logicalName] ?? null
        : null;
}
