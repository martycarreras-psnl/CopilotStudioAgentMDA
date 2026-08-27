import { describe, expect, it } from "vitest";
import {
    chooseSidecarPageContext,
    type SidecarPageIdentity
} from "../../model-driven/webresources/maftagsc_/copilot/sidecarPageContext";

const recordContext: SidecarPageIdentity = {
    pageType: "entityrecord",
    entityName: "lead",
    formId: "11111111-1111-4111-8111-111111111111",
    recordId: "22222222-2222-4222-8222-222222222222"
};

const listContext: SidecarPageIdentity = {
    pageType: "entitylist",
    entityName: "lead",
    formId: null,
    recordId: null
};

describe("sidecar page context", () => {
    it("prefers the open record when split view reports the adjacent list", () => {
        expect(chooseSidecarPageContext(recordContext, listContext, {
            entityName: "lead",
            formId: recordContext.formId,
            recordId: recordContext.recordId
        })).toEqual(recordContext);
    });

    it("uses list context when no record form is open", () => {
        expect(chooseSidecarPageContext(recordContext, listContext, null))
            .toEqual(listContext);
    });

    it("does not revive a stale shared record after returning to the list", () => {
        expect(chooseSidecarPageContext(recordContext, listContext, {
            entityName: "lead",
            formId: recordContext.formId,
            recordId: "33333333-3333-4333-8333-333333333333"
        })).toEqual(listContext);
    });

    it("does not use a record from a different entity beside the live list", () => {
        expect(chooseSidecarPageContext(recordContext, {
            ...listContext,
            entityName: "contact"
        }, {
            entityName: "lead",
            formId: recordContext.formId,
            recordId: recordContext.recordId
        })).toEqual({
            ...listContext,
            entityName: "contact"
        });
    });

    it("requires a known bound form before overriding list context", () => {
        expect(chooseSidecarPageContext({
            ...recordContext,
            formId: null
        }, listContext, {
            entityName: "lead",
            formId: null,
            recordId: recordContext.recordId
        })).toEqual(listContext);
    });

    it("preserves launcher context on a record page", () => {
        expect(chooseSidecarPageContext(recordContext, recordContext, null))
            .toEqual(recordContext);
    });
});
