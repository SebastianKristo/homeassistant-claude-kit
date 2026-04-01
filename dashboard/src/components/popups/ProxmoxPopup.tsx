import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { parseNumericState } from "../../lib/format";
import {
  PVE_STATUS, PVE_CPU, PVE_MAX_CPU,
  PVE_MEM_PCT, PVE_MEM_USED, PVE_MEM_MAX,
  PVE_DISK_USED, PVE_DISK_MAX,
  PVE_UPTIME, PVE_BACKUP_STATUS, PVE_LAST_BACKUP, PVE_BACKUP_DURATION,
  PVE_UNRAID_USED, PVE_UNRAID_TOTAL, PVE_UNRAID_PCT,
  SYSTEM_CPU, SYSTEM_RAM, SYSTEM_DISK_USED, SYSTEM_DISK_MAX,
  SYSTEM_UPTIME_H, SYSTEM_NET_IN, SYSTEM_NET_OUT, SYSTEM_VM_STATUS,
  SYSTEM_MEM_USED, SYSTEM_MEM_MAX,
  HA_UPDATE_CORE, HA_UPDATE_OS, HA_UPDATE_SUPERVISOR,
} from "../../lib/entities";

interface ProxmoxPopupProps {
  open: boolean;
  onClose: () => void;
}

function formatGb(gb: number | null): string {
  if (gb === null) return "—";
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(0)} GB`;
}

function formatUptime(hours: number | null): string {
  if (hours === null) return "—";
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  if (d > 0) return `${d}d ${h}t`;
  return `${h}t`;
}

function formatBackupAge(isoStr: string | undefined): string {
  if (!isoStr) return "—";
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d} dager siden`;
    if (h > 0) return `${h}t siden`;
    return "Nylig";
  } catch { return "—"; }
}

function GaugeBar({ label, pct, warn = 70, crit = 85, detail }: {
  label: string; pct: number | null; warn?: number; crit?: number; detail?: string;
}) {
  const p = pct ?? 0;
  const color = p > crit ? "bg-accent-red" : p > warn ? "bg-accent-warm" : "bg-accent-green";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="tabular-nums text-text-dim">{detail ?? (pct !== null ? `${p.toFixed(1)}%` : "—")}</span>
      </div>
      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, badge, badgeOk }: {
  icon: string; title: string; badge?: string; badgeOk?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon icon={icon} width={16} className="text-text-secondary" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {badge !== undefined && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          badgeOk ? "bg-accent-green/15 text-accent-green" : "bg-accent-red/15 text-accent-red"
        }`}>
          {badge}
        </span>
      )}
    </div>
  );
}

export function ProxmoxPopup({ open, onClose }: ProxmoxPopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  // ── Proxmox node ────────────────────────────────────────────────────────
  const pveOnline      = entities[PVE_STATUS]?.state === "online";
  const pveCpu         = parseNumericState(entities[PVE_CPU]?.state);
  const pveMaxCpu      = parseNumericState(entities[PVE_MAX_CPU]?.state);
  const pveMem         = parseNumericState(entities[PVE_MEM_PCT]?.state);
  const pveMemUsed     = parseNumericState(entities[PVE_MEM_USED]?.state);
  const pveMemMax      = parseNumericState(entities[PVE_MEM_MAX]?.state);
  const pveDiskUsed    = parseNumericState(entities[PVE_DISK_USED]?.state);
  const pveDiskMax     = parseNumericState(entities[PVE_DISK_MAX]?.state);
  const pveDiskPct     = pveDiskUsed !== null && pveDiskMax !== null && pveDiskMax > 0
    ? (pveDiskUsed / pveDiskMax) * 100 : null;
  const pveUptime      = parseNumericState(entities[PVE_UPTIME]?.state);
  const backupOk       = entities[PVE_BACKUP_STATUS]?.state === "on";
  const lastBackup     = entities[PVE_LAST_BACKUP]?.state;
  const backupDuration = parseNumericState(entities[PVE_BACKUP_DURATION]?.state);
  const unraidPct      = parseNumericState(entities[PVE_UNRAID_PCT]?.state);
  const unraidUsed     = parseNumericState(entities[PVE_UNRAID_USED]?.state);
  const unraidTotal    = parseNumericState(entities[PVE_UNRAID_TOTAL]?.state);

  // ── HA VM ────────────────────────────────────────────────────────────────
  const haVmOnline  = entities[SYSTEM_VM_STATUS]?.state === "running";
  const haCpu       = parseNumericState(entities[SYSTEM_CPU]?.state);
  const haRamPct    = parseNumericState(entities[SYSTEM_RAM]?.state);
  const haMemUsed   = parseNumericState(entities[SYSTEM_MEM_USED]?.state);
  const haMemMax    = parseNumericState(entities[SYSTEM_MEM_MAX]?.state);
  const haDiskUsed  = parseNumericState(entities[SYSTEM_DISK_USED]?.state);
  const haDiskMax   = parseNumericState(entities[SYSTEM_DISK_MAX]?.state);
  const haDiskPct   = haDiskUsed !== null && haDiskMax !== null && haDiskMax > 0
    ? (haDiskUsed / haDiskMax) * 100 : null;
  const haUptime    = parseNumericState(entities[SYSTEM_UPTIME_H]?.state);
  const haNetIn     = parseNumericState(entities[SYSTEM_NET_IN]?.state);
  const haNetOut    = parseNumericState(entities[SYSTEM_NET_OUT]?.state);

  // ── HA versions ──────────────────────────────────────────────────────────
  const haCore    = (entities[HA_UPDATE_CORE]?.attributes as Record<string,unknown> | undefined)?.installed_version as string | undefined;
  const haOs      = (entities[HA_UPDATE_OS]?.attributes as Record<string,unknown> | undefined)?.installed_version as string | undefined;
  const haSuperv  = (entities[HA_UPDATE_SUPERVISOR]?.attributes as Record<string,unknown> | undefined)?.installed_version as string | undefined;
  const haUpdateAvailable = entities[HA_UPDATE_CORE]?.state === "on"
    || entities[HA_UPDATE_OS]?.state === "on"
    || entities[HA_UPDATE_SUPERVISOR]?.state === "on";

  const pressButton = (entityId: string) => {
    if (!connection) return;
    callService(connection, "button", "press", {}, { entity_id: entityId });
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Proxmox & Home Assistant</Dialog.Title>
      <Dialog.Description className="sr-only">Serverdetaljer for Proxmox og Home Assistant VM</Dialog.Description>

      <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:server" width={20} className={pveOnline ? "text-accent-green" : "text-accent-red"} />
          <h2 className="text-base font-semibold">Proxmox & Home Assistant</h2>
        </div>

        {/* ── Proxmox node ─────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-bg-card p-4 space-y-3">
          <SectionHeader
            icon="mdi:server-network"
            title="Proxmox Node (pve)"
            badge={pveOnline ? "Online" : "Offline"}
            badgeOk={pveOnline}
          />

          <GaugeBar
            label="CPU"
            pct={pveCpu}
            detail={pveCpu !== null ? `${pveCpu.toFixed(1)}%${pveMaxCpu !== null ? ` · ${pveMaxCpu} kjerner` : ""}` : undefined}
          />
          <GaugeBar
            label="RAM"
            pct={pveMem}
            detail={pveMemUsed !== null && pveMemMax !== null
              ? `${pveMemUsed.toFixed(1)} / ${pveMemMax.toFixed(1)} GB`
              : pveMem !== null ? `${pveMem.toFixed(1)}%` : undefined}
          />
          <GaugeBar
            label="Disk (lokal)"
            pct={pveDiskPct}
            detail={pveDiskUsed !== null && pveDiskMax !== null
              ? `${formatGb(pveDiskUsed)} / ${formatGb(pveDiskMax)}`
              : undefined}
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-xl bg-bg-elevated px-3 py-2">
              <div className="text-[10px] text-text-dim">Oppetid</div>
              <div className="text-sm font-semibold">{formatUptime(pveUptime)}</div>
            </div>
            <div className="rounded-xl bg-bg-elevated px-3 py-2">
              <div className="text-[10px] text-text-dim">Siste backup</div>
              <div className="text-sm font-semibold">{formatBackupAge(lastBackup)}</div>
            </div>
          </div>

          {/* Backup status */}
          <div className={`flex items-center justify-between rounded-xl px-3 py-2 ${
            backupOk ? "bg-accent-green/8" : "bg-accent-red/8"
          }`}>
            <div className="flex items-center gap-2">
              <Icon icon="mdi:backup-restore" width={15}
                className={backupOk ? "text-accent-green" : "text-accent-red"} />
              <span className="text-xs">Backup</span>
            </div>
            <div className="text-right">
              <span className={`text-xs font-medium ${backupOk ? "text-accent-green" : "text-accent-red"}`}>
                {backupOk ? "OK" : "Feil"}
              </span>
              {backupDuration !== null && (
                <span className="ml-2 text-[10px] text-text-dim">
                  {backupDuration.toFixed(1)} min
                </span>
              )}
            </div>
          </div>

          {/* Unraid storage */}
          {unraidTotal !== null && (
            <GaugeBar
              label="Unraid lagring"
              pct={unraidPct}
              warn={75}
              crit={90}
              detail={unraidUsed !== null && unraidTotal !== null
                ? `${formatGb(unraidUsed)} / ${formatGb(unraidTotal)}`
                : undefined}
            />
          )}

          {/* Control buttons */}
          <div className="flex gap-2 flex-wrap pt-1 border-t border-white/5">
            {[
              { label: "Restart", entity: "button.pve_restart", icon: "mdi:restart", color: "bg-accent-warm/10 text-accent-warm" },
              { label: "Shutdown", entity: "button.pve_shutdown", icon: "mdi:power", color: "bg-accent-red/10 text-accent-red" },
              { label: "Start alle", entity: "button.pve_start_all", icon: "mdi:play", color: "bg-accent-green/10 text-accent-green" },
              { label: "Stop alle", entity: "button.pve_stop_all", icon: "mdi:stop", color: "bg-white/6 text-text-secondary" },
            ].map(({ label, entity, icon, color }) => (
              <button
                key={entity}
                onClick={() => pressButton(entity)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-110 active:scale-95 ${color}`}
              >
                <Icon icon={icon} width={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Home Assistant VM ────────────────────────────────────────── */}
        <div className="rounded-2xl bg-bg-card p-4 space-y-3">
          <SectionHeader
            icon="mdi:home-assistant"
            title="Home Assistant VM"
            badge={haVmOnline ? "Running" : "Stopped"}
            badgeOk={haVmOnline}
          />

          <GaugeBar
            label="CPU"
            pct={haCpu !== null ? parseFloat(haCpu.toString()) : null}
            detail={haCpu !== null ? `${Number(haCpu).toFixed(1)}%` : undefined}
          />
          <GaugeBar
            label="RAM"
            pct={haRamPct}
            detail={haMemUsed !== null && haMemMax !== null
              ? `${haMemUsed.toFixed(1)} / ${haMemMax.toFixed(1)} GB`
              : haRamPct !== null ? `${haRamPct.toFixed(1)}%` : undefined}
          />
          <GaugeBar
            label="Disk"
            pct={haDiskPct}
            detail={haDiskUsed !== null && haDiskMax !== null
              ? `${formatGb(haDiskUsed)} / ${formatGb(haDiskMax)}`
              : undefined}
          />

          {(haNetIn !== null || haNetOut !== null) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-bg-elevated px-3 py-2">
                <div className="text-[10px] text-text-dim">↓ Nettverk inn</div>
                <div className="text-sm font-semibold tabular-nums">
                  {haNetIn !== null ? `${haNetIn.toFixed(1)} MB/s` : "—"}
                </div>
              </div>
              <div className="rounded-xl bg-bg-elevated px-3 py-2">
                <div className="text-[10px] text-text-dim">↑ Nettverk ut</div>
                <div className="text-sm font-semibold tabular-nums">
                  {haNetOut !== null ? `${haNetOut.toFixed(1)} MB/s` : "—"}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-bg-elevated px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:clock-outline" width={14} className="text-text-dim" />
              <span className="text-xs text-text-secondary">Oppetid</span>
            </div>
            <span className="text-xs font-medium tabular-nums">{formatUptime(haUptime)}</span>
          </div>

          {/* Versions */}
          <div className="space-y-1.5 border-t border-white/5 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-dim uppercase tracking-wide">Versjoner</span>
              {haUpdateAvailable && (
                <span className="text-[10px] font-medium text-accent-warm bg-accent-warm/10 px-1.5 py-0.5 rounded-full">
                  Oppdatering tilgjengelig
                </span>
              )}
            </div>
            {[
              { label: "Core", version: haCore, update: entities[HA_UPDATE_CORE]?.state === "on" },
              { label: "OS", version: haOs, update: entities[HA_UPDATE_OS]?.state === "on" },
              { label: "Supervisor", version: haSuperv, update: entities[HA_UPDATE_SUPERVISOR]?.state === "on" },
            ].map(({ label, version, update }) => version && (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs tabular-nums font-medium">{version}</span>
                  {update && <Icon icon="mdi:arrow-up-circle" width={13} className="text-accent-warm" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
