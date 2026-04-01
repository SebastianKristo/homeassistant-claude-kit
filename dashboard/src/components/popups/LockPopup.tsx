import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import { LOCKS, LOCK_BATTERY } from "../../lib/entities";
import { BottomSheet } from "./BottomSheet";

const AUTO_LOCK_AFTER = "input_number.las_automatisk_lasing_etter";

interface LockPopupProps {
  open: boolean;
  onClose: () => void;
}

export function LockPopup({ open, onClose }: LockPopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;
  const [editingTimer, setEditingTimer] = useState(false);
  const [timerInput,   setTimerInput]   = useState("");

  const lock = LOCKS[0];
  if (!lock) return null;

  const entity = entities[lock.entity];
  const state = entity?.state;
  const isLocked   = state === "locked";
  const isUnlocked = state === "unlocked";
  const isJammed   = state === "jammed";
  const isLocking  = state === "locking";
  const isUnlocking = state === "unlocking";

  const battery = parseNumericState(entities[LOCK_BATTERY]?.state);
  const lastChanged = entity?.last_changed
    ? new Date(entity.last_changed).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })
    : null;

  const autoLockEntity = entities[AUTO_LOCK_AFTER];
  const autoLockVal  = parseNumericState(autoLockEntity?.state);
  const autoLockMin  = parseNumericState(autoLockEntity?.attributes?.min as string | undefined) ?? 0;
  const autoLockMax  = parseNumericState(autoLockEntity?.attributes?.max as string | undefined) ?? 30;

  const setAutoLock = (next: number) => {
    if (!connection) return;
    const clamped = Math.min(autoLockMax, Math.max(autoLockMin, Math.round(next)));
    callService(connection, "input_number", "set_value", { value: clamped }, { entity_id: AUTO_LOCK_AFTER });
  };

  const doLock = () => {
    if (!connection) return;
    callService(connection, "lock", "lock", undefined, { entity_id: lock.entity });
  };
  const doUnlock = () => {
    if (!connection) return;
    callService(connection, "lock", "unlock", undefined, { entity_id: lock.entity });
  };

  const stateColor = isJammed
    ? "text-accent-red"
    : isUnlocked || isUnlocking
    ? "text-accent-warm"
    : "text-accent-green";

  const stateLabel = isJammed ? "Blokkert" : isLocking ? "Låser..." : isUnlocking ? "Låser opp..." : isUnlocked ? "Ulåst" : isLocked ? "Låst" : state ?? "—";
  const stateIcon  = isJammed ? "mdi:lock-alert" : isUnlocked || isUnlocking ? "mdi:lock-open-variant" : "mdi:lock";

  return (
    <BottomSheet open={open} onClose={onClose} className="md:max-w-sm">
      <Dialog.Title className="sr-only">Dørlås</Dialog.Title>
      <Dialog.Description className="sr-only">Kontroll og status for {lock.name}</Dialog.Description>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {/* Big status */}
        <div className="flex flex-col items-center gap-3 py-8">
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ${
            isJammed ? "bg-accent-red/15" : isUnlocked ? "bg-accent-warm/15" : "bg-accent-green/15"
          }`}>
            <Icon icon={stateIcon} width={40} className={stateColor} />
          </div>
          <div className="text-center">
            <div className={`text-2xl font-semibold ${stateColor}`}>{stateLabel}</div>
            <div className="text-sm text-text-dim mt-1">{lock.name}</div>
            {lastChanged && (
              <div className="text-xs text-text-dim mt-0.5">Sist endret kl. {lastChanged}</div>
            )}
          </div>
        </div>

        {/* Battery */}
        {battery !== null && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-bg-card px-4 py-3">
            <Icon
              icon={battery <= 10 ? "mdi:battery-alert" : battery <= 30 ? "mdi:battery-low" : "mdi:battery"}
              width={20}
              className={battery <= 10 ? "text-accent-red" : battery <= 30 ? "text-accent-warm" : "text-accent-green"}
            />
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Batteri</span>
                <span className={`font-semibold tabular-nums ${battery <= 10 ? "text-accent-red" : battery <= 30 ? "text-accent-warm" : "text-accent-green"}`}>
                  {battery.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${battery <= 10 ? "bg-accent-red" : battery <= 30 ? "bg-accent-warm" : "bg-accent-green"}`}
                  style={{ width: `${battery}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Auto-lock timer */}
        {autoLockEntity && (
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:timer-lock-outline" width={18} className="text-text-secondary" />
              <span className="text-sm text-text-secondary">Lås automatisk etter</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => autoLockVal !== null && setAutoLock(autoLockVal - 1)}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform"
              >
                <Icon icon="mdi:minus" width={12} />
              </button>
              {editingTimer ? (
                <input
                  type="number"
                  value={timerInput}
                  min={autoLockMin}
                  max={autoLockMax}
                  onChange={(e) => setTimerInput(e.target.value)}
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setAutoLock(v); setEditingTimer(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { const v = parseFloat(e.currentTarget.value); if (!isNaN(v)) setAutoLock(v); setEditingTimer(false); }
                    if (e.key === "Escape") setEditingTimer(false);
                  }}
                  autoFocus
                  className="w-14 text-center text-sm font-semibold bg-bg-elevated border border-accent rounded-lg px-1 py-0.5 outline-none"
                />
              ) : (
                <button
                  onClick={() => { setEditingTimer(true); setTimerInput(String(autoLockVal ?? "")); }}
                  className="w-14 text-center text-sm font-semibold tabular-nums hover:text-accent transition-colors"
                >
                  {autoLockVal !== null ? `${autoLockVal.toFixed(0)} min` : "—"}
                </button>
              )}
              <button
                onClick={() => autoLockVal !== null && setAutoLock(autoLockVal + 1)}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform"
              >
                <Icon icon="mdi:plus" width={12} />
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={doLock}
            disabled={isLocked || isLocking || isJammed}
            className="flex flex-col items-center gap-2 rounded-2xl bg-accent-green/12 py-5 text-accent-green transition-colors hover:bg-accent-green/20 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Icon icon="mdi:lock" width={28} />
            <span className="text-sm font-medium">Lås</span>
          </button>
          <button
            onClick={doUnlock}
            disabled={isUnlocked || isUnlocking || isJammed}
            className="flex flex-col items-center gap-2 rounded-2xl bg-accent-warm/12 py-5 text-accent-warm transition-colors hover:bg-accent-warm/20 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Icon icon="mdi:lock-open-variant" width={28} />
            <span className="text-sm font-medium">Lås opp</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
