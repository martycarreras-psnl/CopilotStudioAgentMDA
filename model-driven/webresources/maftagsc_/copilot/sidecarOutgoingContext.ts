export interface ResolvedOutgoingContext<T> {
    ok: true;
    context: T;
}

export interface BlockedOutgoingContext {
    ok: false;
    message: string;
}

export type OutgoingContextResult<T> =
    | ResolvedOutgoingContext<T>
    | BlockedOutgoingContext;

export function resolveOutgoingContext<T>(
    resolve: () => T
): OutgoingContextResult<T> {
    try {
        return {
            ok: true,
            context: resolve()
        };
    } catch (error) {
        if (error instanceof Error && error.message === "sidecar_form_not_bound") {
            return {
                ok: false,
                message:
                    "This sidecar isn't configured for the current table. " +
                    "Your message was not sent."
            };
        }
        throw error;
    }
}
