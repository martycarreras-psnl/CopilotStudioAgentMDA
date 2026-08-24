import { describe, expect, it, vi } from "vitest";
import {
    SidecarConversationRepository,
    SidecarConversationSession,
    type SidecarConversationReference,
    type SidecarDataverseWebApi
} from "../../model-driven/webresources/maftagsc_/copilot/sidecarConversationRepository";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const CONFIGURATION_ID = "22222222-2222-4222-8222-222222222222";
const APP_ID = "33333333-3333-4333-8333-333333333333";
const CONVERSATION_RECORD_ID = "44444444-4444-4444-8444-444444444444";
const COPILOT_CONVERSATION_ID = "55555555-5555-4555-8555-555555555555";
const ACTIVITY_RECORD_ID = "66666666-6666-4666-8666-666666666666";
const ACTIVITY_ID = "77777777-7777-4777-8777-777777777777";

function createWebApi(): {
    api: SidecarDataverseWebApi;
    retrieveMultipleRecords: ReturnType<typeof vi.fn>;
    createRecord: ReturnType<typeof vi.fn>;
    updateRecord: ReturnType<typeof vi.fn>;
} {
    const retrieveMultipleRecords = vi.fn();
    const createRecord = vi.fn();
    const updateRecord = vi.fn();
    return {
        api: {
            retrieveMultipleRecords,
            createRecord,
            updateRecord
        },
        retrieveMultipleRecords,
        createRecord,
        updateRecord
    };
}

function createReference(
    overrides: Partial<SidecarConversationReference> = {}
): SidecarConversationReference {
    return {
        id: CONVERSATION_RECORD_ID,
        conversationId: COPILOT_CONVERSATION_ID,
        title: "Contoso contact",
        lastActivityOn: "2026-08-24T20:00:00.000Z",
        messageCount: 0,
        originatingTable: "contact",
        originatingRecordId: null,
        originatingRecordName: "Contoso contact",
        ...overrides
    };
}

describe("SidecarConversationRepository", () => {
    it("lists only the current owner's recent conversations for the active app", async () => {
        const { api, retrieveMultipleRecords } = createWebApi();
        retrieveMultipleRecords.mockResolvedValue({
            entities: [{
                maftagsc_sidecarconversationid: CONVERSATION_RECORD_ID,
                maftagsc_conversationid: COPILOT_CONVERSATION_ID,
                maftagsc_name: "Contoso contact",
                maftagsc_lastactivityon: "2026-08-24T20:00:00Z",
                maftagsc_messagecount: 2,
                maftagsc_originatingtable: "contact",
                maftagsc_originatingrecordid: null,
                maftagsc_originatingrecordname: "Contoso contact"
            }]
        });
        const repository = new SidecarConversationRepository(api);

        await expect(repository.listRecent({
            ownerId: OWNER_ID,
            configurationId: CONFIGURATION_ID,
            appId: APP_ID,
            agentSchemaName: "cr88d_insightsandactions_AChDbK"
        })).resolves.toHaveLength(1);

        const options = retrieveMultipleRecords.mock.calls[0]?.[1] as string;
        expect(options).toContain(`_ownerid_value eq ${OWNER_ID}`);
        expect(options).toContain(`_maftagsc_sidecarconfiguration_value eq ${CONFIGURATION_ID}`);
        expect(options).toContain(`maftagsc_appid eq '${APP_ID}'`);
        expect(options).toContain("$orderby=maftagsc_lastactivityon desc");
    });

    it("creates a user-owned conversation reference without storing trusted context", async () => {
        const { api, createRecord } = createWebApi();
        createRecord.mockResolvedValue({ id: CONVERSATION_RECORD_ID });
        const repository = new SidecarConversationRepository(api);

        await repository.createConversation({
            ownerId: OWNER_ID,
            configurationId: CONFIGURATION_ID,
            appId: APP_ID,
            agentSchemaName: "cr88d_insightsandactions_AChDbK"
        }, COPILOT_CONVERSATION_ID, {
            tableName: "contact",
            recordId: null,
            recordName: "Contoso contact"
        }, "Help with this contact", "2026-08-24T20:00:00Z");

        expect(createRecord).toHaveBeenCalledWith(
            "maftagsc_sidecarconversation",
            expect.objectContaining({
                maftagsc_conversationid: COPILOT_CONVERSATION_ID,
                maftagsc_appid: APP_ID,
                "maftagsc_sidecarconfiguration@odata.bind":
                    `/maftagsc_sidecarconfigurations(${CONFIGURATION_ID})`
            })
        );
        const payload = createRecord.mock.calls[0]?.[1];
        expect(JSON.stringify(payload)).not.toContain("Trusted");
        expect(JSON.stringify(payload)).not.toContain("channelData");
    });

    it("persists display text and updates conversation ordering metadata", async () => {
        const { api, retrieveMultipleRecords, createRecord, updateRecord } = createWebApi();
        retrieveMultipleRecords.mockResolvedValue({ entities: [] });
        createRecord.mockResolvedValue({ id: ACTIVITY_RECORD_ID });
        updateRecord.mockResolvedValue({});
        const repository = new SidecarConversationRepository(api);

        const updated = await repository.appendActivity(createReference(), {
            activityId: ACTIVITY_ID,
            role: "user",
            activityType: "message",
            text: "Show the latest opportunities",
            timestamp: "2026-08-24T20:01:00Z"
        }, 1, "Show the latest opportunities");

        expect(createRecord).toHaveBeenCalledWith(
            "maftagsc_sidecaractivity",
            expect.objectContaining({
                maftagsc_activityid: ACTIVITY_ID,
                maftagsc_sequence: 1,
                maftagsc_text: "Show the latest opportunities",
                "maftagsc_sidecarconversation@odata.bind":
                    `/maftagsc_sidecarconversations(${CONVERSATION_RECORD_ID})`
            })
        );
        expect(updateRecord).toHaveBeenCalledWith(
            "maftagsc_sidecarconversation",
            CONVERSATION_RECORD_ID,
            expect.objectContaining({
                maftagsc_messagecount: 1
            })
        );
        expect(updated.messageCount).toBe(1);
    });

    it("recovers when an activity was created before its parent metadata update failed", async () => {
        const { api, retrieveMultipleRecords, createRecord, updateRecord } = createWebApi();
        retrieveMultipleRecords.mockResolvedValue({
            entities: [{
                maftagsc_sidecaractivityid: ACTIVITY_RECORD_ID,
                _maftagsc_sidecarconversation_value: CONVERSATION_RECORD_ID
            }]
        });
        updateRecord.mockResolvedValue({});
        const repository = new SidecarConversationRepository(api);

        await repository.appendActivity(createReference(), {
            activityId: ACTIVITY_ID,
            role: "assistant",
            activityType: "message",
            text: "Here is the answer.",
            timestamp: "2026-08-24T20:02:00Z"
        }, 1);

        expect(createRecord).not.toHaveBeenCalled();
        expect(updateRecord).toHaveBeenCalledTimes(1);
    });
});

describe("SidecarConversationSession", () => {
    it("queues display activities until a real conversation ID exists and de-duplicates them", async () => {
        const repository = {
            createConversation: vi.fn().mockResolvedValue(createReference()),
            appendActivity: vi.fn().mockImplementation(async (
                reference: SidecarConversationReference
            ) => ({
                ...reference,
                messageCount: reference.messageCount + 1
            }))
        } as unknown as SidecarConversationRepository;
        const changed = vi.fn();
        const failed = vi.fn();
        const session = new SidecarConversationSession(repository, {
            ownerId: OWNER_ID,
            configurationId: CONFIGURATION_ID,
            appId: APP_ID,
            agentSchemaName: "cr88d_insightsandactions_AChDbK"
        }, {
            tableName: "contact",
            recordId: null,
            recordName: "Contoso contact"
        }, changed, failed);
        const draft = {
            activityId: ACTIVITY_ID,
            role: "user" as const,
            activityType: "message" as const,
            text: "Help me",
            timestamp: "2026-08-24T20:01:00Z"
        };

        session.observe(draft, undefined);
        session.observe(draft, undefined);
        await session.waitForIdle();
        expect(repository.createConversation).not.toHaveBeenCalled();

        session.attachConversationId(COPILOT_CONVERSATION_ID);
        await session.waitForIdle();

        expect(repository.createConversation).toHaveBeenCalledTimes(1);
        expect(repository.appendActivity).toHaveBeenCalledTimes(1);
        expect(failed).not.toHaveBeenCalled();
    });
});
