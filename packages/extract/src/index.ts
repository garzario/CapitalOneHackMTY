/**
 * @hackmty/extract is the only package in this repository that talks to a
 * language model, and it may only ever transcribe.
 *
 * `extractFromImage` reads a photographed payment instruction, `extractFromAudio`
 * transcribes a voice note, and `readClabeFromText` is the pure post-processor
 * that decides which eighteen digits survive and how much they can be trusted.
 * Read README.md in this folder before quoting the LLM boundary anywhere, and
 * `docs/06-regulatory-privacy.md` section 6 for the regulatory half of it.
 *
 * The fixtures are deliberately NOT re-exported here. They are test material and
 * they read a file off disk, and `apps/api` must be able to import this package
 * without either of those things coming with it. Tests and
 * `scripts/extract-demo.ts` import `./fixtures` by path.
 */

export * from "./extract";
export * from "./gemini";
export * from "./postprocess";
