import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { BottomSheet } from "./BottomSheet";
import { parseNumericState, formatPower, toWatts } from "../../lib/format";
import type { VacuumConfig } from "../../lib/entities";

const MOVEMENT_META: Record<string, { label: string; color: string; icon: string }> = {
  cleaning:    { label: "Støvsug pågår",     color: "text-accent",        icon: "mdi:robot-vacuum" },
  homing:      { label: "Returnerer til dok", color: "text-accent-cool",   icon: "mdi:home-import-outline" },
  charging:    { label: "Lader",              color: "text-accent-green",  icon: "mdi:battery-charging" },
  idle:        { label: "Hviler",             color: "text-text-secondary", icon: "mdi:robot-vacuum" },
  pause:       { label: "Pauset",             color: "text-accent-warm",   icon: "mdi:pause-circle" },
  washing_mop: { label: "Vasker mopp",        color: "text-accent-cool",   icon: "mdi:water" },
  alarm:       { label: "Feil",               color: "text-accent-red",    icon: "mdi:alert-circle" },
  reserve:     { label: "Planlagt",           color: "text-text-secondary", icon: "mdi:clock-outline" },
  point:       { label: "Spotrengjøring",     color: "text-accent",        icon: "mdi:target" },
  after:       { label: "Ferdig",             color: "text-accent-green",  icon: "mdi:check-circle" },
  off:         { label: "Av",                 color: "text-text-dim",      icon: "mdi:power" },
};
const DEFAULT_META = { label: "Ukjent", color: "text-text-dim", icon: "mdi:robot-vacuum-off" };

const FAN_LABELS: Record<string, string> = {
  "101": "Stille",
  "102": "Balansert",
  "103": "Turbo",
  "104": "Maks",
  quiet: "Stille",
  balanced: "Balansert",
  turbo: "Turbo",
  max: "Maks",
  auto: "Auto",
  gentle: "Skånsom",
  standard: "Standard",
  strong: "Sterk",
};

interface VacuumPopupProps {
  open: boolean;
  onClose: () => void;
  config: VacuumConfig;
}

export function VacuumPopup({ open, onClose, config }: VacuumPopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  const [selectedRooms, setSelectedRooms] = useState<number[]>([]);

  const battery      = parseNumericState(entities[config.battery]?.state);
  const movementRaw  = entities[config.movement]?.state;
  const movement     = movementRaw ?? "idle";
  const fanSpeedRaw  = entities[config.cleaningMode]?.state ?? "auto";
  const fanOptions   = (entities[config.cleaningMode]?.attributes?.options as string[] | undefined) ?? [];
  const powerE       = entities[config.power];
  const powerW       = toWatts(powerE?.state, powerE?.attributes?.unit_of_measurement as string);
  const vacuumName   = entities[config.vacuum]?.attributes?.friendly_name as string | undefined;

  const meta         = MOVEMENT_META[movement] ?? DEFAULT_META;
  const isUnavailable = !movementRaw || movementRaw === "unavailable";
  const isActive     = movement === "cleaning" || movement === "point";
  const isCharging   = movement === "charging";

  const callVacuum = (service: string, data?: Record<string, unknown>) => {
    if (!connection) return;
    callService(connection, "vacuum", service, data ?? {}, { entity_id: config.vacuum });
  };

  const setFanSpeed = (option: string) => {
    if (!connection) return;
    callService(connection, "select", "select_option", { option }, { entity_id: config.cleaningMode });
  };

  const toggleRoom = (id: number) => {
    setSelectedRooms((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const startRoomCleaning = () => {
    if (!connection || selectedRooms.length === 0) return;
    callService(connection, "vacuum", "send_command", {
      command: "app_segment_clean",
      params: [{ segments: selectedRooms, repeat: 1 }],
    }, { entity_id: config.vacuum });
    setSelectedRooms([]);
  };

  const rooms = config.rooms ?? [];

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pb-3 shrink-0 border-b border-white/5">
        <Icon
          icon={meta.icon}
          width={22}
          className={isActive ? `${meta.color} animate-spin-slow` : meta.color}
        />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold">{vacuumName ?? "Støvsuger"}</div>
          <div className={`text-xs font-medium ${meta.color} flex items-center gap-1.5`}>
            {meta.label}
            {isActive && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
            )}
          </div>
        </div>
        {powerW !== null && powerW > 0 && (
          <span className="text-xs text-text-dim">{formatPower(powerW)}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" data-no-drag>
        {/* Battery bar */}
        <div className="rounded-xl bg-bg-elevated px-4 py-3">
          <div className="flex items-center gap-3">
            <Icon
              icon={isCharging ? "mdi:battery-charging" : battery !== null && battery <= 20 ? "mdi:battery-low" : "mdi:battery"}
              width={18}
              className={isCharging ? "text-accent-green" : battery !== null && battery <= 20 ? "text-accent-red" : "text-text-secondary"}
            />
            <div className="flex-1">
              <div className="h-2 rounded-full bg-bg-primary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isCharging ? "bg-accent-green animate-pulse"
                    : battery !== null && battery <= 20 ? "bg-accent-red"
                    : battery !== null && battery <= 50 ? "bg-accent-warm"
                    : "bg-accent-green"
                  }`}
                  style={{ width: `${battery ?? 0}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {battery !== null ? `${Math.round(battery)}%` : "—"}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        {!isUnavailable && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-text-dim mb-2.5">Kontroller</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Start",  icon: "mdi:play",              service: "start",         show: ["charging","idle","pause","after","off","reserve"] },
                { label: "Pause",  icon: "mdi:pause",             service: "pause",         show: ["cleaning","homing","point"] },
                { label: "Dok",    icon: "mdi:home",              service: "return_to_base", show: ["cleaning","pause","idle","point","after","alarm"] },
                { label: "Spot",   icon: "mdi:target",            service: "clean_spot",    show: ["charging","idle","after"] },
                { label: "Finn",   icon: "mdi:map-marker-radius", service: "locate",        show: null },
              ]
                .filter((a) => a.show === null || a.show.includes(movement))
                .map((action) => (
                  <motion.button
                    key={action.service}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => callVacuum(action.service)}
                    className="flex flex-col items-center gap-1.5 rounded-xl bg-bg-elevated py-3 text-xs font-medium text-text-secondary hover:bg-white/10 transition-colors"
                  >
                    <Icon icon={action.icon} width={18} />
                    {action.label}
                  </motion.button>
                ))}
            </div>
          </div>
        )}

        {/* Fan speed */}
        {fanOptions.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-text-dim mb-2.5">Sugestyrke</div>
            <div className="flex flex-wrap gap-2">
              {fanOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setFanSpeed(option)}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                    fanSpeedRaw === option
                      ? "bg-accent/20 text-accent ring-1 ring-accent/30"
                      : "bg-bg-elevated text-text-secondary hover:bg-white/10"
                  }`}
                >
                  {FAN_LABELS[option] ?? option}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Room selection */}
        {rooms.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-text-dim mb-2.5">Romvalg</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {rooms.map((room) => {
                const selected = selectedRooms.includes(room.id);
                return (
                  <button
                    key={room.id}
                    onClick={() => toggleRoom(room.id)}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      selected
                        ? "bg-accent/20 text-accent ring-1 ring-accent/30"
                        : "bg-bg-elevated text-text-secondary hover:bg-white/10"
                    }`}
                  >
                    <Icon icon={room.icon ?? "mdi:floor-plan"} width={16} />
                    {room.name}
                    {selected && <Icon icon="mdi:check" width={14} className="ml-auto" />}
                  </button>
                );
              })}
            </div>
            <button
              onClick={startRoomCleaning}
              disabled={selectedRooms.length === 0}
              className="w-full rounded-xl bg-accent/15 py-3 text-sm font-semibold text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors"
            >
              {selectedRooms.length === 0
                ? "Velg rom for rengjøring"
                : `Start rengjøring (${selectedRooms.length} rom)`}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
