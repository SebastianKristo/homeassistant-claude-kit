import { useState, useMemo, useId } from "react";
import { useHass } from "@hakit/core";
import { callService } from "home-assistant-js-websocket";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import type { EnergyConfig } from "../../lib/entities";
import { useHistory } from "../../hooks/useHistory";
import { BottomSheet } from "./BottomSheet";

const RANGES = [
  { label: "24t",  hours: 24 },
  { label: "7d",   hours: 24 * 7 },
  { label: "30d",  hours: 24 * 30 },
] as const;

function startOf(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

// ── Battery chart ─────────────────────────────────────────────────────────────
function BatteryChart({ data, hours }: { data: { time: number; value: number }[]; hours: number }) {
  const gradId = useId();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number; time: number } | null>(null);

  if (data.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-xs text-text-dim">
        Ingen data
      </div>
    );
  }

  const vw = 300, vh = 100, padY = 6;
  const innerH = vh - padY * 2;
  const tMin = data[0].time, tMax = data[data.length - 1].time;
  const tRange = tMax - tMin || 1;
  const toX = (t: number) => ((t - tMin) / tRange) * vw;
  const toY = (v: number) => padY + innerH - (v / 100) * innerH;
  const pathPoints = data.map((d) => `${toX(d.time)},${toY(d.value)}`);
  const linePath = `M${pathPoints.join("L")}`;
  const fillPath = `${linePath}L${vw},${vh}L0,${vh}Z`;

  const labelCount = hours <= 24 ? 5 : hours <= 168 ? 7 : 6;
  const xLabels: { x: number; label: string }[] = [];
  for (let i = 0; i <= labelCount; i++) {
    const t = tMin + (tRange * i) / labelCount;
    const d = new Date(t);
    const label = hours <= 24
      ? d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("no-NO", { month: "short", day: "numeric" });
    xLabels.push({ x: (i / labelCount) * 100, label });
  }

  const showTooltipAt = (clientX: number, rect: DOMRect, autoDismiss = false) => {
    const pct = (clientX - rect.left) / rect.width;
    const t = tMin + pct * tRange;
    let nearest = data[0];
    for (const p of data) if (Math.abs(p.time - t) < Math.abs(nearest.time - t)) nearest = p;
    const svgX = (toX(nearest.time) / vw) * 100;
    const svgY = (toY(nearest.value) / vh) * 100;
    setTooltip({ x: svgX, y: svgY, value: nearest.value, time: nearest.time });
    if (autoDismiss) setTimeout(() => setTooltip(null), 2000);
  };

  const color = tooltip && tooltip.value >= 80 ? "var(--color-accent-green)"
    : tooltip && tooltip.value < 20 ? "var(--color-accent-red)"
    : "var(--color-accent-cool)";

  return (
    <div className="relative" onMouseLeave={() => setTooltip(null)}>
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        className="w-full"
        style={{ height: 160 }}
        onPointerMove={(e) => showTooltipAt(e.clientX, e.currentTarget.getBoundingClientRect())}
        onClick={(e) => showTooltipAt(e.clientX, e.currentTarget.getBoundingClientRect(), true)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-cool)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-accent-cool)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((v) => (
          <line key={v} x1={0} y1={toY(v)} x2={vw} y2={toY(v)}
            stroke="white" strokeOpacity={v === 0 || v === 100 ? 0.08 : 0.04} strokeWidth={0.5} />
        ))}
        <line x1={0} y1={toY(80)} x2={vw} y2={toY(80)}
          stroke="var(--color-accent-green)" strokeOpacity={0.3} strokeWidth={0.5} strokeDasharray="3 3" />
        <path d={fillPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke="var(--color-accent-cool)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {tooltip && (
          <circle
            cx={toX(data.find((p) => p.value === tooltip.value && p.time === tooltip.time)?.time ?? 0)}
            cy={toY(tooltip.value)} r={3} fill={color} stroke="white" strokeWidth={1}
          />
        )}
      </svg>
      {tooltip && (
        <div
          className="pointer-events-none absolute -top-8 z-10 rounded-lg bg-bg-elevated px-2 py-1 text-xs shadow-sm"
          style={{ left: `clamp(0%, calc(${tooltip.x}% - 32px), calc(100% - 80px))` }}
        >
          <span className="font-semibold tabular-nums">{tooltip.value.toFixed(0)}%</span>
          <span className="text-text-dim ml-1.5">
            {new Date(tooltip.time).toLocaleString("no-NO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
      <div className="flex justify-between mt-1">
        {xLabels.map(({ x, label }) => (
          <span key={x} className="text-[9px] text-text-dim tabular-nums" style={{ width: `${100 / labelCount}%`, textAlign: "center" }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Battery history popup ─────────────────────────────────────────────────────
function BatteryHistoryPopup({
  open, onClose, socEntityId, soc, fullyCharged, plugged,
}: {
  open: boolean;
  onClose: () => void;
  socEntityId: string;
  soc: number | null;
  fullyCharged: boolean;
  plugged: boolean;
}) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const range = RANGES[rangeIdx];
  const startTime = useMemo(() => startOf(range.hours), [range.hours, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const socHistory = useHistory(open && socEntityId ? socEntityId : "", startTime);

  const stats = useMemo(() => {
    if (socHistory.length === 0) return null;
    const vals = socHistory.map((p) => p.value);
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    };
  }, [socHistory]);

  return (
    <BottomSheet open={open} onClose={onClose} nested>
      <Dialog.Title className="sr-only">Batteri historikk</Dialog.Title>
      <Dialog.Description className="sr-only">Batteri-nivå graf og statistikk</Dialog.Description>

      <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
        {/* SOC display */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-secondary">Batterinivå</span>
          {soc !== null && (
            <span className={`text-3xl font-bold tabular-nums ${fullyCharged ? "text-accent-green" : plugged ? "text-accent-cool" : "text-text-primary"}`}>
              {soc.toFixed(0)}%
            </span>
          )}
        </div>

        {/* Battery bar */}
        {soc !== null && (
          <div className="space-y-1.5">
            <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${fullyCharged ? "bg-accent-green" : plugged ? "bg-accent-cool" : "bg-text-dim"}`}
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

        {/* Range selector */}
        <div className="flex gap-1.5 rounded-xl bg-bg-elevated p-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                rangeIdx === i
                  ? "bg-bg-card text-text-primary shadow-sm"
                  : "text-text-dim hover:text-text-secondary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="rounded-xl bg-bg-elevated p-3">
          <BatteryChart data={socHistory} hours={range.hours} />
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Min", value: stats.min, icon: "mdi:arrow-down" },
              { label: "Snitt", value: stats.avg, icon: "mdi:approximately-equal" },
              { label: "Maks", value: stats.max, icon: "mdi:arrow-up" },
            ].map(({ label, value, icon }) => (
              <div key={label} className="rounded-xl bg-bg-elevated px-3 py-2.5 text-center">
                <Icon icon={icon} width={12} className="text-text-dim mx-auto mb-0.5" />
                <div className="text-sm font-semibold tabular-nums">{value.toFixed(0)}%</div>
                <div className="text-[10px] text-text-dim">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ── EV Sparing popup ──────────────────────────────────────────────────────────
function SparingPopup({ open, onClose, sparingAttrs }: {
  open: boolean;
  onClose: () => void;
  sparingAttrs: Record<string, unknown>;
}) {
  const n = (k: string) => sparingAttrs[k] as number | undefined;

  const totalSparing   = n("total_sparing");
  const sparingProsent = n("sparing_prosent");
  const aarligSparing  = n("aarlig_sparing");
  const elPer100km     = n("el_kostnad_per_100km");
  const dieselPer100km = n("diesel_kostnad_per_100km");
  const totalKm        = n("total_km_kjort");
  const totalKwh       = n("total_kwh_forbrukt");
  const elKostnad      = n("total_el_kostnad");
  const dieselKostnad  = n("total_diesel_kostnad");
  const kwh100km       = n("reelt_kwh_per_100km");
  const sisteLading    = n("siste_lading_kostnad");
  const sisteKm        = n("siste_lading_km_rekkevidde");
  const sisteSparing   = n("siste_lading_sparing");
  const aarligEl       = n("aarlig_el_kostnad");
  const aarligDiesel   = n("aarlig_diesel_kostnad");

  return (
    <BottomSheet open={open} onClose={onClose} nested>
      <Dialog.Title className="sr-only">EV Sparing</Dialog.Title>
      <Dialog.Description className="sr-only">Oversikt over besparelser med elbil</Dialog.Description>

      <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
        {/* Hero */}
        <div className="rounded-2xl bg-accent-green/10 ring-1 ring-accent-green/20 p-4 text-center space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-accent-green/70">Total sparing vs diesel</div>
          <div className="text-4xl font-bold tabular-nums text-accent-green">
            {totalSparing !== undefined ? `${Math.round(totalSparing).toLocaleString("no-NO")} kr` : "—"}
          </div>
          {sparingProsent !== undefined && (
            <div className="text-sm text-accent-green/80">{sparingProsent}% billigere enn diesel</div>
          )}
        </div>

        {/* Per år estimat */}
        {(aarligEl !== undefined || aarligDiesel !== undefined || aarligSparing !== undefined) && (
          <div className="rounded-2xl bg-bg-card p-4 space-y-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim mb-1">Estimert per år</div>
            {aarligEl !== undefined && (
              <SRow icon="mdi:lightning-bolt" label="El-kostnad" value={`${Math.round(aarligEl).toLocaleString("no-NO")} kr`} color="text-accent-cool" />
            )}
            {aarligDiesel !== undefined && (
              <SRow icon="mdi:gas-station" label="Diesel-kostnad" value={`${Math.round(aarligDiesel).toLocaleString("no-NO")} kr`} color="text-accent-warm" />
            )}
            {aarligSparing !== undefined && (
              <SRow icon="mdi:piggy-bank" label="Sparing" value={`${Math.round(aarligSparing).toLocaleString("no-NO")} kr`} color="text-accent-green" />
            )}
          </div>
        )}

        {/* Per 100 km */}
        {(elPer100km !== undefined || dieselPer100km !== undefined) && (
          <div className="rounded-2xl bg-bg-card p-4 space-y-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim mb-1">Kostnad per 100 km</div>
            {elPer100km !== undefined && (
              <SRow icon="mdi:lightning-bolt" label="El" value={`${elPer100km.toFixed(2)} kr`} color="text-accent-cool" />
            )}
            {dieselPer100km !== undefined && (
              <SRow icon="mdi:gas-station" label="Diesel" value={`${dieselPer100km.toFixed(0)} kr`} color="text-accent-warm" />
            )}
            {kwh100km !== undefined && (
              <SRow icon="mdi:battery-charging" label="Forbruk" value={`${kwh100km.toFixed(2)} kWh/100km`} />
            )}
          </div>
        )}

        {/* Totalt kjørt */}
        {(totalKm !== undefined || totalKwh !== undefined || elKostnad !== undefined || dieselKostnad !== undefined) && (
          <div className="rounded-2xl bg-bg-card p-4 space-y-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim mb-1">Totalt</div>
            {totalKm !== undefined && (
              <SRow icon="mdi:road-variant" label="Km kjørt" value={`${Math.round(totalKm).toLocaleString("no-NO")} km`} />
            )}
            {totalKwh !== undefined && (
              <SRow icon="mdi:lightning-bolt" label="Energi brukt" value={`${totalKwh.toFixed(1)} kWh`} color="text-accent-cool" />
            )}
            {elKostnad !== undefined && (
              <SRow icon="mdi:currency-usd" label="El-kostnad totalt" value={`${elKostnad.toFixed(0)} kr`} />
            )}
            {dieselKostnad !== undefined && (
              <SRow icon="mdi:gas-station" label="Diesel ville kostet" value={`${Math.round(dieselKostnad).toLocaleString("no-NO")} kr`} color="text-accent-warm" />
            )}
          </div>
        )}

        {/* Siste lading */}
        {(sisteLading !== undefined || sisteKm !== undefined || sisteSparing !== undefined) && (
          <div className="rounded-2xl bg-bg-card p-4 space-y-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim mb-1">Siste lading</div>
            {sisteLading !== undefined && (
              <SRow icon="mdi:currency-usd" label="Kostnad" value={`${sisteLading.toFixed(2)} kr`} />
            )}
            {sisteKm !== undefined && (
              <SRow icon="mdi:map-marker-distance" label="Rekkevidde lagt til" value={`${Math.round(sisteKm)} km`} color="text-accent-cool" />
            )}
            {sisteSparing !== undefined && (
              <SRow icon="mdi:piggy-bank-outline" label="Sparing vs diesel" value={`${Math.round(sisteSparing).toLocaleString("no-NO")} kr`} color="text-accent-green" />
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function SRow({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon icon={icon} width={14} className={color ?? "text-text-dim"} />
      <span className="text-text-secondary flex-1">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

// ── Stat row helper ───────────────────────────────────────────────────────────
function StatRow({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon icon={icon} width={14} className={color ?? "text-text-dim"} />
      <span className="text-text-secondary flex-1">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

// ── Lading detail popup ───────────────────────────────────────────────────────
function LadingDetailPopup({ open, onClose, ladePrTime, ladePerOkt, laderSession, laderTotal, teslaLadetid, teslaLadePris, teslaLadeDum }: {
  open: boolean;
  onClose: () => void;
  ladePrTime: number | null;
  ladePerOkt: number | null;
  laderSession: number | null;
  laderTotal: number | null;
  teslaLadetid: string | undefined;
  teslaLadePris: number | null;
  teslaLadeDum: number | null;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} nested>
      <Dialog.Title className="sr-only">Ladedetaljer</Dialog.Title>
      <Dialog.Description className="sr-only">Kostnader og statistikk for lading</Dialog.Description>
      <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">

        <div className="flex items-center gap-2 pb-1">
          <Icon icon="mdi:receipt-text" width={18} className="text-accent-warm" />
          <span className="text-sm font-semibold">Ladedetaljer</span>
        </div>

        {/* Kostnad */}
        <div className="rounded-2xl bg-bg-card p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-dim mb-1">
            <Icon icon="mdi:currency-usd" width={12} />
            Kostnad
          </div>
          {ladePrTime !== null && (
            <StatRow icon="mdi:timer-outline" label="Per time" value={`${ladePrTime.toFixed(2)} kr/h`} color="text-accent-warm" />
          )}
          {ladePerOkt !== null && (
            <StatRow icon="mdi:calendar-month" label="Denne perioden" value={`${ladePerOkt.toFixed(2)} kr`} />
          )}
        </div>

        {/* Smart lading */}
        {(teslaLadetid || teslaLadePris !== null || teslaLadeDum !== null) && (
          <div className="rounded-2xl bg-bg-card p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-dim mb-1">
              <Icon icon="mdi:brain" width={12} />
              Smart lading
            </div>
            {teslaLadetid && (
              <StatRow icon="mdi:timer-outline" label="Ladetid" value={teslaLadetid} />
            )}
            {teslaLadePris !== null && (
              <StatRow icon="mdi:lightning-bolt" label="Kostnad smart" value={`${teslaLadePris.toFixed(2)} kr`} color="text-accent-cool" />
            )}
            {teslaLadeDum !== null && (
              <StatRow icon="mdi:lightning-bolt-outline" label="Kostnad dum" value={`${teslaLadeDum.toFixed(2)} kr`} />
            )}
            {teslaLadePris !== null && teslaLadeDum !== null && teslaLadeDum > teslaLadePris && (
              <StatRow icon="mdi:piggy-bank-outline" label="Sparing" value={`${(teslaLadeDum - teslaLadePris).toFixed(2)} kr`} color="text-accent-green" />
            )}
          </div>
        )}

        {/* Økt & total */}
        {(laderSession !== null || laderTotal !== null) && (
          <div className="rounded-2xl bg-bg-card p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-dim mb-1">
              <Icon icon="mdi:history" width={12} />
              Historikk
            </div>
            {laderSession !== null && (
              <StatRow icon="mdi:battery-charging" label="Siste økt" value={`${laderSession.toFixed(2)} kWh`} />
            )}
            {laderTotal !== null && (
              <StatRow icon="mdi:counter" label="Totalt levert" value={`${laderTotal.toFixed(1)} kWh`} />
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ── Main popup ────────────────────────────────────────────────────────────────
interface EvBatteryPopupProps {
  open: boolean;
  onClose: () => void;
  config: EnergyConfig;
}

export function EvBatteryPopup({ open, onClose, config }: EvBatteryPopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  const [batteryOpen,  setBatteryOpen]  = useState(false);
  const [sparingOpen,  setSparingOpen]  = useState(false);
  const [ladingOpen,   setLadingOpen]   = useState(false);

  const soc        = config.evSocSensor ? parseNumericState(entities[config.evSocSensor]?.state) : null;
  const plugStatus = config.evPlugSensor ? entities[config.evPlugSensor]?.state : undefined;
  const plugged    = plugStatus != null && plugStatus !== "plugged_out" && plugStatus !== "off"
    && plugStatus !== "unavailable" && plugStatus !== "unknown";
  const fullyCharged = soc !== null && soc >= 80;

  // Tesla-specific
  const range_km    = parseNumericState(entities["sensor.tesla_model_y_batteri_estimert_batterirekkevidde"]?.state);
  const dailyKm     = parseNumericState(entities["sensor.tesla_model_y_daglig_kjoring"]?.state);
  const odometer    = parseNumericState(entities["sensor.tesla_model_y_kilometerteller"]?.state);
  const chargeState = entities["sensor.tesla_model_y_batteri_ladetilstand"]?.state;
  const ladePrTime  = parseNumericState(entities["sensor.tesla_lading_kostnad_per_time"]?.state);
  const ladePerOkt  = parseNumericState(entities["sensor.tesla_lading_kostnad_per_okt"]?.state);

  // Elbillader (Zaptec)
  const laderPower   = parseNumericState(entities["sensor.elbillader_charge_power"]?.state);
  const laderMode    = entities["sensor.elbillader_charger_mode"]?.state;
  const laderSession = parseNumericState(entities["sensor.elbillader_completed_session_energy"]?.state);
  const laderTotal   = parseNumericState(entities["sensor.elbillader_energy_meter"]?.state);

  // EV Sparing
  const sparingAttrs = entities["sensor.ev_sparing_oversikt"]?.attributes as Record<string, unknown> | undefined;
  const totalSparing = sparingAttrs?.total_sparing as number | undefined;

  // Tesla smart lading (ioniq-entiteter)
  const teslaLadeStat = entities["sensor.ioniq_custom"];
  const teslaLadetid  = teslaLadeStat?.attributes?.ladetid as string | undefined;
  const teslaLadePris = parseNumericState(entities["sensor.ioniq_5_ladepris"]?.state);
  const teslaLadeDum  = parseNumericState(entities["sensor.ioniq_5_ladepris_dum"]?.state);

  const laderModeLabel: Record<string, string> = {
    disconnected: "Frakoblet",
    waiting:      "Venter",
    charging:     "Lader",
    finished:     "Ferdig",
    error:        "Feil",
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose}>
        <Dialog.Title className="sr-only">Elbil batteri</Dialog.Title>
        <Dialog.Description className="sr-only">Batterinivå og info for Tesla Model Y</Dialog.Description>

        <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">

          {/* ── Tesla Model Y ────────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:car-electric" width={18} className={fullyCharged ? "text-accent-green" : "text-accent-cool"} />
                <span className="text-sm font-semibold">Tesla Model Y</span>
              </div>
              {chargeState && <span className="text-[11px] text-text-dim">{chargeState}</span>}
            </div>

            {/* Battery bar — tap → chart popup */}
            <button onClick={() => setBatteryOpen(true)} className="w-full text-left space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">Batterinivå</span>
                <div className="flex items-center gap-1.5">
                  {fullyCharged && <span className="text-[11px] font-medium text-accent-green">Fullladet</span>}
                  {!fullyCharged && plugged && <span className="text-[11px] font-medium text-accent-cool">Lader</span>}
                  {soc !== null && (
                    <span className={`text-base font-bold tabular-nums ${fullyCharged ? "text-accent-green" : plugged ? "text-accent-cool" : "text-text-primary"}`}>
                      {soc.toFixed(0)}%
                    </span>
                  )}
                  <Icon icon="mdi:chart-line" width={12} className="text-text-dim" />
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${fullyCharged ? "bg-accent-green" : plugged ? "bg-accent-cool" : "bg-text-dim"}`}
                  style={{ width: `${Math.min(100, soc ?? 0)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-text-dim">
                <span>0%</span>
                <span className="text-accent-green/60">80% mål</span>
                <span>100%</span>
              </div>
            </button>

            {/* Kjøredata */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              {range_km !== null && (
                <StatRow icon="mdi:map-marker-distance" label="Estimert rekkevidde" value={`${Math.round(range_km)} km`} color="text-accent-cool" />
              )}
              {dailyKm !== null && (
                <StatRow icon="mdi:road-variant" label="Kjørt i dag" value={`${dailyKm.toFixed(0)} km`} />
              )}
              {odometer !== null && (
                <StatRow icon="mdi:counter" label="Kilometerstand" value={`${odometer.toFixed(0)} km`} />
              )}
            </div>

            {/* EV Sparing — tap → sparing popup */}
            {sparingAttrs && (
              <button
                onClick={() => setSparingOpen(true)}
                className="w-full text-left rounded-xl bg-accent-green/10 ring-1 ring-accent-green/20 px-3 py-2.5 hover:brightness-110 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon icon="mdi:piggy-bank" width={14} className="text-accent-green" />
                    <span className="text-xs font-medium text-accent-green">EV Sparing vs diesel</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {totalSparing !== undefined && (
                      <span className="text-sm font-bold tabular-nums text-accent-green">
                        {Math.round(totalSparing).toLocaleString("no-NO")} kr
                      </span>
                    )}
                    <Icon icon="mdi:chevron-right" width={14} className="text-accent-green/60" />
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* ── Lading ──────────────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-bg-card p-4 space-y-3">
            {/* Header with live status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon
                  icon={laderMode === "charging" ? "mdi:ev-station" : "mdi:ev-plug-type2"}
                  width={18}
                  className={laderMode === "charging" ? "text-accent-cool" : laderMode === "finished" ? "text-accent-green" : "text-text-dim"}
                />
                <span className="text-sm font-semibold">Lading</span>
              </div>
              <div className="flex items-center gap-2">
                {laderMode !== undefined && (
                  <span className={`text-xs font-medium ${laderMode === "charging" ? "text-accent-cool" : laderMode === "finished" ? "text-accent-green" : "text-text-dim"}`}>
                    {laderModeLabel[laderMode] ?? laderMode}
                  </span>
                )}
                {laderPower !== null && laderPower > 0 && (
                  <span className="text-sm font-bold tabular-nums text-accent-cool">{laderPower.toFixed(0)} W</span>
                )}
              </div>
            </div>

            {/* Ladegrense presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Icon icon="mdi:battery-charging-80" width={14} className="text-text-dim" />
                  Ladegrense
                </div>
                {parseNumericState(entities["input_number.tesla_model_y_ladegrense"]?.state) !== null && (
                  <span className="text-xs text-text-dim">Mål: {parseNumericState(entities["input_number.tesla_model_y_ladegrense"]?.state)!.toFixed(0)}%</span>
                )}
              </div>
              <div className="flex gap-1.5">
                {["50","60","70","80","100"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      if (!connection) return;
                      callService(connection, "input_select", "select_option", {
                        entity_id: "input_select.tesla_lading_preset",
                        option: opt,
                      });
                    }}
                    className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                      (entities["input_select.tesla_lading_preset"]?.state ?? "80") === opt
                        ? "bg-accent text-white"
                        : "bg-bg-elevated text-text-dim hover:text-text-secondary"
                    }`}
                  >
                    {opt}%
                  </button>
                ))}
              </div>
            </div>

            {/* Maks strøm stepper */}
            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Icon icon="mdi:current-ac" width={14} className="text-text-dim" />
                Maks strøm
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const steps = [6,8,10,12,16,20,25,32];
                    const cur = parseNumericState(entities["number.elbillader_charger_max_current"]?.state) ?? 32;
                    const prev = steps.filter((s) => s < cur).at(-1) ?? 6;
                    if (connection) callService(connection, "number", "set_value", { entity_id: "number.elbillader_charger_max_current", value: String(prev) });
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Icon icon="mdi:minus" width={14} />
                </button>
                <span className="w-12 text-center text-sm font-semibold tabular-nums">
                  {(parseNumericState(entities["number.elbillader_charger_max_current"]?.state) ?? 32).toFixed(0)} A
                </span>
                <button
                  onClick={() => {
                    const steps = [6,8,10,12,16,20,25,32];
                    const cur = parseNumericState(entities["number.elbillader_charger_max_current"]?.state) ?? 32;
                    const next = steps.find((s) => s > cur) ?? 32;
                    if (connection) callService(connection, "number", "set_value", { entity_id: "number.elbillader_charger_max_current", value: String(next) });
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Icon icon="mdi:plus" width={14} />
                </button>
              </div>
            </div>

            {/* Autoriser + Detaljer */}
            <div className="flex gap-2 pt-1 border-t border-white/5">
              <button
                onClick={() => { if (connection) callService(connection, "button", "press", { entity_id: "button.elbillader_authorize_charging" }); }}
                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
                  laderMode === "charging"
                    ? "bg-accent-cool/15 text-accent-cool"
                    : "bg-bg-elevated text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Icon icon="mdi:lock-check-outline" width={14} />
                  Autoriser
                </span>
              </button>
              <button
                onClick={() => setLadingOpen(true)}
                className="flex-1 rounded-xl py-2.5 text-xs font-semibold bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Icon icon="mdi:receipt-text" width={14} />
                  Kostnader
                </span>
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      <BatteryHistoryPopup
        open={batteryOpen}
        onClose={() => setBatteryOpen(false)}
        socEntityId={config.evSocSensor ?? ""}
        soc={soc}
        fullyCharged={fullyCharged}
        plugged={plugged}
      />

      {sparingAttrs && (
        <SparingPopup
          open={sparingOpen}
          onClose={() => setSparingOpen(false)}
          sparingAttrs={sparingAttrs}
        />
      )}

      <LadingDetailPopup
        open={ladingOpen}
        onClose={() => setLadingOpen(false)}
        ladePrTime={ladePrTime}
        ladePerOkt={ladePerOkt}
        laderSession={laderSession}
        laderTotal={laderTotal}
        teslaLadetid={teslaLadetid}
        teslaLadePris={teslaLadePris}
        teslaLadeDum={teslaLadeDum}
      />
    </>
  );
}
