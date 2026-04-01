import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";

const CHARGER_MODE_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  disconnected:           { label: "Ikke tilkoblet",  color: "text-text-dim",     icon: "mdi:ev-plug-type2" },
  connected_requesting:   { label: "Kobler til…",     color: "text-accent-cool",  icon: "mdi:ev-plug-type2" },
  connected_finished:     { label: "Ferdig ladet",    color: "text-accent-green", icon: "mdi:battery-charging-100" },
  connected_charging:     { label: "Lader",           color: "text-accent-green", icon: "mdi:lightning-bolt" },
  connected_not_charging: { label: "Tilkoblet",       color: "text-accent-cool",  icon: "mdi:ev-plug-type2" },
  error:                  { label: "Feil",            color: "text-accent-red",   icon: "mdi:alert-circle" },
};

function pressButton(connection: Connection | null, entityId: string) {
  if (!connection) return;
  callService(connection, "button", "press", undefined, { entity_id: entityId });
}

interface ZaptecCardProps {
  entities: HassEntities;
  connection: Connection | null;
}

export function ZaptecCard({ entities, connection }: ZaptecCardProps) {
  const modeState  = entities["sensor.elbillader_charger_mode"]?.state ?? "";
  const chargeW    = parseNumericState(entities["sensor.elbillader_charge_power"]?.state) ?? 0;
  const sessionKwh = parseNumericState(entities["sensor.elbillader_session_total_charge"]?.state);
  const lastKwh    = parseNumericState(entities["sensor.elbillader_completed_session_energy"]?.state);
  const totalKwh   = parseNumericState(entities["sensor.elbillader_energy_meter"]?.state);

  const maxCurrent    = parseNumericState(entities["number.elbillader_charger_max_current"]?.state);
  const maxCurrentMin = parseNumericState(entities["number.elbillader_charger_max_current"]?.attributes?.min as string | undefined) ?? 6;
  const maxCurrentMax = parseNumericState(entities["number.elbillader_charger_max_current"]?.attributes?.max as string | undefined) ?? 32;

  const chargingOn    = entities["switch.elbillader_charging"]?.state === "on";
  const authRequired  = entities["binary_sensor.elbillader_authorization_required"]?.state === "on";

  const modeMeta  = CHARGER_MODE_LABEL[modeState] ?? { label: modeState, color: "text-text-secondary", icon: "mdi:ev-station" };
  const isCharging   = modeState === "connected_charging";
  const isConnected  = modeState !== "disconnected" && modeState !== "";
  const isOnline     = entities["binary_sensor.elbillader_online"]?.state === "on";

  const adjustMaxCurrent = (delta: number) => {
    if (!connection || maxCurrent === null) return;
    const next = Math.min(maxCurrentMax, Math.max(maxCurrentMin, maxCurrent + delta));
    callService(connection, "number", "set_value", { value: next }, { entity_id: "number.elbillader_charger_max_current" });
  };

  const toggleCharging = () => {
    if (!connection) return;
    callService(connection, "switch", chargingOn ? "turn_off" : "turn_on", undefined, { entity_id: "switch.elbillader_charging" });
  };

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${isCharging ? "bg-accent-green/8 ring-1 ring-accent-green/20" : "bg-bg-card"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon={modeMeta.icon} width={16} className={modeMeta.color} />
          <span className="text-sm font-medium">Zaptec</span>
          {!isOnline && (
            <span className="text-[10px] text-accent-red bg-accent-red/10 rounded px-1">Offline</span>
          )}
        </div>
        <span className={`text-xs font-medium ${modeMeta.color}`}>{modeMeta.label}</span>
      </div>

      {/* Charging metrics */}
      {isConnected && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-bg-elevated px-3 py-2">
            <div className="text-xs text-text-dim mb-0.5">Nå</div>
            <div className={`text-lg font-bold tabular-nums ${isCharging ? "text-accent-green" : "text-text-secondary"}`}>
              {isCharging ? (chargeW / 1000).toFixed(1) : "—"}
            </div>
            <div className="text-xs text-text-dim">kW</div>
          </div>
          {sessionKwh !== null && (
            <div className="rounded-xl bg-bg-elevated px-3 py-2">
              <div className="text-xs text-text-dim mb-0.5">Økt</div>
              <div className="text-lg font-bold tabular-nums">{sessionKwh.toFixed(1)}</div>
              <div className="text-xs text-text-dim">kWh</div>
            </div>
          )}
          {lastKwh !== null && (
            <div className="rounded-xl bg-bg-elevated px-3 py-2">
              <div className="text-xs text-text-dim mb-0.5">Forrige</div>
              <div className="text-lg font-bold tabular-nums">{lastKwh.toFixed(1)}</div>
              <div className="text-xs text-text-dim">kWh</div>
            </div>
          )}
        </div>
      )}

      {/* Control buttons */}
      <div className="grid grid-cols-2 gap-2">
        {/* Charging on/off */}
        <button
          onClick={toggleCharging}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium transition-colors ${
            chargingOn
              ? "bg-accent-green/20 text-accent-green ring-1 ring-accent-green/30"
              : "bg-white/8 text-text-secondary hover:bg-white/12"
          }`}
        >
          <Icon icon={chargingOn ? "mdi:pause" : "mdi:play"} width={14} />
          {chargingOn ? "Pause" : "Start lading"}
        </button>

        {/* Authorize / deauthorize */}
        {authRequired ? (
          <button
            onClick={() => pressButton(connection, "button.elbillader_authorize_charging")}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent-cool/20 text-accent-cool ring-1 ring-accent-cool/30 py-2.5 text-xs font-medium hover:bg-accent-cool/30 transition-colors"
          >
            <Icon icon="mdi:key" width={14} />
            Autoriser
          </button>
        ) : (
          <button
            onClick={() => pressButton(connection, "button.elbillader_deauthorize_charging")}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/8 text-text-secondary py-2.5 text-xs font-medium hover:bg-white/12 transition-colors"
          >
            <Icon icon="mdi:key-remove" width={14} />
            Deautoriser
          </button>
        )}
      </div>

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => pressButton(connection, "button.elbillader_resume_charging")}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white/6 text-text-dim py-2 text-xs hover:bg-white/10 transition-colors"
        >
          <Icon icon="mdi:play-circle-outline" width={13} />
          Gjenoppta
        </button>
        <button
          onClick={() => pressButton(connection, "button.elbillader_stop_charging")}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white/6 text-text-dim py-2 text-xs hover:bg-white/10 transition-colors"
        >
          <Icon icon="mdi:stop-circle-outline" width={13} />
          Stopp
        </button>
      </div>

      {/* Max current control */}
      {maxCurrent !== null && (
        <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-3 py-2">
          <span className="text-xs text-text-dim">Maks strøm</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustMaxCurrent(-2)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 hover:bg-white/12 active:scale-95 transition-transform"
              aria-label="Senk strøm"
            >
              <Icon icon="mdi:minus" width={12} />
            </button>
            <span className="w-10 text-center text-sm font-semibold tabular-nums">{maxCurrent} A</span>
            <button
              onClick={() => adjustMaxCurrent(2)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 hover:bg-white/12 active:scale-95 transition-transform"
              aria-label="Øk strøm"
            >
              <Icon icon="mdi:plus" width={12} />
            </button>
          </div>
        </div>
      )}

      {/* Total energy */}
      {totalKwh !== null && (
        <div className="flex items-center justify-between text-xs text-text-dim border-t border-white/5 pt-2">
          <span>Totalt ladet</span>
          <span className="tabular-nums">{totalKwh.toFixed(0)} kWh</span>
        </div>
      )}
    </div>
  );
}
