import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { parseNumericState } from "../../lib/format";

function StatusBar({ pct, warn }: { pct: number | null; warn?: boolean }) {
  const color =
    pct === null    ? "bg-white/20"
    : warn && pct > 85 ? "bg-accent-red"
    : pct > 75      ? "bg-accent-warm"
    : "bg-accent-cool";
  return (
    <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: pct !== null ? `${Math.min(100, pct)}%` : "0%" }}
      />
    </div>
  );
}

function Row({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-text-dim">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-medium tabular-nums ${warn ? "text-accent-warm" : "text-text-primary"}`}>
          {value}
        </span>
        {sub && <div className="text-[10px] text-text-dim">{sub}</div>}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-elevated p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon icon={icon} width={16} className="text-text-secondary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</span>
      </div>
      {children}
    </div>
  );
}

function UnraidContent({ entities }: { entities: HassEntities }) {
  const cpu        = parseNumericState(entities["sensor.d_day_darling_cpu_usage"]?.state);
  const ram        = parseNumericState(entities["sensor.d_day_darling_ram_usage_2"]?.state);
  const array      = parseNumericState(entities["sensor.d_day_darling_array_usage_2"]?.state);
  const arrayOn    = entities["binary_sensor.d_day_darling_array_started"]?.state === "on";
  const parityOk   = entities["binary_sensor.d_day_darling_parity_valid"]?.state === "on";
  const parityKnown = entities["binary_sensor.d_day_darling_parity_valid"]?.state !== undefined;
  const upsLoad    = parseNumericState(entities["sensor.d_day_darling_ups_load"]?.state);
  const upsBatt    = parseNumericState(entities["sensor.d_day_darling_ups_battery"]?.state);
  const upsConn    = entities["binary_sensor.d_day_darling_ups_connected"]?.state === "on";
  const version    = entities["sensor.d_day_darling_unraid_version"]?.state;
  const uptime     = entities["sensor.d_day_darling_uptime"]?.state;

  return (
    <div className="space-y-4">
      <Section icon="mdi:memory" title="Ressurser">
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-dim">CPU</span>
              <span className={`font-medium tabular-nums ${cpu !== null && cpu > 80 ? "text-accent-warm" : "text-text-primary"}`}>
                {cpu !== null ? `${cpu.toFixed(0)}%` : "—"}
              </span>
            </div>
            <StatusBar pct={cpu} warn />
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-dim">RAM</span>
              <span className={`font-medium tabular-nums ${ram !== null && ram > 80 ? "text-accent-warm" : "text-text-primary"}`}>
                {ram !== null ? `${ram.toFixed(0)}%` : "—"}
              </span>
            </div>
            <StatusBar pct={ram} warn />
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-dim">Array-disk</span>
              <span className={`font-medium tabular-nums ${array !== null && array > 85 ? "text-accent-red" : "text-text-primary"}`}>
                {array !== null ? `${array.toFixed(0)}%` : "—"}
              </span>
            </div>
            <StatusBar pct={array} warn />
          </div>
        </div>
      </Section>

      <Section icon="mdi:harddisk" title="Array-status">
        <Row
          label="Array"
          value={arrayOn ? "Kjører" : "Stoppet"}
          warn={!arrayOn}
        />
        {parityKnown && (
          <Row
            label="Paritet"
            value={parityOk ? "OK" : "Feil"}
            warn={!parityOk}
          />
        )}
        {version && <Row label="Versjon" value={version} />}
        {uptime && <Row label="Oppetid" value={uptime} />}
      </Section>

      {upsConn && (
        <Section icon="mdi:battery" title="UPS">
          {upsLoad !== null && (
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-dim">Last</span>
                <span className="font-medium tabular-nums text-text-primary">{upsLoad.toFixed(0)}%</span>
              </div>
              <StatusBar pct={upsLoad} warn />
            </div>
          )}
          {upsBatt !== null && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-dim">Batteri</span>
                <span className={`font-medium tabular-nums ${upsBatt < 30 ? "text-accent-warm" : "text-accent-green"}`}>
                  {upsBatt.toFixed(0)}%
                </span>
              </div>
              <StatusBar pct={upsBatt} />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

const UNIFI_NETWORKS: { id: string; name: string; entity: string }[] = [
  { id: "plex",  name: "Plex",  entity: "switch.unifi_network_plex" },
  { id: "hass",  name: "HASS",  entity: "switch.unifi_network_hass" },
];

function NetworkToggleRow({
  name, entity, entities, connection,
}: { name: string; entity: string; entities: HassEntities; connection: Connection | null }) {
  const state = entities[entity]?.state;
  if (!state || state === "unavailable") return null;
  const isOn = state === "on";

  const toggle = () => {
    if (!connection) return;
    callService(connection, "switch", isOn ? "turn_off" : "turn_on", undefined, { entity_id: entity });
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-text-secondary">{name}</span>
      <button
        onClick={toggle}
        className={`relative h-5 w-9 rounded-full transition-colors ${isOn ? "bg-accent-cool" : "bg-white/15"}`}
        aria-label={isOn ? `Skru av ${name}` : `Skru på ${name}`}
      >
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function WifiQrSection({ entities }: { entities: HassEntities }) {
  const qrEntity = entities["image.jesus_loves_you_qr_code"];
  if (!qrEntity) return null;
  const imgPath = qrEntity.attributes?.entity_picture as string | undefined;
  if (!imgPath) return null;

  return (
    <Section icon="mdi:wifi-qr-code" title='WiFi — "Jesus Loves You"'>
      <div className="flex flex-col items-center gap-2 py-1">
        <div className="rounded-xl overflow-hidden bg-white p-2">
          <img
            src={imgPath}
            alt="WiFi QR kode"
            className="w-44 h-44 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <div className="text-xs text-text-dim text-center">Skann for å koble til WiFi</div>
      </div>
    </Section>
  );
}

function UnifiContent({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  const udmpCpu    = parseNumericState(entities["sensor.udmp_cpu"]?.state);
  const udmpMem    = parseNumericState(entities["sensor.udmp_memory"]?.state);
  const lanClients = entities["sensor.udmp_lan_clients"]?.state;
  const wlanClients = entities["sensor.udmp_wlan_clients"]?.state;
  const wanRx      = entities["sensor.udmp_wan_received"]?.state;
  const wanTx      = entities["sensor.udmp_wan_sent"]?.state;
  const udmpUptime = entities["sensor.udmp_uptime"]?.state;
  const externalIp = entities["sensor.udmp_external_ip"]?.state;
  const dlSpeed    = parseNumericState(entities["sensor.udmp_speedtest_download"]?.state);
  const ulSpeed    = parseNumericState(entities["sensor.udmp_speedtest_upload"]?.state);
  const pingMs     = parseNumericState(entities["sensor.udmp_speedtest_ping"]?.state);
  const lastRun    = entities["sensor.udmp_speedtest_last_run"]?.state;

  const runSpeedtest = () => {
    if (!connection) return;
    callService(connection, "homeassistant", "update_entity", undefined, {
      entity_id: "sensor.udmp_speedtest_download",
    });
  };

  return (
    <div className="space-y-4">
      <Section icon="mdi:lan" title="Klienter">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-bg-primary p-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-accent-cool">{lanClients ?? "—"}</div>
            <div className="text-[10px] text-text-dim mt-0.5">LAN-enheter</div>
          </div>
          <div className="rounded-xl bg-bg-primary p-3 text-center">
            <div className="text-2xl font-bold tabular-nums text-accent">{wlanClients ?? "—"}</div>
            <div className="text-[10px] text-text-dim mt-0.5">WiFi-enheter</div>
          </div>
        </div>
      </Section>

      <Section icon="mdi:wifi" title="Nettverk">
        {UNIFI_NETWORKS.map((n) => (
          <NetworkToggleRow key={n.id} name={n.name} entity={n.entity} entities={entities} connection={connection} />
        ))}
      </Section>

      <Section icon="mdi:router-network" title="Router (UDMP)">
        {wanRx && <Row label="WAN inn" value={wanRx} />}
        {wanTx && <Row label="WAN ut" value={wanTx} />}
        {externalIp && <Row label="Ekstern IP" value={externalIp} />}
        {udmpCpu !== null && (
          <div>
            <div className="flex items-center justify-between text-sm pb-1">
              <span className="text-text-dim">CPU</span>
              <span className="font-medium tabular-nums text-text-primary">{udmpCpu.toFixed(0)}%</span>
            </div>
            <StatusBar pct={udmpCpu} warn />
          </div>
        )}
        {udmpMem !== null && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-sm pb-1">
              <span className="text-text-dim">RAM</span>
              <span className="font-medium tabular-nums text-text-primary">{udmpMem.toFixed(0)}%</span>
            </div>
            <StatusBar pct={udmpMem} warn />
          </div>
        )}
        {udmpUptime && <Row label="Oppetid" value={udmpUptime} />}
      </Section>

      <WifiQrSection entities={entities} />

      <Section icon="mdi:speedometer" title="Speedtest">
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <div className="text-xl font-bold tabular-nums text-accent-green">
              {dlSpeed !== null && dlSpeed > 0 ? dlSpeed.toFixed(0) : "—"}
            </div>
            <div className="text-[10px] text-text-dim">↓ Mbps</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold tabular-nums text-accent-cool">
              {ulSpeed !== null && ulSpeed > 0 ? ulSpeed.toFixed(0) : "—"}
            </div>
            <div className="text-[10px] text-text-dim">↑ Mbps</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold tabular-nums text-text-secondary">
              {pingMs !== null && pingMs > 0 ? pingMs.toFixed(0) : "—"}
            </div>
            <div className="text-[10px] text-text-dim">Ping ms</div>
          </div>
        </div>
        {lastRun && lastRun !== "0" && (
          <div className="text-[10px] text-text-dim mb-3">Sist: {lastRun}</div>
        )}
        <button
          onClick={runSpeedtest}
          className="w-full rounded-xl bg-accent/15 py-2.5 text-sm font-medium text-accent hover:bg-accent/25 transition-colors"
        >
          Kjør speedtest
        </button>
      </Section>
    </div>
  );
}

interface InfrastructurePopupProps {
  type: "unraid" | "unifi" | null;
  onClose: () => void;
}

export function InfrastructurePopup({ type, onClose }: InfrastructurePopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  const title = type === "unraid" ? "Unraid — D-Day Darling" : "UniFi — UDMP";
  const icon  = type === "unraid" ? "mdi:server"              : "mdi:router-network";

  return (
    <BottomSheet open={type !== null} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pb-3 shrink-0 border-b border-white/5">
        <Icon icon={icon} width={20} className="text-text-secondary" />
        <span className="text-base font-semibold">{title}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0">
        {type === "unraid" && <UnraidContent entities={entities} />}
        {type === "unifi"  && <UnifiContent entities={entities} connection={connection} />}
      </div>
    </BottomSheet>
  );
}
