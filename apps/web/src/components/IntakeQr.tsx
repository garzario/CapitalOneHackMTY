/**
 * The QR the judge scans off the payment run screen.
 *
 * This is the beat the demo is built around: the person judging takes out their
 * own phone, photographs a CLABE or pastes the message a supplier sent, and the
 * instruction they created appears on the big screen a second later through the
 * event stream. Nothing about that is a video or a mock, which is the point.
 *
 * Two things this panel refuses to do.
 *
 * - It does not render a QR that cannot work. On `localhost` the address means
 *   the phone itself, so the panel says so and prints the URL instead of
 *   handing the room a code that fails. Finding that out mid-demo is the
 *   failure this component exists to prevent.
 * - It does not hide the address behind the image. The URL is on screen as
 *   text, big enough to type, because a scanner that will not focus is a normal
 *   thing to happen and the answer to it should not be "try again".
 */

import { intakeLink } from "../lib/intake-link";
import { QrCode } from "./QrCode";

export interface IntakeQrProps {
  /** Injected by the tests. Defaults to the page this screen is served from. */
  origin?: string;
}

function currentOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function IntakeQr({ origin }: IntakeQrProps) {
  const link = intakeLink(origin ?? currentOrigin());

  return (
    <section
      aria-labelledby="intake-qr-heading"
      className="panel flex flex-col items-center gap-3 p-4 text-center"
    >
      <h2 id="intake-qr-heading" className="eyebrow">
        Alta desde tu telefono
      </h2>

      {link.reachable ? (
        <QrCode
          value={link.url}
          size={144}
          label="Codigo QR con la direccion de la pagina de alta de instrucciones"
        />
      ) : (
        <p className="panel-sunken muted p-3 t-xs">{link.reason}</p>
      )}

      <p className="code subtle m-0 t-xs" style={{ wordBreak: "break-all" }}>
        {link.url}
      </p>
      <p className="muted m-0 t-xs">
        Escanea el codigo. La instruccion aparece aqui.
      </p>
    </section>
  );
}
