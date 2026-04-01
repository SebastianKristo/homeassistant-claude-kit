import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { useControlCommit } from "../../lib/useControlCommit";

interface SwitchControlProps {
  entityId: string;
  /** Strip this prefix from the friendly name for cleaner labels */
  stripPrefix?: string;
  /** Optional power sensor entity ID — shows watt reading as subtitle */
  powerSensorId?: string;
}

function stripRoomPrefix(name: string, prefix: string): string {
  const lower = name.toLowerCase();
  const prefixLower = prefix.toLowerCase() + " ";
  if (lower.startsWith(prefixLower)) {
    return name.slice(prefixLower.length);
  }
  return name;
}

export function SwitchControl({ entityId, stripPrefix, powerSensorId }: SwitchControlProps) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection);

  const entity = entities[entityId];
  const isOn = entity?.state === "on";
  const isUnavailable = !entity || entity.state === "unavailable";

  const rawName = entity?.attributes?.friendly_name ?? entityId.split(".")[1];
  const label = stripPrefix ? stripRoomPrefix(rawName, stripPrefix) : rawName;

  const powerState = powerSensorId ? entities[powerSensorId]?.state : undefined;
  const watts = powerState && !isNaN(parseFloat(powerState)) ? Math.round(parseFloat(powerState)) : null;

  const { displayValue, phase, set } = useControlCommit<boolean>(isOn, async (v) => {
    if (!connection) return;
    callService(connection, "switch", v ? "turn_on" : "turn_off", undefined, { entity_id: entityId });
  }, { debounceMs: 200 });

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors ${
        isUnavailable ? "opacity-40" : "hover:bg-white/4"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon
          icon={displayValue ? "mdi:power-plug" : "mdi:power-plug-off"}
          width={18}
          className={`shrink-0 ${displayValue ? "text-accent-warm" : "text-text-dim"}`}
        />
        <div className="min-w-0">
          <span className="truncate text-sm capitalize">{label}</span>
          {watts !== null && displayValue && (
            <span className="block text-xs text-text-dim tabular-nums">{watts} W</span>
          )}
          {watts !== null && !displayValue && (
            <span className="block text-xs text-text-dim">Av</span>
          )}
        </div>
      </div>

      {/* Toggle */}
      <button
        disabled={isUnavailable}
        onClick={(e) => { e.stopPropagation(); set(!displayValue); }}
        className="flex shrink-0 min-h-[44px] min-w-[44px] items-center justify-center"
      >
        <div className={`relative h-5 w-9 rounded-full p-0.5 transition-colors duration-200 ${
          displayValue ? "bg-accent-warm" : "bg-white/15"
        } ${phase === "debouncing" ? "opacity-70" : ""}`}>
          <div
            className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
              displayValue ? "translate-x-4" : "translate-x-0"
            }`}
          >
            {phase === "inflight" && (
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-warm animate-control-spin" />
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
