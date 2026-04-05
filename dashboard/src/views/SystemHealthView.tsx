import { useState } from "react";
import { Icon } from "@iconify/react";
import { formatTimeAgo } from "../lib/format";
import { useHealthData } from "../hooks/useHealthData";
import { MONITORED_INTEGRATIONS } from "./health-constants";
import { BatteryRow } from "./BatteryRow";
import { Gauge } from "./Gauge";
import { ProxmoxPopup } from "../components/popups/ProxmoxPopup";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { parseNumericState } from "../lib/format";
import {
  HA_UPDATE_CORE, HA_UPDATE_OS, HA_UPDATE_SUPERVISOR,
  PVE_CPU, PVE_MEM_PCT, PVE_DISK_USED, PVE_DISK_MAX,
  PVE_UPTIME, PVE_STATUS, PVE_UNRAID_PCT, PVE_UNRAID_USED, PVE_UNRAID_TOTAL,
} from "../lib/entities";

function diskPct(used: number | null, max: number | null): number {
  if (used === null || max === null || max === 0) return 0;
  return Math.min(100, (used / max) * 100);
}

export function SystemHealthView() {
  const [proxmoxOpen, setProxmoxOpen] = useState(false);
  const allEntities = useHass((s) => s.entities) as HassEntities;

  // Proxmox host
  const pveCpu      = parseNumericState(allEntities[PVE_CPU]?.state);
  const pveMem      = parseNumericState(allEntities[PVE_MEM_PCT]?.state);
  const pveDiskUsed = parseNumericState(allEntities[PVE_DISK_USED]?.state);
  const pveDiskMax  = parseNumericState(allEntities[PVE_DISK_MAX]?.state);
  const pveUptime   = parseNumericState(allEntities[PVE_UPTIME]?.state);
  const pveStatus   = allEntities[PVE_STATUS]?.state;
  const unraidPct   = parseNumericState(allEntities[PVE_UNRAID_PCT]?.state);
  const unraidUsed  = parseNumericState(allEntities[PVE_UNRAID_USED]?.state);
  const unraidTotal = parseNumericState(allEntities[PVE_UNRAID_TOTAL]?.state);

  const pveUptimeText = pveUptime !== null
    ? pveUptime >= 24 ? `${Math.floor(pveUptime / 24)}d ${Math.floor(pveUptime % 24)}t` : `${pveUptime.toFixed(0)}t`
    : null;

  const {
    cpu,
    ram,
    diskUsedGb,
    diskMaxGb,
    vmStatus,
    batteries,
    criticalBatteries,
    staleSensors,
    healthEvents,
    uptimeText,
    healthyCount,
    entities,
  } = useHealthData();

  const haCore   = (entities[HA_UPDATE_CORE]?.attributes as Record<string,unknown> | undefined)?.installed_version as string | undefined;
  const haOs     = (entities[HA_UPDATE_OS]?.attributes as Record<string,unknown> | undefined)?.installed_version as string | undefined;
  const haUpdateAvailable = entities[HA_UPDATE_CORE]?.state === "on"
    || entities[HA_UPDATE_OS]?.state === "on"
    || entities[HA_UPDATE_SUPERVISOR]?.state === "on";

  return (
    <>
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">System Health</h1>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
          Admin
        </span>
      </div>

      {/* Integration status */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary">
            Integrations
          </h2>
          <span
            className={`text-xs font-medium ${
              healthyCount === MONITORED_INTEGRATIONS.length
                ? "text-accent-green"
                : "text-accent-warm"
            }`}
          >
            {healthyCount} / {MONITORED_INTEGRATIONS.length}
          </span>
        </div>
        <div className="space-y-2">
          {MONITORED_INTEGRATIONS.map((integration) => {
            const entity = entities[integration.entity];
            const isOk =
              entity !== undefined &&
              entity.state !== "unavailable" &&
              entity.state !== "unknown";
            return (
              <div
                key={integration.name}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    icon={integration.icon}
                    width={16}
                    className={isOk ? "text-text-dim" : "text-accent-red"}
                  />
                  <span className="text-sm">{integration.name}</span>
                </div>
                <span
                  className={`text-xs font-medium ${
                    isOk ? "text-accent-green" : "text-accent-red"
                  }`}
                >
                  {isOk ? "OK" : "Down"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stale sensors */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary">
            Stale Sensors
          </h2>
          <span
            className={`text-xs font-medium ${
              staleSensors.length === 0 ? "text-accent-green" : "text-accent-warm"
            }`}
          >
            {staleSensors.length}
          </span>
        </div>
        {staleSensors.length === 0 ? (
          <p className="text-xs text-text-dim">
            All monitored sensors updating normally
          </p>
        ) : (
          <div className="space-y-2">
            {staleSensors.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    icon="mdi:clock-alert-outline"
                    width={16}
                    className="text-accent-warm"
                  />
                  <span className="text-sm">{s.name}</span>
                </div>
                <span className="text-xs text-accent-warm">
                  {s.hoursAgo}h ago
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Batteries */}
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary">
            Batteries
          </h2>
          <span className="text-xs text-text-dim">
            {batteries.length} devices
          </span>
        </div>

        {criticalBatteries.length > 0 && (
          <div className="mb-3 rounded-xl bg-accent-red/10 p-3">
            <p className="mb-2 text-xs font-medium text-accent-red">
              Critical (&lt;20%)
            </p>
            <div className="space-y-2">
              {criticalBatteries.map((b) => (
                <BatteryRow key={b.entityId} battery={b} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {batteries
            .filter((b) => b.level >= 20)
            .map((b) => (
              <BatteryRow key={b.entityId} battery={b} />
            ))}
        </div>

        {batteries.length === 0 && (
          <p className="text-xs text-text-dim">No battery sensors found</p>
        )}
      </div>

      {/* Proxmox host */}
      <button
        onClick={() => setProxmoxOpen(true)}
        className="w-full text-left rounded-2xl bg-bg-card p-4 hover:bg-bg-elevated transition-colors"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="simple-icons:proxmox" width={16} className="text-accent-warm" />
            <h2 className="text-sm font-medium text-text-secondary">Proxmox</h2>
          </div>
          <div className="flex items-center gap-2">
            {pveStatus && (
              <span className={`text-xs font-medium ${pveStatus === "online" ? "text-accent-green" : "text-accent-red"}`}>
                {pveStatus}
              </span>
            )}
            {pveUptimeText && (
              <span className="text-[10px] text-text-dim">{pveUptimeText}</span>
            )}
            <Icon icon="mdi:chevron-right" width={14} className="text-text-dim" />
          </div>
        </div>
        <div className="space-y-3">
          <Gauge label="CPU" value={pveCpu !== null ? `${pveCpu.toFixed(1)}%` : undefined} />
          <Gauge label="RAM" value={pveMem !== null ? `${pveMem.toFixed(1)}%` : undefined} />
          <div className="flex items-center gap-3">
            <span className="w-10 text-xs text-text-secondary">Disk</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated">
              <div
                className={`h-full rounded-full transition-all ${
                  diskPct(pveDiskUsed, pveDiskMax) > 85 ? "bg-accent-red"
                  : diskPct(pveDiskUsed, pveDiskMax) > 60 ? "bg-accent-warm"
                  : "bg-accent-green"
                }`}
                style={{ width: `${diskPct(pveDiskUsed, pveDiskMax)}%` }}
              />
            </div>
            <span className="w-20 text-right text-xs text-text-secondary">
              {pveDiskUsed !== null && pveDiskMax !== null
                ? `${pveDiskUsed.toFixed(0)} / ${pveDiskMax.toFixed(0)} GB`
                : "—"}
            </span>
          </div>
          {(unraidPct !== null || unraidUsed !== null) && (
            <div className="flex items-center gap-3">
              <span className="w-10 text-xs text-text-secondary">NAS</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated">
                <div
                  className={`h-full rounded-full transition-all ${
                    (unraidPct ?? 0) > 85 ? "bg-accent-red"
                    : (unraidPct ?? 0) > 70 ? "bg-accent-warm"
                    : "bg-accent-cool"
                  }`}
                  style={{ width: `${unraidPct ?? 0}%` }}
                />
              </div>
              <span className="w-20 text-right text-xs text-text-secondary">
                {unraidUsed !== null && unraidTotal !== null
                  ? `${(unraidUsed / 1024).toFixed(1)} / ${(unraidTotal / 1024).toFixed(1)} TB`
                  : unraidPct !== null ? `${unraidPct.toFixed(0)}%` : "—"}
              </span>
            </div>
          )}
        </div>
      </button>

      {/* HA VM */}
      <button
        onClick={() => setProxmoxOpen(true)}
        className="w-full text-left rounded-2xl bg-bg-card p-4 hover:bg-bg-elevated transition-colors"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:home-assistant" width={16} className="text-text-secondary" />
            <h2 className="text-sm font-medium text-text-secondary">Home Assistant</h2>
          </div>
          <div className="flex items-center gap-2">
            {haUpdateAvailable && (
              <span className="text-[10px] font-medium bg-accent-warm/15 text-accent-warm px-1.5 py-0.5 rounded-full">
                Oppdatering
              </span>
            )}
            {vmStatus && (
              <span className={`text-xs font-medium ${vmStatus === "running" ? "text-accent-green" : "text-accent-red"}`}>
                {vmStatus}
              </span>
            )}
            <Icon icon="mdi:chevron-right" width={14} className="text-text-dim" />
          </div>
        </div>
        <div className="space-y-3">
          <Gauge label="CPU" value={cpu} />
          <Gauge label="RAM" value={ram} />
          <div className="flex items-center gap-3">
            <span className="w-10 text-xs text-text-secondary">Disk</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated">
              <div
                className={`h-full rounded-full transition-all ${
                  diskPct(diskUsedGb, diskMaxGb) > 85 ? "bg-accent-red"
                  : diskPct(diskUsedGb, diskMaxGb) > 60 ? "bg-accent-warm"
                  : "bg-accent-green"
                }`}
                style={{ width: `${diskPct(diskUsedGb, diskMaxGb)}%` }}
              />
            </div>
            <span className="w-20 text-right text-xs text-text-secondary">
              {diskUsedGb !== null && diskMaxGb !== null
                ? `${diskUsedGb.toFixed(1)} / ${diskMaxGb.toFixed(1)} GB`
                : "—"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
          {uptimeText && (
            <div className="flex items-center gap-2">
              <Icon icon="mdi:clock-check-outline" width={14} className="text-text-dim" />
              <span className="text-xs text-text-secondary">Oppetid: {uptimeText.uptime}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            {haCore && <span className="text-[10px] text-text-dim">Core {haCore}</span>}
            {haOs && <span className="text-[10px] text-text-dim">OS {haOs}</span>}
          </div>
        </div>
      </button>

      {/* Health events */}
      <div className="rounded-2xl bg-bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">
          Health Events
        </h2>
        {healthEvents.length === 0 ? (
          <p className="text-xs text-text-dim">No health automations found</p>
        ) : (
          <div className="space-y-2">
            {healthEvents.map((event) => (
              <div
                key={event.label}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${
                      event.state === "on"
                        ? "bg-accent-green"
                        : "bg-text-dim"
                    }`}
                  />
                  <span className="text-sm">{event.label}</span>
                </div>
                <span className="text-xs text-text-dim">
                  {formatTimeAgo(event.triggered)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="h-20" />
    </div>

    <ProxmoxPopup open={proxmoxOpen} onClose={() => setProxmoxOpen(false)} />
    </>
  );
}
