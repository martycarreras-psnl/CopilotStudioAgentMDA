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
import { from, of, switchMap, tap } from "rxjs";
import { sidecarConfigurationRepository } from "./hrSidecarBootstrap";
import { createConnectorConsentTracker } from "./sidecarConnectorConsent";
import {
    getEntityBinding,
    isFormBound,
    normalizeGuid,
    resolveSidecarConfiguration,
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
    normalizeUserRoles
} from "./sidecarUserRoles";
import {
    createAllRecordsSelection,
    createCurrentViewSelection,
    formatListAnalysisContext,
    isListAnalysisRequest,
    type ListAnalysisScope,
    type ListAnalysisSelection
} from "./sidecarListAnalysis";
import { resolveOutgoingContext } from "./sidecarOutgoingContext";
import {
    getConversationContextMismatch,
    type ConversationContextMismatch
} from "./sidecarConversationContext";

const ORIGINAL_TEXT_KEY = "hrSidecarOriginalText";
const REPLAY_ACTIVITY_KEY = "maftagscSidecarReplay";
const LIST_ANALYSIS_SELECTION_KEY = "maftagscListAnalysisSelection";
const VALIDATED_CONTEXT_KEY = "maftagscValidatedContext";
const AUTH_RESULT_PREFIX = "maftagsc.sidecar.authResult.";
const PANE_VISIBILITY_SYNC_INTERVAL_MS = 500;

interface LaunchContext {
    pageType: "entityrecord" | "entitylist";
    entityName: string;
    formId: string | null;
    recordId: string | null;
    recordName: string;
    appId: string | null;
    roles: string[];
    viewId: string | null;
    viewType: "savedquery" | "userquery" | null;
}

interface LaunchRequest {
    configuration: SidecarConfiguration;
    context: LaunchContext;
}

interface HostPageInput {
    pageType?: unknown;
    entityName?: unknown;
    entityId?: unknown;
    viewId?: unknown;
    viewType?: unknown;
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
        ui?: {
            formSelector?: {
                getCurrentItem?(): {
                    getId?(): unknown;
                } | null;
            };
        };
    };
    WebApi?: {
        retrieveRecord(
            entityLogicalName: string,
            id: string,
            options?: string
        ): Promise<Record<string, unknown>>;
    };
    App?: {
        sidePanes?: {
            getPane(paneId: string): {
                hidden: boolean;
            } | undefined;
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
        text?: unknown;
        channelData?: Record<string, unknown>;
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
let paneConfiguration: SidecarConfiguration | null = null;
let conversationContextMismatch: ConversationContextMismatch | null = null;
let acknowledgedConversationContextKey: string | null = null;

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

    const configurationId = normalizeGuid(value.configurationId);
    const appId = normalizeGuid(value.appId);
    const paneId = String(value.paneId ?? "");
    const configuration = await resolveSidecarConfiguration(
        configurationId,
        appId,
        paneId,
        sidecarConfigurationRepository
    );
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
            formId: value.pageType === "entitylist" ? null : normalizeGuid(value.formId),
            recordId,
            recordName: String(value.recordName || "").slice(0, 200),
            appId,
            roles: normalizeUserRoles(value.roles),
            viewId: null,
            viewType: null
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
        if (!pageType) {
            return fallback;
        }
        if (!getEntityBinding(configuration, entityName)) {
            throw new Error("sidecar_form_not_bound");
        }

        const recordId = pageType === "entityrecord" ? normalizeGuid(input?.entityId) : null;
        const formId = pageType === "entityrecord"
            ? normalizeGuid(hostXrm?.Page?.ui?.formSelector?.getCurrentItem?.()?.getId?.())
            : null;
        if (pageType === "entityrecord" && !isFormBound(configuration, entityName, formId)) {
            throw new Error("sidecar_form_not_bound");
        }
        const viewId = pageType === "entitylist" ? normalizeGuid(input?.viewId) : null;
        const viewType = pageType === "entitylist" &&
            (input?.viewType === "savedquery" || input?.viewType === "userquery")
            ? input.viewType
            : null;
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
            formId,
            recordId,
            recordName: currentRecordName ?? (isSameRecord ? fallback.recordName : ""),
            appId: fallback.appId,
            roles: fallback.roles,
            viewId,
            viewType
        };
    } catch (error) {
        if (error instanceof Error && error.message === "sidecar_form_not_bound") {
            throw error;
        }
        return fallback;
    }
}

// The launcher writes authoritative form context on every form load. List pages
// have no equivalent form event, so a supported live entity-list context may
// override this same-origin fallback while record pages continue to prefer it.
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
            formId: pageType === "entityrecord" ? normalizeGuid(parsed.formId) : null,
            recordId: parsed.recordId ? normalizeGuid(parsed.recordId) : null,
            recordName: typeof parsed.recordName === "string" ? parsed.recordName.slice(0, 200) : "",
            appId: parsed.appId ?? fallback.appId,
            roles: parsed.roles !== undefined ? normalizeUserRoles(parsed.roles) : fallback.roles,
            viewId: parsed.viewId ? normalizeGuid(parsed.viewId) : null,
            viewType: parsed.viewType === "savedquery" || parsed.viewType === "userquery"
                ? parsed.viewType
                : null
        };
    } catch {
        return null;
    }
}

function resolveContext(
    fallback: LaunchContext,
    configuration: SidecarConfiguration
): LaunchContext {
    const sharedContext = readSharedContext(configuration, fallback);
    const stableContext = sharedContext ?? fallback;
    const liveContext = getCurrentContext(stableContext, configuration);
    const resolved = !sharedContext || liveContext.pageType === "entitylist"
        ? liveContext
        : sharedContext;
    if (
        resolved.pageType === "entityrecord" &&
        !isFormBound(configuration, resolved.entityName, resolved.formId)
    ) {
        throw new Error("sidecar_form_not_bound");
    }
    return resolved;
}

function requestListAnalysisScope(currentViewAvailable: boolean): Promise<ListAnalysisScope | null> {
    const dialog = getRequiredElement<HTMLDialogElement>("list-scope-dialog");
    if (dialog.open) {
        return Promise.resolve(null);
    }
    const currentViewButton = getRequiredElement<HTMLButtonElement>("list-scope-current");
    const currentViewUnavailable = getRequiredElement<HTMLElement>(
        "list-scope-current-unavailable"
    );
    currentViewButton.disabled = !currentViewAvailable;
    currentViewUnavailable.hidden = currentViewAvailable;

    return new Promise((resolve) => {
        const controller = new AbortController();
        const finish = (scope: ListAnalysisScope | null) => {
            controller.abort();
            dialog.close();
            resolve(scope);
        };
        const options = { signal: controller.signal };

        currentViewButton.addEventListener("click", () => finish("currentView"), options);
        getRequiredElement<HTMLButtonElement>("list-scope-all")
            .addEventListener("click", () => finish("allRecords"), options);
        getRequiredElement<HTMLButtonElement>("list-scope-cancel")
            .addEventListener("click", () => finish(null), options);
        dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            finish(null);
        }, options);
        dialog.showModal();
        (currentViewAvailable
            ? currentViewButton
            : getRequiredElement<HTMLButtonElement>("list-scope-all")
        ).focus();
    });
}

async function resolveListAnalysisSelection(
    context: LaunchContext,
    scope: ListAnalysisScope
): Promise<ListAnalysisSelection> {
    if (scope === "allRecords") {
        return createAllRecordsSelection(context.entityName);
    }

    if (!context.viewId || !context.viewType) {
        throw new Error("current_view_context_unavailable");
    }
    const hostXrm = getHostXrm();
    if (!hostXrm?.WebApi?.retrieveRecord) {
        throw new Error("current_view_context_unavailable");
    }

    const view = await hostXrm.WebApi.retrieveRecord(
        context.viewType,
        context.viewId,
        "?$select=name,fetchxml"
    );
    return createCurrentViewSelection(
        context.entityName,
        context.viewId,
        context.viewType,
        view.name,
        view.fetchxml
    );
}

function parseListAnalysisSelection(value: unknown): ListAnalysisSelection | null {
    try {
        if (!value || typeof value !== "object") {
            return null;
        }
        const candidate = value as Record<string, unknown>;
        const tableLogicalName = String(candidate.tableLogicalName ?? "").trim().toLowerCase();
        if (
            (candidate.scope !== "currentView" && candidate.scope !== "allRecords") ||
            candidate.tableLogicalName !== tableLogicalName
        ) {
            return null;
        }
        if (candidate.scope === "allRecords") {
            return createAllRecordsSelection(tableLogicalName);
        }

        const viewId = normalizeGuid(candidate.viewId);
        if (
            !viewId ||
            (candidate.viewType !== "savedquery" && candidate.viewType !== "userquery") ||
            typeof candidate.fetchXml !== "string" ||
            !candidate.fetchXml.trim()
        ) {
            return null;
        }
        return createCurrentViewSelection(
            tableLogicalName,
            viewId,
            candidate.viewType,
            candidate.viewName,
            candidate.fetchXml
        );
    } catch {
        return null;
    }
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
        : "message" in error
            ? String(error.message)
        : "name" in error
            ? String(error.name)
            : "unknown_error";
    return /^[a-z0-9_.-]{1,80}$/i.test(candidate) ? candidate : "unknown_error";
}

const INTERACTIVE_SIGN_IN_ERROR_CODES = new Set([
    "consent_required",
    "interaction_required",
    "login_required",
    "monitor_window_timeout",
    "silent_sso_error",
    "timed_out"
]);
const SEND_BOX_RESTORE_DELAY_MS = 120;

function shouldOfferInteractiveSignIn(error: unknown): boolean {
    return error instanceof InteractionRequiredAuthError
        || INTERACTIVE_SIGN_IN_ERROR_CODES.has(getSafeErrorCode(error));
}

function showError(error: unknown): void {
    const code = getSafeErrorCode(error);
    setStatus(
        code === "popup_blocked"
            ? "The sign-in window was blocked. Allow pop-ups for this site and try again."
            : `The guide couldn't start (${code}). Try again or contact an administrator.`,
        true
    );
    const retry = getRequiredElement<HTMLButtonElement>("sign-in");
    retry.textContent = "Try again";
    retry.hidden = false;
}

function setHistoryStatus(message: string, isError = false): void {
    const status = getRequiredElement<HTMLElement>("conversation-history-status");
    status.textContent = message;
    status.dataset.error = isError ? "true" : "false";
}

function setListAnalysisError(message?: string): void {
    const error = getRequiredElement<HTMLElement>("list-analysis-error");
    error.textContent = message ?? "";
    error.hidden = !message;
}

function renderConversationContextWarning(
    mismatch: ConversationContextMismatch | null
): void {
    conversationContextMismatch = mismatch;
    const warning = getRequiredElement<HTMLElement>("conversation-context-warning");
    const message = getRequiredElement<HTMLElement>("conversation-context-warning-message");
    const acknowledge = getRequiredElement<HTMLButtonElement>(
        "conversation-context-acknowledge"
    );
    const nextMessage = mismatch?.message ?? "";
    const nextWarningHidden = !mismatch;
    const nextAcknowledgeHidden =
        !mismatch || acknowledgedConversationContextKey === mismatch.key;
    if (warning.hidden !== nextWarningHidden) {
        warning.hidden = nextWarningHidden;
    }
    if (message.textContent !== nextMessage) {
        message.textContent = nextMessage;
    }
    if (acknowledge.hidden !== nextAcknowledgeHidden) {
        acknowledge.hidden = nextAcknowledgeHidden;
    }
}

function refreshConversationContextWarning(context: LaunchContext): void {
    renderConversationContextWarning(
        getConversationContextMismatch(
            activeConversationReference?.hasUserMessage
                ? activeConversationReference
                : null,
            context
        )
    );
}

function isCurrentPageBound(configuration: SidecarConfiguration): boolean | null {
    try {
        const hostXrm = getHostXrm();
        const utility = hostXrm?.Utility;
        if (!utility?.getPageContext) {
            return null;
        }
        const input = utility.getPageContext().input;
        const pageType =
            input?.pageType === "entityrecord" || input?.pageType === "entitylist"
                ? input.pageType
                : null;
        if (!pageType) {
            return false;
        }
        const entityName = String(input?.entityName ?? "").trim().toLowerCase();
        if (!getEntityBinding(configuration, entityName)) {
            return false;
        }
        if (pageType === "entitylist") {
            return true;
        }
        const formId = normalizeGuid(
            hostXrm?.Page?.ui?.formSelector?.getCurrentItem?.()?.getId?.()
        );
        return isFormBound(configuration, entityName, formId);
    } catch {
        return null;
    }
}

function syncPaneVisibility(): void {
    if (!paneConfiguration) {
        return;
    }
    const hostXrm = getHostXrm();
    const pane = hostXrm?.App?.sidePanes?.getPane(paneConfiguration.paneId);
    const isBound = isCurrentPageBound(paneConfiguration);
    const shouldHide = isBound === false;
    if (pane && isBound !== null && Boolean(pane.hidden) !== shouldHide) {
        pane.hidden = shouldHide;
    }
    if (isBound && activeConfiguration && activeContext) {
        try {
            refreshConversationContextWarning(
                resolveContext(activeContext, activeConfiguration)
            );
        } catch {
            renderConversationContextWarning(null);
        }
    } else if (isBound === false) {
        renderConversationContextWarning(null);
    }
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
function openInteractiveSignInWindow(): Window | null {
    const popup = window.open(
        "about:blank",
        `maftagsc-sidecar-auth-pending-${crypto.randomUUID()}`,
        "width=520,height=680"
    );
    if (popup) {
        try {
            popup.document.title = "Agent Sidecar sign-in";
            if (popup.document.body) {
                popup.document.body.textContent = "Preparing sign-in…";
            }
        } catch {
            /* navigation still proceeds if the browser restricts the blank window */
        }
    }
    return popup;
}

function closeInteractiveSignInWindow(popup?: Window): void {
    if (!popup) {
        return;
    }
    try {
        if (!popup.closed) {
            popup.close();
        }
    } catch {
        /* the Entra redirect can sever the popup handle before it closes itself */
    }
}

async function runInteractiveSignIn(
    configuration: SidecarConfiguration,
    popup: Window
): Promise<void> {
    if (!configuration.configurationId) {
        throw new Error("sidecar_configuration_id_invalid");
    }
    const redirectUri = `${window.location.origin}${configuration.redirectPath}`;
    const nonce = crypto.randomUUID();
    const authNamespace = `${configuration.configurationId}.${nonce}`;
    const requestKey = `maftagsc.sidecar.authRequest.${authNamespace}`;
    const resultKey = `${AUTH_RESULT_PREFIX}${nonce}`;
    window.localStorage.setItem(requestKey, JSON.stringify({
        configurationId: configuration.configurationId,
        clientId: configuration.clientId,
        authority: `https://login.microsoftonline.com/${configuration.tenantId}`,
        redirectUri,
        scope: configuration.scope,
        nonce
    }));
    window.localStorage.removeItem(resultKey);

    popup.location.replace(
        `${redirectUri}?sidecarAuth=start&configurationId=${encodeURIComponent(configuration.configurationId)}&nonce=${encodeURIComponent(nonce)}`
    );

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
        window.localStorage.removeItem(requestKey);
        window.localStorage.removeItem(resultKey);
        closeInteractiveSignInWindow(popup);
    }
}

async function acquireToken(
    interactive: boolean,
    configuration: SidecarConfiguration,
    popup?: Window
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
            closeInteractiveSignInWindow(popup);
            return result.accessToken;
        } catch (error) {
            if (!interactive && shouldOfferInteractiveSignIn(error)) {
                return null;
            }
            if (!interactive) {
                throw error;
            }
        }
    } else if (!interactive) {
        return null;
    }

    if (!popup) {
        throw new Error("popup_blocked");
    }
    await runInteractiveSignIn(configuration, popup);

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
    configuration: SidecarConfiguration,
    listAnalysisSelection: ListAnalysisSelection | null
): string {
    const recordDescription = context.recordName
        ? ` The open record is named "${context.recordName}".`
        : "";
    const listAnalysisContext = listAnalysisSelection
        ? ["", ...formatListAnalysisContext(listAnalysisSelection)]
        : [];

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
        ...listAnalysisContext,
        "",
        userText
    ].join("\n");
}

function parseValidatedContext(value: unknown): LaunchContext | null {
    if (typeof value !== "string") {
        return null;
    }
    try {
        const parsed = JSON.parse(value) as Partial<LaunchContext>;
        const pageType =
            parsed.pageType === "entityrecord" || parsed.pageType === "entitylist"
                ? parsed.pageType
                : null;
        const entityName = String(parsed.entityName ?? "").trim().toLowerCase();
        if (!pageType || !entityName) {
            return null;
        }
        return {
            pageType,
            entityName,
            formId: pageType === "entityrecord" ? normalizeGuid(parsed.formId) : null,
            recordId: pageType === "entityrecord" ? normalizeGuid(parsed.recordId) : null,
            recordName: String(parsed.recordName ?? "").slice(0, 200),
            appId: normalizeGuid(parsed.appId),
            roles: normalizeUserRoles(parsed.roles),
            viewId: pageType === "entitylist" ? normalizeGuid(parsed.viewId) : null,
            viewType: pageType === "entitylist" &&
                (parsed.viewType === "savedquery" || parsed.viewType === "userquery")
                ? parsed.viewType
                : null
        };
    } catch {
        return null;
    }
}

function createContextStore(
    webChat: WebChatApi,
    persistence: SidecarConversationSession | null,
    getConversationId: () => string | undefined,
    getCurrentLaunchContext: () => LaunchContext
): WebChatStore {
    return webChat.createStore({}, api => next => action => {
        const outgoingText = action.type === "WEB_CHAT/SEND_MESSAGE" &&
            typeof action.payload?.text === "string"
            ? action.payload.text.trim()
            : "";
        const confirmedSelection = parseListAnalysisSelection(
            action.payload?.channelData?.[LIST_ANALYSIS_SELECTION_KEY]
        );
        const outgoingContext = outgoingText
            ? resolveOutgoingContext(getCurrentLaunchContext)
            : null;
        if (outgoingContext && !outgoingContext.ok) {
            window.setTimeout(() => {
                api.dispatch({
                    type: "WEB_CHAT/SET_SEND_BOX",
                    payload: { text: outgoingText }
                });
            }, SEND_BOX_RESTORE_DELAY_MS);
            setListAnalysisError(outgoingContext.message);
            return action;
        }
        if (outgoingContext?.ok) {
            setListAnalysisError();
            const mismatch = getConversationContextMismatch(
                activeConversationReference?.hasUserMessage
                    ? activeConversationReference
                    : null,
                outgoingContext.context
            );
            renderConversationContextWarning(mismatch);
            if (mismatch && acknowledgedConversationContextKey !== mismatch.key) {
                window.setTimeout(() => {
                    api.dispatch({
                        type: "WEB_CHAT/SET_SEND_BOX",
                        payload: { text: outgoingText }
                    });
                    getRequiredElement<HTMLButtonElement>(
                        "conversation-context-acknowledge"
                    ).focus();
                }, SEND_BOX_RESTORE_DELAY_MS);
                return action;
            }
        }
        if (outgoingContext?.ok && !confirmedSelection) {
            const currentContext = outgoingContext.context;
            if (
                currentContext.pageType === "entitylist" &&
                isListAnalysisRequest(outgoingText)
            ) {
                setListAnalysisError();
                const currentViewAvailable = Boolean(
                    currentContext.viewId &&
                    currentContext.viewType &&
                    getHostXrm()?.WebApi?.retrieveRecord
                );
                void requestListAnalysisScope(currentViewAvailable)
                    .then(async scope => {
                        if (!scope) {
                            api.dispatch({
                                type: "WEB_CHAT/SET_SEND_BOX",
                                payload: { text: outgoingText }
                            });
                            return;
                        }
                        const latestContext = getCurrentLaunchContext();
                        if (latestContext.pageType !== "entitylist") {
                            throw new Error("current_view_context_unavailable");
                        }
                        const selection = await resolveListAnalysisSelection(latestContext, scope);
                        api.dispatch({
                            ...action,
                            payload: {
                                ...action.payload,
                                channelData: {
                                    ...action.payload?.channelData,
                                    [LIST_ANALYSIS_SELECTION_KEY]: selection
                                }
                            }
                        });
                    })
                    .catch((error: unknown) => {
                        const code = getSafeErrorCode(error);
                        api.dispatch({
                            type: "WEB_CHAT/SET_SEND_BOX",
                            payload: { text: outgoingText }
                        });
                        setListAnalysisError(
                            `The list context could not be prepared (${code}). Your message was not sent.`
                        );
                    });
                return action;
            }
        }
        if (outgoingContext?.ok) {
            persistence?.lockOrigin({
                tableName: outgoingContext.context.entityName,
                recordId: outgoingContext.context.recordId,
                recordName: outgoingContext.context.recordName
            });
            action = {
                ...action,
                payload: {
                    ...action.payload,
                    channelData: {
                        ...action.payload?.channelData,
                        [VALIDATED_CONTEXT_KEY]: JSON.stringify(outgoingContext.context)
                    }
                }
            };
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
    const connectorConsentTracker = createConnectorConsentTracker();
    connection.postActivity = (activity: Activity) => {
        const consentClaim = connectorConsentTracker.claim(activity);
        if (consentClaim?.duplicate) {
            return of(String(activity.id ?? crypto.randomUUID()));
        }

        const postActivity = (forwardedActivity: Activity) => {
            try {
                const result = originalPostActivity(forwardedActivity);
                return consentClaim
                    ? result.pipe(tap({
                        error: () => connectorConsentTracker.release(consentClaim.key)
                    }))
                    : result;
            } catch (error) {
                if (consentClaim) {
                    connectorConsentTracker.release(consentClaim.key);
                }
                throw error;
            }
        };
        const originalText = activity.type === "message"
            ? activity.text?.trim()
            : undefined;
        const validatedContext = parseValidatedContext(
            activity.channelData?.[VALIDATED_CONTEXT_KEY]
        );
        return from(resolveSidecarConfiguration(
            configuration.configurationId,
            configuration.appId,
            configuration.paneId,
            sidecarConfigurationRepository
        )).pipe(
            switchMap(() => {
                if (!originalText) {
                    return postActivity(activity);
                }

                const currentContext = validatedContext ??
                    resolveContext(activeContext ?? context, configuration);
                activeContext = currentContext;
                const requestedListAnalysisSelection = parseListAnalysisSelection(
                    activity.channelData?.[LIST_ANALYSIS_SELECTION_KEY]
                );
                const listAnalysisSelection = requestedListAnalysisSelection &&
                    currentContext.pageType === "entitylist" &&
                    currentContext.entityName === requestedListAnalysisSelection.tableLogicalName
                    ? requestedListAnalysisSelection
                    : null;
                const forwardedChannelData = { ...activity.channelData };
                delete forwardedChannelData[LIST_ANALYSIS_SELECTION_KEY];
                delete forwardedChannelData[VALIDATED_CONTEXT_KEY];

                return postActivity({
                    ...activity,
                    text: createContextEnvelope(
                        currentContext,
                        originalText,
                        configuration,
                        listAnalysisSelection
                    ),
                    channelData: {
                        ...forwardedChannelData,
                        [ORIGINAL_TEXT_KEY]: originalText
                    }
                } as Activity);
            }),
            tap({
                error: () => {
                    if (consentClaim) {
                        connectorConsentTracker.release(consentClaim.key);
                    }
                }
            })
        );
    };
    const store = createContextStore(
        window.WebChat,
        persistence,
        () => connection.conversationId,
        () => resolveContext(activeContext ?? context, configuration)
    );

    const chat = getRequiredElement<HTMLElement>("chat");
    const webChat = getRequiredElement<HTMLElement>("webchat");
    getRequiredElement<HTMLElement>("status").hidden = true;
    chat.hidden = false;

    window.WebChat.renderWebChat({
        directLine: connection,
        store,
        styleOptions: {
            accent: "#007aff",
            backgroundColor: "#ffffff",
            primaryFont: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Segoe UI Web (West European)\", system-ui, Roboto, \"Helvetica Neue\", sans-serif",
            bubbleBackground: "#e9e9eb",
            bubbleBorderRadius: 18,
            bubbleBorderWidth: 0,
            bubbleNubSize: 0,
            bubbleTextColor: "#1c1c1e",
            bubbleFromUserBackground: "#007aff",
            bubbleFromUserBorderRadius: 18,
            bubbleFromUserBorderWidth: 0,
            bubbleFromUserNubSize: 0,
            bubbleFromUserTextColor: "#ffffff",
            sendBoxBackground: "#f2f2f7",
            sendBoxButtonColor: "#007aff",
            sendBoxButtonColorOnHover: "#0056b3",
            sendBoxTextColor: "#1c1c1e",
            timestampColor: "#8e8e93",
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
    acknowledgedConversationContextKey = null;
    refreshConversationContextWarning(context);
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
            activeConfiguration
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

async function start(interactive: boolean, popup?: Window): Promise<void> {
    if (startInProgress) {
        closeInteractiveSignInWindow(popup);
        return;
    }

    startInProgress = true;
    const signIn = getRequiredElement<HTMLButtonElement>("sign-in");
    signIn.hidden = true;
    setStatus(interactive ? "Signing you in…" : "Starting a secure conversation…");

    try {
        const { configuration, context } = await parseLaunchRequest();
        paneConfiguration = configuration;
        syncPaneVisibility();
        applyPaneTitle(configuration.paneTitle);
        const token = await acquireToken(interactive, configuration, popup);
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
        closeInteractiveSignInWindow(popup);
        startInProgress = false;
    }
}

function initialize(): void {
    getRequiredElement<HTMLButtonElement>("sign-in").addEventListener("click", () => {
        if (startInProgress) {
            return;
        }
        const popup = openInteractiveSignInWindow();
        void start(true, popup ?? undefined);
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
    getRequiredElement<HTMLButtonElement>(
        "conversation-context-acknowledge"
    ).addEventListener("click", () => {
        if (!conversationContextMismatch) {
            return;
        }
        acknowledgedConversationContextKey = conversationContextMismatch.key;
        renderConversationContextWarning(conversationContextMismatch);
        window.requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(
                "#webchat textarea, #webchat input"
            )?.focus();
        });
    });
    const visibilityTimer = window.setInterval(
        syncPaneVisibility,
        PANE_VISIBILITY_SYNC_INTERVAL_MS
    );
    window.addEventListener("unload", () => window.clearInterval(visibilityTimer), {
        once: true
    });
    void start(false);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
    initialize();
}
