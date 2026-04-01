import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { parseNumericState } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";

export function DailyEnergyCard({ config }: { config: EnergyConfig }) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const entity = entities[config.energyToday];
  const todayKwh     = parseNumericState(entity?.state);
  const yesterdayKwh = parseNumericState(entity?.attributes?.last_period as string | undefined);

  if (todayKwh === null && yesterdayKwh === null) return null;

  const maxVal = Math.max(todayKwh ?? 0, yesterdayKwh ?? 0, 0.1);
  const todayPct = ((todayKwh ?? 0) / maxVal) * 100;
  const yesterdayPct = ((yesterdayKwh ?? 0) / maxVal) * 100;

  const delta = todayKwh !== null && yesterdayKwh !== null ? todayKwh - yesterdayKwh : null;

  return (
    <div className="rounded-2xl bg-bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Daglig forbruk</span>
        {delta !== null && (
          <span className={`text-xs font-medium tabular-nums ${delta <= 0 ? "text-accent-green" : "text-accent-warm"}`}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)} kWh vs i går
          </span>
        )}
      </div>

      {/* Bars */}
      <div className="space-y-2">
        {/* Today */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-dim">I dag</span>
            <span className="tabular-nums font-semibold">{todayKwh !== null ? `${todayKwh.toFixed(1)} kWh` : "—"}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-cool transition-all duration-500"
              style={{ width: `${todayPct}%` }}
            />
          </div>
        </div>

        {/* Yesterday */}
        {yesterdayKwh !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-dim">I går</span>
              <span className="tabular-nums text-text-secondary">{yesterdayKwh.toFixed(1)} kWh</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/20 transition-all duration-500"
                style={{ width: `${yesterdayPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
