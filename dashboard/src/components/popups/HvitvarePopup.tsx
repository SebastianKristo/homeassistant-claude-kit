import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { parseNumericState } from "../../lib/format";

type ApplianceColor = "green" | "warm" | "red" | "cool";

interface Appliance {
  id: string;
  name: string;
  icon: string;
  powerEntity: string;
  /** W threshold above which the appliance is considered "active" */
  activeThreshold: number;
  /** W threshold above which it's considered running a cycle */
  runningThreshold?: number;
  runningLabel?: string;
  idleLabel?: string;
  energyTodayEntity?: string;
  /** Sensor that reports remaining minutes in the current cycle (0 = done/idle) */
  remainingEntity?: string;
  /** Semantic color: cool = cold appliances, red = hot, warm = neutral heat, green = wash cycles */
  color: ApplianceColor;
}

const APPLIANCES: Appliance[] = [
  {
    id: "vaskemaskin",
    name: "Vaskemaskin",
    icon: "mdi:washing-machine",
    powerEntity: "sensor.vaskemaskin_effekt",
    activeThreshold: 5,
    runningThreshold: 100,
    runningLabel: "Vasker",
    idleLabel: "Standby",
    energyTodayEntity: "sensor.vaskemaskin_kurs_energy_daily",
    remainingEntity: "sensor.vaskemaskin_gjenstar",
    color: "green",
  },
  {
    id: "oppvask",
    name: "Oppvaskmaskin",
    icon: "mdi:dishwasher",
    powerEntity: "sensor.oppvaskmaskin_effekt",
    activeThreshold: 5,
    runningThreshold: 100,
    runningLabel: "Vasker",
    idleLabel: "Standby",
    energyTodayEntity: "sensor.oppvaskmaskin_kurs_energy_daily",
    remainingEntity: "sensor.oppvaskmaskin_gjenstar",
    color: "green",
  },
  {
    id: "platetopp",
    name: "Platetopp",
    icon: "mdi:countertop",
    powerEntity: "sensor.platetopp_power",
    activeThreshold: 20,
    runningThreshold: 200,
    runningLabel: "Koker",
    idleLabel: "Av",
    color: "red",
  },
  {
    id: "komfyr",
    name: "Komfyr",
    icon: "mdi:stove",
    powerEntity: "sensor.komfyr_power",
    activeThreshold: 20,
    runningThreshold: 200,
    runningLabel: "Steker",
    idleLabel: "Av",
    color: "red",
  },
  {
    id: "kaffetrakter",
    name: "Kaffetrakter",
    icon: "mdi:coffee-maker",
    powerEntity: "sensor.kaffetrakter_effekt",
    activeThreshold: 5,
    runningThreshold: 50,
    runningLabel: "Brygger",
    idleLabel: "Standby",
    energyTodayEntity: "sensor.kaffetrakter_energy_daily",
    color: "warm",
  },
  {
    id: "brodrister",
    name: "Brødrister",
    icon: "mdi:toaster-oven",
    powerEntity: "sensor.brodrister_effekt",
    activeThreshold: 5,
    runningThreshold: 50,
    runningLabel: "Varmer",
    idleLabel: "Av",
    color: "warm",
  },
  {
    id: "mikro",
    name: "Mikrobølgeovn",
    icon: "mdi:microwave",
    powerEntity: "sensor.mikrobolgeovn_effekt",
    activeThreshold: 5,
    runningThreshold: 50,
    runningLabel: "Kjører",
    idleLabel: "Standby",
    color: "warm",
  },
  {
    id: "kjoleskap",
    name: "Kjøleskap",
    icon: "mdi:fridge-outline",
    powerEntity: "sensor.kjoleskap_effekt",
    activeThreshold: 5,
    runningThreshold: 30,
    runningLabel: "Kjøler",
    idleLabel: "Standby",
    energyTodayEntity: "sensor.kjoleskap_energy_daily",
    color: "cool",
  },
  {
    id: "fryseskap",
    name: "Fryseskap",
    icon: "mdi:fridge-industrial-outline",
    powerEntity: "sensor.fryseskap_effekt",
    activeThreshold: 5,
    runningThreshold: 30,
    runningLabel: "Fryser",
    idleLabel: "Standby",
    energyTodayEntity: "sensor.fryseskap_energy_daily",
    color: "cool",
  },
];

const COLOR_MAP: Record<ApplianceColor, {
  bg: string; ring: string; iconBg: string; iconColor: string; textColor: string;
}> = {
  green: {
    bg:        "bg-accent-green/8",
    ring:      "ring-1 ring-accent-green/15",
    iconBg:    "bg-accent-green/20",
    iconColor: "text-accent-green",
    textColor: "text-accent-green",
  },
  warm: {
    bg:        "bg-accent-warm/8",
    ring:      "ring-1 ring-accent-warm/15",
    iconBg:    "bg-accent-warm/20",
    iconColor: "text-accent-warm",
    textColor: "text-accent-warm",
  },
  red: {
    bg:        "bg-accent-red/8",
    ring:      "ring-1 ring-accent-red/15",
    iconBg:    "bg-accent-red/20",
    iconColor: "text-accent-red",
    textColor: "text-accent-red",
  },
  cool: {
    bg:        "bg-accent-cool/8",
    ring:      "ring-1 ring-accent-cool/15",
    iconBg:    "bg-accent-cool/20",
    iconColor: "text-accent-cool",
    textColor: "text-accent-cool",
  },
};

function ApplianceRow({ appliance, entities }: { appliance: Appliance; entities: HassEntities }) {
  const rawPower = parseNumericState(entities[appliance.powerEntity]?.state);
  const powerW = rawPower !== null ? Math.abs(rawPower) : null;
  const isAvailable = entities[appliance.powerEntity] !== undefined;
  const isActive = powerW !== null && powerW > appliance.activeThreshold;
  const isRunning = powerW !== null && appliance.runningThreshold !== undefined && powerW > appliance.runningThreshold;

  const energyToday = appliance.energyTodayEntity
    ? parseNumericState(entities[appliance.energyTodayEntity]?.state)
    : null;

  const remainingMin = appliance.remainingEntity
    ? parseNumericState(entities[appliance.remainingEntity]?.state)
    : null;

  const statusLabel = !isAvailable ? "—"
    : !isActive ? (appliance.idleLabel ?? "Av")
    : isRunning ? (appliance.runningLabel ?? "Aktiv")
    : "Lav";

  const c = COLOR_MAP[appliance.color];

  return (
    <div className={`flex items-center gap-3 rounded-2xl p-4 ${isRunning ? `${c.bg} ${c.ring}` : "bg-bg-card"}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        isRunning ? c.iconBg : isActive ? "bg-white/8" : "bg-white/5"
      }`}>
        <Icon
          icon={appliance.icon}
          width={22}
          className={isRunning ? c.iconColor : isActive ? c.iconColor : "text-text-dim"}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{appliance.name}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs ${isRunning ? c.textColor : isActive ? c.textColor : "text-text-dim"}`}>
            {statusLabel}
          </span>
          {isRunning && remainingMin !== null && remainingMin > 0 && (
            <span className={`text-xs font-medium tabular-nums ${c.textColor}`}>
              · ferdig om {remainingMin} min
            </span>
          )}
          {energyToday !== null && energyToday > 0 && (
            <span className="text-[10px] text-text-dim tabular-nums">
              {energyToday.toFixed(2)} kWh i dag
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        {powerW !== null && powerW > appliance.activeThreshold ? (
          <div className={`text-sm font-semibold tabular-nums ${isRunning ? c.textColor : isActive ? c.textColor : "text-text-secondary"}`}>
            {powerW >= 1000 ? `${(powerW / 1000).toFixed(1)} kW` : `${Math.round(powerW)} W`}
          </div>
        ) : (
          <div className="text-xs text-text-dim">0 W</div>
        )}
      </div>
    </div>
  );
}

interface HvitvarePopupProps {
  open: boolean;
  onClose: () => void;
}

export function HvitvarePopup({ open, onClose }: HvitvarePopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const activeCount = APPLIANCES.filter((a) => {
    const w = parseNumericState(entities[a.powerEntity]?.state);
    return w !== null && a.runningThreshold !== undefined && Math.abs(w) > a.runningThreshold;
  }).length;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Hvitvarer</Dialog.Title>
      <Dialog.Description className="sr-only">Status for hvitevarer i hjemmet</Dialog.Description>
      <div className="overflow-y-auto px-4 pb-6 pt-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:washing-machine" width={20} className="text-text-secondary" />
            <span className="text-base font-semibold">Hvitvarer</span>
          </div>
          {activeCount > 0 && (
            <span className="text-xs font-medium bg-accent-green/15 text-accent-green rounded-full px-2.5 py-1">
              {activeCount} aktive
            </span>
          )}
        </div>
        <div className="space-y-2">
          {APPLIANCES.map((a) => (
            <ApplianceRow key={a.id} appliance={a} entities={entities} />
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

export interface ActiveAppliance {
  name: string;
  remainingMin: number | null;
}

/** Returns running appliances with optional remaining time for use on the HomeView card */
export function useActiveAppliances(entities: HassEntities): ActiveAppliance[] {
  return APPLIANCES.filter((a) => {
    const w = parseNumericState(entities[a.powerEntity]?.state);
    return w !== null && a.runningThreshold !== undefined && Math.abs(w) > a.runningThreshold;
  }).map((a) => ({
    name: a.name,
    remainingMin: a.remainingEntity
      ? parseNumericState(entities[a.remainingEntity]?.state)
      : null,
  }));
}
