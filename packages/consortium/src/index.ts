/**
 * @hackmty/consortium is the only place that talks to the SentryOne consortium.
 *
 * The consortium is the cross-tenant half of the product: a supplier's first
 * payment from this company has no history here, and it has years of it in every
 * other company that already pays that supplier. Trustpair and nsKnox sell that
 * signal to corporate treasuries; this package is our version of it, and the
 * privacy argument is what makes it shippable rather than a data-sharing
 * agreement nobody would sign.
 *
 * Five pieces, in the order the product uses them. `hash.ts` is the privacy
 * boundary and the only file that sees a raw RFC or a raw CLABE. `jwt.ts` and
 * `client.ts` are the Snowflake SQL REST API with no SDK and an injectable
 * `fetch`. `ddl.ts` is the warehouse schema, one table and one view. `sync.ts` is
 * the push and the pull. `synthetic.ts` generates the demo network and says, in
 * its own header, that it is not real.
 *
 * Three rules that are binding rather than stylistic:
 *
 * - **Nothing personal leaves the tenant.** Salted hashes of (RFC, CLABE), a
 *   public bank code, dates, counts and one of four outcomes. No name, no amount,
 *   no invoice, no clave de rastreo.
 * - **The warehouse is never on the hot path.** The engine reads a LOCAL snapshot
 *   filled by `bun run consortium:pull`, so a payment decision never waits on a
 *   warehouse and the demo works with the network unplugged.
 * - **The demo's network is synthetic and the docs say so.** Every generated row
 *   carries `synthetic = TRUE`, and nobody claims on stage that other companies
 *   are really in it.
 *
 * Server only, because `hash.ts` and `jwt.ts` import `node:crypto`. `apps/web`
 * goes through `GET /api/v1/consortium/signal`.
 */

export * from "./client";
export * from "./config";
export * from "./ddl";
export * from "./hash";
export * from "./jwt";
export * from "./sync";
export * from "./synthetic";
