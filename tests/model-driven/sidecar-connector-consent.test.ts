import { describe, expect, it } from "vitest";
import { createConnectorConsentTracker } from "../../model-driven/webresources/maftagsc_/copilot/sidecarConnectorConsent";

function createConsentActivity(
    requestId: string,
    decision = "allow",
    clientActivityID = "first-client-activity"
) {
    return {
        type: "message",
        text: "",
        value: {
            decision,
            _dracarys_request_type: "connector_consent",
            _dracarys_request_id: requestId
        },
        channelData: {
            postBack: true,
            clientActivityID
        }
    };
}

describe("sidecar connector consent", () => {
    it("claims the first consent decision and rejects repeat client submissions", () => {
        const tracker = createConnectorConsentTracker();

        expect(tracker.claim(createConsentActivity("request-1"))).toEqual({
            duplicate: false,
            key: "request-1:allow"
        });
        expect(tracker.claim(createConsentActivity(
            "request-1",
            "allow",
            "second-client-activity"
        ))).toEqual({
            duplicate: true,
            key: "request-1:allow"
        });
    });

    it("allows distinct requests and decisions", () => {
        const tracker = createConnectorConsentTracker();

        expect(tracker.claim(createConsentActivity("request-1"))?.duplicate).toBe(false);
        expect(tracker.claim(createConsentActivity("request-2"))?.duplicate).toBe(false);
        expect(tracker.claim(createConsentActivity("request-1", "deny"))?.duplicate).toBe(false);
    });

    it("allows a failed consent decision to be retried after release", () => {
        const tracker = createConnectorConsentTracker();
        const claim = tracker.claim(createConsentActivity("request-1"));

        expect(claim?.duplicate).toBe(false);
        tracker.release(claim?.key ?? "");
        expect(tracker.claim(createConsentActivity("request-1"))?.duplicate).toBe(false);
    });

    it.each([
        { type: "message", text: "allow", value: {} },
        { type: "message", text: "", value: { decision: "allow" } },
        {
            type: "message",
            text: "",
            value: {
                decision: "allow",
                _dracarys_request_type: "other_card",
                _dracarys_request_id: "request-1"
            }
        },
        { type: "event", text: "", value: createConsentActivity("request-1").value }
    ])("ignores ordinary or malformed activities", (activity) => {
        const tracker = createConnectorConsentTracker();

        expect(tracker.claim(activity)).toBeNull();
    });
});
