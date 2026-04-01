import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";
import { BottomSheet } from "./BottomSheet";

function SavingsRow({
  label,
  value,
  unit = "kr",
  sub,
}: {
  label: string;
  value: number | null;
  unit?: string;
  sub?: string;
}) {
  const positive = value !== null && value > 0;
  const negative = value !== null && value < 0;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div>
        <div className="text-sm">{label}</div>
        {sub && <div className="text-xs text-text-dim mt-0.5">{sub}</div>}
      </div>
      <div className={`text-sm font-semibold tabular-nums ${positive ? "text-accent-green" : negative ? "text-accent-red" : "text-text-dim"}`}>
        {value === null ? "—" : `${positive ? "+" : ""}${value.toFixed(2)} ${unit}`}
      </div>
    </div>
  );
}

export function NorgesporisPopup({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: EnergyConfig;
}) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const hourEntity  = entities[config.norgesprisSavingsHour];
  const savingsHour  = parseNumericState(hourEntity?.state);
  const savingsDay   = parseNumericState(entities[config.norgesprisSavingsDay]?.state);
  const savingsMonth = parseNumericState(entities[config.norgesprisSavingsMonth]?.state);
  const savingsYear  = parseNumericState(entities[config.norgesprisSavingsYear]?.state);

  const forbruk      = hourEntity?.attributes?.forbruk_kwh as number | undefined;
  const spotOre      = hourEntity?.attributes?.spotpris_ore_kwh as number | undefined;
  const norgesprisOre = hourEntity?.attributes?.norgespris_ore_kwh as number | undefined;
  const spotKost     = hourEntity?.attributes?.spotpris_kostnad as number | undefined;
  const norgesprisKost = hourEntity?.attributes?.norgespris_kostnad as number | undefined;

  const norgesIsCheaper = norgesprisOre !== undefined && spotOre !== undefined && norgesprisOre < spotOre;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Norgespris besparelse</Dialog.Title>
      <Dialog.Description className="sr-only">Sammenligning av Norgespris mot spotpris</Dialog.Description>

      <div className="px-4 pb-6 pt-2 space-y-4 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Icon icon="mdi:piggy-bank-outline" width={20} className={savingsDay !== null && savingsDay >= 0 ? "text-accent-green" : "text-accent-red"} />
          <h2 className="font-semibold">Norgespris vs Spotpris</h2>
        </div>

        {/* Explanation */}
        <div className="rounded-xl bg-bg-elevated px-3 py-2.5 text-xs text-text-dim leading-relaxed">
          {norgesIsCheaper
            ? "Norgespris er billigere enn spotpris denne timen — du sparer penger."
            : "Spotpris er billigere enn Norgespris denne timen — fastprisavtalen koster deg mer nå."}
          {" "}Positive tall betyr besparelse med Norgespris.
        </div>

        {/* This hour breakdown */}
        <div className="rounded-2xl bg-bg-card p-4 space-y-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-dim mb-1">Siste time</div>

          {forbruk !== undefined && (
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-text-dim">Forbruk</span>
              <span className="text-sm tabular-nums">{forbruk.toFixed(3)} kWh</span>
            </div>
          )}

          {spotOre !== undefined && norgesprisOre !== undefined && (
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-text-dim">Spotpris</span>
              <span className="text-sm tabular-nums">{(spotOre / 100).toFixed(4)} kr/kWh</span>
            </div>
          )}

          {norgesprisOre !== undefined && (
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-text-dim">Norgespris</span>
              <span className="text-sm tabular-nums">{(norgesprisOre / 100).toFixed(4)} kr/kWh</span>
            </div>
          )}

          {spotKost !== undefined && norgesprisKost !== undefined && (
            <>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm text-text-dim">Kostnad spot</span>
                <span className="text-sm tabular-nums">{spotKost.toFixed(2)} kr</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-sm text-text-dim">Kostnad Norgespris</span>
                <span className="text-sm tabular-nums">{norgesprisKost.toFixed(2)} kr</span>
              </div>
            </>
          )}

          <SavingsRow label="Besparelse" value={savingsHour} />
        </div>

        {/* Totals */}
        <div className="rounded-2xl bg-bg-card p-4 space-y-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-dim mb-1">Akkumulert</div>
          <SavingsRow label="I dag" value={savingsDay} />
          <SavingsRow label="Denne måneden" value={savingsMonth} />
          <SavingsRow label="Dette året" value={savingsYear} />
        </div>
      </div>
    </BottomSheet>
  );
}
