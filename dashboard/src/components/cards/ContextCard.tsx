import { useRef, useState, useEffect, useMemo } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import type { ContextConfig } from "../../lib/entities";
import {
  SUN_ENTITY, SUN_NEXT_RISING, SUN_NEXT_SETTING,
  MOON_PHASE, MOON_ILLUMINATION,
  LIGHTNING_ENTITY_ID, LIGHTNING_LAT, LIGHTNING_LON,
  POLLEN_SENSORS,
} from "../../lib/entities";
import { toWatts, formatPower, formatDuration, parseNumericState } from "../../lib/format";
import { weatherIcon, conditionLabel } from "../../lib/weatherIcons";
import { useWeatherForecast, useWeatherForecastDaily, type ForecastEntry } from "../../hooks/useWeatherForecast";
import { useAttributeTimeline } from "../../hooks/useStateHistory";
import { useMinuteTick } from "../../hooks/useMinuteTick";

function formatTime(isoStr: string | undefined): string {
  if (!isoStr) return "—";
  try {
    return new Date(isoStr).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const MOON_PHASE_ICON: Record<string, string> = {
  "new moon": "wi:moon-alt-new",
  "waxing crescent": "wi:moon-alt-waxing-crescent-3",
  "first quarter": "wi:moon-alt-first-quarter",
  "waxing gibbous": "wi:moon-alt-waxing-gibbous-3",
  "full moon": "wi:moon-alt-full",
  "waning gibbous": "wi:moon-alt-waning-gibbous-3",
  "last quarter": "wi:moon-alt-last-quarter",
  "waning crescent": "wi:moon-alt-waning-crescent-3",
};

function moonIcon(phase: string): string {
  const lower = phase.toLowerCase().replace(/_/g, " ");
  return MOON_PHASE_ICON[lower] ?? "wi:moon-alt-full";
}

function moonPhaseLabel(phase: string): string {
  return phase.replace(/_/g, " ");
}

const DAY_NO = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];

export function ContextCard({ config, compact = false, minimal = false }: { config: ContextConfig; compact?: boolean; minimal?: boolean }) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [showDailyForecast, setShowDailyForecast] = useState(false);
  const [showFullDailyForecast, setShowFullDailyForecast] = useState(false);
  const dailyForecast = useWeatherForecastDaily();

  const timeOfDay = entities[config.timeOfDay]?.state ?? "day";

  // Boiler state + session duration
  const boilerActive = entities[config.boilerEntity]?.attributes?.hvac_action === "heating";
  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const boilerSpans = useAttributeTimeline(config.boilerEntity, "hvac_action", startOfToday);
  const now = useMinuteTick(boilerActive);
  const boilerSessionMs = useMemo(() => {
    if (!boilerActive || boilerSpans.length === 0) return 0;
    const last = boilerSpans[boilerSpans.length - 1];
    if (last.state !== "heating") return 0;
    return now - last.start;
  }, [boilerActive, boilerSpans, now]);

  // Energy data
  const solarE = entities[config.solarPower];
  const solarW = toWatts(solarE?.state, solarE?.attributes?.unit_of_measurement as string) ?? 0;
  const loadE = entities[config.loadPower];
  const loadW = toWatts(loadE?.state, loadE?.attributes?.unit_of_measurement as string) ?? 0;
  const chargerImportE = entities[config.chargerPower];
  const chargerOfferedE = entities[config.chargerPowerOffered];
  const importW = toWatts(chargerImportE?.state, chargerImportE?.attributes?.unit_of_measurement as string) ?? 0;
  const offeredW = toWatts(chargerOfferedE?.state, chargerOfferedE?.attributes?.unit_of_measurement as string) ?? 0;
  const connectorState = entities[config.chargerStatus]?.state;
  const isOcppCharging = connectorState === "Charging";
  const chargerW = importW > 50 ? importW : (isOcppCharging ? offeredW : 0);
  const isCharging = isOcppCharging && chargerW > 50;

  // EV battery
  const batteryLevel = parseNumericState(entities[config.evBattery]?.state);
  const evChargingState = entities[config.evCharging]?.state;
  const isEvCharging = evChargingState === "charging" || evChargingState === "starting";

  // Weather data
  const isNight = timeOfDay === "night" || timeOfDay === "evening";
  const weatherState = entities[config.weather]?.state ?? "sunny";
  const weatherAttrs = entities[config.weather]?.attributes ?? {};
  const outdoorTemp = parseNumericState(entities[config.outdoorTemp]?.state);
  const humidity = parseNumericState(entities[config.outdoorHumidity]?.state);
  const pressure = parseNumericState(entities[config.indoorPressure]?.state);
  const windSpeed = weatherAttrs.wind_speed as number | undefined;
  const windBearing = weatherAttrs.wind_bearing as number | undefined;
  const windGust = weatherAttrs.wind_gust_speed as number | undefined;
  const apparentTemp = weatherAttrs.apparent_temperature as number | undefined;
  const forecastLow = parseNumericState(entities[config.forecastLow]?.state);
  const forecastHigh = parseNumericState(entities[config.forecastHigh]?.state);

  const forecast = useWeatherForecast();
  const forecastSlice = forecast.slice(0, 24);

  // UV, cloud, visibility — prefer entity attrs, fall back to first hourly forecast entry
  const firstEntry = forecastSlice[0];
  const uvIndex       = (weatherAttrs.uv_index      as number | undefined) ?? firstEntry?.uv_index;
  const visibility    =  weatherAttrs.visibility     as number | undefined;
  const cloudCoverage = (weatherAttrs.cloud_coverage as number | undefined) ?? firstEntry?.cloud_coverage;

  // Sun & Moon
  const nextRising    = entities[SUN_NEXT_RISING]?.state;
  const nextSetting   = entities[SUN_NEXT_SETTING]?.state;
  const sunAttrs      = entities[SUN_ENTITY]?.attributes ?? {};
  const sunElevation  = sunAttrs.elevation as number | undefined;
  const sunAzimuth    = sunAttrs.azimuth   as number | undefined;
  const moonPhase     = entities[MOON_PHASE]?.state;
  const moonIllum     = parseNumericState(entities[MOON_ILLUMINATION]?.state);

  // Lightning — use last_changed on the entity id sensor to detect recent strikes
  // lat/lon are available via LIGHTNING_LAT / LIGHTNING_LON if distance calculations needed
  void LIGHTNING_LAT; void LIGHTNING_LON;
  const lightningTs = entities[LIGHTNING_ENTITY_ID]?.last_changed;
  const lightningMinAgo = lightningTs
    ? Math.round((Date.now() - new Date(lightningTs).getTime()) / 60000)
    : null;
  const recentLightning = lightningMinAgo !== null && lightningMinAgo < 30;

  if (compact) {
    return (
      <div className="contain-card rounded-2xl bg-bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Left: temp + condition */}
          <div className="flex items-center gap-2.5">
            <Icon icon={weatherIcon(weatherState, isNight)} width={36} />
            <div>
              <div className="text-xl font-semibold tabular-nums leading-tight">
                {outdoorTemp !== null ? `${outdoorTemp.toFixed(1)}°` : "—"}
              </div>
              {(forecastHigh !== null || forecastLow !== null) && (
                <div className="text-[11px] text-text-dim tabular-nums">
                  {forecastHigh !== null && `${Math.round(forecastHigh)}°`}
                  {forecastHigh !== null && forecastLow !== null && " / "}
                  {forecastLow !== null && `${Math.round(forecastLow)}°`}
                </div>
              )}
            </div>
            <div className="text-xs text-text-secondary">{conditionLabel(weatherState)}</div>
          </div>
          {/* Right: wind + humidity */}
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            {humidity !== null && (
              <span className="flex items-center gap-1">
                <Icon icon="meteocons:humidity" width={16} />
                {Math.round(humidity)}%
              </span>
            )}
            {windSpeed != null && (
              <span className="flex items-center gap-1">
                <Icon icon="meteocons:wind" width={16} />
                {(windSpeed / 3.6).toFixed(1)} m/s
              </span>
            )}
            {loadW > 0 && (
              <span className="flex items-center gap-1 text-text-dim">
                <Icon icon="mdi:home-lightning-bolt" width={14} />
                {formatPower(loadW)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Minimal mode — like compact but taller with more weather detail + sun/moon row
  if (minimal) {
    return (
      <div className="contain-card rounded-2xl bg-bg-card px-4 py-4">
        {/* Main row: icon + temp + stats */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon icon={weatherIcon(weatherState, isNight)} width={48} />
            <div>
              <div className="text-3xl font-light tabular-nums leading-none">
                {outdoorTemp !== null ? `${outdoorTemp.toFixed(1)}°` : "—"}
              </div>
              <div className="text-xs text-text-secondary mt-0.5">{conditionLabel(weatherState)}</div>
              {(forecastHigh !== null || forecastLow !== null) && (
                <div className="text-[11px] text-text-dim tabular-nums">
                  {forecastHigh !== null && `${Math.round(forecastHigh)}°`}
                  {forecastHigh !== null && forecastLow !== null && " / "}
                  {forecastLow !== null && `${Math.round(forecastLow)}°`}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-text-secondary">
            {humidity !== null && (
              <span className="flex items-center gap-1">
                <Icon icon="meteocons:humidity" width={14} />
                {Math.round(humidity)}%
              </span>
            )}
            {windSpeed != null && (
              <span className="flex items-center gap-1">
                <Icon icon="meteocons:wind" width={14} />
                {(windSpeed / 3.6).toFixed(1)} m/s
                {windBearing != null && (
                  <Icon icon="mdi:navigation" width={11} className="text-text-dim" style={{ transform: `rotate(${windBearing}deg)` }} />
                )}
              </span>
            )}
            {uvIndex != null && uvIndex > 0 && (
              <span className={`flex items-center gap-1 ${uvIndex >= 6 ? "text-accent-warm" : "text-text-dim"}`}>
                <Icon icon="mdi:sun-wireless" width={13} />
                UV {uvIndex.toFixed(0)}
              </span>
            )}
            {(() => {
              const rain = dailyForecast[0]?.precipitation;
              return rain != null && rain > 0 ? (
                <span className="flex items-center gap-1 text-accent-cool">
                  <Icon icon="meteocons:rain" width={13} />
                  {rain.toFixed(1)} mm
                </span>
              ) : null;
            })()}
            {apparentTemp != null && (
              <span className="flex items-center gap-1 text-text-dim">
                <Icon icon="mdi:thermometer-lines" width={13} />
                Føles {Math.round(apparentTemp)}°
              </span>
            )}
            {loadW > 0 && (
              <span className="flex items-center gap-1 text-text-dim">
                <Icon icon="mdi:home-lightning-bolt" width={13} />
                {formatPower(loadW)}
              </span>
            )}
          </div>
        </div>

        {/* Sun/moon + forecast toggle row */}
        <div className="mt-3 flex items-center justify-between text-xs text-text-dim">
          <div className="flex items-center gap-3">
            {nextRising && (
              <span className="flex items-center gap-1">
                <Icon icon="mdi:weather-sunset-up" width={14} className="text-accent-warm" />
                {formatTime(nextRising)}
              </span>
            )}
            {nextSetting && (
              <span className="flex items-center gap-1">
                <Icon icon="mdi:weather-sunset-down" width={14} className="text-accent-warm/70" />
                {formatTime(nextSetting)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {recentLightning && (
              <span className="flex items-center gap-1 text-accent-warm animate-pulse">
                <Icon icon="mdi:lightning-bolt" width={13} />
                Lyn
              </span>
            )}
            {moonPhase && (
              <span className="flex items-center gap-1">
                <Icon icon={moonIcon(moonPhase)} width={13} />
                {moonPhaseLabel(moonPhase)}
                {moonIllum !== null && <span className="text-text-dim/60">· {Math.round(moonIllum)}%</span>}
              </span>
            )}
            {dailyForecast.length > 1 && (
              <button
                onClick={() => setShowDailyForecast((v) => !v)}
                className="flex items-center gap-0.5 rounded-lg bg-white/5 px-2 py-1 text-[11px] transition-colors hover:bg-white/10"
              >
                Varsel
                <Icon icon={showDailyForecast ? "mdi:chevron-up" : "mdi:chevron-down"} width={13} />
              </button>
            )}
          </div>
        </div>

        {/* Daily forecast — collapsible */}
        {showDailyForecast && dailyForecast.length > 1 && (
          <div className="mt-3 border-t border-white/5 pt-3 space-y-1.5">
            {dailyForecast.slice(1, 6).map((d) => {
              const date = new Date(d.datetime);
              const prob = d.precipitation_probability;
              return (
                <div key={d.datetime} className="flex items-center gap-3">
                  <span className="w-7 text-xs text-text-dim capitalize">{DAY_NO[date.getDay()]}</span>
                  <Icon icon={weatherIcon(d.condition, false)} width={20} className="shrink-0" />
                  <span className="flex-1 text-xs flex items-center gap-1.5">
                    {prob > 0 && <span className="text-accent-cool">{Math.round(prob)}%</span>}
                    {d.precipitation > 0 && <span className="text-text-dim">{d.precipitation.toFixed(1)} mm</span>}
                  </span>
                  <span className="text-xs text-text-dim tabular-nums">
                    {d.templow !== undefined ? `${Math.round(d.templow)}°` : "—"}
                  </span>
                  <span className="w-8 text-right text-xs font-medium tabular-nums">
                    {Math.round(d.temperature)}°
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="contain-card rounded-2xl bg-bg-card p-5">
      {/* Weather row */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: energy info */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
          {/* Boiler */}
          <span className="flex items-center gap-1">
            <Icon
              icon="ph:fire-duotone"
              width={15}
              className={boilerActive ? "" : "text-text-dim"}
              style={boilerActive ? { animation: "glow-warm 2s ease-in-out infinite" } : undefined}
            />
            {boilerActive && boilerSessionMs > 0 && (
              <span className="tabular-nums">{formatDuration(boilerSessionMs)}</span>
            )}
            {!boilerActive && <span className="text-text-dim">off</span>}
          </span>

          {/* Solar production */}
          {solarW > 50 && (
            <span className="flex items-center gap-1">
              <Icon icon="mdi:solar-power" width={14} className="text-accent-warm" />
              <span className="text-accent-warm">{formatPower(solarW)}</span>
            </span>
          )}

          {/* House load */}
          <span className="flex items-center gap-1">
            <Icon icon="mdi:home-lightning-bolt" width={14} className="text-text-dim" />
            {formatPower(loadW)}
          </span>

          {/* Charger load (only when charging) */}
          {isCharging && (
            <span className="flex items-center gap-1">
              <Icon icon="mdi:ev-station" width={14} className="text-accent-green" />
              <span className="text-accent-green">{formatPower(chargerW)}</span>
            </span>
          )}

          {/* Car battery */}
          {batteryLevel !== null && (
            <span className="flex items-center gap-1">
              <Icon
                icon="bi:ev-front-fill"
                width={14}
                className={isEvCharging ? "text-accent-green" : "text-text-dim"}
                style={isEvCharging ? { animation: "glow-cool 2s ease-in-out infinite" } : undefined}
              />
              <span className={isEvCharging ? "text-accent-green tabular-nums" : "tabular-nums"}>
                {Math.round(batteryLevel)}%
              </span>
            </span>
          )}
        </div>

        {/* Right: weather summary — two columns, top-aligned */}
        <div className="flex shrink-0 items-start gap-2.5">
          <div className="flex flex-col items-end">
            <div className="text-2xl font-light tabular-nums leading-[48px]">
              {outdoorTemp !== null ? `${outdoorTemp.toFixed(1)}°` : "—"}
            </div>
            {(forecastHigh !== null || forecastLow !== null) && (
              <div className="text-[11px] text-text-secondary tabular-nums">
                {forecastHigh !== null && <span>{Math.round(forecastHigh)}°</span>}
                {forecastHigh !== null && forecastLow !== null && <span> / </span>}
                {forecastLow !== null && <span>{Math.round(forecastLow)}°</span>}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center">
            <Icon
              icon={weatherIcon(weatherState, isNight)}
              width={48}
            />
            <div className="text-[10px] text-text-secondary">
              {conditionLabel(weatherState)}
            </div>
          </div>
        </div>
      </div>

      {/* Weather stats rows */}
      <div className="mt-2 space-y-1.5">
        {/* Primary row: temp feel, humidity, wind */}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-text-secondary">
          {apparentTemp != null && (
            <span className="flex items-center gap-1">
              <Icon icon="mdi:thermometer-lines" width={14} className="text-text-dim" />
              Føles {Math.round(apparentTemp)}°
            </span>
          )}
          {humidity !== null && (
            <span className="flex items-center gap-1">
              <Icon icon="meteocons:humidity" width={18} />
              {Math.round(humidity)}%
            </span>
          )}
          {windSpeed != null && (
            <span className="flex items-center gap-1">
              <Icon icon="meteocons:wind" width={18} />
              {(windSpeed / 3.6).toFixed(1)}
              {windGust != null && windGust > windSpeed + 2 && (
                <span className="text-text-dim"> ({(windGust / 3.6).toFixed(1)})</span>
              )} m/s
              {windBearing != null && (
                <Icon
                  icon="mdi:navigation"
                  width={12}
                  className="text-text-dim"
                  style={{ transform: `rotate(${windBearing}deg)` }}
                />
              )}
            </span>
          )}
        </div>
        {/* Secondary row: UV, rain, visibility, cloud, pressure */}
        {(() => {
          const todayRain = dailyForecast[0]?.precipitation;
          const nextHourRain = forecastSlice.find((e) => e.precipitation > 0)?.precipitation;
          const rain = todayRain != null && todayRain > 0 ? todayRain : (nextHourRain ?? null);
          const hasAny = pressure !== null || uvIndex != null || visibility != null || cloudCoverage != null || dailyForecast.length > 0;
          if (!hasAny) return null;
          return (
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-text-dim">
              {pressure !== null && (
                <span className="flex items-center gap-1">
                  <Icon icon="meteocons:barometer" width={16} />
                  {Math.round(pressure)} hPa
                </span>
              )}
              {uvIndex != null && (
                <span className={`flex items-center gap-1 ${uvIndex === 0 ? "opacity-40" : uvIndex >= 6 ? "text-accent-warm" : ""}`}>
                  <Icon icon="mdi:sun-wireless" width={14} />
                  UV {uvIndex.toFixed(0)}
                </span>
              )}
              {rain != null && rain > 0 ? (
                <span className="flex items-center gap-1 text-accent-cool">
                  <Icon icon="meteocons:rain" width={14} />
                  {rain.toFixed(1)} mm
                </span>
              ) : dailyForecast.length > 0 ? (
                <span className="flex items-center gap-1 opacity-40">
                  <Icon icon="meteocons:rain" width={14} />
                  0 mm
                </span>
              ) : null}
              {visibility != null && (
                <span className="flex items-center gap-1">
                  <Icon icon="mdi:eye-outline" width={14} />
                  {visibility >= 10 ? `${visibility.toFixed(0)} km` : `${visibility.toFixed(1)} km`}
                </span>
              )}
              {cloudCoverage != null && (
                <span className="flex items-center gap-1">
                  <Icon icon="mdi:cloud-outline" width={14} />
                  {Math.round(cloudCoverage)}%
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Hourly forecast — always visible */}
      {forecastSlice.length > 0 && (
        <HourlyForecast entries={forecastSlice} />
      )}

      {/* Daily forecast dropdown */}
      {dailyForecast.length > 1 && (
        <div className="mt-1">
          <button
            onClick={() => setShowFullDailyForecast((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-bg-elevated px-3 py-2 text-xs transition-colors hover:bg-white/10"
          >
            <span className="text-text-dim">Varseldager</span>
            <div className="flex items-center gap-1 text-text-dim">
              <span>
                {showFullDailyForecast ? "Skjul" : `${Math.round(dailyForecast[1]?.temperature ?? 0)}° / ${Math.round(dailyForecast[1]?.templow ?? 0)}° i morgen`}
              </span>
              <Icon icon={showFullDailyForecast ? "mdi:chevron-up" : "mdi:chevron-down"} width={13} />
            </div>
          </button>
          {showFullDailyForecast && (
            <div className="mt-2 space-y-1.5">
              {dailyForecast.slice(1, 8).map((d) => {
                const date = new Date(d.datetime);
                const prob = d.precipitation_probability;
                return (
                  <div key={d.datetime} className="flex items-center gap-3 rounded-xl bg-bg-elevated px-3 py-2">
                    <span className="w-7 text-xs text-text-dim capitalize">{DAY_NO[date.getDay()]}</span>
                    <Icon icon={weatherIcon(d.condition, false)} width={20} className="shrink-0" />
                    <span className="flex-1 text-xs">
                      {prob > 0 && <span className="text-accent-cool">{Math.round(prob)}%</span>}
                      {d.precipitation > 0 && (
                        <span className="text-text-dim ml-1">{d.precipitation.toFixed(1)} mm</span>
                      )}
                    </span>
                    <span className="text-xs text-text-dim tabular-nums">
                      {d.templow !== undefined ? `${Math.round(d.templow)}°` : "—"}
                    </span>
                    <span className="w-8 text-right text-xs font-medium tabular-nums">
                      {Math.round(d.temperature)}°
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sun, Moon & Lightning row */}
      {(nextRising || nextSetting || moonPhase || recentLightning) && (
        <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-3">
          {/* Sol */}
          {(nextRising || nextSetting || sunElevation != null) && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">Sol</div>
              {sunElevation != null && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Icon icon="mdi:angle-acute" width={14} className={sunElevation > 0 ? "text-accent-warm" : "text-text-dim"} />
                  <span className="text-text-secondary">Høyde</span>
                  <span className="tabular-nums font-medium ml-auto">
                    {sunElevation.toFixed(1)}°
                    {sunAzimuth != null && <span className="text-text-dim ml-1">· {Math.round(sunAzimuth)}° az</span>}
                  </span>
                </div>
              )}
              {nextRising && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Icon icon="mdi:weather-sunset-up" width={14} className="text-accent-warm" />
                  <span className="text-text-secondary">Soloppgang</span>
                  <span className="tabular-nums font-medium ml-auto">{formatTime(nextRising)}</span>
                </div>
              )}
              {nextSetting && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Icon icon="mdi:weather-sunset-down" width={14} className="text-accent-warm/70" />
                  <span className="text-text-secondary">Solnedgang</span>
                  <span className="tabular-nums font-medium ml-auto">{formatTime(nextSetting)}</span>
                </div>
              )}
            </div>
          )}

          {/* Måne */}
          {moonPhase && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">Måne</div>
              <div className="flex items-center gap-1.5 text-xs">
                <Icon icon={moonIcon(moonPhase)} width={14} className="text-text-secondary" />
                <span className="text-text-secondary capitalize">{moonPhaseLabel(moonPhase)}</span>
                {moonIllum !== null && (
                  <span className="tabular-nums font-medium ml-auto">{Math.round(moonIllum)}%</span>
                )}
              </div>
            </div>
          )}

          {/* Lyn */}
          {recentLightning && (
            <div className="col-span-2 space-y-1">
              <div className="flex items-center gap-1.5 rounded-xl bg-accent-warm/10 border border-accent-warm/20 px-3 py-2">
                <Icon icon="mdi:lightning-bolt" width={16} className="text-accent-warm" />
                <span className="text-xs font-medium text-accent-warm">Lyn registrert</span>
                {lightningMinAgo !== null && (
                  <span className="text-xs text-text-dim ml-1">for {lightningMinAgo} min siden</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pollen */}
      <PollenSection entities={entities} />
    </div>
  );
}

const POLLEN_LEVEL: Record<string, { label: string; color: string }> = {
  "Svært lav": { label: "Svært lav", color: "text-accent-green" },
  "Lav":       { label: "Lav",       color: "text-accent-green" },
  "Moderat":   { label: "Moderat",   color: "text-accent-warm" },
  "Høy":       { label: "Høy",       color: "text-accent-red" },
  "Svært høy": { label: "Svært høy", color: "text-accent-red" },
};

function PollenSection({ entities }: { entities: HassEntities }) {
  const active = POLLEN_SENSORS.filter(
    (p) => entities[p.entity]?.state && entities[p.entity]?.state !== "No Data" && entities[p.entity]?.state !== "unavailable",
  );
  if (active.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim mb-2">Pollen</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {active.map((p) => {
          const state = entities[p.entity]?.state ?? "";
          const meta  = POLLEN_LEVEL[state] ?? { label: state, color: "text-text-dim" };
          return (
            <div key={p.entity} className="flex items-center gap-1.5 text-xs">
              <span className="text-text-secondary">{p.label}</span>
              <span className={`font-medium text-[11px] ${meta.color}`}>{meta.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourlyForecast({ entries }: { entries: ForecastEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, [entries.length]);

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  return (
    <div className="relative mt-3 -mx-1">
      {/* Left fade + arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-0 bottom-0 z-10 flex w-7 items-center justify-center bg-linear-to-r from-bg-card to-transparent"
        >
          <Icon icon="mdi:chevron-left" width={18} className="text-text-dim" />
        </button>
      )}

      {/* Scrollable forecast strip */}
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto px-1 scrollbar-none"
      >
        {entries.map((entry) => {
          const hour = new Date(entry.datetime).getHours();
          const entryIsNight = hour >= 21 || hour < 6;
          return (
            <div
              key={entry.datetime}
              className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2.5 py-2 text-xs"
            >
              <span className="text-text-dim">
                {hour.toString().padStart(2, "0")}
              </span>
              <Icon
                icon={weatherIcon(entry.condition, entryIsNight)}
                width={28}
              />
              <span className="font-medium tabular-nums">
                {Math.round(entry.temperature)}°
              </span>
              {entry.precipitation_probability > 0 && (
                <span className="text-[10px] text-blue-400 tabular-nums">
                  {Math.round(entry.precipitation_probability)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Right fade + arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-0 bottom-0 z-10 flex w-7 items-center justify-center bg-linear-to-l from-bg-card to-transparent"
        >
          <Icon icon="mdi:chevron-right" width={18} className="text-text-dim" />
        </button>
      )}
    </div>
  );
}

