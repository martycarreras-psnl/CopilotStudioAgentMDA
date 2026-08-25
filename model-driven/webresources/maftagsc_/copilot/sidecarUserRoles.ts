// Security-role names are passed to the agent as *context only* (never as an
// authorization signal). The agent's knowledge stays gated by the signed-in
// user's own delegated permissions; roles simply let the agent tailor tone and
// guidance. Values are de-duplicated (case-insensitive) and bounded in count
// and length so a misconfigured environment can never flood the context.
export const MAX_USER_ROLES = 30;
export const MAX_ROLE_NAME_LENGTH = 100;

export function normalizeUserRoles(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }
    const seen = new Set<string>();
    const roles: string[] = [];
    for (const value of values) {
        const name = String(value ?? "").trim().slice(0, MAX_ROLE_NAME_LENGTH);
        if (!name) {
            continue;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        roles.push(name);
        if (roles.length >= MAX_USER_ROLES) {
            break;
        }
    }
    return roles;
}

// Clearly labeled line for the trusted per-message context envelope.
export function formatUserRolesLine(roles: readonly string[]): string {
    return roles.length > 0
        ? `The signed-in user holds these roles: ${roles.join(", ")}.`
        : "The signed-in user's roles are unavailable.";
}
