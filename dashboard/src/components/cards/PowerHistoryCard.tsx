import { useMemo } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { Sparkline } from "../charts/Sparkline";
import { useMultiHistory } from "../../hooks/useHistory";
import { parseNumericState } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";

type Range = "24h" | "7d" | "30d";

const RANGE_OPTIONS: { label: string; value: Range; hours: number }[] = [
  { label: "24t",  value: "24h", hours: 24 },
  { label: "7d",   value: "7d",  hours: 168 },
  { label: "30d",  value: "30d", hours: 720 },
];

interface Props {
  config: EnergyConfig;
  range: Range;
  onRangeChange: (r: Range) => void;
}

export function PowerHistoryCard({ config, range, onRangeChange }: Props) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const option  = RANGE_OPTIONS.find((o) => o.value === range) ?? RANGE_OPTIONS[0];
  const startTime = useMemo(() => {
    const d = new Date(Date.now() - option.hours * 3600 * 1000);
    return d.toISOString();
  }, [option.hours]);

  const idsToFetch = [config.totalPower, config.evPower];
  const historyMap = useMultiHistory(idsToFetch, startTime);

  const totalHistory = historyMap[config.totalPower] ?? [];
  const evHistory    = historyMap[config.evPower] ?? [];

  const currentTotal = parseNumericState(entities[config.totalPower]?.state) ?? 0;
  const currentEv    = parseNumericState(entities[config.evPower]?.state) ?? 0;

  return (
    <div className="rounded-2xl bg-bg-card p-4 space-y-3">
      {/* Header + range picker */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Effekt historikk</span>
        <div className="flex rounded-xl bg-bg-elevated overflow-hidden">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => onRangeChange(o.value)}
              className={`px-3 py-1 text-xs transition-colors ${
                range === o.value
                  ? "bg-accent text-white font-medium"
                  : "text-text-dim hover:text-text-secondary"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main chart — total power */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-dim">Totalt forbruk</span>
          <span className="text-xs tabular-nums font-medium">{currentTotal} W</span>
        </div>
        {totalHistory.length >= 2 ? (
          <Sparkline data={totalHistory} height={48} color="var(--color-accent)" />
        ) : (
          <div className="h-12 rounded bg-white/4 flex items-center justify-center text-xs text-text-dim">
            Laster historikk…
          </div>
        )}
      </div>

      {/* EV chart */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Icon icon="mdi:ev-station" width={12} className="text-text-dim" />
            <span className="text-xs text-text-dim">Elbil lading (estimert)</span>
          </div>
          <span className="text-xs tabular-nums font-medium">{currentEv} W</span>
        </div>
        {evHistory.length >= 2 ? (
          <Sparkline data={evHistory} height={28} color="var(--color-accent-green)" />
        ) : (
          <div className="h-7 rounded bg-white/4 flex items-center justify-center text-xs text-text-dim">
            Laster…
          </div>
        )}
      </div>
    </div>
  );
}
