/**
 * dsh-selection-toolbar — host half.
 *
 * The plugin is effectively client-only: the selection toolbar renders inside
 * the web shell and prompts the current session through the client `sessions`
 * service (`binding(id).session.prompt` — the same path the composer uses), so
 * no host RPC is needed.
 *
 * The one host job is registering the settings namespace. Since dsh rc.8 the
 * 设置 → 插件 tab keys its card list by settings namespace and only dispatches
 * cards for namespaces the Host serves (the intersection of the Host's served
 * namespaces and the cards registered into `settings.plugin.item`). Without
 * this registration the settings card would never render on rc.8+. The card
 * itself still owns its values in browser localStorage (client-only design),
 * so the namespace is served with its schema defaults and nothing more.
 */
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const inject = []

/** Settings namespace for the 设置 → 插件 card; the client registers the same key. */
export const SETTINGS_NAMESPACE = 'dsh-selection-toolbar'

const SETTINGS_SCHEMA = z.object({
  delay: z.number().default(0),
  hiddenActions: z.array(z.string()).default([]),
})

export function apply(ctx) {
  // Optional dependency on the settings service: on dsh builds without it
  // (e.g. the rc.6 baseline) this injectable stays dormant and the card still
  // renders through the old list-slot contract; on rc.8+ the namespace is
  // served and the 设置 → 插件 tab dispatches the card for it.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), SETTINGS_SCHEMA, { applies: 'live' })
  })
}
