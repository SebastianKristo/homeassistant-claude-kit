import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { parseNumericState } from "../../lib/format";
import { PERSONS, PERSON_DEVICES } from "../../lib/entities";

interface PersonPopupProps {
  open: boolean;
  onClose: () => void;
}

function batteryIcon(pct: number | null): string {
  if (pct === null) return "mdi:battery-unknown";
  if (pct > 95) return "mdi:battery";
  if (pct > 75) return "mdi:battery-80";
  if (pct > 55) return "mdi:battery-60";
  if (pct > 35) return "mdi:battery-40";
  if (pct > 15) return "mdi:battery-20";
  return "mdi:battery-alert";
}

function batteryColor(pct: number | null): string {
  if (pct === null) return "text-text-dim";
  if (pct < 20) return "text-accent-red";
  if (pct < 40) return "text-accent-warm";
  return "text-accent-green";
}

function PersonCard({ entities, personId }: { entities: HassEntities; personId: string }) {
  const personConfig = PERSONS.find((p) => p.id === personId);
  const deviceConfig = PERSON_DEVICES.find((d) => d.personId === personId);

  const personState = entities[personId]?.state ?? "unknown";
  const isHome = personState === "home";

  const battery = parseNumericState(entities[deviceConfig?.battery ?? ""]?.state);
  const activity = entities[deviceConfig?.activity ?? ""]?.state;
  const location = entities[deviceConfig?.location ?? ""]?.state;
  const trackerState = entities[deviceConfig?.deviceTracker ?? ""]?.state;

  // Latitude/longitude from device_tracker attributes
  const trackerAttrs = entities[deviceConfig?.deviceTracker ?? ""]?.attributes as
    | Record<string, unknown>
    | undefined;
  const lat = trackerAttrs?.latitude as number | undefined;
  const lon = trackerAttrs?.longitude as number | undefined;

  if (!personConfig) return null;

  return (
    <div className="rounded-2xl bg-bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`h-3 w-3 rounded-full ${isHome ? "bg-accent-green" : "bg-text-dim"}`}
          />
          <span className="font-semibold">{personConfig.name}</span>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isHome
              ? "bg-accent-green/15 text-accent-green"
              : "bg-white/8 text-text-secondary"
          }`}
        >
          {isHome ? "Hjemme" : personState === "not_home" ? "Borte" : personState}
        </span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {battery !== null && (
          <div className="rounded-xl bg-bg-elevated px-3 py-2 flex items-center gap-2">
            <Icon icon={batteryIcon(battery)} width={14} className={batteryColor(battery)} />
            <div>
              <div className="text-text-dim">{deviceConfig?.secondaryDevice ? "Pixel Fold" : "Batteri"}</div>
              <div className={`font-semibold tabular-nums ${batteryColor(battery)}`}>
                {Math.round(battery)}%
              </div>
            </div>
          </div>
        )}
        {deviceConfig?.secondaryDevice && (() => {
          const secBat = parseNumericState(
            entities[deviceConfig.secondaryDevice.battery]?.state,
          );
          if (secBat === null) return null;
          return (
            <div className="rounded-xl bg-bg-elevated px-3 py-2 flex items-center gap-2">
              <Icon icon={batteryIcon(secBat)} width={14} className={batteryColor(secBat)} />
              <div>
                <div className="text-text-dim">{deviceConfig.secondaryDevice.label}</div>
                <div className={`font-semibold tabular-nums ${batteryColor(secBat)}`}>
                  {Math.round(secBat)}%
                </div>
              </div>
            </div>
          );
        })()}
        {activity && activity !== "unavailable" && (
          <div className="rounded-xl bg-bg-elevated px-3 py-2">
            <div className="text-text-dim">Aktivitet</div>
            <div className="font-semibold truncate capitalize">{activity}</div>
          </div>
        )}
        {location && location !== "unavailable" && location !== "unknown" && (
          <div className="rounded-xl bg-bg-elevated px-3 py-2 col-span-2">
            <div className="text-text-dim mb-0.5">Posisjon</div>
            <div className="font-medium truncate">{location}</div>
          </div>
        )}
        {trackerState && trackerState !== "unavailable" && !isHome && (
          <div className="rounded-xl bg-bg-elevated px-3 py-2">
            <div className="text-text-dim">Område</div>
            <div className="font-semibold truncate capitalize">
              {trackerState === "not_home" ? "Utenfor hjemmet" : trackerState}
            </div>
          </div>
        )}
        {lat !== undefined && lon !== undefined && (
          <div className="rounded-xl bg-bg-elevated px-3 py-2 col-span-2">
            <div className="text-text-dim mb-0.5">GPS</div>
            <div className="font-mono text-[11px] text-text-secondary">
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PersonPopup({ open, onClose }: PersonPopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Personer</Dialog.Title>
      <Dialog.Description className="sr-only">Status og posisjon for beboere</Dialog.Description>
      <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:account-group" width={20} className="text-text-secondary" />
          <h2 className="text-base font-semibold">Personer</h2>
        </div>
        {PERSONS.map((p) => (
          <PersonCard key={p.id} entities={entities} personId={p.id} />
        ))}
      </div>
    </BottomSheet>
  );
}
