interface ConnectorConsentActivity {
    type?: unknown;
    text?: unknown;
    value?: unknown;
}

export interface ConnectorConsentClaim {
    duplicate: boolean;
    key: string;
}

const CONNECTOR_CONSENT_REQUEST_TYPE = "connector_consent";
const MAX_CONSENT_VALUE_LENGTH = 200;

function readConsentValue(
    value: Record<string, unknown>,
    key: string
): string | null {
    const candidate = value[key];
    if (typeof candidate !== "string") {
        return null;
    }

    const normalized = candidate.trim().toLowerCase();
    return normalized && normalized.length <= MAX_CONSENT_VALUE_LENGTH
        ? normalized
        : null;
}

function getConnectorConsentKey(
    activity: ConnectorConsentActivity
): string | null {
    if (
        activity.type !== "message" ||
        (typeof activity.text === "string" && activity.text.trim()) ||
        !activity.value ||
        typeof activity.value !== "object" ||
        Array.isArray(activity.value)
    ) {
        return null;
    }

    const value = activity.value as Record<string, unknown>;
    if (
        value._dracarys_request_type !== CONNECTOR_CONSENT_REQUEST_TYPE
    ) {
        return null;
    }

    const requestId = readConsentValue(value, "_dracarys_request_id");
    const decision = readConsentValue(value, "decision");
    return requestId && decision
        ? `${requestId}:${decision}`
        : null;
}

export function createConnectorConsentTracker(): {
    claim(activity: ConnectorConsentActivity): ConnectorConsentClaim | null;
    release(key: string): void;
} {
    const claimedConsentDecisions = new Set<string>();

    return {
        claim(activity) {
            const key = getConnectorConsentKey(activity);
            if (!key) {
                return null;
            }

            const duplicate = claimedConsentDecisions.has(key);
            claimedConsentDecisions.add(key);
            return { duplicate, key };
        },
        release(key) {
            claimedConsentDecisions.delete(key);
        }
    };
}
