import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { DialogTitle, DialogDescription } from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type { RoomConfig, SceneButton } from "../../lib/areas";
import { CLIMATE_MODE, NEXT_CLIMATE_TRANSITION } from "../../lib/entities";
import { AC_UNITS } from "../../lib/acUnits";
import { useRoomState } from "../../hooks/useRoomState";
import { LightControl } from "../controls/LightControl";
import { CoverControl } from "../controls/CoverControl";
import { SwitchControl } from "../controls/SwitchControl";
import { ClimateSection } from "./ClimateSection";
import { MediaSection } from "./MediaSection";
import { BottomSheet } from "./BottomSheet";
import { RoomHeroCard } from "./RoomHeroCard";

interface RoomPopupProps {
  room: RoomConfig | null;
  open: boolean;
  onClose: () => void;
}

export function RoomPopup({ room, open, onClose }: RoomPopupProps) {
  return (
    <BottomSheet open={open && !!room} onClose={onClose} className="flex flex-col overflow-hidden md:max-w-md">
      {room && <RoomContent room={room} />}
    </BottomSheet>
  );
}

// ── CollapseSection ──────────────────────────────────────────────────────────

interface CollapseSectionProps {
  icon: string;
  title: string;
  badge?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

function CollapseSection({ icon, title, badge, defaultExpanded = true, children }: CollapseSectionProps) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <div className="overflow-hidden rounded-2xl bg-bg-card">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon={icon} width={20} className="shrink-0 text-text-secondary" />
        <span className="flex-1 text-[15px] font-medium">{title}</span>
        {badge && <span className="text-sm text-text-dim tabular-nums">{badge}</span>}
        <Icon
          icon="mdi:chevron-down"
          width={18}
          className={`shrink-0 text-text-dim transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── SceneButtonsSection ──────────────────────────────────────────────────────

function SceneButtonsSection({ buttons }: { buttons: SceneButton[] }) {
  const connection = useHass((s) => s.connection);

  function fire(btn: SceneButton) {
    if (!connection) return;
    const dot = btn.service.indexOf(".");
    const domain = btn.service.slice(0, dot);
    const action = btn.service.slice(dot + 1);
    const target = btn.targetEntityId ? { entity_id: btn.targetEntityId } : undefined;
    callService(connection, domain, action, btn.data as Record<string, unknown> | undefined, target);
  }

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={() => fire(btn)}
          className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-2xl bg-bg-card px-3 py-3 text-center transition-colors active:bg-bg-elevated hover:bg-bg-elevated"
          style={{ width: 76, height: 76 }}
        >
          <Icon icon={btn.icon} width={26} className="text-text-secondary" />
          <span className="text-[11px] leading-tight text-text-dim">{btn.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── RoomContent ───────────────────────────────────────────────────────────────

function RoomContent({ room }: { room: RoomConfig }) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const state = useRoomState(room, entities);
  const [lightsExpanded, setLightsExpanded] = useState(false);

  const hasCovers   = (room.covers?.length ?? 0) > 0;
  const hasScenes   = (room.sceneButtons?.length ?? 0) > 0;
  const hasLights   = room.lights.length > 0;
  const hasSwitches = (room.switches?.length ?? 0) > 0;
  const hasClimate  = (room.climate?.length ?? 0) > 0;
  const hasMedia    = (room.mediaPlayers?.length ?? 0) > 0;

  // Badge values
  const lightsBadge = state.totalLights > 0
    ? (state.lightsOn > 0 ? `${state.lightsOn} på` : "Av")
    : undefined;

  const switchWatts = hasSwitches
    ? room.switches!.reduce((sum, id) => {
        const powerId = room.switchPowerSensors?.[id];
        const raw = powerId ? parseFloat(entities[powerId]?.state ?? "0") : 0;
        return sum + (isNaN(raw) ? 0 : raw);
      }, 0)
    : 0;
  const switchesBadge = switchWatts > 1 ? `${Math.round(switchWatts)} W` : undefined;

  return (
    <>
      {/* Accessibility title — visually hidden */}
      <DialogTitle className="sr-only">{room.name}</DialogTitle>
      <DialogDescription className="sr-only">Controls and sensors for {room.name}</DialogDescription>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="space-y-3 pb-5 pt-4">

          {/* Hero summary card */}
          <RoomHeroCard room={room} state={state} />

          {/* Covers */}
          {hasCovers && (
            <CollapseSection icon="mdi:blinds" title="Markise" defaultExpanded>
              <div className="space-y-2">
                {room.covers!.map((id) => (
                  <CoverControl key={id} entityId={id} stripPrefix={room.name} />
                ))}
              </div>
            </CollapseSection>
          )}

          {/* Scene / script quick-action buttons */}
          {hasScenes && <SceneButtonsSection buttons={room.sceneButtons!} />}

          {/* Lights */}
          {hasLights && (
            <CollapseSection icon="mdi:lamp" title="Lys" badge={lightsBadge} defaultExpanded>
              <div className="space-y-2">
                {room.lights.map((id) => (
                  <LightControl key={id} entityId={id} stripPrefix={room.name} />
                ))}
              </div>
              {(room.individualLights?.length ?? 0) > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setLightsExpanded((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-xs text-text-dim hover:text-text-secondary transition-colors"
                  >
                    <span>{lightsExpanded ? "Skjul enkeltlys" : `${room.individualLights!.length} enkeltlys`}</span>
                    <Icon
                      icon="mdi:chevron-down"
                      width={16}
                      className={`transition-transform duration-200 ${lightsExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {lightsExpanded && (
                      <motion.div
                        key="individual-lights"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 pt-2">
                          {room.individualLights!.map((id) => (
                            <LightControl key={id} entityId={id} stripPrefix={room.name} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </CollapseSection>
          )}

          {/* Switches / Enheter */}
          {hasSwitches && (
            <CollapseSection icon="mdi:radio" title="Enheter" badge={switchesBadge} defaultExpanded>
              <div className="divide-y divide-white/5">
                {room.switches!.map((id) => (
                  <SwitchControl
                    key={id}
                    entityId={id}
                    stripPrefix={room.name}
                    powerSensorId={room.switchPowerSensors?.[id]}
                  />
                ))}
              </div>
            </CollapseSection>
          )}

          {/* Climate */}
          {hasClimate && (
            <CollapseSection icon="mdi:thermostat" title="Klima" defaultExpanded={false}>
              <ClimateSection
                room={room}
                entities={entities}
                climateModeEntity={CLIMATE_MODE}
                nextTransitionEntity={NEXT_CLIMATE_TRANSITION}
                acUnits={AC_UNITS}
              />
            </CollapseSection>
          )}

          {/* Media */}
          {hasMedia && (
            <MediaSection room={room} entities={entities} />
          )}
        </div>
      </div>
    </>
  );
}
