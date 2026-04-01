import { useMemo } from "react";
import { Icon } from "@iconify/react";
import { useMultiStateHistory } from "../../hooks/useHistory";
import type { CameraConfig, ContactConfig } from "../../lib/entities";

interface SecurityHistoryCardProps {
  alarm: string;
  locks: { entity: string; name: string }[];
  garage: string;
  contacts: ContactConfig[];
  cameras: CameraConfig[];
  doorbell: string;
  onCameraTap?: (camera: CameraConfig) => void;
}

interface HistoryEvent {
  time: Date;
  icon: string;
  color: string;
  label: string;
  detail: string;
  camera?: CameraConfig;
}

const ALARM_META: Record<string, { icon: string; color: string; detail: string }> = {
  disarmed:    { icon: "mdi:shield-off-outline", color: "text-accent-green",  detail: "Avvæpnet" },
  armed_away:  { icon: "mdi:shield-lock",        color: "text-accent-red",    detail: "Borte-modus" },
  armed_home:  { icon: "mdi:shield-home",        color: "text-accent-warm",   detail: "Hjemme-modus" },
  armed_night: { icon: "mdi:shield-moon",        color: "text-accent",        detail: "Natt-modus" },
  triggered:   { icon: "mdi:alarm-light",        color: "text-accent-red",    detail: "ALARM UTLØST" },
  pending:     { icon: "mdi:shield-alert-outline",color: "text-accent-warm",  detail: "Venter…" },
};

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "nå";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t`;
  return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

export function SecurityHistoryCard({
  alarm, locks, garage, contacts, cameras, doorbell, onCameraTap,
}: SecurityHistoryCardProps) {
  const allEntityIds = useMemo(() => [
    alarm,
    ...locks.map((l) => l.entity),
    garage,
    ...contacts.map((c) => c.entity),
    ...cameras.map((c) => c.personSensor).filter(Boolean),
    doorbell,
  ], [alarm, locks, garage, contacts, cameras, doorbell]);

  const startTime = useMemo(
    () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEntityIds.join(",")],
  );

  const history = useMultiStateHistory(allEntityIds, startTime);

  const events = useMemo((): HistoryEvent[] => {
    const result: HistoryEvent[] = [];
    const cameraByPerson = new Map<string, CameraConfig>();
    for (const cam of cameras) {
      if (cam.personSensor) cameraByPerson.set(cam.personSensor, cam);
    }
    const doorbellCam = cameras.find((c) => c.id === "doorbell");

    for (const [entityId, entries] of Object.entries(history)) {
      if (!entries?.length) continue;

      for (const entry of entries) {
        const time = new Date(entry.time);

        // Alarm
        if (entityId === alarm) {
          const meta = ALARM_META[entry.state];
          if (meta) result.push({ time, icon: meta.icon, color: meta.color, label: "Alarm", detail: meta.detail });
          continue;
        }

        // Locks
        const lock = locks.find((l) => l.entity === entityId);
        if (lock) {
          if (entry.state === "locked") result.push({ time, icon: "mdi:lock", color: "text-accent-green", label: lock.name, detail: "Låst" });
          else if (entry.state === "unlocked") result.push({ time, icon: "mdi:lock-open-variant", color: "text-accent-warm", label: lock.name, detail: "Ulåst" });
          continue;
        }

        // Garage
        if (entityId === garage) {
          if (entry.state === "open") result.push({ time, icon: "mdi:garage-open", color: "text-accent-warm", label: "Garasje", detail: "Åpnet" });
          else if (entry.state === "closed") result.push({ time, icon: "mdi:garage", color: "text-accent-green", label: "Garasje", detail: "Lukket" });
          continue;
        }

        // Contact sensors
        const contact = contacts.find((c) => c.entity === entityId);
        if (contact) {
          if (entry.state === "on")
            result.push({ time, icon: contact.type === "door" ? "mdi:door-open" : "mdi:window-open", color: "text-accent-warm", label: contact.name, detail: contact.type === "door" ? "Dør åpnet" : "Vindu åpnet" });
          else if (entry.state === "off")
            result.push({ time, icon: contact.type === "door" ? "mdi:door-closed" : "mdi:window-closed", color: "text-text-dim", label: contact.name, detail: contact.type === "door" ? "Dør lukket" : "Vindu lukket" });
          continue;
        }

        // Person detection
        if (cameraByPerson.has(entityId) && entry.state === "on") {
          const cam = cameraByPerson.get(entityId)!;
          result.push({ time, icon: "mdi:account-alert", color: "text-accent", label: cam.name, detail: "Person oppdaget", camera: cam });
          continue;
        }

        // Doorbell
        if (entityId === doorbell && entry.state === "on") {
          result.push({ time, icon: "mdi:doorbell", color: "text-accent-warm", label: "Ringeklokke", detail: "Ringte", camera: doorbellCam });
          continue;
        }
      }
    }

    result.sort((a, b) => b.time.getTime() - a.time.getTime());
    return result.slice(0, 40);
  }, [history, alarm, locks, garage, contacts, cameras, doorbell]);

  const hasData = Object.keys(history).length > 0;

  return (
    <div className="rounded-2xl bg-bg-card p-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary flex items-center gap-2">
        <Icon icon="mdi:history" width={15} />
        Hendelseslogg — siste 24t
      </h2>

      {!hasData && <p className="text-xs text-text-dim">Laster…</p>}
      {hasData && events.length === 0 && <p className="text-xs text-text-dim">Ingen hendelser siste 24 timer</p>}

      <div className="space-y-0.5">
        {events.map((ev, i) => (
          <button
            key={`${ev.time.getTime()}-${i}`}
            onClick={() => ev.camera && onCameraTap?.(ev.camera)}
            disabled={!ev.camera}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-bg-elevated disabled:cursor-default"
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 ${ev.color}`}>
              <Icon icon={ev.icon} width={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-text-primary">{ev.label}</span>
                <span className="text-xs text-text-dim">{ev.detail}</span>
              </div>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-text-dim">{formatTime(ev.time)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
