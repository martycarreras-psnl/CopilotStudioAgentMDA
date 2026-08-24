export type CopilotStudioHarness = "standard" | "github";

export interface CopilotStudioConnectionDetails {
    harness: CopilotStudioHarness;
    schemaName: string;
}

const SCHEMA_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,199}$/;
const SUPPORTED_HOST_SUFFIXES = [
    ".environment.api.powerplatform.com",
    ".environment.api.gov.powerplatform.microsoft.us",
    ".environment.api.high.powerplatform.microsoft.us",
    ".environment.api.appsplatform.us",
    ".environment.api.powerplatform.partner.microsoftonline.cn"
];
const STANDARD_PATH_PATTERN =
    /^\/copilotstudio\/dataverse-backed\/authenticated\/bots\/([^/]+)\/conversations\/?$/i;
const GITHUB_PATH_PATTERN =
    /^\/copilotstudio\/agenticruntime\/3p\/dataverse-backed\/authenticated\/bots\/([^/]+)(?:\/conversations)?\/?$/i;

export function parseSupportedCopilotStudioConnectionUrl(
    value: string
): CopilotStudioConnectionDetails | null {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return null;
    }

    if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.hash ||
        !SUPPORTED_HOST_SUFFIXES.some(suffix =>
            url.hostname.toLowerCase().endsWith(suffix)
        )
    ) {
        return null;
    }

    const githubMatch = url.pathname.match(GITHUB_PATH_PATTERN);
    const standardMatch = url.pathname.match(STANDARD_PATH_PATTERN);
    const harness: CopilotStudioHarness | null = githubMatch
        ? "github"
        : standardMatch
            ? "standard"
            : null;
    const encodedSchemaName = githubMatch?.[1] ?? standardMatch?.[1];
    if (!harness || !encodedSchemaName) {
        return null;
    }

    let schemaName: string;
    try {
        schemaName = decodeURIComponent(encodedSchemaName);
    } catch {
        return null;
    }

    const apiVersion = url.searchParams.get("api-version");
    if (
        !SCHEMA_NAME_PATTERN.test(schemaName) ||
        (harness === "github" && apiVersion !== "1") ||
        (harness === "standard" && apiVersion !== "2022-03-01-preview")
    ) {
        return null;
    }

    return { harness, schemaName };
}
