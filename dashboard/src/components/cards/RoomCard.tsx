import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import type { RoomConfig } from "../../lib/areas";
import { useRoomState } from "../../hooks/useRoomState";
import { useLightGradient } from "../../hooks/useLightGradient";

interface RoomCardProps {
  room: RoomConfig;
  onTap: () => void;
}

export function RoomCard({ room, onTap }: RoomCardProps) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const gradient = useLightGradient(room.lights, entities);
  const state = useRoomState(room, entities);
  const {
    temp,
    humidity,
    co2,
    targetTemp,
    lightsOn,
    totalLights,
    lightsIconColor,
    isOccupied,
    coversOpen,
    totalCovers,
    openContacts,
    heatingTrvCount,
    acAction,
    mediaEntity,
    mediaAppName,
    dishwasherStatus,
    dishwasherRemaining,
  } = state;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className="contain-card relative flex h-full w-full cursor-pointer flex-col justify-between overflow-hidden rounded-2xl bg-bg-card p-4 text-left transition-colors hover:bg-bg-elevated"
      style={gradient ? { backgroundImage: gradient } : undefined}
    >
      {/* Header: name + occupancy | temp + humidity */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{room.name}</h3>
          {isOccupied && (
            <span className="h-2 w-2 animate-occupancy rounded-full bg-accent-green" />
          )}
        </div>
        {temp && (
          <div className="text-right">
            <div className="flex items-baseline gap-1.5 justify-end">
              {humidity !== null && (
                <span className="flex items-center gap-0.5 text-xs text-text-dim">
                  <Icon icon="mdi:water-percent" width={11} />
                  <span className="tabular-nums">{Math.round(humidity)}%</span>
                </span>
              )}
              <span className="text-lg font-semibold tabular-nums">{temp}°</span>
            </div>
            {targetTemp !== null && (
              <div className="flex items-center justify-end gap-0.5 text-xs text-text-dim tabular-nums">
                <Icon icon="mdi:target" width={10} />
                {Math.round(targetTemp)}°
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status indicators — display only, no interactive buttons */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        {/* Lights */}
        {totalLights > 0 && (
          <span
            className="flex items-center"
            style={lightsIconColor && lightsOn > 0 ? { color: lightsIconColor } : undefined}
          >
            {lightsOn > 0 ? `${lightsOn} på` : <span className="text-text-dim">Av</span>}
          </span>
        )}

        {/* Covers / blinds */}
        {totalCovers > 0 && (
          <span className={coversOpen > 0 ? "text-text-secondary" : "text-text-dim"}>
            {coversOpen > 0
              ? coversOpen === totalCovers ? "Åpen" : `${coversOpen}/${totalCovers}`
              : "Lukket"}
          </span>
        )}

        {/* Contact sensors — only shown when open */}
        {openContacts.map((s) => (
          <span key={s.entity} className="text-accent-warm">{s.label}</span>
        ))}

        {/* CO2 */}
        {co2 !== null && (
          <span className={`tabular-nums ${co2 > 1000 ? "text-accent-warm" : "text-text-dim"}`}>
            {Math.round(co2)} ppm
          </span>
        )}

        {/* Media — display only */}
        {mediaEntity && (
          <span className="truncate text-accent">
            {mediaEntity.attributes?.media_title ?? "Spiller"}
          </span>
        )}
        {!mediaEntity && mediaAppName && (
          <span className="truncate text-text-secondary">{mediaAppName}</span>
        )}

        {/* Dishwasher */}
        {(dishwasherStatus === "running" || dishwasherStatus === "ending") && (
          <span className="tabular-nums text-accent-cool">
            {dishwasherRemaining ?? "—"}min
          </span>
        )}
        {dishwasherStatus === "ready" && (
          <span className="text-accent-green">Ferdig</span>
        )}

        {/* Climate indicators */}
        {(heatingTrvCount > 0 || acAction) && (
          <span className="ml-auto flex items-center gap-2">
            {heatingTrvCount > 0 && (
              <span className="tabular-nums" style={{ animation: "glow-warm 2s ease-in-out infinite" }}>
                {heatingTrvCount}×
              </span>
            )}
            {acAction && (
              <span style={{ animation: `${acAction === "cooling" ? "glow-cool" : "glow-warm"} 2s ease-in-out infinite` }}>
                {acAction === "cooling" ? "Kjøler" : "Varmer"}
              </span>
            )}
          </span>
        )}
      </div>
    </motion.div>
  );
}
