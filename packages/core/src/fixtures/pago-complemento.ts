/**
 * Synthetic complemento de recepcion de pagos 2.0: one transfer of 118,320.00
 * MXN that settles two invoices, the PPD one in `cfdi-ingreso-ppd.ts` in full and
 * a second one in part.
 *
 * Two details make this fixture worth reading rather than skimming.
 *
 * - `CtaBeneficiario` is the account the supplier states, under its own stamp and
 *   after the fact, that the money arrived on. It is the only account in the
 *   whole fiscal record that the supplier itself attests to, which is what makes
 *   it the baseline the beneficiary controls compare a new instruction against.
 * - The complement nests `pago20:TrasladoDR` and `pago20:TrasladoP` nodes whose
 *   local names look like the `cfdi:Traslado` of an invoice. Anything that reads
 *   these documents by local name alone eventually adds one of these to an IVA
 *   total, which is why the parser addresses every value by an exact path.
 *
 * The CLABEs carry real three-digit institution codes, 012 and 072, because a
 * CLABE control digit is only meaningful on a structurally valid account number
 * and the forensic control needs a clean baseline to work from. Everything else,
 * every RFC, name, folio, UUID, amount and operation number, is invented.
 */

export const PAGO_COMPLEMENTO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
                  xmlns:pago20="http://www.sat.gob.mx/Pagos20"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd"
                  Version="4.0"
                  Serie="P"
                  Folio="318"
                  Fecha="2026-09-09T11:05:00"
                  Sello="SYNTHETIC-SELLO-NOT-A-SIGNATURE"
                  NoCertificado="00000000000000000001"
                  Certificado="SYNTHETIC-CERTIFICADO-NOT-A-CERTIFICATE"
                  TipoDeComprobante="P"
                  Exportacion="01"
                  SubTotal="0"
                  Moneda="XXX"
                  Total="0"
                  LugarExpedicion="64000">
  <cfdi:Emisor Rfc="SYN010101AAA"
               Nombre="ACEROS &amp; PERFILES SINTETICOS SA DE CV"
               RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="SYN950505BB2"
                 Nombre="MANUFACTURAS DEMO DEL NORTE SA DE CV"
                 DomicilioFiscalReceptor="64000"
                 RegimenFiscalReceptor="601"
                 UsoCFDI="CP01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506"
                   Cantidad="1"
                   ClaveUnidad="ACT"
                   Descripcion="Pago"
                   ValorUnitario="0"
                   Importe="0"
                   ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="118320.00"
                      TotalTrasladosBaseIVA16="102000.00"
                      TotalTrasladosImpuestoIVA16="16320.00"/>
      <pago20:Pago FechaPago="2026-09-08T12:00:00"
                   FormaDePagoP="03"
                   MonedaP="MXN"
                   TipoCambioP="1"
                   Monto="118320.00"
                   NumOperacion="SYN2026090800012345"
                   RfcEmisorCtaOrd="SYB900101AA1"
                   CtaOrdenante="012580001234567897"
                   RfcEmisorCtaBen="SYB900202BB2"
                   CtaBeneficiario="072580000987654328">
        <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001088"
                                 Serie="A"
                                 Folio="1088"
                                 MonedaDR="MXN"
                                 EquivalenciaDR="1"
                                 NumParcialidad="1"
                                 ImpSaldoAnt="83520.00"
                                 ImpPagado="83520.00"
                                 ImpSaldoInsoluto="0.00"
                                 ObjetoImpDR="02">
          <pago20:ImpuestosDR>
            <pago20:TrasladosDR>
              <pago20:TrasladoDR BaseDR="72000.00"
                                 ImpuestoDR="002"
                                 TipoFactorDR="Tasa"
                                 TasaOCuotaDR="0.160000"
                                 ImporteDR="11520.00"/>
            </pago20:TrasladosDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>
        <pago20:DoctoRelacionado IdDocumento="A1B2C3D4-0001-4A2B-9C3D-000000001095"
                                 Serie="A"
                                 Folio="1095"
                                 MonedaDR="MXN"
                                 EquivalenciaDR="1"
                                 NumParcialidad="1"
                                 ImpSaldoAnt="58000.00"
                                 ImpPagado="34800.00"
                                 ImpSaldoInsoluto="23200.00"
                                 ObjetoImpDR="02">
          <pago20:ImpuestosDR>
            <pago20:TrasladosDR>
              <pago20:TrasladoDR BaseDR="30000.00"
                                 ImpuestoDR="002"
                                 TipoFactorDR="Tasa"
                                 TasaOCuotaDR="0.160000"
                                 ImporteDR="4800.00"/>
            </pago20:TrasladosDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>
        <pago20:ImpuestosP>
          <pago20:TrasladosP>
            <pago20:TrasladoP BaseP="102000.00"
                              ImpuestoP="002"
                              TipoFactorP="Tasa"
                              TasaOCuotaP="0.160000"
                              ImporteP="16320.00"/>
          </pago20:TrasladosP>
        </pago20:ImpuestosP>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
                             Version="1.1"
                             UUID="B7E6D5C4-0002-4F1A-8B2C-000000000318"
                             FechaTimbrado="2026-09-09T11:07:19"
                             RfcProvCertif="SYP900101PC1"
                             SelloCFD="SYNTHETIC-SELLO-CFD"
                             NoCertificadoSAT="00000000000000000002"
                             SelloSAT="SYNTHETIC-SELLO-SAT"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
`;
