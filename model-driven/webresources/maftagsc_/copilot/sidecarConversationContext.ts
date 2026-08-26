export interface ConversationOrigin {
    id: string;
    originatingTable: string;
    originatingRecordId: string | null;
    originatingRecordName: string;
}

export interface CurrentConversationContext {
    pageType: "entityrecord" | "entitylist";
    entityName: string;
    recordId: string | null;
    recordName: string;
}

export interface ConversationContextMismatch {
    key: string;
    message: string;
}

function recordLabel(name: string, tableName: string): string {
    return name.trim() || `${tableName || "current"} record`;
}

export function getConversationContextMismatch(
    conversation: ConversationOrigin | null,
    context: CurrentConversationContext
): ConversationContextMismatch | null {
    if (
        !conversation ||
        context.pageType !== "entityrecord" ||
        !conversation.originatingRecordId ||
        !context.recordId
    ) {
        return null;
    }

    const originatingTable = conversation.originatingTable.trim().toLowerCase();
    const currentTable = context.entityName.trim().toLowerCase();
    const originatingRecordId = conversation.originatingRecordId.toLowerCase();
    const currentRecordId = context.recordId.toLowerCase();
    if (
        originatingTable === currentTable &&
        originatingRecordId === currentRecordId
    ) {
        return null;
    }

    const originLabel = recordLabel(
        conversation.originatingRecordName,
        originatingTable
    );
    const currentLabel = recordLabel(context.recordName, currentTable);
    return {
        key: [
            conversation.id,
            originatingTable,
            originatingRecordId,
            currentTable,
            currentRecordId
        ].join(":"),
        message:
            `This conversation started for ${originLabel}, but you are currently viewing ` +
            `${currentLabel}. New messages will use ${currentLabel} as context.`
    };
}
