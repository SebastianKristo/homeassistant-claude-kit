import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import {
  STROMREGNING_DAILY,
  STROMREGNING_MONTHLY,
  STROMREGNING_YEARLY,
  STROMREGNING_TOTAL_MONTH,
  STROMREGNING_TOTAL_YEAR,
  CIRCUIT_DAILY_COSTS,
  ENERGY_CONFIG,
} from "../../lib/entities";

export function StromregningCard() {
  const entities = useHass((s) => s.entities) as HassEntities;

  const daily      = parseNumericState(entities[STROMREGNING_DAILY]?.state);
  const monthly    = parseNumericState(entities[STROMREGNING_MONTHLY]?.state);
  const yearly     = parseNumericState(entities[STROMREGNING_YEARLY]?.state);
  const totalMonth = parseNumericState(entities[STROMREGNING_TOTAL_MONTH]?.state);
  const totalYear  = parseNumericState(entities[STROMREGNING_TOTAL_YEAR]?.state);

  // Circuit breakdown for today
  const circuitBreakdown = ENERGY_CONFIG.circuits
    .map((c) => {
      const dailyEntity = CIRCUIT_DAILY_COSTS[c.name];
      const cost = dailyEntity ? parseNumericState(entities[dailyEntity]?.state) : null;
      return { name: c.name, cost };
    })
    .filter((c) => c.cost !== null && c.cost > 0)
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));

  const maxCircuitCost = circuitBreakdown[0]?.cost ?? 1;

  return (
    <div className="rounded-2xl bg-bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon icon="mdi:lightning-bolt-circle" width={18} className="text-accent-warm" />
        <span className="text-sm font-semibold">Strømregning</span>
      </div>

      {/* Period totals */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-bg-elevated px-2 py-3">
          <div className="text-xs text-text-dim mb-1">I dag</div>
          <div className="text-lg font-bold tabular-nums text-text-primary">
            {daily !== null ? `${daily.toFixed(0)}` : "—"}
          </div>
          <div className="text-[10px] text-text-dim">kr</div>
        </div>
        <div className="rounded-xl bg-bg-elevated px-2 py-3">
          <div className="text-xs text-text-dim mb-1">Denne mnd</div>
          <div className="text-lg font-bold tabular-nums text-text-primary">
            {(monthly ?? totalMonth) !== null
              ? `${(monthly ?? totalMonth)!.toFixed(0)}`
              : "—"}
          </div>
          <div className="text-[10px] text-text-dim">kr</div>
        </div>
        <div className="rounded-xl bg-bg-elevated px-2 py-3">
          <div className="text-xs text-text-dim mb-1">I år</div>
          <div className="text-lg font-bold tabular-nums text-text-primary">
            {(yearly ?? totalYear) !== null
              ? `${((yearly ?? totalYear)! / 1000).toFixed(1)}k`
              : "—"}
          </div>
          <div className="text-[10px] text-text-dim">kr</div>
        </div>
      </div>

      {/* Circuit breakdown — today */}
      {circuitBreakdown.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-text-dim">Fordeling i dag</div>
          {circuitBreakdown.map(({ name, cost }) => (
            <div key={name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{name}</span>
                <span className="font-semibold tabular-nums">{cost!.toFixed(2)} kr</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-warm/60 transition-all duration-500"
                  style={{ width: `${Math.min(100, (cost! / maxCircuitCost) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
