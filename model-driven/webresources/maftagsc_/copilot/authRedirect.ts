import { PublicClientApplication } from "@azure/msal-browser";

/**
 * Dedicated MSAL redirect page for the sidecar sign-in popup.
 *
 * The MSAL v5 "redirect bridge" (broadcastResponseToMainFrame) hands the auth
 * response back to the launching frame over a BroadcastChannel/opener link.
 * Dynamics serves web resources with a Cross-Origin-Opener-Policy that severs
 * that link inside a model-driven app, so the popup would sit forever on
 * "Completing sign-in". Instead this page runs as a self-contained MSAL redirect
 * client: it drives the interactive redirect to Entra, completes the code
 * exchange with handleRedirectPromise, and reports the outcome back through
 * same-origin localStorage, which COOP and storage partitioning do not break.
 */

const AUTH_RESULT_PREFIX = "maftagsc.sidecar.authResult.";
const AUTH_NAMESPACE_KEY = "maftagsc.sidecar.authNamespace";

interface AuthRequest {
    configurationId: string;
    clientId: string;
    authority: string;
    redirectUri: string;
    scope: string;
    nonce: string;
}

function setMessage(text: string): void {
    if (document.body) {
        document.body.textContent = text;
    }
}

function writeResult(nonce: string, value: string): void {
    if (nonce) {
        window.localStorage.setItem(`${AUTH_RESULT_PREFIX}${nonce}`, value);
    }
}

function describeError(error: unknown): string {
    if (error && typeof error === "object") {
        const candidate = "errorCode" in error
            ? String((error as { errorCode: unknown }).errorCode)
            : "message" in error
                ? String((error as { message: unknown }).message)
                : "unknown_error";
        return candidate.replace(/[\r\n]+/g, " ").slice(0, 200) || "unknown_error";
    }
    return "unknown_error";
}

async function run(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const initialNonce = params.get("nonce") ?? "";
    const initialConfigurationId = params.get("configurationId") ?? "";
    if (initialNonce && initialConfigurationId) {
        window.sessionStorage.setItem(
            AUTH_NAMESPACE_KEY,
            JSON.stringify({
                configurationId: initialConfigurationId,
                nonce: initialNonce
            })
        );
    }
    let configurationId = initialConfigurationId;
    let urlNonce = initialNonce;
    if (!configurationId || !urlNonce) {
        try {
            const namespace = JSON.parse(
                window.sessionStorage.getItem(AUTH_NAMESPACE_KEY) ?? "{}"
            ) as Partial<Pick<AuthRequest, "configurationId" | "nonce">>;
            configurationId = String(namespace.configurationId ?? "");
            urlNonce = String(namespace.nonce ?? "");
        } catch {
            configurationId = "";
            urlNonce = "";
        }
    }
    const requestKey = `maftagsc.sidecar.authRequest.${configurationId}.${urlNonce}`;

    const raw = window.localStorage.getItem(requestKey);
    if (!raw) {
        writeResult(urlNonce, "error:Sign-in configuration was not found.");
        setMessage("Sign-in could not be completed. Close this window and try again.");
        return;
    }

    let request: AuthRequest;
    try {
        request = JSON.parse(raw) as AuthRequest;
    } catch {
        writeResult(urlNonce, "error:Sign-in configuration was invalid.");
        setMessage("Sign-in could not be completed. Close this window and try again.");
        return;
    }

    const nonce = request.nonce || urlNonce;
    if (
        !configurationId ||
        request.configurationId !== configurationId ||
        request.nonce !== urlNonce
    ) {
        writeResult(urlNonce, "error:Sign-in configuration did not match the requesting sidecar.");
        setMessage("Sign-in could not be completed. Close this window and try again.");
        return;
    }

    const client = new PublicClientApplication({
        auth: {
            clientId: request.clientId,
            authority: request.authority,
            redirectUri: request.redirectUri
        },
        cache: {
            cacheLocation: "localStorage"
        }
    });

    await client.initialize();

    let redirectResult = null;
    try {
        redirectResult = await client.handleRedirectPromise();
    } catch (error) {
        writeResult(nonce, `error:${describeError(error)}`);
        setMessage("Sign-in could not be completed. Close this window and try again.");
        return;
    }

    if (redirectResult?.account) {
        client.setActiveAccount(redirectResult.account);
        writeResult(nonce, "ok");
        window.sessionStorage.removeItem(AUTH_NAMESPACE_KEY);
        window.close();
        return;
    }

    if (params.get("sidecarAuth") === "start") {
        try {
            await client.acquireTokenRedirect({
                scopes: [request.scope],
                prompt: "select_account"
            });
        } catch (error) {
            writeResult(nonce, `error:${describeError(error)}`);
            setMessage("Sign-in could not be completed. Close this window and try again.");
        }
        return;
    }

    writeResult(nonce, "error:Sign-in could not be completed.");
    setMessage("Sign-in could not be completed. Close this window and try again.");
}

void run();