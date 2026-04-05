import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { ENERGY_CONFIG } from "../lib/entities";
import { parseNumericState } from "../lib/format";
import { LivePowerCard } from "../components/cards/LivePowerCard";
import { EffektleddPopup } from "../components/popups/EffektleddPopup";
import { NorgesporisPopup } from "../components/popups/NorgesporisPopup";
import { StromregningPopup } from "../components/popups/StromregningPopup";
import { EvBatteryPopup } from "../components/popups/EvBatteryPopup";
import { PriceCard } from "../components/cards/PriceCard";
import { DailyPowerChart } from "../components/cards/DailyPowerChart";
import { DevicePowerCard } from "../components/cards/DevicePowerCard";

function EvCard({ entities, onOpen }: { entities: HassEntities; onOpen: () => void }) {
  const cfg = ENERGY_CONFIG;
  const soc          = cfg.evSocSensor ? parseNumericState(entities[cfg.evSocSensor]?.state) : null;
  const plugStatus   = cfg.evPlugSensor ? entities[cfg.evPlugSensor]?.state : undefined;
  const plugged      = plugStatus != null && plugStatus !== "plugged_out" && plugStatus !== "off"
    && plugStatus !== "unavailable" && plugStatus !== "unknown";
  const power   = cfg.evPower ? parseNumericState(entities[cfg.evPower]?.state) : null;
  const mode    = cfg.evActive ? entities[cfg.evActive]?.state : undefined;

  if (soc === null && !plugged) return null;

  const isCharging = plugged && power !== null && power > 10;
  const fullyCharged = soc !== null && soc >= 80;

  const statusLabel = !plugged ? "Ikke tilkoblet"
    : fullyCharged ? "Fullladet"
    : isCharging ? `Lader · ${power !== null ? `${power.toFixed(1)} kW` : "—"}`
    : mode ?? "Tilkoblet";

  const accentColor = fullyCharged ? "text-accent-green"
    : isCharging ? "text-accent-cool"
    : plugged ? "text-text-secondary"
    : "text-text-dim";

  const bgClass = fullyCharged ? "bg-accent-green/10 ring-1 ring-accent-green/20"
    : isCharging ? "bg-accent-cool/10 ring-1 ring-accent-cool/20"
    : "bg-bg-card";

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left rounded-2xl p-4 transition-colors hover:brightness-110 ${bgClass}`}
    >
      <div className="flex items-center gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          fullyCharged ? "bg-accent-green/20" : isCharging ? "bg-accent-cool/20" : "bg-white/6"
        }`}>
          <Icon
            icon={isCharging ? "mdi:car-electric" : "mdi:car-electric-outline"}
            width={22}
            className={accentColor}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Tesla Model Y</div>
          <div className={`text-xs ${accentColor}`}>{statusLabel}</div>
        </div>
        <div className="text-right shrink-0">
          {soc !== null && (
            <div className={`text-xl font-bold tabular-nums ${accentColor}`}>{soc.toFixed(0)}%</div>
          )}
          <Icon icon="mdi:chevron-right" width={14} className="text-text-dim" />
        </div>
      </div>
      {soc !== null && (
        <div className="mt-3 space-y-1">
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                fullyCharged ? "bg-accent-green" : isCharging ? "bg-accent-cool" : "bg-white/30"
              }`}
              style={{ width: `${Math.min(100, soc)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-dim">
            <span>0%</span>
            <span className="text-accent-green/60">80% mål</span>
            <span>100%</span>
          </div>
        </div>
      )}
    </button>
  );
}

export function EnergyView() {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [effektleddOpen,   setEffektleddOpen]   = useState(false);
  const [savingsOpen,      setSavingsOpen]       = useState(false);
  const [stromregningOpen, setStromregningOpen]  = useState(false);
  const [evOpen,           setEvOpen]            = useState(false);
  const cfg = ENERGY_CONFIG;

  const isLimitCritical = entities[cfg.powerLimitCritical]?.state === "on";

  return (
    <>
    <div className="mx-auto max-w-2xl space-y-4 py-4">

      {/* Alerts */}
      {isLimitCritical && (
        <div className="flex items-center gap-2 rounded-xl bg-accent-red/15 px-4 py-2.5 text-sm text-accent-red">
          <Icon icon="mdi:alert" width={16} />
          Kritisk effektgrense overskredet — reduser forbruk
        </div>
      )}

      {/* Live power + savings — tap to open strømregning */}
      <LivePowerCard
        config={cfg}
        onEffektleddOpen={() => setEffektleddOpen(true)}
        onStromregningOpen={() => setStromregningOpen(true)}
        onNorgesprisOpen={() => setSavingsOpen(true)}
      />

      {/* EV — under effektkortet */}
      <EvCard entities={entities} onOpen={() => setEvOpen(true)} />

      {/* Daily power chart */}
      <DailyPowerChart config={cfg} />

      {/* Device breakdown */}
      <DevicePowerCard config={cfg} />

      {/* Price forecast */}
      <PriceCard config={cfg} />

      <div className="h-20" />
    </div>
    <EffektleddPopup   open={effektleddOpen}   onClose={() => setEffektleddOpen(false)}   cfg={cfg} />
    <NorgesporisPopup  open={savingsOpen}       onClose={() => setSavingsOpen(false)}       config={cfg} />
    <StromregningPopup open={stromregningOpen}  onClose={() => setStromregningOpen(false)} />
    <EvBatteryPopup    open={evOpen}            onClose={() => setEvOpen(false)}            config={cfg} />
    </>
  );
}
