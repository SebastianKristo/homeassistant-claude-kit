import { useState, useEffect } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";

interface TransportStop {
  entity: string;
  name: string;
}

const STOPS: TransportStop[] = [
  { entity: "sensor.transport_hovseter",       name: "Hovseter" },
  { entity: "sensor.transport_smestad",        name: "Smestad" },
  { entity: "sensor.transport_majorstuen",     name: "Majorstuen" },
  { entity: "sensor.transport_bislett",        name: "Bislett" },
  { entity: "sensor.transport_homansbyen",     name: "Homansbyen" },
  { entity: "sensor.transport_radiumhospitalet", name: "Radiumhospitalet" },
  { entity: "sensor.transport_amagerveien",    name: "Amagerveien" },
];

function getTransportType(routeId: string): "tbane" | "trikk" | "buss" {
  const num = parseInt(routeId.replace("RUT:Line:", ""));
  if (num >= 1 && num <= 5) return "tbane";
  if (num >= 11 && num <= 19) return "trikk";
  return "buss";
}

const TRANSPORT_META = {
  tbane: { icon: "mdi:subway-variant", color: "text-accent-cool",  bg: "bg-accent-cool/15",  label: "T-bane" },
  trikk: { icon: "mdi:tram",           color: "text-accent-green", bg: "bg-accent-green/15", label: "Trikk" },
  buss:  { icon: "mdi:bus",            color: "text-accent-warm",  bg: "bg-accent-warm/15",  label: "Buss" },
};

function formatMin(mins: number | null): string {
  if (mins === null) return "—";
  if (mins === 0) return "nå";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}t ${mins % 60}m`;
}

function clockTime(mins: number | null): string {
  if (mins === null) return "";
  const d = new Date(Date.now() + mins * 60_000);
  return d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
}

function DepartureRow({
  route, routeId, dueMin, isRealtime, isNext,
}: {
  route: string; routeId: string; dueMin: number | null; isRealtime: boolean; isNext: boolean;
}) {
  const type = getTransportType(routeId);
  const meta = TRANSPORT_META[type];
  const isNow = dueMin === 0;
  const clock = clockTime(dueMin);

  return (
    <div className={`flex items-center gap-3 py-2 ${isNext ? "opacity-60" : ""}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
        <Icon icon={meta.icon} width={15} className={meta.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xs font-bold tabular-nums shrink-0">{route.split(" ")[0]}</span>
          <span className="text-xs text-text-secondary truncate">{route.split(" ").slice(1).join(" ")}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[10px] ${meta.color}`}>{meta.label}</span>
          {isRealtime && !isNext && (
            <span className="text-[10px] text-accent-green">· sanntid</span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`tabular-nums font-bold text-sm ${isNow ? "text-accent-green animate-pulse" : "text-text-primary"}`}>
          {formatMin(dueMin)}
        </div>
        {clock && !isNow && (
          <div className="text-[10px] text-text-dim tabular-nums">{clock}</div>
        )}
      </div>
    </div>
  );
}

interface Situation {
  summary?: string;
  description?: string;
  reportType?: string;
  validFromDate?: string;
  validToDate?: string;
}

function SituationsSection({ entities }: { entities: HassEntities }) {
  const allSituations: Situation[] = [];

  for (const stop of STOPS) {
    const entity = entities[stop.entity];
    if (!entity) continue;
    const situations = entity.attributes?.situations as Situation[] | undefined;
    if (situations?.length) {
      for (const s of situations) {
        // deduplicate by summary
        if (s.summary && !allSituations.some((x) => x.summary === s.summary)) {
          allSituations.push(s);
        }
      }
    }
  }

  if (allSituations.length === 0) return null;

  return (
    <div className="mx-4 mb-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-accent-warm mb-2 flex items-center gap-1.5">
        <Icon icon="mdi:alert-circle-outline" width={13} />
        Driftsmeldinger
      </div>
      <div className="space-y-2">
        {allSituations.map((s, i) => (
          <div key={i} className="rounded-xl bg-accent-warm/10 border border-accent-warm/20 px-3.5 py-3">
            <div className="text-xs font-medium text-accent-warm">{s.summary ?? "Melding"}</div>
            {s.description && s.description !== s.summary && (
              <div className="text-[11px] text-text-secondary mt-1 leading-relaxed">{s.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StopCard({ stop, entities }: { stop: TransportStop; entities: HassEntities }) {
  const entity = entities[stop.entity];
  if (!entity) return null;

  const dueMin       = parseNumericState(entity.state);
  const route        = entity.attributes?.route as string | undefined;
  const routeId      = entity.attributes?.route_id as string | undefined;
  const nextRoute    = entity.attributes?.next_route as string | undefined;
  const nextDueAt    = entity.attributes?.next_due_at as string | undefined;
  const nextRouteId  = entity.attributes?.next_route_id as string | undefined;
  const isRealtime   = entity.attributes?.real_time as boolean | undefined;
  const nextMin      = nextDueAt ? parseNumericState(nextDueAt) : null;

  if (!route || !routeId) {
    return (
      <div className="rounded-2xl bg-bg-card p-4">
        <div className="text-sm font-medium text-text-secondary mb-1">{stop.name}</div>
        <div className="text-xs text-text-dim">Ingen avganger</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon icon="mdi:map-marker" width={13} className="text-text-dim shrink-0" />
        <span className="text-sm font-semibold">{stop.name}</span>
      </div>
      <div className="divide-y divide-white/5">
        <DepartureRow
          route={route}
          routeId={routeId}
          dueMin={dueMin}
          isRealtime={isRealtime ?? false}
          isNext={false}
        />
        {nextRoute && nextRouteId && nextMin !== null && (
          <DepartureRow
            route={nextRoute}
            routeId={nextRouteId}
            dueMin={nextMin}
            isRealtime={false}
            isNext
          />
        )}
      </div>
    </div>
  );
}

/** Journey planner: Homansbyen → Majorstuen (trikk) → Amagerveien (buss) */
const TRIKK_TRAVEL_MIN = 4; // estimated Homansbyen → Majorstuen by trikk

interface JourneyDep { route: string; routeId: string; dueMin: number; }

function getNextDeps(entity: { state: string; attributes: Record<string, unknown> } | undefined): JourneyDep[] {
  if (!entity) return [];
  const deps: JourneyDep[] = [];
  const due = parseNumericState(entity.state);
  if (due !== null && entity.attributes.route && entity.attributes.route_id) {
    deps.push({ route: entity.attributes.route as string, routeId: entity.attributes.route_id as string, dueMin: due });
  }
  const nextDue = entity.attributes.next_due_at ? parseNumericState(entity.attributes.next_due_at as string) : null;
  if (nextDue !== null && entity.attributes.next_route && entity.attributes.next_route_id) {
    deps.push({ route: entity.attributes.next_route as string, routeId: entity.attributes.next_route_id as string, dueMin: nextDue });
  }
  return deps;
}

function JourneyCard({ entities }: { entities: HassEntities }) {
  const homansbyen = entities["sensor.transport_homansbyen"] as { state: string; attributes: Record<string, unknown> } | undefined;
  const majorstuen = entities["sensor.transport_majorstuen"] as { state: string; attributes: Record<string, unknown> } | undefined;

  // Filter for trikk from Homansbyen (route_id 11-19)
  const trikkDeps = getNextDeps(homansbyen).filter((d) => {
    const num = parseInt(d.routeId.replace("RUT:Line:", ""));
    return num >= 11 && num <= 19;
  });

  // Filter for buss from Majorstuen (not tbane 1-5, not trikk 11-19)
  const bussDeps = getNextDeps(majorstuen).filter((d) => {
    const num = parseInt(d.routeId.replace("RUT:Line:", ""));
    return !(num >= 1 && num <= 5) && !(num >= 11 && num <= 19);
  });

  if (trikkDeps.length === 0 && bussDeps.length === 0) return null;

  const trikk = trikkDeps[0] ?? null;
  const arrivalAtMajor = trikk ? trikk.dueMin + TRIKK_TRAVEL_MIN : null;

  // Find first feasible bus (departs after estimated arrival at Majorstuen + 1 min buffer)
  const feasibleBuss = arrivalAtMajor !== null
    ? bussDeps.find((b) => b.dueMin >= arrivalAtMajor + 1) ?? null
    : bussDeps[0] ?? null;

  const connectionOk = trikk !== null && feasibleBuss !== null && feasibleBuss.dueMin >= (trikk.dueMin + TRIKK_TRAVEL_MIN + 1);
  const connectionTight = feasibleBuss !== null && trikk !== null && !connectionOk && feasibleBuss.dueMin >= (trikk.dueMin + TRIKK_TRAVEL_MIN - 1);

  const connColor = !trikk || !feasibleBuss ? "text-text-dim" : connectionOk ? "text-accent-green" : connectionTight ? "text-accent-warm" : "text-accent-red";
  const connIcon  = !trikk || !feasibleBuss ? "mdi:minus" : connectionOk ? "mdi:check-circle" : connectionTight ? "mdi:alert-circle" : "mdi:close-circle";

  return (
    <div className="mx-4 mb-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-dim mb-2 flex items-center gap-1.5">
        <Icon icon="mdi:map-marker-path" width={13} />
        Min reise
      </div>
      <div className="rounded-2xl bg-bg-card overflow-hidden">
        {/* Leg 1: Homansbyen → Majorstuen (trikk) */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-green/15">
            <Icon icon="mdi:tram" width={15} className="text-accent-green" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">Homansbyen → Majorstuen</div>
            {trikk ? (
              <div className="text-[11px] text-text-dim mt-0.5">
                {trikk.route.split(" ")[0]} · ankommer ~{formatMin(trikk.dueMin + TRIKK_TRAVEL_MIN)}
              </div>
            ) : (
              <div className="text-[11px] text-text-dim mt-0.5">Ingen trikk funnet</div>
            )}
          </div>
          {trikk && (
            <div className="shrink-0 text-right">
              <div className={`text-sm font-bold tabular-nums ${trikk.dueMin === 0 ? "text-accent-green animate-pulse" : "text-text-primary"}`}>
                {formatMin(trikk.dueMin)}
              </div>
              <div className="text-[10px] text-text-dim tabular-nums">{clockTime(trikk.dueMin)}</div>
            </div>
          )}
        </div>

        {/* Connection indicator */}
        <div className="flex items-center gap-2 px-4 py-1 border-t border-white/5">
          <div className="ml-4 h-4 w-px bg-white/10" />
          <Icon icon={connIcon} width={12} className={connColor} />
          <span className={`text-[10px] ${connColor}`}>
            {!trikk || !feasibleBuss ? "Beregner…"
              : connectionOk ? "God forbindelse"
              : connectionTight ? "Knapp forbindelse"
              : "Rekker ikke — neste avgang"}
          </span>
        </div>

        {/* Leg 2: Majorstuen → Amagerveien (buss) */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-white/5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-warm/15">
            <Icon icon="mdi:bus" width={15} className="text-accent-warm" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">Majorstuen → Amagerveien</div>
            {feasibleBuss ? (
              <div className="text-[11px] text-text-dim mt-0.5">{feasibleBuss.route}</div>
            ) : (
              <div className="text-[11px] text-text-dim mt-0.5">Ingen buss funnet</div>
            )}
          </div>
          {feasibleBuss && (
            <div className="shrink-0 text-right">
              <div className={`text-sm font-bold tabular-nums ${feasibleBuss.dueMin === 0 ? "text-accent-green animate-pulse" : "text-text-primary"}`}>
                {formatMin(feasibleBuss.dueMin)}
              </div>
              <div className="text-[10px] text-text-dim tabular-nums">{clockTime(feasibleBuss.dueMin)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TransportPopupProps {
  open: boolean;
  onClose: () => void;
}

function useClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" }));
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" }));
    }, 10_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function TransportPopup({ open, onClose }: TransportPopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;
  const clock = useClock();

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl bg-bg-primary pb-[env(safe-area-inset-bottom)] shadow-2xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 40 }}
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                  <div className="h-1 w-10 rounded-full bg-white/20" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-white/5">
                  <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                    <Icon icon="mdi:bus-clock" width={18} className="text-accent-cool" />
                    Kollektivtransport
                    <span className="ml-1 text-sm font-normal tabular-nums text-text-dim">{clock}</span>
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Avganger fra nærmeste holdeplasser
                  </Dialog.Description>
                  <button
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-text-dim hover:bg-white/12 transition-colors"
                  >
                    <Icon icon="mdi:close" width={16} />
                  </button>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 px-5 py-2.5 shrink-0">
                  {(["tbane", "trikk", "buss"] as const).map((type) => {
                    const m = TRANSPORT_META[type];
                    return (
                      <div key={type} className="flex items-center gap-1.5">
                        <Icon icon={m.icon} width={13} className={m.color} />
                        <span className="text-xs text-text-dim">{m.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Scrollable stops */}
                <div className="flex-1 overflow-y-auto">
                  <JourneyCard entities={entities} />
                  <SituationsSection entities={entities} />
                  <div className="space-y-3 px-4 pb-4">
                    {STOPS.map((stop) => (
                      <StopCard key={stop.entity} stop={stop} entities={entities} />
                    ))}
                  </div>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
