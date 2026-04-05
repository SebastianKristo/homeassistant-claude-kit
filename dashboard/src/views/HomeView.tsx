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
  ENERGY_CONFIG,
  ELEC_MAPS_CO2, ELEC_MAPS_FOSSIL,
  LYN_DISTANCE, LYN_AZIMUTH, LYN_COUNTER, LYN_AREA,
  LIGHTNING_LAT, LIGHTNING_LON,
  WASTE_RESTAVFALL, WASTE_MATAVFALL, WASTE_PAPIR, WASTE_PLAST, WASTE_GLASS_METALL,
  VACUUM_CONFIG,
  GARAGE_DOORS,
  PRESENCE_SIMULATION,
  WASHER_REMAINING, WASHER_TOTAL_MIN,
  DISHWASHER_REMAINING, DISHWASHER_TOTAL_MIN,
} from "../lib/entities";
import { ContextCard } from "../components/cards/ContextCard";
import { QuickActions } from "../components/cards/QuickActions";
import { ActiveAutomations } from "../components/cards/ActiveAutomations";
import { VacuumCard } from "../components/cards/VacuumCard";
import { MediaPlayerCard } from "../components/cards/MediaPlayerCard";
import { LockPopup } from "../components/popups/LockPopup";
import { NorgesporisPopup } from "../components/popups/NorgesporisPopup";
import { MediaPlayersPopup } from "../components/popups/MediaPlayersPopup";
import { VacuumPopup } from "../components/popups/VacuumPopup";
import { RemotePopup } from "../components/popups/RemotePopup";
import { TransportPopup } from "../components/popups/TransportPopup";
import { HvitvarePopup, useActiveAppliances } from "../components/popups/HvitvarePopup";
import { MediaPopup } from "../components/popups/MediaPopup";
import { GasPriceCard, GasPricePopup } from "../components/popups/GasPricePopup";
import { BottomSheet } from "../components/popups/BottomSheet";
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

function WashingBanner({ entities, onOpen }: { entities: HassEntities; onOpen: () => void }) {
  const washerMin = parseNumericState(entities[WASHER_REMAINING]?.state);
  const dishMin   = parseNumericState(entities[DISHWASHER_REMAINING]?.state);

  const washerOn = washerMin !== null && washerMin > 0;
  const dishOn   = dishMin   !== null && dishMin   > 0;

  if (!washerOn && !dishOn) return null;

  const items: { name: string; icon: string; remaining: number; total: number }[] = [];
  if (washerOn)  items.push({ name: "Vaskemaskin",  icon: "mdi:washing-machine", remaining: washerMin!, total: WASHER_TOTAL_MIN });
  if (dishOn)    items.push({ name: "Oppvaskmaskin", icon: "mdi:dishwasher",      remaining: dishMin!,   total: DISHWASHER_TOTAL_MIN });

  return (
    <AnimatePresence>
      {items.map(({ name, icon, remaining, total }) => {
        const elapsed  = Math.max(0, total - remaining);
        const progress = Math.min(1, elapsed / total);
        const done     = remaining <= 0;
        return (
          <motion.button
            key={name}
            type="button"
            onClick={onOpen}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full text-left rounded-2xl bg-accent-green/8 ring-1 ring-accent-green/20 overflow-hidden transition-colors hover:brightness-110"
          >
            <div className="flex items-center gap-3 px-4 pt-3 pb-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-green/20">
                <Icon icon={icon} width={20} className="text-accent-green" style={{ animation: "pulse 2s ease-in-out infinite" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{name}</div>
                <div className="text-xs text-accent-green">
                  {done ? "Ferdig!" : `Ferdig om ${remaining} min`}
                </div>
              </div>
              <Icon icon="mdi:chevron-right" width={16} className="text-text-dim shrink-0" />
            </div>
            <div className="h-1 bg-white/8 mx-4 mb-3 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-green transition-all duration-60000"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </motion.button>
        );
      })}
    </AnimatePresence>
  );
}

function PresenceSimulationCard({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  if (!PRESENCE_SIMULATION) return null;
  const state   = entities[PRESENCE_SIMULATION]?.state;
  const isOn    = state === "on";
  const isAvail = state !== undefined && state !== "unavailable";

  const toggle = () => {
    if (!connection || !isAvail) return;
    callService(connection, "switch", isOn ? "turn_off" : "turn_on", undefined, { entity_id: PRESENCE_SIMULATION });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!isAvail}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
        isOn ? "bg-accent-cool/10 ring-1 ring-accent-cool/25" : "bg-bg-card hover:bg-bg-elevated"
      }`}
    >
      <Icon
        icon={isOn ? "mdi:home-clock" : "mdi:home-clock-outline"}
        width={20}
        className={isOn ? "text-accent-cool" : "text-text-dim"}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Tilstedeværelsessimulering</div>
        <div className={`text-xs ${isOn ? "text-accent-cool" : "text-text-dim"}`}>
          {isOn ? "Aktiv — simulerer tilstedeværelse" : "Av"}
        </div>
      </div>
      <div className={`h-5 w-9 rounded-full transition-colors ${isOn ? "bg-accent-cool" : "bg-white/15"} flex items-center px-0.5`}>
        <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-4" : "translate-x-0"}`} />
      </div>
    </button>
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

// ── Entur inline card ────────────────────────────────────────────────────────

const ENTUR_KEY_STOPS = [
  { entity: "sensor.transport_hovseter", name: "Hovseter" },
  { entity: "sensor.transport_smestad",  name: "Smestad" },
];

function enturType(routeId: string): "tbane" | "trikk" | "buss" {
  const n = parseInt(routeId.replace("RUT:Line:", ""));
  if (n >= 1 && n <= 5)   return "tbane";
  if (n >= 11 && n <= 19) return "trikk";
  return "buss";
}

const ENTUR_META = {
  tbane: { icon: "mdi:subway-variant", color: "text-accent-cool" },
  trikk: { icon: "mdi:tram",           color: "text-accent-green" },
  buss:  { icon: "mdi:bus",            color: "text-accent-warm" },
};

function EnturCard({ entities, onOpen }: { entities: HassEntities; onOpen: () => void }) {
  const rows = ENTUR_KEY_STOPS.map(({ entity, name }) => {
    const e = entities[entity];
    if (!e) return null;
    const dueMin  = parseNumericState(e.state);
    const route   = e.attributes?.route as string | undefined;
    const routeId = e.attributes?.route_id as string | undefined;
    return { name, dueMin, route, routeId };
  }).filter(Boolean) as { name: string; dueMin: number | null; route?: string; routeId?: string }[];

  if (rows.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-3 rounded-2xl bg-bg-card px-4 py-3.5 text-left transition-colors hover:bg-bg-elevated active:bg-bg-elevated"
    >
      <Icon icon="mdi:bus-clock" width={17} className="text-accent-cool shrink-0" />
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {rows.map(({ name, dueMin, route, routeId }) => {
          const type = routeId ? enturType(routeId) : "buss";
          const meta = ENTUR_META[type];
          const routeNum = route?.split(" ")[0] ?? "—";
          const minLabel = dueMin === null ? "—" : dueMin === 0 ? "nå" : `${dueMin} min`;
          return (
            <div key={name} className="flex items-center gap-1.5 shrink-0">
              <Icon icon={meta.icon} width={13} className={`${meta.color} shrink-0`} />
              <span className="text-sm font-semibold tabular-nums">{routeNum}</span>
              <span className="text-xs text-text-dim">{name}</span>
              <span className={`text-sm font-bold tabular-nums ${dueMin === 0 ? "text-accent-green animate-pulse" : "text-text-primary"}`}>
                {minLabel}
              </span>
            </div>
          );
        })}
      </div>
      <Icon icon="mdi:chevron-right" width={14} className="text-text-dim shrink-0" />
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


export function HomeView() {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;
  const user       = useHass((s) => s.user);
  const displayName = user?.name?.split(" ")[0] ?? "";
  const greeting   = useGreeting(displayName);

  const [lockOpen, setLockOpen]               = useState(false);
  const [weatherOpen, setWeatherOpen]         = useState(false);
  const [savingsOpen, setSavingsOpen]         = useState(false);
  const [mediaPlayersOpen, setMediaPlayersOpen] = useState(false);
  const [remoteOpen, setRemoteOpen]           = useState(false);
  const [wasteOpen, setWasteOpen]             = useState(false);
  const [vacuumOpen, setVacuumOpen]           = useState(false);
  const [transportOpen, setTransportOpen]     = useState(false);
  const [hvitvareOpen, setHvitvareOpen]       = useState(false);
  const [mediaOpen, setMediaOpen]             = useState(false);
  const [gasOpen, setGasOpen]                 = useState(false);

  const activeAppliances = useActiveAppliances(entities);
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
          <ContextCard config={CONTEXT_CONFIG} compact />
        </button>
      </div>

      <QuickActions config={QUICK_ACTIONS_CONFIG} />

      {/* Entur — kollektivtrafikk */}
      <EnturCard entities={entities} onOpen={() => setTransportOpen(true)} />

      {/* Dørlås + Garasje side by side */}
      <div className="grid grid-cols-2 gap-3">
        <LockBar entities={entities} connection={connection} />
        {GARAGE_DOORS.length > 0 && (() => {
          const { entity, name } = GARAGE_DOORS[0];
          const state    = entities[entity]?.state;
          const isOpen   = state === "open" || state === "opening";
          const isMoving = state === "opening" || state === "closing";
          return (
            <button
              type="button"
              onClick={() => {
                if (!connection) return;
                callService(connection, "cover", isOpen ? "close_cover" : "open_cover", undefined, { entity_id: entity });
              }}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                isOpen ? "bg-accent-warm/12 ring-1 ring-accent-warm/25" : "bg-bg-card hover:bg-bg-elevated"
              }`}
            >
              <Icon
                icon={isOpen ? "mdi:garage-open" : "mdi:garage"}
                width={20}
                className={isOpen ? "text-accent-warm" : "text-text-dim"}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{name}</div>
                <div className={`text-xs ${isOpen ? "text-accent-warm" : "text-text-dim"}`}>
                  {isMoving ? (state === "opening" ? "Åpner…" : "Lukker…") : isOpen ? "Åpen" : "Lukket"}
                </div>
              </div>
            </button>
          );
        })()}
      </div>

      {/* Tibber strømpris */}
      <NorgesprisSavingsBar entities={entities} onTap={() => setSavingsOpen(true)} />

      {/* Drivstoffpriser */}
      <GasPriceCard entities={entities} onOpen={() => setGasOpen(true)} />

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
            <div className="text-xs text-text-dim">Yamaha RN602 · Apple TV</div>
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

      {/* Vaskemaskin / oppvaskmaskin banner */}
      <WashingBanner entities={entities} onOpen={() => setHvitvareOpen(true)} />

      {/* Hvitvarer */}
      <button
        type="button"
        onClick={() => setHvitvareOpen(true)}
        className="w-full text-left rounded-2xl bg-bg-card overflow-hidden transition-colors hover:bg-bg-elevated active:bg-bg-elevated"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Icon icon="mdi:washing-machine" width={20} className={activeAppliances.length > 0 ? "text-accent-green" : "text-text-dim"} />
            <div>
              <div className="text-sm font-medium">Hvitvarer</div>
              <div className={`text-xs ${activeAppliances.length > 0 ? "text-accent-green" : "text-text-dim"}`}>
                {activeAppliances.length > 0
                  ? activeAppliances.map((a) => a.remainingMin && a.remainingMin > 0 ? `${a.name} · ${a.remainingMin} min` : a.name).join(", ")
                  : "Ingen aktive"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeAppliances.length > 0 && (
              <span className="text-xs font-medium bg-accent-green/15 text-accent-green rounded-full px-2.5 py-1">
                {activeAppliances.length} aktive
              </span>
            )}
            <Icon icon="mdi:chevron-right" width={16} className="text-text-dim shrink-0" />
          </div>
        </div>
      </button>

      {/* Media — Plex, Radarr, Sonarr */}
      <button
        type="button"
        onClick={() => setMediaOpen(true)}
        className="w-full flex items-center gap-3 rounded-2xl bg-bg-card px-4 py-3 text-left transition-colors hover:bg-bg-elevated active:bg-bg-elevated"
      >
        <Icon icon="mdi:plex" width={20} className="text-accent-warm shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Media</div>
          <div className="text-xs text-text-dim">Plex · Radarr · Sonarr</div>
        </div>
        <Icon icon="mdi:chevron-right" width={16} className="text-text-dim shrink-0" />
      </button>

      {/* Tilstedeværelsessimulering */}
      <PresenceSimulationCard entities={entities} connection={connection} />

      {/* Støvsuger */}
      <VacuumCard config={VACUUM_CONFIG} onOpen={() => setVacuumOpen(true)} />

      <ActiveAutomations config={ACTIVE_AUTOMATIONS_CONFIG} />

      <LockPopup open={lockOpen} onClose={() => setLockOpen(false)} />
      <NorgesporisPopup open={savingsOpen} onClose={() => setSavingsOpen(false)} config={ENERGY_CONFIG} />
      <MediaPlayersPopup open={mediaPlayersOpen} onClose={() => setMediaPlayersOpen(false)} />
      <VacuumPopup open={vacuumOpen} onClose={() => setVacuumOpen(false)} config={VACUUM_CONFIG} />
      <TransportPopup open={transportOpen} onClose={() => setTransportOpen(false)} />
      <HvitvarePopup open={hvitvareOpen} onClose={() => setHvitvareOpen(false)} />
      <MediaPopup open={mediaOpen} onClose={() => setMediaOpen(false)} />
      <GasPricePopup open={gasOpen} onClose={() => setGasOpen(false)} />
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
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-2 space-y-4">
          <ContextCard config={CONTEXT_CONFIG} />
          <LightningSection entities={entities} />
          <ElectricityMapSection entities={entities} />
        </div>
      </BottomSheet>
      <div className="h-20" />
    </div>
  );
}
