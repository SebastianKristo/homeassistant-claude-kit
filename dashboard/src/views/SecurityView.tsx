import { useState, useMemo } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import {
  ALARM, GARAGE, LOCKS, CAMERAS, CONTACT_SENSORS, MOTION_SENSORS,
  NIGHT_ALERTS, DOORBELL_RINGING,
} from "../lib/entities";
import type { CameraConfig } from "../lib/entities";
import { CameraCard } from "../components/cards/CameraCard";
import { CameraPopup } from "../components/popups/CameraPopup";
import { SecurityHistoryCard } from "../components/cards/SecurityHistoryCard";
import { ContactSensorPopup } from "../components/popups/ContactSensorPopup";
import { LockPopup } from "../components/popups/LockPopup";
import type { ContactConfig } from "../lib/entities";

const ALARM_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  disarmed:    { label: "Avvæpnet",      color: "text-accent-green",  bg: "bg-accent-green/10", icon: "mdi:shield-off-outline" },
  armed_away:  { label: "Borte",         color: "text-accent-red",    bg: "bg-accent-red/15",   icon: "mdi:shield-lock" },
  armed_home:  { label: "Hjemme",        color: "text-accent-warm",   bg: "bg-accent-warm/12",  icon: "mdi:shield-home" },
  armed_night: { label: "Natt",          color: "text-accent",        bg: "bg-accent/12",       icon: "mdi:shield-moon" },
  pending:     { label: "Venter…",       color: "text-accent-warm",   bg: "bg-accent-warm/12",  icon: "mdi:shield-alert-outline" },
  arming:      { label: "Væpner…",       color: "text-accent-warm",   bg: "bg-accent-warm/12",  icon: "mdi:shield-alert-outline" },
  triggered:   { label: "ALARM UTLØST!", color: "text-accent-red",    bg: "bg-accent-red/25",   icon: "mdi:alarm-light" },
};

const ARM_BUTTONS = [
  { label: "Borte",   icon: "mdi:shield-lock",         state: "armed_away",  action: "alarm_arm_away",   color: "text-accent-red" },
  { label: "Hjemme",  icon: "mdi:shield-home",         state: "armed_home",  action: "alarm_arm_home",   color: "text-accent-warm" },
  { label: "Natt",    icon: "mdi:shield-moon",         state: "armed_night", action: "alarm_arm_night",  color: "text-accent" },
  { label: "Avvæpne", icon: "mdi:shield-off-outline",  state: "disarmed",    action: "alarm_disarm",     color: "text-accent-green" },
] as const;

function sortCameras(entities: HassEntities): CameraConfig[] {
  const doorbell = CAMERAS.find((c) => c.id === "doorbell");
  const rest = CAMERAS.filter((c) => c.id !== "doorbell").sort((a, b) => {
    const aT = a.personSensor ? new Date(entities[a.personSensor]?.last_changed ?? 0).getTime() : 0;
    const bT = b.personSensor ? new Date(entities[b.personSensor]?.last_changed ?? 0).getTime() : 0;
    return bT - aT;
  });
  return doorbell ? [doorbell, ...rest] : rest;
}

export function SecurityView() {
  const entities = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;
  const [selectedCamera, setSelectedCamera] = useState<CameraConfig | null>(null);
  const [selectedSensor, setSelectedSensor] = useState<ContactConfig | null>(null);
  const [snapshotVersions, setSnapshotVersions] = useState<Record<string, number>>({});
  const [lockPopupOpen, setLockPopupOpen] = useState(false);

  const sortedCameras = useMemo(() => sortCameras(entities), [entities]);

  const alarmState = entities[ALARM]?.state ?? "unavailable";
  const alarmMeta  = ALARM_META[alarmState] ?? { label: alarmState, color: "text-text-dim", bg: "bg-bg-card", icon: "mdi:shield-outline" };

  const lockState   = entities[LOCKS[0]?.entity]?.state;
  const isLocked    = lockState === "locked";
  const lockUnknown = !lockState || lockState === "unavailable";

  const nightOn = entities[NIGHT_ALERTS]?.state === "on";

  // Door / window summary
  const openDoors    = CONTACT_SENSORS.filter((c) => c.type === "door"   && entities[c.entity]?.state === "on");
  const openWindows  = CONTACT_SENSORS.filter((c) => c.type === "window" && entities[c.entity]?.state === "on");
  const allSecure    = openDoors.length === 0 && openWindows.length === 0;

  const arm = (action: string) => {
    if (!connection) return;
    callService(connection, "alarm_control_panel", action, undefined, { entity_id: ALARM });
  };

  const toggleNight = () => {
    if (!connection) return;
    callService(connection, "input_boolean", "toggle", undefined, { entity_id: NIGHT_ALERTS });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3 py-4">

      {/* ── Alarm ───────────────────────────────────────────────────── */}
      <div className={`rounded-2xl p-4 ${alarmMeta.bg}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/8 ${alarmMeta.color}`}>
            <Icon icon={alarmMeta.icon} width={22} className={alarmState === "triggered" ? "animate-pulse" : ""} />
          </div>
          <div>
            <div className="text-sm font-medium">Alarmsystem</div>
            <div className={`text-xs font-semibold ${alarmMeta.color}`}>{alarmMeta.label}</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {ARM_BUTTONS.map(({ label, icon, state, action, color }) => (
            <button
              key={state}
              onClick={() => arm(action)}
              className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-medium transition-colors ${
                alarmState === state
                  ? `ring-1 ring-current bg-white/8 ${color}`
                  : "bg-white/8 text-text-secondary hover:bg-white/12"
              }`}
            >
              <Icon icon={icon} width={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Dørlås ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setLockPopupOpen(true)}
        disabled={lockUnknown}
        className={`flex flex-col gap-3 rounded-2xl p-4 text-left transition-colors w-full ${
          lockUnknown ? "bg-bg-card opacity-50" :
          isLocked ? "bg-accent-green/10 ring-1 ring-accent-green/20" : "bg-accent-warm/10 ring-1 ring-accent-warm/20"
        }`}
      >
        <div className="flex items-center justify-between">
          <Icon
            icon={isLocked ? "mdi:lock" : "mdi:lock-open-variant"}
            width={22}
            className={lockUnknown ? "text-text-dim" : isLocked ? "text-accent-green" : "text-accent-warm"}
          />
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            lockUnknown ? "bg-white/8 text-text-dim"
            : isLocked ? "bg-accent-green/15 text-accent-green"
            : "bg-accent-warm/15 text-accent-warm"
          }`}>
            {lockUnknown ? "—" : isLocked ? "Låst" : "Ulåst"}
          </span>
        </div>
        <div>
          <div className="text-sm font-medium">{LOCKS[0]?.name ?? "Lås"}</div>
          <div className={`mt-2 w-full rounded-xl py-1.5 text-center text-xs font-medium ${
            lockUnknown ? "bg-white/8 text-text-dim"
            : isLocked ? "bg-accent-green/15 text-accent-green"
            : "bg-accent-warm/15 text-accent-warm"
          }`}>
            {lockUnknown ? "—" : "Åpne detaljer"}
          </div>
        </div>
      </button>

      {/* ── Nattmodus ───────────────────────────────────────────────── */}
      <button
        onClick={toggleNight}
        className="flex w-full items-center justify-between rounded-2xl bg-bg-card p-4 transition-colors hover:bg-bg-elevated"
      >
        <div className="flex items-center gap-3">
          <Icon icon="mdi:shield-moon" width={22} className={nightOn ? "text-accent" : "text-text-dim"} />
          <div className="text-left">
            <div className="text-sm font-medium">Nattmodus</div>
            <div className="text-xs text-text-dim">Bevegelsesdeteksjon innendørs om natten</div>
          </div>
        </div>
        <div className={`h-6 w-11 rounded-full p-0.5 transition-colors ${nightOn ? "bg-accent" : "bg-white/10"}`}>
          <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${nightOn ? "translate-x-5" : "translate-x-0"}`} />
        </div>
      </button>

      {/* ── Dører & vinduer ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Dører & vinduer</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            allSecure ? "bg-accent-green/15 text-accent-green" : "bg-accent-warm/15 text-accent-warm"
          }`}>
            {allSecure ? "Alle lukket" : `${openDoors.length + openWindows.length} åpne`}
          </span>
        </div>

        <div className="space-y-3">
          {/* Doors */}
          <div>
            <div className="text-xs font-medium text-text-dim uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Icon icon="mdi:door" width={12} /> Dører
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {CONTACT_SENSORS.filter((c) => c.type === "door").map((c) => {
                const isOpen = entities[c.entity]?.state === "on";
                return (
                  <button
                    key={c.entity}
                    onClick={() => setSelectedSensor(c)}
                    className={`rounded-xl px-2.5 py-2 text-center text-[11px] font-medium transition-colors active:scale-95 ${
                      isOpen
                        ? "bg-accent-warm/15 text-accent-warm hover:bg-accent-warm/25"
                        : "bg-white/5 text-text-dim hover:bg-white/10"
                    }`}
                  >
                    {c.name}
                    <div className={`text-[10px] font-normal mt-0.5 ${isOpen ? "text-accent-warm" : "text-text-dim/60"}`}>
                      {isOpen ? "åpen" : "lukket"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Windows */}
          <div>
            <div className="text-xs font-medium text-text-dim uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Icon icon="mdi:window-closed" width={12} /> Vinduer
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {CONTACT_SENSORS.filter((c) => c.type === "window").map((c) => {
                const isOpen = entities[c.entity]?.state === "on";
                return (
                  <button
                    key={c.entity}
                    onClick={() => setSelectedSensor(c)}
                    className={`rounded-xl px-2.5 py-2 text-center text-[11px] font-medium transition-colors active:scale-95 ${
                      isOpen
                        ? "bg-accent-warm/15 text-accent-warm hover:bg-accent-warm/25"
                        : "bg-white/5 text-text-dim hover:bg-white/10"
                    }`}
                  >
                    {c.name}
                    <div className={`text-[10px] font-normal mt-0.5 ${isOpen ? "text-accent-warm" : "text-text-dim/60"}`}>
                      {isOpen ? "åpen" : "lukket"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bevegelsessensorer ──────────────────────────────────────── */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon icon="mdi:motion-sensor" width={16} className="text-text-secondary" />
          <span className="text-sm font-medium">Bevegelse</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MOTION_SENSORS.map((m) => {
            const active = entities[m.entity]?.state === "on";
            return (
              <div
                key={m.entity}
                className={`rounded-xl px-2.5 py-2 text-center text-[11px] font-medium ${
                  active
                    ? "bg-accent-warm/15 text-accent-warm"
                    : "bg-white/5 text-text-dim"
                }`}
              >
                {m.name}
                <div className={`text-[10px] font-normal mt-0.5 ${active ? "text-accent-warm" : "text-text-dim/60"}`}>
                  {active ? "bevegelse" : "stille"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Kameraer ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {sortedCameras.map((camera) => (
          <CameraCard
            key={camera.id}
            camera={camera}
            snapshotVersion={snapshotVersions[camera.id] ?? 0}
            onTap={() => setSelectedCamera(camera)}
          />
        ))}
      </div>

      {/* ── Hendelseslogg ───────────────────────────────────────────── */}
      <SecurityHistoryCard
        alarm={ALARM}
        locks={LOCKS}
        garage={GARAGE}
        contacts={CONTACT_SENSORS}
        cameras={CAMERAS}
        doorbell={DOORBELL_RINGING}
        onCameraTap={setSelectedCamera}
      />

      {/* ── Lås popup ───────────────────────────────────────────────── */}
      <LockPopup open={lockPopupOpen} onClose={() => setLockPopupOpen(false)} />

      {/* ── Contact sensor popup ────────────────────────────────────── */}
      <ContactSensorPopup sensor={selectedSensor} onClose={() => setSelectedSensor(null)} />

      {/* ── Camera popup ────────────────────────────────────────────── */}
      <CameraPopup
        camera={selectedCamera}
        open={selectedCamera !== null}
        onClose={() => setSelectedCamera(null)}
        gateLockEntity=""
        onSnapshot={(cameraId) =>
          setSnapshotVersions((v) => ({ ...v, [cameraId]: (v[cameraId] ?? 0) + 1 }))
        }
      />
      <div className="h-20" />
    </div>
  );
}
