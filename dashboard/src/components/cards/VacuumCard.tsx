import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { parseNumericState, formatPower, toWatts } from "../../lib/format";
import type { VacuumConfig } from "../../lib/entities";

/* ── Movement state metadata ─────────────────────────────────── */

const MOVEMENT_META: Record<string, { label: string; color: string; icon: string }> = {
  cleaning:    { label: "Cleaning",          color: "text-accent",         icon: "mdi:robot-vacuum" },
  homing:      { label: "Returning to dock", color: "text-accent-cool",    icon: "mdi:home-import-outline" },
  charging:    { label: "Charging",          color: "text-accent-green",   icon: "mdi:battery-charging" },
  idle:        { label: "Idle",              color: "text-text-secondary",  icon: "mdi:robot-vacuum" },
  pause:       { label: "Paused",            color: "text-accent-warm",    icon: "mdi:pause-circle" },
  washing_mop: { label: "Washing mop",       color: "text-accent-cool",    icon: "mdi:water" },
  alarm:       { label: "Error",             color: "text-accent-red",     icon: "mdi:alert-circle" },
  reserve:     { label: "Scheduled",         color: "text-text-secondary",  icon: "mdi:clock-outline" },
  point:       { label: "Spot cleaning",     color: "text-accent",         icon: "mdi:target" },
  after:       { label: "Finished",          color: "text-accent-green",   icon: "mdi:check-circle" },
  off:         { label: "Off",               color: "text-text-dim",       icon: "mdi:power" },
  // Vacuum entity states (fallback when movement sensor is empty)
  docked:      { label: "Dokket",            color: "text-accent-green",   icon: "mdi:battery-charging" },
  returning:   { label: "Returnerer",        color: "text-accent-cool",    icon: "mdi:home-import-outline" },
  error:       { label: "Feil",              color: "text-accent-red",     icon: "mdi:alert-circle" },
  unavailable: { label: "Utilgjengelig",     color: "text-text-dim",       icon: "mdi:robot-vacuum-off" },
  unknown:     { label: "Ukjent",            color: "text-text-dim",       icon: "mdi:robot-vacuum-off" },
};

const DEFAULT_META = { label: "Unknown", color: "text-text-dim", icon: "mdi:robot-vacuum-off" };

/* ── Turbo mode labels ───────────────────────────────────────── */

const TURBO_LABELS: Record<string, string> = {
  on: "Turbo",
  off: "Normal",
  silence: "Quiet",
  extra_silence: "Silent",
};

/* ── Cleaning mode labels ────────────────────────────────────── */

const MODE_LABELS: Record<string, string> = {
  auto: "Auto",
  part: "Partial",
  repeat: "Repeat",
  manual: "Manual",
  stop: "Stopped",
  map: "Map",
};

/* ── Action button config ────────────────────────────────────── */

interface ActionDef {
  label: string;
  icon: string;
  service: string;
  visible: (vacState: string) => boolean;
}

/**
 * Action visibility is driven by the movement sensor (not vacuum state,
 * which is permanently "unknown" on SmartThings).
 */
const ACTIONS: ActionDef[] = [
  {
    label: "Start",
    icon: "mdi:play",
    service: "start",
    visible: (m) => ["charging", "idle", "pause", "after", "off", "reserve"].includes(m),
  },
  {
    label: "Pause",
    icon: "mdi:pause",
    service: "pause",
    visible: (m) => ["cleaning", "homing", "point"].includes(m),
  },
  {
    label: "Dock",
    icon: "mdi:home",
    service: "return_to_base",
    visible: (m) => ["cleaning", "pause", "idle", "point", "after", "alarm"].includes(m),
  },
  {
    label: "Spot",
    icon: "mdi:target",
    service: "clean_spot",
    visible: (m) => ["charging", "idle", "after"].includes(m),
  },
  {
    label: "Find",
    icon: "mdi:map-marker-radius",
    service: "locate",
    visible: () => true,
  },
];

interface VacuumCardProps {
  config: VacuumConfig;
  onOpen?: () => void;
}

/* ── Main component ──────────────────────────────────────────── */

export function VacuumCard({ config, onOpen }: VacuumCardProps) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection);

  const battery = parseNumericState(entities[config.battery]?.state);
  const movementRaw  = config.movement ? entities[config.movement]?.state : undefined;
  // Fall back to vacuum entity state when movement sensor not configured
  const vacuumState  = entities[config.vacuum]?.state;
  const movement     = movementRaw ?? vacuumState ?? "idle";
  const cleaningMode = config.cleaningMode ? (entities[config.cleaningMode]?.state ?? "auto") : "";
  const turboMode    = config.turboMode    ? (entities[config.turboMode]?.state    ?? "off")  : "";
  const lampState    = config.lamp         ? (entities[config.lamp]?.state         ?? "off")  : "off";
  const powerE       = config.power ? entities[config.power] : undefined;
  const powerW       = powerE ? toWatts(powerE?.state, powerE?.attributes?.unit_of_measurement as string) : null;

  const meta = MOVEMENT_META[movement] ?? DEFAULT_META;
  const isUnavailable = !vacuumState || vacuumState === "unavailable" || vacuumState === "unknown";
  const isActive = movement === "cleaning" || movement === "point";
  const isCharging = movement === "charging";

  const handleAction = (service: string) => {
    if (!connection) return;
    callService(connection, "vacuum", service, {}, { entity_id: config.vacuum });
  };

  const handleLampToggle = () => {
    if (!connection) return;
    callService(
      connection,
      "select",
      "select_option",
      { option: lampState === "on" ? "off" : "on" },
      { entity_id: config.lamp },
    );
  };

  const visibleActions = isUnavailable
    ? []
    : ACTIONS.filter((a) => a.visible(movement));

  return (
    <div
      className={`rounded-2xl bg-bg-card p-4 ${isUnavailable ? "opacity-50" : ""}`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            icon="mdi:robot-vacuum"
            width={22}
            className={isActive ? "text-accent" : "text-text-secondary"}
          />
          <span className="font-medium text-text-primary">
            {entities[config.vacuum]?.attributes?.friendly_name ?? "Vacuum"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
            <Icon icon={meta.icon} width={14} />
            {meta.label}
            {isActive && (
              <span className="relative ml-0.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
            )}
          </span>
          {onOpen && (
            <button
              onClick={onOpen}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-text-dim hover:bg-white/12 transition-colors"
            >
              <Icon icon="mdi:arrow-expand" width={13} />
            </button>
          )}
        </div>
      </div>

      {/* Battery bar + power */}
      <div className="mb-3 flex items-center gap-3 rounded-xl bg-bg-elevated px-3 py-2">
        <Icon
          icon={
            isCharging
              ? "mdi:battery-charging"
              : battery !== null && battery <= 20
                ? "mdi:battery-low"
                : "mdi:battery"
          }
          width={16}
          className={
            isCharging
              ? "text-accent-green"
              : battery !== null && battery <= 20
                ? "text-accent-red"
                : "text-text-secondary"
          }
        />
        <div className="relative flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-bg-primary">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                battery !== null && battery <= 20
                  ? "bg-accent-red"
                  : battery !== null && battery <= 50
                    ? "bg-accent-warm"
                    : "bg-accent-green"
              } ${isCharging ? "battery-charging" : ""}`}
              style={{ width: `${battery ?? 0}%` }}
            />
          </div>
        </div>
        <span className="min-w-[3ch] text-right text-xs font-medium text-text-primary">
          {battery !== null ? `${Math.round(battery)}%` : "—"}
        </span>
        {powerW !== null && powerW > 0 && (
          <span className="ml-1 text-xs text-text-dim">
            {formatPower(powerW)}
          </span>
        )}
      </div>

      {/* Controls + status chips — single row on desktop, stacked on mobile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Action buttons */}
        {visibleActions.length > 0 && (
          <div className="flex gap-2">
            {visibleActions.map((action) => (
              <motion.button
                key={action.service}
                whileTap={{ scale: 0.93 }}
                onClick={() => handleAction(action.service)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-bg-elevated px-3 py-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-elevated/80 active:bg-accent/20 sm:flex-initial"
              >
                <Icon icon={action.icon} width={15} />
                {action.label}
              </motion.button>
            ))}
          </div>
        )}

        {/* Status chips — only when configured */}
        {(cleaningMode || turboMode || config.lamp) && (
          <div className="flex items-center gap-2 text-xs sm:ml-auto">
            {cleaningMode && (
              <div className="flex items-center gap-1.5 rounded-lg bg-bg-elevated px-2.5 py-1.5">
                <Icon icon="mdi:broom" width={13} className="text-text-dim" />
                <span className="text-text-secondary">
                  {MODE_LABELS[cleaningMode] ?? cleaningMode}
                </span>
              </div>
            )}
            {turboMode && (
              <div className="flex items-center gap-1.5 rounded-lg bg-bg-elevated px-2.5 py-1.5">
                <Icon icon="mdi:fan" width={13} className="text-text-dim" />
                <span className="text-text-secondary">
                  {TURBO_LABELS[turboMode] ?? turboMode}
                </span>
              </div>
            )}
            {config.lamp && (
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={handleLampToggle}
                disabled={isUnavailable}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                  lampState === "on"
                    ? "bg-accent-warm/20 text-accent-warm"
                    : "bg-bg-elevated text-text-dim"
                }`}
              >
                <Icon
                  icon={lampState === "on" ? "mdi:flashlight" : "mdi:flashlight-off"}
                  width={13}
                />
                <span className="text-xs">Lamp</span>
              </motion.button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
