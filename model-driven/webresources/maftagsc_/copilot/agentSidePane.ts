import {
    InteractionRequiredAuthError,
    PublicClientApplication,
    type AccountInfo,
    type AuthenticationResult
} from "@azure/msal-browser";
import {
    ConnectionSettings,
    CopilotStudioClient,
    CopilotStudioWebChat,
    type CopilotStudioWebChatConnection
} from "@microsoft/agents-copilotstudio-client";
import type { Activity } from "@microsoft/agents-activity";
import { sidecarConfigurationRepository } from "./hrSidecarBootstrap";
import {
    getEntityBinding,
    normalizeGuid,
    type SidecarConfiguration
} from "./sidecarConfiguration";
import {
    createHostConversationRepository,
    SidecarConversationSession,
    type SidecarConversationActivity,
    type SidecarConversationActivityDraft,
    type SidecarConversationReference,
    type SidecarConversationRepository,
    type SidecarConversationScope
} from "./sidecarConversationRepository";
import {
    formatUserRolesLine,
    normalizeUserRoles,
    serializeUserRoles
} from "./sidecarUserRoles";

const ORIGINAL_TEXT_KEY = "hrSidecarOriginalText";
const REPLAY_ACTIVITY_KEY = "maftagscSidecarReplay";
const AUTH_REQUEST_KEY = "maftagsc.sidecar.authRequest";
const AUTH_RESULT_PREFIX = "maftagsc.sidecar.authResult.";

interface LaunchContext {
    pageType: "entityrecord" | "entitylist";
    entityName: string;
    recordId: string | null;
    recordName: string;
    appId: string | null;
    roles: string[];
}

interface LaunchRequest {
    configuration: SidecarConfiguration;
    context: LaunchContext;
}

interface HostPageInput {
    pageType?: unknown;
    entityName?: unknown;
    entityId?: unknown;
}

interface HostFormEntity {
    getEntityName?: () => unknown;
    getId?: () => unknown;
    getPrimaryAttributeValue?: () => unknown;
}

interface HostXrm {
    Utility?: {
        getPageContext?: () => {
            input?: HostPageInput;
        };
    };
    Page?: {
        data?: {
            entity?: HostFormEntity;
        };
    };
}

interface WebChatApi {
    createStore(
        initialState: Record<string, unknown>,
        middleware: (api: WebChatStoreApi) => (next: WebChatNext) => (action: WebChatAction) => unknown
    ): WebChatStore;
    renderWebChat(options: Record<string, unknown>, element: HTMLElement): void;
}

interface WebChatStore {
    dispatch(action: WebChatAction): void;
}

interface WebChatAction {
    type: string;
    payload?: {
        activity?: Partial<Activity>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface WebChatStoreApi {
    dispatch(action: WebChatAction): void;
}

type WebChatNext = (action: WebChatAction) => unknown;

declare global {
    interface Window {
        WebChat?: WebChatApi;
        Xrm?: HostXrm;
    }
}

let msalClient: PublicClientApplication | null = null;
let msalInitialized = false;
let startInProgress = false;
let activeConnection: CopilotStudioWebChatConnection | null = null;
let activeToken: string | null = null;
let activeContext: LaunchContext | null = null;
let activeConfiguration: SidecarConfiguration | null = null;
let activeConversationRepository: SidecarConversationRepository | null = null;
let activeConversationScope: SidecarConversationScope | null = null;
let activeConversationReference: SidecarConversationReference | null = null;
let recentConversations = new Map<string, SidecarConversationReference>();
let deletedConversationIds = new Set<string>();
let activeConversationGeneration = 0;
let resetInProgress = false;

function getRequiredElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Required element '${id}' is unavailable.`);
    }
    return element as T;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function parseLaunchRequest(): Promise<LaunchRequest> {
    const encoded = new URLSearchParams(window.location.search).get("data");
    if (!encoded || encoded.length > 2000) {
        throw new Error("Screen context wasn't provided.");
    }

    let value: Record<string, unknown>;
    try {
        value = JSON.parse(encoded) as Record<string, unknown>;
    } catch {
        throw new Error("Screen context is invalid.");
    }

    const appId = normalizeGuid(value.appId);
    const configuration = await sidecarConfigurationRepository.getByAppId(appId);
    const entityName = String(value.entityName || "").trim().toLowerCase();
    if (!getEntityBinding(configuration, entityName)) {
        throw new Error("Screen-specific help isn't available for this table.");
    }

    const recordId = value.recordId == null ? null : normalizeGuid(value.recordId);
    if (value.recordId != null && !recordId) {
        throw new Error("The current record identifier is invalid.");
    }

    return {
        configuration,
        context: {
            pageType: value.pageType === "entitylist" ? "entitylist" : "entityrecord",
            entityName,
            recordId,
            recordName: String(value.recordName || "").slice(0, 200),
            appId,
            roles: normalizeUserRoles(value.roles)
        }
    };
}

function getHostXrm(): HostXrm | null {
    try {
        if (window.parent !== window && window.parent.Xrm) {
            return window.parent.Xrm;
        }
        if (window.top !== window && window.top?.Xrm) {
            return window.top.Xrm;
        }
    } catch {
        // The launch context remains the safe fallback if host access is unavailable.
    }
    return null;
}

function getCurrentRecordName(
    hostXrm: HostXrm,
    entityName: string,
    recordId: string | null
): string | null {
    const formEntity = hostXrm.Page?.data?.entity;
    if (!formEntity) {
        return null;
    }

    const formEntityName = String(formEntity.getEntityName?.() ?? "").trim().toLowerCase();
    const formRecordId = normalizeGuid(formEntity.getId?.());
    if (formEntityName !== entityName || formRecordId !== recordId) {
        return null;
    }

    return String(formEntity.getPrimaryAttributeValue?.() ?? "").slice(0, 200);
}

function getCurrentContext(
    fallback: LaunchContext,
    configuration: SidecarConfiguration
): LaunchContext {
    try {
        const hostXrm = getHostXrm();
        const input = hostXrm?.Utility?.getPageContext?.().input;
        const pageType = input?.pageType === "entityrecord" || input?.pageType === "entitylist"
            ? input.pageType
            : null;
        const entityName = String(input?.entityName ?? "").trim().toLowerCase();
        if (!pageType || !getEntityBinding(configuration, entityName)) {
            return fallback;
        }

        const recordId = pageType === "entityrecord" ? normalizeGuid(input?.entityId) : null;
        const isSameRecord = pageType === "entityrecord" &&
            fallback.pageType === "entityrecord" &&
            fallback.entityName === entityName &&
            fallback.recordId === recordId;
        const currentRecordName = pageType === "entityrecord" && hostXrm
            ? getCurrentRecordName(hostXrm, entityName, recordId)
            : null;

        return {
            pageType,
            entityName,
            recordId,
            recordName: currentRecordName ?? (isSameRecord ? fallback.recordName : ""),
            appId: fallback.appId,
            roles: fallback.roles
        };
    } catch {
        return fallback;
    }
}

// The launcher writes the authoritative current-form context here on every
// navigation. Prefer it (COOP- and partition-safe, same origin) over reading the
// host Xrm from inside the pane, which is unreliable across frames.
function readSharedContext(
    configuration: SidecarConfiguration,
    fallback: LaunchContext
): LaunchContext | null {
    try {
        const raw = window.localStorage.getItem(`maftagsc.sidecar.context.${configuration.paneId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<LaunchContext>;
        const entityName = String(parsed.entityName ?? "").trim().toLowerCase();
        if (!entityName || !getEntityBinding(configuration, entityName)) return null;
        const pageType = parsed.pageType === "entitylist" || parsed.pageType === "entityrecord"
            ? parsed.pageType
            : "entityrecord";
        return {
            pageType,
            entityName,
            recordId: parsed.recordId ? normalizeGuid(parsed.recordId) : null,
            recordName: typeof parsed.recordName === "string" ? parsed.recordName.slice(0, 200) : "",
            appId: parsed.appId ?? fallback.appId,
            roles: parsed.roles !== undefined ? normalizeUserRoles(parsed.roles) : fallback.roles
        };
    } catch {
        return null;
    }
}

function resolveContext(
    fallback: LaunchContext,
    configuration: SidecarConfiguration
): LaunchContext {
    return readSharedContext(configuration, fallback) ?? getCurrentContext(fallback, configuration);
}

function setStatus(message: string, isError = false): void {
    getRequiredElement<HTMLElement>("status-message").textContent = message;
    const status = getRequiredElement<HTMLElement>("status");
    status.setAttribute("role", isError ? "alert" : "status");
    getRequiredElement<HTMLElement>("spinner").hidden = isError;
}

function showSignIn(): void {
    setStatus("Sign in with your Microsoft work account to continue.");
    getRequiredElement<HTMLButtonElement>("sign-in").hidden = false;
}

function applyPaneTitle(title: string): void {
    const safeTitle = (title ?? "").trim() || "Agent Sidecar";
    document.title = safeTitle;
    const heading = document.getElementById("guide-title");
    if (heading) heading.textContent = safeTitle;
    const chat = document.getElementById("chat");
    if (chat) chat.setAttribute("aria-label", `${safeTitle} conversation`);
}

function getSafeErrorCode(error: unknown): string {
    if (!error || typeof error !== "object") {
        return "unknown_error";
    }

    const candidate = "errorCode" in error
        ? String(error.errorCode)
        : "name" in error
            ? String(error.name)
            : "unknown_error";
    return /^[a-z0-9_.-]{1,80}$/i.test(candidate) ? candidate : "unknown_error";
}

function showError(error: unknown): void {
    const code = getSafeErrorCode(error);
    setStatus(`The guide couldn't start (${code}). Try again or contact an administrator.`, true);
    const retry = getRequiredElement<HTMLButtonElement>("sign-in");
    retry.textContent = "Try again";
    retry.hidden = false;
}

function setHistoryStatus(message: string, isError = false): void {
    const status = getRequiredElement<HTMLElement>("conversation-history-status");
    status.textContent = message;
    status.dataset.error = isError ? "true" : "false";
}

function formatConversationOption(conversation: SidecarConversationReference): string {
    const timestamp = new Date(conversation.lastActivityOn);
    const dateLabel = Number.isNaN(timestamp.getTime())
        ? ""
        : timestamp.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric"
        });
    return `${conversation.title}${dateLabel ? ` · ${dateLabel}` : ""}`.slice(0, 220);
}

function renderRecentConversationOptions(selectedId?: string): void {
    const select = getRequiredElement<HTMLSelectElement>("recent-conversations");
    const deleteButton = getRequiredElement<HTMLButtonElement>("delete-conversation");
    const selected = selectedId ?? activeConversationReference?.id ?? "";
    const conversations = [...recentConversations.values()]
        .filter(conversation => conversation.hasUserMessage)
        .sort((left, right) =>
            new Date(right.lastActivityOn).getTime() -
            new Date(left.lastActivityOn).getTime()
        )
        .slice(0, 20);
    select.replaceChildren(new Option("Recent conversations", ""));
    for (const conversation of conversations) {
        select.add(new Option(
            formatConversationOption(conversation),
            conversation.id,
            false,
            conversation.id === selected
        ));
    }
    select.disabled = conversations.length === 0 || resetInProgress;
    deleteButton.disabled = resetInProgress ||
        !selected ||
        !recentConversations.has(selected);
}

function onConversationReferenceChanged(reference: SidecarConversationReference): void {
    activeConversationReference = reference;
    if (reference.hasUserMessage) {
        recentConversations.set(reference.id, reference);
    } else {
        recentConversations.delete(reference.id);
    }
    renderRecentConversationOptions(reference.id);
    setHistoryStatus(
        reference.hasUserMessage ? "Conversation saved." : "Conversation ready."
    );
}

function handleSessionReferenceChanged(
    generation: number,
    reference: SidecarConversationReference
): void {
    if (deletedConversationIds.has(reference.id)) {
        return;
    }
    if (reference.hasUserMessage) {
        recentConversations.set(reference.id, reference);
    } else {
        recentConversations.delete(reference.id);
    }
    if (generation === activeConversationGeneration) {
        onConversationReferenceChanged(reference);
        return;
    }
    renderRecentConversationOptions(activeConversationReference?.id);
}

function reportConversationHistoryError(error: unknown): void {
    const code = getSafeErrorCode(error);
    setHistoryStatus(`History unavailable (${code}).`, true);
}

async function configureConversationPersistence(
    configuration: SidecarConfiguration
): Promise<void> {
    activeConversationRepository = null;
    activeConversationScope = null;
    activeConversationReference = null;
    recentConversations = new Map();
    deletedConversationIds = new Set();

    if (!configuration.configurationId) {
        renderRecentConversationOptions();
        setHistoryStatus("History is unavailable for fallback configuration.", true);
        return;
    }

    try {
        const { repository, ownerId } = createHostConversationRepository();
        activeConversationRepository = repository;
        activeConversationScope = {
            ownerId,
            configurationId: configuration.configurationId,
            appId: configuration.appId,
            agentSchemaName: configuration.agentSchemaName
        };
        const conversations = await repository.listRecent(activeConversationScope);
        recentConversations = new Map(
            conversations.map(conversation => [conversation.id, conversation])
        );
        renderRecentConversationOptions();
        setHistoryStatus(
            conversations.length > 0
                ? `${conversations.length} recent conversation${conversations.length === 1 ? "" : "s"}.`
                : "Conversation history is ready."
        );
    } catch (error) {
        renderRecentConversationOptions();
        reportConversationHistoryError(error);
    }
}

function getMsalClient(configuration: SidecarConfiguration): PublicClientApplication {
    if (!msalClient) {
        msalClient = new PublicClientApplication({
            auth: {
                clientId: configuration.clientId,
                authority: `https://login.microsoftonline.com/${configuration.tenantId}`,
                redirectUri: `${window.location.origin}${configuration.redirectPath}`
            },
            cache: {
                cacheLocation: "localStorage"
            }
        });
    }
    return msalClient;
}

async function initializeMsal(configuration: SidecarConfiguration): Promise<PublicClientApplication> {
    const client = getMsalClient(configuration);
    if (!msalInitialized) {
        await client.initialize();
        let redirectResult: AuthenticationResult | null = null;
        try {
            redirectResult = await client.handleRedirectPromise();
        } catch (error) {
            if (getSafeErrorCode(error) !== "no_token_request_cache_error") {
                throw error;
            }
        }
        if (redirectResult?.account) {
            client.setActiveAccount(redirectResult.account);
        }
        msalInitialized = true;
    }
    return client;
}

function getCachedAccount(client: PublicClientApplication): AccountInfo | undefined {
    return client.getActiveAccount() ?? client.getAllAccounts()[0];
}

/**
 * Completes an interactive sign-in without relying on MSAL's popup broadcast
 * bridge. Dynamics serves web resources with a Cross-Origin-Opener-Policy that
 * severs the BroadcastChannel/opener link the bridge needs, which leaves the
 * popup stuck on "Completing sign-in". Instead we open the dedicated redirect
 * page as a self-contained MSAL redirect client and hand the result back through
 * same-origin localStorage, which COOP and storage partitioning do not break for
 * a first-party context.
 */
async function runInteractiveSignIn(configuration: SidecarConfiguration): Promise<void> {
    const redirectUri = `${window.location.origin}${configuration.redirectPath}`;
    const nonce = crypto.randomUUID();
    const resultKey = `${AUTH_RESULT_PREFIX}${nonce}`;
    window.localStorage.setItem(AUTH_REQUEST_KEY, JSON.stringify({
        clientId: configuration.clientId,
        authority: `https://login.microsoftonline.com/${configuration.tenantId}`,
        redirectUri,
        scope: configuration.scope,
        nonce
    }));
    window.localStorage.removeItem(resultKey);

    const popup = window.open(
        `${redirectUri}?sidecarAuth=start&nonce=${encodeURIComponent(nonce)}`,
        "maftagsc-sidecar-auth",
        "width=520,height=680"
    );
    if (!popup) {
        throw new Error("The sign-in window was blocked. Allow pop-ups for this site and try again.");
    }

    try {
        await new Promise<void>((resolve, reject) => {
            const deadline = Date.now() + 5 * 60 * 1000;
            const timer = window.setInterval(() => {
                const value = window.localStorage.getItem(resultKey);
                if (value === "ok") {
                    window.clearInterval(timer);
                    resolve();
                    return;
                }
                if (value && value.startsWith("error:")) {
                    window.clearInterval(timer);
                    reject(new Error(value.slice("error:".length) || "Sign-in failed."));
                    return;
                }
                // Note: we deliberately do not treat popup.closed as cancellation.
                // Dynamics serves web resources with a Cross-Origin-Opener-Policy
                // that severs the opener link, so the returned popup handle can
                // report closed === true while the window is still open. Relying on
                // it produced a false "canceled" error the moment the popup opened.
                if (Date.now() > deadline) {
                    window.clearInterval(timer);
                    reject(new Error("Sign-in timed out. Please try again."));
                }
            }, 300);
        });
    } finally {
        window.localStorage.removeItem(resultKey);
        try {
            if (!popup.closed) {
                popup.close();
            }
        } catch {
            /* handle may be severed by COOP; the popup closes itself on success */
        }
    }
}

async function acquireToken(
    interactive: boolean,
    configuration: SidecarConfiguration
): Promise<string | null> {
    const client = await initializeMsal(configuration);
    const account = getCachedAccount(client);

    if (account) {
        client.setActiveAccount(account);
        try {
            const result = await client.acquireTokenSilent({
                scopes: [configuration.scope],
                account
            });
            return result.accessToken;
        } catch (error) {
            if (!interactive && error instanceof InteractionRequiredAuthError) {
                return null;
            }
            if (!interactive) {
                throw error;
            }
        }
    } else if (!interactive) {
        return null;
    }

    await runInteractiveSignIn(configuration);

    // The popup completed the authorization-code exchange in its own MSAL
    // instance that shares this origin's localStorage. This instance may not
    // observe the newly cached account the instant the handshake resolves, so
    // poll acquireTokenSilent briefly before giving up. (The manual "try again"
    // only worked because the account had become visible by the second click.)
    let lastError: unknown;
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const signedInAccount = getCachedAccount(client);
        if (signedInAccount) {
            client.setActiveAccount(signedInAccount);
            try {
                const result = await client.acquireTokenSilent({
                    scopes: [configuration.scope],
                    account: signedInAccount
                });
                return result.accessToken;
            } catch (error) {
                lastError = error;
            }
        }
        await delay(120);
    }
    throw lastError instanceof Error
        ? lastError
        : new Error("Sign-in did not complete. Please try again.");
}

function getScreenName(
    context: LaunchContext,
    configuration: SidecarConfiguration
): string {
    const recordScreen = getEntityBinding(configuration, context.entityName)?.screenName ??
        configuration.defaultScreenName;
    return context.pageType === "entitylist"
        ? recordScreen.replace(/ record form$/, " list")
        : recordScreen;
}

function createContextEnvelope(
    context: LaunchContext,
    userText: string,
    configuration: SidecarConfiguration
): string {
    const recordDescription = context.recordName
        ? ` The open record is named "${context.recordName}".`
        : "";

    return [
        `[Trusted ${configuration.contextLabel} context]`,
        `The user is currently on the ${getScreenName(context, configuration)}.${recordDescription}`,
        `App ID: ${context.appId ?? "unavailable"}`,
        `Page type: ${context.pageType}`,
        `Table: ${context.entityName}`,
        `Record ID: ${context.recordId ?? "unavailable"}`,
        formatUserRolesLine(context.roles),
        "Treat the roles as background context to tailor tone and guidance only. They do not grant access — never reveal information the user cannot already access.",
        "Use this exact screen as the primary context for navigation and how-to questions. Do not infer or substitute a different screen.",
        "[End trusted app context]",
        "",
        userText
    ].join("\n");
}

function createContextStore(
    webChat: WebChatApi,
    getContext: () => LaunchContext,
    configuration: SidecarConfiguration,
    sendContextOnConnect: boolean,
    persistence: SidecarConversationSession | null,
    getConversationId: () => string | undefined
): WebChatStore {
    return webChat.createStore({}, ({ dispatch }) => next => action => {
        if (
            (sendContextOnConnect && action.type === "DIRECT_LINE/CONNECT_FULFILLED") ||
            action.type === "WEB_CHAT/SEND_MESSAGE"
        ) {
            const context = getContext();
            dispatch({
                type: "WEB_CHAT/SEND_EVENT",
                payload: {
                    name: "pvaSetContext",
                    value: {
                        CurrentAppId: context.appId,
                        CurrentPageType: context.pageType,
                        CurrentScreen: getScreenName(context, configuration),
                        CurrentTable: context.entityName,
                        CurrentRecordId: context.recordId,
                        CurrentRecordName: context.recordName,
                        CurrentUserRoles: serializeUserRoles(context.roles)
                    }
                }
            });
        }

        const activity = action.payload?.activity;
        const originalText = activity?.channelData?.[ORIGINAL_TEXT_KEY];
        const isReplay = activity?.channelData?.[REPLAY_ACTIVITY_KEY] === true;
        if (
            action.type === "DIRECT_LINE/INCOMING_ACTIVITY" &&
            activity?.type === "message" &&
            !isReplay
        ) {
            const displayText = typeof originalText === "string"
                ? originalText.trim()
                : activity.text?.trim();
            if (displayText) {
                const draft: SidecarConversationActivityDraft = {
                    activityId: String(activity.id ?? crypto.randomUUID()),
                    role: typeof originalText === "string" ||
                        activity.from?.role === "user"
                        ? "user"
                        : "assistant",
                    activityType: "message",
                    text: displayText,
                    timestamp: String(activity.timestamp ?? new Date().toISOString())
                };
                persistence?.observe(draft, getConversationId());
            }
        }
        if (action.type === "DIRECT_LINE/INCOMING_ACTIVITY" && !isReplay) {
            persistence?.attachConversationId(getConversationId());
        }

        if (
            action.type === "DIRECT_LINE/INCOMING_ACTIVITY" &&
            activity?.type === "message" &&
            typeof originalText === "string"
        ) {
            action = {
                ...action,
                payload: {
                    ...action.payload,
                    activity: {
                        ...activity,
                        text: originalText
                    }
                }
            };
        }

        return next(action);
    });
}

function replayConversationActivities(
    store: WebChatStore,
    conversation: SidecarConversationReference,
    activities: readonly SidecarConversationActivity[]
): void {
    const replaySequenceOffset = activities.reduce(
        (highest, activity) => Math.max(highest, activity.sequence),
        0
    ) + 1;
    for (const activity of activities) {
        store.dispatch({
            type: "DIRECT_LINE/INCOMING_ACTIVITY",
            payload: {
                activity: {
                    id: activity.activityId,
                    type: "message",
                    text: activity.text,
                    timestamp: activity.timestamp,
                    channelId: "copilotstudio",
                    conversation: { id: conversation.conversationId },
                    from: activity.role === "user"
                        ? { id: "user", name: "You", role: "user" }
                        : { id: "agent", name: "Agent", role: "bot" },
                    channelData: {
                        [REPLAY_ACTIVITY_KEY]: true,
                        "webchat:sequence-id":
                            activity.sequence - replaySequenceOffset
                    }
                }
            }
        });
    }
}

function resetWebChatHost(): HTMLElement {
    const current = getRequiredElement<HTMLElement>("webchat");
    const replacement = document.createElement("div");
    replacement.id = "webchat";
    current.replaceWith(replacement);
    return replacement;
}

async function renderConversation(
    token: string,
    context: LaunchContext,
    configuration: SidecarConfiguration,
    sendContextOnConnect = false,
    resumeConversation?: SidecarConversationReference
): Promise<void> {
    if (
        !window.WebChat ||
        typeof window.WebChat.createStore !== "function" ||
        typeof window.WebChat.renderWebChat !== "function"
    ) {
        throw new Error("The chat client couldn't be loaded.");
    }

    const generation = ++activeConversationGeneration;
    const settings = new ConnectionSettings({
        directConnectUrl: configuration.agentConnectionString
    });
    const client = new CopilotStudioClient(settings, token);
    const connection = CopilotStudioWebChat.createConnection(client, {
        showTyping: true,
        conversationId: resumeConversation?.conversationId
    });
    let persistedActivities: SidecarConversationActivity[] = [];
    const persistence = activeConversationRepository && activeConversationScope
        ? new SidecarConversationSession(
            activeConversationRepository,
            activeConversationScope,
            {
                tableName: context.entityName,
                recordId: context.recordId,
                recordName: context.recordName
            },
            reference => handleSessionReferenceChanged(generation, reference),
            error => {
                if (generation === activeConversationGeneration) {
                    reportConversationHistoryError(error);
                }
            }
        )
        : null;
    if (resumeConversation && persistence && activeConversationRepository) {
        persistedActivities = await activeConversationRepository.listActivities(
            resumeConversation.id
        );
        persistence.restore(resumeConversation, persistedActivities);
    }
    const originalPostActivity = connection.postActivity.bind(connection);
    connection.postActivity = (activity: Activity) => {
        const originalText = activity.type === "message"
            ? activity.text?.trim()
            : undefined;
        if (!originalText) {
            return originalPostActivity(activity);
        }

        const currentContext = resolveContext(activeContext ?? context, configuration);
        activeContext = currentContext;

        return originalPostActivity({
            ...activity,
            text: createContextEnvelope(currentContext, originalText, configuration),
            channelData: {
                ...activity.channelData,
                [ORIGINAL_TEXT_KEY]: originalText
            }
        } as Activity);
    };
    const store = createContextStore(window.WebChat, () => {
        const currentContext = resolveContext(activeContext ?? context, configuration);
        activeContext = currentContext;
        return currentContext;
    }, configuration, sendContextOnConnect, persistence, () => connection.conversationId);

    const chat = getRequiredElement<HTMLElement>("chat");
    const webChat = getRequiredElement<HTMLElement>("webchat");
    getRequiredElement<HTMLElement>("status").hidden = true;
    chat.hidden = false;

    window.WebChat.renderWebChat({
        directLine: connection,
        store,
        styleOptions: {
            accent: "#0f6cbd",
            backgroundColor: "#fafafa",
            primaryFont: "\"Segoe UI\", \"Segoe UI Web (West European)\", -apple-system, system-ui, Roboto, \"Helvetica Neue\", sans-serif",
            bubbleBackground: "#f5f5f5",
            bubbleFromUserBackground: "#deecf9",
            hideUploadButton: true
        }
    }, webChat);
    if (resumeConversation) {
        replayConversationActivities(store, resumeConversation, persistedActivities);
    }

    activeConnection = connection;
    activeToken = token;
    activeContext = context;
    activeConfiguration = configuration;
    activeConversationReference = resumeConversation ?? null;
    if (resumeConversation) {
        renderRecentConversationOptions(resumeConversation.id);
        setHistoryStatus(`Resumed ${resumeConversation.title}.`);
    } else {
        renderRecentConversationOptions();
    }
    persistence?.attachConversationId(connection.conversationId);
    chat.focus();
}

async function startNewConversation(): Promise<void> {
    if (resetInProgress || !activeToken || !activeContext || !activeConfiguration) {
        return;
    }
    if (!window.confirm(
        "Start a new conversation? The current chat will remain available under Recent conversations."
    )) {
        return;
    }

    resetInProgress = true;
    const button = getRequiredElement<HTMLButtonElement>("new-conversation");
    button.disabled = true;
    button.textContent = "Starting…";

    try {
        activeConnection?.end();
        activeConnection = null;
        resetWebChatHost();
        await renderConversation(
            activeToken,
            resolveContext(activeContext, activeConfiguration),
            activeConfiguration,
            true
        );
    } catch (error) {
        getRequiredElement<HTMLElement>("chat").hidden = true;
        getRequiredElement<HTMLElement>("status").hidden = false;
        showError(error);
    } finally {
        button.disabled = false;
        button.textContent = "New conversation";
        resetInProgress = false;
    }
}

async function resumeConversation(conversationRecordId: string): Promise<void> {
    if (
        resetInProgress ||
        !activeToken ||
        !activeContext ||
        !activeConfiguration ||
        !conversationRecordId
    ) {
        return;
    }
    const conversation = recentConversations.get(conversationRecordId);
    if (!conversation || conversation.id === activeConversationReference?.id) {
        return;
    }

    resetInProgress = true;
    const button = getRequiredElement<HTMLButtonElement>("new-conversation");
    const select = getRequiredElement<HTMLSelectElement>("recent-conversations");
    button.disabled = true;
    select.disabled = true;
    setHistoryStatus(`Resuming ${conversation.title}…`);

    try {
        activeConnection?.end();
        activeConnection = null;
        resetWebChatHost();
        await renderConversation(
            activeToken,
            resolveContext(activeContext, activeConfiguration),
            activeConfiguration,
            false,
            conversation
        );
    } catch (error) {
        reportConversationHistoryError(error);
        renderRecentConversationOptions(activeConversationReference?.id);
    } finally {
        button.disabled = false;
        resetInProgress = false;
        renderRecentConversationOptions(activeConversationReference?.id);
    }
}

async function deleteSelectedConversation(): Promise<void> {
    if (
        resetInProgress ||
        !activeToken ||
        !activeContext ||
        !activeConfiguration ||
        !activeConversationRepository
    ) {
        return;
    }
    const select = getRequiredElement<HTMLSelectElement>("recent-conversations");
    const conversation = recentConversations.get(select.value);
    if (!conversation) {
        return;
    }
    if (!window.confirm(
        `Delete "${conversation.title}"? This permanently removes the conversation and its saved messages.`
    )) {
        return;
    }

    resetInProgress = true;
    const newButton = getRequiredElement<HTMLButtonElement>("new-conversation");
    const deleteButton = getRequiredElement<HTMLButtonElement>("delete-conversation");
    newButton.disabled = true;
    deleteButton.disabled = true;
    select.disabled = true;
    setHistoryStatus(`Deleting ${conversation.title}…`);
    let deleted = false;
    const deletingActiveConversation = activeConversationReference?.id === conversation.id;
    deletedConversationIds.add(conversation.id);
    if (deletingActiveConversation) {
        activeConnection?.end();
        activeConnection = null;
        activeConversationGeneration += 1;
        getRequiredElement<HTMLElement>("webchat").setAttribute("inert", "");
    }

    try {
        await activeConversationRepository.deleteConversation(conversation.id);
        deleted = true;
        recentConversations.delete(conversation.id);

        if (deletingActiveConversation) {
            activeConversationReference = null;
            resetWebChatHost();
            await renderConversation(
                activeToken,
                resolveContext(activeContext, activeConfiguration),
                activeConfiguration
            );
        }
        setHistoryStatus("Conversation deleted.");
    } catch (error) {
        if (deleted) {
            getRequiredElement<HTMLElement>("chat").hidden = true;
            getRequiredElement<HTMLElement>("status").hidden = false;
            showError(error);
        } else {
            deletedConversationIds.delete(conversation.id);
            if (deletingActiveConversation) {
                try {
                    resetWebChatHost();
                    await renderConversation(
                        activeToken,
                        resolveContext(activeContext, activeConfiguration),
                        activeConfiguration,
                        false,
                        conversation
                    );
                    setHistoryStatus(
                        "The conversation could not be deleted and was restored.",
                        true
                    );
                } catch (restoreError) {
                    getRequiredElement<HTMLElement>("chat").hidden = true;
                    getRequiredElement<HTMLElement>("status").hidden = false;
                    showError(restoreError);
                }
            } else {
                reportConversationHistoryError(error);
            }
        }
    } finally {
        resetInProgress = false;
        newButton.disabled = false;
        renderRecentConversationOptions(activeConversationReference?.id);
    }
}

async function start(interactive: boolean): Promise<void> {
    if (startInProgress) {
        return;
    }

    startInProgress = true;
    const signIn = getRequiredElement<HTMLButtonElement>("sign-in");
    signIn.hidden = true;
    setStatus(interactive ? "Signing you in…" : "Starting a secure conversation…");

    try {
        const { configuration, context } = await parseLaunchRequest();
        applyPaneTitle(configuration.paneTitle);
        const token = await acquireToken(interactive, configuration);
        if (!token) {
            showSignIn();
            return;
        }
        await configureConversationPersistence(configuration);
        await renderConversation(token, context, configuration);
    } catch (error) {
        // Never expose token, account, response, or HR context details in the UI or browser logs.
        showError(error);
    } finally {
        startInProgress = false;
    }
}

function initialize(): void {
    getRequiredElement<HTMLButtonElement>("sign-in").addEventListener("click", () => {
        void start(true);
    });
    getRequiredElement<HTMLButtonElement>("new-conversation").addEventListener("click", () => {
        void startNewConversation();
    });
    getRequiredElement<HTMLButtonElement>("delete-conversation").addEventListener("click", () => {
        void deleteSelectedConversation();
    });
    getRequiredElement<HTMLSelectElement>("recent-conversations").addEventListener(
        "change",
        event => {
            const select = event.currentTarget as HTMLSelectElement;
            void resumeConversation(select.value);
        }
    );
    void start(false);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
    initialize();
}
