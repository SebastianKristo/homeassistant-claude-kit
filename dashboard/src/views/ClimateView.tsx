import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../lib/format";
import { KOMFORTTEMP, BORTE_TEMP, SOMMERMODUS_TEMP, AWAY_MODE, ANKOMMER_I_MORGEN, SOMMER_MODUS } from "../lib/entities";
import { PopoverSelect } from "../components/controls/PopoverSelect";

// ── Klimaenheter på Toten ──────────────────────────────────────────────────
const HEATING_MODE = "input_select.heating_mode";
const CLIMATE_AUTOMATIONS = [
  "automation.klima_synkroniser_innstillinger",
  "automation.klima_nullstill_ankommer_flagg_ved_ankomst",
];

const CLIMATE_ROOMS = [
  { entity: "climate.spisestue",                        label: "Stue / varmepumpe" },
  { entity: "climate.bad_toten_gulvvarme",              label: "Bad" },
  { entity: "climate.kjokken_toten_gulvvarme",          label: "Kjøkken" },
  { entity: "climate.inngang_gulvvarme",                label: "Inngang" },
  { entity: "climate.sebastian_panelovn_sebastian_panelovn", label: "Sebastian (panelovn)" },
];

const BEDROOM_ROOMS = [
  {
    name: "Sebastian",
    tempEntity: "sensor.sebastian_klimasensor_temperature",
    climateEntity: "climate.sebastian_panelovn_sebastian_panelovn",
    powerEntity: "sensor.sebastian_panelovn_stikkontakt_power",
  },
  {
    name: "Rune",
    tempEntity: "sensor.rune_klimasensor_temperatur",
    climateEntity: "",
    powerEntity: "",
  },
  {
    name: "Cybele",
    tempEntity: "sensor.cybele_klimasensor_temperature",
    climateEntity: "",
    powerEntity: "binary_sensor.cybele_soverom_power",
  },
];

const HEATING_MODE_META: Record<string, { label: string; icon: string; color: string }> = {
  Komfort: { label: "Komfort",  icon: "mdi:home-thermometer",    color: "text-accent-cool" },
  Økonomi: { label: "Økonomi",  icon: "mdi:piggy-bank-outline",  color: "text-accent-green" },
  Borte:   { label: "Borte",    icon: "mdi:home-export-outline", color: "text-text-dim" },
  Sommer:  { label: "Sommer",   icon: "mdi:weather-sunny",       color: "text-accent-warm" },
};

const PRESENCE_MODES = [
  { value: "hjemme",   label: "Hjemme",           icon: "mdi:home",                color: "text-accent-green" },
  { value: "ankommer", label: "Ankommer i morgen", icon: "mdi:home-clock",          color: "text-accent-cool" },
  { value: "sommer",   label: "Sommer-modus",      icon: "mdi:weather-sunny",       color: "text-accent-warm" },
  { value: "borte",    label: "Borte",             icon: "mdi:home-export-outline", color: "text-text-dim" },
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

  // ── Tilstedemodus (away_mode / ankommer / sommer) ──────────────────────
  const awayMode = entities[AWAY_MODE]?.state === "on";
  const ankommer = entities[ANKOMMER_I_MORGEN]?.state === "on";
  const sommer   = entities[SOMMER_MODUS]?.state === "on";

  const presenceValue = sommer ? "sommer" : ankommer ? "ankommer" : awayMode ? "borte" : "hjemme";;

  const setPresence = (value: string) => {
    if (!connection) return;
    const on  = (e: string) => callService(connection, "input_boolean", "turn_on",  undefined, { entity_id: e });
    const off = (e: string) => callService(connection, "input_boolean", "turn_off", undefined, { entity_id: e });
    if (value === "hjemme")   { off(AWAY_MODE); off(ANKOMMER_I_MORGEN); off(SOMMER_MODUS); }
    if (value === "ankommer") { off(AWAY_MODE); on(ANKOMMER_I_MORGEN);  off(SOMMER_MODUS); }
    if (value === "sommer")   { off(AWAY_MODE); off(ANKOMMER_I_MORGEN); on(SOMMER_MODUS);  }
    if (value === "borte")    { on(AWAY_MODE);  off(ANKOMMER_I_MORGEN); off(SOMMER_MODUS); }
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

  // ── Oppvarmingsmodus (input_select.heating_mode) ──────────────────────
  const heatingMode    = entities[HEATING_MODE]?.state ?? "Komfort";
  const heatingOptions = (entities[HEATING_MODE]?.attributes?.options as string[] | undefined) ?? Object.keys(HEATING_MODE_META);
  const heatingMeta    = HEATING_MODE_META[heatingMode] ?? { label: heatingMode, icon: "mdi:thermometer", color: "text-text-secondary" };

  const setHeatingMode = (option: string) => {
    if (!connection) return;
    callService(connection, "input_select", "select_option", { option }, { entity_id: HEATING_MODE });
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

      {/* ── Tilstedemodus ── */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Tilstedemodus</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PRESENCE_MODES.map((m) => {
            const isActive = m.value === presenceValue;
            return (
              <button
                key={m.value}
                onClick={() => setPresence(m.value)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isActive ? "bg-accent/15 ring-1 ring-accent/30" : "bg-bg-elevated hover:bg-white/8"
                }`}
              >
                <Icon icon={m.icon} width={16} className={isActive ? m.color : "text-text-dim"} />
                <span className={`text-sm font-medium ${isActive ? m.color : "text-text-dim"}`}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Oppvarmingsmodus (input_select) ── */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Icon icon={heatingMeta.icon} width={18} className={heatingMeta.color} />
            <div>
              <div className="text-sm font-medium">Oppvarmingsmodus</div>
              <div className={`text-xs ${heatingMeta.color}`}>{heatingMeta.label}</div>
            </div>
          </div>
          <PopoverSelect
            value={heatingMode}
            onSelect={setHeatingMode}
            items={heatingOptions.map((opt) => {
              const meta = HEATING_MODE_META[opt] ?? { label: opt, icon: "mdi:thermometer", color: "text-text-secondary" };
              return {
                value: opt,
                label: (
                  <span className="flex items-center gap-2">
                    <Icon icon={meta.icon} width={16} className={meta.color} />
                    <span>{meta.label}</span>
                  </span>
                ),
              };
            })}
            trigger={
              <button className="flex items-center gap-1.5 rounded-xl bg-bg-elevated px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10">
                <span className={heatingMeta.color}>{heatingMode}</span>
                <Icon icon="mdi:chevron-down" width={14} className="text-text-dim" />
              </button>
            }
            align="end"
            matchTriggerWidth={false}
          />
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
          {BEDROOM_ROOMS.map(({ name, tempEntity, climateEntity, powerEntity }) => {
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

            return (
              <div key={name} className="flex items-center justify-between rounded-xl bg-bg-elevated px-3 py-2.5">
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
