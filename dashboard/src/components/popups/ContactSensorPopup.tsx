import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import type { ContactConfig } from "../../lib/entities";
import { useStateHistory, type StateSpan } from "../../hooks/useStateHistory";

interface ContactSensorPopupProps {
  sensor: ContactConfig | null;
  onClose: () => void;
}

function useYesterdayStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatRelTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)  return "Akkurat nå";
  const min = Math.floor(sec / 60);
  if (min < 60)  return `${min} min siden`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h} t siden`;
  return `${Math.floor(h / 24)} d siden`;
}

function formatAbsTime(epochMs: number): string {
  try {
    const d = new Date(epochMs);
    const isToday = new Date().toDateString() === d.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("no-NO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(epochMs);
  }
}


function HistoryContent({ entityId, type }: { entityId: string; type: "door" | "window" }) {
  const since = useYesterdayStart();
  const spans: StateSpan[] = useStateHistory(entityId, since);

  // Show most recent first, skip unavailable/unknown
  const meaningful = [...spans]
    .reverse()
    .filter((h) => h.state === "on" || h.state === "off")
    .slice(0, 20);

  if (meaningful.length === 0) {
    return (
      <div className="text-sm text-text-dim text-center py-6">Ingen historikk tilgjengelig</div>
    );
  }

  return (
    <div className="space-y-1.5">
      {meaningful.map((h, i) => {
        const isOpen = h.state === "on";
        return (
          <div
            key={i}
            className={`flex items-center justify-between rounded-xl px-3 py-2 ${
              isOpen ? "bg-accent-warm/8" : "bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon
                icon={isOpen
                  ? (type === "door" ? "mdi:door-open" : "mdi:window-open")
                  : (type === "door" ? "mdi:door-closed" : "mdi:window-closed")
                }
                width={14}
                className={isOpen ? "text-accent-warm" : "text-text-dim"}
              />
              <span className={`text-sm font-medium ${isOpen ? "text-accent-warm" : "text-text-dim"}`}>
                {isOpen ? "Åpnet" : "Lukket"}
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs text-text-secondary tabular-nums">{formatAbsTime(h.start)}</div>
              <div className="text-[10px] text-text-dim">{formatRelTime(h.start)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ContactSensorPopup({ sensor, onClose }: ContactSensorPopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const entity  = sensor ? entities[sensor.entity] : undefined;
  const isOpen  = entity?.state === "on";
  const lastChanged = entity?.last_changed;

  const icon = sensor?.type === "door"
    ? (isOpen ? "mdi:door-open" : "mdi:door-closed")
    : (isOpen ? "mdi:window-open" : "mdi:window-closed");

  return (
    <BottomSheet open={sensor !== null} onClose={onClose} className="md:max-w-sm">
      <Dialog.Title className="sr-only">{sensor?.name ?? "Sensor"}</Dialog.Title>
      <Dialog.Description className="sr-only">Status og historikk for {sensor?.name}</Dialog.Description>

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
        {/* Status header */}
        <div className="flex flex-col items-center gap-3 py-6">
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ${
            isOpen ? "bg-accent-warm/15" : "bg-accent-green/10"
          }`}>
            <Icon icon={icon} width={40} className={isOpen ? "text-accent-warm" : "text-accent-green"} />
          </div>
          <div className="text-center">
            <div className={`text-2xl font-semibold ${isOpen ? "text-accent-warm" : "text-accent-green"}`}>
              {isOpen ? "Åpen" : "Lukket"}
            </div>
            <div className="text-sm text-text-dim mt-0.5">{sensor?.name}</div>
            {lastChanged && (
              <div className="text-xs text-text-dim mt-1">
                Sist endret {formatRelTime(new Date(lastChanged).getTime())}
              </div>
            )}
          </div>
        </div>

        {/* History */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-text-secondary">Historikk (siste 2 dager)</div>
          {sensor && <HistoryContent entityId={sensor.entity} type={sensor.type} />}
        </div>
      </div>
    </BottomSheet>
  );
}
