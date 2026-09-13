/**
 * The token sheet: every token and every base component on one page, in the
 * theme the browser is in.
 *
 * It is a reference and not a screen. It is not in the navigation and no link in
 * the product points at it; it lives at `#/design` so that a designer, a reviewer
 * or a judge who asks "what is the system" gets an answer in one page, and so the
 * contrast audit in `apps/web/audit/audit.ts` has one route where every chip,
 * every button and every state is on screen at the same time.
 *
 * The values are read out of the live stylesheet with `getComputedStyle` rather
 * than typed in here. That is the whole point: a hand-written swatch list is a
 * second source of truth that drifts the first time somebody changes a hex in
 * `tokens.css`, and a sheet that lies about the system is worse than no sheet.
 * The names below are the only thing this file asserts, and `tokens.test.ts`
 * fails if one of them is not defined.
 */

import type { TransactionState } from "@hackmty/core";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { Drawer } from "../components/Drawer";
import {
  ConfidenceBadge,
  DecisionBadge,
  SectionHeader,
  TransactionStateBadge,
} from "../components/Primitives";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../components/States";
import { useToasts } from "../components/Toast";
import {
  ACTION_LABEL,
  CONFIDENCE_HELP,
  CONFIDENCE_ORDER,
  STATE_HELP,
  STATE_ORDER,
  SYNTHETIC_LABEL,
} from "../lib/labels";
import { subscribeTheme } from "../lib/theme";

type Group = { title: string; note: string; tokens: string[] };

const COLOUR_GROUPS: Group[] = [
  {
    title: "Superficies",
    note: "Del fondo de la pagina hasta el cajon que se abre encima.",
    tokens: [
      "--c-canvas",
      "--c-surface",
      "--c-surface-raised",
      "--c-surface-sunken",
    ],
  },
  {
    title: "Texto",
    note: "Tres pesos de tinta, medidos contra el panel mas oscuro en el que caen.",
    tokens: ["--c-ink", "--c-ink-muted", "--c-ink-subtle", "--c-ink-inverse"],
  },
  {
    title: "Lineas",
    note: "--c-border-strong es el borde de un control, no un adorno: mide 3:1 contra su propio fondo.",
    tokens: ["--c-border", "--c-border-strong", "--c-grid"],
  },
  {
    title: "Acento, uno solo",
    note: "Foco, enlaces y la accion primaria. Nada mas.",
    tokens: ["--c-accent", "--c-accent-ink", "--c-accent-soft", "--c-focus"],
  },
  {
    title: "Decision",
    note: "Mapeados uno a uno contra el tipo Action de packages/core: hold, verify, release.",
    tokens: [
      "--c-hold",
      "--c-hold-soft",
      "--c-hold-ink",
      "--c-verify",
      "--c-verify-soft",
      "--c-verify-ink",
      "--c-release",
      "--c-release-soft",
      "--c-release-ink",
    ],
  },
  {
    title: "Nivel, ADR-0009",
    note: "Alias sobre los tres de decision. El nivel y la accion son dos lecturas de una misma evidencia.",
    tokens: [
      "--c-level-alerta",
      "--c-level-alerta-soft",
      "--c-level-alerta-ink",
      "--c-level-precaucion",
      "--c-level-precaucion-soft",
      "--c-level-precaucion-ink",
      "--c-level-confiable",
      "--c-level-confiable-soft",
      "--c-level-confiable-ink",
    ],
  },
  {
    title: "Estado, ADR-0009",
    note: "Un estado es un hecho sobre el dinero, no un veredicto: enviado es informativo y no verde.",
    tokens: [
      "--c-state-rojo",
      "--c-state-cancelado",
      "--c-state-enviado",
      "--c-state-liberado",
      "--c-state-pendiente",
    ],
  },
  {
    title: "Informativo y marca de agua",
    note: "--c-watermark es de bajo contraste a proposito; la frase encima de ella no lo es.",
    tokens: [
      "--c-info",
      "--c-info-soft",
      "--c-info-ink",
      "--c-watermark",
      "--c-watermark-ink",
      "--c-scrim",
    ],
  },
  {
    title: "QR",
    note: "El unico par identico en los dos temas: un lector necesita modulos oscuros sobre zona clara.",
    tokens: ["--c-qr-module", "--c-qr-quiet"],
  },
];

const TYPE_STEPS: Array<{ token: string; className: string }> = [
  { token: "--text-3xl", className: "t-3xl" },
  { token: "--text-2xl", className: "t-2xl" },
  { token: "--text-xl", className: "t-xl" },
  { token: "--text-lg", className: "t-lg" },
  { token: "--text-md", className: "t-md" },
  { token: "--text-base", className: "t-base" },
  { token: "--text-sm", className: "t-sm" },
  { token: "--text-xs", className: "t-xs" },
];

const SPACE_TOKENS = [
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-8",
  "--space-10",
  "--space-12",
];

const RADIUS_TOKENS = [
  "--radius-xs",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-pill",
];

const MOTION_TOKENS = [
  "--motion-fast",
  "--motion-base",
  "--motion-slow",
  "--ease-standard",
  "--ease-exit",
];

const LAYOUT_TOKENS = [
  "--layout-max",
  "--rail-width",
  "--drawer-width",
  "--toast-width",
  "--focus-width",
  "--focus-offset",
];

/**
 * The computed value of a list of tokens, re-read when the appearance changes,
 * because half of them are different in dark and a sheet that shows the light
 * value under a dark swatch is the drift this file exists to avoid.
 *
 * It subscribes to the theme store and not to `prefers-color-scheme`: the dark
 * palette hangs off `data-theme` now, so the operating system changing its mind
 * moves nothing on this page and the button in the top bar moves everything.
 */
function useTokenValues(names: string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};

      for (const name of names) {
        next[name] = style.getPropertyValue(name).trim();
      }

      setValues(next);
    };

    read();

    /* The store publishes after it has written the attribute, so the values read
       here are already the ones the page is painted in. */
    return subscribeTheme(read);
    /* The list is a module constant on every caller, so comparing it by
       identity is correct and re-reading on every render is not. */
  }, [names]);

  return values;
}

const ALL_COLOUR_TOKENS = COLOUR_GROUPS.flatMap((group) => group.tokens);

const SIZE_TOKENS = [
  ...TYPE_STEPS.map((step) => step.token),
  ...SPACE_TOKENS,
  ...RADIUS_TOKENS,
  ...MOTION_TOKENS,
  ...LAYOUT_TOKENS,
];

/**
 * One colour, its name and the value it currently resolves to.
 *
 * The inline style is the one place in the app where it is right: the token is a
 * variable, so there is no class to write, and this page is the documentation of
 * the system rather than a part of the product.
 *
 * The chip sits on `watermark-tile`, whose diagonal rule shows through anything
 * that is not opaque. That is how `--c-surface` at pure white and `--c-scrim` at
 * 45 percent are both legible here, instead of one being an invisible square and
 * the other lying about its alpha.
 */
function Swatch({ token, value }: { token: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="watermark-tile"
        style={{
          width: "2.5rem",
          height: "2.5rem",
          borderRadius: "var(--radius-sm)",
          border: "var(--border-width) solid var(--c-border)",
          backgroundColor: `var(${token})`,
          flex: "none",
        }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="code">{token}</span>
        <span className="subtle t-xs">{value || "sin valor"}</span>
      </span>
    </div>
  );
}

type DemoRow = {
  id: string;
  supplier: string;
  amount: string;
  state: TransactionState;
};

const DEMO_ROWS: DemoRow[] = [
  {
    id: "a",
    supplier: "Aceros y Laminados del Golfo SA de CV",
    amount: "184,300.00",
    state: "rojo",
  },
  {
    id: "b",
    supplier: "Transportes Regiomontanos SA de CV",
    amount: "38,417.48",
    state: "liberado",
  },
  {
    id: "c",
    supplier: "Insumos Industriales del Norte SA de CV",
    amount: "9,120.00",
    state: "enviado",
  },
];

const DEMO_COLUMNS: ReadonlyArray<Column<DemoRow>> = [
  {
    key: "supplier",
    header: "Proveedor",
    rowHeader: true,
    cellClass: "cell-supplier",
    cell: (row) => row.supplier,
  },
  {
    key: "amount",
    header: "Importe",
    align: "end",
    cell: (row) => <span className="num">{row.amount}</span>,
  },
  {
    key: "state",
    header: "Estado",
    cell: (row) => <TransactionStateBadge state={row.state} />,
  },
];

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="t-md">{title}</h2>
        {note ? <p className="muted max-w-prose t-sm">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function TokenSheet() {
  const colours = useTokenValues(ALL_COLOUR_TOKENS);
  const sizes = useTokenValues(SIZE_TOKENS);
  const { show } = useToasts();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <SectionHeader
        title="Sistema de diseno"
        description="Los tokens y los componentes base, leidos del mismo archivo que usa la aplicacion. Cambia el tema del sistema y esta pagina cambia con el. No esta en el menu: es una referencia, no una pantalla."
      />

      <Block
        title="Color"
        note="Ningun archivo fuera de design/tokens.css escribe un color. Los valores de abajo se leen con getComputedStyle, asi que esta hoja no puede desfasarse del sistema."
      >
        <div className="flex flex-col gap-5">
          {COLOUR_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="eyebrow">{group.title}</h3>
                <p className="subtle max-w-prose t-xs">{group.note}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.tokens.map((token) => (
                  <Swatch
                    key={token}
                    token={token}
                    value={colours[token] ?? ""}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block
        title="Tipografia"
        note="Una familia para texto, una para un RFC o una CLABE, y cifras tabulares en cada importe para que una columna de pesos se lea hacia abajo."
      >
        <div className="flex flex-col gap-3">
          {TYPE_STEPS.map((step) => (
            <div
              key={step.token}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
            >
              <span className={step.className}>184,300.00</span>
              <span className="code subtle">{step.token}</span>
              <span className="subtle t-xs">{sizes[step.token] ?? ""}</span>
            </div>
          ))}
          <div className="panel-sunken flex flex-col gap-2 p-4">
            <span className="num-xl">1,284,917.32</span>
            <span className="code">002180401234567893</span>
            <span className="subtle t-xs">
              .num-xl y .code, el total de la corrida y una CLABE
            </span>
          </div>
        </div>
      </Block>

      <Block
        title="Espacio, radio y movimiento"
        note="Una escala de 4 px, cinco radios y tres duraciones. Con prefers-reduced-motion las tres duraciones valen 1 ms y la aplicacion entera deja de moverse desde un solo lugar."
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <h3 className="eyebrow">Espacio</h3>
            {SPACE_TOKENS.map((token) => (
              <div key={token} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  style={{
                    width: `var(${token})`,
                    height: "0.75rem",
                    backgroundColor: "var(--c-accent)",
                    borderRadius: "var(--radius-xs)",
                    flex: "none",
                  }}
                />
                <span className="code">{token}</span>
                <span className="subtle t-xs">{sizes[token] ?? ""}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="eyebrow">Radio</h3>
            {RADIUS_TOKENS.map((token) => (
              <div key={token} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  style={{
                    width: "2rem",
                    height: "1.5rem",
                    border: "var(--border-width) solid var(--c-border-strong)",
                    borderRadius: `var(${token})`,
                    flex: "none",
                  }}
                />
                <span className="code">{token}</span>
                <span className="subtle t-xs">{sizes[token] ?? ""}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="eyebrow">Movimiento y medidas</h3>
            {[...MOTION_TOKENS, ...LAYOUT_TOKENS].map((token) => (
              <div key={token} className="flex flex-wrap items-baseline gap-2">
                <span className="code">{token}</span>
                <span className="subtle t-xs">{sizes[token] ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block
        title="Nivel y estado"
        note="Las dos palabras con las que se lee todo el producto. Nunca un numero, nunca un porcentaje y nunca la palabra que promete que algo no puede salir mal: un SPEI no regresa. El nivel trae una barra de tres pasos y el estado un punto y un borde punteado cuando nadie lo ha decidido, porque el color no puede ser el unico canal."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="eyebrow">Nivel, con la evidencia debajo</h3>
            {CONFIDENCE_ORDER.map((level) => (
              <div key={level} className="flex flex-wrap items-center gap-3">
                <ConfidenceBadge level={level} />
                <span className="muted max-w-prose t-sm">
                  {CONFIDENCE_HELP[level]}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="eyebrow">Estado</h3>
            {STATE_ORDER.map((state) => (
              <div key={state} className="flex flex-wrap items-center gap-3">
                <TransactionStateBadge state={state} />
                <span className="muted max-w-prose t-sm">
                  {STATE_HELP[state]}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="eyebrow">Accion que el motor propone</h3>
            <div className="flex flex-wrap gap-2">
              <DecisionBadge action="hold" />
              <DecisionBadge action="verify" />
              <DecisionBadge action="release" />
            </div>
            <p className="subtle max-w-prose t-xs">
              Tres vocabularios y tres columnas distintas: la accion es lo que
              propone el motor, el nivel es cuanta evidencia hay y el estado es
              lo que paso con el dinero.
            </p>
          </div>
        </div>
      </Block>

      <Block
        title="Botones"
        note="Color solo en las tres decisiones. Un boton ocupado se desactiva y lo dice con palabras, porque una corrida enviada dos veces no se deshace."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Neutro</Button>
            <Button tone="accent">Accion primaria</Button>
            <Button tone="hold">{ACTION_LABEL.hold}</Button>
            <Button tone="verify">{ACTION_LABEL.verify}</Button>
            <Button tone="release">{ACTION_LABEL.release}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Pequeno</Button>
            <Button size="base">Normal</Button>
            <Button size="lg">Grande, para el pulgar</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button busy busyLabel="Enviando la corrida" tone="accent">
              Enviar la corrida
            </Button>
            <Button disabled>Desactivado</Button>
          </div>
        </div>
      </Block>

      <Block
        title="Tabla"
        note="Cabeceras con scope, una celda que nombra la fila, el importe a la derecha y scroll propio cuando no cabe, para que la pagina nunca se corra de lado."
      >
        <DataTable
          caption="Ejemplo de tres lineas de una corrida, con su importe y su estado."
          columns={DEMO_COLUMNS}
          rows={DEMO_ROWS}
          rowKey={(row) => row.id}
        />
      </Block>

      <Block
        title="Cargando, vacio y error"
        note="Cada pantalla se disena en cuatro estados. Un vacio se escribe como respuesta y no como ausencia, y un error nombra lo que fallo y ofrece el reintento."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="panel-sunken">
            <LoadingBlock label="Cargando el ejemplo" rows={3} />
          </div>
          <div className="panel-sunken">
            <EmptyBlock
              title="Sin hallazgos"
              description="Los seis controles corrieron y no encontraron nada. Esta linea no necesita a nadie."
            />
          </div>
          <div className="panel-sunken">
            <ErrorBlock
              title="No se pudo leer la lista"
              message="El padron del SAT no respondio. Aqui iria el reintento."
            />
          </div>
        </div>
      </Block>

      <Block
        title="Cajon, avisos y foco"
        note="El cajon atrapa el tabulador y devuelve el foco a lo que lo abrio. Un aviso de rechazo no se va solo: la razon se queda hasta que alguien la cierra."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setDrawerOpen(true)}>Abrir el cajon</Button>
          <Button
            onClick={() =>
              show({
                tone: "ok",
                title: "Decision registrada",
                detail: "Retener, con el hallazgo de la lista 69-B.",
              })
            }
          >
            Aviso de confirmacion
          </Button>
          <Button
            onClick={() =>
              show({
                tone: "warn",
                title: "Falta una verificacion",
                detail: "La cuenta no tiene historial de pago.",
              })
            }
          >
            Aviso de atencion
          </Button>
          <Button
            onClick={() =>
              show({
                tone: "stop",
                title: "El banco rechazo la linea",
                detail: "Se queda en pantalla hasta que la cierres.",
              })
            }
          >
            Aviso de rechazo
          </Button>
        </div>
        <p className="subtle max-w-prose t-xs">
          El anillo de foco se define una vez en design/base.css y sale de
          --c-focus, --focus-width y --focus-offset. Recorre esta pagina con el
          tabulador: cada control lo muestra.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="watermark">{SYNTHETIC_LABEL}</span>
          <span className="subtle t-xs">
            La marca se dibuja desde la bandera synthetic del dato, nunca desde
            un nombre.
          </span>
        </div>
      </Block>

      {drawerOpen ? (
        <Drawer
          eyebrow="Componente base"
          title="Cajon"
          subtitle={<span className="code muted">components/Drawer.tsx</span>}
          scrimLabel="Cerrar el cajon de ejemplo"
          onClose={() => setDrawerOpen(false)}
        >
          <p className="muted max-w-prose t-sm">
            Escape cierra. El tabulador da vueltas dentro del panel y no se
            escapa a la corrida que quedo detras del velo. Al cerrar, el foco
            vuelve al boton que lo abrio.
          </p>
        </Drawer>
      ) : null}
    </>
  );
}
