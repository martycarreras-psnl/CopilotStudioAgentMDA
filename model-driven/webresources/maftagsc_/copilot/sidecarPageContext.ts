export interface SidecarPageIdentity {
    pageType: "entityrecord" | "entitylist";
    entityName: string;
    formId: string | null;
    recordId: string | null;
}

export type SidecarFormIdentity = Omit<SidecarPageIdentity, "pageType">;

function isMatchingOpenForm(
    sharedContext: SidecarPageIdentity,
    liveContext: SidecarPageIdentity,
    currentForm: SidecarFormIdentity | null
): boolean {
    if (
        !currentForm ||
        sharedContext.pageType !== "entityrecord" ||
        !sharedContext.recordId ||
        !sharedContext.formId ||
        !currentForm.formId
    ) {
        return false;
    }
    if (
        liveContext.entityName !== sharedContext.entityName ||
        currentForm.entityName !== sharedContext.entityName ||
        currentForm.recordId !== sharedContext.recordId ||
        currentForm.formId !== sharedContext.formId
    ) {
        return false;
    }
    return true;
}

export function chooseSidecarPageContext<T extends SidecarPageIdentity>(
    sharedContext: T | null,
    liveContext: T,
    currentForm: SidecarFormIdentity | null
): T {
    if (!sharedContext) {
        return liveContext;
    }
    if (liveContext.pageType !== "entitylist") {
        return sharedContext;
    }
    return isMatchingOpenForm(sharedContext, liveContext, currentForm)
        ? sharedContext
        : liveContext;
}
