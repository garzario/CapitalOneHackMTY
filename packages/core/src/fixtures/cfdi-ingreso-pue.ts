/**
 * Synthetic CFDI 4.0 de ingreso, MetodoPago PUE: one steel supply invoice paid in
 * a single exhibition, so no payment complement will ever follow it.
 *
 * Every RFC, name, folio, UUID and amount in this file is invented. The RFCs all
 * start with SY and match no taxpayer. `Sello`, `Certificado` and `SelloSAT` are
 * placeholders rather than truncated real signatures: nothing in the engine
 * verifies a CFDI signature (the PAC already did, and the one signature we do
 * verify is the Banxico one on a CEP), so a fake string here cannot be mistaken
 * for evidence of anything.
 *
 * Kept as a TypeScript module rather than an .xml file so that the string is
 * byte-identical wherever it is used, including in the bundled Node runtime of
 * `apps/api`, where a relative file read would not survive the build.
 */

export const CFDI_INGRESO_PUE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Synthetic document. Not a real CFDI. Never presented as one. -->
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
                  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
                  Version="4.0"
                  Serie="A"
                  Folio="1042"
                  Fecha="2026-09-01T10:14:32"
                  Sello="SYNTHETIC-SELLO-NOT-A-SIGNATURE"
                  NoCertificado="00000000000000000001"
                  Certificado="SYNTHETIC-CERTIFICADO-NOT-A-CERTIFICATE"
                  FormaPago="03"
                  MetodoPago="PUE"
                  TipoDeComprobante="I"
                  Exportacion="01"
                  SubTotal="158000.00"
                  Moneda="MXN"
                  Total="183280.00"
                  LugarExpedicion="64000">
  <cfdi:Emisor Rfc="SYN010101AAA"
               Nombre="ACEROS &amp; PERFILES SINTETICOS SA DE CV"
               RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="SYN950505BB2"
                 Nombre="MANUFACTURAS DEMO DEL NORTE SA DE CV"
                 DomicilioFiscalReceptor="64000"
                 RegimenFiscalReceptor="601"
                 UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="30102313"
                   NoIdentificacion="TUB-2-A36"
                   Cantidad="40"
                   ClaveUnidad="H87"
                   Unidad="Pieza"
                   Descripcion="Tubo de acero al carbono de 2 pulgadas, tramo de 6 metros"
                   ValorUnitario="3950.00"
                   Importe="158000.00"
                   ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="158000.00"
                         Impuesto="002"
                         TipoFactor="Tasa"
                         TasaOCuota="0.160000"
                         Importe="25280.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="25280.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="158000.00"
                     Impuesto="002"
                     TipoFactor="Tasa"
                     TasaOCuota="0.160000"
                     Importe="25280.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1"
                             UUID="A1B2C3D4-0001-4A2B-9C3D-000000001042"
                             FechaTimbrado="2026-09-01T10:16:05"
                             RfcProvCertif="SYP900101PC1"
                             SelloCFD="SYNTHETIC-SELLO-CFD"
                             NoCertificadoSAT="00000000000000000002"
                             SelloSAT="SYNTHETIC-SELLO-SAT"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
`;
