import { describe, expect, it } from "vitest";
import {
    resolveOutgoingContext
} from "../../model-driven/webresources/maftagsc_/copilot/sidecarOutgoingContext";

describe("sidecar outgoing context", () => {
    it("returns a resolved supported context", () => {
        const context = { pageType: "entitylist", entityName: "opportunity" };

        expect(resolveOutgoingContext(() => context)).toEqual({
            ok: true,
            context
        });
    });

    it("blocks an unsupported table without throwing into Web Chat", () => {
        const result = resolveOutgoingContext(() => {
            throw new Error("sidecar_form_not_bound");
        });

        expect(result).toEqual({
            ok: false,
            message:
                "This sidecar isn't configured for the current table. " +
                "Your message was not sent."
        });
    });

    it("does not hide unexpected context failures", () => {
        expect(() => resolveOutgoingContext(() => {
            throw new Error("unexpected_context_failure");
        })).toThrow("unexpected_context_failure");
    });
});
