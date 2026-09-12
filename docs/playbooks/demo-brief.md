
# demo-brief

Drift between the written demo script and the running application is how demos die. This skill
re-derives both documents from the real state of the repository, never from memory.

## Procedure

1. Re-derive the real path by reading the actual routes in `apps/web` and `apps/api`, never from
   memory. Also read `git log --oneline -20`, the open pull requests, the `bun test` output and the
   latest `rubric-audit` score.
2. Run `bun run demo`, and `bun run seed` first if the data is missing. **If it fails, stop and
   report rather than updating the doc.** A wrong script is worse than a stale one.
3. Rewrite `docs/10-demo-script.md`: timestamp, actor, the exact click or command, the expected
   on-screen result, the one sentence spoken over it, and the fallback if it breaks.
4. Keep it under four minutes out loud. Cut the third-best feature before cutting the "why it
   matters" line.
5. Refresh the seeded IDs and the hero account from `.seed/ids.json`.
6. Regenerate `docs/12-judge-qa.md`. Per person: what they own, the one file to open on screen, the
   algorithm in three sentences, the honest current gap, and the next step. Then the shared answers:
   why this track, why this stack, what is real versus stubbed right now, where the data comes from
   and why it is synthetic, how it makes money, what regulation applies and why we are not the
   regulated entity, cost per inference, what we cut and why, and how it scales beyond one platform.
7. Include a two-minute live walkthrough that works at this exact moment, verified by running it
   rather than written aspirationally.
8. Verify the offline fallback still exists: the recorded video is present in `assets/` and on a
   phone, and local-only mode runs with the network off.
9. **Never overstate.** "That part is stubbed, here is the contract and here is when it lands"
   scores higher than a bluff an engineer unpicks in two questions. The judges are explicitly
   looking for prototypes that only pretend to work.
10. Print both documents to the terminal as well, so they can be read on a phone at the table, and
    open a `P0-demo-blocker` issue for anything on the demo path that is red.

## Reminders for the people, not the docs

- Judging is continuous, so the 90-second walk-up variant in `docs/11-pitch.md` gets used far more
  than the four-minute stage version. Rehearse that one most.
- The live URL is the strongest artifact available, because a judge can open it on their own phone.
  Keep it in `docs/10-demo-script.md` as the first fallback, with the recorded video as the second.
- After the 20:00 feature freeze on 2026-09-12, this skill only ever reports; it does not chase a
  new feature into the script.
