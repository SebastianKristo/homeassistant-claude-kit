import { useState, useMemo, useRef, useEffect } from "react";
import { useHass } from "@hakit/core";
import { callService } from "home-assistant-js-websocket";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../lib/format";
import { ROOMS } from "../lib/areas";
import {
  CONTEXT_CONFIG,
  QUICK_ACTIONS_CONFIG,
  ACTIVE_AUTOMATIONS_CONFIG,
  LOCKS,
  ALARM,
  ENERGY_CONFIG,
  ANKOMMER_I_MORGEN,
  SOMMER_MODUS,
  AWAY_MODE,
  ELEC_MAPS_CO2, ELEC_MAPS_FOSSIL,
  LYN_DISTANCE, LYN_AZIMUTH, LYN_COUNTER, LYN_AREA,
  LIGHTNING_LAT, LIGHTNING_LON,
  WASTE_RESTAVFALL, WASTE_MATAVFALL, WASTE_PAPIR, WASTE_PLAST, WASTE_GLASS_METALL,
} from "../lib/entities";
import { ContextCard } from "../components/cards/ContextCard";
import { QuickActions } from "../components/cards/QuickActions";
import { ActiveAutomations } from "../components/cards/ActiveAutomations";
import { MediaPlayerCard } from "../components/cards/MediaPlayerCard";
import { LockPopup } from "../components/popups/LockPopup";
import { AlarmPopup } from "../components/popups/AlarmPopup";
import { NorgesporisPopup } from "../components/popups/NorgesporisPopup";
import { MediaPlayersPopup } from "../components/popups/MediaPlayersPopup";
import { RemotePopup } from "../components/popups/RemotePopup";
import { BottomSheet } from "../components/popups/BottomSheet";
import { PopoverSelect } from "../components/controls/PopoverSelect";
import * as Dialog from "@radix-ui/react-dialog";

/** Greeting based on hour */
function useGreeting(userName: string): string {
  const hour = new Date().getHours();
  const name = userName ? `, ${userName}` : "";
  if (hour >= 5 && hour < 12)  return `God morgen${name}`;
  if (hour >= 12 && hour < 17) return `God ettermiddag${name}`;
  if (hour >= 17 && hour < 22) return `God kveld${name}`;
  return `God natt${name}`;
}

function NorgesprisSavingsBar({ entities, onTap }: { entities: HassEntities; onTap: () => void }) {
  const savingsDay   = parseNumericState(entities[ENERGY_CONFIG.norgesprisSavingsDay]?.state);
  const savingsMonth = parseNumericState(entities[ENERGY_CONFIG.norgesprisSavingsMonth]?.state);
  if (savingsDay === null && savingsMonth === null) return null;

  const dayPositive   = savingsDay !== null && savingsDay >= 0;
  const monthPositive = savingsMonth !== null && savingsMonth >= 0;

  return (
    <button
      onClick={onTap}
      className="flex w-full items-center gap-3 rounded-2xl bg-bg-card px-4 py-3 transition-colors hover:bg-bg-elevated active:bg-bg-elevated"
    >
      <Icon icon="mdi:piggy-bank-outline" width={20} className="text-accent-green shrink-0" />
      <div className="min-w-0 flex-1 flex items-center gap-4">
        {savingsDay !== null && (
          <div>
            <div className="text-[10px] text-text-dim">I dag</div>
            <div className={`text-sm font-semibold tabular-nums ${dayPositive ? "text-accent-green" : "text-accent-red"}`}>
              {dayPositive ? "+" : ""}{savingsDay.toFixed(2)} kr
            </div>
          </div>
        )}
        {savingsMonth !== null && (
          <div>
            <div className="text-[10px] text-text-dim">Denne måneden</div>
            <div className={`text-sm font-semibold tabular-nums ${monthPositive ? "text-accent-green" : "text-accent-red"}`}>
              {monthPositive ? "+" : ""}{savingsMonth.toFixed(2)} kr
            </div>
          </div>
        )}
        <span className="text-xs text-text-dim">Tibber</span>
      </div>
      <Icon icon="mdi:chevron-right" width={16} className="text-text-dim shrink-0" />
    </button>
  );
}

function azimuthToCompass(deg: number): string {
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return dirs[Math.round(deg / 45) % 8];
}

function LightningSection({ entities }: { entities: HassEntities }) {
  const lat      = parseNumericState(entities[LIGHTNING_LAT]?.state);
  const lon      = parseNumericState(entities[LIGHTNING_LON]?.state);
  const distance = parseNumericState(entities[LYN_DISTANCE]?.state);
  const azimuth  = parseNumericState(entities[LYN_AZIMUTH]?.state);
  const counter  = parseNumericState(entities[LYN_COUNTER]?.state) ?? 0;
  const area     = entities[LYN_AREA]?.state;
  const hasData  = distance !== null || lat !== null;

  return (
    <div className="space-y-2 pt-2 border-t border-white/5">
      <div className="flex items-center gap-2">
        <Icon icon="mdi:lightning-bolt" width={16} className={counter > 0 ? "text-accent-warm" : "text-text-dim"} />
        <span className="text-sm font-semibold">Lynnedslag</span>
        {counter > 0 && (
          <span className="text-xs font-medium bg-accent-warm/15 text-accent-warm rounded-full px-2 py-0.5">
            {counter} registrert
          </span>
        )}
      </div>

      {!hasData && counter === 0 && (
        <div className="text-xs text-text-dim">Ingen lynnedslag registrert</div>
      )}

      {(hasData || counter > 0) && (
        <div className="rounded-xl bg-bg-elevated p-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            {distance !== null && (
              <div>
                <div className="text-[10px] text-text-dim mb-0.5">Avstand</div>
                <div className="text-sm font-bold tabular-nums">{distance.toFixed(0)} km</div>
              </div>
            )}
            {azimuth !== null && (
              <div>
                <div className="text-[10px] text-text-dim mb-0.5">Retning</div>
                <div className="text-sm font-bold">{azimuthToCompass(azimuth)} ({azimuth.toFixed(0)}°)</div>
              </div>
            )}
          </div>
          {area && area !== "unknown" && (
            <div className="text-xs text-text-dim truncate">Område: {area}</div>
          )}
          {lat !== null && lon !== null && (
            <div className="rounded-lg overflow-hidden bg-bg-primary mt-1">
              <img
                src={`https://staticmap.openstreetmap.de/staticmap.php?center=${lat.toFixed(4)},${lon.toFixed(4)}&zoom=7&size=600x180&markers=${lat.toFixed(4)},${lon.toFixed(4)},red`}
                alt="Kart over lynnedslag"
                className="w-full h-28 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ElectricityMapSection({ entities }: { entities: HassEntities }) {
  const co2    = parseNumericState(entities[ELEC_MAPS_CO2]?.state);
  const fossil = parseNumericState(entities[ELEC_MAPS_FOSSIL]?.state);
  if (co2 === null && fossil === null) return null;

  const co2Color     = co2 === null ? "bg-white/20" : co2 < 50 ? "bg-accent-green" : co2 < 200 ? "bg-accent-warm" : "bg-accent-red";
  const co2TextColor = co2 === null ? "text-text-dim" : co2 < 50 ? "text-accent-green" : co2 < 200 ? "text-accent-warm" : "text-accent-red";

  return (
    <div className="space-y-2 pt-2 border-t border-white/5">
      <div className="flex items-center gap-2">
        <Icon icon="mdi:transmission-tower" width={16} className="text-accent-cool" />
        <span className="text-sm font-semibold">Strømmix</span>
        <span className="text-xs text-text-dim">NO-NO1</span>
      </div>
      <div className="rounded-xl bg-bg-elevated p-3 space-y-2.5">
        {co2 !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-dim">CO₂-intensitet</span>
              <span className={`font-semibold tabular-nums ${co2TextColor}`}>{co2.toFixed(0)} gCO₂/kWh</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${co2Color}`} style={{ width: `${Math.min(100, co2 / 4)}%` }} />
            </div>
          </div>
        )}
        {fossil !== null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-dim">Fossil andel</span>
            <span className="font-semibold tabular-nums text-accent-green">{fossil.toFixed(1)}%</span>
          </div>
        )}
        <div className="text-[10px] text-text-dim">Kilde: Electricity Maps</div>
      </div>
    </div>
  );
}

function daysUntil(dateStr: string | undefined): number | null {
  if (!dateStr || dateStr === "unknown" || dateStr === "unavailable") return null;
  const pickup = new Date(dateStr);
  if (isNaN(pickup.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  pickup.setHours(0, 0, 0, 0);
  return Math.round((pickup.getTime() - today.getTime()) / 86_400_000);
}

/** Min Renovasjon sensors store the next pickup date as an attribute key (YYYY-MM-DD). */
function nextPickupDate(entity: { attributes?: Record<string, unknown> } | undefined): string | undefined {
  if (!entity?.attributes) return undefined;
  return Object.keys(entity.attributes).find((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
}

const WASTE_BINS = [
  { entity: WASTE_RESTAVFALL,   label: "Restavfall",        icon: "mdi:trash-can-outline" },
  { entity: WASTE_MATAVFALL,    label: "Matavfall",          icon: "mdi:food-apple-outline" },
  { entity: WASTE_PAPIR,        label: "Papir",              icon: "mdi:newspaper-variant-outline" },
  { entity: WASTE_PLAST,        label: "Plast",              icon: "mdi:recycle" },
  { entity: WASTE_GLASS_METALL, label: "Glass/Metall",       icon: "mdi:bottle-wine-outline" },
];

function wasteColor(days: number | null): string {
  if (days === 0) return "text-accent-red";
  if (days === 1) return "text-accent-warm";
  return "text-text-secondary";
}

function wasteDayLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0)    return "I dag!";
  if (days === 1)    return "I morgen";
  return `${days} dager`;
}

function WasteCard({ entities, onOpen }: { entities: HassEntities; onOpen: () => void }) {
  const items = WASTE_BINS.map(({ entity, label, icon }) => {
    const e = entities[entity];
    const dateStr = nextPickupDate(e);
    return { label, icon, days: daysUntil(dateStr), dateStr };
  });

  if (items.every((i) => i.days === null)) return null;

  const urgentAny = items.some((i) => i.days !== null && i.days <= 1);
  const nextItem  = items
    .filter((i) => i.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number))[0];

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left rounded-2xl overflow-hidden bg-bg-card transition-colors hover:bg-bg-elevated active:bg-bg-elevated ${
        urgentAny ? "ring-1 ring-accent-warm/30" : ""
      }`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:delete-sweep-outline" width={16} className="text-text-dim shrink-0" />
          <span className="text-xs font-medium text-text-dim">Søppelhenting</span>
        </div>
        {nextItem && (
          <span className={`text-xs font-medium ${wasteColor(nextItem.days)}`}>
            {nextItem.label} {wasteDayLabel(nextItem.days).toLowerCase()}
          </span>
        )}
        <Icon icon="mdi:chevron-right" width={14} className="text-text-dim shrink-0" />
      </div>
      <div className="flex divide-x divide-white/5">
        {items.map(({ label, icon, days }) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1 px-1 pb-3">
            <Icon icon={icon} width={18} className={`${wasteColor(days)} mt-1`} />
            <div className="text-[10px] text-text-dim text-center leading-tight">{label}</div>
            <div className={`text-xs font-semibold tabular-nums text-center ${wasteColor(days)}`}>
              {wasteDayLabel(days)}
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

function LockBar({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  if (LOCKS.length === 0) return null;
  const { entity, name } = LOCKS[0];
  const state = entities[entity]?.state;
  const isLocked   = state === "locked";
  const isUnlocked = state === "unlocked";
  const isJammed   = state === "jammed";

  const toggle = () => {
    if (!connection || isJammed) return;
    const svc = isUnlocked ? "lock" : "unlock";
    callService(connection, "lock", svc, undefined, { entity_id: entity }).catch(() => {});
  };

  return (
    <button
      onClick={toggle}
      disabled={isJammed}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
        isJammed   ? "bg-accent-red/15 ring-1 ring-accent-red/30"
        : isUnlocked ? "bg-accent-warm/12 ring-1 ring-accent-warm/25"
        : "bg-bg-card hover:bg-bg-elevated"
      }`}
    >
      <Icon
        icon={isJammed ? "mdi:lock-alert" : isUnlocked ? "mdi:lock-open-variant" : "mdi:lock"}
        width={20}
        className={isJammed ? "text-accent-red" : isUnlocked ? "text-accent-warm" : "text-accent-green"}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{name}</div>
        <div className={`text-xs ${isJammed ? "text-accent-red" : isUnlocked ? "text-accent-warm" : "text-text-dim"}`}>
          {isJammed ? "Blokkert" : isUnlocked ? "Trykk for å låse" : isLocked ? "Trykk for å låse opp" : state ?? "—"}
        </div>
      </div>
      <Icon
        icon={isUnlocked ? "mdi:lock" : "mdi:lock-open-variant"}
        width={16}
        className={`shrink-0 ${isUnlocked ? "text-accent-green/60" : "text-accent-warm/60"}`}
      />
    </button>
  );
}

const ALARM_META_MINI: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  disarmed:    { label: "Avvæpnet",  icon: "mdi:shield-off-outline",    color: "text-accent-green",  bg: "bg-accent-green/10" },
  armed_away:  { label: "Borte",     icon: "mdi:shield-lock",           color: "text-accent-red",    bg: "bg-accent-red/12" },
  armed_home:  { label: "Hjemme",    icon: "mdi:shield-home",           color: "text-accent-warm",   bg: "bg-accent-warm/12" },
  armed_night: { label: "Natt",      icon: "mdi:shield-moon",           color: "text-accent",        bg: "bg-accent/12" },
  pending:     { label: "Venter…",   icon: "mdi:shield-alert-outline",  color: "text-accent-warm",   bg: "bg-accent-warm/12" },
  arming:      { label: "Væpner…",   icon: "mdi:shield-alert-outline",  color: "text-accent-warm",   bg: "bg-accent-warm/12" },
  triggered:   { label: "ALARM!",    icon: "mdi:alarm-light",           color: "text-accent-red",    bg: "bg-accent-red/20" },
};

function AlarmMiniCard({ entities, onOpen }: { entities: HassEntities; connection: Connection | null; onOpen: () => void }) {
  if (!ALARM) return null;
  const alarmState = entities[ALARM]?.state ?? "unavailable";
  const meta = ALARM_META_MINI[alarmState] ?? { label: alarmState, icon: "mdi:shield-outline", color: "text-text-dim", bg: "bg-bg-card" };

  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors hover:brightness-110 ${meta.bg}`}
    >
      <Icon
        icon={meta.icon}
        width={20}
        className={`${meta.color} ${alarmState === "triggered" ? "animate-pulse" : ""} shrink-0`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-secondary">Alarm</div>
        <div className={`text-xs font-semibold ${meta.color}`}>{meta.label}</div>
      </div>
    </button>
  );
}

const FIVE_MIN_MS = 5 * 60 * 1000;

function LockWarningBanner({ entities }: { entities: HassEntities }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const warning = useMemo(() => {
    for (const lock of LOCKS) {
      const e = entities[lock.entity];
      if (!e) continue;
      if (e.state === "jammed") {
        return { entity: lock.entity, name: lock.name, reason: "Blokkert" };
      }
      if (e.state === "unlocked") {
        const ageMs = Date.now() - new Date(e.last_changed).getTime();
        if (ageMs > FIVE_MIN_MS) {
          return { entity: lock.entity, name: lock.name, reason: `Ulåst i ${Math.floor(ageMs / 60_000)} min` };
        }
      }
    }
    return null;
  }, [entities]);

  const warnKey = warning ? `${warning.entity}:${warning.reason}` : null;
  const prevWarnKey = useRef(warnKey);
  useEffect(() => {
    if (warnKey !== prevWarnKey.current) {
      prevWarnKey.current = warnKey;
      if (warnKey === null) setDismissedKey(null);
    }
  }, [warnKey]);

  if (!warning || dismissedKey === warnKey) return null;

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 80) setDismissedKey(warnKey);
      }}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 rounded-2xl bg-accent-red/15 px-4 py-3 ring-1 ring-accent-red/30 cursor-grab active:cursor-grabbing"
    >
      <Icon icon="mdi:lock-alert" width={18} className="text-accent-red shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-accent-red">{warning.name}</div>
        <div className="text-xs text-accent-red/80">{warning.reason}</div>
      </div>
      <button
        onClick={() => setDismissedKey(warnKey)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-red/20 text-accent-red hover:bg-accent-red/30 transition-colors"
      >
        <Icon icon="mdi:close" width={14} />
      </button>
    </motion.div>
  );
}

const CLIMATE_MODES_HOME = [
  { value: "hjemme",   label: "Hjemme",           icon: "mdi:home",               color: "text-accent-green", desc: "Normal oppvarming" },
  { value: "ankommer", label: "Ankommer i morgen", icon: "mdi:home-clock",         color: "text-accent-cool",  desc: "Starter oppvarming til 22°C" },
  { value: "sommer",   label: "Sommer-modus",      icon: "mdi:weather-sunny",      color: "text-accent-warm",  desc: "Grunntemp 16°C" },
  { value: "borte",    label: "Borte",             icon: "mdi:home-export-outline", color: "text-text-dim",    desc: "Sparmodus" },
];

function ClimateSection({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  const awayMode = entities[AWAY_MODE]?.state === "on";
  const ankommer = entities[ANKOMMER_I_MORGEN]?.state === "on";
  const sommer   = entities[SOMMER_MODUS]?.state === "on";

  const currentValue = sommer ? "sommer" : ankommer ? "ankommer" : awayMode ? "borte" : "hjemme";
  const current = CLIMATE_MODES_HOME.find((m) => m.value === currentValue)!;

  const setMode = (value: string) => {
    if (!connection) return;
    const on  = (e: string) => callService(connection, "input_boolean", "turn_on",  undefined, { entity_id: e });
    const off = (e: string) => callService(connection, "input_boolean", "turn_off", undefined, { entity_id: e });
    if (value === "hjemme")   { off(AWAY_MODE); off(ANKOMMER_I_MORGEN); off(SOMMER_MODUS); }
    if (value === "ankommer") { off(AWAY_MODE); on(ANKOMMER_I_MORGEN);  off(SOMMER_MODUS); }
    if (value === "sommer")   { off(AWAY_MODE); off(ANKOMMER_I_MORGEN); on(SOMMER_MODUS);  }
    if (value === "borte")    { on(AWAY_MODE);  off(ANKOMMER_I_MORGEN); off(SOMMER_MODUS); }
  };

  return (
    <div className="rounded-2xl bg-bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon icon={current.icon} width={20} className={`${current.color} shrink-0`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Klima</div>
          <div className={`text-xs ${current.color}`}>{current.desc}</div>
        </div>
        <PopoverSelect
          value={currentValue}
          onSelect={setMode}
          items={CLIMATE_MODES_HOME.map((m) => ({
            value: m.value,
            label: (
              <span className="flex items-center gap-2">
                <Icon icon={m.icon} width={16} className={m.color} />
                <span>{m.label}</span>
              </span>
            ),
          }))}
          trigger={
            <button className="flex items-center gap-1.5 rounded-xl bg-bg-elevated px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10">
              <span className={current.color}>{current.label}</span>
              <Icon icon="mdi:chevron-down" width={14} className="text-text-dim" />
            </button>
          }
          align="end"
          matchTriggerWidth={false}
        />
      </div>
    </div>
  );
}

export function HomeView() {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;
  const user       = useHass((s) => s.user);
  const displayName = user?.name?.split(" ")[0] ?? "";
  const greeting   = useGreeting(displayName);

  const [lockOpen, setLockOpen]               = useState(false);
  const [alarmOpen, setAlarmOpen]             = useState(false);
  const [weatherOpen, setWeatherOpen]         = useState(false);
  const [savingsOpen, setSavingsOpen]         = useState(false);
  const [mediaPlayersOpen, setMediaPlayersOpen] = useState(false);
  const [remoteOpen, setRemoteOpen]           = useState(false);
  const [wasteOpen, setWasteOpen]             = useState(false);

  const stueRoom = useMemo(() => ROOMS.find((r) => r.tvPlatform === "apple_tv"), []);

  const activeMediaRooms = ROOMS.flatMap((room) => {
    if (!room.remoteEntity || !room.mediaPlayers?.length) return [];
    const remoteBase  = room.remoteEntity.split(".")[1];
    const tvPlayer    = room.mediaPlayers.find((id) => id.endsWith(remoteBase)) ?? room.mediaPlayers[0];
    const playerState = entities[tvPlayer]?.state;
    const isOn = playerState === "playing" || playerState === "paused";
    if (!isOn) return [];
    return [{ room, mediaPlayerId: tvPlayer }];
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-3">
      {/* Greeting + weather combined header */}
      <div className="space-y-3">
        <div className="px-1">
          <div className="text-3xl font-bold text-text-primary leading-tight">{greeting}</div>
        </div>

        {/* Lock warning banner */}
        <AnimatePresence>
          <LockWarningBanner entities={entities} />
        </AnimatePresence>

        {/* Weather */}
        <button type="button" className="block w-full text-left" onClick={() => setWeatherOpen(true)}>
          <ContextCard config={CONTEXT_CONFIG} compact={false} minimal />
        </button>
      </div>

      <QuickActions config={QUICK_ACTIONS_CONFIG} />

      {/* Dørlås + Alarm side by side */}
      <div className="grid grid-cols-2 gap-3">
        <LockBar entities={entities} connection={connection} />
        <AlarmMiniCard entities={entities} connection={connection} onOpen={() => setAlarmOpen(true)} />
      </div>

      {/* Tibber strømpris */}
      <NorgesprisSavingsBar entities={entities} onTap={() => setSavingsOpen(true)} />

      {/* Klimastyring */}
      <ClimateSection entities={entities} connection={connection} />

      {/* Søppelhenting */}
      <WasteCard entities={entities} onOpen={() => setWasteOpen(true)} />

      {/* Now Playing — Apple TV / active media */}
      <AnimatePresence>
        {activeMediaRooms.map(({ room, mediaPlayerId }) => (
          <motion.div
            key={room.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MediaPlayerCard
              mediaPlayerId={mediaPlayerId}
              room={room}
              entities={entities}
              roomLabel={room.name}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Høyttalere & TV */}
      <div className="flex w-full overflow-hidden rounded-2xl bg-bg-card">
        <button
          type="button"
          onClick={() => setMediaPlayersOpen(true)}
          className="flex flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-elevated active:bg-bg-elevated min-w-0"
        >
          <Icon icon="mdi:speaker-wireless" width={20} className="text-accent-cool shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Høyttalere & TV</div>
            <div className="text-xs text-text-dim">Squeezebox · Apple TV</div>
          </div>
          <Icon icon="mdi:chevron-right" width={16} className="text-text-dim shrink-0" />
        </button>
        {stueRoom && (
          <button
            type="button"
            onClick={() => setRemoteOpen(true)}
            className="flex items-center px-4 border-l border-white/5 text-text-dim hover:bg-white/8 transition-colors shrink-0"
            title="Apple TV fjernkontroll"
          >
            <Icon icon="mdi:remote-tv" width={18} />
          </button>
        )}
      </div>

      <ActiveAutomations config={ACTIVE_AUTOMATIONS_CONFIG} />

      <LockPopup open={lockOpen} onClose={() => setLockOpen(false)} />
      <AlarmPopup open={alarmOpen} onClose={() => setAlarmOpen(false)} entities={entities} connection={connection} />
      <NorgesporisPopup open={savingsOpen} onClose={() => setSavingsOpen(false)} config={ENERGY_CONFIG} />
      <MediaPlayersPopup open={mediaPlayersOpen} onClose={() => setMediaPlayersOpen(false)} />
      {stueRoom && (
        <RemotePopup
          room={stueRoom}
          mediaPlayerId={stueRoom.mediaPlayers![0]}
          open={remoteOpen}
          onClose={() => setRemoteOpen(false)}
          entities={entities}
        />
      )}

      {/* Søppelhenting popup */}
      <BottomSheet open={wasteOpen} onClose={() => setWasteOpen(false)}>
        <Dialog.Title className="sr-only">Søppelhenting</Dialog.Title>
        <Dialog.Description className="sr-only">Oversikt over neste hentinger</Dialog.Description>
        <div className="px-4 pb-6 pt-2">
          <div className="flex items-center gap-2 pb-3 border-b border-white/5">
            <Icon icon="mdi:delete-sweep-outline" width={18} className="text-text-dim" />
            <span className="text-base font-semibold">Søppelhenting</span>
          </div>
          <div className="mt-3 space-y-2">
            {WASTE_BINS.map(({ entity, label, icon }) => {
              const dateStr = nextPickupDate(entities[entity]);
              const days    = daysUntil(dateStr);
              const color   = wasteColor(days);
              const dateDisplay = dateStr
                ? new Date(dateStr).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })
                : null;
              return (
                <div key={label} className="flex items-center gap-3 rounded-xl bg-bg-elevated px-4 py-3">
                  <Icon icon={icon} width={22} className={`${color} shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{label}</div>
                    {dateDisplay && <div className="text-xs text-text-dim mt-0.5 capitalize">{dateDisplay}</div>}
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${color}`}>
                    {wasteDayLabel(days)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </BottomSheet>

      {/* Vær popup */}
      <BottomSheet open={weatherOpen} onClose={() => setWeatherOpen(false)}>
        <Dialog.Title className="sr-only">Vær</Dialog.Title>
        <Dialog.Description className="sr-only">Detaljert værinformasjon og varsel</Dialog.Description>
        <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
          <ContextCard config={CONTEXT_CONFIG} />
          <LightningSection entities={entities} />
          <ElectricityMapSection entities={entities} />
        </div>
      </BottomSheet>
      <div className="h-20" />
    </div>
  );
}
