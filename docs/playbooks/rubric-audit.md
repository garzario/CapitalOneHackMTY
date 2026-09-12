
# rubric-audit

The rubric is confirmed and it sums to 100. Score honestly: a wrong self-score sends the team to
work on the wrong thing, which is the only way this skill can actually cost points.

| Criterion | Points | Sub-criteria |
|---|---|---|
| Originality | 30 | Substantiated competitive differentiation 10, Identification of market gap 10, Non trivial solution 10 |
| Technical Depth | 25 | Data foundation 6, Algorithmic logic and intelligence 9, System design 5, Quality and functional demo 5 |
| Impact and Feasibility | 25 | Substantiated business model 10, Market size TAM/SAM/SOM 5, Regulatory and operational feasibility 5, Adoption strategy GTM 5 |
| Design and Experience | 20 | Specific user persona 7, Structured user journey map 7, Pitch 6 |

## Procedure

1. Read `docs/01-rubric-mapping.md` and walk every sub-criterion with its point value from the
   table above.
2. For each one, find the evidence in the repository: a file path, a test name, a pull request
   number, a CI run, a screenshot. **Prose is not evidence.** Score zero, partial or full, and
   write the reason in one line.
3. Compute the weighted total out of 100 and name the single largest point loss.
4. For every gap worth three points or more, open an issue with the right `rubric/*` label and the
   current milestone, ranked by points per hour rather than by how interesting the work is.
5. Flag the standing traps explicitly, every time:
   - Is the idea distinguishable from the prior-year winners listed in `docs/00-challenge.md`?
     Repetition is the failure Capital One named first.
   - Is the persona a niche, or is it a demographic wearing a name?
   - Is the journey map structured, with a pre-trigger and a post-outcome stage, or is it only the
     happy middle?
   - Is TAM bottom-up, entities times price, with every number cited to a named series?
   - Is there a human in the loop on any adverse action?
   - Does `bun run demo` pass right now?
   - Is `docs/14-process.md` current?
6. Update `docs/01-rubric-mapping.md` in place and commit on a `docs/` branch through the `pr-flow`
   skill.
7. Output a table (criterion, points available, points earned, gap, issue number), the weighted
   score, and the three things to do next. **Do not pad it. If the score is 62, say 62.**

## Notes

- Judging is continuous: engineers and a product person walk up during the 36 hours and probe the
  logic, the architecture and the data structures. A sub-criterion with no artifact behind it scores
  zero in that conversation no matter how good the slide is.
- Technical Depth has the heaviest single sub-criterion in the rubric at 9 points, Algorithmic logic
  and intelligence, and it is the one that is cheapest to evidence: `packages/core` plus its tests.
  If that row is not full, fix it before anything else in that criterion.
- Originality at 30 is the heaviest criterion and the one that cannot be recovered late. If the
  differentiation row is weak at M2, that is a scope conversation, not a documentation task.
