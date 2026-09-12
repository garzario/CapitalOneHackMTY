/**
 * Synthetic CFDI 4.0 de ingreso, MetodoPago PPD: two lines, material and labour,
 * issued to be paid later. FormaPago is 99, por definir, which is what PPD
 * forces, and that is why a payment complement has to follow it.
 *
 * This invoice is the first related document of the complement in
 * `pago-complemento.ts`. The two fixtures are a single story on purpose: an
 * invoice that says nothing about where to pay, and a complement that, after the
 * money moved, states the account it landed on.
 *
 * Synthetic throughout. See the header of `cfdi-ingreso-pue.ts` for the rule.
 */

export const CFDI_INGRESO_PPD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
                  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
                  Version="4.0"
                  Serie="A"
                  Folio="1088"
                  Fecha="2026-09-04T09:02:11"
                  Sello="SYNTHETIC-SELLO-NOT-A-SIGNATURE"
                  NoCertificado="00000000000000000001"
                  Certificado="SYNTHETIC-CERTIFICADO-NOT-A-CERTIFICATE"
                  FormaPago="99"
                  MetodoPago="PPD"
                  TipoDeComprobante="I"
                  Exportacion="01"
                  CondicionesDePago="30 dias"
                  SubTotal="72000.00"
                  Moneda="MXN"
                  Total="83520.00"
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
    <cfdi:Concepto ClaveProdServ="30102006"
                   NoIdentificacion="PLA-A36-14"
                   Cantidad="120"
                   ClaveUnidad="H87"
                   Unidad="Pieza"
                   Descripcion="Placa de acero A36 de un cuarto de pulgada"
                   ValorUnitario="480.00"
                   Importe="57600.00"
                   ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="57600.00"
                         Impuesto="002"
                         TipoFactor="Tasa"
                         TasaOCuota="0.160000"
                         Importe="9216.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
    <cfdi:Concepto ClaveProdServ="72101511"
                   NoIdentificacion="SERV-CORTE"
                   Cantidad="1"
                   ClaveUnidad="E48"
                   Unidad="Unidad de servicio"
                   Descripcion="Corte y habilitado en taller"
                   ValorUnitario="14400.00"
                   Importe="14400.00"
                   ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="14400.00"
                         Impuesto="002"
                         TipoFactor="Tasa"
                         TasaOCuota="0.160000"
                         Importe="2304.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="11520.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="72000.00"
                     Impuesto="002"
                     TipoFactor="Tasa"
                     TasaOCuota="0.160000"
                     Importe="11520.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1"
                             UUID="A1B2C3D4-0001-4A2B-9C3D-000000001088"
                             FechaTimbrado="2026-09-04T09:05:44"
                             RfcProvCertif="SYP900101PC1"
                             SelloCFD="SYNTHETIC-SELLO-CFD"
                             NoCertificadoSAT="00000000000000000002"
                             SelloSAT="SYNTHETIC-SELLO-SAT"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
`;
