import { describe, expect, it } from "vitest";
import {
    getConversationContextMismatch
} from "../../model-driven/webresources/maftagsc_/copilot/sidecarConversationContext";

const conversation = {
    id: "conversation-row",
    originatingTable: "contact",
    originatingRecordId: "11111111-1111-1111-1111-111111111111",
    originatingRecordName: "Bill Franklin"
};

describe("sidecar conversation context", () => {
    it("does not warn for the originating record", () => {
        expect(getConversationContextMismatch(conversation, {
            pageType: "entityrecord",
            entityName: "contact",
            recordId: "11111111-1111-1111-1111-111111111111",
            recordName: "Bill Franklin"
        })).toBeNull();
    });

    it("warns when a resumed conversation is used on another record", () => {
        expect(getConversationContextMismatch(conversation, {
            pageType: "entityrecord",
            entityName: "contact",
            recordId: "22222222-2222-2222-2222-222222222222",
            recordName: "Rene Valdes"
        })).toEqual({
            key:
                "conversation-row:contact:11111111-1111-1111-1111-111111111111:" +
                "contact:22222222-2222-2222-2222-222222222222",
            message:
                "This conversation started for Bill Franklin, but you are currently viewing " +
                "Rene Valdes. New messages will use Rene Valdes as context."
        });
    });

    it("warns when the current record is from another table", () => {
        const result = getConversationContextMismatch(conversation, {
            pageType: "entityrecord",
            entityName: "account",
            recordId: "33333333-3333-3333-3333-333333333333",
            recordName: "Polumbo Pizza"
        });

        expect(result?.message).toContain("currently viewing Polumbo Pizza");
    });

    it("does not treat list records as a record mismatch", () => {
        expect(getConversationContextMismatch(conversation, {
            pageType: "entitylist",
            entityName: "contact",
            recordId: null,
            recordName: ""
        })).toBeNull();
    });

    it("does not warn for a conversation without an originating record", () => {
        expect(getConversationContextMismatch({
            ...conversation,
            originatingRecordId: null
        }, {
            pageType: "entityrecord",
            entityName: "contact",
            recordId: "22222222-2222-2222-2222-222222222222",
            recordName: "Rene Valdes"
        })).toBeNull();
    });
});
