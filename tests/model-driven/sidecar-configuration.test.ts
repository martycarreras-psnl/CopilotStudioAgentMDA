import { describe, expect, it, vi } from "vitest";
import {
    getEntityBinding,
    normalizeGuid,
    resolveSidecarConfiguration,
    SidecarConfigurationError,
    type SidecarConfiguration
} from "../../model-driven/webresources/maftagsc_/copilot/sidecarConfiguration";
import {
    BootstrapSidecarConfigurationRepository,
    DataverseSidecarConfigurationRepository
} from "../../model-driven/webresources/maftagsc_/copilot/sidecarConfigurationRepository";

const APP_ID = "62e8fdf6-e77b-f111-ab0e-000d3a34048c";
const SECOND_APP_ID = "11111111-2222-3333-4444-555555555555";
const CONFIGURATION_ID = "79e1c0da-db9f-f111-aaad-0022480b10ac";
const STANDARD_CONNECTION_STRING =
    "https://f9b87f8b0abfe629affbb13195d1ed.14.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/cr0b1_HRMgmtClassic/conversations?api-version=2022-03-01-preview";
const GITHUB_CONNECTION_STRING =
    "https://7d8dcd872e21e805b9be678794ecc8.0b.environment.api.powerplatform.com/copilotstudio/agenticruntime/3p/dataverse-backed/authenticated/bots/cr88d_insightsandactions_AChDbK?api-version=1";

function createConfiguration(
    overrides: Partial<SidecarConfiguration> = {}
): SidecarConfiguration {
    return {
        configurationId: CONFIGURATION_ID,
        appId: APP_ID,
        enabled: true,
        paneId: "maftagsc_hr_management_app_guide",
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
                screenName: "Benefit Plan record form"
            }
        },
        ...overrides
    };
}

describe("sidecar configuration resolution", () => {
    it("normalizes braced and mixed-case app identifiers", () => {
        expect(normalizeGuid(`{${APP_ID.toUpperCase()}}`)).toBe(APP_ID);
    });

    it("resolves exactly one enabled configuration by Model-driven App ID", () => {
        const configuration = createConfiguration();

        expect(resolveSidecarConfiguration([configuration], APP_ID)).toBe(configuration);
    });

    it("exposes app-keyed resolution through the asynchronous repository contract", async () => {
        const configuration = createConfiguration();
        const repository = new BootstrapSidecarConfigurationRepository([configuration]);

        await expect(repository.getByAppId(APP_ID)).resolves.toBe(configuration);
    });

    it("keeps independent agents and pane identities for multiple apps", async () => {
        const hrConfiguration = createConfiguration();
        const secondConfiguration = createConfiguration({
            appId: SECOND_APP_ID,
            paneId: "contoso_service_guide",
            paneTitle: "Service Guide",
            agentSchemaName: "cr88d_insightsandactions_AChDbK",
            agentConnectionString: GITHUB_CONNECTION_STRING,
            entityBindings: {
                incident: {
                    logicalName: "incident",
                    screenName: "Case record form"
                }
            }
        });
        const repository = new BootstrapSidecarConfigurationRepository([
            hrConfiguration,
            secondConfiguration
        ]);

        await expect(repository.getByAppId(APP_ID)).resolves.toMatchObject({
            paneId: "maftagsc_hr_management_app_guide",
            agentSchemaName: "cr0b1_HRMgmtClassic"
        });
        await expect(repository.getByAppId(SECOND_APP_ID)).resolves.toMatchObject({
            paneId: "contoso_service_guide",
            agentSchemaName: "cr88d_insightsandactions_AChDbK",
            agentConnectionString: GITHUB_CONNECTION_STRING
        });
    });

    it("loads the stored direct connection URL from Dataverse", async () => {
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
                    maftagsc_agentconnectionstring: GITHUB_CONNECTION_STRING
                }]
            })
            .mockResolvedValueOnce({
                entities: [{
                    maftagsc_tablelogicalname: "contact",
                    maftagsc_tabledisplayname: "Contact",
                    maftagsc_enabled: true
                }]
            });
        const repository = new DataverseSidecarConfigurationRepository(
            () => ({ retrieveMultipleRecords })
        );

        await expect(repository.getByAppId(APP_ID)).resolves.toMatchObject({
            configurationId: CONFIGURATION_ID,
            agentSchemaName: "cr88d_insightsandactions_AChDbK",
            agentConnectionString: GITHUB_CONNECTION_STRING
        });
        expect(retrieveMultipleRecords.mock.calls[0]?.[1])
            .toContain("maftagsc_agentconnectionstring");
    });

    it("fails closed when the app identifier is absent or invalid", () => {
        expect(() => resolveSidecarConfiguration([createConfiguration()], null))
            .toThrowError(expect.objectContaining<Partial<SidecarConfigurationError>>({
                errorCode: "sidecar_app_id_invalid"
            }));
    });

    it("fails closed when no enabled configuration matches", () => {
        expect(() => resolveSidecarConfiguration([
            createConfiguration({ enabled: false })
        ], APP_ID)).toThrowError(expect.objectContaining<Partial<SidecarConfigurationError>>({
            errorCode: "sidecar_configuration_not_found"
        }));
    });

    it("fails closed when duplicate enabled configurations claim the app", () => {
        expect(() => resolveSidecarConfiguration([
            createConfiguration(),
            createConfiguration()
        ], APP_ID)).toThrowError(expect.objectContaining<Partial<SidecarConfigurationError>>({
            errorCode: "sidecar_configuration_ambiguous"
        }));
    });

    it("fails closed when a matching configuration is malformed", () => {
        expect(() => resolveSidecarConfiguration([
            createConfiguration({ clientId: "not-a-guid" })
        ], APP_ID)).toThrowError(expect.objectContaining<Partial<SidecarConfigurationError>>({
            errorCode: "sidecar_configuration_invalid"
        }));
    });

    it("rejects unsafe pane dimensions", () => {
        expect(() => resolveSidecarConfiguration([
            createConfiguration({ paneWidth: 200 })
        ], APP_ID)).toThrowError(expect.objectContaining<Partial<SidecarConfigurationError>>({
            errorCode: "sidecar_configuration_invalid"
        }));
    });

    it("accepts a GitHub Copilot harness direct connection URL", () => {
        expect(resolveSidecarConfiguration([
            createConfiguration({
                agentSchemaName: "cr88d_insightsandactions_AChDbK",
                agentConnectionString: GITHUB_CONNECTION_STRING
            })
        ], APP_ID).agentConnectionString).toBe(GITHUB_CONNECTION_STRING);
    });

    it("rejects an unsupported or non-HTTPS direct connection URL", () => {
        expect(() => resolveSidecarConfiguration([
            createConfiguration({
                agentConnectionString: "http://example.com/copilotstudio/bots/cr0b1_HRMgmtClassic"
            })
        ], APP_ID)).toThrowError(expect.objectContaining<Partial<SidecarConfigurationError>>({
            errorCode: "sidecar_configuration_invalid"
        }));
    });

    it("rejects a connection URL for a different agent schema", () => {
        expect(() => resolveSidecarConfiguration([
            createConfiguration({
                agentSchemaName: "contoso_OtherAgent"
            })
        ], APP_ID)).toThrowError(expect.objectContaining<Partial<SidecarConfigurationError>>({
            errorCode: "sidecar_configuration_invalid"
        }));
    });

    it("looks up entity bindings case-insensitively", () => {
        expect(getEntityBinding(createConfiguration(), "MAFTAGSC_BENEFITPLAN"))
            .toEqual({
                logicalName: "maftagsc_benefitplan",
                screenName: "Benefit Plan record form"
            });
    });

    it("does not resolve inherited object properties as entity bindings", () => {
        expect(getEntityBinding(createConfiguration(), "toString")).toBeNull();
    });
});
