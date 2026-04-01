import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { ALARM } from "../../lib/entities";
import { BottomSheet } from "./BottomSheet";

interface AlarmPopupProps {
  open: boolean;
  onClose: () => void;
  entities: HassEntities;
  connection: Connection | null;
}

const ALARM_MODES = [
  {
    state: "disarmed",
    label: "Avvæpnet",
    icon: "mdi:shield-off-outline",
    color: "text-accent-green",
    bg: "bg-accent-green/12",
    ring: "ring-accent-green/25",
  },
  {
    state: "armed_home",
    label: "Hjemme",
    icon: "mdi:shield-home",
    color: "text-accent-warm",
    bg: "bg-accent-warm/12",
    ring: "ring-accent-warm/25",
  },
  {
    state: "armed_away",
    label: "Borte",
    icon: "mdi:shield-lock",
    color: "text-accent-red",
    bg: "bg-accent-red/12",
    ring: "ring-accent-red/25",
  },
  {
    state: "armed_night",
    label: "Natt",
    icon: "mdi:shield-moon",
    color: "text-accent",
    bg: "bg-accent/12",
    ring: "ring-accent/25",
  },
] as const;

const SERVICE_MAP: Record<string, string> = {
  disarmed:   "alarm_disarm",
  armed_home: "alarm_arm_home",
  armed_away: "alarm_arm_away",
  armed_night: "alarm_arm_night",
};

const STATE_LABELS: Record<string, string> = {
  disarmed:    "Avvæpnet",
  armed_home:  "Hjemme",
  armed_away:  "Borte",
  armed_night: "Natt",
  pending:     "Venter…",
  arming:      "Væpner…",
  triggered:   "ALARM!",
};

export function AlarmPopup({ open, onClose, entities, connection }: AlarmPopupProps) {
  if (!ALARM) return null;

  const alarmState = entities[ALARM]?.state ?? "unavailable";
  const isTransient = alarmState === "pending" || alarmState === "arming";
  const isTriggered = alarmState === "triggered";

  const arm = (targetState: string) => {
    if (!connection) return;
    const svc = SERVICE_MAP[targetState];
    if (!svc) return;
    callService(connection, "alarm_control_panel", svc, undefined, { entity_id: ALARM }).catch(() => {});
    onClose();
  };

  const currentMode = ALARM_MODES.find((m) => m.state === alarmState);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Alarm</Dialog.Title>
      <Dialog.Description className="sr-only">Alarm status og kontroll</Dialog.Description>

      <div className="px-5 pb-8 pt-2 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Icon
            icon={currentMode?.icon ?? "mdi:shield-outline"}
            width={22}
            className={`${currentMode?.color ?? "text-text-dim"} ${isTriggered ? "animate-pulse" : ""} shrink-0`}
          />
          <div>
            <h2 className="text-base font-semibold">Alarm</h2>
            <p className={`text-sm ${currentMode?.color ?? "text-text-dim"}`}>
              {STATE_LABELS[alarmState] ?? alarmState}
            </p>
          </div>
        </div>

        {/* Triggered banner */}
        {isTriggered && (
          <div className="flex items-center gap-3 rounded-2xl bg-accent-red/20 px-4 py-3 ring-1 ring-accent-red/40">
            <Icon icon="mdi:alarm-light" width={20} className="text-accent-red animate-pulse shrink-0" />
            <span className="text-sm font-semibold text-accent-red">Alarm utløst!</span>
          </div>
        )}

        {/* Transient state */}
        {isTransient && (
          <div className="flex items-center gap-2 text-sm text-accent-warm">
            <Icon icon="mdi:loading" width={16} className="animate-spin" />
            {STATE_LABELS[alarmState]}
          </div>
        )}

        {/* Mode buttons */}
        <div className="space-y-2">
          {ALARM_MODES.map((mode) => {
            const isActive = alarmState === mode.state;
            return (
              <button
                key={mode.state}
                onClick={() => arm(mode.state)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                  isActive
                    ? `${mode.bg} ring-1 ${mode.ring}`
                    : "bg-bg-card hover:bg-bg-elevated"
                }`}
              >
                <Icon icon={mode.icon} width={20} className={isActive ? mode.color : "text-text-dim"} />
                <span className={`text-sm font-medium ${isActive ? mode.color : "text-text-secondary"}`}>
                  {mode.label}
                </span>
                {isActive && (
                  <Icon icon="mdi:check-circle" width={16} className={`ml-auto ${mode.color}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
