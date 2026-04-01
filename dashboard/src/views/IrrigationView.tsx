import { useState, useEffect } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, HassEntity, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../lib/format";
import { VANNING_CONFIG, WATER_METER_CONFIG, type VanningZoneConfig } from "../lib/entities";
import { useWeatherForecast } from "../hooks/useWeatherForecast";


const DAG_LABELS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSecondsRemaining(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s igjen";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}t ${m}m igjen`;
  if (m > 0) return `${m}m ${s}s igjen`;
  return `${s}s igjen`;
}

function useTimerCountdown(finishesAt: string | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
    if (!finishesAt) return null;
    return Math.max(0, Math.round((new Date(finishesAt).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!finishesAt) { setSecondsLeft(null); return; }
    const update = () => {
      const left = Math.max(0, Math.round((new Date(finishesAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [finishesAt]);

  return secondsLeft;
}

function formatRainStartsIn(minutes: number): string {
  if (minutes >= 1440) return "Ikke i prognosen";
  if (minutes < 60) return `Om ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `Om ${h}t ${m}m` : `Om ${h}t`;
}


// ── Irrigation recommendation card ───────────────────────────────────────────

function IrrigationRecommendationCard({
  entity, zones, connection,
}: {
  entity: HassEntity;
  zones: VanningZoneConfig[];
  entities: HassEntities;
  connection: Connection | null;
}) {
  const recommendation = entity.state ?? "—";
  const anbefaltMin = parseNumericState(entity.attributes?.anbefalt_minutter as string | undefined) ?? 0;
  const skipReason  = entity.attributes?.skip_reason as string | undefined;
  const shouldSkip  = anbefaltMin === 0;

  const startAll = () => {
    if (!connection || shouldSkip || anbefaltMin <= 0) return;
    zones.forEach((zone) => {
      callService(connection, "script", "turn_on", {
        variables: { ventil: zone.valve, timer: zone.timer, varighet: anbefaltMin },
      }, { entity_id: "script.vanning_start" });
    });
  };

  const bgColor = shouldSkip
    ? "bg-accent-cool/8 ring-1 ring-accent-cool/15"
    : "bg-accent-green/8 ring-1 ring-accent-green/15";

  const iconColor = shouldSkip ? "text-accent-cool" : "text-accent-green";
  const icon = shouldSkip ? "mdi:umbrella" : "mdi:sprinkler-variant";

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${bgColor}`}>
      <div className="flex items-center gap-2">
        <Icon icon={icon} width={18} className={iconColor} />
        <h2 className="text-sm font-semibold">Anbefaling</h2>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className={`text-base font-semibold ${shouldSkip ? "text-accent-cool" : "text-accent-green"}`}>
            {recommendation}
          </div>
          {skipReason && skipReason !== "none" && (
            <div className="text-xs text-text-dim mt-0.5">{skipReason}</div>
          )}
        </div>
        {!shouldSkip && anbefaltMin > 0 && (
          <button
            onClick={startAll}
            className="flex items-center gap-1.5 rounded-xl bg-accent-green/15 px-3 py-2 text-sm font-medium text-accent-green hover:bg-accent-green/25 transition-colors"
          >
            <Icon icon="mdi:play" width={14} />
            Start alle {anbefaltMin} min
          </button>
        )}
      </div>
    </div>
  );
}

// ── Zone card (status + manual start) ────────────────────────────────────────

function ZoneCard({
  zone, entities, connection,
}: {
  zone: VanningZoneConfig;
  entities: HassEntities;
  connection: Connection | null;
}) {
  const [manualMin, setManualMin] = useState<number>(10);

  const valveState  = entities[zone.valve]?.state;
  const timerState  = entities[zone.timer]?.state;
  const finishesAt  = entities[zone.timer]?.attributes?.finishes_at as string | undefined;
  const isOpen      = valveState === "open" || valveState === "opening";
  const timerActive = timerState === "active";
  const secondsLeft = useTimerCountdown(timerActive ? finishesAt : undefined);

  const startManual = () => {
    if (!connection) return;
    callService(connection, "script", "turn_on", {
      variables: {
        ventil: zone.valve,
        timer: zone.timer,
        varighet: manualMin,
      },
    }, { entity_id: "script.vanning_start" });
  };

  const stopManual = () => {
    if (!connection) return;
    callService(connection, "timer", "cancel", {}, { entity_id: zone.timer });
    // vanning.yaml automation handles valve.close_valve on timer cancelled
  };

  return (
    <div className={`rounded-2xl p-4 space-y-3 transition-colors ${
      isOpen ? "bg-accent-cool/10 ring-1 ring-accent-cool/20" : "bg-bg-card"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            icon={zone.icon}
            width={18}
            className={isOpen ? "text-accent-cool" : "text-text-dim"}
          />
          <span className="text-sm font-medium">{zone.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {isOpen && timerActive && secondsLeft !== null && (
            <span className="text-xs tabular-nums text-accent-cool">
              {formatSecondsRemaining(secondsLeft)}
            </span>
          )}
          <div className={`h-2 w-2 rounded-full ${isOpen ? "bg-accent-cool animate-pulse" : "bg-white/20"}`} />
        </div>
      </div>

      {isOpen ? (
        <button
          onClick={stopManual}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent-red/15 py-2.5 text-sm text-accent-red"
        >
          <Icon icon="mdi:stop" width={14} />
          Stopp
        </button>
      ) : (
        <div className="space-y-2">
          {/* Quick presets */}
          <div className="flex gap-1.5">
            {[5, 10, 60, 120].map((min) => (
              <button
                key={min}
                onClick={() => setManualMin(min)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  manualMin === min
                    ? "bg-accent-cool text-white"
                    : "bg-white/8 text-text-secondary hover:bg-white/12"
                }`}
              >
                {min >= 60 ? `${min / 60}t` : `${min}m`}
              </button>
            ))}
          </div>
          {/* Fine-tune slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-dim w-8 text-right tabular-nums">{manualMin}m</span>
            <input
              type="range"
              min={1}
              max={120}
              step={1}
              value={manualMin}
              onChange={(e) => setManualMin(Number(e.target.value))}
              className="flex-1 h-1.5 accent-sky-400 cursor-pointer"
            />
          </div>
          <button
            onClick={startManual}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent-cool/15 py-2.5 text-sm text-accent-cool"
          >
            <Icon icon="mdi:play" width={14} />
            Start {manualMin} min
          </button>
        </div>
      )}
    </div>
  );
}

// ── Schedule editor per zone ──────────────────────────────────────────────────

function ScheduleSection({
  zone, entities, connection,
}: {
  zone: VanningZoneConfig;
  entities: HassEntities;
  connection: Connection | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const scheduledDuration = parseNumericState(entities[zone.varighet]?.state) ?? 10;
  const startTime = entities[zone.starttid]?.state ?? "07:00:00";
  const displayTime = startTime.slice(0, 5);

  const activeDays = zone.dager.filter((id) => entities[id]?.state === "on").length;

  const toggleDay = (entityId: string) => {
    if (!connection) return;
    callService(connection, "input_boolean", "toggle", {}, { entity_id: entityId });
  };

  const setDuration = (delta: number) => {
    if (!connection) return;
    const newVal = Math.min(60, Math.max(1, scheduledDuration + delta));
    callService(connection, "input_number", "set_value", { value: newVal }, { entity_id: zone.varighet });
  };

  const setTime = (time: string) => {
    if (!connection) return;
    callService(connection, "input_datetime", "set_datetime", { time }, { entity_id: zone.starttid });
  };

  return (
    <div className="rounded-2xl bg-bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-white/4"
      >
        <div className="flex items-center gap-2.5">
          <Icon icon={zone.icon} width={16} className="text-text-dim" />
          <span className="text-sm font-medium">{zone.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span>{activeDays > 0 ? `${activeDays} dager • ${displayTime} • ${scheduledDuration}m` : "Ikke satt opp"}</span>
          <Icon icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"} width={14} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-4">
          {/* Weekday picker */}
          <div>
            <div className="text-xs text-text-dim mb-2">Dager</div>
            <div className="flex gap-1">
              {zone.dager.map((entityId, i) => {
                const isOn = entities[entityId]?.state === "on";
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(entityId)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                      isOn ? "bg-accent-cool text-white" : "bg-white/8 text-text-dim"
                    }`}
                  >
                    {DAG_LABELS[i]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start time */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-dim">Starttidspunkt</span>
            <input
              type="time"
              value={displayTime}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-lg bg-bg-elevated px-2 py-1 text-sm tabular-nums text-text-primary border-0 outline-none"
            />
          </div>

          {/* Duration */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-dim">Varighet</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDuration(-5)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-text-secondary hover:bg-white/12"
              >
                <Icon icon="mdi:minus" width={12} />
              </button>
              <span className="w-12 text-center text-sm tabular-nums font-medium">{scheduledDuration} min</span>
              <button
                onClick={() => setDuration(5)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-text-secondary hover:bg-white/12"
              >
                <Icon icon="mdi:plus" width={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Water heater constants ────────────────────────────────────────────────────

const VVB_LEGIONELLA_OK    = "binary_sensor.vvb_legionella_ok";
const VVB_NESTE_LEGIONELLA = "input_datetime.vvb_heater_legioniella";
const VVB_SIST_OPPVARMET   = "sensor.vvb_oppvarmet";
const VVB_POWER            = "sensor.varmtvannsbereder_effekt";
const VVB_SWITCH           = "switch.varmtvannsbereder";

// ── Water meter card (Quandify) ───────────────────────────────────────────────

const CATEGORY_BREAKDOWN = [
  { entity: "input_number.vann_dusj_daglig",    label: "Dusj",     icon: "mdi:shower-head",         color: "text-accent-cool",  bar: "bg-accent-cool" },
  { entity: "input_number.vann_toalett_daglig", label: "Toalett",  icon: "mdi:toilet",               color: "text-accent-warm",  bar: "bg-accent-warm" },
  { entity: "input_number.vann_handvask_daglig",label: "Håndvask", icon: "mdi:hand-water",           color: "text-accent-green", bar: "bg-accent-green" },
  { entity: "input_number.vann_oppvask_daglig", label: "Oppvask",  icon: "mdi:dishwasher",           color: "text-text-secondary",bar: "bg-white/40" },
  { entity: "input_number.vann_badekar_daglig", label: "Badekar",  icon: "mdi:bathtub-outline",      color: "text-accent-cool",  bar: "bg-accent-cool/60" },
] as const;

function WaterMeterCard({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showVvb, setShowVvb] = useState(false);
  const cfg = WATER_METER_CONFIG;

  // VVB state
  const vvbOk      = entities[VVB_LEGIONELLA_OK]?.state === "on";
  const vvbNesteRaw = entities[VVB_NESTE_LEGIONELLA]?.state;
  const vvbSistRaw  = entities[VVB_SIST_OPPVARMET]?.state;
  const vvbPowerW   = parseNumericState(entities[VVB_POWER]?.state);
  const vvbHeating  = vvbPowerW !== null && vvbPowerW >= 10;
  const vvbOn       = entities[VVB_SWITCH]?.state === "on";
  const vvbNeste    = vvbNesteRaw ? new Date(vvbNesteRaw) : null;
  const vvbDaysUntil = vvbNeste ? Math.ceil((vvbNeste.getTime() - Date.now()) / 86_400_000) : null;

  const toggleVvb = () => {
    if (!connection) return;
    callService(connection, "switch", vvbOn ? "turn_off" : "turn_on", {}, { entity_id: VVB_SWITCH });
  };

  const totalL    = parseNumericState(entities[cfg.totalVolume]?.state);
  const tempC     = parseNumericState(entities[cfg.waterTemperature]?.state);
  const waterType = entities[cfg.waterType]?.state;
  const hasLeak   = entities[cfg.leak]?.state === "on";

  const category  = cfg.activityCategory ? entities[cfg.activityCategory]?.state : null;
  const flowLpm   = cfg.activityCategory
    ? parseNumericState(entities[cfg.activityCategory]?.attributes?.flow_lpm as string | undefined)
    : null;
  const isActive  = flowLpm !== null && flowLpm >= 0.1;

  const dailyM3   = cfg.dailyVolume   ? parseNumericState(entities[cfg.dailyVolume]?.state)   : null;
  const weeklyM3  = cfg.weeklyVolume  ? parseNumericState(entities[cfg.weeklyVolume]?.state)  : null;
  const monthlyM3 = cfg.monthlyVolume ? parseNumericState(entities[cfg.monthlyVolume]?.state) : null;

  const breakdown = CATEGORY_BREAKDOWN.map((c) => ({
    ...c,
    liters: parseNumericState(entities[c.entity]?.state) ?? 0,
  }));
  const breakdownTotal = breakdown.reduce((sum, c) => sum + c.liters, 0);
  const hasBreakdown   = breakdownTotal > 0;

  if (totalL === null && tempC === null) return null;

  return (
    <div className={`rounded-2xl p-4 space-y-4 ${hasLeak ? "bg-accent-red/10 ring-1 ring-accent-red/25" : "bg-bg-card"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:water-pump" width={18} className={hasLeak ? "text-accent-red" : "text-accent-cool"} />
          <h2 className="text-sm font-semibold">Husmåling</h2>
        </div>
        <div className="flex items-center gap-2">
          {isActive && category && category !== "Ingen aktivitet" && (
            <div className="flex items-center gap-1 rounded-full bg-accent-cool/15 px-2.5 py-1 text-xs font-medium text-accent-cool">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-cool animate-pulse" />
              {category}
              {flowLpm !== null && <span className="tabular-nums text-[10px] opacity-75 ml-1">{flowLpm.toFixed(1)} L/m</span>}
            </div>
          )}
          {hasLeak && (
            <div className="flex items-center gap-1 rounded-full bg-accent-red/15 px-2.5 py-1 text-xs font-medium text-accent-red">
              <Icon icon="mdi:water-alert" width={13} />
              Lekkasje
            </div>
          )}
        </div>
      </div>

      {/* Period totals */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "I dag",  value: dailyM3 },
          { label: "Uke",    value: weeklyM3 },
          { label: "Måned",  value: monthlyM3 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-bg-elevated px-3 py-2.5 text-center">
            <div className="text-base font-bold tabular-nums text-accent-cool">
              {value !== null ? (
                value * 1000 >= 1000
                  ? <>{value.toFixed(2)}<span className="text-xs font-normal ml-0.5">m³</span></>
                  : <>{Math.round(value * 1000)}<span className="text-xs font-normal ml-0.5">L</span></>
              ) : "—"}
            </div>
            <div className="text-[10px] text-text-dim mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Today's category breakdown — collapsible */}
      <div className="border-t border-white/5">
        <button
          onClick={() => setShowBreakdown((v) => !v)}
          className="flex w-full items-center justify-between pt-3 pb-1 hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
              Fordeling i dag
            </span>
            {hasBreakdown && (
              <div className="flex h-2 w-20 overflow-hidden rounded-full bg-white/8">
                {breakdown.filter((c) => c.liters > 0).map((c) => (
                  <div
                    key={c.label}
                    className={`h-full ${c.bar}`}
                    style={{ width: `${(c.liters / breakdownTotal) * 100}%` }}
                  />
                ))}
              </div>
            )}
          </div>
          <Icon
            icon={showBreakdown ? "mdi:chevron-up" : "mdi:chevron-down"}
            width={14}
            className="text-text-dim"
          />
        </button>

        {showBreakdown && (
          <div className="space-y-1.5 pb-1 pt-2">
            {breakdown.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <Icon icon={c.icon} width={14} className={c.liters > 0 ? c.color : "text-text-dim"} />
                <span className="flex-1 text-xs text-text-secondary">{c.label}</span>
                <span className={`tabular-nums text-xs font-medium ${c.liters > 0 ? c.color : "text-text-dim"}`}>
                  {c.liters > 0 ? `${Math.round(c.liters)} L` : "—"}
                </span>
                {hasBreakdown && c.liters > 0 && (
                  <span className="w-8 text-right text-[10px] text-text-dim tabular-nums">
                    {Math.round((c.liters / breakdownTotal) * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Secondary row: total + temp + type */}
      <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
        {totalL !== null && (
          <div className="text-center">
            <div className="text-sm font-semibold tabular-nums text-text-secondary">
              {(totalL / 1000).toFixed(1)} m³
            </div>
            <div className="text-[10px] text-text-dim mt-0.5">Totalt</div>
          </div>
        )}
        {tempC !== null && (
          <div className="text-center">
            <div className="text-sm font-semibold tabular-nums text-accent-cool">{tempC.toFixed(1)}°C</div>
            <div className="text-[10px] text-text-dim mt-0.5">Temp</div>
          </div>
        )}
        {waterType && (
          <div className="text-center">
            <div className="text-sm font-semibold text-text-secondary">
              {waterType === "Cold" ? "Kald" : waterType === "Hot" ? "Varm" : waterType}
            </div>
            <div className="text-[10px] text-text-dim mt-0.5">Type</div>
          </div>
        )}
      </div>

      {/* Varmtvannsbereder — collapsible dropdown */}
      <div className="border-t border-white/5">
        {/* Always-visible header row */}
        <div className="flex items-center justify-between pt-3 pb-1">
          <button
            onClick={() => setShowVvb((v) => !v)}
            className="flex flex-1 items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Icon
              icon="mdi:water-boiler"
              width={14}
              className={!vvbOk ? "text-accent-red" : vvbHeating ? "text-accent-warm" : "text-accent-cool"}
            />
            <span className="text-xs text-text-secondary">Varmtvannsbereder</span>
            {vvbHeating && (
              <span className="flex items-center gap-1 rounded-full bg-accent-warm/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-warm">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-warm animate-pulse" />
                {vvbPowerW! >= 1000 ? `${(vvbPowerW! / 1000).toFixed(1)} kW` : `${vvbPowerW!.toFixed(0)} W`}
              </span>
            )}
            {!vvbOk && (
              <span className="rounded-full bg-accent-red/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-red">
                Legionella!
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleVvb}
              className={`relative h-5 w-9 rounded-full p-0.5 transition-colors duration-200 ${vvbOn ? "bg-accent-cool" : "bg-white/15"}`}
              aria-label={vvbOn ? "Skru av varmtvannsbereder" : "Skru på varmtvannsbereder"}
            >
              <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${vvbOn ? "translate-x-4" : "translate-x-0"}`} />
            </button>
            <Icon icon={showVvb ? "mdi:chevron-up" : "mdi:chevron-down"} width={14} className="text-text-dim" />
          </div>
        </div>

        {/* Expanded details */}
        {showVvb && (
          <div className="pb-2 space-y-2">
            {/* Legionella + On/Off status row */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 flex-1 rounded-xl px-3 py-2 text-xs font-medium ${
                vvbOk ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
              }`}>
                <Icon icon={vvbOk ? "mdi:shield-check" : "mdi:shield-alert"} width={13} />
                {vvbOk ? "Legionella OK" : "Legionella feil"}
              </div>
              <div className={`rounded-xl px-3 py-2 text-xs ${vvbOn ? "bg-accent-cool/10" : "bg-bg-elevated"}`}>
                <span className={vvbOn ? "text-accent-cool font-medium" : "text-text-dim"}>
                  {vvbOn ? "På" : "Av"}
                </span>
              </div>
            </div>
            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-2">
              {vvbSistRaw && (
                <div className="rounded-xl bg-bg-elevated px-3 py-2">
                  <div className="text-[10px] text-text-dim mb-0.5">Sist oppvarmet</div>
                  <div className="text-sm font-medium">{vvbSistRaw}</div>
                </div>
              )}
              {vvbNeste && (
                <div className="rounded-xl bg-bg-elevated px-3 py-2">
                  <div className="text-[10px] text-text-dim mb-0.5">Neste legionella</div>
                  <div className="text-sm font-medium">
                    {vvbDaysUntil !== null && vvbDaysUntil >= 0
                      ? `Om ${vvbDaysUntil} d`
                      : vvbNeste.toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}
                  </div>
                </div>
              )}
              {vvbPowerW !== null && (
                <div className="rounded-xl bg-bg-elevated px-3 py-2">
                  <div className="text-[10px] text-text-dim mb-0.5">Effekt nå</div>
                  <div className={`text-sm font-medium ${vvbHeating ? "text-accent-warm" : "text-text-dim"}`}>
                    {vvbHeating ? (vvbPowerW >= 1000 ? `${(vvbPowerW / 1000).toFixed(1)} kW` : `${vvbPowerW.toFixed(0)} W`) : "0 W"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline rain dropdown (used inside vanning card) ───────────────────────────

function RainDropdown({ cfg, entities }: { cfg: typeof VANNING_CONFIG; entities: HassEntities }) {
  const [open, setOpen] = useState(false);
  const forecast = useWeatherForecast();
  const [activeBar, setActiveBar] = useState<number | null>(null);

  const rain30min = parseNumericState(entities[cfg.regnNeste30min]?.state) ?? 0;
  const rainTime  = parseNumericState(entities[cfg.regnNesteTime]?.state) ?? 0;
  const rain6t    = parseNumericState(entities[cfg.regnNeste6t]?.state) ?? 0;
  const starterOm = parseNumericState(entities[cfg.regnStarterOm]?.state) ?? 1440;

  const hourlyRain = forecast.slice(0, 12).map((f) => ({
    hour: new Date(f.datetime).getHours(),
    mm: f.precipitation ?? 0,
    prob: f.precipitation_probability ?? 0,
  }));
  const maxMm = Math.max(...hourlyRain.map((h) => h.mm), 0.5);
  const hasRain = rain6t > 0 || starterOm < 1440;

  return (
    <div className="border-t border-white/5 mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between pt-3 pb-1 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <Icon icon="mdi:weather-rainy" width={13} className={hasRain ? "text-accent-cool" : "text-text-dim"} />
          <span className="text-xs text-text-secondary">Regn</span>
          {starterOm < 1440 && (
            <span className="text-[10px] text-accent-cool tabular-nums">{formatRainStartsIn(starterOm)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-text-dim">
            {rain6t > 0 ? `${rain6t.toFixed(1)} mm/6t` : "Tørt"}
          </span>
          <Icon icon={open ? "mdi:chevron-up" : "mdi:chevron-down"} width={14} className="text-text-dim" />
        </div>
      </button>

      {open && (
        <div className="pb-2 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "30 min", value: rain30min },
              { label: "1 time", value: rainTime },
              { label: "6 timer", value: rain6t },
            ].map(({ label, value }) => (
              <div key={label} className={`rounded-xl py-2 ${value > 0 ? "bg-accent-cool/10" : "bg-bg-elevated"}`}>
                <div className={`text-base font-bold tabular-nums ${value > 0 ? "text-accent-cool" : "text-text-dim"}`}>
                  {value > 0 ? value.toFixed(1) : "0"}
                  <span className="text-[10px] font-normal ml-0.5">mm</span>
                </div>
                <div className="text-[10px] text-text-dim mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          {hourlyRain.length > 0 && (
            <div className="space-y-1" onPointerLeave={() => setActiveBar(null)}>
              <div className="relative flex items-end gap-0.5 h-10">
                {activeBar !== null && hourlyRain[activeBar] && (
                  <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-bg-elevated/95 px-1.5 py-0.5 text-[10px] tabular-nums text-text-primary"
                    style={{ left: `${(activeBar + 0.5) / hourlyRain.length * 100}%`, bottom: "100%" }}
                  >
                    {hourlyRain[activeBar].mm.toFixed(1)} mm
                  </div>
                )}
                {hourlyRain.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center justify-end"
                    onPointerEnter={() => setActiveBar(i)}
                  >
                    <div
                      className="w-full rounded-sm transition-all"
                      style={{
                        height: `${Math.max(3, (h.mm / maxMm) * 36)}px`,
                        background: activeBar === i
                          ? "rgba(96,165,250,0.9)"
                          : h.mm > 0
                            ? `rgba(96,165,250,${0.3 + (h.mm / maxMm) * 0.7})`
                            : "rgba(255,255,255,0.06)",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-0.5">
                {hourlyRain.map((h, i) => (
                  <div key={i} className="flex-1 text-center text-[9px] text-text-dim tabular-nums">
                    {h.hour % 3 === 0 ? h.hour : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── Main view ─────────────────────────────────────────────────────────────────

export function IrrigationView() {
  const entities  = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;
  const cfg = VANNING_CONFIG;

  const aktivert   = entities[cfg.aktivert]?.state === "on";
  const regnskjerm = entities[cfg.regnskjerm]?.state === "on";
  const terskel    = parseNumericState(entities[cfg.regnTerskel]?.state) ?? 2;
  const rain6t     = parseNumericState(entities[cfg.regnNeste6t]?.state) ?? 0;

  const rainSkipWouldTrigger = regnskjerm && rain6t >= terskel;

  const toggleAktiviert = () => {
    if (!connection) return;
    callService(connection, "input_boolean", "toggle", {}, { entity_id: cfg.aktivert });
  };
  const toggleRegnskjerm = () => {
    if (!connection) return;
    callService(connection, "input_boolean", "toggle", {}, { entity_id: cfg.regnskjerm });
  };
  const setTerskel = (delta: number) => {
    if (!connection) return;
    const newVal = Math.min(20, Math.max(0.5, terskel + delta));
    callService(connection, "input_number", "set_value", { value: newVal }, { entity_id: cfg.regnTerskel });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">

      {/* Household water meter (includes varmtvannsbereder dropdown) */}
      <WaterMeterCard entities={entities} connection={connection} />

      {/* System status bar */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:sprinkler-variant" width={20} className={aktivert ? "text-accent-cool" : "text-text-dim"} />
            <span className="font-semibold text-sm">Vanning</span>
          </div>
          <button
            onClick={toggleAktiviert}
            className={`relative h-6 w-11 rounded-full p-0.5 transition-colors duration-200 ${aktivert ? "bg-accent-cool" : "bg-white/15"}`}
          >
            <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${aktivert ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>

        {/* Rain overview dropdown */}
        <RainDropdown cfg={cfg} entities={entities} />

        {/* Rain skip row */}
        <div className="mt-2 border-t border-white/5 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon
                icon="mdi:weather-rainy"
                width={14}
                className={regnskjerm ? "text-accent-cool" : "text-text-dim"}
              />
              <span className="text-xs text-text-secondary">Regnskjerm</span>
              {rainSkipWouldTrigger && (
                <span className="rounded-full bg-accent-cool/15 px-2 py-0.5 text-[10px] text-accent-cool">
                  Hopper over i dag
                </span>
              )}
            </div>
            <button
              onClick={toggleRegnskjerm}
              className={`relative h-5 w-9 rounded-full p-0.5 transition-colors duration-200 ${regnskjerm ? "bg-accent-cool/70" : "bg-white/15"}`}
            >
              <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${regnskjerm ? "translate-x-4" : "translate-x-0"}`} />
            </button>
          </div>
          {regnskjerm && (
            <div className="flex items-center justify-between pl-5">
              <span className="text-xs text-text-dim">Terskel (neste 6t)</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setTerskel(-0.5)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 text-text-secondary">
                  <Icon icon="mdi:minus" width={10} />
                </button>
                <span className="w-14 text-center text-xs tabular-nums">{terskel.toFixed(1)} mm</span>
                <button onClick={() => setTerskel(0.5)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 text-text-secondary">
                  <Icon icon="mdi:plus" width={10} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Irrigation recommendation */}
      {cfg.anbefaling && entities[cfg.anbefaling] && (
        <IrrigationRecommendationCard
          entity={entities[cfg.anbefaling]}
          zones={cfg.zones}
          entities={entities}
          connection={connection}
        />
      )}

      {/* Manual control */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-dim">
          <Icon icon="mdi:hand-water" width={13} />
          Manuell styring
        </h2>
        <div className="space-y-2">
          {cfg.zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              entities={entities}
              connection={connection}
            />
          ))}
        </div>
      </section>

      {/* Weekly schedule */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-dim">
          <Icon icon="mdi:calendar-clock" width={13} />
          Ukentlig program
        </h2>
        <div className="space-y-2">
          {cfg.zones.map((zone) => (
            <ScheduleSection
              key={zone.id}
              zone={zone}
              entities={entities}
              connection={connection}
            />
          ))}
        </div>
      </section>

      <div className="h-20" />
    </div>
  );
}
