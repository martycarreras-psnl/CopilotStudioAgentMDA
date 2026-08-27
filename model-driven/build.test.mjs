import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { inflateRawSync } from "node:zlib";

const sourceRoot = new URL("./webresources/maftagsc_/copilot/", import.meta.url);
const solutionRoot = new URL("../solution/WebResources/maftagsc_/copilot/", import.meta.url);
const codeAppDistRoot = new URL("../dist/", import.meta.url);

async function read(root, name) {
    return readFile(new URL(name, root), "utf8");
}

async function listFiles(root, prefix = "") {
    const entries = await readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const relativePath = `${prefix}${entry.name}`;
        if (entry.isDirectory()) {
            files.push(...await listFiles(new URL(`${entry.name}/`, root), `${relativePath}/`));
        } else {
            files.push(relativePath);
        }
    }
    return files;
}

function readZipEntries(zip) {
    const endSignature = 0x06054b50;
    let endOffset = -1;
    for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65557); offset -= 1) {
        if (zip.readUInt32LE(offset) === endSignature) {
            endOffset = offset;
            break;
        }
    }
    assert.notEqual(endOffset, -1, "ZIP end-of-central-directory record is missing");

    const entryCount = zip.readUInt16LE(endOffset + 10);
    let offset = zip.readUInt32LE(endOffset + 16);
    const entries = new Map();
    for (let index = 0; index < entryCount; index += 1) {
        assert.equal(zip.readUInt32LE(offset), 0x02014b50);
        const compressionMethod = zip.readUInt16LE(offset + 10);
        const compressedSize = zip.readUInt32LE(offset + 20);
        const fileNameLength = zip.readUInt16LE(offset + 28);
        const extraLength = zip.readUInt16LE(offset + 30);
        const commentLength = zip.readUInt16LE(offset + 32);
        const localHeaderOffset = zip.readUInt32LE(offset + 42);
        const name = zip
            .subarray(offset + 46, offset + 46 + fileNameLength)
            .toString("utf8");

        assert.equal(zip.readUInt32LE(localHeaderOffset), 0x04034b50);
        const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
        const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
        const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
        const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
        const content = compressionMethod === 0
            ? compressed
            : compressionMethod === 8
                ? inflateRawSync(compressed)
                : assert.fail(`Unsupported ZIP compression method ${compressionMethod}`);
        entries.set(name, content);
        offset += 46 + fileNameLength + extraLength + commentLength;
    }
    return entries;
}

test("generated side pane uses the registered scope and dedicated popup redirect", async () => {
    const html = await read(sourceRoot, "agentSidePane.html");

    assert.match(html, /https:\/\/api\.powerplatform\.com\/CopilotStudio\.Copilots\.Invoke/);
    assert.match(html, /maftagsc_agentconnectionstring/);
    assert.match(html, /directConnectUrl/);
    assert.match(html, /agenticruntime/);
    assert.doesNotMatch(html, /api\.powerplatform\.com\/CopilotStudio\.Invoke/);
    assert.match(html, /\/WebResources\/maftagsc_\/copilot\/authRedirect\.html/);
    assert.match(html, /maftagsc_sidecarconfiguration/);
    assert.doesNotMatch(html, /Default_HR_Management_App_Guide_9e5461/);
    assert.doesNotMatch(html, /pvaSetContext/);
    assert.match(html, /Model-driven App record form/);
    assert.match(html, /\[Trusted/);
    assert.match(html, /App ID:/);
    assert.match(html, /Record ID:/);
    assert.match(html, /signed-in user holds these roles/);
    assert.match(html, /maftagsc_targetbinding/);
    assert.match(html, /Segoe UI Web \(West European\)/);
    assert.match(html, /primaryFont/);
    assert.match(html, /getPageContext/);
    assert.doesNotMatch(html, /WEB_CHAT\/SEND_EVENT/);
    assert.match(html, /entitylist/);
    assert.match(html, /Which records should I use\?/);
    assert.match(html, /Current view \(all matching rows\)/);
    assert.match(html, /All accessible records/);
    assert.match(html, /Large views or tables can take longer/);
    assert.match(html, /WEB_CHAT\/SEND_MESSAGE/);
    assert.match(html, /WEB_CHAT\/SET_SEND_BOX/);
    assert.match(html, /maftagscListAnalysisSelection/);
    assert.match(html, /Current view FetchXML/);
    assert.match(html, /Your message was not sent/);
    assert.match(html, /New conversation/);
    assert.match(html, /Recent conversations/);
    assert.match(html, /Permanently delete the selected conversation/);
    assert.match(html, /Conversation deleted/);
    assert.match(html, /deleteRecord/);
    assert.match(html, /Conversation ready/);
    assert.match(html, /Continue with current record/);
    assert.match(html, /conversation-context-warning/);
    assert.match(html, /maftagsc_role eq/);
    assert.match(html, /conversationId:/);
    assert.match(html, /maftagsc_sidecarconversation/);
    assert.match(html, /DIRECT_LINE\/INCOMING_ACTIVITY/);
    assert.match(html, /maftagscSidecarReplay/);
    assert.match(html, /The current chat will remain available under Recent conversations/);
    assert.match(html, /cacheLocation:"localStorage"/);
    assert.doesNotMatch(html, /hrAgentContext/);
    assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1);
});

test("generated side pane uses iOS-style chat colors and rounded bubbles", async () => {
    const source = await read(sourceRoot, "agentSidePane.ts");
    const template = await read(sourceRoot, "agentSidePane.template.html");
    const html = await read(sourceRoot, "agentSidePane.html");

    for (const content of [source, html]) {
        assert.match(content, /bubbleFromUserBackground:"#007aff"|bubbleFromUserBackground: "#007aff"/);
        assert.match(content, /bubbleFromUserTextColor:"#ffffff"|bubbleFromUserTextColor: "#ffffff"/);
        assert.match(content, /bubbleBackground:"#e9e9eb"|bubbleBackground: "#e9e9eb"/);
        assert.match(content, /bubbleBorderRadius:18|bubbleBorderRadius: 18/);
        assert.match(content, /bubbleFromUserBorderRadius:18|bubbleFromUserBorderRadius: 18/);
        assert.match(content, /bubbleNubSize:0|bubbleNubSize: 0/);
        assert.match(content, /sendBoxButtonColor:"#007aff"|sendBoxButtonColor: "#007aff"/);
    }
    assert.match(template, /border-radius: 15px/);
    assert.match(template, /background: #f9f9fb/);
    assert.doesNotMatch(source, /#deecf9|#0f6cbd/);
});

test("branded icon is used by the persistent collapsed side pane", async () => {
    const launcher = await read(sourceRoot, "agentSidePane.js");
    const launcherSource = await read(sourceRoot, "agentSidePaneLauncher.ts");
    const icon = await read(sourceRoot, "agentGuideLibrary.svg");

    assert.match(launcherSource, /imageSrc: configuration\.iconWebResource/);
    assert.match(launcher, /WebResources\/maftagsc_\/copilot\/agentGuideLibrary\.svg/);
    assert.match(launcherSource, /canClose: false/);
    assert.match(launcherSource, /isSelected: false/);
    assert.match(launcherSource, /alwaysRender: true/);
    assert.match(launcherSource, /existingPane\.enabled = isBound/);
    assert.match(launcherSource, /if \(isBound\) \{\s*existingPane\.hidden = false/);
    assert.match(launcherSource, /sidecarConfigurationRepository\.listByAppId/);
    assert.match(launcherSource, /isFormBound\(configuration, entityName, context\.formId\)/);
    assert.match(launcherSource, /configurationId: configuration\.configurationId/);
    assert.match(launcherSource, /writeSharedContext\(configuration\.paneId, context\)/);
    assert.match(launcherSource, /for \(const configuration of configurations\)/);
    assert.match(launcherSource, /window\.AgentSidecar\.initializeGuide = initialize/);
    assert.match(launcherSource, /window\.HRAgentSidecar\.initializeGuide = initialize/);
    assert.doesNotMatch(launcher, /pane\.select\(\)|HRAgentSidecar\.openGuide/);
    assert.match(icon, /viewBox="0 0 24 24"/);
    assert.match(icon, /<circle[^>]+fill="#6655D0"/);
    assert.match(icon, /stroke="#FFFFFF"/);
    assert.doesNotMatch(icon, /<script/i);
});

test("all HR Management main forms register the collapsed guide on load", async () => {
    const forms = [
        "maftagsc_benefitplan/FormXml/main/{8259c4dd-99fb-4ae1-9e31-f8d251570bc4}.xml",
        "maftagsc_benefitenrollment/FormXml/main/{0807331f-493b-4372-a7ce-21ea0d2120e3}.xml",
        "maftagsc_expenseline/FormXml/main/{93c8d348-0bb7-467e-8735-4d63ae3e576e}.xml",
        "maftagsc_expensereport/FormXml/main/{19f71f07-879b-4598-96eb-40505794238b}.xml",
        "maftagsc_timeoffbalance/FormXml/main/{8d2ab9b2-6fe9-42c9-aa7a-752595a41783}.xml",
        "maftagsc_timeoffrequest/FormXml/main/{a439b1ff-6702-4f2a-a09b-a13a266a8575}.xml",
        "maftagsc_timeofftype/FormXml/main/{fb8196d8-53d8-43ee-9293-d1c93b2640e8}.xml"
    ];

    for (const form of forms) {
        const xml = await readFile(new URL(`../solution/Entities/${form}`, import.meta.url), "utf8");
        const formXml = xml.slice(xml.indexOf("<form>"), xml.indexOf("</form>") + "</form>".length);
        assert.match(xml, /<Library name="maftagsc_\/copilot\/hrAgentSidePane\.js"/);
        assert.match(xml, /functionName="HRAgentSidecar\.initializeGuide"/);
        assert.match(xml, /passExecutionContext="true"/);
        assert.match(xml, /<event name="onload" application="false" active="true">/);
        assert.match(formXml, /<formLibraries>/);
        assert.match(formXml, /<events>/);
    }
});

test("live page context replaces stale record details before each message", async () => {
    const source = await read(sourceRoot, "agentSidePane.ts");

    assert.match(source, /window\.parent\.Xrm/);
    assert.match(source, /Utility\?\.getPageContext/);
    assert.match(source, /getPrimaryAttributeValue/);
    assert.match(source, /formEntityName !== entityName \|\| formRecordId !== recordId/);
    assert.match(source, /connection\.postActivity = \(activity: Activity\)/);
    assert.match(source, /createConnectorConsentTracker\(\)/);
    assert.match(source, /connectorConsentTracker\.claim\(activity\)/);
    assert.match(source, /if \(consentClaim\?\.duplicate\)/);
    assert.match(source, /recordName: currentRecordName \?\? \(isSameRecord \? fallback\.recordName : ""\)/);
    assert.match(source, /createContextEnvelope\(/);
    assert.match(source, /resolveContext\(activeContext, activeConfiguration\)/);
    assert.match(source, /readSharedContext\(configuration, fallback\)/);
    assert.match(source, /viewId/);
    assert.match(source, /viewType/);
    assert.match(source, /resolveListAnalysisSelection/);
    assert.match(source, /isListAnalysisRequest/);
    assert.match(source, /liveContext\.pageType === "entitylist"/);
    assert.match(source, /delete forwardedChannelData\[LIST_ANALYSIS_SELECTION_KEY\]/);
    assert.match(source, /currentContext\.entityName === requestedListAnalysisSelection\.tableLogicalName/);
    assert.doesNotMatch(source, /startNavigationWatcher/);
    assert.doesNotMatch(source, /pvaSetContext/);
    assert.doesNotMatch(source, /WEB_CHAT\/SEND_EVENT/);
    assert.match(source, /await resolveSidecarConfiguration\(\s*configurationId,\s*appId,\s*paneId,/);
    assert.match(source, /maftagsc\.sidecar\.authRequest\.\$\{authNamespace\}/);
    assert.match(source, /window\.open\(\s*"about:blank"/);
    assert.match(source, /popup\.location\.replace\(/);
    assert.match(source, /void start\(true, popup \?\? undefined\)/);
    assert.match(source, /Allow pop-ups for this site and try again/);
    assert.match(source, /INTERACTIVE_SIGN_IN_ERROR_CODES[\s\S]*"timed_out"/);
    assert.match(source, /!interactive && shouldOfferInteractiveSignIn\(error\)/);
    assert.match(source, /window\.localStorage\.removeItem\(requestKey\)/);
    assert.match(source, /resolveOutgoingContext\(getCurrentLaunchContext\)/);
    assert.match(
        source,
        /window\.setTimeout\(\(\) => \{\s*api\.dispatch\(\{\s*type: "WEB_CHAT\/SET_SEND_BOX"/
    );
    assert.match(source, /}, SEND_BOX_RESTORE_DELAY_MS\)/);
    assert.match(source, /WEB_CHAT\/SET_SEND_BOX/);
    assert.match(source, /resolveSidecarConfiguration\(\s*configuration\.configurationId,/);
    assert.match(source, /sidecar_form_not_bound/);
    assert.match(source, /activity\.sequence - replaySequenceOffset/);
    assert.match(source, /generation === activeConversationGeneration/);
    assert.match(source, /deletedConversationIds\.has\(reference\.id\)/);
    assert.match(source, /deletedConversationIds\.add\(conversation\.id\)/);
    assert.match(source, /setAttribute\("inert", ""\)/);
    assert.match(source, /could not be deleted and was restored/);
    assert.match(source, /conversation\.hasUserMessage/);
    assert.match(source, /getConversationContextMismatch/);
    assert.match(source, /acknowledgedConversationContextKey/);
    assert.match(source, /PANE_VISIBILITY_SYNC_INTERVAL_MS/);
    assert.match(source, /pane\.enabled !== isBound/);
    assert.match(source, /pane\.enabled = isBound/);
    assert.match(source, /sidePanes\.state = 0/);
    assert.match(source, /utility\.getPageContext\(\)\.input/);
    assert.match(source, /pageType === "entitylist"/);
    assert.match(source, /VALIDATED_CONTEXT_KEY/);
    assert.match(source, /persistence\?\.lockOrigin/);
});

test("signed-in user security roles flow into the agent context", async () => {
    const paneSource = await read(sourceRoot, "agentSidePane.ts");
    const launcherSource = await read(sourceRoot, "agentSidePaneLauncher.ts");
    const rolesSource = await read(sourceRoot, "sidecarUserRoles.ts");

    // Launcher captures role names from the host global context and hands them
    // off through the same-origin localStorage channel (not the URL payload).
    // The documented ItemCollection accessor is get(); getAll()/forEach are
    // supported as fallbacks.
    assert.match(launcherSource, /userSettings\?\.roles/);
    assert.match(launcherSource, /typeof roles\.get === "function"/);
    assert.match(launcherSource, /roles: getUserRoles\(\)/);
    assert.match(launcherSource, /normalizeUserRoles/);

    // Pane parses, reads shared roles, signs on them, and surfaces them only in
    // the trusted per-message envelope.
    assert.match(paneSource, /roles: normalizeUserRoles\(value\.roles\)/);
    assert.match(paneSource, /parsed\.roles !== undefined \? normalizeUserRoles\(parsed\.roles\) : fallback\.roles/);
    assert.match(paneSource, /formatUserRolesLine\(context\.roles\)/);
    assert.doesNotMatch(paneSource, /CurrentUserRoles/);

    // Roles are de-duplicated and bounded; only role names are handled.
    assert.match(rolesSource, /MAX_USER_ROLES/);
    assert.match(rolesSource, /MAX_ROLE_NAME_LENGTH/);
    assert.match(rolesSource, /signed-in user holds these roles/);

    // Built artifacts carry the envelope line without a separate context event.
    const html = await read(sourceRoot, "agentSidePane.html");
    const launcher = await read(sourceRoot, "agentSidePane.js");
    assert.match(html, /signed-in user holds these roles/);
    assert.doesNotMatch(html, /pvaSetContext/);
    assert.match(launcher, /getAll/);
});

test("solution projections exactly match maintained web resources", async () => {
    assert.equal(
        await read(solutionRoot, "agentSidePane.html"),
        await read(sourceRoot, "agentSidePane.html")
    );
    assert.equal(
        await read(solutionRoot, "agentSidePane.js"),
        await read(sourceRoot, "agentSidePane.js")
    );
    assert.equal(
        await read(solutionRoot, "agentGuideLibrary.svg"),
        await read(sourceRoot, "agentGuideLibrary.svg")
    );
});

test("core solution packages persistent conversation metadata and runtime", async () => {
    const packageBytes = await readFile(
        new URL("../solution-core/AgentSidecarCore.zip", import.meta.url)
    );
    const entries = readZipEntries(packageBytes);
    const customizations = entries.get("customizations.xml")?.toString("utf8") ?? "";
    const solution = entries.get("solution.xml")?.toString("utf8") ?? "";
    assert.match(customizations, /maftagsc_sidecarconversation/);
    assert.match(customizations, /maftagsc_sidecaractivity/);
    assert.match(customizations, /maftagsc_iconsource/);
    assert.match(customizations, /maftagsc_iconwebresourcename/);
    assert.match(customizations, /maftagsc_iconcontenthash/);
    assert.match(customizations, /maftagsc_iconmimetype/);
    assert.doesNotMatch(
        customizations,
        /<AppVersion>2026-08-27T01:32:00Z<\/AppVersion>/
    );
    assert.match(
        customizations,
        /"webresources":\{"entitySetName":"webresourceset","logicalName":"webresource"\}/
    );
    assert.match(
        customizations,
        /"componenttype":1,"logicalname":"webresource"/
    );
    assert.match(customizations, /Agent Sidecar User/);
    assert.doesNotMatch(customizations, /maftagsc_sidecarconfiguration_appid_key/);
    assert.match(
        customizations,
        /<RolePrivilege name="prvDeletemaftagsc_sidecarconversation" level="Basic" \/>/
    );
    assert.match(
        solution,
        /<RootComponent type="61" schemaName="maftagsc_\/copilot\/authRedirect\.html" behavior="0" \/>/
    );
    assert.match(solution, /<Version>1\.0\.0\.23<\/Version>/);

    const packagedRuntime = [...entries.entries()].find(([name]) =>
        name.startsWith("WebResources/maftagsc_copilotagentSidePanehtml")
    )?.[1];
    assert.ok(packagedRuntime, "Packaged side-pane runtime is missing");
    assert.deepEqual(
        packagedRuntime,
        await readFile(new URL("agentSidePane.html", sourceRoot))
    );

    const packagedLauncher = [...entries.entries()].find(([name]) =>
        name.startsWith("WebResources/maftagsc_copilotagentSidePanejs")
    )?.[1];
    assert.ok(packagedLauncher, "Packaged side-pane launcher is missing");
    assert.deepEqual(
        packagedLauncher,
        await readFile(new URL("agentSidePane.js", sourceRoot))
    );

    const packagedIcon = [...entries.entries()].find(([name]) =>
        name.startsWith("WebResources/maftagsc_copilotagentGuideLibrarysvg")
    )?.[1];
    assert.ok(packagedIcon, "Packaged side-pane icon is missing");
    assert.deepEqual(
        packagedIcon,
        await readFile(new URL("agentGuideLibrary.svg", sourceRoot))
    );

    const packagedCodeApp = [...entries.entries()]
        .filter(([name]) =>
            name.startsWith("CanvasApps/maftagsc_agentsidecar_")
            && name.endsWith(".js")
        )
        .map(([, value]) => value.toString("utf8"))
        .join("\n");
    assert.match(packagedCodeApp, /maftagsc_iconwebresourcename/);
    assert.match(packagedCodeApp, /Copilot Studio agent logo/);
    assert.match(packagedCodeApp, /Edit sidecar settings/);
    assert.match(packagedCodeApp, /Safe in-place update/);
    assert.match(packagedCodeApp, /Enable on this table/);
    assert.match(packagedCodeApp, /Applying your changes/);
    assert.match(packagedCodeApp, /Verify the result/);
    assert.match(packagedCodeApp, /Available model-driven apps/);
    assert.match(packagedCodeApp, /Current configuration choices/);
    assert.match(packagedCodeApp, /List published Copilot Studio agents/);
    assert.match(packagedCodeApp, /This sidecar changed after editing began/);
    assert.match(packagedCodeApp, /__sidecar_edit_lock__/);
    assert.match(packagedCodeApp, /Sidecar dashboard/);
    assert.match(packagedCodeApp, /Recognize each assistant by the same icon/);
    assert.match(packagedCodeApp, /Progress confirmed/);
    assert.match(packagedCodeApp, /Detected/);

    const codeAppPackageUris = [
        ...customizations.matchAll(/<CodeAppPackageUri>([^<]+)<\/CodeAppPackageUri>/g)
    ].map((match) =>
        match[1]
            .replace(/^\//, "")
            .replace(/_ContentType_(?:application\/javascript|text\/html|text\/css)$/, "")
    );
    assert.ok(codeAppPackageUris.length > 0, "Code App package metadata is missing");
    assert.match(
        codeAppPackageUris[0],
        /\/index\.html$/,
        "Code App entry point must be the first package URI"
    );
    const codeAppPackagePrefix = codeAppPackageUris[0].slice(0, -"index.html".length);
    const packagedCodeAppFiles = [...entries.keys()]
        .filter((name) => name.startsWith(codeAppPackagePrefix) && !name.endsWith("/"))
        .sort();
    const expectedCodeAppFiles = (await listFiles(codeAppDistRoot))
        .map((name) => `${codeAppPackagePrefix}${name}`)
        .sort();
    assert.deepEqual(
        packagedCodeAppFiles,
        expectedCodeAppFiles,
        "Every dist file must be packaged exactly once"
    );
    assert.deepEqual(
        [...codeAppPackageUris].sort(),
        expectedCodeAppFiles,
        "Code App package metadata must list every dist file exactly once"
    );
    for (const packageUri of codeAppPackageUris) {
        assert.ok(entries.has(packageUri), `Code App package file is missing: ${packageUri}`);
        assert.deepEqual(
            entries.get(packageUri),
            await readFile(new URL(packageUri.slice(codeAppPackagePrefix.length), codeAppDistRoot)),
            `Code App package file differs from dist: ${packageUri}`
        );
    }
});

test("authentication redirect completes sign-in via a same-origin localStorage handshake", async () => {
    const html = await read(solutionRoot, "authRedirect.html");

    assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1);
    assert.doesNotMatch(html, /main\.aspx|window\.open/i);
    assert.match(html, /Completing sign-in/);
    assert.match(html, /handleRedirectPromise/);
    assert.match(html, /acquireTokenRedirect/);
    assert.match(html, /maftagsc\.sidecar\.authResult/);
    assert.match(html, /maftagsc\.sidecar\.authNamespace/);
    assert.match(html, /sessionStorage/);
    assert.doesNotMatch(html, /broadcastResponseToMainFrame/);
    assert.doesNotMatch(html, /HR_AGENT_AUTH_REDIRECT_BUNDLE/);
});