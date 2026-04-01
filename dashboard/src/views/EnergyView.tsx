import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { ENERGY_CONFIG } from "../lib/entities";
import { LivePowerCard } from "../components/cards/LivePowerCard";
import { EffektleddPopup } from "../components/popups/EffektleddPopup";
import { NorgesporisPopup } from "../components/popups/NorgesporisPopup";
import { StromregningPopup } from "../components/popups/StromregningPopup";
import { PriceCard } from "../components/cards/PriceCard";
import { DailyPowerChart } from "../components/cards/DailyPowerChart";
import { DevicePowerCard } from "../components/cards/DevicePowerCard";

export function EnergyView() {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [effektleddOpen,   setEffektleddOpen]   = useState(false);
  const [savingsOpen,      setSavingsOpen]       = useState(false);
  const [stromregningOpen, setStromregningOpen]  = useState(false);
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
    </>
  );
}
