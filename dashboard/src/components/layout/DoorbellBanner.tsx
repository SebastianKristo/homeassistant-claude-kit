import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";

const DOORBELL_BOOLEAN = "input_boolean.ringeklokke_varsel";

export function DoorbellBanner() {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  const isRinging = entities[DOORBELL_BOOLEAN]?.state === "on";

  const dismiss = () => {
    if (!connection) return;
    callService(connection, "input_boolean", "turn_off", {}, { entity_id: DOORBELL_BOOLEAN });
  };

  return (
    <AnimatePresence>
      {isRinging && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed left-0 right-0 z-40 flex justify-center px-4"
          style={{ top: "calc(env(safe-area-inset-top) + 52px)" }}
        >
          <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-accent-warm/15 px-4 py-3 ring-1 ring-accent-warm/30 shadow-lg backdrop-blur-md">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-warm/20">
              <Icon icon="mdi:doorbell" width={20} className="text-accent-warm" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-accent-warm">Noen ringer på døren</div>
              <div className="text-xs text-text-dim">Trykk for å se hvem det er</div>
            </div>
            <button
              onClick={dismiss}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors"
              aria-label="Lukk varsel"
            >
              <Icon icon="mdi:close" width={14} className="text-text-secondary" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
