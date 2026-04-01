import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import { BottomSheet } from "./BottomSheet";

export interface ClimateZone {
  name: string;
  entityId: string;
}

interface ClimateZonePopupProps {
  zone: ClimateZone | null;
  onClose: () => void;
}

const HVAC_META: Record<string, { label: string; color: string; icon: string }> = {
  heating:  { label: "Varmer",  color: "text-accent-warm",  icon: "mdi:fire" },
  cooling:  { label: "Kjøler",  color: "text-accent-cool",  icon: "mdi:snowflake" },
  idle:     { label: "Inaktiv", color: "text-text-dim",     icon: "mdi:power-sleep" },
  off:      { label: "Av",      color: "text-text-dim",     icon: "mdi:power" },
};

function ClimateZoneContent({ zone, connection, entities }: {
  zone: ClimateZone;
  connection: Connection | null;
  entities: HassEntities;
}) {
  const entity = entities[zone.entityId];
  if (!entity) return <div className="p-5 text-text-dim text-sm">Entitet ikke funnet</div>;

  const currentTemp = parseNumericState(entity.attributes?.current_temperature as string | undefined);
  const targetTemp  = parseNumericState(entity.attributes?.temperature as string | undefined);
  const hvacAction  = (entity.attributes?.hvac_action as string | undefined) ?? "off";
  const isOff       = entity.state === "off";
  const isUnavailable = entity.state === "unavailable";
  const humidity    = parseNumericState(entity.attributes?.current_humidity as string | undefined);
  const minTemp     = parseNumericState(entity.attributes?.min_temp as string | undefined) ?? 5;
  const maxTemp     = parseNumericState(entity.attributes?.max_temp as string | undefined) ?? 30;
  const tempStep    = parseNumericState(entity.attributes?.target_temp_step as string | undefined) ?? 0.5;

  const meta = HVAC_META[isOff ? "off" : hvacAction] ?? HVAC_META.idle;

  const adjustTemp = (delta: number) => {
    if (!connection || targetTemp === null) return;
    const next = Math.min(maxTemp, Math.max(minTemp, Math.round((targetTemp + delta) * 2) / 2));
    callService(connection, "climate", "set_temperature", { temperature: next }, { entity_id: zone.entityId });
  };

  const togglePower = () => {
    if (!connection) return;
    callService(connection, "climate", isOff ? "turn_on" : "turn_off", undefined, { entity_id: zone.entityId });
  };

  const isHeating = hvacAction === "heating" && !isOff;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
      {/* Temperature hero */}
      <div className={`rounded-2xl p-5 text-center transition-colors ${
        isHeating ? "bg-amber-950/30 ring-1 ring-amber-500/20" : "bg-bg-card"
      }`}>
        <div className="text-[64px] font-light tabular-nums leading-none mb-1">
          {currentTemp !== null ? `${currentTemp.toFixed(1)}°` : "—"}
        </div>
        <div className="text-sm text-text-secondary">Romtemperatur</div>
        {humidity !== null && (
          <div className="mt-1.5 flex items-center justify-center gap-1 text-xs text-text-dim">
            <Icon icon="meteocons:humidity" width={14} />
            {Math.round(humidity)}% fuktighet
          </div>
        )}
      </div>

      {/* Status badge */}
      <div className="flex items-center justify-center">
        <span className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
          isHeating ? "bg-accent-warm/15 text-accent-warm"
          : isOff    ? "bg-white/6 text-text-dim"
          : "bg-white/8 text-text-secondary"
        }`}>
          <Icon icon={meta.icon} width={16} className={meta.color} />
          {meta.label}
        </span>
      </div>

      {/* Target temp control */}
      {!isOff && !isUnavailable && (
        <div className="rounded-2xl bg-bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-dim mb-4 text-center">
            Måltemperatur
          </div>
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => adjustTemp(-tempStep)}
              disabled={targetTemp !== null && targetTemp <= minTemp}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/8 text-text-secondary hover:bg-white/14 active:scale-90 transition-all disabled:opacity-30"
            >
              <Icon icon="mdi:minus" width={22} />
            </button>
            <div className="w-20 text-center">
              <div className="text-4xl font-semibold tabular-nums">
                {targetTemp !== null ? `${targetTemp.toFixed(1)}°` : "—"}
              </div>
            </div>
            <button
              onClick={() => adjustTemp(+tempStep)}
              disabled={targetTemp !== null && targetTemp >= maxTemp}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/8 text-text-secondary hover:bg-white/14 active:scale-90 transition-all disabled:opacity-30"
            >
              <Icon icon="mdi:plus" width={22} />
            </button>
          </div>
          {targetTemp !== null && currentTemp !== null && (
            <div className="mt-3 text-center text-xs text-text-dim">
              {(() => {
                const delta = currentTemp - targetTemp;
                if (Math.abs(delta) <= 0.3)
                  return <span className="text-accent-green">På mål</span>;
                return (
                  <span className={delta < 0 ? "text-accent-cool" : "text-accent-warm"}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}° fra mål
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Quick presets */}
      {!isOff && !isUnavailable && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-dim mb-2.5">Forhåndsinnstillinger</div>
          <div className="grid grid-cols-4 gap-2">
            {[15, 18, 20, 22].map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (!connection) return;
                  callService(connection, "climate", "set_temperature", { temperature: t }, { entity_id: zone.entityId });
                }}
                className={`rounded-xl py-2.5 text-sm font-medium transition-colors ${
                  targetTemp === t
                    ? "bg-accent/20 text-accent ring-1 ring-accent/30"
                    : "bg-bg-card text-text-secondary hover:bg-white/10"
                }`}
              >
                {t}°
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Power toggle */}
      {!isUnavailable && (
        <button
          onClick={togglePower}
          className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors ${
            isOff
              ? "bg-accent-warm/15 text-accent-warm hover:bg-accent-warm/25"
              : "bg-white/8 text-text-secondary hover:bg-white/12"
          }`}
        >
          {isOff ? "Slå på" : "Slå av"}
        </button>
      )}
    </div>
  );
}

export function ClimateZonePopup({ zone, onClose }: ClimateZonePopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  return (
    <BottomSheet open={zone !== null} onClose={onClose}>
      {zone && (
        <>
          <div className="flex items-center gap-3 px-5 pb-3 shrink-0 border-b border-white/5">
            <Icon icon="mdi:radiator" width={20} className="text-text-secondary" />
            <span className="text-base font-semibold">{zone.name}</span>
          </div>
          <ClimateZoneContent zone={zone} connection={connection} entities={entities} />
        </>
      )}
    </BottomSheet>
  );
}
