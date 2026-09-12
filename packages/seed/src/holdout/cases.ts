/**
 * The labelled holdout set, imported rather than read from disk so that `apps/api` can
 * serve `GET /api/v1/metrics` on the Node runtime without touching a file system.
 * Adding a case is two lines: the JSON file, and an import here.
 *
 * Every file is passed through `parseHoldoutCase` at module load, so a malformed case
 * fails at import and never reaches the metrics table as a silently skipped row.
 *
 * See ./README.md for the protocol, for what the coverage has to be, and for the
 * disclosure about how independent these labels actually are.
 */

import behaviourAmountFarAboveOwnHistory from "./cases/behaviour-amount-far-above-own-history.json";
import behaviourConcentrationJump from "./cases/behaviour-concentration-jump.json";
import behaviourIssuanceRateJump from "./cases/behaviour-issuance-rate-jump.json";
import cepHolderNameDoesNotMatchTheCfdi from "./cases/cep-holder-name-does-not-match-the-cfdi.json";
import cepHolderNamePartialMatchIsFine from "./cases/cep-holder-name-partial-match-is-fine.json";
import cepSignatureCouldNotBeVerified from "./cases/cep-signature-could-not-be-verified.json";
import cepVerifiedBeneficiaryClearsTheNewAccount from "./cases/cep-verified-beneficiary-clears-the-new-account.json";
import clabeAdjacentTranspositionPassesCheckDigit from "./cases/clabe-adjacent-transposition-passes-check-digit.json";
import clabeCheckDigitInvalid from "./cases/clabe-check-digit-invalid.json";
import clabeFirstPaymentNoAccountHistory from "./cases/clabe-first-payment-no-account-history.json";
import clabeFromPhotoLowConfidence from "./cases/clabe-from-photo-low-confidence.json";
import clabeInstitutionCodeNotInCatalogue from "./cases/clabe-institution-code-not-in-catalogue.json";
import clabeNewAccountUnbacked from "./cases/clabe-new-account-unbacked.json";
import clabeTwoDigitsOffKnownAccount from "./cases/clabe-two-digits-off-known-account.json";
import duplicateInvoiceAlreadySettledByComplement from "./cases/duplicate-invoice-already-settled-by-complement.json";
import duplicateInvoiceFolioReusedDifferentTotal from "./cases/duplicate-invoice-folio-reused-different-total.json";
import duplicateInvoiceSameAmountInsideOneRun from "./cases/duplicate-invoice-same-amount-inside-one-run.json";
import duplicateInvoiceUuidLoadedTwice from "./cases/duplicate-invoice-uuid-loaded-twice.json";
import legitimateBankChangeRelease from "./cases/legitimate-bank-change-release.json";
import legitimateNewSupplierRampingUp from "./cases/legitimate-new-supplier-ramping-up.json";
import lowOcrConfidenceOnTheUsualAccount from "./cases/low-ocr-confidence-on-the-usual-account.json";
import ordinaryRepeatPaymentOnTheUsualAccount from "./cases/ordinary-repeat-payment-on-the-usual-account.json";
import paymentMarkedSentIsNotInTheBankMirror from "./cases/payment-marked-sent-is-not-in-the-bank-mirror.json";
import roundNumberInvoiceIsJustARetainer from "./cases/round-number-invoice-is-just-a-retainer.json";
import sameAmountOneQuarterApartIsNotADuplicate from "./cases/same-amount-one-quarter-apart-is-not-a-duplicate.json";
import sat69bDefinitivoAndNewAccount from "./cases/sat-69b-definitivo-and-new-account.json";
import sat69bDefinitivoHold from "./cases/sat-69b-definitivo-hold.json";
import sat69bPresuntoVerify from "./cases/sat-69b-presunto-verify.json";
import satStatusDesvirtuadoBeforeThePayment from "./cases/sat-status-desvirtuado-before-the-payment.json";
import thinHistoryHasNoBaselineToTest from "./cases/thin-history-has-no-baseline-to-test.json";
import type { HoldoutCase } from "./types";
import { parseHoldoutCase } from "./types";

/** The directory the loader in scripts/eval.ts reads, relative to the repository root. */
export const HOLDOUT_CASES_DIR = "packages/seed/src/holdout/cases";

/** Every labelled case, in file-name order so two runs print the same table. */
export const HOLDOUT_CASES: readonly HoldoutCase[] = [
  behaviourAmountFarAboveOwnHistory,
  behaviourConcentrationJump,
  behaviourIssuanceRateJump,
  cepHolderNameDoesNotMatchTheCfdi,
  cepHolderNamePartialMatchIsFine,
  cepSignatureCouldNotBeVerified,
  cepVerifiedBeneficiaryClearsTheNewAccount,
  clabeAdjacentTranspositionPassesCheckDigit,
  clabeCheckDigitInvalid,
  clabeFirstPaymentNoAccountHistory,
  clabeFromPhotoLowConfidence,
  clabeInstitutionCodeNotInCatalogue,
  clabeNewAccountUnbacked,
  clabeTwoDigitsOffKnownAccount,
  duplicateInvoiceAlreadySettledByComplement,
  duplicateInvoiceFolioReusedDifferentTotal,
  duplicateInvoiceSameAmountInsideOneRun,
  duplicateInvoiceUuidLoadedTwice,
  legitimateBankChangeRelease,
  legitimateNewSupplierRampingUp,
  lowOcrConfidenceOnTheUsualAccount,
  ordinaryRepeatPaymentOnTheUsualAccount,
  paymentMarkedSentIsNotInTheBankMirror,
  roundNumberInvoiceIsJustARetainer,
  sameAmountOneQuarterApartIsNotADuplicate,
  sat69bDefinitivoAndNewAccount,
  sat69bDefinitivoHold,
  sat69bPresuntoVerify,
  satStatusDesvirtuadoBeforeThePayment,
  thinHistoryHasNoBaselineToTest,
].map((value) => parseHoldoutCase(value));
