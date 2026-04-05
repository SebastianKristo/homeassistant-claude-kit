import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../lib/format";
import { KOMFORTTEMP, BORTE_TEMP, SOMMERMODUS_TEMP } from "../lib/entities";

// ── Klimaenheter på Oslo ───────────────────────────────────────────────────
const HEATING_MODE      = "input_select.heating_mode";
const CLIMATE_AUTOMATIONS = [
  "automation.klimastyring_master_toggle",
  "automation.klimamodus_master_synkronisering_klimastyring_claude",
];

const CLIMATE_ROOMS = [
  { entity: "climate.stue_panelovn",       label: "Stue (panelovn)" },
  { entity: "climate.stue_oljefyr",        label: "Stue (oljefyr)" },
  { entity: "climate.kjokken_panelovn",    label: "Kjøkken (panelovn)" },
  { entity: "climate.kjokken_gulvvarme",   label: "Kjøkken (gulvvarme)" },
  { entity: "climate.bad_gulvvarme",       label: "Bad" },
  { entity: "climate.do_gulvvarme",        label: "Do" },
  { entity: "climate.vaskegang_gulvvarme", label: "Vaskegang" },
  { entity: "climate.trappegang_panelovn", label: "Trappegang" },
];

const BEDROOM_ROOMS = [
  {
    name: "Sebastian",
    tempEntity: "",
    climateEntity: "climate.sebastian_panelovn",
    powerEntity: "",
    manualMode: "input_boolean.sebastian_manual_mode",
  },
  {
    name: "Cybele",
    tempEntity: "",
    climateEntity: "climate.cybele_panelovn",
    powerEntity: "",
    manualMode: "",
  },
  {
    name: "Rune",
    tempEntity: "",
    climateEntity: "climate.trappegang_panelovn",
    powerEntity: "",
    manualMode: "",
  },
];

const PRESENCE_MODES_OSLO = [
  { value: "Komfort", label: "Komfort",  icon: "mdi:home-thermometer",    color: "text-accent-cool",  desc: "Normal oppvarming" },
  { value: "Økonomi", label: "Økonomi",  icon: "mdi:piggy-bank-outline",  color: "text-accent-green", desc: "Litt lavere temperatur" },
  { value: "Borte",   label: "Borte",    icon: "mdi:home-export-outline", color: "text-text-dim",     desc: "Sparmodus" },
  { value: "Sommer",  label: "Sommer",   icon: "mdi:weather-sunny",       color: "text-accent-warm",  desc: "Minimal oppvarming" },
];

// ── Stepper for input_number ───────────────────────────────────────────────
function NumberStepper({
  label, entityId, entities, connection, step = 0.5, unit = "°",
}: {
  label: string; entityId: string; entities: HassEntities;
  connection: Connection | null; step?: number; unit?: string;
}) {
  const entity = entities[entityId];
  const value  = parseNumericState(entity?.state);
  const min    = parseNumericState(entity?.attributes?.min as string | undefined) ?? 0;
  const max    = parseNumericState(entity?.attributes?.max as string | undefined) ?? 100;
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const set = (next: number) => {
    if (!connection) return;
    const clamped = Math.min(max, Math.max(min, Math.round(next * 100) / 100));
    callService(connection, "input_number", "set_value", { value: clamped }, { entity_id: entityId });
  };

  const commitEdit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) set(parsed);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-3 py-2.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => value !== null && set(value - step)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-text-secondary hover:bg-white/14 active:scale-95 transition-transform"
        >
          <Icon icon="mdi:minus" width={12} />
        </button>

        {editing ? (
          <input
            type="number"
            value={inputVal}
            step={step}
            min={min}
            max={max}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={(e) => commitEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit(e.currentTarget.value);
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            className="w-16 text-center text-sm font-semibold tabular-nums bg-bg-card border border-accent rounded-lg px-1 py-0.5 outline-none"
          />
        ) : (
          <button
            onClick={() => { setEditing(true); setInputVal(String(value ?? "")); }}
            className="w-14 text-center text-sm font-semibold tabular-nums hover:text-accent transition-colors"
          >
            {value !== null ? `${value.toFixed(step < 1 ? 1 : 0)}${unit}` : "—"}
          </button>
        )}

        <button
          onClick={() => value !== null && set(value + step)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-text-secondary hover:bg-white/14 active:scale-95 transition-transform"
        >
          <Icon icon="mdi:plus" width={12} />
        </button>
      </div>
    </div>
  );
}

export function ClimateView() {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  // ── Tilstedemodus (input_select.heating_mode) ─────────────────────────
  const presenceValue = entities[HEATING_MODE]?.state ?? "Komfort";

  const setPresence = (value: string) => {
    if (!connection) return;
    callService(connection, "input_select", "select_option", { option: value }, { entity_id: HEATING_MODE });
  };

  // ── Master toggle — klimaautomatiseringer ─────────────────────────────
  const automationsOn = CLIMATE_AUTOMATIONS.some(
    (id) => entities[id]?.state === "on"
  );

  const toggleAutomations = () => {
    if (!connection) return;
    const svc = automationsOn ? "turn_off" : "turn_on";
    CLIMATE_AUTOMATIONS.forEach((id) =>
      callService(connection, "automation", svc, undefined, { entity_id: id })
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">

      {/* ── Master toggle ── */}
      <button
        onClick={toggleAutomations}
        className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-colors ${
          automationsOn
            ? "bg-accent-cool/10 ring-1 ring-accent-cool/25"
            : "bg-bg-card hover:bg-bg-elevated"
        }`}
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          automationsOn ? "bg-accent-cool/20" : "bg-white/6"
        }`}>
          <Icon icon="mdi:robot-outline" width={22} className={automationsOn ? "text-accent-cool" : "text-text-dim"} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Klimaautomatisering</div>
          <div className={`text-xs ${automationsOn ? "text-accent-cool" : "text-text-dim"}`}>
            {automationsOn ? "Aktiv — styrer alle enheter" : "Deaktivert — manuell styring"}
          </div>
        </div>
        <div className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          automationsOn ? "bg-accent-cool" : "bg-white/12"
        }`}>
          <div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
            automationsOn ? "left-6" : "left-1"
          }`} />
        </div>
      </button>

      {/* ── Tilstedemodus (input_select.heating_mode) ── */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Tilstedemodus</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PRESENCE_MODES_OSLO.map((m) => {
            const isActive = m.value === presenceValue;
            return (
              <button
                key={m.value}
                onClick={() => setPresence(m.value)}
                className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isActive ? "bg-accent/15 ring-1 ring-accent/30" : "bg-bg-elevated hover:bg-white/8"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon icon={m.icon} width={16} className={isActive ? m.color : "text-text-dim"} />
                  <span className={`text-sm font-medium ${isActive ? m.color : "text-text-dim"}`}>
                    {m.label}
                  </span>
                </div>
                <span className={`text-[11px] ${isActive ? "text-text-secondary" : "text-text-dim/60"}`}>
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Temperaturmål ── */}
      <div className="rounded-2xl bg-bg-card p-4 space-y-3">
        <span className="text-sm font-medium">Temperaturmål</span>
        <div className="space-y-2">
          <NumberStepper label="Komforttemp"  entityId={KOMFORTTEMP}    entities={entities} connection={connection} step={0.5} />
          <NumberStepper label="Borte-temp"   entityId={BORTE_TEMP}     entities={entities} connection={connection} step={0.5} />
          <NumberStepper label="Sommer-temp"  entityId={SOMMERMODUS_TEMP} entities={entities} connection={connection} step={0.5} />
        </div>
      </div>

      {/* ── Soverom & romtemperaturer ── */}
      <div className="rounded-2xl bg-bg-card p-4 space-y-3">
        <span className="text-sm font-medium">Temperaturer</span>
        <div className="space-y-1.5">
          {/* Soverom med temperaturmåler */}
          {BEDROOM_ROOMS.map(({ name, tempEntity, climateEntity, powerEntity, manualMode }) => {
            const temp    = parseNumericState(entities[tempEntity]?.state);
            const climate = climateEntity ? entities[climateEntity] : undefined;
            const target  = climate ? parseNumericState(climate.attributes?.temperature as string | undefined) : null;
            const isHeatingClimate = climate?.state === "heat";
            const powerW  = powerEntity && !powerEntity.startsWith("binary_sensor.")
              ? parseNumericState(entities[powerEntity]?.state)
              : null;
            const binaryOn = powerEntity.startsWith("binary_sensor.")
              ? entities[powerEntity]?.state === "on"
              : null;
            const isHeating = isHeatingClimate || (powerW !== null && powerW > 10) || binaryOn === true;
            const manualOn  = manualMode ? entities[manualMode]?.state === "on" : null;

            const toggleManual = () => {
              if (!connection || !manualMode) return;
              callService(connection, "input_boolean", "toggle", undefined, { entity_id: manualMode });
            };

            return (
              <div key={name} className="rounded-xl bg-bg-elevated px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon
                      icon={isHeating ? "mdi:radiator" : "mdi:radiator-off"}
                      width={15}
                      className={isHeating ? "text-accent-warm" : "text-text-dim"}
                    />
                    <span className="text-sm text-text-secondary">{name}</span>
                    <span className="text-[10px] text-text-dim/60">soverom</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {target !== null && (
                      <span className="text-xs text-text-dim">→ {target.toFixed(1)}°</span>
                    )}
                    {powerW !== null && powerW > 10 && (
                      <span className="text-xs text-text-dim tabular-nums">{Math.round(powerW)} W</span>
                    )}
                    <span className={`text-sm font-semibold tabular-nums ${
                      isHeating ? "text-accent-warm" : "text-text-secondary"
                    }`}>
                      {temp !== null ? `${temp.toFixed(1)}°` : "—"}
                    </span>
                  </div>
                </div>
                {manualOn !== null && (
                  <button
                    onClick={toggleManual}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      manualOn ? "bg-accent-warm/15 text-accent-warm" : "bg-white/5 text-text-dim hover:bg-white/8"
                    }`}
                  >
                    <span>Manuell overstyring</span>
                    <div className={`relative h-5 w-9 rounded-full transition-colors ${manualOn ? "bg-accent-warm" : "bg-white/12"}`}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${manualOn ? "left-4.5" : "left-0.5"}`} />
                    </div>
                  </button>
                )}
              </div>
            );
          })}

          {/* Romtermostater */}
          {CLIMATE_ROOMS.map(({ entity, label }) => {
            const e = entities[entity];
            if (!e || e.state === "unavailable" || e.state === "unknown") return null;
            const current = parseNumericState(e.attributes?.current_temperature as string | undefined);
            const target  = parseNumericState(e.attributes?.temperature as string | undefined);
            const mode    = e.state;
            const isHeating = mode === "heat";
            const isOff     = mode === "off";

            return (
              <div key={entity} className="flex items-center justify-between rounded-xl bg-bg-elevated px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Icon
                    icon={isHeating ? "mdi:radiator" : "mdi:radiator-off"}
                    width={15}
                    className={isHeating ? "text-accent-warm" : "text-text-dim"}
                  />
                  <span className="text-sm text-text-secondary">{label}</span>
                </div>
                <div className="flex items-center gap-3">
                  {target !== null && (
                    <span className="text-xs text-text-dim">→ {target.toFixed(1)}°</span>
                  )}
                  <span className={`text-sm font-semibold tabular-nums ${
                    isOff ? "text-text-dim" : current !== null && target !== null && current >= target - 0.5
                      ? "text-accent-green"
                      : "text-accent-warm"
                  }`}>
                    {current !== null ? `${current.toFixed(1)}°` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-20" />
    </div>
  );
}
