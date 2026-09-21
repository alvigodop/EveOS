# Provider Health Signals

Nexus Browser exposes provider-side availability as structured runtime state instead of forcing Dex agents to infer limits from failed turns.

## States

- `ready` — no blocking provider UI signal is visible.
- `rate_limited` — account/model/message usage is exhausted or temporarily capped. Action: `wait`.
- `conversation_limit` — this specific chat/context is exhausted. Action: `new_chat`.
- `auth_required` — provider session requires sign-in again. Action: `reauth`.
- `provider_unavailable` — provider UI reports overload or a temporary outage. Action: `retry_later`.

Blocking health carries a short evidence snippet, a human-readable summary, and—when the provider UI exposes a duration—a computed `cooldownUntil` timestamp. Reset text is retained even when an absolute deadline cannot be parsed.

## Detection boundary

`extension/content/provider-health.js` is a provider-neutral observer loaded on every supported provider tab. It watches UI surfaces intended for application status such as alerts, live regions, quota/error banners, and toasts.

It deliberately excludes known conversation-turn containers. A model reply that merely discusses or quotes the words "rate limit" must not become provider health evidence.

The sensor never:
- submits prompts;
- clicks provider controls;
- navigates or reloads the tab;
- activates/focuses the tab;
- reads arbitrary full-page conversation text.

On Manifest V3 service-worker lifecycle resets, provider pages periodically re-announce current health. Before every online prompt, the extension also requests a fresh health snapshot. If the health content script is missing after an extension reload, only that read-only sensor is injected and queried; the provider page is not reloaded.

## Bridge propagation

The extension stores health by browser tab and attaches it to normal `tabs_update` snapshots. Health changes therefore participate in the existing tab-snapshot signature and are visible in Base Mode and Dex.

A direct `provider_health_update` event is also broadcast so an active Dex turn can stop immediately if the provider becomes blocked after dispatch begins.

The localhost `/diagnostics` response exposes `providerBlocks` for currently blocked provider tabs.

## Dex behavior

Before dispatch, Dex refuses a turn whose target already has blocking health.

If a blocking health event arrives during an active turn, Dex stops that relay without resending the prompt.

Relay prompts include a `Provider availability` section for online participants. This lets other agents distinguish:
- wait for quota reset;
- move a participant to a fresh chat;
- sign in again;
- retry later or switch provider.

Provider-health failure codes are pause-class failures:
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_CONVERSATION_LIMIT`
- `PROVIDER_AUTH_REQUIRED`
- `PROVIDER_UNAVAILABLE`

Live qualification classifies these as `BLOCKED`, not as qualification-engine failures.

## Future providers

A new provider receives health monitoring automatically when its provider registry entry is added and its origin is included in the extension manifest.

Do not add provider-specific quota scraping unless a provider cannot expose its limit state through the shared status-surface detector. If a provider-specific detector becomes necessary, extend the shared sensor with declarative evidence rules rather than adding orchestration logic to that provider's send adapter.
