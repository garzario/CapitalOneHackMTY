/**
 * GENERATED FILE. Do not edit: run `bun run web:mock` instead.
 *
 * The offline payment run the app falls back to when the API is not there,
 * written out of the same seeded company the API serves in the demo. Seed
 * 69, week of 2026-09-07, run `run-2026-09-07`. The generator is
 * `scripts/web-mock.ts` and its header says where each block comes from and
 * what is deliberately not one for one with the API.
 *
 * 44 suppliers, 92 instructions, 7 findings, and the 156 invoices of
 * the company's 4103 that a screen of this app can reach.
 *
 * Every object here carries `synthetic: true` where the domain has the flag,
 * and every RFC is synthetic, because ADR-0002 makes the watermark a property of
 * the data rather than of a screen. `mock.test.ts` asserts both over the whole
 * graph, and `web-mock.test.ts` fails when this file stops matching the
 * generator.
 */

import type {
  Cep,
  Cfdi,
  Decision,
  Finding,
  Metrics,
  NameMatch,
  PaymentComplement,
  PaymentInstruction,
  Rfc,
  SatListEntry,
  Supplier,
  SweepResult,
  VerificationState,
} from "@hackmty/core";
import type { PaymentRunTotals, SatVersion } from "./contract";

/** The seed, the week and the run this file was written from. */
export const SEED = 69;
export const WEEK_OF = "2026-09-07";
export const RUN_ID = "run-2026-09-07";
/** The day the run is prepared, which is the instant the controls were given. */
export const RUN_DAY = "2026-09-10";
export const RUN_AT = "2026-09-10T15:00:00.000Z";

export const COMPANY_RFC: Rfc = "SYN090615C01";
export const COMPANY_NAME = "Metalicos del Norte SA de CV";

/** The run lines the demo opens on, in demo order. */
export const HERO_INSTRUCTION_IDS: readonly string[] = ["INS-2026-09-07-047","INS-2026-09-07-029","INS-2026-09-07-016","INS-2026-09-07-070"];

/** The supplier the simulated Article 69-B publication names. */
export const LISTED_SUPPLIER_RFC: Rfc = "SYN080910HI8";

export const SUPPLIERS: readonly Supplier[] = [
  {"rfc":"SYN980101S01","legalName":"Aceros y Laminas del Norte SA de CV","firstInvoiceAt":"2020-09-07T15:00:00.000Z","knownAccounts":[{"clabe":"072180100000000007","establishedBy":"payment_complement","establishedAt":"2020-10-07T15:00:00.000Z","timesPaid":58}],"delayCostPerDay":3403.07,"synthetic":true},
  {"rfc":"SYN990202S02","legalName":"Maquinados Industriales Regios SA de CV","firstInvoiceAt":"2021-03-08T15:00:00.000Z","knownAccounts":[{"clabe":"012180100091764613","establishedBy":"payment_complement","establishedAt":"2021-04-07T15:00:00.000Z","timesPaid":52}],"delayCostPerDay":1120.05,"synthetic":true},
  {"rfc":"SYN000303S03","legalName":"Troquelados de Pesqueria SA de CV","firstInvoiceAt":"2022-08-08T15:00:00.000Z","knownAccounts":[{"clabe":"058180100183529225","establishedBy":"payment_complement","establishedAt":"2022-09-07T15:00:00.000Z","timesPaid":37}],"delayCostPerDay":447.09,"synthetic":true},
  {"rfc":"SYN010404S04","legalName":"Fundiciones Guadalupe S de RL de CV","firstInvoiceAt":"2020-01-07T15:00:00.000Z","knownAccounts":[{"clabe":"072180100275293830","establishedBy":"payment_complement","establishedAt":"2020-02-07T15:00:00.000Z","timesPaid":65}],"delayCostPerDay":1511.74,"synthetic":true},
  {"rfc":"SYN020505S05","legalName":"Soldaduras y Montajes Escobedo SA de CV","firstInvoiceAt":"2023-01-09T15:00:00.000Z","knownAccounts":[{"clabe":"014180100367058446","establishedBy":"payment_complement","establishedAt":"2023-02-07T15:00:00.000Z","timesPaid":32}],"delayCostPerDay":248.11,"synthetic":true},
  {"rfc":"SYN030606S06","legalName":"Recubrimientos Electroliticos del Poniente SA de CV","firstInvoiceAt":"2023-08-07T15:00:00.000Z","knownAccounts":[{"clabe":"002180100458823055","establishedBy":"payment_complement","establishedAt":"2023-09-07T15:00:00.000Z","timesPaid":26}],"delayCostPerDay":251.02,"synthetic":true},
  {"rfc":"SYN040707S07","legalName":"Tornilleria y Sujetadores Apodaca SA de CV","firstInvoiceAt":"2019-04-08T15:00:00.000Z","knownAccounts":[{"clabe":"012180100550587661","establishedBy":"payment_complement","establishedAt":"2019-05-07T15:00:00.000Z","timesPaid":73}],"delayCostPerDay":146.79,"synthetic":true},
  {"rfc":"SYN050808S08","legalName":"Perfiles Estructurales Monterrey SA de CV","firstInvoiceAt":"2020-06-08T15:00:00.000Z","knownAccounts":[{"clabe":"072180100642352278","establishedBy":"payment_complement","establishedAt":"2020-07-07T15:00:00.000Z","timesPaid":60}],"delayCostPerDay":985.99,"synthetic":true},
  {"rfc":"SYN060909S09","legalName":"Herramentales de Precision San Nicolas SA de CV","firstInvoiceAt":"2021-09-07T15:00:00.000Z","knownAccounts":[{"clabe":"058180100734116883","establishedBy":"payment_complement","establishedAt":"2021-10-07T15:00:00.000Z","timesPaid":47}],"delayCostPerDay":736.72,"synthetic":true},
  {"rfc":"SYN071010S10","legalName":"Laminados en Frio del Noreste SA de CV","firstInvoiceAt":"2022-02-07T15:00:00.000Z","knownAccounts":[{"clabe":"014180100825881498","establishedBy":"payment_complement","establishedAt":"2022-03-07T15:00:00.000Z","timesPaid":42}],"delayCostPerDay":889.85,"synthetic":true},
  {"rfc":"SYN081111S11","legalName":"Transportes Industriales Juarez S de RL de CV","firstInvoiceAt":"2021-06-07T15:00:00.000Z","knownAccounts":[{"clabe":"127180100917646108","establishedBy":"payment_complement","establishedAt":"2021-07-07T15:00:00.000Z","timesPaid":50}],"delayCostPerDay":288.3,"synthetic":true},
  {"rfc":"SYN091212S12","legalName":"Empaques y Tarimas del Noreste SA de CV","firstInvoiceAt":"2022-05-09T15:00:00.000Z","knownAccounts":[{"clabe":"002180101009410719","establishedBy":"payment_complement","establishedAt":"2022-06-07T15:00:00.000Z","timesPaid":40}],"delayCostPerDay":131.89,"synthetic":true},
  {"rfc":"SYN100113S13","legalName":"Mantenimiento Electromecanico Regio SA de CV","firstInvoiceAt":"2022-11-07T15:00:00.000Z","knownAccounts":[{"clabe":"012180101101175324","establishedBy":"payment_complement","establishedAt":"2022-12-07T15:00:00.000Z","timesPaid":34}],"delayCostPerDay":277.57,"synthetic":true},
  {"rfc":"SYN110214S14","legalName":"Equipo de Proteccion Industrial del Norte SA de CV","firstInvoiceAt":"2023-04-07T15:00:00.000Z","knownAccounts":[{"clabe":"044180101192939932","establishedBy":"payment_complement","establishedAt":"2023-05-08T15:00:00.000Z","timesPaid":30}],"delayCostPerDay":101.98,"synthetic":true},
  {"rfc":"SYN120315S15","legalName":"Gases Industriales Santa Catarina SA de CV","firstInvoiceAt":"2019-09-09T15:00:00.000Z","knownAccounts":[{"clabe":"072180101284704542","establishedBy":"payment_complement","establishedAt":"2019-10-07T15:00:00.000Z","timesPaid":68}],"delayCostPerDay":259.74,"synthetic":true},
  {"rfc":"SYN130416S16","legalName":"Rectificaciones y Baleros Escobedo S de RL de CV","firstInvoiceAt":"2023-11-07T15:00:00.000Z","knownAccounts":[{"clabe":"058180101376469159","establishedBy":"payment_complement","establishedAt":"2023-12-07T15:00:00.000Z","timesPaid":23}],"delayCostPerDay":394.86,"synthetic":true},
  {"rfc":"SYN140517S17","legalName":"Corte por Laser Apodaca SA de CV","firstInvoiceAt":"2023-06-07T15:00:00.000Z","knownAccounts":[{"clabe":"012180101468233763","establishedBy":"payment_complement","establishedAt":"2023-07-07T15:00:00.000Z","timesPaid":28}],"delayCostPerDay":656.66,"synthetic":true},
  {"rfc":"SYN150618S18","legalName":"Aceros Inoxidables del Poniente SA de CV","firstInvoiceAt":"2021-12-07T15:00:00.000Z","knownAccounts":[{"clabe":"014180101559998371","establishedBy":"payment_complement","establishedAt":"2022-01-07T15:00:00.000Z","timesPaid":44}],"delayCostPerDay":1914.62,"synthetic":true},
  {"rfc":"SYN160719S19","legalName":"Galvanizados Pesqueria SA de CV","firstInvoiceAt":"2024-03-07T15:00:00.000Z","knownAccounts":[{"clabe":"002180101651762983","establishedBy":"payment_complement","establishedAt":"2024-04-08T15:00:00.000Z","timesPaid":20}],"delayCostPerDay":447.09,"synthetic":true},
  {"rfc":"SYN170820S20","legalName":"Inyeccion de Plasticos Tecnicos Regios SA de CV","firstInvoiceAt":"2022-09-07T15:00:00.000Z","knownAccounts":[{"clabe":"072180101743527590","establishedBy":"payment_complement","establishedAt":"2022-10-07T15:00:00.000Z","timesPaid":36}],"delayCostPerDay":427.23,"synthetic":true},
  {"rfc":"SYN180921S21","legalName":"Bandas y Transmisiones del Noreste SA de CV","firstInvoiceAt":"2020-12-07T15:00:00.000Z","knownAccounts":[{"clabe":"012180101835292201","establishedBy":"payment_complement","establishedAt":"2021-01-07T15:00:00.000Z","timesPaid":55}],"delayCostPerDay":165.1,"synthetic":true},
  {"rfc":"SYN191022S22","legalName":"Estructuras Metalicas Santa Catarina SA de CV","firstInvoiceAt":"2021-04-07T15:00:00.000Z","knownAccounts":[{"clabe":"058180101927056814","establishedBy":"payment_complement","establishedAt":"2021-05-07T15:00:00.000Z","timesPaid":51}],"delayCostPerDay":2553.32,"synthetic":true},
  {"rfc":"SYN201123S23","legalName":"Tratamientos Termicos del Norte S de RL de CV","firstInvoiceAt":"2023-02-07T15:00:00.000Z","knownAccounts":[{"clabe":"014180102018821425","establishedBy":"payment_complement","establishedAt":"2023-03-07T15:00:00.000Z","timesPaid":32}],"delayCostPerDay":290.34,"synthetic":true},
  {"rfc":"SYN211224S24","legalName":"Suministros Hidraulicos Juarez SA de CV","firstInvoiceAt":"2023-09-07T15:00:00.000Z","knownAccounts":[{"clabe":"044180102110586036","establishedBy":"payment_complement","establishedAt":"2023-10-09T15:00:00.000Z","timesPaid":25}],"delayCostPerDay":184.04,"synthetic":true},
  {"rfc":"SYN220125S25","legalName":"Moldes y Dados Monterrey SA de CV","firstInvoiceAt":"2020-04-07T15:00:00.000Z","knownAccounts":[{"clabe":"072180102202350647","establishedBy":"payment_complement","establishedAt":"2020-05-07T15:00:00.000Z","timesPaid":62}],"delayCostPerDay":1136.39,"synthetic":true},
  {"rfc":"SYN980226S26","legalName":"Pailerias y Tanques Garcia SA de CV","firstInvoiceAt":"2024-01-08T15:00:00.000Z","knownAccounts":[{"clabe":"012180102294115258","establishedBy":"payment_complement","establishedAt":"2024-02-07T15:00:00.000Z","timesPaid":22}],"delayCostPerDay":653.48,"synthetic":true},
  {"rfc":"SYN990327S27","legalName":"Alambres y Mallas del Noreste SA de CV","firstInvoiceAt":"2021-11-08T15:00:00.000Z","knownAccounts":[{"clabe":"002180102385879866","establishedBy":"payment_complement","establishedAt":"2021-12-07T15:00:00.000Z","timesPaid":45}],"delayCostPerDay":311.4,"synthetic":true},
  {"rfc":"SYN000428S28","legalName":"Servicios de Pintura Industrial Regia SA de CV","firstInvoiceAt":"2024-06-07T15:00:00.000Z","knownAccounts":[{"clabe":"127180102477644473","establishedBy":"payment_complement","establishedAt":"2024-07-08T15:00:00.000Z","timesPaid":17}],"delayCostPerDay":211.84,"synthetic":true},
  {"rfc":"SYN010501S29","legalName":"Rodamientos y Retenes San Nicolas SA de CV","firstInvoiceAt":"2020-10-07T15:00:00.000Z","knownAccounts":[{"clabe":"058180102569409080","establishedBy":"payment_complement","establishedAt":"2020-11-09T15:00:00.000Z","timesPaid":57}],"delayCostPerDay":117.92,"synthetic":true},
  {"rfc":"SYN020602S30","legalName":"Calibracion y Metrologia del Norte S de RL de CV","firstInvoiceAt":"2022-06-07T15:00:00.000Z","knownAccounts":[{"clabe":"014180102661173698","establishedBy":"payment_complement","establishedAt":"2022-07-07T15:00:00.000Z","timesPaid":39}],"delayCostPerDay":153.29,"synthetic":true},
  {"rfc":"SYN030703S31","legalName":"Chatarra y Reciclado Metalico Regio SA de CV","firstInvoiceAt":"2022-12-07T15:00:00.000Z","knownAccounts":[{"clabe":"072180102752938302","establishedBy":"payment_complement","establishedAt":"2023-01-09T15:00:00.000Z","timesPaid":33}],"delayCostPerDay":303.5,"synthetic":true},
  {"rfc":"SYN040804S32","legalName":"Motores y Reductores del Poniente SA de CV","firstInvoiceAt":"2023-05-08T15:00:00.000Z","knownAccounts":[{"clabe":"012180102844702914","establishedBy":"payment_complement","establishedAt":"2023-06-07T15:00:00.000Z","timesPaid":29}],"delayCostPerDay":252.6,"synthetic":true},
  {"rfc":"SYN050905S33","legalName":"Cortes de Placa Pesqueria S de RL de CV","firstInvoiceAt":"2024-04-08T15:00:00.000Z","knownAccounts":[{"clabe":"002180102936467520","establishedBy":"payment_complement","establishedAt":"2024-05-07T15:00:00.000Z","timesPaid":19}],"delayCostPerDay":455.97,"synthetic":true},
  {"rfc":"SYN061006S34","legalName":"Extrusiones de Aluminio del Noreste SA de CV","firstInvoiceAt":"2021-07-07T15:00:00.000Z","knownAccounts":[{"clabe":"044180103028232138","establishedBy":"payment_complement","establishedAt":"2021-08-09T15:00:00.000Z","timesPaid":49}],"delayCostPerDay":668.64,"synthetic":true},
  {"rfc":"SYN071107S35","legalName":"Herreria y Forja Guadalupe SA de CV","firstInvoiceAt":"2022-03-07T15:00:00.000Z","knownAccounts":[{"clabe":"058180103119996748","establishedBy":"payment_complement","establishedAt":"2022-04-07T15:00:00.000Z","timesPaid":41}],"delayCostPerDay":139.86,"synthetic":true},
  {"rfc":"SYN081208S36","legalName":"Consumibles de Soldadura Apodaca SA de CV","firstInvoiceAt":"2020-03-09T15:00:00.000Z","knownAccounts":[{"clabe":"012180103211761354","establishedBy":"payment_complement","establishedAt":"2020-04-07T15:00:00.000Z","timesPaid":63}],"delayCostPerDay":129.88,"synthetic":true},
  {"rfc":"SYN090109S37","legalName":"Logistica y Maniobras del Norte SA de CV","firstInvoiceAt":"2023-10-09T15:00:00.000Z","knownAccounts":[{"clabe":"127180103303525966","establishedBy":"payment_complement","establishedAt":"2023-11-07T15:00:00.000Z","timesPaid":24}],"delayCostPerDay":158.65,"synthetic":true},
  {"rfc":"SYN100210S38","legalName":"Resortes Industriales Monterrey S de RL de CV","firstInvoiceAt":"2021-02-08T15:00:00.000Z","knownAccounts":[{"clabe":"058180205619396283","establishedBy":"payment_complement","establishedAt":"2026-08-27T17:00:00.000Z","timesPaid":1},{"clabe":"072180103395290574","establishedBy":"payment_complement","establishedAt":"2021-03-08T15:00:00.000Z","timesPaid":53}],"delayCostPerDay":279.33,"synthetic":true},
  {"rfc":"SYN110311S39","legalName":"Automatizacion y Control Regio SA de CV","firstInvoiceAt":"2023-07-07T15:00:00.000Z","knownAccounts":[{"clabe":"014180103487055180","establishedBy":"payment_complement","establishedAt":"2023-08-07T15:00:00.000Z","timesPaid":27}],"delayCostPerDay":455.86,"synthetic":true},
  {"rfc":"SYN120412S40","legalName":"Fundicion de Aluminio Garcia SA de CV","firstInvoiceAt":"2024-02-07T15:00:00.000Z","knownAccounts":[{"clabe":"002180103578819797","establishedBy":"payment_complement","establishedAt":"2024-03-07T15:00:00.000Z","timesPaid":21}],"delayCostPerDay":799.85,"synthetic":true},
  {"rfc":"SYN130513S41","legalName":"Maquilas Metalicas del Noreste SA de CV","firstInvoiceAt":"2022-07-07T15:00:00.000Z","knownAccounts":[{"clabe":"058180103670584408","establishedBy":"payment_complement","establishedAt":"2022-08-08T15:00:00.000Z","timesPaid":38}],"delayCostPerDay":805.03,"synthetic":true},
  {"rfc":"SYN140614S42","legalName":"Refacciones Neumaticas Juarez SA de CV","firstInvoiceAt":"2023-03-07T15:00:00.000Z","knownAccounts":[{"clabe":"012180103762349018","establishedBy":"payment_complement","establishedAt":"2023-04-07T15:00:00.000Z","timesPaid":31}],"delayCostPerDay":122.81,"synthetic":true},
  {"rfc":"SYN260401R43","legalName":"Recubrimientos Ceramicos de Pesqueria SA de CV","firstInvoiceAt":"2026-01-07T15:00:00.000Z","knownAccounts":[{"clabe":"021180043000000432","establishedBy":"payment_complement","establishedAt":"2026-02-09T15:00:00.000Z","timesPaid":1}],"delayCostPerDay":4611.27,"synthetic":true},
  {"rfc":"SYN080910HI8","legalName":"MATERIALES SINTETICOS OCHO SA DE CV","firstInvoiceAt":"2023-11-07T15:00:00.000Z","knownAccounts":[{"clabe":"044180080910000083","establishedBy":"payment_complement","establishedAt":"2023-12-07T15:00:00.000Z","timesPaid":23}],"delayCostPerDay":760.67,"synthetic":true},
];

export const INSTRUCTIONS: readonly PaymentInstruction[] = [
  {"id":"INS-2026-09-07-001","supplierRfc":"SYN201123S23","cfdiUuids":["e8193f26-92f4-4319-b2c9-a72fe2e3e427"],"clabe":"014180102018821425","amount":5353.61,"source":"whatsapp","receivedAt":"2026-09-07T14:12:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-002","supplierRfc":"SYN000428S28","cfdiUuids":["d90515b2-0375-434a-ab27-9e97a3488551"],"clabe":"127180102477644473","amount":3364.51,"source":"whatsapp","receivedAt":"2026-09-07T14:57:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-003","supplierRfc":"SYN180921S21","cfdiUuids":["15f5c65d-4ab4-4129-93a6-ddbbf4503129"],"clabe":"012180101835292201","amount":2269.04,"source":"portal","receivedAt":"2026-09-07T15:18:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-004","supplierRfc":"SYN990202S02","cfdiUuids":["16f95305-4010-489b-82c0-2312b3e6b006"],"clabe":"012180100091764613","amount":17612.98,"source":"email","receivedAt":"2026-09-07T15:26:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-005","supplierRfc":"SYN110214S14","cfdiUuids":["58d1907c-b5d1-478b-a026-0773af99a34a"],"clabe":"044180101192939932","amount":2548.3,"source":"whatsapp","receivedAt":"2026-09-07T15:45:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-006","supplierRfc":"SYN091212S12","cfdiUuids":["7902b726-c8c0-40b7-9aab-36769f8d2261"],"clabe":"002180101009410719","amount":1281.06,"source":"email","receivedAt":"2026-09-07T15:46:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-007","supplierRfc":"SYN091212S12","cfdiUuids":["f46f93c3-5ea4-4ec7-bfaf-5b18c1df347f","1db52c0e-57c1-4a54-9878-4cf41448ef21"],"clabe":"002180101009410719","amount":2693,"source":"email","receivedAt":"2026-09-07T15:54:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-008","supplierRfc":"SYN040707S07","cfdiUuids":["2a21943a-66a1-4d20-8c93-2ac0af31f169","e049e1ab-5bed-4bc0-8c7d-9d52ef22300c"],"clabe":"012180100550587661","amount":4278.94,"source":"email","receivedAt":"2026-09-07T16:33:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-009","supplierRfc":"SYN160719S19","cfdiUuids":["a7a63bdc-b05d-4d30-bf45-8f411d6af22b"],"clabe":"002180101651762983","amount":7279.21,"source":"portal","receivedAt":"2026-09-07T16:49:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-010","supplierRfc":"SYN020505S05","cfdiUuids":["880a4e15-cd59-47ff-b5c5-48b208913fab","d60b78a2-3a84-407d-8b38-914b8ffe90c9"],"clabe":"014180100367058446","amount":10212.55,"source":"email","receivedAt":"2026-09-07T17:01:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-011","supplierRfc":"SYN120412S40","cfdiUuids":["74c87066-a7d2-4b1d-92a9-5b46cbea6752"],"clabe":"002180103578819797","amount":100000,"source":"whatsapp","receivedAt":"2026-09-07T17:39:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-012","supplierRfc":"SYN010501S29","cfdiUuids":["4c421b3a-f31b-4518-851d-a843b013cd1e","378d8768-72f4-4ba6-927e-c9b06cd28f83"],"clabe":"058180102569409080","amount":5311.01,"source":"portal","receivedAt":"2026-09-07T19:14:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-013","supplierRfc":"SYN030703S31","cfdiUuids":["4ea7129a-707e-4daa-96b5-541629d8632c"],"clabe":"072180102752938302","amount":5300.4,"source":"email","receivedAt":"2026-09-07T20:18:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-014","supplierRfc":"SYN040707S07","cfdiUuids":["d82cca50-bcc0-4553-8c7f-6d543322ea1c","321b89d2-6757-4a01-bfe6-ab347242b15c"],"clabe":"012180100550587661","amount":3544.63,"source":"portal","receivedAt":"2026-09-07T20:23:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-015","supplierRfc":"SYN010501S29","cfdiUuids":["7502cd79-e4d4-4714-b43a-c2ee325f126b"],"clabe":"058180102569409080","amount":1349.28,"source":"manual","receivedAt":"2026-09-07T21:11:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-016","supplierRfc":"SYN050808S08","cfdiUuids":["a65cc136-87d7-4770-96ea-899e94e4a1bf"],"clabe":"072180100642352278","amount":54631.41,"source":"email","receivedAt":"2026-09-07T21:33:00.000Z","text":"Buen dia, le reenvio la factura A-32 que aparece pendiente en nuestro sistema. Quedo atento al pago.","synthetic":true},
  {"id":"INS-2026-09-07-017","supplierRfc":"SYN071010S10","cfdiUuids":["5e8bcaa3-6ff8-4732-9640-4fd1d04f3ddd"],"clabe":"014180100825881498","amount":57953.43,"source":"email","receivedAt":"2026-09-07T21:37:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-018","supplierRfc":"SYN100210S38","cfdiUuids":["29e16674-e713-4c00-8a6e-e87a36dc6c75"],"clabe":"058180205619396283","amount":9001.23,"source":"whatsapp","receivedAt":"2026-09-07T21:55:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-019","supplierRfc":"SYN081208S36","cfdiUuids":["6d0cbfe1-f390-4b9e-b5d3-ab2a2da07839"],"clabe":"012180103211761354","amount":3007.15,"source":"pdf","receivedAt":"2026-09-07T22:01:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-020","supplierRfc":"SYN120315S15","cfdiUuids":["3e3a37b8-b4e9-4749-ae45-5a4d1c80da18"],"clabe":"072180101284704542","amount":6728,"source":"email","receivedAt":"2026-09-07T22:32:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-021","supplierRfc":"SYN030606S06","cfdiUuids":["38384d3d-47a3-4bb6-a6c8-bcf28b881bac","4d039c80-6c65-4688-ac6e-33443d4ace2a"],"clabe":"002180100458823055","amount":8275.1,"source":"email","receivedAt":"2026-09-07T22:50:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-022","supplierRfc":"SYN071107S35","cfdiUuids":["e6fca4c0-c20d-425a-81bc-e07e0fe2d5b2"],"clabe":"058180103119996748","amount":4378.71,"source":"email","receivedAt":"2026-09-07T23:28:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-023","supplierRfc":"SYN020505S05","cfdiUuids":["ceeda867-86e8-46d2-9215-e2cb36efe797"],"clabe":"014180100367058446","amount":3237.8,"source":"whatsapp","receivedAt":"2026-09-07T23:34:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-024","supplierRfc":"SYN990327S27","cfdiUuids":["90616e16-e59b-495f-8de6-a41228aabd80"],"clabe":"002180102385879866","amount":2466.48,"source":"pdf","receivedAt":"2026-09-08T14:08:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-025","supplierRfc":"SYN020505S05","cfdiUuids":["990ccbd2-37bb-4914-9b9d-50f4fcb4aa44"],"clabe":"014180100367058446","amount":9331.91,"source":"whatsapp","receivedAt":"2026-09-08T14:43:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-026","supplierRfc":"SYN120315S15","cfdiUuids":["9213c4d1-f59a-4552-8585-13f74c8ad773"],"clabe":"072180101284704542","amount":3306.81,"source":"portal","receivedAt":"2026-09-08T15:07:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-027","supplierRfc":"SYN040707S07","cfdiUuids":["88879dc3-aeef-4a68-b768-be7076e69393"],"clabe":"012180100550587661","amount":1036.62,"source":"email","receivedAt":"2026-09-08T15:14:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-028","supplierRfc":"SYN211224S24","cfdiUuids":["75bdffc0-f835-4136-b51e-1ccf6295c8fc"],"clabe":"044180102110586036","amount":3628.4,"source":"email","receivedAt":"2026-09-08T15:36:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-029","supplierRfc":"SYN980101S01","cfdiUuids":["bedc7bda-b026-43be-a28a-87b930d6818b","421719c5-8309-4840-a46b-6ea53e774176"],"clabe":"072180886644349800","amount":537960.97,"source":"pdf","receivedAt":"2026-09-08T15:42:00.000Z","synthetic":true,"imageRef":"intake/2026-09-08-SYN980101S01.jpg","ocrConfidence":0.82},
  {"id":"INS-2026-09-07-030","supplierRfc":"SYN100113S13","cfdiUuids":["b0f96f70-e5f1-400b-ba3a-0234a16eb4fb","006553e5-e83e-40cf-a038-e6a2c9126141","0ace56f6-10cd-489b-aecb-c588d05df658"],"clabe":"012180101101175324","amount":15959.41,"source":"email","receivedAt":"2026-09-08T15:43:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-031","supplierRfc":"SYN071010S10","cfdiUuids":["8ae048af-5fc6-497e-b60e-a498d1b1d4a8"],"clabe":"014180100825881498","amount":29700.18,"source":"pdf","receivedAt":"2026-09-08T16:08:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-032","supplierRfc":"SYN260401R43","cfdiUuids":["ba715024-0a6e-4d10-8a74-6d018a523036","3e002385-4112-46a0-aea0-f28e6b262121","b50fce50-ff18-4e79-b7a9-2b825e7045d7","d0db58a1-9510-473d-b291-b63687b4a960"],"clabe":"021180043000000432","amount":100368.87,"source":"pdf","receivedAt":"2026-09-08T16:12:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-033","supplierRfc":"SYN140614S42","cfdiUuids":["b87b1a49-ad38-4755-9959-c04e373394c7"],"clabe":"012180103762349018","amount":2111.88,"source":"pdf","receivedAt":"2026-09-08T16:38:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-034","supplierRfc":"SYN081111S11","cfdiUuids":["dd6640d2-ac95-4d14-850b-97f5a03f9b01","3d0c2e6b-7e33-4979-aa9a-3402b66f309d","1cd75ef0-7a37-4455-8b3b-07927e60a28a"],"clabe":"127180100917646108","amount":12633.2,"source":"email","receivedAt":"2026-09-08T17:06:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-035","supplierRfc":"SYN980101S01","cfdiUuids":["fcdd6e59-ac49-4a82-807e-74c0ceefeb42"],"clabe":"072180100000000007","amount":235452.07,"source":"whatsapp","receivedAt":"2026-09-08T17:40:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-036","supplierRfc":"SYN990327S27","cfdiUuids":["647a0fb5-6e37-469e-a7f6-e44f8351cb9e"],"clabe":"002180102385879866","amount":4780.85,"source":"email","receivedAt":"2026-09-08T18:22:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-037","supplierRfc":"SYN000303S03","cfdiUuids":["cbd47d49-0bcf-4a3b-9532-af9b77a6623f"],"clabe":"058180100183529225","amount":3975.82,"source":"email","receivedAt":"2026-09-08T18:30:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-038","supplierRfc":"SYN090109S37","cfdiUuids":["39cfa0bb-3710-4b07-8619-4a048ad0ba2c"],"clabe":"127180103303525966","amount":4617.18,"source":"email","receivedAt":"2026-09-08T18:34:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-039","supplierRfc":"SYN090109S37","cfdiUuids":["b2b395e0-ced7-4059-9db2-3f9c9bdc2840"],"clabe":"127180103303525966","amount":1566.31,"source":"email","receivedAt":"2026-09-08T18:44:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-040","supplierRfc":"SYN130513S41","cfdiUuids":["ff8be618-9268-453e-b7e4-73b2e6881dee"],"clabe":"058180103670584408","amount":17561.32,"source":"portal","receivedAt":"2026-09-08T19:03:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-041","supplierRfc":"SYN160719S19","cfdiUuids":["3f3b304f-9ec5-41e7-88c3-6ce89fef7ec6","1e7872f3-ea32-43e8-888c-1ed7176f0b2a"],"clabe":"002180101651762983","amount":34588.87,"source":"pdf","receivedAt":"2026-09-08T19:09:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-042","supplierRfc":"SYN010501S29","cfdiUuids":["a5e738f1-9d54-4c0d-b259-5fffb36c00e3","9eda863d-5fbb-4bb7-836c-4bb850e4b6ba","17aac70c-56a3-424f-8e8d-8f98764fb72b"],"clabe":"058180102569409080","amount":3221.21,"source":"email","receivedAt":"2026-09-08T19:12:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-043","supplierRfc":"SYN081208S36","cfdiUuids":["5cd84246-8813-4317-bd0a-eac6ba82a984","717ba163-ada0-4a40-b9c1-df9ce9e94de8"],"clabe":"012180103211761354","amount":4888.81,"source":"email","receivedAt":"2026-09-08T20:21:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-044","supplierRfc":"SYN081208S36","cfdiUuids":["0c4518fa-d268-4306-a63c-4c2e59126ce6","82f186c2-f27b-4cfa-a8e6-2d5ebd7cca73","8eb0a6a5-e43e-455d-8291-2fd91b8ac7b7"],"clabe":"012180103211761354","amount":4974.4,"source":"pdf","receivedAt":"2026-09-08T20:24:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-045","supplierRfc":"SYN081111S11","cfdiUuids":["955d7fce-3241-40ed-b6c1-5dffaea58e59"],"clabe":"127180100917646108","amount":1297.91,"source":"pdf","receivedAt":"2026-09-08T20:26:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-046","supplierRfc":"SYN260401R43","cfdiUuids":["7f1bdb8c-709d-4fa1-b6c7-b135a595f968"],"clabe":"021180043000000432","amount":53360,"source":"email","receivedAt":"2026-09-08T21:36:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-047","supplierRfc":"SYN990202S02","cfdiUuids":["73d71e39-0943-4d44-a2c8-5193e60a47f4"],"clabe":"012180101391764613","amount":38417.48,"source":"whatsapp","receivedAt":"2026-09-08T21:38:00.000Z","synthetic":true,"text":"Buenas tardes, cambiamos de cuenta por temas administrativos. Le paso la CLABE nueva para el pago de esta semana, gracias."},
  {"id":"INS-2026-09-07-048","supplierRfc":"SYN081208S36","cfdiUuids":["9b9a3ff0-b9a9-4692-bbf5-7277fba14219"],"clabe":"012180103211761354","amount":1382.88,"source":"whatsapp","receivedAt":"2026-09-08T21:46:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-049","supplierRfc":"SYN130513S41","cfdiUuids":["185dc243-944d-4921-983d-cf6df2910257"],"clabe":"058180103670584408","amount":18545.44,"source":"manual","receivedAt":"2026-09-09T14:02:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-050","supplierRfc":"SYN120315S15","cfdiUuids":["51ad2ef8-af2b-48e7-ba6e-d74573672df1"],"clabe":"072180101284704542","amount":2610.85,"source":"pdf","receivedAt":"2026-09-09T14:33:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-051","supplierRfc":"SYN020505S05","cfdiUuids":["7ec708c1-74ee-443c-96cf-ad240e679602","42cef610-8ebb-4e16-8d05-73485992f64e"],"clabe":"014180100367058446","amount":15523.55,"source":"email","receivedAt":"2026-09-09T14:36:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-052","supplierRfc":"SYN020505S05","cfdiUuids":["1cf20ca8-916e-4410-ae40-75ffb4779d06"],"clabe":"014180100367058446","amount":6624.18,"source":"email","receivedAt":"2026-09-09T16:32:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-053","supplierRfc":"SYN000428S28","cfdiUuids":["78f30531-3d2b-4313-b303-37ce44f7de13"],"clabe":"127180102477644473","amount":4094.17,"source":"email","receivedAt":"2026-09-09T16:39:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-054","supplierRfc":"SYN130416S16","cfdiUuids":["3c18636b-a28b-46e9-912c-6009c0443948"],"clabe":"058180101376469159","amount":6642.13,"source":"email","receivedAt":"2026-09-09T16:52:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-055","supplierRfc":"SYN090109S37","cfdiUuids":["a754310d-dfda-4162-a5da-8410c4ffea31","590f9ead-a46b-4ca9-b467-c82c0b945b69","6c987ce5-7c2e-4935-a507-1673c0fd0661"],"clabe":"127180103303525966","amount":8379.87,"source":"email","receivedAt":"2026-09-09T17:11:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-056","supplierRfc":"SYN000303S03","cfdiUuids":["13154b39-1bcf-4ab6-8d1e-3c5f16fda45e"],"clabe":"058180100183529225","amount":8313.99,"source":"email","receivedAt":"2026-09-09T17:24:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-057","supplierRfc":"SYN100210S38","cfdiUuids":["443b882b-d488-44ae-ad3b-9392a8e1a5be","e09c48e6-c40e-42e8-b9c6-2e3975f164ff"],"clabe":"058180205619396283","amount":6325.36,"source":"email","receivedAt":"2026-09-09T17:26:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-058","supplierRfc":"SYN100113S13","cfdiUuids":["6adcf629-a0ff-49db-9170-ef1757d1b6ed"],"clabe":"012180101101175324","amount":3901.98,"source":"email","receivedAt":"2026-09-09T17:32:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-059","supplierRfc":"SYN010501S29","cfdiUuids":["77d1be33-af1d-42f2-9f5a-a9b8133fe343"],"clabe":"058180102569409080","amount":1396.42,"source":"email","receivedAt":"2026-09-09T17:43:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-060","supplierRfc":"SYN140614S42","cfdiUuids":["8a8a91e5-5853-4c6b-a3b0-2cc602ca0ae4"],"clabe":"012180103762349018","amount":973.95,"source":"email","receivedAt":"2026-09-09T18:39:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-061","supplierRfc":"SYN090109S37","cfdiUuids":["a9546087-2766-4d92-aeaf-1f0a6870aac5"],"clabe":"127180103303525966","amount":2967.81,"source":"pdf","receivedAt":"2026-09-09T20:43:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-062","supplierRfc":"SYN990202S02","cfdiUuids":["3a9ecee1-8c12-4800-b92c-44fc21b3d016","51dba7af-ed78-43f0-8ca4-6ecb6d160c14"],"clabe":"012180100091764613","amount":62528.99,"source":"whatsapp","receivedAt":"2026-09-09T21:46:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-063","supplierRfc":"SYN050808S08","cfdiUuids":["21e10a37-3a0e-471e-bb72-cd73dfc6e117"],"clabe":"072180100642352278","amount":26552.11,"source":"portal","receivedAt":"2026-09-09T22:12:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-064","supplierRfc":"SYN110214S14","cfdiUuids":["e2d69c87-799b-4101-ad9b-b7cbdd30ad9b"],"clabe":"044180101192939932","amount":1147.1,"source":"email","receivedAt":"2026-09-09T22:17:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-065","supplierRfc":"SYN081111S11","cfdiUuids":["fe74064b-41e9-481c-b8a5-9de50f4a4d7c","bba6dd9c-4f6d-4904-9203-5fb17c85953a"],"clabe":"127180100917646108","amount":4607.63,"source":"email","receivedAt":"2026-09-09T22:19:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-066","supplierRfc":"SYN081111S11","cfdiUuids":["d27ec3ec-081d-4c3f-848a-f08c2ab7af4a","5d7b5606-f169-4b9b-b173-b2dc9584a2a8","5b6013f2-9064-450a-8f58-32e2b734fea3"],"clabe":"127180100917646108","amount":12135.14,"source":"pdf","receivedAt":"2026-09-09T22:23:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-067","supplierRfc":"SYN010501S29","cfdiUuids":["64dbd06d-8d1a-4241-af65-5ad942d91a6f"],"clabe":"058180102569409080","amount":1834.15,"source":"portal","receivedAt":"2026-09-09T22:36:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-068","supplierRfc":"SYN000428S28","cfdiUuids":["5883b111-403c-4622-9094-7f3229e226c2"],"clabe":"127180102477644473","amount":4437.39,"source":"email","receivedAt":"2026-09-09T23:33:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-069","supplierRfc":"SYN050905S33","cfdiUuids":["b90da83f-8dc6-4861-8583-52aeb55dced9"],"clabe":"002180102936467520","amount":10106.29,"source":"whatsapp","receivedAt":"2026-09-10T14:01:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-070","supplierRfc":"SYN080910HI8","cfdiUuids":["d8674368-e89c-4719-a2db-2e000aac5ac0"],"clabe":"044180080910000083","amount":83520,"source":"whatsapp","receivedAt":"2026-09-10T14:15:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-071","supplierRfc":"SYN091212S12","cfdiUuids":["82014cab-6662-42d7-b786-ca157f06de59"],"clabe":"002180101009410719","amount":2131.67,"source":"whatsapp","receivedAt":"2026-09-10T15:15:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-072","supplierRfc":"SYN090109S37","cfdiUuids":["31cd86c9-0288-4741-8fc7-b0bc0d480f7d","30c6391f-edd4-4435-9d84-80ff236943fb"],"clabe":"127180103303525966","amount":5364.19,"source":"email","receivedAt":"2026-09-10T15:37:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-073","supplierRfc":"SYN000428S28","cfdiUuids":["a4b0c9cd-ecf6-4a72-a0dd-36b1ee3bf5e9"],"clabe":"127180102477644473","amount":3201.32,"source":"email","receivedAt":"2026-09-10T16:31:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-074","supplierRfc":"SYN040707S07","cfdiUuids":["589550fa-468c-4063-b93c-0efd856b68a3","8cf83dbd-d37b-437e-9ad1-d465e38cbae4","24f522ca-1f40-41cd-8b7b-8030d7e3c15a"],"clabe":"012180100550587661","amount":3931.42,"source":"email","receivedAt":"2026-09-10T17:19:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-075","supplierRfc":"SYN140614S42","cfdiUuids":["40dbec0c-a03b-43b9-a1bd-838e0c90ea2c"],"clabe":"012180103762349018","amount":1970.82,"source":"pdf","receivedAt":"2026-09-10T17:22:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-076","supplierRfc":"SYN260401R43","cfdiUuids":["c291b6c3-9d51-46df-b59f-42def06894a2"],"clabe":"021180043000000432","amount":49524.01,"source":"email","receivedAt":"2026-09-10T17:31:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-077","supplierRfc":"SYN170820S20","cfdiUuids":["eae68be8-01b9-4a73-9c72-98497eefa69e"],"clabe":"072180101743527590","amount":17400,"source":"whatsapp","receivedAt":"2026-09-10T17:54:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-078","supplierRfc":"SYN211224S24","cfdiUuids":["fe3e2d9c-cd18-483d-9758-ea46158258e0","5033bbdd-86eb-4d12-ad25-8e967d38dd2d"],"clabe":"044180102110586036","amount":4326.94,"source":"email","receivedAt":"2026-09-10T18:25:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-079","supplierRfc":"SYN100113S13","cfdiUuids":["496179f0-2ae5-47db-a0ea-c866413aed97","981944af-4ed8-425f-849a-1e6c09175989"],"clabe":"012180101101175324","amount":12774.38,"source":"email","receivedAt":"2026-09-10T18:39:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-080","supplierRfc":"SYN260401R43","cfdiUuids":["e792986d-8c46-4dba-a112-663d1f911d97"],"clabe":"021180043000000432","amount":19027.86,"source":"email","receivedAt":"2026-09-10T18:39:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-081","supplierRfc":"SYN120315S15","cfdiUuids":["aa2dabcd-12a6-4f2a-b68c-ebed9d2dc6eb"],"clabe":"072180101284704542","amount":2194.36,"source":"email","receivedAt":"2026-09-10T19:42:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-082","supplierRfc":"SYN100210S38","cfdiUuids":["bcac6450-d67d-4351-8fba-d34f4e400e13","bbc9df2f-0d82-42ba-b315-422e3866618e"],"clabe":"058180205619396283","amount":11149.71,"source":"email","receivedAt":"2026-09-10T19:57:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-083","supplierRfc":"SYN110214S14","cfdiUuids":["9d257e68-7b74-4722-aae4-ef82d0e647ef"],"clabe":"044180101192939932","amount":2885.98,"source":"email","receivedAt":"2026-09-10T20:11:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-084","supplierRfc":"SYN150618S18","cfdiUuids":["8383dbdf-01f7-4e01-b4ed-c08824dd4be5","8597ed46-cb44-4beb-821c-dd0e0363e5c0"],"clabe":"014180101559998371","amount":227819.37,"source":"whatsapp","receivedAt":"2026-09-10T20:18:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-085","supplierRfc":"SYN081111S11","cfdiUuids":["fedd3a59-6861-4e39-9876-0cbe12fd6e4d"],"clabe":"127180100917646108","amount":1768.94,"source":"email","receivedAt":"2026-09-10T22:21:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-086","supplierRfc":"SYN140517S17","cfdiUuids":["ef5c1061-6343-48f6-8a93-f6d3ae8ccafa"],"clabe":"012180101468233763","amount":15705.74,"source":"portal","receivedAt":"2026-09-10T22:39:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-087","supplierRfc":"SYN180921S21","cfdiUuids":["7a3fcd4d-bcd3-43f5-a61c-f3366307f74f"],"clabe":"012180101835292201","amount":997.6,"source":"email","receivedAt":"2026-09-10T23:21:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-088","supplierRfc":"SYN180921S21","cfdiUuids":["df77e482-7a27-4266-ad43-e71c808a5f50","b23b3e2e-ed48-46f5-a87e-0b0c1599d375","8e9229af-82d0-4117-be79-0ef6862bb5a2"],"clabe":"012180101835292201","amount":6345.91,"source":"pdf","receivedAt":"2026-09-10T23:22:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-089","supplierRfc":"SYN170820S20","cfdiUuids":["10a42c7f-dc2f-4dcc-af91-5d3c369e9b1d"],"clabe":"072180101743527590","amount":11442.32,"source":"email","receivedAt":"2026-09-10T23:30:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-090","supplierRfc":"SYN130416S16","cfdiUuids":["bccfe623-84d5-494f-8db8-c6b715262f1e"],"clabe":"058180101376469159","amount":5813.64,"source":"email","receivedAt":"2026-09-10T23:44:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-091","supplierRfc":"SYN140517S17","cfdiUuids":["fd241f2e-7ce7-4c0f-ba63-f151f0fb46b2"],"clabe":"012180101468233763","amount":22029.68,"source":"manual","receivedAt":"2026-09-10T23:44:00.000Z","synthetic":true},
  {"id":"INS-2026-09-07-092","supplierRfc":"SYN990327S27","cfdiUuids":["ce228d85-b837-4b20-865e-bd3c2c9d5b1c"],"clabe":"002180102385879866","amount":5035.21,"source":"email","receivedAt":"2026-09-10T23:46:00.000Z","synthetic":true},
];

export const FINDINGS: readonly Finding[] = [
  {"id":"duplicate_invoice:already_paid:a65cc136-87d7-4770-96ea-899e94e4a1bf","detector":"duplicate_invoice","severity":"critical","state":"comprobable","subject":{"kind":"cfdi","id":"a65cc136-87d7-4770-96ea-899e94e4a1bf"},"amountAtRisk":54631.41,"explanation":"Perfiles Estructurales Monterrey SA de CV ya emitio el complemento de pago de esta factura: 54,631.41 MXN recibidos el 2026-08-21. Volver a pagarla saca el monto completo una segunda vez.","evidence":{"rule":"already_paid","issuerRfc":"SYN050808S08","uuid":"a65cc136-87d7-4770-96ea-899e94e4a1bf","complementUuid":"cfab71f2-d5e8-4bfe-823d-366ec5cab8e1","complements":1,"paidAmount":54631.41,"lastPaidAt":"2026-08-21T17:00:00.000Z","total":54631.41,"coverage":1,"beneficiaryAccount":"072180100642352278"},"createdAt":"2026-09-10T15:00:00.000Z"},
  {"id":"clabe-INS-2026-09-07-029","detector":"clabe_forensics","severity":"critical","state":"comprobable","subject":{"kind":"instruction","id":"INS-2026-09-07-029"},"amountAtRisk":537960.97,"explanation":"El dígito verificador no cuadra: la CLABE termina en 0 y el cálculo 3-7-1 de Banxico exige 4, así que esa cuenta no puede existir. Es la primera vez que se ve esta cuenta para este proveedor, que ya tiene 1 cuenta registrada.","evidence":{"clabe":"072180886644349800","ocrChannel":true,"ocrConfidence":0.82,"institutionCode":"072","plazaCode":"180","checkDigit":"invalid","institutionName":"BANORTE","expectedCheckDigit":4,"knownAccounts":1,"signals":"check_digit_invalid,first_time_seen"},"createdAt":"2026-09-10T15:00:00.000Z"},
  {"id":"duplicate_invoice:same_amount_window:3e002385-4112-46a0-aea0-f28e6b262121","detector":"duplicate_invoice","severity":"warning","state":"requiere_verificacion","subject":{"kind":"cfdi","id":"3e002385-4112-46a0-aea0-f28e6b262121"},"amountAtRisk":13920,"explanation":"Recubrimientos Ceramicos de Pesqueria SA de CV tiene otra factura por exactamente 13,920.00 MXN a 5.98 dias de esta: 2026-08-04 y 2026-08-10. Puede ser un servicio recurrente o el mismo cobro dos veces, hay que confirmarlo con el proveedor.","evidence":{"rule":"same_amount_window","issuerRfc":"SYN260401R43","uuid":"3e002385-4112-46a0-aea0-f28e6b262121","folio":"66","originalUuid":"bca72ef6-e8c2-46bf-bbcc-b931e8c268d4","originalIssuedAt":"2026-08-04T14:40:00.000Z","originalFolio":"74","candidateIssuedAt":"2026-08-10T14:18:00.000Z","daysApart":5.98,"windowDays":7,"total":13920},"createdAt":"2026-09-10T15:00:00.000Z"},
  {"id":"duplicate_invoice:same_amount_window:7f1bdb8c-709d-4fa1-b6c7-b135a595f968","detector":"duplicate_invoice","severity":"warning","state":"requiere_verificacion","subject":{"kind":"cfdi","id":"7f1bdb8c-709d-4fa1-b6c7-b135a595f968"},"amountAtRisk":53360,"explanation":"Recubrimientos Ceramicos de Pesqueria SA de CV tiene otra factura por exactamente 53,360.00 MXN a 6.94 dias de esta: 2026-08-13 y 2026-08-06. Puede ser un servicio recurrente o el mismo cobro dos veces, hay que confirmarlo con el proveedor.","evidence":{"rule":"same_amount_window","issuerRfc":"SYN260401R43","uuid":"7f1bdb8c-709d-4fa1-b6c7-b135a595f968","folio":"71","originalUuid":"1860246a-5eb5-4b05-83ea-a7c213bc5d1e","originalIssuedAt":"2026-08-13T20:04:00.000Z","originalFolio":"51","candidateIssuedAt":"2026-08-06T21:30:00.000Z","daysApart":6.94,"windowDays":7,"total":53360},"createdAt":"2026-09-10T15:00:00.000Z"},
  {"id":"clabe-INS-2026-09-07-047","detector":"clabe_forensics","severity":"critical","state":"requiere_verificacion","subject":{"kind":"instruction","id":"INS-2026-09-07-047"},"amountAtRisk":38417.48,"explanation":"Difiere en 2 dígitos (posiciones 9 y 10) de la cuenta 012180100091764613, que ya se pagó 52 veces. Es la primera vez que se ve esta cuenta para este proveedor, que ya tiene 1 cuenta registrada.","evidence":{"clabe":"012180101391764613","ocrChannel":false,"institutionCode":"012","plazaCode":"180","checkDigit":"valid","institutionName":"BBVA MEXICO","knownAccounts":1,"nearestKnownAccount":"012180100091764613","nearestTimesPaid":52,"editOperations":2,"ocrSubstitutions":0,"differingPositions":"9,10","signals":"near_miss,first_time_seen"},"createdAt":"2026-09-10T15:00:00.000Z"},
  {"id":"sat69b:SYN080910HI8:2026-08-14:presunto","detector":"sat_69b","severity":"critical","state":"requiere_verificacion","subject":{"kind":"supplier","id":"SYN080910HI8"},"amountAtRisk":83520,"explanation":"El RFC SYN080910HI8 esta publicado como presunto en la lista del articulo 69-B desde el 2026-05-22. El plazo para desvirtuar sigue corriendo.","evidence":{"rfc":"SYN080910HI8","status":"presunto","statusLabel":"Presunto","publishedAt":"2026-05-22","listVersion":"2026-08-14","listedNow":true,"rowsHeld":1},"createdAt":"2026-09-10T15:00:00.000Z"},
  {"id":"duplicate_invoice:same_amount_window:eae68be8-01b9-4a73-9c72-98497eefa69e","detector":"duplicate_invoice","severity":"warning","state":"requiere_verificacion","subject":{"kind":"cfdi","id":"eae68be8-01b9-4a73-9c72-98497eefa69e"},"amountAtRisk":17400,"explanation":"Inyeccion de Plasticos Tecnicos Regios SA de CV tiene otra factura por exactamente 17,400.00 MXN a 6.82 dias de esta: 2026-08-13 y 2026-08-06. Puede ser un servicio recurrente o el mismo cobro dos veces, hay que confirmarlo con el proveedor.","evidence":{"rule":"same_amount_window","issuerRfc":"SYN170820S20","uuid":"eae68be8-01b9-4a73-9c72-98497eefa69e","folio":"71","originalUuid":"e3d3ebb6-098c-42e7-acc8-8fbb34d5c8a0","originalIssuedAt":"2026-08-13T17:24:00.000Z","originalFolio":"62","candidateIssuedAt":"2026-08-06T21:41:00.000Z","daysApart":6.82,"windowDays":7,"total":17400},"createdAt":"2026-09-10T15:00:00.000Z"},
];

/** Finding ids per instruction id, which is how the run screen indexes them. */
export const FINDING_IDS_BY_INSTRUCTION: Readonly<
  Record<string, readonly string[]>
> = {
  "INS-2026-09-07-001": [],
  "INS-2026-09-07-002": [],
  "INS-2026-09-07-003": [],
  "INS-2026-09-07-004": [],
  "INS-2026-09-07-005": [],
  "INS-2026-09-07-006": [],
  "INS-2026-09-07-007": [],
  "INS-2026-09-07-008": [],
  "INS-2026-09-07-009": [],
  "INS-2026-09-07-010": [],
  "INS-2026-09-07-011": [],
  "INS-2026-09-07-012": [],
  "INS-2026-09-07-013": [],
  "INS-2026-09-07-014": [],
  "INS-2026-09-07-015": [],
  "INS-2026-09-07-016": [
    "duplicate_invoice:already_paid:a65cc136-87d7-4770-96ea-899e94e4a1bf"
  ],
  "INS-2026-09-07-017": [],
  "INS-2026-09-07-018": [],
  "INS-2026-09-07-019": [],
  "INS-2026-09-07-020": [],
  "INS-2026-09-07-021": [],
  "INS-2026-09-07-022": [],
  "INS-2026-09-07-023": [],
  "INS-2026-09-07-024": [],
  "INS-2026-09-07-025": [],
  "INS-2026-09-07-026": [],
  "INS-2026-09-07-027": [],
  "INS-2026-09-07-028": [],
  "INS-2026-09-07-029": [
    "clabe-INS-2026-09-07-029"
  ],
  "INS-2026-09-07-030": [],
  "INS-2026-09-07-031": [],
  "INS-2026-09-07-032": [
    "duplicate_invoice:same_amount_window:3e002385-4112-46a0-aea0-f28e6b262121"
  ],
  "INS-2026-09-07-033": [],
  "INS-2026-09-07-034": [],
  "INS-2026-09-07-035": [],
  "INS-2026-09-07-036": [],
  "INS-2026-09-07-037": [],
  "INS-2026-09-07-038": [],
  "INS-2026-09-07-039": [],
  "INS-2026-09-07-040": [],
  "INS-2026-09-07-041": [],
  "INS-2026-09-07-042": [],
  "INS-2026-09-07-043": [],
  "INS-2026-09-07-044": [],
  "INS-2026-09-07-045": [],
  "INS-2026-09-07-046": [
    "duplicate_invoice:same_amount_window:7f1bdb8c-709d-4fa1-b6c7-b135a595f968"
  ],
  "INS-2026-09-07-047": [
    "clabe-INS-2026-09-07-047"
  ],
  "INS-2026-09-07-048": [],
  "INS-2026-09-07-049": [],
  "INS-2026-09-07-050": [],
  "INS-2026-09-07-051": [],
  "INS-2026-09-07-052": [],
  "INS-2026-09-07-053": [],
  "INS-2026-09-07-054": [],
  "INS-2026-09-07-055": [],
  "INS-2026-09-07-056": [],
  "INS-2026-09-07-057": [],
  "INS-2026-09-07-058": [],
  "INS-2026-09-07-059": [],
  "INS-2026-09-07-060": [],
  "INS-2026-09-07-061": [],
  "INS-2026-09-07-062": [],
  "INS-2026-09-07-063": [],
  "INS-2026-09-07-064": [],
  "INS-2026-09-07-065": [],
  "INS-2026-09-07-066": [],
  "INS-2026-09-07-067": [],
  "INS-2026-09-07-068": [],
  "INS-2026-09-07-069": [],
  "INS-2026-09-07-070": [
    "sat69b:SYN080910HI8:2026-08-14:presunto"
  ],
  "INS-2026-09-07-071": [],
  "INS-2026-09-07-072": [],
  "INS-2026-09-07-073": [],
  "INS-2026-09-07-074": [],
  "INS-2026-09-07-075": [],
  "INS-2026-09-07-076": [],
  "INS-2026-09-07-077": [
    "duplicate_invoice:same_amount_window:eae68be8-01b9-4a73-9c72-98497eefa69e"
  ],
  "INS-2026-09-07-078": [],
  "INS-2026-09-07-079": [],
  "INS-2026-09-07-080": [],
  "INS-2026-09-07-081": [],
  "INS-2026-09-07-082": [],
  "INS-2026-09-07-083": [],
  "INS-2026-09-07-084": [],
  "INS-2026-09-07-085": [],
  "INS-2026-09-07-086": [],
  "INS-2026-09-07-087": [],
  "INS-2026-09-07-088": [],
  "INS-2026-09-07-089": [],
  "INS-2026-09-07-090": [],
  "INS-2026-09-07-091": [],
  "INS-2026-09-07-092": []
};

export const DECISIONS: readonly Decision[] = [
  {"instructionId":"INS-2026-09-07-001","action":"release","expectedLoss":0,"delayCostPerDay":290.34,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-002","action":"release","expectedLoss":0,"delayCostPerDay":211.84,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-003","action":"release","expectedLoss":0,"delayCostPerDay":165.1,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-004","action":"release","expectedLoss":0,"delayCostPerDay":1120.05,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-005","action":"release","expectedLoss":0,"delayCostPerDay":101.98,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-006","action":"release","expectedLoss":0,"delayCostPerDay":131.89,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-007","action":"release","expectedLoss":0,"delayCostPerDay":131.89,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-008","action":"release","expectedLoss":0,"delayCostPerDay":146.79,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-009","action":"release","expectedLoss":0,"delayCostPerDay":447.09,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-010","action":"release","expectedLoss":0,"delayCostPerDay":248.11,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-011","action":"release","expectedLoss":0,"delayCostPerDay":799.85,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-012","action":"release","expectedLoss":0,"delayCostPerDay":117.92,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-013","action":"release","expectedLoss":0,"delayCostPerDay":303.5,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-014","action":"release","expectedLoss":0,"delayCostPerDay":146.79,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-015","action":"release","expectedLoss":0,"delayCostPerDay":117.92,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-016","action":"hold","expectedLoss":32778.85,"delayCostPerDay":985.99,"findings":[{"id":"duplicate_invoice:already_paid:a65cc136-87d7-4770-96ea-899e94e4a1bf","detector":"duplicate_invoice","severity":"critical","state":"comprobable","subject":{"kind":"cfdi","id":"a65cc136-87d7-4770-96ea-899e94e4a1bf"},"amountAtRisk":54631.41,"explanation":"Perfiles Estructurales Monterrey SA de CV ya emitio el complemento de pago de esta factura: 54,631.41 MXN recibidos el 2026-08-21. Volver a pagarla saca el monto completo una segunda vez.","evidence":{"rule":"already_paid","issuerRfc":"SYN050808S08","uuid":"a65cc136-87d7-4770-96ea-899e94e4a1bf","complementUuid":"cfab71f2-d5e8-4bfe-823d-366ec5cab8e1","complements":1,"paidAmount":54631.41,"lastPaidAt":"2026-08-21T17:00:00.000Z","total":54631.41,"coverage":1,"beneficiaryAccount":"072180100642352278"},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-017","action":"release","expectedLoss":0,"delayCostPerDay":889.85,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-018","action":"release","expectedLoss":0,"delayCostPerDay":279.33,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-019","action":"release","expectedLoss":0,"delayCostPerDay":129.88,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-020","action":"release","expectedLoss":0,"delayCostPerDay":259.74,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-021","action":"release","expectedLoss":0,"delayCostPerDay":251.02,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-022","action":"release","expectedLoss":0,"delayCostPerDay":139.86,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-023","action":"release","expectedLoss":0,"delayCostPerDay":248.11,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-024","action":"release","expectedLoss":0,"delayCostPerDay":311.4,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-025","action":"release","expectedLoss":0,"delayCostPerDay":248.11,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-026","action":"release","expectedLoss":0,"delayCostPerDay":259.74,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-027","action":"release","expectedLoss":0,"delayCostPerDay":146.79,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-028","action":"release","expectedLoss":0,"delayCostPerDay":184.04,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-029","action":"hold","expectedLoss":322776.58,"delayCostPerDay":3403.07,"findings":[{"id":"clabe-INS-2026-09-07-029","detector":"clabe_forensics","severity":"critical","state":"comprobable","subject":{"kind":"instruction","id":"INS-2026-09-07-029"},"amountAtRisk":537960.97,"explanation":"El dígito verificador no cuadra: la CLABE termina en 0 y el cálculo 3-7-1 de Banxico exige 4, así que esa cuenta no puede existir. Es la primera vez que se ve esta cuenta para este proveedor, que ya tiene 1 cuenta registrada.","evidence":{"clabe":"072180886644349800","ocrChannel":true,"ocrConfidence":0.82,"institutionCode":"072","plazaCode":"180","checkDigit":"invalid","institutionName":"BANORTE","expectedCheckDigit":4,"knownAccounts":1,"signals":"check_digit_invalid,first_time_seen"},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-030","action":"release","expectedLoss":0,"delayCostPerDay":277.57,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-031","action":"release","expectedLoss":0,"delayCostPerDay":889.85,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-032","action":"release","expectedLoss":2088,"delayCostPerDay":4611.27,"findings":[{"id":"duplicate_invoice:same_amount_window:3e002385-4112-46a0-aea0-f28e6b262121","detector":"duplicate_invoice","severity":"warning","state":"requiere_verificacion","subject":{"kind":"cfdi","id":"3e002385-4112-46a0-aea0-f28e6b262121"},"amountAtRisk":13920,"explanation":"Recubrimientos Ceramicos de Pesqueria SA de CV tiene otra factura por exactamente 13,920.00 MXN a 5.98 dias de esta: 2026-08-04 y 2026-08-10. Puede ser un servicio recurrente o el mismo cobro dos veces, hay que confirmarlo con el proveedor.","evidence":{"rule":"same_amount_window","issuerRfc":"SYN260401R43","uuid":"3e002385-4112-46a0-aea0-f28e6b262121","folio":"66","originalUuid":"bca72ef6-e8c2-46bf-bbcc-b931e8c268d4","originalIssuedAt":"2026-08-04T14:40:00.000Z","originalFolio":"74","candidateIssuedAt":"2026-08-10T14:18:00.000Z","daysApart":5.98,"windowDays":7,"total":13920},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-033","action":"release","expectedLoss":0,"delayCostPerDay":122.81,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-034","action":"release","expectedLoss":0,"delayCostPerDay":288.3,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-035","action":"release","expectedLoss":0,"delayCostPerDay":3403.07,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-036","action":"release","expectedLoss":0,"delayCostPerDay":311.4,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-037","action":"release","expectedLoss":0,"delayCostPerDay":447.09,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-038","action":"release","expectedLoss":0,"delayCostPerDay":158.65,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-039","action":"release","expectedLoss":0,"delayCostPerDay":158.65,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-040","action":"release","expectedLoss":0,"delayCostPerDay":805.03,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-041","action":"release","expectedLoss":0,"delayCostPerDay":447.09,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-042","action":"release","expectedLoss":0,"delayCostPerDay":117.92,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-043","action":"release","expectedLoss":0,"delayCostPerDay":129.88,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-044","action":"release","expectedLoss":0,"delayCostPerDay":129.88,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-045","action":"release","expectedLoss":0,"delayCostPerDay":288.3,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-046","action":"verify","expectedLoss":8004,"delayCostPerDay":4611.27,"findings":[{"id":"duplicate_invoice:same_amount_window:7f1bdb8c-709d-4fa1-b6c7-b135a595f968","detector":"duplicate_invoice","severity":"warning","state":"requiere_verificacion","subject":{"kind":"cfdi","id":"7f1bdb8c-709d-4fa1-b6c7-b135a595f968"},"amountAtRisk":53360,"explanation":"Recubrimientos Ceramicos de Pesqueria SA de CV tiene otra factura por exactamente 53,360.00 MXN a 6.94 dias de esta: 2026-08-13 y 2026-08-06. Puede ser un servicio recurrente o el mismo cobro dos veces, hay que confirmarlo con el proveedor.","evidence":{"rule":"same_amount_window","issuerRfc":"SYN260401R43","uuid":"7f1bdb8c-709d-4fa1-b6c7-b135a595f968","folio":"71","originalUuid":"1860246a-5eb5-4b05-83ea-a7c213bc5d1e","originalIssuedAt":"2026-08-13T20:04:00.000Z","originalFolio":"51","candidateIssuedAt":"2026-08-06T21:30:00.000Z","daysApart":6.94,"windowDays":7,"total":53360},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-047","action":"verify","expectedLoss":23050.49,"delayCostPerDay":1120.05,"findings":[{"id":"clabe-INS-2026-09-07-047","detector":"clabe_forensics","severity":"critical","state":"requiere_verificacion","subject":{"kind":"instruction","id":"INS-2026-09-07-047"},"amountAtRisk":38417.48,"explanation":"Difiere en 2 dígitos (posiciones 9 y 10) de la cuenta 012180100091764613, que ya se pagó 52 veces. Es la primera vez que se ve esta cuenta para este proveedor, que ya tiene 1 cuenta registrada.","evidence":{"clabe":"012180101391764613","ocrChannel":false,"institutionCode":"012","plazaCode":"180","checkDigit":"valid","institutionName":"BBVA MEXICO","knownAccounts":1,"nearestKnownAccount":"012180100091764613","nearestTimesPaid":52,"editOperations":2,"ocrSubstitutions":0,"differingPositions":"9,10","signals":"near_miss,first_time_seen"},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-048","action":"release","expectedLoss":0,"delayCostPerDay":129.88,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-049","action":"release","expectedLoss":0,"delayCostPerDay":805.03,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-050","action":"release","expectedLoss":0,"delayCostPerDay":259.74,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-051","action":"release","expectedLoss":0,"delayCostPerDay":248.11,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-052","action":"release","expectedLoss":0,"delayCostPerDay":248.11,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-053","action":"release","expectedLoss":0,"delayCostPerDay":211.84,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-054","action":"release","expectedLoss":0,"delayCostPerDay":394.86,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-055","action":"release","expectedLoss":0,"delayCostPerDay":158.65,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-056","action":"release","expectedLoss":0,"delayCostPerDay":447.09,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-057","action":"release","expectedLoss":0,"delayCostPerDay":279.33,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-058","action":"release","expectedLoss":0,"delayCostPerDay":277.57,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-059","action":"release","expectedLoss":0,"delayCostPerDay":117.92,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-060","action":"release","expectedLoss":0,"delayCostPerDay":122.81,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-061","action":"release","expectedLoss":0,"delayCostPerDay":158.65,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-062","action":"release","expectedLoss":0,"delayCostPerDay":1120.05,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-063","action":"release","expectedLoss":0,"delayCostPerDay":985.99,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-064","action":"release","expectedLoss":0,"delayCostPerDay":101.98,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-065","action":"release","expectedLoss":0,"delayCostPerDay":288.3,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-066","action":"release","expectedLoss":0,"delayCostPerDay":288.3,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-067","action":"release","expectedLoss":0,"delayCostPerDay":117.92,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-068","action":"release","expectedLoss":0,"delayCostPerDay":211.84,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-069","action":"release","expectedLoss":0,"delayCostPerDay":455.97,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-070","action":"verify","expectedLoss":50112,"delayCostPerDay":760.67,"findings":[{"id":"sat69b:SYN080910HI8:2026-08-14:presunto","detector":"sat_69b","severity":"critical","state":"requiere_verificacion","subject":{"kind":"supplier","id":"SYN080910HI8"},"amountAtRisk":83520,"explanation":"El RFC SYN080910HI8 esta publicado como presunto en la lista del articulo 69-B desde el 2026-05-22. El plazo para desvirtuar sigue corriendo.","evidence":{"rfc":"SYN080910HI8","status":"presunto","statusLabel":"Presunto","publishedAt":"2026-05-22","listVersion":"2026-08-14","listedNow":true,"rowsHeld":1},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-071","action":"release","expectedLoss":0,"delayCostPerDay":131.89,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-072","action":"release","expectedLoss":0,"delayCostPerDay":158.65,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-073","action":"release","expectedLoss":0,"delayCostPerDay":211.84,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-074","action":"release","expectedLoss":0,"delayCostPerDay":146.79,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-075","action":"release","expectedLoss":0,"delayCostPerDay":122.81,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-076","action":"release","expectedLoss":0,"delayCostPerDay":4611.27,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-077","action":"verify","expectedLoss":2610,"delayCostPerDay":427.23,"findings":[{"id":"duplicate_invoice:same_amount_window:eae68be8-01b9-4a73-9c72-98497eefa69e","detector":"duplicate_invoice","severity":"warning","state":"requiere_verificacion","subject":{"kind":"cfdi","id":"eae68be8-01b9-4a73-9c72-98497eefa69e"},"amountAtRisk":17400,"explanation":"Inyeccion de Plasticos Tecnicos Regios SA de CV tiene otra factura por exactamente 17,400.00 MXN a 6.82 dias de esta: 2026-08-13 y 2026-08-06. Puede ser un servicio recurrente o el mismo cobro dos veces, hay que confirmarlo con el proveedor.","evidence":{"rule":"same_amount_window","issuerRfc":"SYN170820S20","uuid":"eae68be8-01b9-4a73-9c72-98497eefa69e","folio":"71","originalUuid":"e3d3ebb6-098c-42e7-acc8-8fbb34d5c8a0","originalIssuedAt":"2026-08-13T17:24:00.000Z","originalFolio":"62","candidateIssuedAt":"2026-08-06T21:41:00.000Z","daysApart":6.82,"windowDays":7,"total":17400},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-078","action":"release","expectedLoss":0,"delayCostPerDay":184.04,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-079","action":"release","expectedLoss":0,"delayCostPerDay":277.57,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-080","action":"release","expectedLoss":0,"delayCostPerDay":4611.27,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-081","action":"release","expectedLoss":0,"delayCostPerDay":259.74,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-082","action":"release","expectedLoss":0,"delayCostPerDay":279.33,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-083","action":"release","expectedLoss":0,"delayCostPerDay":101.98,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-084","action":"release","expectedLoss":0,"delayCostPerDay":1914.62,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-085","action":"release","expectedLoss":0,"delayCostPerDay":288.3,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-086","action":"release","expectedLoss":0,"delayCostPerDay":656.66,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-087","action":"release","expectedLoss":0,"delayCostPerDay":165.1,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-088","action":"release","expectedLoss":0,"delayCostPerDay":165.1,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-089","action":"release","expectedLoss":0,"delayCostPerDay":427.23,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-090","action":"release","expectedLoss":0,"delayCostPerDay":394.86,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-091","action":"release","expectedLoss":0,"delayCostPerDay":656.66,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
  {"instructionId":"INS-2026-09-07-092","action":"release","expectedLoss":0,"delayCostPerDay":311.4,"findings":[],"decidedAt":"2026-09-10T15:00:00.000Z"},
];

/**
 * The totals the API composes, counts and pesos both, from `runMoney`.
 *
 * Recomputed in the browser by `totalsFor` after a local decision, because the
 * stored totals go stale the moment the offline path applies one.
 */
export const TOTALS: PaymentRunTotals = {
  "instructions": 92,
  "amount": 2174210.76,
  "held": 2,
  "toVerify": 4,
  "released": 86,
  "heldAmount": 592592.38,
  "toVerifyAmount": 192697.48,
  "releasedAmount": 1388920.9,
  "stoppedAmount": 785289.86,
  "amountAtRisk": 799209.86,
  "retroactive69bBase": 0,
  "retroactive69bExposure": 0
};

export const SAT_ENTRIES: readonly SatListEntry[] = [
  {"rfc":"SYN080910HI8","name":"MATERIALES SINTETICOS OCHO SA DE CV","status":"presunto","publishedAt":"2026-05-22","listVersion":"2026-08-14"},
];

export const SAT_VERSIONS: readonly SatVersion[] = [
  {"listVersion":"2026-08-14","publishedAt":"2026-05-22","rows":1},
];

/** The blind holdout, scored by the same controls the API scores it with. */
export const METRICS: Metrics = {
  "cases": 30,
  "truePositives": 17,
  "falsePositives": 3,
  "falseNegatives": 4,
  "precision": 0.85,
  "recall": 0.8095238095238095,
  "falsePositiveRate": 0.018518518518518517,
  "perDetector": {
    "sat_69b": {
      "tp": 2,
      "fp": 1,
      "fn": 1
    },
    "clabe_forensics": {
      "tp": 7,
      "fp": 1,
      "fn": 1
    },
    "duplicate_invoice": {
      "tp": 4,
      "fp": 0,
      "fn": 0
    },
    "supplier_behaviour": {
      "tp": 3,
      "fp": 0,
      "fn": 0
    },
    "beneficiary_cep": {
      "tp": 0,
      "fp": 1,
      "fn": 2
    },
    "bank_reconciliation": {
      "tp": 1,
      "fp": 0,
      "fn": 0
    }
  }
};

/** The retroactive sweep of the version this company holds, priced. */
export const SWEEP: SweepResult = {
  "listVersion": "2026-08-14",
  "newlyListed": [
    {
      "supplier": {
        "rfc": "SYN080910HI8",
        "legalName": "MATERIALES SINTETICOS OCHO SA DE CV",
        "firstInvoiceAt": "2023-11-07T15:00:00.000Z",
        "knownAccounts": [
          {
            "clabe": "044180080910000083",
            "establishedBy": "payment_complement",
            "establishedAt": "2023-12-07T15:00:00.000Z",
            "timesPaid": 23
          }
        ],
        "delayCostPerDay": 760.67,
        "synthetic": true
      },
      "status": "presunto",
      "paidCfdis": [
        {
          "uuid": "1b863590-a5ce-4520-9ede-31d11cd144ee",
          "serie": "A",
          "folio": "1",
          "issuedAt": "2026-01-09T22:33:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 35643.81,
          "iva": 5703.01,
          "total": 41346.82,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "e01108fc-289b-4f04-9a20-51415f25c24e",
          "serie": "A",
          "folio": "2",
          "issuedAt": "2026-01-14T16:25:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 42282.41,
          "iva": 6765.19,
          "total": 49047.6,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "852d6972-d180-433b-97ac-0f8c322d2832",
          "serie": "A",
          "folio": "3",
          "issuedAt": "2026-01-23T16:40:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 48044.06,
          "iva": 7687.05,
          "total": 55731.11,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "bf84dbf7-1abc-4dab-b4a3-7446c305bcf1",
          "serie": "A",
          "folio": "5",
          "issuedAt": "2026-02-05T18:47:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 24695.56,
          "iva": 3951.29,
          "total": 28646.85,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "1202445e-6c2d-4d61-aaab-12592c70f324",
          "serie": "A",
          "folio": "4",
          "issuedAt": "2026-02-19T17:33:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 17893.15,
          "iva": 2862.9,
          "total": 20756.05,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "9db35c38-4620-4eb2-b628-e9b1aa1a28c0",
          "serie": "A",
          "folio": "9",
          "issuedAt": "2026-03-06T23:08:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 72000,
          "iva": 11520,
          "total": 83520,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "c12c0b6d-44f4-4e11-a61d-1f72d2d4ef00",
          "serie": "A",
          "folio": "7",
          "issuedAt": "2026-03-17T18:54:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 25087.06,
          "iva": 4013.93,
          "total": 29100.99,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "6979423c-18a7-4ed0-96c3-39aef64fdd44",
          "serie": "A",
          "folio": "6",
          "issuedAt": "2026-03-17T20:51:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 39057.07,
          "iva": 6249.13,
          "total": 45306.2,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "da9866b5-0b99-446b-b427-b2dbffa1c540",
          "serie": "A",
          "folio": "8",
          "issuedAt": "2026-03-23T16:18:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 33830.06,
          "iva": 5412.81,
          "total": 39242.87,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "0e99f796-2787-407d-baf7-2ee56c1d736e",
          "serie": "A",
          "folio": "10",
          "issuedAt": "2026-03-24T14:02:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 26199.51,
          "iva": 4191.92,
          "total": 30391.43,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "b28a0826-ec69-4566-a473-d10175ae9bb5",
          "serie": "A",
          "folio": "13",
          "issuedAt": "2026-04-15T14:50:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 72000,
          "iva": 11520,
          "total": 83520,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "22b7fcf1-e099-497f-8cc2-14c22e18b92e",
          "serie": "A",
          "folio": "11",
          "issuedAt": "2026-04-27T18:37:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 56659.66,
          "iva": 9065.55,
          "total": 65725.21,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "7bfa4bd9-29c3-4ba8-9bd9-f2cea619da9c",
          "serie": "A",
          "folio": "12",
          "issuedAt": "2026-04-28T14:10:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 20481.28,
          "iva": 3277,
          "total": 23758.28,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "ff0b48fc-db1d-4479-b011-acae147b1bab",
          "serie": "A",
          "folio": "18",
          "issuedAt": "2026-05-01T14:21:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 25048.18,
          "iva": 4007.71,
          "total": 29055.89,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "bdbba1ea-973a-42c2-9e00-c6926f6d9ba0",
          "serie": "A",
          "folio": "14",
          "issuedAt": "2026-05-01T17:13:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 28140.12,
          "iva": 4502.42,
          "total": 32642.54,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "fac33bef-c46b-4286-b803-68b6cbacd39e",
          "serie": "A",
          "folio": "15",
          "issuedAt": "2026-05-01T21:22:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 46529.01,
          "iva": 7444.64,
          "total": 53973.65,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "ce49f5ae-fc0e-411b-b9b3-0b9371ca13b4",
          "serie": "A",
          "folio": "21",
          "issuedAt": "2026-05-08T14:21:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 14950.57,
          "iva": 2392.09,
          "total": 17342.66,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "71053440-e5d0-4c7f-912d-04be8ea27078",
          "serie": "A",
          "folio": "20",
          "issuedAt": "2026-05-11T17:36:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 19117.37,
          "iva": 3058.78,
          "total": 22176.15,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "c94a171a-40c1-4f56-98f4-dcd1d94b2f4b",
          "serie": "A",
          "folio": "19",
          "issuedAt": "2026-05-14T15:59:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 50544.81,
          "iva": 8087.17,
          "total": 58631.98,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "42c8d297-9522-4181-a816-677831003f1e",
          "serie": "A",
          "folio": "17",
          "issuedAt": "2026-05-19T14:46:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 51402.48,
          "iva": 8224.4,
          "total": 59626.88,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "db0a8bae-2ff7-425a-9ecc-f87dc384ca8c",
          "serie": "A",
          "folio": "16",
          "issuedAt": "2026-05-26T16:54:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 25674.53,
          "iva": 4107.92,
          "total": 29782.45,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "7e2e159c-0593-4f99-b4bd-4e31f64f799c",
          "serie": "A",
          "folio": "23",
          "issuedAt": "2026-06-15T14:52:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 32874.01,
          "iva": 5259.84,
          "total": 38133.85,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "24e17e98-24de-46de-8db5-fa60f5aa02eb",
          "serie": "A",
          "folio": "22",
          "issuedAt": "2026-06-22T17:26:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 18168.94,
          "iva": 2907.03,
          "total": 21075.97,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        },
        {
          "uuid": "f887be65-fba2-4119-8065-e8ad88dac408",
          "serie": "A",
          "folio": "24",
          "issuedAt": "2026-07-17T19:24:00.000Z",
          "issuerRfc": "SYN080910HI8",
          "issuerName": "MATERIALES SINTETICOS OCHO SA DE CV",
          "receiverRfc": "SYN090615C01",
          "subtotal": 52268.94,
          "iva": 8363.03,
          "total": 60631.97,
          "paymentMethod": "PPD",
          "paymentForm": "03",
          "synthetic": true
        }
      ],
      "deductedBase": 878592.59,
      "isrExposure": 263577.78,
      "ivaExposure": 140574.81
    }
  ],
  "totalExposure": 404152.59
};

/**
 * What `POST /api/v1/cep/verify` answers for the one-cent probe on the released
 * line: the document, the comparison and the sixth control's finding about it.
 *
 * The CEP is synthetic in the exact sense `packages/cep` means it: participant
 * key 99999, an invented certificate serial and a sello that is 256 deterministic
 * bytes derived from the clave. So `signatureValid` is false with reason
 * `not_checked`, which reads as "no verificada" and never as "valida": a seal
 * nobody validated is the one claim this screen may not make.
 */
export const CEP_VERIFICATION: {
  cep: Cep;
  nameMatch: NameMatch;
  finding: Finding;
  /** The supplier the comparison was against, for the screen's heading. */
  supplierRfc: Rfc;
} = {
  "cep": {
    "claveRastreo": "SYNVERINS20260907032",
    "transferredAt": "2026-09-08T16:15:00-06:00",
    "amount": 0.01,
    "senderName": "Metalicos del Norte SA de CV",
    "senderBank": "BANREGIO",
    "senderAccount": "058180001142789037",
    "beneficiaryName": "Recubrimientos Ceramicos de Pesqueria SA de CV",
    "beneficiaryAccount": "021180043000000432",
    "beneficiaryBank": "HSBC",
    "beneficiaryRfc": "SYN260401R43",
    "concepto": "Verificacion de cuenta INS-2026-09-07-032",
    "numeroCertificado": "00000100000100099999",
    "signatureValid": false,
    "signatureReason": "not_checked",
    "xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<SPEI_Tercero FechaOperacion=\"2026-09-08\" Hora=\"16:15:00\" ClaveSPEI=\"99999\" sello=\"nBbBQ1/KCfVYeXeZ3o/vzv/kJNd2nzqFayYCBqBI3vwzhZoZOe08ySZP3ta9yj2gE8fHSc4lGvP17X3SXIijVH9e9Rx3DY7Eo/ZtE640SOTef+3AwE2HAlCHbojjR+LKdOosjhxqejbUDaC9GYLYfMgDH4y0gCr8n93PJFVnd8IDReD7uWx+Kt2jBZz5Rj2XAUGY/UG+pZR8E8Bq7PXpbK/D0sp/775fMB5gfGmj6UJ54FlSTCfYxH/9lrBc/9MnJH8iDA5snoJd6C7IYUiQTZtjv43OwRDf6Hg3aJle8crRKAJxxB+t1oFEPAfc5AaFSJUXZ3VvsMAN4u4PBRDzbg==\" numeroCertificado=\"00000100000100099999\" cadenaCDA=\"||3|08092026|08092026|161500|99999|BANREGIO|Metalicos del Norte SA de CV|40|058180001142789037|SYN090615C01|HSBC|Recubrimientos Ceramicos de Pesqueria SA de CV|40|021180043000000432|SYN260401R43|Verificacion de cuenta INS-2026-09-07-032|0.00|0.01|00000100000100099999||nBbBQ1/KCfVYeXeZ3o/vzv/kJNd2nzqFayYCBqBI3vwzhZoZOe08ySZP3ta9yj2gE8fHSc4lGvP17X3SXIijVH9e9Rx3DY7Eo/ZtE640SOTef+3AwE2HAlCHbojjR+LKdOosjhxqejbUDaC9GYLYfMgDH4y0gCr8n93PJFVnd8IDReD7uWx+Kt2jBZz5Rj2XAUGY/UG+pZR8E8Bq7PXpbK/D0sp/775fMB5gfGmj6UJ54FlSTCfYxH/9lrBc/9MnJH8iDA5snoJd6C7IYUiQTZtjv43OwRDf6Hg3aJle8crRKAJxxB+t1oFEPAfc5AaFSJUXZ3VvsMAN4u4PBRDzbg==\" claveRastreo=\"SYNVERINS20260907032\">\n    <Beneficiario BancoReceptor=\"HSBC\" Nombre=\"Recubrimientos Ceramicos de Pesqueria SA de CV\" TipoCuenta=\"40\" Cuenta=\"021180043000000432\" RFC=\"SYN260401R43\" Concepto=\"Verificacion de cuenta INS-2026-09-07-032\" IVA=\"0.00\" MontoPago=\"0.01\"/>\n    <Ordenante BancoEmisor=\"BANREGIO\" Nombre=\"Metalicos del Norte SA de CV\" TipoCuenta=\"40\" Cuenta=\"058180001142789037\" RFC=\"SYN090615C01\"/>\n</SPEI_Tercero>",
    "synthetic": true
  },
  "nameMatch": "match",
  "finding": {
    "id": "cep:SYNVERINS20260907032:SYN260401R43",
    "detector": "beneficiary_cep",
    "severity": "info",
    "state": "requiere_verificacion",
    "subject": {
      "kind": "instruction",
      "id": "INS-2026-09-07-032"
    },
    "amountAtRisk": 0,
    "explanation": "El CEP SYNVERINS20260907032 confirma que la cuenta 021180043000000432 esta a nombre de Recubrimientos Ceramicos de Pesqueria SA de CV, que es la razon social de la factura. El sello de Banxico no se ha podido verificar todavia, lo cual no quiere decir que sea invalido. La red SentryOne no se consulto para este pago, asi que la decision es la misma que sin red.",
    "evidence": {
      "claveRastreo": "SYNVERINS20260907032",
      "beneficiaryAccount": "021180043000000432",
      "beneficiaryName": "Recubrimientos Ceramicos de Pesqueria SA de CV",
      "legalName": "Recubrimientos Ceramicos de Pesqueria SA de CV",
      "nameMatch": "match",
      "beneficiaryBank": "HSBC",
      "transferredAt": "2026-09-08T16:15:00-06:00",
      "signatureValid": false,
      "signatureState": "not_checked",
      "network": {
        "source": "not_consulted",
        "tenants": 0,
        "fraudReports": 0,
        "otherAccounts": 0
      },
      "networkVerdict": "not_consulted",
      "networkAdjustment": 1,
      "signatureReason": "not_checked",
      "numeroCertificado": "00000100000100099999"
    },
    "createdAt": "2026-09-10T15:00:00.000Z"
  },
  "supplierRfc": "SYN260401R43"
};

/**
 * The one-cent verification, one line of the run per state.
 *
 * Folded the way the API folds it: the CEP is a parsed document, the seal is
 * `sealStateOf`, the comparison is `nameMatch` and the decision on the two
 * endings is `decide` over the sixth control's findings, signed `system`.
 */
export const VERIFICATIONS: readonly VerificationState[] = [
  {"instructionId":"INS-2026-09-07-046","state":"cent_sent","rail":"nessie","claveRastreo":"SYNVERINS20260907046","centSentAt":"2026-09-08T21:39:00.000Z","cepAt":null,"sealState":null,"holderName":null,"legalName":"Recubrimientos Ceramicos de Pesqueria SA de CV","nameMatch":null,"decision":null,"updatedAt":"2026-09-08T21:39:00.000Z"},
  {"instructionId":"INS-2026-09-07-029","state":"awaiting_cep","rail":"nessie","claveRastreo":"SYNVERINS20260907029","centSentAt":"2026-09-08T15:45:00.000Z","cepAt":null,"sealState":null,"holderName":null,"legalName":"Aceros y Laminas del Norte SA de CV","nameMatch":null,"decision":null,"updatedAt":"2026-09-08T15:45:00.000Z"},
  {"instructionId":"INS-2026-09-07-035","state":"cep_signed","rail":"nessie","claveRastreo":"SYNVERINS20260907035","centSentAt":"2026-09-08T23:43:00.000Z","cepAt":"2026-09-09T00:21:00.000Z","sealState":"not_checked","holderName":"ACEROS Y LAMINAS DEL NORT","legalName":"Aceros y Laminas del Norte SA de CV","nameMatch":"partial","decision":null,"updatedAt":"2026-09-09T00:21:00.000Z"},
  {"instructionId":"INS-2026-09-07-084","state":"blocked","rail":"nessie","claveRastreo":"SYNVERINS20260907084","centSentAt":"2026-09-11T02:21:00.000Z","cepAt":"2026-09-11T02:59:00.000Z","sealState":"not_checked","holderName":"Maquinados Industriales Regios SA de CV","legalName":"Aceros Inoxidables del Poniente SA de CV","nameMatch":"mismatch","decision":{"instructionId":"INS-2026-09-07-084","action":"verify","expectedLoss":136691.62,"delayCostPerDay":1914.62,"findings":[{"id":"cep:SYNVERINS20260907084:SYN150618S18","detector":"beneficiary_cep","severity":"critical","state":"requiere_verificacion","subject":{"kind":"instruction","id":"INS-2026-09-07-084"},"amountAtRisk":227819.37,"explanation":"El CEP SYNVERINS20260907084 dice que la cuenta 014180101559998371 esta a nombre de Maquinados Industriales Regios SA de CV y la factura la emite Aceros Inoxidables del Poniente SA de CV. El sello de Banxico no se ha podido verificar todavia, lo cual no quiere decir que sea invalido. La red SentryOne no se consulto para este pago, asi que la decision es la misma que sin red.","evidence":{"claveRastreo":"SYNVERINS20260907084","beneficiaryAccount":"014180101559998371","beneficiaryName":"Maquinados Industriales Regios SA de CV","legalName":"Aceros Inoxidables del Poniente SA de CV","nameMatch":"mismatch","beneficiaryBank":"SANTANDER","transferredAt":"2026-09-10T20:21:00-06:00","signatureValid":false,"signatureState":"not_checked","network":{"source":"not_consulted","tenants":0,"fraudReports":0,"otherAccounts":0},"networkVerdict":"not_consulted","networkAdjustment":1,"signatureReason":"not_checked","numeroCertificado":"00000100000100099999"},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-11T02:59:00.000Z","decidedBy":"system"},"updatedAt":"2026-09-11T02:59:00.000Z"},
  {"instructionId":"INS-2026-09-07-032","state":"released","rail":"nessie","claveRastreo":"SYNVERINS20260907032","centSentAt":"2026-09-08T22:15:00.000Z","cepAt":"2026-09-08T22:53:00.000Z","sealState":"not_checked","holderName":"Recubrimientos Ceramicos de Pesqueria SA de CV","legalName":"Recubrimientos Ceramicos de Pesqueria SA de CV","nameMatch":"match","decision":{"instructionId":"INS-2026-09-07-032","action":"release","expectedLoss":2324.64,"delayCostPerDay":4611.27,"findings":[{"id":"duplicate_invoice:same_amount_window:3e002385-4112-46a0-aea0-f28e6b262121","detector":"duplicate_invoice","severity":"warning","state":"requiere_verificacion","subject":{"kind":"cfdi","id":"3e002385-4112-46a0-aea0-f28e6b262121"},"amountAtRisk":13920,"explanation":"Recubrimientos Ceramicos de Pesqueria SA de CV tiene otra factura por exactamente 13,920.00 MXN a 5.98 dias de esta: 2026-08-04 y 2026-08-10. Puede ser un servicio recurrente o el mismo cobro dos veces, hay que confirmarlo con el proveedor.","evidence":{"rule":"same_amount_window","issuerRfc":"SYN260401R43","uuid":"3e002385-4112-46a0-aea0-f28e6b262121","folio":"66","originalUuid":"bca72ef6-e8c2-46bf-bbcc-b931e8c268d4","originalIssuedAt":"2026-08-04T14:40:00.000Z","originalFolio":"74","candidateIssuedAt":"2026-08-10T14:18:00.000Z","daysApart":5.98,"windowDays":7,"total":13920},"createdAt":"2026-09-10T15:00:00.000Z"},{"id":"cep:SYNVERINS20260907032:SYN260401R43","detector":"beneficiary_cep","severity":"info","state":"requiere_verificacion","subject":{"kind":"instruction","id":"INS-2026-09-07-032"},"amountAtRisk":0,"explanation":"El CEP SYNVERINS20260907032 confirma que la cuenta 021180043000000432 esta a nombre de Recubrimientos Ceramicos de Pesqueria SA de CV, que es la razon social de la factura. El sello de Banxico no se ha podido verificar todavia, lo cual no quiere decir que sea invalido. La red SentryOne no se consulto para este pago, asi que la decision es la misma que sin red.","evidence":{"claveRastreo":"SYNVERINS20260907032","beneficiaryAccount":"021180043000000432","beneficiaryName":"Recubrimientos Ceramicos de Pesqueria SA de CV","legalName":"Recubrimientos Ceramicos de Pesqueria SA de CV","nameMatch":"match","beneficiaryBank":"HSBC","transferredAt":"2026-09-08T16:15:00-06:00","signatureValid":false,"signatureState":"not_checked","network":{"source":"not_consulted","tenants":0,"fraudReports":0,"otherAccounts":0},"networkVerdict":"not_consulted","networkAdjustment":1,"signatureReason":"not_checked","numeroCertificado":"00000100000100099999"},"createdAt":"2026-09-10T15:00:00.000Z"}],"decidedAt":"2026-09-08T22:53:00.000Z","decidedBy":"system"},"updatedAt":"2026-09-08T22:53:00.000Z"},
];

/**
 * The answer `POST /api/v1/instructions` gives, with the consortium consulted.
 *
 * The only place the offline app carries the network line, for the same reason
 * the API only carries it here: the intake path hands the controls a signal and
 * the boot assessment of a whole run does not.
 */
export const INTAKE_EXAMPLE: {
  instruction: PaymentInstruction;
  supplier: Supplier;
  decision: Decision;
  findings: readonly Finding[];
} = {
  "instruction": {
    "id": "INS-2026-09-07-047",
    "supplierRfc": "SYN990202S02",
    "cfdiUuids": [
      "73d71e39-0943-4d44-a2c8-5193e60a47f4"
    ],
    "clabe": "012180101391764613",
    "amount": 38417.48,
    "source": "whatsapp",
    "receivedAt": "2026-09-08T21:38:00.000Z",
    "synthetic": true,
    "text": "Buenas tardes, cambiamos de cuenta por temas administrativos. Le paso la CLABE nueva para el pago de esta semana, gracias."
  },
  "supplier": {
    "rfc": "SYN990202S02",
    "legalName": "Maquinados Industriales Regios SA de CV",
    "firstInvoiceAt": "2021-03-08T15:00:00.000Z",
    "knownAccounts": [
      {
        "clabe": "012180100091764613",
        "establishedBy": "payment_complement",
        "establishedAt": "2021-04-07T15:00:00.000Z",
        "timesPaid": 52
      }
    ],
    "delayCostPerDay": 1120.05,
    "synthetic": true
  },
  "decision": {
    "instructionId": "INS-2026-09-07-047",
    "action": "verify",
    "expectedLoss": 32270.68,
    "delayCostPerDay": 1120.05,
    "findings": [
      {
        "id": "clabe-INS-2026-09-07-047",
        "detector": "clabe_forensics",
        "severity": "critical",
        "state": "requiere_verificacion",
        "subject": {
          "kind": "instruction",
          "id": "INS-2026-09-07-047"
        },
        "amountAtRisk": 38417.48,
        "explanation": "Difiere en 2 dígitos (posiciones 9 y 10) de la cuenta 012180100091764613, que ya se pagó 52 veces. Es la primera vez que se ve esta cuenta para este proveedor, que ya tiene 1 cuenta registrada.",
        "evidence": {
          "clabe": "012180101391764613",
          "ocrChannel": false,
          "institutionCode": "012",
          "plazaCode": "180",
          "checkDigit": "valid",
          "institutionName": "BBVA MEXICO",
          "knownAccounts": 1,
          "nearestKnownAccount": "012180100091764613",
          "nearestTimesPaid": 52,
          "editOperations": 2,
          "ocrSubstitutions": 0,
          "differingPositions": "9,10",
          "signals": "near_miss,first_time_seen"
        },
        "createdAt": "2026-09-10T15:00:00.000Z"
      },
      {
        "id": "network:INS-2026-09-07-047",
        "detector": "beneficiary_cep",
        "severity": "critical",
        "state": "requiere_verificacion",
        "subject": {
          "kind": "instruction",
          "id": "INS-2026-09-07-047"
        },
        "amountAtRisk": 38417.48,
        "explanation": "No hay CEP verificado para la cuenta 012180101391764613. El control se arma enviando el SPEI de un centavo desde el banco de la empresa. La red SentryOne tiene 2 reportes de fraude sobre esta cuenta para este proveedor.",
        "evidence": {
          "network": {
            "source": "snapshot",
            "tenants": 2,
            "firstSeen": "2026-08-15",
            "lastSeen": "2026-08-15",
            "fraudReports": 2,
            "otherAccounts": 1,
            "pulledAt": "2026-09-10T15:00:00.000Z"
          },
          "networkVerdict": "fraud_reported",
          "networkAdjustment": 1,
          "proposedClabe": "012180101391764613",
          "networkTenants": 2,
          "networkMonths": 0,
          "networkFraudReports": 2,
          "networkOtherAccounts": 1
        },
        "createdAt": "2026-09-10T15:00:00.000Z"
      }
    ],
    "decidedAt": "2026-09-10T15:00:00.000Z"
  },
  "findings": [
    {
      "id": "clabe-INS-2026-09-07-047",
      "detector": "clabe_forensics",
      "severity": "critical",
      "state": "requiere_verificacion",
      "subject": {
        "kind": "instruction",
        "id": "INS-2026-09-07-047"
      },
      "amountAtRisk": 38417.48,
      "explanation": "Difiere en 2 dígitos (posiciones 9 y 10) de la cuenta 012180100091764613, que ya se pagó 52 veces. Es la primera vez que se ve esta cuenta para este proveedor, que ya tiene 1 cuenta registrada.",
      "evidence": {
        "clabe": "012180101391764613",
        "ocrChannel": false,
        "institutionCode": "012",
        "plazaCode": "180",
        "checkDigit": "valid",
        "institutionName": "BBVA MEXICO",
        "knownAccounts": 1,
        "nearestKnownAccount": "012180100091764613",
        "nearestTimesPaid": 52,
        "editOperations": 2,
        "ocrSubstitutions": 0,
        "differingPositions": "9,10",
        "signals": "near_miss,first_time_seen"
      },
      "createdAt": "2026-09-10T15:00:00.000Z"
    },
    {
      "id": "network:INS-2026-09-07-047",
      "detector": "beneficiary_cep",
      "severity": "critical",
      "state": "requiere_verificacion",
      "subject": {
        "kind": "instruction",
        "id": "INS-2026-09-07-047"
      },
      "amountAtRisk": 38417.48,
      "explanation": "No hay CEP verificado para la cuenta 012180101391764613. El control se arma enviando el SPEI de un centavo desde el banco de la empresa. La red SentryOne tiene 2 reportes de fraude sobre esta cuenta para este proveedor.",
      "evidence": {
        "network": {
          "source": "snapshot",
          "tenants": 2,
          "firstSeen": "2026-08-15",
          "lastSeen": "2026-08-15",
          "fraudReports": 2,
          "otherAccounts": 1,
          "pulledAt": "2026-09-10T15:00:00.000Z"
        },
        "networkVerdict": "fraud_reported",
        "networkAdjustment": 1,
        "proposedClabe": "012180101391764613",
        "networkTenants": 2,
        "networkMonths": 0,
        "networkFraudReports": 2,
        "networkOtherAccounts": 1
      },
      "createdAt": "2026-09-10T15:00:00.000Z"
    }
  ]
};

/* ----------------------------------------------------------------- documents */

/**
 * The invoices a screen of this app can reach: the 156 of the company's
 * 4103 that this run settles, that the retroactive sweep prices, or that a
 * finding names.
 *
 * Narrower than `GET /api/v1/suppliers/:rfc`, which answers with every invoice an
 * issuer ever sent, and narrower on purpose: the whole eight-month history is
 * 208 KB gzipped of a bundle a phone downloads in a corridor, and no screen opens
 * an invoice this run never touched. The supplier drawer counts the length of
 * this array, so it reads the count off the API whenever the API answered and
 * names what it is listing when it fell back. See the generator and
 * `docs/07-architecture.md`.
 */
export const CFDIS: readonly Cfdi[] = [
  {"uuid":"1b863590-a5ce-4520-9ede-31d11cd144ee","serie":"A","folio":"1","issuedAt":"2026-01-09T22:33:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":35643.81,"iva":5703.01,"total":41346.82,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"e01108fc-289b-4f04-9a20-51415f25c24e","serie":"A","folio":"2","issuedAt":"2026-01-14T16:25:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":42282.41,"iva":6765.19,"total":49047.6,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"852d6972-d180-433b-97ac-0f8c322d2832","serie":"A","folio":"3","issuedAt":"2026-01-23T16:40:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":48044.06,"iva":7687.05,"total":55731.11,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"bf84dbf7-1abc-4dab-b4a3-7446c305bcf1","serie":"A","folio":"5","issuedAt":"2026-02-05T18:47:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":24695.56,"iva":3951.29,"total":28646.85,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"1202445e-6c2d-4d61-aaab-12592c70f324","serie":"A","folio":"4","issuedAt":"2026-02-19T17:33:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":17893.15,"iva":2862.9,"total":20756.05,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"9db35c38-4620-4eb2-b628-e9b1aa1a28c0","serie":"A","folio":"9","issuedAt":"2026-03-06T23:08:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":72000,"iva":11520,"total":83520,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"c12c0b6d-44f4-4e11-a61d-1f72d2d4ef00","serie":"A","folio":"7","issuedAt":"2026-03-17T18:54:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":25087.06,"iva":4013.93,"total":29100.99,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"6979423c-18a7-4ed0-96c3-39aef64fdd44","serie":"A","folio":"6","issuedAt":"2026-03-17T20:51:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":39057.07,"iva":6249.13,"total":45306.2,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"da9866b5-0b99-446b-b427-b2dbffa1c540","serie":"A","folio":"8","issuedAt":"2026-03-23T16:18:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":33830.06,"iva":5412.81,"total":39242.87,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"0e99f796-2787-407d-baf7-2ee56c1d736e","serie":"A","folio":"10","issuedAt":"2026-03-24T14:02:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":26199.51,"iva":4191.92,"total":30391.43,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"b28a0826-ec69-4566-a473-d10175ae9bb5","serie":"A","folio":"13","issuedAt":"2026-04-15T14:50:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":72000,"iva":11520,"total":83520,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"22b7fcf1-e099-497f-8cc2-14c22e18b92e","serie":"A","folio":"11","issuedAt":"2026-04-27T18:37:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":56659.66,"iva":9065.55,"total":65725.21,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"7bfa4bd9-29c3-4ba8-9bd9-f2cea619da9c","serie":"A","folio":"12","issuedAt":"2026-04-28T14:10:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":20481.28,"iva":3277,"total":23758.28,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"ff0b48fc-db1d-4479-b011-acae147b1bab","serie":"A","folio":"18","issuedAt":"2026-05-01T14:21:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":25048.18,"iva":4007.71,"total":29055.89,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"bdbba1ea-973a-42c2-9e00-c6926f6d9ba0","serie":"A","folio":"14","issuedAt":"2026-05-01T17:13:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":28140.12,"iva":4502.42,"total":32642.54,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"fac33bef-c46b-4286-b803-68b6cbacd39e","serie":"A","folio":"15","issuedAt":"2026-05-01T21:22:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":46529.01,"iva":7444.64,"total":53973.65,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"ce49f5ae-fc0e-411b-b9b3-0b9371ca13b4","serie":"A","folio":"21","issuedAt":"2026-05-08T14:21:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":14950.57,"iva":2392.09,"total":17342.66,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"71053440-e5d0-4c7f-912d-04be8ea27078","serie":"A","folio":"20","issuedAt":"2026-05-11T17:36:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":19117.37,"iva":3058.78,"total":22176.15,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"c94a171a-40c1-4f56-98f4-dcd1d94b2f4b","serie":"A","folio":"19","issuedAt":"2026-05-14T15:59:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":50544.81,"iva":8087.17,"total":58631.98,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"42c8d297-9522-4181-a816-677831003f1e","serie":"A","folio":"17","issuedAt":"2026-05-19T14:46:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":51402.48,"iva":8224.4,"total":59626.88,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"db0a8bae-2ff7-425a-9ecc-f87dc384ca8c","serie":"A","folio":"16","issuedAt":"2026-05-26T16:54:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":25674.53,"iva":4107.92,"total":29782.45,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"7e2e159c-0593-4f99-b4bd-4e31f64f799c","serie":"A","folio":"23","issuedAt":"2026-06-15T14:52:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":32874.01,"iva":5259.84,"total":38133.85,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"24e17e98-24de-46de-8db5-fa60f5aa02eb","serie":"A","folio":"22","issuedAt":"2026-06-22T17:26:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":18168.94,"iva":2907.03,"total":21075.97,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"f887be65-fba2-4119-8065-e8ad88dac408","serie":"A","folio":"24","issuedAt":"2026-07-17T19:24:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":52268.94,"iva":8363.03,"total":60631.97,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"a7a63bdc-b05d-4d30-bf45-8f411d6af22b","serie":"A","folio":"32","issuedAt":"2026-07-21T19:19:00.000Z","issuerRfc":"SYN160719S19","issuerName":"Galvanizados Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":6275.18,"iva":1004.03,"total":7279.21,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"a65cc136-87d7-4770-96ea-899e94e4a1bf","serie":"A","folio":"32","issuedAt":"2026-07-22T14:55:00.000Z","issuerRfc":"SYN050808S08","issuerName":"Perfiles Estructurales Monterrey SA de CV","receiverRfc":"SYN090615C01","subtotal":47096.04,"iva":7535.37,"total":54631.41,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"cbd47d49-0bcf-4a3b-9532-af9b77a6623f","serie":"A","folio":"58","issuedAt":"2026-07-22T19:22:00.000Z","issuerRfc":"SYN000303S03","issuerName":"Troquelados de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":3427.43,"iva":548.39,"total":3975.82,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"3f3b304f-9ec5-41e7-88c3-6ce89fef7ec6","serie":"A","folio":"33","issuedAt":"2026-07-22T20:15:00.000Z","issuerRfc":"SYN160719S19","issuerName":"Galvanizados Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":13138.62,"iva":2102.18,"total":15240.8,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"185dc243-944d-4921-983d-cf6df2910257","serie":"A","folio":"51","issuedAt":"2026-07-22T22:47:00.000Z","issuerRfc":"SYN130513S41","issuerName":"Maquilas Metalicas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":15987.45,"iva":2557.99,"total":18545.44,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"1e7872f3-ea32-43e8-888c-1ed7176f0b2a","serie":"A","folio":"30","issuedAt":"2026-07-22T23:32:00.000Z","issuerRfc":"SYN160719S19","issuerName":"Galvanizados Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":16679.37,"iva":2668.7,"total":19348.07,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"74c87066-a7d2-4b1d-92a9-5b46cbea6752","serie":"A","folio":"14","issuedAt":"2026-07-23T15:33:00.000Z","issuerRfc":"SYN120412S40","issuerName":"Fundicion de Aluminio Garcia SA de CV","receiverRfc":"SYN090615C01","subtotal":86206.9,"iva":13793.1,"total":100000,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"8383dbdf-01f7-4e01-b4ed-c08824dd4be5","serie":"A","folio":"17","issuedAt":"2026-07-23T19:21:00.000Z","issuerRfc":"SYN150618S18","issuerName":"Aceros Inoxidables del Poniente SA de CV","receiverRfc":"SYN090615C01","subtotal":126396.01,"iva":20223.36,"total":146619.37,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"8597ed46-cb44-4beb-821c-dd0e0363e5c0","serie":"A","folio":"18","issuedAt":"2026-07-23T22:48:00.000Z","issuerRfc":"SYN150618S18","issuerName":"Aceros Inoxidables del Poniente SA de CV","receiverRfc":"SYN090615C01","subtotal":70000,"iva":11200,"total":81200,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"13154b39-1bcf-4ab6-8d1e-3c5f16fda45e","serie":"A","folio":"59","issuedAt":"2026-07-24T15:37:00.000Z","issuerRfc":"SYN000303S03","issuerName":"Troquelados de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":7167.23,"iva":1146.76,"total":8313.99,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"73d71e39-0943-4d44-a2c8-5193e60a47f4","serie":"A","folio":"49","issuedAt":"2026-07-30T22:45:00.000Z","issuerRfc":"SYN990202S02","issuerName":"Maquinados Industriales Regios SA de CV","receiverRfc":"SYN090615C01","subtotal":33118.52,"iva":5298.96,"total":38417.48,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"8ae048af-5fc6-497e-b60e-a498d1b1d4a8","serie":"A","folio":"34","issuedAt":"2026-07-30T23:24:00.000Z","issuerRfc":"SYN071010S10","issuerName":"Laminados en Frio del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":25603.6,"iva":4096.58,"total":29700.18,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"10a42c7f-dc2f-4dcc-af91-5d3c369e9b1d","serie":"A","folio":"48","issuedAt":"2026-07-31T18:02:00.000Z","issuerRfc":"SYN170820S20","issuerName":"Inyeccion de Plasticos Tecnicos Regios SA de CV","receiverRfc":"SYN090615C01","subtotal":9864.07,"iva":1578.25,"total":11442.32,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"e792986d-8c46-4dba-a112-663d1f911d97","serie":"A","folio":"19","issuedAt":"2026-07-31T21:38:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":16403.33,"iva":2624.53,"total":19027.86,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"5883b111-403c-4622-9094-7f3229e226c2","serie":"A","folio":"43","issuedAt":"2026-07-31T23:13:00.000Z","issuerRfc":"SYN000428S28","issuerName":"Servicios de Pintura Industrial Regia SA de CV","receiverRfc":"SYN090615C01","subtotal":3825.34,"iva":612.05,"total":4437.39,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"bca72ef6-e8c2-46bf-bbcc-b931e8c268d4","serie":"A","folio":"74","issuedAt":"2026-08-04T14:40:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":12000,"iva":1920,"total":13920,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"21e10a37-3a0e-471e-bb72-cd73dfc6e117","serie":"A","folio":"35","issuedAt":"2026-08-05T14:23:00.000Z","issuerRfc":"SYN050808S08","issuerName":"Perfiles Estructurales Monterrey SA de CV","receiverRfc":"SYN090615C01","subtotal":22889.75,"iva":3662.36,"total":26552.11,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"3c18636b-a28b-46e9-912c-6009c0443948","serie":"A","folio":"72","issuedAt":"2026-08-05T16:11:00.000Z","issuerRfc":"SYN130416S16","issuerName":"Rectificaciones y Baleros Escobedo S de RL de CV","receiverRfc":"SYN090615C01","subtotal":5725.97,"iva":916.16,"total":6642.13,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"a4b0c9cd-ecf6-4a72-a0dd-36b1ee3bf5e9","serie":"A","folio":"55","issuedAt":"2026-08-05T17:10:00.000Z","issuerRfc":"SYN000428S28","issuerName":"Servicios de Pintura Industrial Regia SA de CV","receiverRfc":"SYN090615C01","subtotal":2759.76,"iva":441.56,"total":3201.32,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"58d1907c-b5d1-478b-a026-0773af99a34a","serie":"A","folio":"101","issuedAt":"2026-08-05T19:44:00.000Z","issuerRfc":"SYN110214S14","issuerName":"Equipo de Proteccion Industrial del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":2196.81,"iva":351.49,"total":2548.3,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"496179f0-2ae5-47db-a0ea-c866413aed97","serie":"A","folio":"116","issuedAt":"2026-08-05T21:17:00.000Z","issuerRfc":"SYN100113S13","issuerName":"Mantenimiento Electromecanico Regio SA de CV","receiverRfc":"SYN090615C01","subtotal":7123.87,"iva":1139.82,"total":8263.69,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"981944af-4ed8-425f-849a-1e6c09175989","serie":"A","folio":"114","issuedAt":"2026-08-05T22:33:00.000Z","issuerRfc":"SYN100113S13","issuerName":"Mantenimiento Electromecanico Regio SA de CV","receiverRfc":"SYN090615C01","subtotal":3888.53,"iva":622.16,"total":4510.69,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"6adcf629-a0ff-49db-9170-ef1757d1b6ed","serie":"A","folio":"115","issuedAt":"2026-08-06T14:57:00.000Z","issuerRfc":"SYN100113S13","issuerName":"Mantenimiento Electromecanico Regio SA de CV","receiverRfc":"SYN090615C01","subtotal":3363.78,"iva":538.2,"total":3901.98,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"bccfe623-84d5-494f-8db8-c6b715262f1e","serie":"A","folio":"70","issuedAt":"2026-08-06T15:05:00.000Z","issuerRfc":"SYN130416S16","issuerName":"Rectificaciones y Baleros Escobedo S de RL de CV","receiverRfc":"SYN090615C01","subtotal":5011.76,"iva":801.88,"total":5813.64,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"bcac6450-d67d-4351-8fba-d34f4e400e13","serie":"A","folio":"78","issuedAt":"2026-08-06T15:19:00.000Z","issuerRfc":"SYN100210S38","issuerName":"Resortes Industriales Monterrey S de RL de CV","receiverRfc":"SYN090615C01","subtotal":6121.61,"iva":979.46,"total":7101.07,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"38384d3d-47a3-4bb6-a6c8-bcf28b881bac","serie":"A","folio":"88","issuedAt":"2026-08-06T15:20:00.000Z","issuerRfc":"SYN030606S06","issuerName":"Recubrimientos Electroliticos del Poniente SA de CV","receiverRfc":"SYN090615C01","subtotal":2985.54,"iva":477.69,"total":3463.23,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"d90515b2-0375-434a-ab27-9e97a3488551","serie":"A","folio":"54","issuedAt":"2026-08-06T16:39:00.000Z","issuerRfc":"SYN000428S28","issuerName":"Servicios de Pintura Industrial Regia SA de CV","receiverRfc":"SYN090615C01","subtotal":2900.44,"iva":464.07,"total":3364.51,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"4d039c80-6c65-4688-ac6e-33443d4ace2a","serie":"A","folio":"96","issuedAt":"2026-08-06T17:29:00.000Z","issuerRfc":"SYN030606S06","issuerName":"Recubrimientos Electroliticos del Poniente SA de CV","receiverRfc":"SYN090615C01","subtotal":4148.16,"iva":663.71,"total":4811.87,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"9d257e68-7b74-4722-aae4-ef82d0e647ef","serie":"A","folio":"93","issuedAt":"2026-08-06T19:04:00.000Z","issuerRfc":"SYN110214S14","issuerName":"Equipo de Proteccion Industrial del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":2487.91,"iva":398.07,"total":2885.98,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"bbc9df2f-0d82-42ba-b315-422e3866618e","serie":"A","folio":"70","issuedAt":"2026-08-06T19:05:00.000Z","issuerRfc":"SYN100210S38","issuerName":"Resortes Industriales Monterrey S de RL de CV","receiverRfc":"SYN090615C01","subtotal":3490.21,"iva":558.43,"total":4048.64,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"ce228d85-b837-4b20-865e-bd3c2c9d5b1c","serie":"A","folio":"92","issuedAt":"2026-08-06T19:16:00.000Z","issuerRfc":"SYN990327S27","issuerName":"Alambres y Mallas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":4340.7,"iva":694.51,"total":5035.21,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"7f1bdb8c-709d-4fa1-b6c7-b135a595f968","serie":"A","folio":"71","issuedAt":"2026-08-06T21:30:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":46000,"iva":7360,"total":53360,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"eae68be8-01b9-4a73-9c72-98497eefa69e","serie":"A","folio":"71","issuedAt":"2026-08-06T21:41:00.000Z","issuerRfc":"SYN170820S20","issuerName":"Inyeccion de Plasticos Tecnicos Regios SA de CV","receiverRfc":"SYN090615C01","subtotal":15000,"iva":2400,"total":17400,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"fcdd6e59-ac49-4a82-807e-74c0ceefeb42","serie":"A","folio":"22","issuedAt":"2026-08-06T22:02:00.000Z","issuerRfc":"SYN980101S01","issuerName":"Aceros y Laminas del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":202975.92,"iva":32476.15,"total":235452.07,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"b0f96f70-e5f1-400b-ba3a-0234a16eb4fb","serie":"A","folio":"108","issuedAt":"2026-08-07T15:22:00.000Z","issuerRfc":"SYN100113S13","issuerName":"Mantenimiento Electromecanico Regio SA de CV","receiverRfc":"SYN090615C01","subtotal":5291.43,"iva":846.63,"total":6138.06,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"b90da83f-8dc6-4861-8583-52aeb55dced9","serie":"A","folio":"68","issuedAt":"2026-08-07T15:39:00.000Z","issuerRfc":"SYN050905S33","issuerName":"Cortes de Placa Pesqueria S de RL de CV","receiverRfc":"SYN090615C01","subtotal":8712.32,"iva":1393.97,"total":10106.29,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"5e8bcaa3-6ff8-4732-9640-4fd1d04f3ddd","serie":"A","folio":"38","issuedAt":"2026-08-07T17:40:00.000Z","issuerRfc":"SYN071010S10","issuerName":"Laminados en Frio del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":49959.85,"iva":7993.58,"total":57953.43,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"fd241f2e-7ce7-4c0f-ba63-f151f0fb46b2","serie":"A","folio":"47","issuedAt":"2026-08-07T20:23:00.000Z","issuerRfc":"SYN140517S17","issuerName":"Corte por Laser Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":18991.1,"iva":3038.58,"total":22029.68,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"647a0fb5-6e37-469e-a7f6-e44f8351cb9e","serie":"A","folio":"86","issuedAt":"2026-08-07T20:39:00.000Z","issuerRfc":"SYN990327S27","issuerName":"Alambres y Mallas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":4121.42,"iva":659.43,"total":4780.85,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"006553e5-e83e-40cf-a038-e6a2c9126141","serie":"A","folio":"105","issuedAt":"2026-08-07T20:55:00.000Z","issuerRfc":"SYN100113S13","issuerName":"Mantenimiento Electromecanico Regio SA de CV","receiverRfc":"SYN090615C01","subtotal":6366.68,"iva":1018.67,"total":7385.35,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"443b882b-d488-44ae-ad3b-9392a8e1a5be","serie":"A","folio":"67","issuedAt":"2026-08-07T20:56:00.000Z","issuerRfc":"SYN100210S38","issuerName":"Resortes Industriales Monterrey S de RL de CV","receiverRfc":"SYN090615C01","subtotal":2384.7,"iva":381.55,"total":2766.25,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"e09c48e6-c40e-42e8-b9c6-2e3975f164ff","serie":"A","folio":"71","issuedAt":"2026-08-07T20:59:00.000Z","issuerRfc":"SYN100210S38","issuerName":"Resortes Industriales Monterrey S de RL de CV","receiverRfc":"SYN090615C01","subtotal":3068.2,"iva":490.91,"total":3559.11,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"c291b6c3-9d51-46df-b59f-42def06894a2","serie":"A","folio":"57","issuedAt":"2026-08-07T22:35:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":42693.11,"iva":6830.9,"total":49524.01,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"d8674368-e89c-4719-a2db-2e000aac5ac0","serie":"A","folio":"28","issuedAt":"2026-08-07T22:42:00.000Z","issuerRfc":"SYN080910HI8","issuerName":"MATERIALES SINTETICOS OCHO SA DE CV","receiverRfc":"SYN090615C01","subtotal":72000,"iva":11520,"total":83520,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"0ace56f6-10cd-489b-aecb-c588d05df658","serie":"A","folio":"106","issuedAt":"2026-08-07T23:18:00.000Z","issuerRfc":"SYN100113S13","issuerName":"Mantenimiento Electromecanico Regio SA de CV","receiverRfc":"SYN090615C01","subtotal":2100,"iva":336,"total":2436,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"ba715024-0a6e-4d10-8a74-6d018a523036","serie":"A","folio":"54","issuedAt":"2026-08-10T14:08:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":34800.36,"iva":5568.06,"total":40368.42,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"3e002385-4112-46a0-aea0-f28e6b262121","serie":"A","folio":"66","issuedAt":"2026-08-10T14:18:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":12000,"iva":1920,"total":13920,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"16f95305-4010-489b-82c0-2312b3e6b006","serie":"A","folio":"55","issuedAt":"2026-08-10T14:50:00.000Z","issuerRfc":"SYN990202S02","issuerName":"Maquinados Industriales Regios SA de CV","receiverRfc":"SYN090615C01","subtotal":15183.6,"iva":2429.38,"total":17612.98,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"ff8be618-9268-453e-b7e4-73b2e6881dee","serie":"A","folio":"60","issuedAt":"2026-08-10T14:52:00.000Z","issuerRfc":"SYN130513S41","issuerName":"Maquilas Metalicas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":15139.07,"iva":2422.25,"total":17561.32,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"ef5c1061-6343-48f6-8a93-f6d3ae8ccafa","serie":"A","folio":"49","issuedAt":"2026-08-10T15:10:00.000Z","issuerRfc":"SYN140517S17","issuerName":"Corte por Laser Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":13539.43,"iva":2166.31,"total":15705.74,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"64dbd06d-8d1a-4241-af65-5ad942d91a6f","serie":"A","folio":"197","issuedAt":"2026-08-10T15:35:00.000Z","issuerRfc":"SYN010501S29","issuerName":"Rodamientos y Retenes San Nicolas SA de CV","receiverRfc":"SYN090615C01","subtotal":1581.16,"iva":252.99,"total":1834.15,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"b50fce50-ff18-4e79-b7a9-2b825e7045d7","serie":"A","folio":"72","issuedAt":"2026-08-10T17:47:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":12048.97,"iva":1927.84,"total":13976.81,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"d0db58a1-9510-473d-b291-b63687b4a960","serie":"A","folio":"76","issuedAt":"2026-08-10T18:12:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":27675.55,"iva":4428.09,"total":32103.64,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"3a9ecee1-8c12-4800-b92c-44fc21b3d016","serie":"A","folio":"52","issuedAt":"2026-08-11T15:04:00.000Z","issuerRfc":"SYN990202S02","issuerName":"Maquinados Industriales Regios SA de CV","receiverRfc":"SYN090615C01","subtotal":29833.17,"iva":4773.31,"total":34606.48,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"51dba7af-ed78-43f0-8ca4-6ecb6d160c14","serie":"A","folio":"58","issuedAt":"2026-08-11T15:13:00.000Z","issuerRfc":"SYN990202S02","issuerName":"Maquinados Industriales Regios SA de CV","receiverRfc":"SYN090615C01","subtotal":24071.13,"iva":3851.38,"total":27922.51,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"90616e16-e59b-495f-8de6-a41228aabd80","serie":"A","folio":"83","issuedAt":"2026-08-11T17:45:00.000Z","issuerRfc":"SYN990327S27","issuerName":"Alambres y Mallas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":2126.28,"iva":340.2,"total":2466.48,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"e8193f26-92f4-4319-b2c9-a72fe2e3e427","serie":"A","folio":"47","issuedAt":"2026-08-11T19:04:00.000Z","issuerRfc":"SYN201123S23","issuerName":"Tratamientos Termicos del Norte S de RL de CV","receiverRfc":"SYN090615C01","subtotal":4615.18,"iva":738.43,"total":5353.61,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"bedc7bda-b026-43be-a28a-87b930d6818b","serie":"A","folio":"21","issuedAt":"2026-08-11T19:15:00.000Z","issuerRfc":"SYN980101S01","issuerName":"Aceros y Laminas del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":320000,"iva":51200,"total":371200,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"29e16674-e713-4c00-8a6e-e87a36dc6c75","serie":"A","folio":"74","issuedAt":"2026-08-11T20:24:00.000Z","issuerRfc":"SYN100210S38","issuerName":"Resortes Industriales Monterrey S de RL de CV","receiverRfc":"SYN090615C01","subtotal":7759.68,"iva":1241.55,"total":9001.23,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"421719c5-8309-4840-a46b-6ea53e774176","serie":"A","folio":"20","issuedAt":"2026-08-11T21:50:00.000Z","issuerRfc":"SYN980101S01","issuerName":"Aceros y Laminas del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":143759.46,"iva":23001.51,"total":166760.97,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"78f30531-3d2b-4313-b303-37ce44f7de13","serie":"A","folio":"57","issuedAt":"2026-08-11T22:35:00.000Z","issuerRfc":"SYN000428S28","issuerName":"Servicios de Pintura Industrial Regia SA de CV","receiverRfc":"SYN090615C01","subtotal":3529.46,"iva":564.71,"total":4094.17,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"e2d69c87-799b-4101-ad9b-b7cbdd30ad9b","serie":"A","folio":"99","issuedAt":"2026-08-11T23:09:00.000Z","issuerRfc":"SYN110214S14","issuerName":"Equipo de Proteccion Industrial del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":988.88,"iva":158.22,"total":1147.1,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"e3d3ebb6-098c-42e7-acc8-8fbb34d5c8a0","serie":"A","folio":"62","issuedAt":"2026-08-13T17:24:00.000Z","issuerRfc":"SYN170820S20","issuerName":"Inyeccion de Plasticos Tecnicos Regios SA de CV","receiverRfc":"SYN090615C01","subtotal":15000,"iva":2400,"total":17400,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"b2b395e0-ced7-4059-9db2-3f9c9bdc2840","serie":"A","folio":"171","issuedAt":"2026-08-13T18:16:00.000Z","issuerRfc":"SYN090109S37","issuerName":"Logistica y Maniobras del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":1350.27,"iva":216.04,"total":1566.31,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"88879dc3-aeef-4a68-b768-be7076e69393","serie":"A","folio":"228","issuedAt":"2026-08-13T19:42:00.000Z","issuerRfc":"SYN040707S07","issuerName":"Tornilleria y Sujetadores Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":893.64,"iva":142.98,"total":1036.62,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"1860246a-5eb5-4b05-83ea-a7c213bc5d1e","serie":"A","folio":"51","issuedAt":"2026-08-13T20:04:00.000Z","issuerRfc":"SYN260401R43","issuerName":"Recubrimientos Ceramicos de Pesqueria SA de CV","receiverRfc":"SYN090615C01","subtotal":46000,"iva":7360,"total":53360,"paymentMethod":"PPD","paymentForm":"03","synthetic":true},
  {"uuid":"3e3a37b8-b4e9-4749-ae45-5a4d1c80da18","serie":"A","folio":"222","issuedAt":"2026-08-17T21:21:00.000Z","issuerRfc":"SYN120315S15","issuerName":"Gases Industriales Santa Catarina SA de CV","receiverRfc":"SYN090615C01","subtotal":5800,"iva":928,"total":6728,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"e6fca4c0-c20d-425a-81bc-e07e0fe2d5b2","serie":"A","folio":"102","issuedAt":"2026-08-18T19:50:00.000Z","issuerRfc":"SYN071107S35","issuerName":"Herreria y Forja Guadalupe SA de CV","receiverRfc":"SYN090615C01","subtotal":3774.75,"iva":603.96,"total":4378.71,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"4c421b3a-f31b-4518-851d-a843b013cd1e","serie":"A","folio":"190","issuedAt":"2026-08-20T14:15:00.000Z","issuerRfc":"SYN010501S29","issuerName":"Rodamientos y Retenes San Nicolas SA de CV","receiverRfc":"SYN090615C01","subtotal":2816.52,"iva":450.64,"total":3267.16,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"a754310d-dfda-4162-a5da-8410c4ffea31","serie":"A","folio":"173","issuedAt":"2026-08-20T14:25:00.000Z","issuerRfc":"SYN090109S37","issuerName":"Logistica y Maniobras del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":2474.79,"iva":395.97,"total":2870.76,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"7ec708c1-74ee-443c-96cf-ad240e679602","serie":"A","folio":"126","issuedAt":"2026-08-20T14:35:00.000Z","issuerRfc":"SYN020505S05","issuerName":"Soldaduras y Montajes Escobedo SA de CV","receiverRfc":"SYN090615C01","subtotal":5903.97,"iva":944.64,"total":6848.61,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"df77e482-7a27-4266-ad43-e71c808a5f50","serie":"A","folio":"176","issuedAt":"2026-08-20T15:11:00.000Z","issuerRfc":"SYN180921S21","issuerName":"Bandas y Transmisiones del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":2335.94,"iva":373.75,"total":2709.69,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"fe74064b-41e9-481c-b8a5-9de50f4a4d7c","serie":"A","folio":"205","issuedAt":"2026-08-20T15:20:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":2127.68,"iva":340.43,"total":2468.11,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"590f9ead-a46b-4ca9-b467-c82c0b945b69","serie":"A","folio":"166","issuedAt":"2026-08-20T18:07:00.000Z","issuerRfc":"SYN090109S37","issuerName":"Logistica y Maniobras del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":780,"iva":124.8,"total":904.8,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"bba6dd9c-4f6d-4904-9203-5fb17c85953a","serie":"A","folio":"221","issuedAt":"2026-08-20T18:09:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":1844.41,"iva":295.11,"total":2139.52,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"b23b3e2e-ed48-46f5-a87e-0b0c1599d375","serie":"A","folio":"164","issuedAt":"2026-08-20T18:17:00.000Z","issuerRfc":"SYN180921S21","issuerName":"Bandas y Transmisiones del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":893.95,"iva":143.03,"total":1036.98,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"42cef610-8ebb-4e16-8d05-73485992f64e","serie":"A","folio":"125","issuedAt":"2026-08-20T20:05:00.000Z","issuerRfc":"SYN020505S05","issuerName":"Soldaduras y Montajes Escobedo SA de CV","receiverRfc":"SYN090615C01","subtotal":7478.4,"iva":1196.54,"total":8674.94,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"5cd84246-8813-4317-bd0a-eac6ba82a984","serie":"A","folio":"225","issuedAt":"2026-08-20T21:33:00.000Z","issuerRfc":"SYN081208S36","issuerName":"Consumibles de Soldadura Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":2410.52,"iva":385.68,"total":2796.2,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"378d8768-72f4-4ba6-927e-c9b06cd28f83","serie":"A","folio":"201","issuedAt":"2026-08-20T21:58:00.000Z","issuerRfc":"SYN010501S29","issuerName":"Rodamientos y Retenes San Nicolas SA de CV","receiverRfc":"SYN090615C01","subtotal":1761.94,"iva":281.91,"total":2043.85,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"6c987ce5-7c2e-4935-a507-1673c0fd0661","serie":"A","folio":"174","issuedAt":"2026-08-20T22:03:00.000Z","issuerRfc":"SYN090109S37","issuerName":"Logistica y Maniobras del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":3969.23,"iva":635.08,"total":4604.31,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"f46f93c3-5ea4-4ec7-bfaf-5b18c1df347f","serie":"A","folio":"211","issuedAt":"2026-08-20T22:04:00.000Z","issuerRfc":"SYN091212S12","issuerName":"Empaques y Tarimas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":779.18,"iva":124.67,"total":903.85,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"717ba163-ada0-4a40-b9c1-df9ce9e94de8","serie":"A","folio":"234","issuedAt":"2026-08-20T22:05:00.000Z","issuerRfc":"SYN081208S36","issuerName":"Consumibles de Soldadura Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1803.97,"iva":288.64,"total":2092.61,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"1db52c0e-57c1-4a54-9878-4cf41448ef21","serie":"A","folio":"220","issuedAt":"2026-08-20T22:08:00.000Z","issuerRfc":"SYN091212S12","issuerName":"Empaques y Tarimas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":1542.37,"iva":246.78,"total":1789.15,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"8e9229af-82d0-4117-be79-0ef6862bb5a2","serie":"A","folio":"171","issuedAt":"2026-08-20T22:11:00.000Z","issuerRfc":"SYN180921S21","issuerName":"Bandas y Transmisiones del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":2240.72,"iva":358.52,"total":2599.24,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"4ea7129a-707e-4daa-96b5-541629d8632c","serie":"A","folio":"70","issuedAt":"2026-08-21T16:30:00.000Z","issuerRfc":"SYN030703S31","issuerName":"Chatarra y Reciclado Metalico Regio SA de CV","receiverRfc":"SYN090615C01","subtotal":4569.31,"iva":731.09,"total":5300.4,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"0c4518fa-d268-4306-a63c-4c2e59126ce6","serie":"A","folio":"236","issuedAt":"2026-08-21T16:30:00.000Z","issuerRfc":"SYN081208S36","issuerName":"Consumibles de Soldadura Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1546.21,"iva":247.39,"total":1793.6,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"1cf20ca8-916e-4410-ae40-75ffb4779d06","serie":"A","folio":"119","issuedAt":"2026-08-21T17:12:00.000Z","issuerRfc":"SYN020505S05","issuerName":"Soldaduras y Montajes Escobedo SA de CV","receiverRfc":"SYN090615C01","subtotal":5710.5,"iva":913.68,"total":6624.18,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"31cd86c9-0288-4741-8fc7-b0bc0d480f7d","serie":"A","folio":"179","issuedAt":"2026-08-21T17:56:00.000Z","issuerRfc":"SYN090109S37","issuerName":"Logistica y Maniobras del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":2554.82,"iva":408.77,"total":2963.59,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"82f186c2-f27b-4cfa-a8e6-2d5ebd7cca73","serie":"A","folio":"223","issuedAt":"2026-08-21T18:01:00.000Z","issuerRfc":"SYN081208S36","issuerName":"Consumibles de Soldadura Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1504.82,"iva":240.77,"total":1745.59,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"d27ec3ec-081d-4c3f-848a-f08c2ab7af4a","serie":"A","folio":"213","issuedAt":"2026-08-21T19:48:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":5200,"iva":832,"total":6032,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"30c6391f-edd4-4435-9d84-80ff236943fb","serie":"A","folio":"180","issuedAt":"2026-08-21T21:23:00.000Z","issuerRfc":"SYN090109S37","issuerName":"Logistica y Maniobras del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":2069.48,"iva":331.12,"total":2400.6,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"589550fa-468c-4063-b93c-0efd856b68a3","serie":"A","folio":"227","issuedAt":"2026-08-21T21:38:00.000Z","issuerRfc":"SYN040707S07","issuerName":"Tornilleria y Sujetadores Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1311.43,"iva":209.83,"total":1521.26,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"5d7b5606-f169-4b9b-b173-b2dc9584a2a8","serie":"A","folio":"233","issuedAt":"2026-08-21T21:44:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":2809.07,"iva":449.45,"total":3258.52,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"8eb0a6a5-e43e-455d-8291-2fd91b8ac7b7","serie":"A","folio":"241","issuedAt":"2026-08-21T22:32:00.000Z","issuerRfc":"SYN081208S36","issuerName":"Consumibles de Soldadura Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1237.25,"iva":197.96,"total":1435.21,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"9213c4d1-f59a-4552-8585-13f74c8ad773","serie":"A","folio":"211","issuedAt":"2026-08-21T22:34:00.000Z","issuerRfc":"SYN120315S15","issuerName":"Gases Industriales Santa Catarina SA de CV","receiverRfc":"SYN090615C01","subtotal":2850.7,"iva":456.11,"total":3306.81,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"8cf83dbd-d37b-437e-9ad1-d465e38cbae4","serie":"A","folio":"217","issuedAt":"2026-08-21T22:58:00.000Z","issuerRfc":"SYN040707S07","issuerName":"Tornilleria y Sujetadores Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1348.98,"iva":215.84,"total":1564.82,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"24f522ca-1f40-41cd-8b7b-8030d7e3c15a","serie":"A","folio":"212","issuedAt":"2026-08-21T23:24:00.000Z","issuerRfc":"SYN040707S07","issuerName":"Tornilleria y Sujetadores Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":728.74,"iva":116.6,"total":845.34,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"5b6013f2-9064-450a-8f58-32e2b734fea3","serie":"A","folio":"209","issuedAt":"2026-08-21T23:43:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":2452.26,"iva":392.36,"total":2844.62,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"7a3fcd4d-bcd3-43f5-a61c-f3366307f74f","serie":"A","folio":"172","issuedAt":"2026-08-21T23:52:00.000Z","issuerRfc":"SYN180921S21","issuerName":"Bandas y Transmisiones del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":860,"iva":137.6,"total":997.6,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"6d0cbfe1-f390-4b9e-b5d3-ab2a2da07839","serie":"A","folio":"226","issuedAt":"2026-08-24T16:08:00.000Z","issuerRfc":"SYN081208S36","issuerName":"Consumibles de Soldadura Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":2592.37,"iva":414.78,"total":3007.15,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"880a4e15-cd59-47ff-b5c5-48b208913fab","serie":"A","folio":"124","issuedAt":"2026-08-24T16:16:00.000Z","issuerRfc":"SYN020505S05","issuerName":"Soldaduras y Montajes Escobedo SA de CV","receiverRfc":"SYN090615C01","subtotal":5917.03,"iva":946.72,"total":6863.75,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"82014cab-6662-42d7-b786-ca157f06de59","serie":"A","folio":"226","issuedAt":"2026-08-24T16:54:00.000Z","issuerRfc":"SYN091212S12","issuerName":"Empaques y Tarimas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":1837.65,"iva":294.02,"total":2131.67,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"d60b78a2-3a84-407d-8b38-914b8ffe90c9","serie":"A","folio":"121","issuedAt":"2026-08-24T17:13:00.000Z","issuerRfc":"SYN020505S05","issuerName":"Soldaduras y Montajes Escobedo SA de CV","receiverRfc":"SYN090615C01","subtotal":2886.9,"iva":461.9,"total":3348.8,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"75bdffc0-f835-4136-b51e-1ccf6295c8fc","serie":"A","folio":"140","issuedAt":"2026-08-24T17:32:00.000Z","issuerRfc":"SYN211224S24","issuerName":"Suministros Hidraulicos Juarez SA de CV","receiverRfc":"SYN090615C01","subtotal":3127.93,"iva":500.47,"total":3628.4,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"7502cd79-e4d4-4714-b43a-c2ee325f126b","serie":"A","folio":"206","issuedAt":"2026-08-24T19:37:00.000Z","issuerRfc":"SYN010501S29","issuerName":"Rodamientos y Retenes San Nicolas SA de CV","receiverRfc":"SYN090615C01","subtotal":1163.17,"iva":186.11,"total":1349.28,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"51ad2ef8-af2b-48e7-ba6e-d74573672df1","serie":"A","folio":"217","issuedAt":"2026-08-24T19:58:00.000Z","issuerRfc":"SYN120315S15","issuerName":"Gases Industriales Santa Catarina SA de CV","receiverRfc":"SYN090615C01","subtotal":2250.73,"iva":360.12,"total":2610.85,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"955d7fce-3241-40ed-b6c1-5dffaea58e59","serie":"A","folio":"216","issuedAt":"2026-08-24T21:55:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":1118.89,"iva":179.02,"total":1297.91,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"40dbec0c-a03b-43b9-a1bd-838e0c90ea2c","serie":"A","folio":"166","issuedAt":"2026-08-24T23:01:00.000Z","issuerRfc":"SYN140614S42","issuerName":"Refacciones Neumaticas Juarez SA de CV","receiverRfc":"SYN090615C01","subtotal":1698.98,"iva":271.84,"total":1970.82,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"a5e738f1-9d54-4c0d-b259-5fffb36c00e3","serie":"A","folio":"193","issuedAt":"2026-08-25T14:24:00.000Z","issuerRfc":"SYN010501S29","issuerName":"Rodamientos y Retenes San Nicolas SA de CV","receiverRfc":"SYN090615C01","subtotal":983.88,"iva":157.42,"total":1141.3,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"dd6640d2-ac95-4d14-850b-97f5a03f9b01","serie":"A","folio":"229","issuedAt":"2026-08-25T14:35:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":5026.42,"iva":804.23,"total":5830.65,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"9eda863d-5fbb-4bb7-836c-4bb850e4b6ba","serie":"A","folio":"217","issuedAt":"2026-08-25T14:35:00.000Z","issuerRfc":"SYN010501S29","issuerName":"Rodamientos y Retenes San Nicolas SA de CV","receiverRfc":"SYN090615C01","subtotal":530,"iva":84.8,"total":614.8,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"fe3e2d9c-cd18-483d-9758-ea46158258e0","serie":"A","folio":"144","issuedAt":"2026-08-25T15:25:00.000Z","issuerRfc":"SYN211224S24","issuerName":"Suministros Hidraulicos Juarez SA de CV","receiverRfc":"SYN090615C01","subtotal":1816.76,"iva":290.68,"total":2107.44,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"8a8a91e5-5853-4c6b-a3b0-2cc602ca0ae4","serie":"A","folio":"179","issuedAt":"2026-08-25T16:31:00.000Z","issuerRfc":"SYN140614S42","issuerName":"Refacciones Neumaticas Juarez SA de CV","receiverRfc":"SYN090615C01","subtotal":839.61,"iva":134.34,"total":973.95,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"aa2dabcd-12a6-4f2a-b68c-ebed9d2dc6eb","serie":"A","folio":"205","issuedAt":"2026-08-25T17:19:00.000Z","issuerRfc":"SYN120315S15","issuerName":"Gases Industriales Santa Catarina SA de CV","receiverRfc":"SYN090615C01","subtotal":1891.69,"iva":302.67,"total":2194.36,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"990ccbd2-37bb-4914-9b9d-50f4fcb4aa44","serie":"A","folio":"130","issuedAt":"2026-08-25T18:20:00.000Z","issuerRfc":"SYN020505S05","issuerName":"Soldaduras y Montajes Escobedo SA de CV","receiverRfc":"SYN090615C01","subtotal":8044.75,"iva":1287.16,"total":9331.91,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"3d0c2e6b-7e33-4979-aa9a-3402b66f309d","serie":"A","folio":"210","issuedAt":"2026-08-25T18:27:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":2415.46,"iva":386.47,"total":2801.93,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"1cd75ef0-7a37-4455-8b3b-07927e60a28a","serie":"A","folio":"208","issuedAt":"2026-08-25T18:29:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":3448.81,"iva":551.81,"total":4000.62,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"5033bbdd-86eb-4d12-ad25-8e967d38dd2d","serie":"A","folio":"138","issuedAt":"2026-08-25T18:35:00.000Z","issuerRfc":"SYN211224S24","issuerName":"Suministros Hidraulicos Juarez SA de CV","receiverRfc":"SYN090615C01","subtotal":1913.36,"iva":306.14,"total":2219.5,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"17aac70c-56a3-424f-8e8d-8f98764fb72b","serie":"A","folio":"212","issuedAt":"2026-08-25T19:24:00.000Z","issuerRfc":"SYN010501S29","issuerName":"Rodamientos y Retenes San Nicolas SA de CV","receiverRfc":"SYN090615C01","subtotal":1263.03,"iva":202.08,"total":1465.11,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"9b9a3ff0-b9a9-4692-bbf5-7277fba14219","serie":"A","folio":"238","issuedAt":"2026-08-25T19:45:00.000Z","issuerRfc":"SYN081208S36","issuerName":"Consumibles de Soldadura Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1192.14,"iva":190.74,"total":1382.88,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"d82cca50-bcc0-4553-8c7f-6d543322ea1c","serie":"A","folio":"219","issuedAt":"2026-08-25T20:39:00.000Z","issuerRfc":"SYN040707S07","issuerName":"Tornilleria y Sujetadores Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1186.2,"iva":189.79,"total":1375.99,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"39cfa0bb-3710-4b07-8619-4a048ad0ba2c","serie":"A","folio":"159","issuedAt":"2026-08-25T22:18:00.000Z","issuerRfc":"SYN090109S37","issuerName":"Logistica y Maniobras del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":3980.33,"iva":636.85,"total":4617.18,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"321b89d2-6757-4a01-bfe6-ab347242b15c","serie":"A","folio":"233","issuedAt":"2026-08-25T23:34:00.000Z","issuerRfc":"SYN040707S07","issuerName":"Tornilleria y Sujetadores Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":1869.52,"iva":299.12,"total":2168.64,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"77d1be33-af1d-42f2-9f5a-a9b8133fe343","serie":"A","folio":"191","issuedAt":"2026-08-26T14:19:00.000Z","issuerRfc":"SYN010501S29","issuerName":"Rodamientos y Retenes San Nicolas SA de CV","receiverRfc":"SYN090615C01","subtotal":1203.81,"iva":192.61,"total":1396.42,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"a9546087-2766-4d92-aeaf-1f0a6870aac5","serie":"A","folio":"164","issuedAt":"2026-08-26T14:20:00.000Z","issuerRfc":"SYN090109S37","issuerName":"Logistica y Maniobras del Norte SA de CV","receiverRfc":"SYN090615C01","subtotal":2558.46,"iva":409.35,"total":2967.81,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"15f5c65d-4ab4-4129-93a6-ddbbf4503129","serie":"A","folio":"169","issuedAt":"2026-08-26T15:30:00.000Z","issuerRfc":"SYN180921S21","issuerName":"Bandas y Transmisiones del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":1956.07,"iva":312.97,"total":2269.04,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"ceeda867-86e8-46d2-9215-e2cb36efe797","serie":"A","folio":"114","issuedAt":"2026-08-26T16:01:00.000Z","issuerRfc":"SYN020505S05","issuerName":"Soldaduras y Montajes Escobedo SA de CV","receiverRfc":"SYN090615C01","subtotal":2791.21,"iva":446.59,"total":3237.8,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"2a21943a-66a1-4d20-8c93-2ac0af31f169","serie":"A","folio":"220","issuedAt":"2026-08-26T16:36:00.000Z","issuerRfc":"SYN040707S07","issuerName":"Tornilleria y Sujetadores Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":3200,"iva":512,"total":3712,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"fedd3a59-6861-4e39-9876-0cbe12fd6e4d","serie":"A","folio":"230","issuedAt":"2026-08-26T17:55:00.000Z","issuerRfc":"SYN081111S11","issuerName":"Transportes Industriales Juarez S de RL de CV","receiverRfc":"SYN090615C01","subtotal":1524.95,"iva":243.99,"total":1768.94,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"7902b726-c8c0-40b7-9aab-36769f8d2261","serie":"A","folio":"224","issuedAt":"2026-08-26T20:50:00.000Z","issuerRfc":"SYN091212S12","issuerName":"Empaques y Tarimas del Noreste SA de CV","receiverRfc":"SYN090615C01","subtotal":1104.36,"iva":176.7,"total":1281.06,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"e049e1ab-5bed-4bc0-8c7d-9d52ef22300c","serie":"A","folio":"230","issuedAt":"2026-08-26T21:36:00.000Z","issuerRfc":"SYN040707S07","issuerName":"Tornilleria y Sujetadores Apodaca SA de CV","receiverRfc":"SYN090615C01","subtotal":488.74,"iva":78.2,"total":566.94,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
  {"uuid":"b87b1a49-ad38-4755-9959-c04e373394c7","serie":"A","folio":"165","issuedAt":"2026-08-26T21:53:00.000Z","issuerRfc":"SYN140614S42","issuerName":"Refacciones Neumaticas Juarez SA de CV","receiverRfc":"SYN090615C01","subtotal":1820.59,"iva":291.29,"total":2111.88,"paymentMethod":"PUE","paymentForm":"03","synthetic":true},
];

/** The payment complements that settle those invoices. See the generator. */
export const COMPLEMENTS: readonly PaymentComplement[] = [
  {"uuid":"cfab71f2-d5e8-4bfe-823d-366ec5cab8e1","relatedCfdiUuid":"a65cc136-87d7-4770-96ea-899e94e4a1bf","paidAt":"2026-08-21T17:00:00.000Z","paidAmount":54631.41,"beneficiaryAccount":"072180100642352278","beneficiaryBankRfc":"SYN072001BCO","synthetic":true,"operationNumber":"SYN202608210004","paymentTotal":54631.41},
  {"uuid":"cfbb6681-05e5-4441-bbe3-59683d9bcdb2","relatedCfdiUuid":"bca72ef6-e8c2-46bf-bbcc-b931e8c268d4","paidAt":"2026-09-03T17:00:00.000Z","paidAmount":13920,"beneficiaryAccount":"021180043000000432","beneficiaryBankRfc":"SYN021001BCO","synthetic":true,"operationNumber":"SYN202609030013","paymentTotal":85170.01},
];
