# 02. Persona

Worth 7 points on its own and it gates the journey, the market and the pitch. One persona. Named.
Quantified. The anti-persona is what turns a demographic into a niche, which is exactly what
Capital One said separates winners from repeats.

Owner: Patricio (`garzario`), drafted for the team to validate. Reviewer: Fabricio (`FabriBanda`).
Issue #52. Due M2. Depends on ADR-0002, which is Accepted.

**Read this first.** Lupita is a composite persona built from the scenario in ADR-0002 and issue
#52. She is not a real person and no real person is quoted here. Every cell tagged
`TODO(garzario) verify` is a claim about the real world that has not yet been checked against a
primary source or an interview. Scenario parameters of the synthetic demo company are labelled as
such: they describe the shape of the data in `packages/seed`, not a measurement of Mexico.

## The persona

| Field | Value |
|---|---|
| Name | Lupita Elizondo. Illustrative composite, not a real person |
| Age | 41 |
| City, industrial corridor | Apodaca, Nuevo Leon, in the industrial belt north east of Monterrey |
| Role, in her own words | "Yo llevo toda la administracion." Formally an administrative clerk, in practice the whole back office: invoices in, payroll paperwork, the bank, the external accountant |
| Business | A metalmecanica: machining and welded assemblies, 28 employees, two large customers and a long tail of small ones. Scenario parameter |
| Suppliers | About 42 active suppliers over the last 8 months. Scenario parameter, matches the generator in issue #43 |
| The payment run | Thursday, 70 to 110 transfers in one sitting. Scenario parameter. Total pesos per run: TODO(garzario) verify against the generator once #43 lands |
| Income band, and the source for it | TODO(garzario) verify. Open the INEGI ENOE tabulados for administrative support occupations in Nuevo Leon, or the IMSS salario base de cotizacion series, and cite the series identifier. Do not write a number in this row until one of those has actually been read |
| Banking products actually held | One business checking account with online banking and a token, SPEI transfers out, no treasury module. Her own authorisation limit is MXN 50,000 per transfer, above which the owner has to approve. TODO(garzario) verify that a per-user transfer limit of this shape is a standard configurable control in Mexican business online banking and not only our scenario |
| Phone, OS version, data plan | TODO(garzario) verify at the venue. The QR intake page in issue #48 has to work on iOS Safari and Android Chrome one-handed either way, so the product does not depend on the answer |
| Software she already pays for | The stamping provider portal her external accountant uses for CFDI, a spreadsheet, WhatsApp, the bank portal. No ERP, and therefore no supplier master, no validation module, no maker-checker, no three-way match. TODO(garzario) verify the "no ERP at 28 employees" claim with two people at the venue |
| Who else touches the money | The owner, who authorises anything above her limit and who is on the plant floor most of the day. The external accountant, who sees the month after it happened. The plant supervisor, who raises purchase requests and forwards supplier messages |

### Three jobs to be done

1. When the Thursday run is assembled and the bank cutoff is a few hours away, I want to know which
   of these eighty transfers I can send without thinking, so I can spend my attention on the two or
   three that deserve it.
2. When a supplier sends me a different account number than the one I paid last month, I want to
   establish that the account really belongs to that supplier before I send anything, so I do not
   lose money that cannot be recalled.
3. When the SAT publishes a new Article 69-B list, I want to know the same week what we already paid
   and already deducted to anyone on it, so that the correction is ours and voluntary instead of an
   assessment that arrives later.

### The current workaround, and what it costs

Today the run is a spreadsheet, WhatsApp and the bank portal. The spreadsheet holds what is due.
WhatsApp holds the account numbers, because that is where suppliers send them. The bank portal is
where she pastes eighteen digits, seventy to a hundred and ten times, and compares the beneficiary
name the bank shows against the name she expected, by eye, at the end of a Thursday.

Three costs, and only the first is visible to her.

| Cost | How to quantify it | Status |
|---|---|---|
| Time per run | minutes per transfer x transfers per run x runs per year | TODO(garzario) verify: time one real run, or ask two people at the venue for their own number. Do not estimate it in this file |
| One misdirected SPEI | amount x frequency per year. An executed SPEI is final, so the loss is the full amount and there is no chargeback to net against it | TODO(garzario) verify the irrevocability statement against Banxico's published SPEI rules and cite the document |
| Deductions voided retroactively | deducted base x the corporate ISR rate, plus the IVA credited on the same operations | TODO(garzario) verify the mechanism and both rates against the CFF Article 69-B text, the LISR corporate rate and the LIVA general rate, and cite the article numbers. The arithmetic itself lives in `SweepResult` in `packages/core/src/domain.ts`, so the product computes it rather than asserting it |

The fourth cost is the one nobody books: the 69-B check is public, free and takes a minute, and in
this profile nobody runs it weekly. That gap is the product. TODO(garzario) verify that sentence in
the two venue conversations before anyone says it to a judge.

### The trigger moment

**Thursday morning, the payment run.** The invoices that arrived Monday to Wednesday are due, the
supplier calls start after lunch, and the practical deadline is her own bank's cutoff for same-day
transfers rather than the SPEI window itself. TODO(garzario) verify that distinction and cite the
Banxico SPEI operating-hours page.

This moment is the entry point of the journey in `docs/03-user-journey.md`, the first ten seconds of
the pitch in `docs/11-pitch.md`, and beat 1 of the demo in `docs/10-demo-script.md`.

### One verbatim quote

> "Si me equivoco de cuenta, ese dinero ya no regresa."
>
> "If I get the account wrong, that money does not come back."

**This is a construction, not an interview quote.** It is here so the team has one sentence to say,
and it gets replaced by a real one after the venue conversations. Never present it as something a
real person said.

## Anti-persona, who this is explicitly not for

1. **A company large enough to run an ERP with a supplier master and a validation module.** The
   control we sell already exists there as segregation of duties, a maker-checker flow and a
   three-way match. We would be a second opinion on a decision that already has two, and the buyer
   would be an IT department rather than the person doing the work. Corporate treasury is the
   clearest instance: they already do this, manually and correctly, and they have the headcount for
   it.
2. **A micro business with five suppliers paid in cash or from a personal account.** There is no
   payment run to instrument, the CFDI discipline is not there, and the deduction exposure is too
   small to justify a weekly workflow.
3. **A salaried consumer.** One predictable deposit, no supplier ledger, no Article 69-B exposure,
   no irreversible outbound payment at volume. It is also the saturated lane at this event, see the
   prior-winners list in `docs/00-challenge.md`.

**Who looks like an anti-persona and is not.** The external accounting firm holding the XML of
thirty companies like this one. It is not the user, it is the channel: same product, one screen,
thirty ledgers. It belongs in `docs/05-business-model.md` as distribution, not here.

## How we validated this

Ranked by strength, and honest about which ones are done.

1. **Primary, at the venue. NOT DONE YET.** The protocol is below. Until this file carries a date, a
   count and one surprising answer, nobody says "we validated this with users" out loud.
   TODO(garzario).
2. **Primary documents. PARTIALLY DONE.** The constraints this persona lives inside are public and
   citable: the CFF Article 69-B mechanism and the SAT list itself, the finality of an executed
   SPEI, and the Banxico CEP that exists for every SPEI. The list and one real CEP are in the
   product as data, which is the strongest evidence obtainable in 36 hours. The citations live in
   `docs/04-market.md`. TODO(garzario) verify each at its primary source and write the identifier
   next to it.
3. **Qualitative industry exposure. FRAMING, NOT EVIDENCE.** One team member has first-hand exposure
   to how Mexican commercial banking clients behave in a back-office role. It is described at
   exactly that level: no employer named, no client named, no client data of any kind, and no number
   sourced from it. It shaped which questions we ask and it proves nothing by itself.
4. **What we did not validate.** We have not watched a real payment run. We have not timed one. We
   do not know the real frequency of supplier bank-change requests. We are not claiming a conversion
   rate anywhere. This bullet stays in the file even after the others are filled.

### The venue protocol, so this is reproducible

Ten minutes, two or three people, at HackMTY itself: participants or mentors with accounting or
administrative experience, or anyone who has paid suppliers for a small company.

Ask exactly these, in this order, and do not lead.

1. "Cuando pagas a proveedores, como te llega la cuenta a la que vas a pagar." Listen for the
   channel. If nobody says WhatsApp or email, the intake story is weaker than we think.
2. "Que revisas antes de mandar una transferencia, y cuanto te tarda." Write the number they say,
   not the number we expected.
3. "Que pasa si un proveedor te cambia de cuenta." Listen for whether anyone verifies, and how.
4. Only at the end, and only if they raise it themselves: "Revisas la lista del 69-B." Asking it
   first teaches them the answer we want.

Rules: no names, no company names, no recordings, no photographs of their screen. Record the date,
how many people, and the one answer that surprised us. If two of three already verify new accounts
by calling the supplier, the persona survives and the pitch changes, and that change gets written
here the same hour.

## Links

Portrait goes in `assets/persona/`. Owner: Adan (`Apanawa`). It has to be an illustration or a
licensed image, never a photograph of a real person presented as Lupita.
Journey built on this persona: `docs/03-user-journey.md`.
Sizing built on this persona: `docs/04-market.md`.
Screens that serve her: issues #46 to #51.
