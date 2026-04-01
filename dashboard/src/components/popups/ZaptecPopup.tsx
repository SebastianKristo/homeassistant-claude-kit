import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { ZaptecCard } from "../cards/ZaptecCard";
import { parseNumericState } from "../../lib/format";
import {
  TESLA_BATTERY_LEVEL, TESLA_CHARGE_STATE, TESLA_CHARGE_POWER_W,
  TESLA_RANGE_KM, TESLA_CHARGE_LIMIT, TESLA_LADING_PRESET,
  TESLA_COST_PER_H, TESLA_COST_PER_OKT, TESLA_DAILY_KM,
  IONIQ_CUSTOM, IONIQ_LADEPRIS, EV_SPARING,
} from "../../lib/entities";

interface ZaptecPopupProps {
  open: boolean;
  onClose: () => void;
}

const CHARGE_STATE_LABEL: Record<string, { label: string; color: string }> = {
  Charging:     { label: "Lader",        color: "text-accent-green" },
  Complete:     { label: "Ferdig",       color: "text-accent-green" },
  Stopped:      { label: "Stoppet",      color: "text-text-secondary" },
  Disconnected: { label: "Frakoblet",    color: "text-text-dim" },
  NoPower:      { label: "Ingen strøm",  color: "text-accent-red" },
  Starting:     { label: "Starter…",     color: "text-accent-cool" },
};

function EvSparingDropdown({ entities }: { entities: HassEntities }) {
  const [open, setOpen] = useState(false);
  const sparingAttrs = entities[EV_SPARING]?.attributes as Record<string, unknown> | undefined;
  const totalSparing = parseNumericState(entities[EV_SPARING]?.state);
  if (totalSparing === null) return null;

  const totalKm        = sparingAttrs?.total_km_kjort as number | undefined;
  const elKostnad      = sparingAttrs?.total_el_kostnad as number | undefined;
  const dieselKostnad  = sparingAttrs?.total_diesel_kostnad as number | undefined;
  const sparingPerKm   = sparingAttrs?.sparing_per_km as number | undefined;
  const elPerKm        = sparingAttrs?.el_per_km as number | undefined;
  const dieselPerKm    = sparingAttrs?.diesel_per_km as number | undefined;
  const co2Spart       = sparingAttrs?.co2_spart_kg as number | undefined;

  return (
    <div className="rounded-xl bg-accent-green/8 ring-1 ring-accent-green/15 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <Icon icon="mdi:leaf" width={14} className="text-accent-green" />
          <span className="text-xs font-semibold text-accent-green">EV-sparing</span>
          <span className="text-base font-bold tabular-nums text-text-primary">
            {Math.round(totalSparing).toLocaleString("nb-NO")} kr
          </span>
        </div>
        <Icon icon={open ? "mdi:chevron-up" : "mdi:chevron-down"} width={14} className="text-accent-green/60" />
      </button>

      {open && (
        <div className="border-t border-accent-green/15 px-3 py-2.5 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {totalKm !== undefined && (
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-text-dim mb-0.5">Km kjørt</div>
                <div className="font-bold tabular-nums">{totalKm.toLocaleString("nb-NO")} km</div>
              </div>
            )}
            {sparingPerKm !== undefined && (
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-text-dim mb-0.5">Sparing/km</div>
                <div className="font-bold tabular-nums text-accent-green">{sparingPerKm.toFixed(2)} kr</div>
              </div>
            )}
            {elKostnad !== undefined && (
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-text-dim mb-0.5">El-kostnad</div>
                <div className="font-bold tabular-nums">{Math.round(elKostnad).toLocaleString("nb-NO")} kr</div>
              </div>
            )}
            {dieselKostnad !== undefined && (
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-text-dim mb-0.5">Diesel ville kostet</div>
                <div className="font-bold tabular-nums">{Math.round(dieselKostnad).toLocaleString("nb-NO")} kr</div>
              </div>
            )}
            {elPerKm !== undefined && (
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-text-dim mb-0.5">El per km</div>
                <div className="font-bold tabular-nums">{elPerKm.toFixed(2)} kr/km</div>
              </div>
            )}
            {dieselPerKm !== undefined && (
              <div className="rounded-lg bg-white/5 px-2.5 py-2">
                <div className="text-text-dim mb-0.5">Diesel per km</div>
                <div className="font-bold tabular-nums">{dieselPerKm.toFixed(2)} kr/km</div>
              </div>
            )}
          </div>
          {co2Spart !== undefined && (
            <div className="flex items-center gap-2 rounded-lg bg-accent-green/10 px-2.5 py-2 text-xs">
              <Icon icon="mdi:molecule-co2" width={14} className="text-accent-green" />
              <span className="text-text-dim">CO₂ spart</span>
              <span className="ml-auto font-bold tabular-nums text-accent-green">{co2Spart.toFixed(1)} kg</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeslaSection({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  const batteryPct   = parseNumericState(entities[TESLA_BATTERY_LEVEL]?.state);
  const chargeState  = entities[TESLA_CHARGE_STATE]?.state ?? "";
  const chargePowerW = parseNumericState(entities[TESLA_CHARGE_POWER_W]?.state) ?? 0;
  const rangeKm      = parseNumericState(entities[TESLA_RANGE_KM]?.state);
  const chargeLimit  = parseNumericState(entities[TESLA_CHARGE_LIMIT]?.state);
  const dailyKm      = parseNumericState(entities[TESLA_DAILY_KM]?.state);
  const costPerH     = parseNumericState(entities[TESLA_COST_PER_H]?.state);
  const costPerOkt   = parseNumericState(entities[TESLA_COST_PER_OKT]?.state);
  const ladingPreset = entities[TESLA_LADING_PRESET]?.state ?? "";
  const presetOptions = entities[TESLA_LADING_PRESET]?.attributes?.options as string[] | undefined;

  const ioniqAttrs   = entities[IONIQ_CUSTOM]?.attributes as Record<string, unknown> | undefined;
  const ioniqLadetid = ioniqAttrs?.ladetid as string | undefined;
  const ioniqLadepris = parseNumericState(entities[IONIQ_LADEPRIS]?.state);

  const isCharging  = chargeState === "Charging";
  const stateMeta   = CHARGE_STATE_LABEL[chargeState] ?? { label: chargeState, color: "text-text-secondary" };
  const barColor    = batteryPct === null ? "bg-white/20" : batteryPct > 40 ? "bg-accent-green" : batteryPct > 20 ? "bg-accent-warm" : "bg-accent-red";

  const chargelimitMin = parseNumericState(entities[TESLA_CHARGE_LIMIT]?.attributes?.min as string | undefined) ?? 50;
  const chargelimitMax = parseNumericState(entities[TESLA_CHARGE_LIMIT]?.attributes?.max as string | undefined) ?? 100;

  const adjustLimit = (delta: number) => {
    if (!connection || chargeLimit === null) return;
    const next = Math.min(chargelimitMax, Math.max(chargelimitMin, chargeLimit + delta));
    callService(connection, "input_number", "set_value", { value: next }, { entity_id: TESLA_CHARGE_LIMIT });
  };

  const setPreset = (option: string) => {
    if (!connection) return;
    callService(connection, "input_select", "select_option", { option }, { entity_id: TESLA_LADING_PRESET });
  };

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${isCharging ? "bg-accent-green/8 ring-1 ring-accent-green/20" : "bg-bg-card"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:car-electric" width={18} className={isCharging ? "text-accent-green" : "text-text-secondary"} />
          <span className="text-sm font-semibold">Tesla Model Y</span>
        </div>
        <span className={`text-xs font-medium ${stateMeta.color}`}>{stateMeta.label}</span>
      </div>

      {/* Battery */}
      {batteryPct !== null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold tabular-nums text-2xl text-text-primary">{Math.round(batteryPct)}%</span>
            <div className="text-right">
              {rangeKm !== null && <div className="text-text-secondary tabular-nums">{Math.round(rangeKm)} km rekkevidde</div>}
              {chargeLimit !== null && <div className="text-text-dim tabular-nums">Grense: {Math.round(chargeLimit)}%</div>}
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${batteryPct}%` }} />
          </div>
          {chargeLimit !== null && (
            <div
              className="relative h-1"
              style={{ paddingLeft: `${chargeLimit}%` }}
              title={`Ladegrense: ${Math.round(chargeLimit)}%`}
            >
              <div className="absolute h-3 w-0.5 bg-accent-cool/60 top-0 -translate-x-0.5" style={{ left: `${chargeLimit}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Live charging power */}
      {isCharging && chargePowerW > 0 && (
        <div className="flex items-center gap-2 text-sm text-accent-green">
          <Icon icon="mdi:lightning-bolt" width={15} />
          <span className="tabular-nums font-semibold">{(chargePowerW / 1000).toFixed(1)} kW</span>
          {costPerH !== null && <span className="text-xs text-text-dim">≈ {costPerH.toFixed(2)} kr/t</span>}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        {dailyKm !== null && (
          <div className="rounded-xl bg-bg-elevated px-3 py-2">
            <div className="text-text-dim mb-0.5">Kjørt i dag</div>
            <div className="font-bold tabular-nums">{Math.round(dailyKm)} km</div>
          </div>
        )}
        {costPerOkt !== null && (
          <div className="rounded-xl bg-bg-elevated px-3 py-2">
            <div className="text-text-dim mb-0.5">Siste økt</div>
            <div className="font-bold tabular-nums">{costPerOkt.toFixed(2)} kr</div>
          </div>
        )}
        {ioniqLadepris !== null && (
          <div className="rounded-xl bg-bg-elevated px-3 py-2">
            <div className="text-text-dim mb-0.5">Ladepris nå</div>
            <div className="font-bold tabular-nums">{ioniqLadepris.toFixed(0)} kr</div>
          </div>
        )}
      </div>

      {/* EV sparing — collapsible dropdown */}
      <EvSparingDropdown entities={entities} />

      {/* Ladetid estimate from ioniq_custom */}
      {ioniqLadetid && (
        <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-3 py-2 text-xs">
          <span className="text-text-dim">Estimert ladetid</span>
          <span className="font-semibold tabular-nums">{ioniqLadetid}</span>
        </div>
      )}

      {/* Ladegrense stepper */}
      {chargeLimit !== null && (
        <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-3 py-2">
          <span className="text-xs text-text-dim">Ladegrense</span>
          <div className="flex items-center gap-2">
            <button onClick={() => adjustLimit(-5)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 hover:bg-white/12 active:scale-95 transition-transform" aria-label="Senk grense">
              <Icon icon="mdi:minus" width={12} />
            </button>
            <span className="w-12 text-center text-sm font-semibold tabular-nums">{Math.round(chargeLimit)}%</span>
            <button onClick={() => adjustLimit(5)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 hover:bg-white/12 active:scale-95 transition-transform" aria-label="Øk grense">
              <Icon icon="mdi:plus" width={12} />
            </button>
          </div>
        </div>
      )}

      {/* Lading preset */}
      {presetOptions && presetOptions.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-text-dim">Ladingspreset</div>
          <div className="flex flex-wrap gap-1.5">
            {presetOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setPreset(opt)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  opt === ladingPreset
                    ? "bg-accent-green/20 text-accent-green ring-1 ring-accent-green/30"
                    : "bg-white/8 text-text-secondary hover:bg-white/12"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ZaptecPopup({ open, onClose }: ZaptecPopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Elbillader og kjøretøy</Dialog.Title>
      <Dialog.Description className="sr-only">Status og kontroll for elbil og lader</Dialog.Description>
      <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
        {/* Tesla Model Y */}
        <TeslaSection entities={entities} connection={connection} />

        {/* Zaptec charger */}
        <ZaptecCard entities={entities} connection={connection} />
      </div>
    </BottomSheet>
  );
}
