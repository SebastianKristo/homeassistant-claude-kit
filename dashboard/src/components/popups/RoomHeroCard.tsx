import { useMemo } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import type { RoomConfig } from "../../lib/areas";
import type { RoomState } from "../../hooks/useRoomState";
import { useHistory } from "../../hooks/useHistory";
import { useNumericControl } from "../../lib/useNumericControl";
import { Sparkline } from "../charts/Sparkline";

interface RoomHeroCardProps {
  room: RoomConfig;
  state: RoomState;
}

/**
 * Large summary card at the top of the room popup.
 * Shows big temperature + humidity, sparkline background, and
 * a target-temp stepper for the first climate entity.
 */
export function RoomHeroCard({ room, state }: RoomHeroCardProps) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection);

  // Stable 6-hour window for sparkline
  const startTime = useMemo(() => {
    return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  }, []);

  const tempHistory = useHistory(room.temperatureSensor ?? "", startTime);

  // First climate entity for the target temp stepper
  const climateId = room.climate?.[0];
  const climateEntity = climateId ? entities[climateId] : null;
  const serverTarget = (climateEntity?.attributes?.temperature as number | undefined) ?? 20;

  const { displayValue: targetDisplay, phase, increment, decrement } = useNumericControl(
    serverTarget,
    async (v) => {
      if (!connection || !climateId) return;
      callService(connection, "climate", "set_temperature", { temperature: v }, { entity_id: climateId });
    },
    { min: 5, max: 30, step: 0.5, debounceMs: 800 },
  );

  const hasTemp = !!state.temp;
  const hasClimateControl = !!climateId && climateEntity?.state !== "unavailable";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-bg-card" style={{ height: 150 }}>
      {/* Sparkline background — subtle, fills bottom half */}
      {room.temperatureSensor && tempHistory.length >= 2 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-[0.18]">
          <Sparkline data={tempHistory} height={75} color="white" />
        </div>
      )}

      {/* Content layer */}
      <div className="relative flex h-full flex-col justify-between p-4">
        {/* Top: room name + occupancy */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-text-secondary">{room.name}</span>
          {state.isOccupied && (
            <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-occupancy" />
          )}
        </div>

        {/* Bottom: temperature | stepper */}
        <div className="flex items-end justify-between">
          {/* Temperature + humidity */}
          <div className="flex items-baseline gap-2 leading-none">
            {hasTemp ? (
              <span className="font-light tabular-nums" style={{ fontSize: "2.6em" }}>
                {state.temp}°
              </span>
            ) : (
              <span className="text-3xl text-text-dim">—</span>
            )}
            {state.humidity !== null && (
              <span className="mb-1 text-[14px] text-text-dim tabular-nums">
                {Math.round(state.humidity)}%
              </span>
            )}
          </div>

          {/* Target temp stepper */}
          {hasClimateControl && (
            <div
              className={`flex flex-col items-center overflow-hidden rounded-[20px] transition-opacity ${
                phase === "inflight" ? "opacity-60" : ""
              }`}
            >
              <button
                onClick={increment}
                className="flex h-9 w-10 items-center justify-center bg-bg-elevated transition-colors hover:bg-white/10 active:bg-white/15"
              >
                <Icon icon="mdi:chevron-up" width={18} />
              </button>
              <div className="flex h-10 w-10 items-center justify-center bg-bg-elevated text-sm font-medium tabular-nums">
                {Math.round(targetDisplay * 2) / 2 % 1 === 0
                  ? Math.round(targetDisplay)
                  : targetDisplay.toFixed(1)}°
              </div>
              <button
                onClick={decrement}
                className="flex h-9 w-10 items-center justify-center bg-bg-elevated transition-colors hover:bg-white/10 active:bg-white/15"
              >
                <Icon icon="mdi:chevron-down" width={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
