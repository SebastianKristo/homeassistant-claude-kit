import { useState, useRef } from "react";
import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { MediaPlayersPopup } from "../popups/MediaPlayersPopup";
import {
  SQUEEZEBOX_RADIO,
} from "../../lib/entities";

interface PlayerInfo {
  entityId: string;
  name: string;
  icon: string;
  title: string;
  subtitle: string;
  imgUrl: string;
  state: string;
  duration: number;
  position: number;
}

const KNOWN_PLAYERS: { id: string; name: string; icon: string }[] = [
  { id: SQUEEZEBOX_RADIO,  name: "Squeezebox Radio", icon: "mdi:radio" },
];

function getActivePlayer(entities: HassEntities): PlayerInfo | null {
  // Collect all candidates: known players + Plex sessions
  const candidates: PlayerInfo[] = [];

  for (const { id, name, icon } of KNOWN_PLAYERS) {
    const e = entities[id];
    if (!e || (e.state !== "playing" && e.state !== "paused")) continue;
    const attrs = e.attributes as Record<string, unknown>;
    const mediaTitle  = attrs.media_title  as string | undefined;
    const mediaArtist = attrs.media_artist as string | undefined;
    const seriesTitle = attrs.media_series_title as string | undefined;

    let title = seriesTitle || mediaTitle || name;
    let subtitle = "";
    if (seriesTitle && mediaTitle && mediaTitle !== seriesTitle) subtitle = mediaTitle;
    else if (mediaArtist) subtitle = mediaArtist;

    candidates.push({
      entityId: id,
      name,
      icon,
      title,
      subtitle,
      imgUrl: (attrs.entity_picture as string) || "",
      state: e.state,
      duration: (attrs.media_duration as number) || 0,
      position: (attrs.media_position as number) || 0,
    });
  }

  if (candidates.length === 0) return null;
  // Prefer playing over paused
  return candidates.find((c) => c.state === "playing") ?? candidates[0];
}

export function MiniPlayer() {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;
  const [popupOpen, setPopupOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const dragging = useRef(false);

  const player = getActivePlayer(entities);

  // Re-show if the track changes after dismissal
  const playerKey = player ? `${player.entityId}:${player.title}` : null;
  const isDismissed = dismissed !== null && dismissed === playerKey;

  const cmd = (action: string) => {
    if (!connection || !player) return;
    callService(connection, "media_player", action, {}, { entity_id: player.entityId });
  };

  const pct = player && player.duration > 0
    ? Math.min(100, (player.position / player.duration) * 100)
    : 0;

  return (
    <>
      <AnimatePresence>
        {player && !isDismissed && (
          <motion.div
            key="mini-player"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragStart={() => { dragging.current = true; }}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 400) {
                setDismissed(playerKey);
              }
              setTimeout(() => { dragging.current = false; }, 50);
            }}
            className="fixed left-0 right-0 z-40 px-3 md:left-[72px] cursor-grab active:cursor-grabbing"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 59px)" }}
          >
            <div className="rounded-2xl bg-bg-card/90 backdrop-blur-md shadow-lg overflow-hidden ring-1 ring-white/8">

              {/* Main row */}
              <button
                onClick={() => { if (!dragging.current) setPopupOpen(true); }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                {/* Art */}
                <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-bg-elevated flex items-center justify-center">
                  {player.imgUrl ? (
                    <img
                      src={player.imgUrl}
                      alt={player.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Icon icon={player.icon} width={18} className="text-text-dim" />
                  )}
                </div>

                {/* Title */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate leading-tight">{player.title}</div>
                  {player.subtitle ? (
                    <div className="text-xs text-text-secondary truncate">{player.subtitle}</div>
                  ) : (
                    <div className="text-xs text-text-dim truncate">{player.name}</div>
                  )}
                </div>

                {/* Controls — stop propagation so they don't open popup */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => cmd("media_previous_track")}
                    className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition-transform"
                  >
                    <Icon icon="mdi:skip-previous" width={20} />
                  </button>
                  <button
                    onClick={() => cmd(player.state === "playing" ? "media_pause" : "media_play")}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/16 active:scale-90 transition-transform"
                  >
                    <Icon icon={player.state === "playing" ? "mdi:pause" : "mdi:play"} width={22} />
                  </button>
                  <button
                    onClick={() => cmd("media_next_track")}
                    className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition-transform"
                  >
                    <Icon icon="mdi:skip-next" width={20} />
                  </button>
                </div>
              </button>
              {/* Progress bar — bottom edge */}
              {pct > 0 && (
                <div className="h-0.5 bg-white/8">
                  <div
                    className="h-full bg-accent-cool/70 transition-all duration-1000"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MediaPlayersPopup open={popupOpen} onClose={() => setPopupOpen(false)} />
    </>
  );
}
