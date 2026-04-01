import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import {
  TESLA_BATTERY_LEVEL,
  TESLA_CHARGE_STATE,
  TESLA_CHARGE_POWER_W,
  TESLA_PLUGGED_IN,
  TESLA_RANGE_KM,
  TIBBER_SMART_CHARGING,
  TESLA_CHARGING_SWITCH,
  ENERGY_CONFIG,
} from "../../lib/entities";
import { ZaptecPopup } from "../popups/ZaptecPopup";

const SMART_LADING_MAKS_PRIS = "input_number.smart_lading_maks_pris";

const CHARGE_STATE_LABEL: Record<string, { label: string; color: string }> = {
  Charging:    { label: "Lader",        color: "text-accent-green" },
  Complete:    { label: "Ferdig ladet", color: "text-accent-green" },
  Stopped:     { label: "Stoppet",      color: "text-text-secondary" },
  Disconnected:{ label: "Frakoblet",    color: "text-text-dim" },
  NoPower:     { label: "Ingen strøm",  color: "text-accent-red" },
  Starting:    { label: "Starter…",     color: "text-accent-cool" },
};

/** Combined Tesla Model Y + Smart Charging card. */
export function EvCard() {
  const entities = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;
  const [chargerOpen, setChargerOpen] = useState(false);

  // Tesla state
  const batteryPct   = parseNumericState(entities[TESLA_BATTERY_LEVEL]?.state);
  const chargeState  = entities[TESLA_CHARGE_STATE]?.state ?? "";
  const chargePowerW = parseNumericState(entities[TESLA_CHARGE_POWER_W]?.state) ?? 0;
  const pluggedIn    = entities[TESLA_PLUGGED_IN]?.state;
  const rangeKm      = parseNumericState(entities[TESLA_RANGE_KM]?.state);

  const isCharging   = chargeState === "Charging";
  const isConnected  = pluggedIn === "plugged_in" || isCharging;
  const stateMeta    = CHARGE_STATE_LABEL[chargeState] ?? { label: chargeState, color: "text-text-secondary" };

  // Smart charging state
  const smartState      = entities[TIBBER_SMART_CHARGING]?.state;
  const chargingState   = entities[TESLA_CHARGING_SWITCH]?.state;
  const norgesprisPrice = parseNumericState(entities[ENERGY_CONFIG.tibberPrice]?.state);
  const maksPrice       = parseNumericState(entities[SMART_LADING_MAKS_PRIS]?.state);
  const maksMin = parseNumericState(entities[SMART_LADING_MAKS_PRIS]?.attributes?.min as string | undefined) ?? 0.20;
  const maksMax = parseNumericState(entities[SMART_LADING_MAKS_PRIS]?.attributes?.max as string | undefined) ?? 3.00;

  const smartAvailable = smartState && smartState !== "unavailable";
  const smartOn        = smartState === "on";
  const priceCheap     = norgesprisPrice !== null && maksPrice !== null && norgesprisPrice <= maksPrice;

  const toggleSmart = () => {
    if (!connection) return;
    callService(connection, "input_boolean", smartOn ? "turn_off" : "turn_on", undefined, {
      entity_id: TIBBER_SMART_CHARGING,
    });
  };

  const adjustMaks = (delta: number) => {
    if (!connection || maksPrice === null) return;
    const next = Math.round(Math.min(maksMax, Math.max(maksMin, maksPrice + delta)) * 100) / 100;
    callService(connection, "input_number", "set_value", { value: next }, { entity_id: SMART_LADING_MAKS_PRIS });
  };

  // Card background: green if actively charging, warm if smart-on waiting
  const cardBg =
    isCharging           ? "bg-accent-green/8 ring-1 ring-accent-green/20"
    : smartOn && !priceCheap ? "bg-accent-warm/8 ring-1 ring-accent-warm/20"
    : "bg-bg-card";

  const barColor =
    batteryPct === null ? "bg-white/20"
    : batteryPct > 40   ? "bg-accent-green"
    : batteryPct > 20   ? "bg-accent-warm"
    : "bg-accent-red";

  return (
    <>
      <div className={`rounded-2xl p-4 space-y-3 ${cardBg}`}>
        {/* ── Tesla header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:car-electric" width={18} className={isCharging ? "text-accent-green" : "text-text-secondary"} />
            <span className="text-sm font-medium">Tesla Model Y</span>
          </div>
          <span className={`text-xs font-medium ${stateMeta.color}`}>{stateMeta.label}</span>
        </div>

        {/* ── Battery bar + stats ── */}
        {batteryPct !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold tabular-nums text-lg text-text-primary">{Math.round(batteryPct)}%</span>
              {rangeKm !== null && (
                <span className="text-text-secondary tabular-nums">{Math.round(rangeKm)} km</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${batteryPct}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Charging power ── */}
        {isCharging && chargePowerW > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-accent-green">
            <Icon icon="mdi:lightning-bolt" width={14} />
            <span className="tabular-nums font-medium">{(chargePowerW / 1000).toFixed(1)} kW</span>
          </div>
        )}

        {/* ── Smart charging section ── */}
        {smartAvailable && (
          <>
            <div className="h-px bg-white/8" />

            {/* Toggle row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon
                  icon="mdi:ev-station"
                  width={15}
                  className={smartOn ? (priceCheap ? "text-accent-green" : "text-accent-warm") : "text-text-dim"}
                />
                <span className="text-xs font-semibold">Smart lading</span>
                {smartOn && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    priceCheap ? "bg-accent-green/15 text-accent-green" : "bg-accent-warm/15 text-accent-warm"
                  }`}>
                    {priceCheap ? "Lader" : "Venter"}
                  </span>
                )}
              </div>
              <button
                onClick={toggleSmart}
                className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${
                  smartOn ? "bg-accent-green" : "bg-white/15"
                }`}
                aria-label={smartOn ? "Skru av smart lading" : "Skru på smart lading"}
              >
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  smartOn ? "translate-x-4" : "translate-x-0.5"
                }`} />
              </button>
            </div>

            {/* Price vs threshold */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {norgesprisPrice !== null && (
                <div className="rounded-xl bg-bg-elevated px-3 py-2">
                  <div className="text-text-dim mb-0.5">Norgespris nå</div>
                  <div className={`font-bold tabular-nums ${priceCheap ? "text-accent-green" : "text-accent-warm"}`}>
                    {norgesprisPrice.toFixed(2)} kr/kWh
                  </div>
                </div>
              )}
              {maksPrice !== null && (
                <div className="rounded-xl bg-bg-elevated px-3 py-2">
                  <div className="text-text-dim mb-0.5">Maks pris</div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold tabular-nums">{maksPrice.toFixed(2)} kr</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => adjustMaks(-0.05)}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform"
                      >
                        <Icon icon="mdi:minus" width={10} />
                      </button>
                      <button
                        onClick={() => adjustMaks(0.05)}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform"
                      >
                        <Icon icon="mdi:plus" width={10} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Status text */}
            <div className="text-xs text-text-dim">
              {smartOn
                ? priceCheap
                  ? "Prisen er under grensen — lader nå."
                  : "Prisen er over grensen — venter på billigere strøm."
                : "Slå på for automatisk lading ved billigste strømtimer."}
            </div>

            {/* Tesla charging switch status */}
            {chargingState && chargingState !== "unavailable" && (
              <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <Icon icon="mdi:lightning-bolt" width={13} />
                  Tesla lading
                </span>
                <span className={`font-semibold ${chargingState === "on" ? "text-accent-green" : "text-text-dim"}`}>
                  {chargingState === "on" ? "Aktiv" : "Av"}
                </span>
              </div>
            )}
          </>
        )}

        {/* ── Zaptec button ── */}
        <button
          onClick={() => setChargerOpen(true)}
          className="flex w-full items-center justify-between rounded-xl bg-bg-elevated px-3 py-2 text-xs hover:bg-white/10 active:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Icon
              icon="mdi:ev-station"
              width={14}
              className={isConnected ? "text-accent-green" : "text-text-dim"}
            />
            <span className={isConnected ? "text-text-secondary" : "text-text-dim"}>
              Zaptec — {isConnected ? "tilkoblet" : "frakoblet"}
            </span>
          </div>
          <Icon icon="mdi:chevron-right" width={12} className="text-text-dim" />
        </button>
      </div>

      <ZaptecPopup open={chargerOpen} onClose={() => setChargerOpen(false)} />
    </>
  );
}
