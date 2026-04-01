import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { parseNumericState } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";

interface PriceEntry {
  start: string;
  end: string;
  value: number; // kr/kWh
}

function parsePriceArray(raw: unknown): PriceEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is PriceEntry =>
      typeof e === "object" && e !== null && "start" in e && "end" in e && "value" in e,
  );
}

/** Parse raw_today/raw_tomorrow (15-min intervals in øre) → hourly kr/kWh.
 *  HA sensor uses "YYYY-MM-DD HH:MM:SS+TZ" (space, not T) — replace for cross-browser compat. */
function parseRawHourly(raw: unknown): PriceEntry[] {
  const all = parsePriceArray(raw);
  const seen = new Set<number>();
  const hourly: PriceEntry[] = [];
  for (const entry of all) {
    // Normalize ISO date: "2026-03-31 00:00:00+02:00" → "2026-03-31T00:00:00+02:00"
    const iso = typeof entry.start === "string" ? entry.start.replace(" ", "T") : entry.start;
    const d = new Date(iso);
    if (isNaN(d.getTime())) continue;
    const hour = d.getHours();
    if (d.getMinutes() === 0 && !seen.has(hour)) {
      seen.add(hour);
      hourly.push({ ...entry, start: iso, value: entry.value / 100 }); // øre → kr
    }
  }
  return hourly.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

// ── Price view mode ────────────────────────────────────────────────────────────
// "norgespris" = energy-only price (spot − strømstøtte + el company, incl VAT, no grid)
//               sourced from sensor.norgespris_pris_na today/tomorrow arrays
// "totalpris"  = full price (norgespris + nettleie), nordpool raw_today/raw_tomorrow in øre

type PriceMode = "norgespris" | "totalpris";

// ── Tibber-style hour bar chart ────────────────────────────────────────────────

const CHART_H = 100;

function barColor(pct: number, isCurrent: boolean, isHov: boolean): string {
  if (isCurrent) return "var(--color-accent, #7c6ee0)";
  if (isHov)     return "rgba(255,255,255,0.45)";
  if (pct < 0.33) return "rgba(34,197,94,0.70)";
  if (pct < 0.66) return "rgba(251,146,60,0.55)";
  return "rgba(239,68,68,0.70)";
}

function HourBarChart({
  hours,
  currentHour,
}: {
  hours: PriceEntry[];
  currentHour: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (hours.length === 0) return null;

  const values = hours.map((h) => h.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range  = maxVal - minVal || 0.001;
  const avg    = values.reduce((a, b) => a + b, 0) / values.length;

  const toBarH   = (v: number) => Math.max(6, ((v - minVal) / range) * (CHART_H - 12)) + 6;
  const toBarTop = (v: number) => CHART_H - toBarH(v);
  const avgTop   = toBarTop(avg);

  const activeIdx = hovered ?? (
    currentHour >= 0
      ? hours.findIndex((h) => new Date(h.start).getHours() === currentHour)
      : -1
  );
  const activeEntry = activeIdx >= 0 && activeIdx < hours.length ? hours[activeIdx] : null;
  const currentIdx  = currentHour >= 0
    ? hours.findIndex((h) => new Date(h.start).getHours() === currentHour)
    : -1;

  return (
    <div className="space-y-1" onPointerLeave={() => setHovered(null)}>

      {/* Tooltip */}
      <div className="h-5 flex items-center justify-center">
        {activeEntry ? (
          <span className="text-xs tabular-nums text-text-secondary">
            kl.{" "}
            <span className="font-medium">
              {new Date(activeEntry.start).getHours().toString().padStart(2, "0")}:00
            </span>
            <span className="mx-1.5 text-text-dim">·</span>
            <span className="font-bold text-text-primary">{activeEntry.value.toFixed(2)}</span>
            <span className="text-text-dim ml-0.5">kr/kWh</span>
          </span>
        ) : (
          <span className="text-xs text-text-dim tabular-nums">
            snitt {avg.toFixed(2)} kr/kWh
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="relative" style={{ height: `${CHART_H}px` }}>

        {/* Average dashed line */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-10"
          style={{ top: `${avgTop}px` }}
        >
          <div className="border-t border-dashed border-white/[0.12]" />
        </div>

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {hours.map((entry, i) => {
            const hour      = new Date(entry.start).getHours();
            const isCurrent = currentHour >= 0 && hour === currentHour;
            const isHov     = hovered === i;
            const pct       = range > 0 ? (entry.value - minVal) / range : 0;
            const bh        = toBarH(entry.value);

            return (
              <div
                key={i}
                className="relative flex-1 flex flex-col justify-end"
                style={{ height: "100%" }}
                onPointerEnter={() => setHovered(i)}
              >
                {/* Price label above current bar */}
                {isCurrent && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 text-[8px] font-bold text-white tabular-nums whitespace-nowrap"
                    style={{ bottom: `${bh + 2}px` }}
                  >
                    {entry.value.toFixed(2)}
                  </div>
                )}
                <div
                  className="w-full rounded-sm transition-colors duration-75"
                  style={{ height: `${bh}px`, background: barColor(pct, isCurrent, isHov) }}
                >
                  {(isCurrent || isHov) && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] rounded-full bg-white/70" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis hour labels */}
      <div className="flex gap-[2px]">
        {hours.map((entry, i) => {
          const hour = new Date(entry.start).getHours();
          const isCurrent = currentHour >= 0 && hour === currentHour;
          return (
            <div
              key={i}
              className={`flex-1 text-center text-[8px] tabular-nums ${
                isCurrent ? "text-accent font-bold" : "text-white/25"
              }`}
            >
              {hour % 6 === 0 || isCurrent ? hour : ""}
            </div>
          );
        })}
      </div>

      {/* Current-hour indicator dot */}
      {currentIdx >= 0 && (
        <div className="flex gap-[2px]">
          {hours.map((_, i) => (
            <div key={i} className="flex-1 flex justify-center">
              {i === currentIdx && (
                <div className="h-1 w-1 rounded-full bg-accent" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type DayTab = "today" | "tomorrow";

export function PriceCard({ config }: { config: EnergyConfig }) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [dayTab, setDayTab] = useState<DayTab>("today");
  const [priceMode, setPriceMode] = useState<PriceMode>("norgespris");

  // Norgespris: hourly energy price arrays from sensor.norgespris_pris_na
  const norgesprisToday    = parsePriceArray(entities[config.tibberPrice]?.attributes?.today);
  const norgesprisTomorrow = parsePriceArray(entities[config.tibberPrice]?.attributes?.tomorrow);

  // Totalpris: full price from nordpool raw (øre → kr via parseRawHourly)
  const totalprisToday    = parseRawHourly(entities[config.spotPriceRawEntity]?.attributes?.raw_today);
  const totalprisTomorrow = parseRawHourly(entities[config.spotPriceRawEntity]?.attributes?.raw_tomorrow);

  const today    = priceMode === "totalpris" ? totalprisToday    : norgesprisToday;
  const tomorrow = priceMode === "totalpris" ? totalprisTomorrow : norgesprisTomorrow;

  const displayHours = dayTab === "today" ? today : tomorrow;

  const low  = displayHours.length ? Math.min(...displayHours.map((e) => e.value)) : null;
  const high = displayHours.length ? Math.max(...displayHours.map((e) => e.value)) : null;

  const nowHour = new Date().getHours();
  const priceNow = priceMode === "totalpris"
    ? parseNumericState(entities[config.totalPriceEntity]?.state)
    : parseNumericState(entities[config.tibberPrice]?.state);

  const priceLabel = priceMode === "totalpris"
    ? "Totalpris inkl. nettleie"
    : "Norgespris (uten nettleie)";

  return (
    <div className="rounded-2xl bg-bg-card p-4 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Strømpris</span>
        <div className="flex rounded-xl bg-bg-elevated overflow-hidden text-xs">
          <button
            onClick={() => setDayTab("today")}
            className={`px-3 py-1 transition-colors ${dayTab === "today" ? "bg-accent text-white font-medium" : "text-text-dim hover:text-text-secondary"}`}
          >
            I dag
          </button>
          <button
            onClick={() => setDayTab("tomorrow")}
            disabled={tomorrow.length === 0}
            className={`px-3 py-1 transition-colors ${dayTab === "tomorrow" ? "bg-accent text-white font-medium" : tomorrow.length === 0 ? "text-text-dim/40" : "text-text-dim hover:text-text-secondary"}`}
          >
            I morgen
          </button>
        </div>
      </div>

      {/* ── Current price (today only) ── */}
      {dayTab === "today" && (
        <div>
          <div className="text-3xl font-bold tabular-nums leading-none">
            {priceNow !== null ? priceNow.toFixed(2) : "—"}
          </div>
          <div className="mt-1 text-xs text-text-dim">kr/kWh nå · {priceLabel}</div>
        </div>
      )}

      {/* ── Tomorrow heading ── */}
      {dayTab === "tomorrow" && tomorrow.length > 0 && (
        <div>
          <div className="text-sm text-text-dim">Morgendagens priser</div>
          {low !== null && high !== null && (
            <div className="text-lg font-semibold tabular-nums mt-0.5">
              <span className="text-accent-green">{low.toFixed(2)}</span>
              <span className="text-text-dim mx-1.5 font-normal">–</span>
              <span className="text-accent-red">{high.toFixed(2)}</span>
              <span className="text-sm font-normal text-text-dim ml-1">kr/kWh</span>
            </div>
          )}
        </div>
      )}

      {/* ── Price mode toggle ── */}
      <div className="flex rounded-xl bg-bg-elevated overflow-hidden text-xs">
        {(["norgespris", "totalpris"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setPriceMode(mode)}
            className={`flex-1 px-3 py-1.5 transition-colors ${
              priceMode === mode
                ? "bg-accent-cool/20 text-accent-cool font-medium"
                : "text-text-dim hover:text-text-secondary"
            }`}
          >
            {mode === "norgespris" ? "Norgespris" : "Totalpris"}
          </button>
        ))}
      </div>

      {/* ── Chart ── */}
      {displayHours.length > 0 ? (
        <HourBarChart
          hours={displayHours}
          currentHour={dayTab === "today" ? nowHour : -1}
        />
      ) : (
        dayTab === "tomorrow" && (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <span className="text-sm text-text-dim">Morgendagens priser er ikke tilgjengelig ennå</span>
            <span className="text-xs text-text-dim/60">Vanligvis publisert ca. kl. 13:00</span>
          </div>
        )
      )}

      {/* ── Low / High row ── */}
      {low !== null && high !== null && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-bg-elevated px-3 py-2">
            <div className="text-[10px] text-text-dim mb-0.5">Lavest</div>
            <div className="text-sm font-semibold tabular-nums text-accent-green">{low.toFixed(2)}</div>
            <div className="text-[10px] text-text-dim">kr/kWh</div>
          </div>
          <div className="rounded-xl bg-bg-elevated px-3 py-2">
            <div className="text-[10px] text-text-dim mb-0.5">Høyest</div>
            <div className="text-sm font-semibold tabular-nums text-accent-red">{high.toFixed(2)}</div>
            <div className="text-[10px] text-text-dim">kr/kWh</div>
          </div>
        </div>
      )}

      {/* ── Daily consumption (today only) ── */}
      {dayTab === "today" && (
        <DailyConsumption config={config} entities={entities} />
      )}
    </div>
  );
}

// ── Daily consumption subcomponent ────────────────────────────────────────────

function DailyConsumption({ config, entities }: { config: EnergyConfig; entities: HassEntities }) {
  const entity       = entities[config.energyToday];
  const todayKwh     = parseNumericState(entity?.state);
  const yesterdayKwh = parseNumericState(entity?.attributes?.last_period as string | undefined);

  if (todayKwh === null && yesterdayKwh === null) return null;

  const maxVal   = Math.max(todayKwh ?? 0, yesterdayKwh ?? 0, 0.1);
  const todayPct = ((todayKwh ?? 0) / maxVal) * 100;
  const yestPct  = ((yesterdayKwh ?? 0) / maxVal) * 100;
  const delta    = todayKwh !== null && yesterdayKwh !== null ? todayKwh - yesterdayKwh : null;

  return (
    <div className="border-t border-white/5 pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-dim">Forbruk</span>
        {delta !== null && (
          <span className={`text-xs font-medium tabular-nums ${delta <= 0 ? "text-accent-green" : "text-accent-warm"}`}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)} kWh vs i går
          </span>
        )}
      </div>
      {[
        { label: "I dag", kwh: todayKwh,     pct: todayPct, bar: "bg-accent-cool" },
        { label: "I går", kwh: yesterdayKwh, pct: yestPct,  bar: "bg-white/20" },
      ].map(({ label, kwh, pct, bar }) => kwh !== null && (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-dim">{label}</span>
            <span className="tabular-nums">{kwh.toFixed(1)} kWh</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
