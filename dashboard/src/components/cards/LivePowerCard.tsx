import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState, formatPower, toWatts } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";

const LEVEL_META: Record<string, { label: string; color: string }> = {
  very_cheap:     { label: "Veldig billig", color: "text-accent-green" },
  cheap:          { label: "Billig",        color: "text-accent-green" },
  normal:         { label: "Normal",        color: "text-text-secondary" },
  expensive:      { label: "Dyrt",          color: "text-accent-warm" },
  very_expensive: { label: "Veldig dyrt",   color: "text-accent-red" },
};
const TREND_ICON: Record<string, string> = {
  rising:  "mdi:trending-up",
  falling: "mdi:trending-down",
  stable:  "mdi:trending-neutral",
};

function derivePriceLevel(current: number, todayArray: unknown): string {
  if (!Array.isArray(todayArray) || todayArray.length === 0) return "";
  const values: number[] = todayArray
    .map((e: unknown) => (typeof e === "object" && e !== null && "value" in e ? (e as { value: number }).value : NaN))
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return "";
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max === min) return "normal";
  const pct = (current - min) / (max - min);
  if (pct < 0.15) return "very_cheap";
  if (pct < 0.35) return "cheap";
  if (pct < 0.65) return "normal";
  if (pct < 0.85) return "expensive";
  return "very_expensive";
}

function deriveTrend(current: number, todayArray: unknown): string {
  if (!Array.isArray(todayArray)) return "stable";
  const nowHour = new Date().getHours();
  const next = todayArray.find((e: unknown) => {
    if (typeof e !== "object" || e === null || !("start" in e)) return false;
    return new Date((e as { start: string }).start).getHours() === nowHour + 1;
  }) as { value: number } | undefined;
  if (!next) return "stable";
  const diff = next.value - current;
  if (diff > 0.02) return "rising";
  if (diff < -0.02) return "falling";
  return "stable";
}

export function LivePowerCard({
  config,
  onEffektleddOpen,
  onStromregningOpen,
  onNorgesprisOpen,
}: {
  config: EnergyConfig;
  onEffektleddOpen?: () => void;
  onStromregningOpen?: () => void;
  onNorgesprisOpen?: () => void;
}) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const totalW = toWatts(entities[config.totalPower]?.state, entities[config.totalPower]?.attributes?.unit_of_measurement as string) ?? 0;
  const p1Amp = parseNumericState(entities[config.phase1]?.state) ?? 0;

  const tibberPrice  = parseNumericState(entities[config.tibberPrice]?.state);
  const todayArray   = entities[config.tibberPrice]?.attributes?.today;
  const displayPrice = tibberPrice;

  const priceLevel = entities[config.tibberLevel]?.state
    || (tibberPrice !== null ? derivePriceLevel(tibberPrice, todayArray) : "");
  const priceTrend = entities[config.tibberTrend]?.state
    || (tibberPrice !== null ? deriveTrend(tibberPrice, todayArray) : "stable");

  const costRate     = parseNumericState(entities[config.costRate]?.state);
  const energyToday  = parseNumericState(entities[config.energyToday]?.state);
  const savingsDay   = parseNumericState(entities[config.norgesprisSavingsDay]?.state);
  const savingsMonth = parseNumericState(entities[config.norgesprisSavingsMonth]?.state);

  const isLimitExceeded = entities[config.powerLimitExceeded]?.state === "on";
  const isLimitCritical = entities[config.powerLimitCritical]?.state === "on";
  const effektleddThreshold = parseNumericState(entities[config.nextEffektleddThreshold]?.state);

  const levelMeta = LEVEL_META[priceLevel] ?? { label: priceLevel, color: "text-text-secondary" };
  const trendIcon = TREND_ICON[priceTrend] ?? "mdi:trending-neutral";

  const hasSavings = savingsDay !== null || savingsMonth !== null;

  return (
    <button
      onClick={onStromregningOpen}
      disabled={!onStromregningOpen}
      className="w-full text-left rounded-2xl bg-bg-card p-4 space-y-4 disabled:cursor-default hover:bg-bg-elevated transition-colors"
    >
      {/* Power + cost header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold tabular-nums ${isLimitCritical ? "text-accent-red" : isLimitExceeded ? "text-accent-warm" : "text-text-primary"}`}>
              {formatPower(totalW)}
            </span>
            {(isLimitCritical || isLimitExceeded) && (
              <Icon icon="mdi:alert" width={18} className={isLimitCritical ? "text-accent-red" : "text-accent-warm"} />
            )}
          </div>
          {energyToday !== null && (
            <div className="text-sm text-text-dim mt-0.5">{energyToday.toFixed(2)} kWh i dag</div>
          )}
        </div>
        <div className="text-right space-y-0.5">
          <div className={`text-lg font-semibold tabular-nums ${levelMeta.color}`}>
            {displayPrice !== null ? `${displayPrice.toFixed(2)} kr/kWh` : "—"}
          </div>
          <div className="flex items-center justify-end gap-1 text-xs text-text-dim">
            <Icon icon={trendIcon} width={13} />
            <span className={levelMeta.color}>{levelMeta.label}</span>
          </div>
          {costRate !== null && (
            <div className="text-xs text-text-dim">{costRate.toFixed(2)} NOK/t</div>
          )}
        </div>
      </div>

      {/* Phase bar — L1 current (Amps) */}
      {p1Amp > 0 && config.phase1 && (
        <div className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-xs text-text-dim">L1</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-cool transition-all duration-500"
              style={{ width: `${Math.min(100, (p1Amp / 63) * 100)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-text-secondary">
            {p1Amp.toFixed(1)} A
          </span>
        </div>
      )}

      {/* Effektledd row */}
      {effektleddThreshold !== null && (
        <div
          onClick={(e) => { e.stopPropagation(); onEffektleddOpen?.(); }}
          className="flex w-full items-center justify-between rounded-xl bg-bg-elevated px-3 py-2 text-xs cursor-pointer hover:bg-white/10 transition-colors"
        >
          <span className="text-text-dim">Neste effektledd ved</span>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-accent-warm">{effektleddThreshold} kW</span>
            <Icon icon="mdi:chevron-right" width={12} className="text-text-dim" />
          </div>
        </div>
      )}

      {/* Norgespris savings — tap to open details */}
      {hasSavings && (
        <div
          onClick={(e) => { e.stopPropagation(); onNorgesprisOpen?.(); }}
          className={`flex items-center gap-3 rounded-xl bg-bg-elevated px-3 py-2 transition-colors ${onNorgesprisOpen ? "cursor-pointer hover:bg-white/10 active:bg-white/14" : ""}`}
        >
          <Icon icon="mdi:piggy-bank-outline" width={16} className="text-accent-green shrink-0" />
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {savingsDay !== null && (
              <div>
                <div className="text-[10px] text-text-dim">I dag</div>
                <div className={`text-xs font-semibold tabular-nums ${savingsDay >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                  {savingsDay >= 0 ? "+" : ""}{savingsDay.toFixed(2)} kr
                </div>
              </div>
            )}
            {savingsMonth !== null && (
              <div>
                <div className="text-[10px] text-text-dim">Denne måneden</div>
                <div className={`text-xs font-semibold tabular-nums ${savingsMonth >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                  {savingsMonth >= 0 ? "+" : ""}{savingsMonth.toFixed(2)} kr
                </div>
              </div>
            )}
            <div className="text-[10px] text-text-dim ml-auto">Norgespris vs spot</div>
          </div>
          {onNorgesprisOpen && (
            <Icon icon="mdi:chevron-right" width={12} className="text-text-dim shrink-0" />
          )}
        </div>
      )}
    </button>
  );
}
