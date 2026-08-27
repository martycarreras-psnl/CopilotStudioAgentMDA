import { describe, expect, it, vi } from "vitest";
import {
    deriveSidecarPaneId,
    getEntityBinding,
    isFormBound,
    normalizeGuid,
    resolveSidecarConfiguration,
    resolveSidecarConfigurations,
    SidecarConfigurationError,
    type SidecarConfiguration
} from "../../model-driven/webresources/maftagsc_/copilot/sidecarConfiguration";
import {
    BootstrapSidecarConfigurationRepository,
    DEFAULT_SIDECAR_ICON,
    DataverseSidecarConfigurationRepository,
    FallbackSidecarConfigurationRepository,
    resolveSidecarIconWebResource,
    type SidecarConfigurationRepository
} from "../../model-driven/webresources/maftagsc_/copilot/sidecarConfigurationRepository";

const APP_ID = "62e8fdf6-e77b-f111-ab0e-000d3a34048c";
const CONFIGURATION_ID = "79e1c0da-db9f-f111-aaad-0022480b10ac";
const SECOND_CONFIGURATION_ID = "12345678-1234-1234-1234-123456789abc";
const FORM_ID = "11111111-2222-3333-4444-555555555555";
const STANDARD_CONNECTION_STRING =
    "https://f9b87f8b0abfe629affbb13195d1ed.14.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/cr0b1_HRMgmtClassic/conversations?api-version=2022-03-01-preview";
const GITHUB_CONNECTION_STRING =
    "https://7d8dcd872e21e805b9be678794ecc8.0b.environment.api.powerplatform.com/copilotstudio/agenticruntime/3p/dataverse-backed/authenticated/bots/cr88d_insightsandactions_AChDbK?api-version=1";

function paneId(configurationId: string): string {
    const derived = deriveSidecarPaneId(configurationId);
    if (!derived) {
        throw new Error("The test configuration ID must be a GUID.");
    }
    return derived;
}

function createConfiguration(
    overrides: Partial<SidecarConfiguration> = {}
): SidecarConfiguration {
    return {
        configurationId: CONFIGURATION_ID,
        appId: APP_ID,
        enabled: true,
        paneId: paneId(CONFIGURATION_ID),
        paneTitle: "HR Management App Guide",
        paneWidth: 420,
        webResourceName: "maftagsc_/copilot/agentSidePane.html",
        iconWebResource: "WebResources/maftagsc_/copilot/agentGuideLibrary.svg",
        clientId: "9d03cd77-5246-4c9c-8e9d-262bff547a25",
        tenantId: "d92190b9-98e7-46da-8b11-580e06c7d15d",
        environmentId: "f9b87f8b-0abf-e629-affb-b13195d1ed14",
        agentSchemaName: "cr0b1_HRMgmtClassic",
        agentConnectionString: STANDARD_CONNECTION_STRING,
        scope: "https://api.powerplatform.com/CopilotStudio.Copilots.Invoke",
        redirectPath: "/WebResources/maftagsc_/copilot/authRedirect.html",
        contextLabel: "HR Management app",
        defaultScreenName: "HR Management record form",
        entityBindings: {
            maftagsc_benefitplan: {
                logicalName: "maftagsc_benefitplan",
                screenName: "Benefit Plan record form",
                formIds: [FORM_ID]
            }
        },
        ...overrides
    };
}

function repository(
    records: readonly SidecarConfiguration[],
    exactRecord: SidecarConfiguration | undefined = records[0]
): SidecarConfigurationRepository {
    return {
        async listByAppId() {
            return [...records];
        },
        async getByConfigurationId() {
            if (!exactRecord) {
                throw new SidecarConfigurationError("sidecar_configuration_not_found");
            }
            return exactRecord;
        }
    };
}

describe("sidecar configuration resolution", () => {
    it("normalizes braced and mixed-case identifiers", () => {
        expect(normalizeGuid(`{${APP_ID.toUpperCase()}}`)).toBe(APP_ID);
    });

    it("resolves the exact enabled configuration by configuration, app, and pane identity", async () => {
        const candidate = createConfiguration();
        await expect(resolveSidecarConfiguration(
            CONFIGURATION_ID,
            APP_ID,
            candidate.paneId,
            repository([candidate])
        )).resolves.toBe(candidate);
    });

    it("rejects an app or pane mismatch for an exact configuration", async () => {
        const candidate = createConfiguration();
        await expect(resolveSidecarConfiguration(
            CONFIGURATION_ID,
            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            candidate.paneId,
            repository([candidate])
        )).rejects.toThrow("does not match the active model-driven app");

        await expect(resolveSidecarConfiguration(
            CONFIGURATION_ID,
            APP_ID,
            "different-pane",
            repository([candidate])
        )).rejects.toThrow("does not match the expected configuration pane");
    });

    it("exposes collection and exact lookup through the repository contract", async () => {
        const first = createConfiguration();
        const second = createConfiguration({
            configurationId: SECOND_CONFIGURATION_ID,
            paneId: paneId(SECOND_CONFIGURATION_ID),
            paneTitle: "Second Guide"
        });
        const bootstrap = new BootstrapSidecarConfigurationRepository([first, second]);

        await expect(bootstrap.listByAppId(APP_ID)).resolves.toEqual([first, second]);
        await expect(bootstrap.getByConfigurationId(
            SECOND_CONFIGURATION_ID,
            APP_ID,
            paneId(SECOND_CONFIGURATION_ID)
        ))
            .resolves.toBe(second);
    });

    it("orders multiple same-app sidecars by title and configuration identity", async () => {
        const first = createConfiguration({ paneTitle: "Zulu" });
        const second = createConfiguration({
            configurationId: SECOND_CONFIGURATION_ID,
            paneId: paneId(SECOND_CONFIGURATION_ID),
            paneTitle: "Alpha",
            agentSchemaName: "cr88d_insightsandactions_AChDbK",
            agentConnectionString: GITHUB_CONNECTION_STRING
        });

        await expect(resolveSidecarConfigurations(APP_ID, repository([first, second])))
            .resolves.toEqual([second, first]);
    });

    it("isolates malformed records without suppressing independent valid sidecars", async () => {
        const valid = createConfiguration();
        const malformed = createConfiguration({
            configurationId: SECOND_CONFIGURATION_ID,
            paneId: paneId(SECOND_CONFIGURATION_ID),
            clientId: "not-a-guid"
        });

        await expect(resolveSidecarConfigurations(APP_ID, repository([malformed, valid])))
            .resolves.toEqual([valid]);
    });

    it("quarantines every record in a duplicate identity collision", async () => {
        await expect(resolveSidecarConfigurations(
            APP_ID,
            repository([
                createConfiguration({ paneTitle: "First" }),
                createConfiguration({ paneTitle: "Second" })
            ])
        )).rejects.toThrowError(expect.objectContaining<Partial<SidecarConfigurationError>>({
            errorCode: "sidecar_configuration_not_found"
        }));
    });

    it("does not fall back to bootstrap data when Dataverse rejects configured records", async () => {
        const fallback = repository([createConfiguration()]);
        const primary: SidecarConfigurationRepository = {
            async listByAppId() {
                throw new SidecarConfigurationError("sidecar_configuration_not_found");
            },
            async getByConfigurationId() {
                throw new SidecarConfigurationError("sidecar_configuration_not_found");
            }
        };
        const chained = new FallbackSidecarConfigurationRepository(primary, fallback);

        await expect(chained.listByAppId(APP_ID)).rejects.toThrow(
            "sidecar_configuration_not_found"
        );
    });

    it("caps runtime initialization at ten enabled sidecars", async () => {
        const records = Array.from({ length: 11 }, (_, index) => {
            const configurationId =
                `aaaaaaaa-bbbb-cccc-dddd-${(index + 1).toString(16).padStart(12, "0")}`;
            return createConfiguration({
                configurationId,
                paneId: paneId(configurationId),
                paneTitle: `Sidecar ${String(index + 1).padStart(2, "0")}`
            });
        });

        await expect(resolveSidecarConfigurations(APP_ID, repository(records)))
            .resolves.toHaveLength(10);
    });

    it("loads direct connection URLs and exact form bindings from Dataverse", async () => {
        const retrieveMultipleRecords = vi.fn()
            .mockResolvedValueOnce({
                entities: [{
                    maftagsc_sidecarconfigurationid: CONFIGURATION_ID,
                    maftagsc_appid: APP_ID,
                    maftagsc_panetitle: "Sales Hub Assistant",
                    maftagsc_panewidth: 420,
                    maftagsc_publicclientapplicationid: "9d03cd77-5246-4c9c-8e9d-262bff547a25",
                    maftagsc_tenantid: "d92190b9-98e7-46da-8b11-580e06c7d15d",
                    maftagsc_environmentid: "f9b87f8b-0abf-e629-affb-b13195d1ed14",
                    maftagsc_agentschemaname: "cr88d_insightsandactions_AChDbK",
                    maftagsc_agentconnectionstring: GITHUB_CONNECTION_STRING,
                    maftagsc_iconwebresourcename:
                       "maftagsc_/sidecars/79e1c0dadb9ff111aaad0022480b10ac/icon_0123456789abcdef.png"
                }]
            })
            .mockResolvedValueOnce({
                entities: [{
                    maftagsc_tablelogicalname: "contact",
                    maftagsc_tabledisplayname: "Contact",
                    maftagsc_formid: FORM_ID,
                    maftagsc_enabled: true
                }]
            });
        const dataverse = new DataverseSidecarConfigurationRepository(
            () => ({ retrieveMultipleRecords })
        );

        const [candidate] = await dataverse.listByAppId(APP_ID);
        expect(candidate).toMatchObject({
            configurationId: CONFIGURATION_ID,
            paneId: paneId(CONFIGURATION_ID),
            agentSchemaName: "cr88d_insightsandactions_AChDbK",
            agentConnectionString: GITHUB_CONNECTION_STRING,
            iconWebResource:
               "WebResources/maftagsc_/sidecars/79e1c0dadb9ff111aaad0022480b10ac/icon_0123456789abcdef.png"
        });
        expect(candidate?.entityBindings.contact?.formIds).toEqual([FORM_ID]);
        expect(retrieveMultipleRecords.mock.calls[0]?.[1])
            .toContain("maftagsc_agentconnectionstring");
    });

    it("rejects malformed or cross-configuration icon pointers", () => {
       expect(resolveSidecarIconWebResource(
           "maftagsc_/sidecars/12345678123412341234123456789abc/icon_0123456789abcdef.png",
           CONFIGURATION_ID
       )).toBe(DEFAULT_SIDECAR_ICON);
       expect(resolveSidecarIconWebResource(
           "https://example.test/icon.png",
           CONFIGURATION_ID
       )).toBe(DEFAULT_SIDECAR_ICON);
       expect(resolveSidecarIconWebResource(undefined, CONFIGURATION_ID))
           .toBe(DEFAULT_SIDECAR_ICON);
    });

    it("matches entity names case-insensitively and forms exactly", () => {
        const candidate = createConfiguration();
        expect(getEntityBinding(candidate, "MAFTAGSC_BENEFITPLAN")).toMatchObject({
            logicalName: "maftagsc_benefitplan"
        });
        expect(isFormBound(candidate, "MAFTAGSC_BENEFITPLAN", `{${FORM_ID}}`)).toBe(true);
        expect(isFormBound(
            candidate,
            "maftagsc_benefitplan",
            "99999999-8888-7777-6666-555555555555"
        )).toBe(false);
        expect(getEntityBinding(candidate, "toString")).toBeNull();
    });
});
