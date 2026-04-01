import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState, formatPower } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";

const CATEGORY_ICONS: Record<string, string> = {
  "Varme":       "mdi:fire",
  "Elektronikk": "mdi:chip",
  "Lys & annet": "mdi:lightning-bolt",
  "Elbil":       "mdi:car-electric",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Varme":       "text-accent-warm",
  "Elektronikk": "text-accent-cool",
  "Lys & annet": "text-accent-green",
  "Elbil":       "text-accent",
};

const BAR_COLORS: Record<string, string> = {
  "Varme":       "bg-accent-warm",
  "Elektronikk": "bg-accent-cool",
  "Lys & annet": "bg-accent-green",
  "Elbil":       "bg-accent",
};

type Tab = "effekt" | "forbruk";

export function DevicePowerCard({ config }: { config: EnergyConfig }) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [tab, setTab] = useState<Tab>("effekt");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleCat = (cat: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const devices = config.devices.map((d) => ({
    ...d,
    powerW:    parseNumericState(entities[d.powerEntity]?.state),
    energyKwh: d.energyEntity ? parseNumericState(entities[d.energyEntity]?.state) : null,
    category:  d.category ?? "Annet",
    icon:      d.icon ?? "mdi:power-plug",
  }));

  const categoryOrder = Array.from(
    new Set(config.devices.map((d) => d.category ?? "Annet")),
  );

  const globalMaxW   = Math.max(...devices.map((d) => d.powerW   ?? 0), 1);
  const globalMaxKwh = Math.max(...devices.map((d) => d.energyKwh ?? 0), 1);

  return (
    <div className="rounded-2xl bg-bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/6">
        <span className="text-sm font-medium">Strømforbruk</span>
        <div className="flex rounded-xl bg-bg-elevated overflow-hidden text-xs">
          <button
            onClick={() => setTab("effekt")}
            className={`px-3 py-1 transition-colors ${tab === "effekt" ? "bg-accent text-white font-medium" : "text-text-dim hover:text-text-secondary"}`}
          >
            Effekt
          </button>
          <button
            onClick={() => setTab("forbruk")}
            className={`px-3 py-1 transition-colors ${tab === "forbruk" ? "bg-accent text-white font-medium" : "text-text-dim hover:text-text-secondary"}`}
          >
            Forbruk
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="divide-y divide-white/6">
        {categoryOrder.map((cat) => {
          const group = devices.filter((d) => d.category === cat);
          const isOpen = expanded.has(cat);

          const catW   = group.reduce((s, d) => s + (d.powerW ?? 0), 0);
          const catKwh = group.reduce((s, d) => s + (d.energyKwh ?? 0), 0);
          const hasKwh = group.some((d) => d.energyKwh !== null);

          const labelColor = CATEGORY_COLORS[cat] ?? "text-text-secondary";
          const barColor   = BAR_COLORS[cat]       ?? "bg-accent";

          const sortedGroup = [...group].sort((a, b) =>
            tab === "effekt"
              ? (b.powerW ?? 0) - (a.powerW ?? 0)
              : (b.energyKwh ?? -1) - (a.energyKwh ?? -1),
          );

          return (
            <div key={cat}>
              {/* Category row — always visible, tap to expand */}
              <button
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
              >
                <div className={`flex items-center gap-2 text-xs font-semibold ${labelColor}`}>
                  <Icon icon={CATEGORY_ICONS[cat] ?? "mdi:lightning-bolt"} width={14} />
                  {cat}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-text-secondary font-medium">
                    {tab === "effekt"
                      ? formatPower(catW)
                      : hasKwh ? `${catKwh.toFixed(2)} kWh` : "—"}
                  </span>
                  <Icon
                    icon="mdi:chevron-down"
                    width={14}
                    className={`text-text-dim transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {/* Expandable device list */}
              {isOpen && (
                <div className="divide-y divide-white/[0.04] border-t border-white/[0.04]">
                  {sortedGroup.map((d) => {
                    if (tab === "effekt") {
                      const pct   = Math.min(100, ((d.powerW ?? 0) / globalMaxW) * 100);
                      const isOff = d.powerW !== null && d.powerW < 2;
                      return (
                        <div key={d.name} className={`flex items-center gap-3 pl-8 pr-4 py-2.5 bg-white/[0.01] ${d.powerW === null ? "opacity-40" : ""}`}>
                          <Icon icon={d.icon} width={14} className={`shrink-0 ${isOff ? "text-text-dim/40" : "text-text-dim"}`} />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className={`text-xs ${isOff ? "text-text-dim" : "text-text-secondary"}`}>{d.name}</span>
                              <span className={`text-xs tabular-nums font-medium ${isOff ? "text-text-dim" : ""}`}>
                                {d.powerW !== null ? (isOff ? "av" : formatPower(d.powerW)) : "—"}
                              </span>
                            </div>
                            {!isOff && (
                              <div className="h-1 rounded-full bg-white/6 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    } else {
                      const pct = Math.min(100, ((d.energyKwh ?? 0) / globalMaxKwh) * 100);
                      return (
                        <div key={d.name} className={`flex items-center gap-3 pl-8 pr-4 py-2.5 bg-white/[0.01] ${d.energyKwh === null ? "opacity-40" : ""}`}>
                          <Icon icon={d.icon} width={14} className={`shrink-0 ${d.energyKwh === null ? "text-text-dim/40" : "text-text-dim"}`} />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className={`text-xs ${d.energyKwh === null ? "text-text-dim" : "text-text-secondary"}`}>{d.name}</span>
                              <span className={`text-xs tabular-nums font-medium ${d.energyKwh === null ? "text-text-dim" : ""}`}>
                                {d.energyKwh !== null ? `${d.energyKwh.toFixed(2)} kWh` : "—"}
                              </span>
                            </div>
                            {d.energyKwh !== null && (
                              <div className="h-1 rounded-full bg-white/6 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tab === "forbruk" && (
        <div className="px-4 py-2.5 border-t border-white/6">
          <p className="text-[10px] text-text-dim">Forbruk siden midnatt i dag</p>
        </div>
      )}
    </div>
  );
}
