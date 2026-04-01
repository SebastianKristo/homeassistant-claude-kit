import { useState, useMemo } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import uPlot from "uplot";
import { parseNumericState } from "../../lib/format";
import { useMultiHistory } from "../../hooks/useHistory";
import type { EnergyConfig } from "../../lib/entities";
import { UPlotChart } from "../charts/UPlotChart";
import {
  type ResolvedTheme,
  axisDefaults,
  tooltipPlugin,
  verticalGradient,
} from "../../lib/chart-plugins";

// ── Circuit icons ─────────────────────────────────────────────────────────────

const CIRCUIT_ICONS: Record<string, string> = {
  "Stue":          "mdi:sofa",
  "Kjøkken":       "mdi:knife",
  "Soverom/Bad":   "mdi:bed",
  "Vaskegang/Do":  "mdi:washing-machine",
  "Oppvaskmaskin": "mdi:dishwasher",
  "Oppvarming":    "mdi:radiator",
  "Data":          "mdi:server-network",
  "Hvitvarer":     "mdi:washing-machine",
  "Lys":           "mdi:lightbulb",
  "Gang/Bod":      "mdi:door",
};

// ── Day range helpers ─────────────────────────────────────────────────────────

function dayRange(offset: number): { startMs: number; endMs: number } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const startMs = now.getTime() + offset * 86_400_000;
  const endMs = offset < 0 ? startMs + 86_400_000 : Date.now();
  return { startMs, endMs };
}

function formatDayLabel(offset: number): string {
  if (offset === 0) return "I dag";
  if (offset === -1) return "I går";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });
}

// ── uPlot chart builder ───────────────────────────────────────────────────────

function buildChartOpts(
  dayStartSec: number,
  dayEndSec: number,
  hasEv: boolean,
  theme: ResolvedTheme,
  w: number,
  h: number,
): uPlot.Options {
  const axis = axisDefaults(theme);

  // X-axis ticks: every 4 hours
  const hourTicks: number[] = [];
  for (let t = dayStartSec; t <= dayEndSec + 1; t += 4 * 3600) {
    hourTicks.push(Math.round(t));
  }

  const series: uPlot.Series[] = [
    {},
    {
      label: "Totalt",
      stroke: theme.accentWarm,
      width: 1.5,
      fill: (u: uPlot) => verticalGradient(u, theme.accentWarm, 0.28, 0.02),
      points: { show: false },
    },
  ];

  if (hasEv) {
    series.push({
      label: "Elbil",
      stroke: theme.accentGreen,
      width: 1.5,
      fill: (u: uPlot) => verticalGradient(u, theme.accentGreen, 0.22, 0.01),
      points: { show: false },
    });
  }

  return {
    width: w,
    height: h,
    padding: [4, 4, 0, 0],
    legend: { show: false },
    cursor: { y: false, points: { size: 5 } },
    scales: {
      x: { min: dayStartSec, max: dayEndSec },
      y: {
        range: (_u, _min, max) => [0, Math.max(max * 1.15, 0.5)] as [number, number],
      },
    },
    axes: [
      {
        ...axis,
        splits: () => hourTicks,
        values: (_u: uPlot, vals: number[]) =>
          vals.map((t) =>
            new Date(t * 1000).toLocaleTimeString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          ),
        size: 18,
        font: `9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
      },
      {
        ...axis,
        values: (_u: uPlot, vals: number[]) => vals.map((v) => `${v.toFixed(1)}`),
        size: 30,
        font: `9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
        label: "kW",
        labelSize: 10,
        labelFont: `9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
      },
    ],
    series,
    plugins: [
      tooltipPlugin(
        (idx, data, t) => {
          const total = data[1][idx] as number | null;
          const ev = hasEv ? (data[2]?.[idx] as number | null) : null;
          const rows = [];
          if (total != null)
            rows.push({ color: t.accentWarm, label: "", value: `${total.toFixed(2)} kW` });
          if (ev != null && ev > 0.01)
            rows.push({ color: t.accentGreen, label: "Elbil", value: `${ev.toFixed(2)} kW` });
          return rows;
        },
        theme,
      ),
    ],
  };
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  config: EnergyConfig;
}

export function DailyPowerChart({ config }: Props) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [dayOffset, setDayOffset] = useState(0);

  // Stable ISO strings — only recompute when dayOffset changes
  const { startIso, endIso, dayStartSec, dayEndSec } = useMemo(() => {
    const { startMs, endMs } = dayRange(dayOffset);
    return {
      startIso:   new Date(startMs).toISOString(),
      endIso:     dayOffset < 0 ? new Date(endMs).toISOString() : undefined,
      dayStartSec: startMs / 1000,
      dayEndSec:   endMs / 1000,
    };
  }, [dayOffset]);

  const powerEntity = config.chartPower || config.totalPower;
  const idsToFetch = useMemo(
    () => [powerEntity, config.evPower].filter(Boolean),
    [powerEntity, config.evPower],
  );
  const historyMap = useMultiHistory(idsToFetch, startIso, endIso);

  const totalHistory = historyMap[powerEntity] ?? [];
  const evHistory    = historyMap[config.evPower] ?? [];

  // Live values (for categories section - always current)
  const liveTotalW = parseNumericState(entities[config.totalPower]?.state);

  // Convert history → uPlot data (values in W → divide by 1000 for kW)
  const { uData, peakKw, peakTimeStr } = useMemo(() => {
    if (totalHistory.length < 2) {
      return { uData: null, peakKw: null, peakTimeStr: null };
    }

    const times = new Float64Array(totalHistory.length);
    const totals = new Array<number | null>(totalHistory.length);
    let peakVal = 0;
    let peakIdx = 0;

    for (let i = 0; i < totalHistory.length; i++) {
      times[i] = totalHistory[i].time / 1000;
      const kw = totalHistory[i].value / 1000;
      totals[i] = kw;
      if (kw > peakVal) { peakVal = kw; peakIdx = i; }
    }

    // EV series: align to same timestamps via forward-fill interpolation
    const evAligned = new Array<number | null>(totalHistory.length).fill(null);
    if (evHistory.length > 0) {
      let evPtr = 0;
      for (let i = 0; i < totalHistory.length; i++) {
        const t = totalHistory[i].time;
        while (evPtr + 1 < evHistory.length && evHistory[evPtr + 1].time <= t) evPtr++;
        evAligned[i] = evHistory[evPtr]?.value != null ? evHistory[evPtr].value / 1000 : 0;
      }
    }

    const hasEv = evHistory.length > 0 && evAligned.some((v) => v != null && v > 0.05);
    const data: uPlot.AlignedData = hasEv
      ? [times, totals, evAligned]
      : [times, totals];

    const peakTime = new Date(totalHistory[peakIdx].time);
    const peakStr = peakTime.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", hour12: false });

    return { uData: data, peakKw: peakVal, peakTimeStr: peakStr };
  }, [totalHistory, evHistory]);

  const hasEv = uData != null && uData.length > 2;

  const buildOpts = useMemo(
    () => (theme: ResolvedTheme, w: number, h: number) =>
      buildChartOpts(dayStartSec, dayEndSec, hasEv, theme, w, h),
    [dayStartSec, dayEndSec, hasEv],
  );

  // Category breakdown from circuits with live powerEntity
  const liveCircuits = config.circuits
    .filter((c) => c.powerEntity)
    .map((c) => ({
      name: c.name,
      icon: CIRCUIT_ICONS[c.name] ?? "mdi:flash",
      powerW: parseNumericState(entities[c.powerEntity]?.state) ?? 0,
    }))
    .filter((c) => c.powerW > 0 || liveTotalW == null);

  // EV as a virtual circuit
  const evPowerW = parseNumericState(entities[config.evPower]?.state) ?? 0;
  if (evPowerW > 10 && config.evPower) {
    liveCircuits.push({ name: "Elbil", icon: "mdi:ev-station", powerW: evPowerW });
  }

  // "Annet" = total minus known
  const knownW = liveCircuits.reduce((s, c) => s + c.powerW, 0);
  const annetW = liveTotalW != null ? Math.max(0, liveTotalW - knownW) : null;
  if (annetW != null && annetW > 50) {
    liveCircuits.push({ name: "Annet", icon: "mdi:dots-horizontal", powerW: annetW });
  }

  const maxCircuitW = Math.max(...liveCircuits.map((c) => c.powerW), 1);

  const CIRCUIT_COLORS = [
    "bg-accent-warm",
    "bg-accent-cool",
    "bg-accent-green",
    "bg-accent-violet",
    "bg-accent",
    "bg-accent-red",
    "bg-text-dim",
    "bg-accent-blue",
  ];

  return (
    <div className="rounded-2xl bg-bg-card overflow-hidden">
      {/* Header: day nav + peak */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDayOffset((o) => o - 1)}
            disabled={dayOffset <= -14}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-text-secondary hover:bg-white/14 disabled:opacity-30"
          >
            <Icon icon="mdi:chevron-left" width={16} />
          </button>
          <span className="text-sm font-medium w-28 text-center">{formatDayLabel(dayOffset)}</span>
          <button
            onClick={() => setDayOffset((o) => Math.min(0, o + 1))}
            disabled={dayOffset >= 0}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-text-secondary hover:bg-white/14 disabled:opacity-30"
          >
            <Icon icon="mdi:chevron-right" width={16} />
          </button>
        </div>
        {peakKw != null && (
          <div className="text-right">
            <div className="text-[10px] text-text-dim">Topp</div>
            <div className="text-xs font-semibold tabular-nums text-accent-warm">
              {peakKw.toFixed(2)} kW {peakTimeStr && <span className="font-normal text-text-dim">kl. {peakTimeStr}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="px-1 pb-1">
        {uData && uData[0].length >= 2 ? (
          <UPlotChart buildOpts={buildOpts} data={uData} height={140} />
        ) : (
          <div className="h-36 flex items-center justify-center text-xs text-text-dim">
            {totalHistory.length === 0 ? "Laster historikk…" : "Ikke nok data"}
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {liveCircuits.length > 0 && (
        <div className="border-t border-white/6 px-4 py-3 space-y-2">
          <div className="text-xs text-text-dim mb-1">Kategorier — nåværende forbruk</div>
          {liveCircuits
            .sort((a, b) => b.powerW - a.powerW)
            .map((c, i) => (
              <div key={c.name} className="flex items-center gap-2.5">
                <Icon icon={c.icon} width={13} className="shrink-0 text-text-dim" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary truncate">{c.name}</span>
                    <span className="text-xs tabular-nums font-medium">
                      {c.powerW >= 1000
                        ? `${(c.powerW / 1000).toFixed(2)} kW`
                        : `${c.powerW.toFixed(0)} W`}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-white/6 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${CIRCUIT_COLORS[i % CIRCUIT_COLORS.length]}`}
                      style={{ width: `${Math.min(100, (c.powerW / maxCircuitW) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
