import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import { InfrastructurePopup } from "../popups/InfrastructurePopup";

function StatusBar({ pct, color }: { pct: number | null; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: pct !== null ? `${Math.min(100, pct)}%` : "0%" }}
      />
    </div>
  );
}

function StatRow({ label, value, unit = "", pct, warn }: {
  label: string; value: string | null; unit?: string; pct?: number | null; warn?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-dim">{label}</span>
        <span className={`tabular-nums font-medium ${warn ? "text-accent-warm" : "text-text-secondary"}`}>
          {value !== null ? `${value}${unit}` : "—"}
        </span>
      </div>
      {pct !== null && pct !== undefined && (
        <StatusBar
          pct={pct}
          color={pct > 85 ? "bg-accent-red" : pct > 65 ? "bg-accent-warm" : "bg-accent-cool"}
        />
      )}
    </div>
  );
}

function SectionHeader({ icon, title, online }: { icon: string; title: string; online: boolean | null }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon icon={icon} width={15} className={online === false ? "text-text-dim" : "text-text-secondary"} />
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</span>
      {online !== null && (
        <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
          online ? "bg-accent-green/15 text-accent-green" : "bg-white/8 text-text-dim"
        }`}>
          {online ? "Online" : "Offline"}
        </span>
      )}
    </div>
  );
}

export function InfrastructureCard() {
  const entities = useHass((s) => s.entities) as HassEntities;
  const [popup, setPopup] = useState<"unraid" | "unifi" | null>(null);

  // Unraid
  const unraidCpu     = parseNumericState(entities["sensor.d_day_darling_cpu_usage"]?.state);
  const unraidRam     = parseNumericState(entities["sensor.d_day_darling_ram_usage_2"]?.state);
  const unraidArray   = parseNumericState(entities["sensor.d_day_darling_array_usage_2"]?.state);
  const arrayStarted  = entities["binary_sensor.d_day_darling_array_started"]?.state === "on";
  const parityValid   = entities["binary_sensor.d_day_darling_parity_valid"]?.state;
  const upsLoad       = parseNumericState(entities["sensor.d_day_darling_ups_load"]?.state);
  const upsBattery    = parseNumericState(entities["sensor.d_day_darling_ups_battery"]?.state);
  const upsConnected  = entities["binary_sensor.d_day_darling_ups_connected"]?.state === "on";
  const unraidVersion = entities["sensor.d_day_darling_unraid_version"]?.state;
  const unraidUptime  = entities["sensor.d_day_darling_uptime"]?.state;
  const unraidOnline  = entities["sensor.d_day_darling_cpu_usage"]?.state !== "unavailable"
    ? (unraidCpu !== null) : null;

  // UniFi
  const udmpCpu    = parseNumericState(entities["sensor.udmp_cpu"]?.state);
  const udmpMem    = parseNumericState(entities["sensor.udmp_memory"]?.state);
  const lanClients = entities["sensor.udmp_lan_clients"]?.state;
  const wlanClients = entities["sensor.udmp_wlan_clients"]?.state;
  const wanRx      = entities["sensor.udmp_wan_received"]?.state;
  const wanTx      = entities["sensor.udmp_wan_sent"]?.state;
  const udmpUptime = entities["sensor.udmp_uptime"]?.state;
  const udmpOnline = entities["sensor.udmp_lan_clients"]?.state !== "unavailable"
    ? (lanClients !== undefined && lanClients !== "unavailable") : null;

  // Speedtest — uses the Speedtest integration (sensor.speedtest_*)
  const dlSpeed    = parseNumericState(entities["sensor.speedtest_download"]?.state);
  const ulSpeed    = parseNumericState(entities["sensor.speedtest_upload"]?.state);
  const pingMs     = parseNumericState(entities["sensor.speedtest_ping"]?.state);

  return (
    <>
    <div className="space-y-4 pt-1">

      {/* ── Unraid ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setPopup("unraid")}
        className="w-full rounded-xl bg-bg-elevated p-3 space-y-2.5 text-left hover:bg-bg-elevated/70 transition-colors"
      >
        <SectionHeader icon="mdi:server" title="Unraid — D-Day Darling" online={unraidOnline} />
        <div className="space-y-2">
          <StatRow label="CPU" value={unraidCpu !== null ? unraidCpu.toFixed(0) : null} unit="%" pct={unraidCpu} />
          <StatRow label="RAM" value={unraidRam !== null ? unraidRam.toFixed(0) : null} unit="%" pct={unraidRam} />
          <StatRow label="Array" value={unraidArray !== null ? unraidArray.toFixed(0) : null} unit="%"
            pct={unraidArray} warn={unraidArray !== null && unraidArray > 85} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 border-t border-white/5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-text-dim">Array</span>
            <span className={`font-medium ${arrayStarted ? "text-accent-green" : "text-text-dim"}`}>
              {arrayStarted ? "Startet" : "Stoppet"}
            </span>
          </div>
          {parityValid !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-text-dim">Paritet</span>
              <span className={`font-medium ${parityValid === "on" ? "text-accent-green" : "text-accent-warm"}`}>
                {parityValid === "on" ? "OK" : "Feil"}
              </span>
            </div>
          )}
          {upsConnected && upsLoad !== null && (
            <div className="flex items-center justify-between">
              <span className="text-text-dim">UPS last</span>
              <span className="tabular-nums font-medium text-text-secondary">{upsLoad.toFixed(0)}%</span>
            </div>
          )}
          {upsConnected && upsBattery !== null && (
            <div className="flex items-center justify-between">
              <span className="text-text-dim">UPS batteri</span>
              <span className={`tabular-nums font-medium ${upsBattery < 30 ? "text-accent-warm" : "text-accent-green"}`}>
                {upsBattery.toFixed(0)}%
              </span>
            </div>
          )}
          {unraidVersion && (
            <div className="flex items-center justify-between col-span-2">
              <span className="text-text-dim">Versjon</span>
              <span className="font-medium text-text-secondary">{unraidVersion}</span>
            </div>
          )}
          {unraidUptime && (
            <div className="flex items-center justify-between col-span-2">
              <span className="text-text-dim">Oppetid</span>
              <span className="font-medium text-text-secondary truncate max-w-32 text-right">{unraidUptime}</span>
            </div>
          )}
        </div>
      </button>

      {/* ── UniFi ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setPopup("unifi")}
        className="w-full rounded-xl bg-bg-elevated p-3 space-y-2.5 text-left hover:bg-bg-elevated/70 transition-colors"
      >
        <SectionHeader icon="mdi:router-network" title="UniFi — UDMP" online={udmpOnline} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-text-dim">LAN-enheter</span>
            <span className="tabular-nums font-semibold text-text-secondary">{lanClients ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-dim">WiFi-enheter</span>
            <span className="tabular-nums font-semibold text-text-secondary">{wlanClients ?? "—"}</span>
          </div>
          {wanRx && (
            <div className="flex items-center justify-between">
              <span className="text-text-dim">WAN inn</span>
              <span className="tabular-nums font-medium text-text-secondary">{wanRx}</span>
            </div>
          )}
          {wanTx && (
            <div className="flex items-center justify-between">
              <span className="text-text-dim">WAN ut</span>
              <span className="tabular-nums font-medium text-text-secondary">{wanTx}</span>
            </div>
          )}
          {udmpCpu !== null && (
            <div className="flex items-center justify-between">
              <span className="text-text-dim">CPU</span>
              <span className="tabular-nums font-medium text-text-secondary">{udmpCpu.toFixed(0)}%</span>
            </div>
          )}
          {udmpMem !== null && (
            <div className="flex items-center justify-between">
              <span className="text-text-dim">RAM</span>
              <span className="tabular-nums font-medium text-text-secondary">{udmpMem.toFixed(0)}%</span>
            </div>
          )}
          {udmpUptime && (
            <div className="flex items-center justify-between col-span-2">
              <span className="text-text-dim">Oppetid</span>
              <span className="font-medium text-text-secondary">{udmpUptime}</span>
            </div>
          )}
        </div>
      </button>

      {/* ── Speedtest ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-bg-elevated p-3 space-y-2.5">
        <SectionHeader icon="mdi:speedometer" title="Speedtest" online={null} />
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums text-accent-green">
              {dlSpeed !== null && dlSpeed > 0 ? dlSpeed.toFixed(0) : "—"}
            </div>
            <div className="text-[10px] text-text-dim">↓ Mbps</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums text-accent-cool">
              {ulSpeed !== null && ulSpeed > 0 ? ulSpeed.toFixed(0) : "—"}
            </div>
            <div className="text-[10px] text-text-dim">↑ Mbps</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold tabular-nums text-text-secondary">
              {pingMs !== null && pingMs > 0 ? pingMs.toFixed(0) : "—"}
            </div>
            <div className="text-[10px] text-text-dim">Ping ms</div>
          </div>
        </div>
      </div>

    </div>
    <InfrastructurePopup type={popup} onClose={() => setPopup(null)} />
    </>
  );
}
