import { normalizeGuid } from "./sidecarConfiguration";

const CONVERSATION_TABLE = "maftagsc_sidecarconversation";
const ACTIVITY_TABLE = "maftagsc_sidecaractivity";
const CONFIGURATION_ENTITY_SET = "maftagsc_sidecarconfigurations";
const CONVERSATION_ENTITY_SET = "maftagsc_sidecarconversations";
const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 100000;
const MAX_ACTIVITY_ID_LENGTH = 100;
const MAX_AGENT_SCHEMA_LENGTH = 256;
const MAX_TABLE_NAME_LENGTH = 128;

interface DataverseResult {
    entities: Record<string, unknown>[];
}

interface DataverseCreateResult {
    id: string;
}

export interface SidecarDataverseWebApi {
    retrieveMultipleRecords(
        entityLogicalName: string,
        options: string,
        maxPageSize?: number
    ): Promise<DataverseResult>;
    createRecord(
        entityLogicalName: string,
        data: Record<string, unknown>
    ): Promise<DataverseCreateResult>;
    updateRecord(
        entityLogicalName: string,
        id: string,
        data: Record<string, unknown>
    ): Promise<unknown>;
    deleteRecord(
        entityLogicalName: string,
        id: string
    ): Promise<unknown>;
}

export interface SidecarConversationScope {
    ownerId: string;
    configurationId: string;
    appId: string;
    agentSchemaName: string;
}

export interface SidecarConversationOrigin {
    tableName: string;
    recordId: string | null;
    recordName: string;
}

export interface SidecarConversationReference {
    id: string;
    conversationId: string;
    title: string;
    lastActivityOn: string;
    messageCount: number;
    hasUserMessage: boolean;
    originatingTable: string;
    originatingRecordId: string | null;
    originatingRecordName: string;
}

export interface SidecarConversationActivity {
    id: string;
    activityId: string;
    sequence: number;
    role: "user" | "assistant";
    activityType: "message";
    text: string;
    timestamp: string;
}

export interface SidecarConversationActivityDraft {
    activityId: string;
    role: "user" | "assistant";
    activityType: "message";
    text: string;
    timestamp: string;
}

function escapeODataString(value: string): string {
    return value.replace(/'/g, "''");
}

function boundedText(value: unknown, maxLength: number): string {
    return String(value ?? "").trim().slice(0, maxLength);
}

function requireGuid(value: unknown, errorCode: string): string {
    const normalized = normalizeGuid(value);
    if (!normalized) {
        throw new Error(errorCode);
    }
    return normalized;
}

function requireDate(value: unknown, errorCode: string): string {
    const date = new Date(String(value ?? ""));
    if (Number.isNaN(date.getTime())) {
        throw new Error(errorCode);
    }
    return date.toISOString();
}

function toConversation(record: Record<string, unknown>): SidecarConversationReference {
    return {
        id: requireGuid(record.maftagsc_sidecarconversationid, "sidecar_conversation_id_invalid"),
        conversationId: requireGuid(
            record.maftagsc_conversationid,
            "sidecar_copilot_conversation_id_invalid"
        ),
        title: boundedText(record.maftagsc_name, MAX_TITLE_LENGTH) || "Conversation",
        lastActivityOn: requireDate(
            record.maftagsc_lastactivityon,
            "sidecar_conversation_timestamp_invalid"
        ),
        messageCount: Math.max(0, Number(record.maftagsc_messagecount ?? 0) || 0),
        hasUserMessage: false,
        originatingTable: boundedText(record.maftagsc_originatingtable, MAX_TABLE_NAME_LENGTH),
        originatingRecordId: normalizeGuid(record.maftagsc_originatingrecordid),
        originatingRecordName: boundedText(
            record.maftagsc_originatingrecordname,
            MAX_TITLE_LENGTH
        )
    };
}

function toActivity(record: Record<string, unknown>): SidecarConversationActivity {
    const sequence = Number(record.maftagsc_sequence);
    const role = String(record.maftagsc_role) === "user" ? "user" : "assistant";
    if (!Number.isInteger(sequence) || sequence < 1) {
        throw new Error("sidecar_conversation_activity_sequence_invalid");
    }

    return {
        id: requireGuid(record.maftagsc_sidecaractivityid, "sidecar_activity_record_id_invalid"),
        activityId: boundedText(record.maftagsc_activityid, MAX_ACTIVITY_ID_LENGTH),
        sequence,
        role,
        activityType: "message",
        text: boundedText(record.maftagsc_text, MAX_TEXT_LENGTH),
        timestamp: requireDate(
            record.maftagsc_activitytimestamp,
            "sidecar_activity_timestamp_invalid"
        )
    };
}

export class SidecarConversationRepository {
    constructor(private readonly webApi: SidecarDataverseWebApi) {}

    async listRecent(
        scope: SidecarConversationScope,
        limit = 20
    ): Promise<SidecarConversationReference[]> {
        const ownerId = requireGuid(scope.ownerId, "sidecar_owner_id_invalid");
        const configurationId = requireGuid(
            scope.configurationId,
            "sidecar_configuration_id_invalid"
        );
        const appId = requireGuid(scope.appId, "sidecar_app_id_invalid");
        const agentSchemaName = boundedText(scope.agentSchemaName, MAX_AGENT_SCHEMA_LENGTH);
        if (!agentSchemaName) {
            throw new Error("sidecar_agent_schema_name_invalid");
        }
        const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
        const result = await this.webApi.retrieveMultipleRecords(
            CONVERSATION_TABLE,
            `?$select=maftagsc_sidecarconversationid,maftagsc_conversationid,maftagsc_name,maftagsc_lastactivityon,maftagsc_messagecount,maftagsc_originatingtable,maftagsc_originatingrecordid,maftagsc_originatingrecordname&$filter=_ownerid_value eq ${ownerId} and _maftagsc_sidecarconfiguration_value eq ${configurationId} and maftagsc_appid eq '${escapeODataString(appId)}' and maftagsc_agentschemaname eq '${escapeODataString(agentSchemaName)}' and statecode eq 0 and maftagsc_sidecarconversation_sidecaractivity/any(activity:activity/maftagsc_role eq 'user')&$orderby=maftagsc_lastactivityon desc&$top=${safeLimit}`,
            safeLimit
        );
        return result.entities
            .map(toConversation)
            .map(conversation => ({
                ...conversation,
                hasUserMessage: true
            }));
    }

    async createConversation(
        scope: SidecarConversationScope,
        conversationId: string,
        origin: SidecarConversationOrigin,
        title: string,
        timestamp: string
    ): Promise<SidecarConversationReference> {
        const normalizedConversationId = requireGuid(
            conversationId,
            "sidecar_copilot_conversation_id_invalid"
        );
        const configurationId = requireGuid(
            scope.configurationId,
            "sidecar_configuration_id_invalid"
        );
        const appId = requireGuid(scope.appId, "sidecar_app_id_invalid");
        const safeTitle = boundedText(title, MAX_TITLE_LENGTH) || "New conversation";
        const safeTimestamp = requireDate(timestamp, "sidecar_conversation_timestamp_invalid");
        const result = await this.webApi.createRecord(CONVERSATION_TABLE, {
            maftagsc_name: safeTitle,
            maftagsc_conversationid: normalizedConversationId,
            maftagsc_appid: appId,
            maftagsc_agentschemaname: boundedText(
                scope.agentSchemaName,
                MAX_AGENT_SCHEMA_LENGTH
            ),
            maftagsc_originatingtable: boundedText(origin.tableName, MAX_TABLE_NAME_LENGTH),
            maftagsc_originatingrecordid: normalizeGuid(origin.recordId),
            maftagsc_originatingrecordname: boundedText(
                origin.recordName,
                MAX_TITLE_LENGTH
            ),
            maftagsc_lastactivityon: safeTimestamp,
            maftagsc_messagecount: 0,
            "maftagsc_sidecarconfiguration@odata.bind":
                `/${CONFIGURATION_ENTITY_SET}(${configurationId})`
        });

        return {
            id: requireGuid(result.id, "sidecar_conversation_create_id_invalid"),
            conversationId: normalizedConversationId,
            title: safeTitle,
            lastActivityOn: safeTimestamp,
            messageCount: 0,
            hasUserMessage: false,
            originatingTable: boundedText(origin.tableName, MAX_TABLE_NAME_LENGTH),
            originatingRecordId: normalizeGuid(origin.recordId),
            originatingRecordName: boundedText(origin.recordName, MAX_TITLE_LENGTH)
        };
    }

    async listActivities(
        conversationRecordId: string
    ): Promise<SidecarConversationActivity[]> {
        const id = requireGuid(
            conversationRecordId,
            "sidecar_conversation_record_id_invalid"
        );
        const result = await this.webApi.retrieveMultipleRecords(
            ACTIVITY_TABLE,
            `?$select=maftagsc_sidecaractivityid,maftagsc_activityid,maftagsc_sequence,maftagsc_role,maftagsc_activitytype,maftagsc_text,maftagsc_activitytimestamp&$filter=_maftagsc_sidecarconversation_value eq ${id} and statecode eq 0&$orderby=maftagsc_sequence asc`,
            5000
        );
        return result.entities.map(toActivity);
    }

    async deleteConversation(conversationRecordId: string): Promise<void> {
        const id = requireGuid(
            conversationRecordId,
            "sidecar_conversation_record_id_invalid"
        );
        await this.webApi.deleteRecord(CONVERSATION_TABLE, id);
    }

    async appendActivity(
        conversation: SidecarConversationReference,
        draft: SidecarConversationActivityDraft,
        sequence: number,
        title?: string
    ): Promise<SidecarConversationReference> {
        if (!Number.isInteger(sequence) || sequence < 1) {
            throw new Error("sidecar_conversation_activity_sequence_invalid");
        }
        const conversationRecordId = requireGuid(
            conversation.id,
            "sidecar_conversation_record_id_invalid"
        );
        const activityId = boundedText(draft.activityId, MAX_ACTIVITY_ID_LENGTH);
        const text = boundedText(draft.text, MAX_TEXT_LENGTH);
        if (!activityId || !text) {
            throw new Error("sidecar_conversation_activity_invalid");
        }
        const timestamp = requireDate(
            draft.timestamp,
            "sidecar_activity_timestamp_invalid"
        );
        const existingActivity = await this.webApi.retrieveMultipleRecords(
            ACTIVITY_TABLE,
            `?$select=maftagsc_sidecaractivityid,_maftagsc_sidecarconversation_value&$filter=maftagsc_activityid eq '${escapeODataString(activityId)}'&$top=2`,
            2
        );
        if (existingActivity.entities.length > 1) {
            throw new Error("sidecar_conversation_activity_ambiguous");
        }
        if (existingActivity.entities.length === 1) {
            const existingConversationId = normalizeGuid(
                existingActivity.entities[0]._maftagsc_sidecarconversation_value
            );
            if (existingConversationId !== conversationRecordId) {
                throw new Error("sidecar_conversation_activity_conflict");
            }
        } else {
            await this.webApi.createRecord(ACTIVITY_TABLE, {
                maftagsc_name: `${draft.role === "user" ? "User" : "Agent"} message ${sequence}`,
                maftagsc_activityid: activityId,
                maftagsc_sequence: sequence,
                maftagsc_role: draft.role,
                maftagsc_activitytype: "message",
                maftagsc_text: text,
                maftagsc_activitytimestamp: timestamp,
                "maftagsc_sidecarconversation@odata.bind":
                    `/${CONVERSATION_ENTITY_SET}(${conversationRecordId})`
            });
        }

        const nextTitle = boundedText(title, MAX_TITLE_LENGTH) || conversation.title;
        const nextMessageCount = Math.max(conversation.messageCount + 1, sequence);
        await this.webApi.updateRecord(CONVERSATION_TABLE, conversationRecordId, {
            maftagsc_name: nextTitle,
            maftagsc_lastactivityon: timestamp,
            maftagsc_messagecount: nextMessageCount
        });

        return {
            ...conversation,
            title: nextTitle,
            lastActivityOn: timestamp,
            messageCount: nextMessageCount,
            hasUserMessage: conversation.hasUserMessage || draft.role === "user"
        };
    }
}

export class SidecarConversationSession {
    private reference: SidecarConversationReference | null = null;
    private sequence = 0;
    private readonly seenActivityIds = new Set<string>();
    private readonly pending: SidecarConversationActivityDraft[] = [];
    private work: Promise<void> = Promise.resolve();

    constructor(
        private readonly repository: SidecarConversationRepository,
        private readonly scope: SidecarConversationScope,
        private readonly origin: SidecarConversationOrigin,
        private readonly onReferenceChanged: (
            reference: SidecarConversationReference
        ) => void,
        private readonly onError: (error: unknown) => void
    ) {}

    restore(
        reference: SidecarConversationReference,
        activities: readonly SidecarConversationActivity[]
    ): void {
        this.reference = reference;
        this.sequence = activities.reduce(
            (highest, activity) => Math.max(highest, activity.sequence),
            0
        );
        for (const activity of activities) {
            this.seenActivityIds.add(activity.activityId);
        }
    }

    observe(
        draft: SidecarConversationActivityDraft,
        conversationId: unknown
    ): void {
        const activityId = boundedText(draft.activityId, MAX_ACTIVITY_ID_LENGTH);
        const text = boundedText(draft.text, MAX_TEXT_LENGTH);
        if (!activityId || !text || this.seenActivityIds.has(activityId)) {
            return;
        }
        this.seenActivityIds.add(activityId);
        this.pending.push({
            ...draft,
            activityId,
            text
        });
        this.flush(conversationId);
    }

    attachConversationId(conversationId: unknown): void {
        this.flush(conversationId);
    }

    getReference(): SidecarConversationReference | null {
        return this.reference;
    }

    async waitForIdle(): Promise<void> {
        await this.work;
    }

    private flush(conversationId: unknown): void {
        const normalizedConversationId = normalizeGuid(conversationId);
        if (!normalizedConversationId && !this.reference) {
            return;
        }

        this.work = this.work
            .then(async () => {
                if (!this.reference) {
                    const firstUserMessage = this.pending.find(activity =>
                        activity.role === "user"
                    );
                    const title = firstUserMessage?.text.slice(0, MAX_TITLE_LENGTH) ||
                        this.origin.recordName ||
                        "New conversation";
                    this.reference = await this.repository.createConversation(
                        this.scope,
                        normalizedConversationId!,
                        this.origin,
                        title,
                        this.pending[0]?.timestamp ?? new Date().toISOString()
                    );
                    this.onReferenceChanged(this.reference);
                }

                while (this.pending.length > 0) {
                    const activity = this.pending[0]!;
                    const nextSequence = this.sequence + 1;
                    const title = this.reference.messageCount === 0 &&
                        activity.role === "user"
                        ? activity.text.slice(0, MAX_TITLE_LENGTH)
                        : undefined;
                    const nextReference = await this.repository.appendActivity(
                        this.reference,
                        activity,
                        nextSequence,
                        title
                    );
                    this.pending.shift();
                    this.sequence = nextSequence;
                    this.reference = nextReference;
                    this.onReferenceChanged(this.reference);
                }
            })
            .catch(error => {
                this.onError(error);
            });
    }
}

export function createHostConversationRepository(): {
    repository: SidecarConversationRepository;
    ownerId: string;
} {
    const root = globalThis as typeof globalThis & {
        Xrm?: HostXrm;
        parent?: { Xrm?: HostXrm };
    };
    let xrm: HostXrm | undefined;
    try {
        xrm = root.parent?.Xrm ?? root.Xrm;
    } catch {
        throw new Error("sidecar_dataverse_host_unavailable");
    }
    const webApi = xrm?.WebApi;
    const ownerId = normalizeGuid(xrm?.Utility?.getGlobalContext?.().userSettings?.userId);
    if (!webApi || !ownerId) {
        throw new Error("sidecar_conversation_history_unavailable");
    }
    return {
        repository: new SidecarConversationRepository(webApi),
        ownerId
    };
}

interface HostXrm {
    WebApi?: SidecarDataverseWebApi;
    Utility?: {
        getGlobalContext?: () => {
            userSettings?: {
                userId?: unknown;
            };
        };
    };
}
