import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("./webresources/maftagsc_/copilot/", import.meta.url);
const solutionRoot = new URL("../solution/WebResources/maftagsc_/copilot/", import.meta.url);

async function read(root, name) {
    return readFile(new URL(name, root), "utf8");
}

test("generated side pane uses the registered scope and dedicated popup redirect", async () => {
    const html = await read(sourceRoot, "agentSidePane.html");

    assert.match(html, /https:\/\/api\.powerplatform\.com\/CopilotStudio\.Copilots\.Invoke/);
    assert.match(html, /maftagsc_agentconnectionstring/);
    assert.match(html, /directConnectUrl/);
    assert.match(html, /agenticruntime/);
    assert.doesNotMatch(html, /api\.powerplatform\.com\/CopilotStudio\.Invoke/);
    assert.match(html, /\/WebResources\/maftagsc_\/copilot\/authRedirect\.html/);
    assert.match(html, /cr0b1_HRMgmtClassic/);
    assert.doesNotMatch(html, /Default_HR_Management_App_Guide_9e5461/);
    assert.match(html, /pvaSetContext/);
    assert.match(html, /HR Management app/);
    assert.match(html, /CurrentAppId/);
    assert.match(html, /CurrentPageType/);
    assert.match(html, /CurrentRecordId/);
    assert.match(html, /CurrentUserRoles/);
    assert.match(html, /signed-in user holds these roles/);
    assert.match(html, /Benefit Plan record form/);
    assert.match(html, /Segoe UI Web \(West European\)/);
    assert.match(html, /primaryFont/);
    assert.match(html, /getPageContext/);
    assert.match(html, /WEB_CHAT\/SEND_MESSAGE/);
    assert.match(html, /entitylist/);
    assert.match(html, /New conversation/);
    assert.match(html, /The current chat history will be cleared/);
    assert.match(html, /cacheLocation:"localStorage"/);
    assert.doesNotMatch(html, /hrAgentContext/);
    assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1);
});

test("library icon is used by the persistent collapsed side pane", async () => {
    const launcher = await read(sourceRoot, "agentSidePane.js");
    const launcherSource = await read(sourceRoot, "agentSidePaneLauncher.ts");
    const icon = await read(sourceRoot, "agentGuideLibrary.svg");

    assert.match(launcherSource, /imageSrc: configuration\.iconWebResource/);
    assert.match(launcher, /WebResources\/maftagsc_\/copilot\/agentGuideLibrary\.svg/);
    assert.match(launcherSource, /canClose: false/);
    assert.match(launcherSource, /isSelected: false/);
    assert.match(launcherSource, /alwaysRender: true/);
    assert.match(launcherSource, /sidecarConfigurationRepository\.getByAppId/);
    assert.match(launcherSource, /window\.AgentSidecar\.initializeGuide = initialize/);
    assert.match(launcherSource, /window\.HRAgentSidecar\.initializeGuide = initialize/);
    assert.doesNotMatch(launcher, /pane\.select\(\)|HRAgentSidecar\.openGuide/);
    assert.match(icon, /viewBox="0 0 24 24"/);
    assert.match(icon, /currentColor/);
    assert.doesNotMatch(icon, /<script|#[0-9a-f]{3,8}/i);
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
    assert.match(source, /action\.type === "WEB_CHAT\/SEND_MESSAGE"/);
    assert.match(source, /recordName: currentRecordName \?\? \(isSameRecord \? fallback\.recordName : ""\)/);
    assert.match(source, /createContextEnvelope\(currentContext, originalText, configuration\)/);
    assert.match(source, /resolveContext\(activeContext, activeConfiguration\)/);
    assert.match(source, /readSharedContext\(configuration, fallback\)/);
    assert.doesNotMatch(source, /startNavigationWatcher/);
    assert.match(source, /sendContextOnConnect && action\.type === "DIRECT_LINE\/CONNECT_FULFILLED"/);
    assert.match(source, /action\.type === "WEB_CHAT\/SEND_MESSAGE"/);
    assert.match(source, /activeConfiguration,\s+true/);
    assert.match(source, /await sidecarConfigurationRepository\.getByAppId\(appId\)/);
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

    // Pane parses, reads shared roles, signs on them, and surfaces them in the
    // user-initiated pvaSetContext event and the trusted per-message envelope.
    assert.match(paneSource, /roles: normalizeUserRoles\(value\.roles\)/);
    assert.match(paneSource, /parsed\.roles !== undefined \? normalizeUserRoles\(parsed\.roles\) : fallback\.roles/);
    assert.match(paneSource, /formatUserRolesLine\(context\.roles\)/);
    assert.match(paneSource, /CurrentUserRoles: serializeUserRoles\(context\.roles\)/);
    assert.doesNotMatch(paneSource, /CurrentUserRoles: serializeUserRoles\(next\.roles\)/);

    // Roles are de-duplicated and bounded; only role names are handled.
    assert.match(rolesSource, /MAX_USER_ROLES/);
    assert.match(rolesSource, /MAX_ROLE_NAME_LENGTH/);
    assert.match(rolesSource, /signed-in user holds these roles/);

    // Built artifacts carry the new variable and envelope line.
    const html = await read(sourceRoot, "agentSidePane.html");
    const launcher = await read(sourceRoot, "agentSidePane.js");
    assert.match(html, /CurrentUserRoles/);
    assert.match(html, /signed-in user holds these roles/);
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

test("authentication redirect completes sign-in via a same-origin localStorage handshake", async () => {
    const html = await read(solutionRoot, "authRedirect.html");

    assert.equal((html.match(/<!doctype html>/gi) ?? []).length, 1);
    assert.doesNotMatch(html, /main\.aspx|window\.open/i);
    assert.match(html, /Completing sign-in/);
    assert.match(html, /handleRedirectPromise/);
    assert.match(html, /acquireTokenRedirect/);
    assert.match(html, /maftagsc\.sidecar\.authResult/);
    assert.doesNotMatch(html, /broadcastResponseToMainFrame/);
    assert.doesNotMatch(html, /HR_AGENT_AUTH_REDIRECT_BUNDLE/);
});