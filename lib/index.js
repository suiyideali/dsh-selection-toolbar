/**
 * dsh-selection-toolbar — host half (stub).
 *
 * The plugin is effectively client-only: the selection toolbar renders inside
 * the web shell and prompts the current session through the client `sessions`
 * service (`binding(id).session.prompt` — the same path the composer uses), so
 * no host RPC is needed. This stub keeps the package's host entry resolvable
 * for the loader/patch contract.
 */
export const inject = []

export function apply() {}
