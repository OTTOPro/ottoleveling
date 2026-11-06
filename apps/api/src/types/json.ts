/**
 * JSON-serializable value type. Use anywhere a value must round-trip
 * through structured clone (DO RPC, KV storage, JSON.stringify).
 *
 * DO NOT use `unknown` in DO RPC method signatures - the stub-side type
 * inference collapses to `never`. Use JsonValue (or a concrete shape) instead.
 * See memory `feedback-do-rpc-unknown-inference`.
 *
 * IMPORTANT: this is intentionally NOT recursive (no `JsonValue[]` / `Record<string,
 * JsonValue>`). The canonical recursive form triggers TS2589 ("Type instantiation
 * is excessively deep and possibly infinite") at the DO RPC boundary - when a
 * `SystemAgent.getState()` return type containing this alias gets fully resolved
 * for the stub's typed proxy, the resolver hits its depth limit.
 *
 * The `any[]` / `Record<string, any>` arms are the necessary trade-off: typed
 * at the top level (which is what `JsonValue` exists to assert - "JSON-shaped"),
 * with `any` only inside arrays and nested objects where the DO RPC type system
 * can't track depth. Do NOT replace with the recursive form unless you've
 * verified `pnpm typecheck` still passes; the recursive form triggers TS2589
 * (excessively deep type instantiation) at the DO RPC boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonValue = string | number | boolean | null | any[] | { [key: string]: any };
