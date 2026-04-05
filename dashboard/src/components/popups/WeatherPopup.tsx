import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import {
  CONTEXT_CONFIG,
  SUN_ENTITY,
  MOON_PHASE, MOON_ILLUMINATION,
} from "../../lib/entities";
import { parseNumericState } from "../../lib/format";
import { useWeatherForecastDaily } from "../../hooks/useWeatherForecast";
import { ContextCard } from "../cards/ContextCard";

// ── Moon helpers ──────────────────────────────────────────────────────────────
const MOON_ICONS: Record<string, string> = {
  "new moon":        "wi:moon-alt-new",
  "waxing crescent": "wi:moon-alt-waxing-crescent-3",
  "first quarter":   "wi:moon-alt-first-quarter",
  "waxing gibbous":  "wi:moon-alt-waxing-gibbous-3",
  "full moon":       "wi:moon-alt-full",
  "waning gibbous":  "wi:moon-alt-waning-gibbous-3",
  "last quarter":    "wi:moon-alt-last-quarter",
  "waning crescent": "wi:moon-alt-waning-crescent-3",
};
function moonIcon(phase: string): string {
  return MOON_ICONS[phase.toLowerCase().replace(/_/g, " ")] ?? "wi:moon-alt-full";
}
function fmtTime(iso: string | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}
function uvLabel(uv: number): string {
  if (uv < 1)  return "Ingen";
  if (uv < 3)  return "Lav";
  if (uv < 6)  return "Moderat";
  if (uv < 8)  return "Høy";
  if (uv < 11) return "Veldig høy";
  return "Ekstrem";
}

// ── UV + Nedbør card ──────────────────────────────────────────────────────────
function UVNedbørCard({
  uvIndex, cloudCoverage, todayPrecip, todayPrecipProb,
}: {
  uvIndex: number | undefined;
  cloudCoverage: number | undefined;
  todayPrecip: number | undefined;
  todayPrecipProb: number | undefined;
}) {
  const uvColor = uvIndex == null || uvIndex < 1 ? "text-text-dim"
    : uvIndex < 3 ? "text-accent-green"
    : uvIndex < 6 ? "text-accent-warm"
    : "text-accent-red";

  return (
    <div className="rounded-2xl bg-bg-card p-4 grid grid-cols-2 gap-4">
      {/* UV */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">UV-indeks</div>

        <div className={`flex items-center gap-2 ${uvColor}`}>
          <Icon icon="mdi:sun-wireless" width={22} />
          <span className="text-2xl font-light tabular-nums leading-none">
            {uvIndex != null ? uvIndex.toFixed(0) : "—"}
          </span>
        </div>

        <div className="space-y-1">
          {uvIndex != null && (
            <div className="flex items-center gap-1 text-xs text-text-secondary">
              <Icon icon="mdi:information-outline" width={12} className="text-text-dim" />
              {uvLabel(uvIndex)}
            </div>
          )}
          {cloudCoverage != null && (
            <div className="flex items-center gap-1 text-xs text-text-dim">
              <Icon icon="mdi:cloud-outline" width={12} />
              {Math.round(cloudCoverage)}% skydekke
            </div>
          )}
        </div>
      </div>

      {/* Nedbør */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">Nedbør i dag</div>

        <div className={`flex items-center gap-2 ${todayPrecip && todayPrecip > 0 ? "text-accent-cool" : "text-text-dim"}`}>
          <Icon icon="meteocons:rain" width={22} />
          <span className="text-2xl font-light tabular-nums leading-none">
            {todayPrecip != null ? todayPrecip.toFixed(1) : "0.0"}
          </span>
          <span className="text-xs text-text-dim self-end mb-0.5">mm</span>
        </div>

        <div className="space-y-1">
          {todayPrecipProb != null && todayPrecipProb > 0 ? (
            <div className="flex items-center gap-1 text-xs text-text-secondary">
              <Icon icon="mdi:water-percent" width={12} className="text-text-dim" />
              {Math.round(todayPrecipProb)}% sannsynlighet
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-text-dim">
              <Icon icon="mdi:water-percent" width={12} />
              Ingen nedbør ventet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sol + Måne card ────────────────────────────────────────────────────────────
function SolMåneCard({
  sunAttrs, nextRisingISO, nextSettingISO, moonPhase, moonIllum,
}: {
  sunAttrs: Record<string, unknown>;
  nextRisingISO: string | undefined;
  nextSettingISO: string | undefined;
  moonPhase: string | undefined;
  moonIllum: number | null;
}) {
  const elevation = sunAttrs.elevation as number | undefined;
  const azimuth   = sunAttrs.azimuth   as number | undefined;

  return (
    <div className="rounded-2xl bg-bg-card p-4 grid grid-cols-2 gap-4">
      {/* Sol */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">Sol</div>

        {elevation != null && (
          <div className="flex items-center gap-1.5 text-xs">
            <Icon
              icon="mdi:angle-acute"
              width={14}
              className={elevation > 0 ? "text-accent-warm" : "text-text-dim"}
            />
            <span className="text-text-secondary">Høyde</span>
            <span className="tabular-nums font-medium ml-auto">{elevation.toFixed(1)}°</span>
          </div>
        )}

        {azimuth != null && (
          <div className="flex items-center gap-1.5 text-xs">
            <Icon icon="mdi:compass-outline" width={14} className="text-text-dim" />
            <span className="text-text-secondary">Azimut</span>
            <span className="tabular-nums font-medium ml-auto">{Math.round(azimuth)}°</span>
          </div>
        )}

        {nextRisingISO && (
          <div className="flex items-center gap-1.5 text-xs">
            <Icon icon="mdi:weather-sunset-up" width={14} className="text-accent-warm" />
            <span className="text-text-secondary">Soloppgang</span>
            <span className="tabular-nums font-medium ml-auto">{fmtTime(nextRisingISO)}</span>
          </div>
        )}

        {nextSettingISO && (
          <div className="flex items-center gap-1.5 text-xs">
            <Icon icon="mdi:weather-sunset-down" width={14} className="text-accent-warm/70" />
            <span className="text-text-secondary">Solnedgang</span>
            <span className="tabular-nums font-medium ml-auto">{fmtTime(nextSettingISO)}</span>
          </div>
        )}
      </div>

      {/* Måne */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">Måne</div>

        {moonPhase ? (
          <>
            <div className="flex items-center gap-2">
              <Icon icon={moonIcon(moonPhase)} width={32} className="text-text-secondary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-text-secondary capitalize leading-tight">
                  {moonPhase.replace(/_/g, " ")}
                </div>
                {moonIllum !== null && (
                  <div className="text-xs text-text-dim tabular-nums">{Math.round(moonIllum)}% belyst</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-text-dim">—</div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function WeatherPopup() {
  const entities      = useHass((s) => s.entities) as HassEntities;
  const dailyForecast = useWeatherForecastDaily();

  const weatherAttrs  = entities[CONTEXT_CONFIG.weather]?.attributes ?? {};
  const uvIndex       = weatherAttrs.uv_index       as number | undefined;
  const cloudCoverage = weatherAttrs.cloud_coverage as number | undefined;

  const sunAttrs    = (entities[SUN_ENTITY]?.attributes ?? {}) as Record<string, unknown>;
  const nextRising  = sunAttrs.next_rising  as string | undefined;
  const nextSetting = sunAttrs.next_setting as string | undefined;

  const moonPhase = entities[MOON_PHASE]?.state;
  const moonIllum = parseNumericState(entities[MOON_ILLUMINATION]?.state);

  const todayPrecip     = dailyForecast[0]?.precipitation;
  const todayPrecipProb = dailyForecast[0]?.precipitation_probability;

  return (
    <div className="space-y-3">
      {/* Condition card — full mode with hourly + Varseldager */}
      <ContextCard config={CONTEXT_CONFIG} />

      {/* UV + Nedbør */}
      <UVNedbørCard
        uvIndex={uvIndex}
        cloudCoverage={cloudCoverage}
        todayPrecip={todayPrecip}
        todayPrecipProb={todayPrecipProb}
      />

      {/* Sol + Måne */}
      <SolMåneCard
        sunAttrs={sunAttrs}
        nextRisingISO={nextRising}
        nextSettingISO={nextSetting}
        moonPhase={moonPhase}
        moonIllum={moonIllum}
      />
    </div>
  );
}
