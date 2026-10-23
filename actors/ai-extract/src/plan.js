// Free-plan guard for the built-in AI key.
// Apify pays creators nothing for usage by users on the free plan, but our LLM bill still applies when they use the
// built-in key. So free-plan users without their own key get a capped trial per run. Paying users and own-key runs are
// never limited. APIFY_USER_IS_PAYING is set by the platform ("1" paying, "0" free plan); unknown = treat as paying.
export function isFreePlan(env = process.env) {
    return /^(0|false)$/i.test(String(env.APIFY_USER_IS_PAYING ?? '').trim());
}
export function freeTrialCap({ requested, byok, limit, env = process.env }) {
    if (byok || !isFreePlan(env) || requested <= limit) return { cap: requested, limited: false };
    return { cap: limit, limited: true };
}
