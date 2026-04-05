import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useSliderControl } from "../../lib/useSliderControl";
import { SliderTrack } from "../controls/SliderTrack";
import { getEntityPicture, entityPictureOnError } from "../../lib/entity-picture";
import { SeekBar } from "../controls/SeekBar";

interface FullPlayerPopupProps {
  open: boolean;
  onClose: () => void;
  entityId: string;
}

function VolumeRow({ entityId, entities, connection }: { entityId: string; entities: HassEntities; connection: Connection | null }) {
  const entity = entities[entityId];
  const volume = entity?.attributes?.volume_level as number | undefined;
  const isMuted = entity?.attributes?.is_volume_muted as boolean | undefined;
  const features = (entity?.attributes?.supported_features as number) ?? 0;
  const canMute = (features & 8) !== 0;

  const commit = (pct: number) => {
    if (!connection) return;
    callService(connection, "media_player", "volume_set", { volume_level: pct / 100 }, { entity_id: entityId }).catch(() => {});
  };
  const slider = useSliderControl(Math.round((volume ?? 0) * 100), commit, { min: 0, max: 100, step: 1 });

  if (volume === undefined) return null;

  return (
    <div className="flex items-center gap-3">
      {canMute ? (
        <button
          onClick={() => connection && callService(connection, "media_player", "volume_mute", { is_volume_muted: !isMuted }, { entity_id: entityId }).catch(() => {})}
          className="shrink-0 text-text-dim hover:text-text-secondary transition-colors"
        >
          <Icon icon={isMuted ? "mdi:volume-off" : "mdi:volume-low"} width={18} />
        </button>
      ) : (
        <Icon icon="mdi:volume-low" width={18} className="shrink-0 text-text-dim" />
      )}
      <SliderTrack slider={slider} formatValue={(v) => `${Math.round(v)}%`} />
      <Icon icon="mdi:volume-high" width={18} className="shrink-0 text-text-dim" />
    </div>
  );
}

export function FullPlayerPopup({ open, onClose, entityId }: FullPlayerPopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  const entity = entities[entityId];
  if (!entity) return null;

  const attrs      = entity.attributes as Record<string, unknown>;
  const state      = entity.state;
  const title      = attrs.media_title  as string | undefined;
  const artist     = attrs.media_artist as string | undefined;
  const album      = attrs.media_album_name as string | undefined;
  const picture    = getEntityPicture(attrs);
  const duration   = attrs.media_duration as number | undefined;
  const position   = attrs.media_position as number | undefined;
  const updatedAt  = attrs.media_position_updated_at as string | undefined;
  const features   = (attrs.supported_features as number) ?? 0;

  const canPause    = (features & 1) !== 0;
  const canSeek     = (features & 2) !== 0;
  const canPrevious = (features & 16) !== 0;
  const canNext     = (features & 32) !== 0;
  const canPlay     = (features & 16384) !== 0;

  const cmd = (action: string, data?: Record<string, unknown>) => {
    if (!connection) return;
    callService(connection, "media_player", action, data ?? {}, { entity_id: entityId }).catch(() => {});
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 40 }}
                className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-bg-primary pb-[env(safe-area-inset-bottom)] overflow-hidden"
              >
                <Dialog.Title className="sr-only">Mediaspiller</Dialog.Title>
                <Dialog.Description className="sr-only">Kontroller for nåværende spiller</Dialog.Description>

                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-white/20" />
                </div>

                <div className="px-6 pb-8 pt-2 space-y-6">

                  {/* Album art */}
                  <div className="flex justify-center">
                    <div className="w-64 h-64 rounded-2xl overflow-hidden bg-bg-elevated shadow-2xl">
                      {picture ? (
                        <img
                          src={picture.src}
                          data-fallback={picture.fallback}
                          alt={title ?? ""}
                          className="w-full h-full object-cover"
                          onError={entityPictureOnError}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon icon="mdi:music-note" width={64} className="text-text-dim/40" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Track info */}
                  <div className="text-center space-y-0.5">
                    <div className="text-lg font-semibold truncate">{title ?? "Ukjent tittel"}</div>
                    {artist && <div className="text-sm text-text-secondary truncate">{artist}</div>}
                    {album && <div className="text-xs text-text-dim truncate">{album}</div>}
                  </div>

                  {/* Seek bar */}
                  {canSeek && duration != null && duration > 0 && (
                    <SeekBar
                      duration={duration}
                      position={position ?? 0}
                      updatedAt={updatedAt}
                      isPlaying={state === "playing"}
                      canSeek={true}
                      onSeek={(t) => cmd("media_seek", { seek_position: t })}
                    />
                  )}

                  {/* Transport controls */}
                  <div className="flex items-center justify-center gap-6">
                    <button
                      onClick={() => cmd("media_previous_track")}
                      disabled={!canPrevious}
                      className="flex h-12 w-12 items-center justify-center rounded-full text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30"
                    >
                      <Icon icon="mdi:skip-previous" width={32} />
                    </button>

                    <button
                      onClick={() => cmd(state === "playing" ? "media_pause" : "media_play")}
                      disabled={!canPause && !canPlay}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-30"
                    >
                      <Icon icon={state === "playing" ? "mdi:pause" : "mdi:play"} width={32} />
                    </button>

                    <button
                      onClick={() => cmd("media_next_track")}
                      disabled={!canNext}
                      className="flex h-12 w-12 items-center justify-center rounded-full text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30"
                    >
                      <Icon icon="mdi:skip-next" width={32} />
                    </button>
                  </div>

                  {/* Volume */}
                  <VolumeRow entityId={entityId} entities={entities} connection={connection} />
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
