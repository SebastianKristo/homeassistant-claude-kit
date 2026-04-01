import { useState } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import type { HeaderConfig } from "../../lib/entities";
import { PersonPopup } from "../popups/PersonPopup";

// ── input_select mode system (Oslo) ─────────────────────────────────────────

const SELECT_MODE_ICONS: Record<string, string> = {
  Normal:  "mdi:home-thermometer",
  Helg:    "mdi:sofa",
  Sommer:  "lucide:thermometer-snowflake",
  Borte:   "mdi:airplane",
};

// ── Boolean mode system (Toten) ──────────────────────────────────────────────

interface BooleanMode {
  id: "borte" | "hjemme" | "ankommer" | "sommer";
  label: string;
  icon: string;
  color: string;
}

const BOOLEAN_MODES: BooleanMode[] = [
  { id: "borte",    label: "Borte",              icon: "mdi:home-export-outline", color: "text-text-dim" },
  { id: "hjemme",   label: "Hjemme",             icon: "mdi:home",                color: "text-accent-green" },
  { id: "ankommer", label: "Ankommer i morgen",  icon: "mdi:home-clock",          color: "text-accent-cool" },
  { id: "sommer",   label: "Sommer-modus",       icon: "mdi:weather-sunny",       color: "text-accent-warm" },
];

function deriveBooleanMode(
  entities: HassEntities,
  awayMode: string,
  ankommerIMorgen: string,
  sommerModus: string,
): BooleanMode {
  const sommer   = entities[sommerModus]?.state === "on";
  const away     = entities[awayMode]?.state === "on";
  const ankommer = entities[ankommerIMorgen]?.state === "on";
  if (sommer)   return BOOLEAN_MODES[3];
  if (!away)    return BOOLEAN_MODES[1];
  if (ankommer) return BOOLEAN_MODES[2];
  return BOOLEAN_MODES[0];
}

function applyBooleanMode(
  connection: Connection,
  id: BooleanMode["id"],
  awayMode: string,
  ankommerIMorgen: string,
  sommerModus: string,
) {
  const svc = (entity: string, on: boolean) =>
    callService(connection, "input_boolean", on ? "turn_on" : "turn_off", undefined, { entity_id: entity });

  switch (id) {
    case "borte":
      svc(awayMode, true); svc(ankommerIMorgen, false); svc(sommerModus, false); break;
    case "hjemme":
      svc(awayMode, false); svc(ankommerIMorgen, false); svc(sommerModus, false); break;
    case "ankommer":
      svc(awayMode, true); svc(ankommerIMorgen, true); svc(sommerModus, false); break;
    case "sommer":
      svc(sommerModus, true); break;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface HeaderProps {
  config: HeaderConfig;
}

export function Header({ config }: HeaderProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;
  const [personOpen, setPersonOpen] = useState(false);
  const [modeOpen,   setModeOpen]   = useState(false);

  const useBooleans = Boolean(config.awayMode);

  // ── Boolean mode system (Toten) ─────────────────────────────────────────
  const currentBooleanMode = useBooleans
    ? deriveBooleanMode(entities, config.awayMode!, config.ankommerIMorgen!, config.sommerModus!)
    : null;

  const selectBooleanMode = (id: BooleanMode["id"]) => {
    if (!connection || !useBooleans) return;
    applyBooleanMode(connection, id, config.awayMode!, config.ankommerIMorgen!, config.sommerModus!);
    setModeOpen(false);
  };

  // ── input_select mode system (Oslo) ─────────────────────────────────────
  const climateMode  = !useBooleans ? (entities[config.climateMode]?.state ?? "—") : null;
  const modeOptions  = !useBooleans
    ? ((entities[config.climateMode]?.attributes?.options as string[] | undefined) ?? [])
    : null;

  const selectInputSelectMode = (option: string) => {
    if (!connection || useBooleans) return;
    callService(connection, "input_select", "select_option", { option }, { entity_id: config.climateMode });
    setModeOpen(false);
  };

  // ── Derived display values ───────────────────────────────────────────────
  const pillLabel = useBooleans ? currentBooleanMode!.label : (climateMode ?? "—");
  const pillIcon  = useBooleans
    ? currentBooleanMode!.icon
    : (SELECT_MODE_ICONS[climateMode ?? ""] ?? "mdi:home-thermometer");

  return (
    <>
      <header className="sticky top-0 z-30 flex min-w-0 items-center gap-2 bg-bg-primary px-4 py-2 text-xs">
        {/* Presence badges */}
        <button
          onClick={() => setPersonOpen(true)}
          className="flex min-w-0 items-center gap-2 overflow-hidden rounded-full px-1 py-0.5 transition-colors hover:bg-white/5 active:bg-white/8"
        >
          {config.persons.map((p) => {
            const state  = entities[p.id]?.state;
            const isHome = state === "home";
            return (
              <div key={p.id} className="flex min-w-0 items-center gap-1" title={p.name}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${isHome ? "bg-accent-green" : "bg-text-dim"}`} />
                <span className="text-text-secondary">{p.name}</span>
              </div>
            );
          })}
        </button>

        <div className="min-w-0 flex-1" />

        {/* Climate mode pill — tappable */}
        <div className="relative">
          <button
            onClick={() => setModeOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-bg-elevated px-2 py-0.5 text-text-secondary hover:bg-white/10 transition-colors active:bg-white/12"
          >
            <Icon icon={pillIcon} width={12} />
            <span className="max-w-[110px] truncate">{pillLabel}</span>
            <Icon icon="mdi:chevron-down" width={10} className={`transition-transform ${modeOpen ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {modeOpen && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setModeOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-2xl bg-bg-card shadow-xl ring-1 ring-white/8"
                >
                  {useBooleans
                    ? BOOLEAN_MODES.map((m) => {
                        const isActive = m.id === currentBooleanMode!.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => selectBooleanMode(m.id)}
                            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/6 ${
                              isActive ? m.color : "text-text-secondary"
                            }`}
                          >
                            <Icon icon={m.icon} width={14} />
                            {m.label}
                            {isActive && <Icon icon="mdi:check" width={12} className="ml-auto" />}
                          </button>
                        );
                      })
                    : modeOptions!.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => selectInputSelectMode(opt)}
                          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/6 ${
                            opt === climateMode ? "text-accent" : "text-text-secondary"
                          }`}
                        >
                          <Icon icon={SELECT_MODE_ICONS[opt] ?? "mdi:home-thermometer"} width={14} />
                          {opt}
                          {opt === climateMode && <Icon icon="mdi:check" width={12} className="ml-auto text-accent" />}
                        </button>
                      ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      <PersonPopup open={personOpen} onClose={() => setPersonOpen(false)} />
    </>
  );
}
