import { useHass } from "@hakit/core";
import type { HassEntities, Connection } from "home-assistant-js-websocket";
import { callService } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { parseNumericState } from "../../lib/format";
import { BottomSheet } from "./BottomSheet";
import {
  APPLETV_ENTITY,
  YAMAHA_RN602,
  SQUEEZEBOX_RADIO,
} from "../../lib/entities";

interface MediaPlayersPopupProps {
  open: boolean;
  onClose: () => void;
}

function VolumeSlider({
  entityId, volume, connection,
}: { entityId: string; volume: number; connection: Connection | null }) {
  const commit = (pct: number) => {
    if (!connection) return;
    callService(connection, "media_player", "volume_set", { volume_level: Math.round(pct * 100) / 100 }, { entity_id: entityId });
  };

  return (
    <div className="flex items-center gap-3">
      <Icon icon="mdi:volume-low" width={16} className="text-text-dim shrink-0" />
      <div className="relative flex-1 flex items-center h-8">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          onChange={(e) => commit(Number(e.target.value) / 100)}
          className="volume-slider w-full"
          style={{
            background: `linear-gradient(to right, var(--color-accent) ${Math.round(volume * 100)}%, rgb(255 255 255 / 0.1) ${Math.round(volume * 100)}%)`,
          }}
        />
      </div>
      <Icon icon="mdi:volume-high" width={16} className="text-text-dim shrink-0" />
      <span className="text-xs tabular-nums text-text-dim w-8 text-right shrink-0">{Math.round(volume * 100)}%</span>
    </div>
  );
}

function AppleTvCard({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  const entity = entities[APPLETV_ENTITY];
  if (!entity) return null;

  const state   = entity.state;
  const attrs   = entity.attributes as Record<string, unknown>;
  const isOn     = state !== "off" && state !== "unavailable" && state !== "standby";
  const isPlaying = state === "playing";
  const isPaused  = state === "paused";

  const title    = attrs.media_title as string | undefined;
  const app      = attrs.app_name as string ?? (attrs.source as string | undefined);
  const imgUrl   = attrs.entity_picture as string | undefined;
  const volume   = parseNumericState(String(attrs.volume_level ?? "")) ?? 0;

  const cmd = (action: string, data?: Record<string, unknown>) => {
    if (!connection) return;
    callService(connection, "media_player", action, data, { entity_id: APPLETV_ENTITY });
  };

  const remoteCmd = (buttonCmd: string) => {
    if (!connection) return;
    callService(connection, "remote", "send_command", { command: buttonCmd, device: "0" }, { entity_id: "remote.stue_tv" });
  };

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${isPlaying ? "bg-accent-cool/8 ring-1 ring-accent-cool/20" : "bg-bg-card"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:apple" width={18} className={isOn ? "text-text-secondary" : "text-text-dim"} />
          <span className="text-sm font-semibold">Stue TV</span>
          {app && isOn && <span className="text-xs text-text-dim truncate max-w-24">{app}</span>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isPlaying ? "bg-accent-cool/15 text-accent-cool"
          : isPaused ? "bg-accent-warm/15 text-accent-warm"
          : isOn ? "bg-white/8 text-text-secondary"
          : "bg-white/8 text-text-dim"
        }`}>
          {isPlaying ? "Spiller" : isPaused ? "Pause" : isOn ? state : "Av"}
        </span>
      </div>

      {(title || imgUrl) && isOn && (
        <div className="flex gap-3 items-center">
          {imgUrl && (
            <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-bg-elevated">
              <img src={imgUrl} alt={title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
          {title && <div className="text-sm font-medium truncate">{title}</div>}
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <button onClick={() => cmd(isOn ? "turn_off" : "turn_on")} className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95 ${isOn ? "bg-accent-red/15 text-accent-red hover:bg-accent-red/25" : "bg-white/8 text-text-dim hover:bg-white/14"}`}>
          <Icon icon="mdi:power" width={18} />
        </button>
        {isOn && (
          <>
            <button onClick={() => cmd("media_previous_track")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
              <Icon icon="mdi:skip-previous" width={20} />
            </button>
            <button onClick={() => cmd(isPlaying ? "media_pause" : "media_play")} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12 hover:bg-white/20 active:scale-95 transition-transform">
              <Icon icon={isPlaying ? "mdi:pause" : "mdi:play"} width={24} />
            </button>
            <button onClick={() => cmd("media_next_track")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
              <Icon icon="mdi:skip-next" width={20} />
            </button>
          </>
        )}
      </div>

      {isOn && volume > 0 && (
        <VolumeSlider entityId={APPLETV_ENTITY} volume={volume} connection={connection} />
      )}

      {isOn && (
        <div className="space-y-1">
          <div className="text-xs text-text-dim text-center">Fjernkontroll</div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => remoteCmd("up")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
              <Icon icon="mdi:chevron-up" width={20} />
            </button>
            <div className="flex items-center gap-1">
              <button onClick={() => remoteCmd("left")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
                <Icon icon="mdi:chevron-left" width={20} />
              </button>
              <button onClick={() => remoteCmd("select")} className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-accent hover:bg-accent/30 active:scale-95 transition-transform">
                <Icon icon="mdi:circle-small" width={20} />
              </button>
              <button onClick={() => remoteCmd("right")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
                <Icon icon="mdi:chevron-right" width={20} />
              </button>
            </div>
            <button onClick={() => remoteCmd("down")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
              <Icon icon="mdi:chevron-down" width={20} />
            </button>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => remoteCmd("menu")} className="rounded-xl bg-white/8 px-3 py-1.5 text-xs hover:bg-white/14 active:scale-95 transition-transform">
                Menu
              </button>
              <button onClick={() => remoteCmd("home")} className="rounded-xl bg-white/8 px-3 py-1.5 text-xs hover:bg-white/14 active:scale-95 transition-transform">
                Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function YamahaCard({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  const entity = entities[YAMAHA_RN602];
  if (!entity) return null;

  const state      = entity.state;
  const attrs      = entity.attributes as Record<string, unknown>;
  const isOn       = state !== "off" && state !== "unavailable";
  const isPlaying  = state === "playing";
  const isPaused   = state === "paused";

  const title      = attrs.media_title as string | undefined;
  const artist     = attrs.media_artist as string | undefined;
  const source     = attrs.source as string | undefined;
  const imgUrl     = attrs.entity_picture as string | undefined;
  const volume     = parseNumericState(String(attrs.volume_level ?? "")) ?? 0;
  const isMuted    = attrs.is_volume_muted === true;
  const sourceList = (attrs.source_list as string[] | undefined) ?? [];

  const cmd = (action: string, data?: Record<string, unknown>) => {
    if (!connection) return;
    callService(connection, "media_player", action, data, { entity_id: YAMAHA_RN602 });
  };

  const COMMON_SOURCES = ["Spotify", "AirPlay", "Bluetooth", "Optical1", "Optical2", "Tuner", "CD"];
  const quickSources = sourceList.filter((s) => COMMON_SOURCES.includes(s));

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${isPlaying ? "bg-accent-warm/8 ring-1 ring-accent-warm/20" : "bg-bg-card"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:amplifier" width={18} className={isOn ? (isPlaying ? "text-accent-warm" : "text-text-secondary") : "text-text-dim"} />
          <span className="text-sm font-semibold">Yamaha RN602</span>
          {source && isOn && <span className="text-xs text-text-dim">{source}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => cmd(isOn ? "turn_off" : "turn_on")}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform active:scale-95 ${isOn ? "bg-accent-red/15 text-accent-red hover:bg-accent-red/25" : "bg-white/8 text-text-dim hover:bg-white/14"}`}
          >
            <Icon icon="mdi:power" width={14} />
          </button>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isPlaying ? "bg-accent-warm/15 text-accent-warm"
            : isPaused ? "bg-accent-warm/10 text-accent-warm"
            : isOn ? "bg-white/8 text-text-secondary"
            : "bg-white/8 text-text-dim"
          }`}>
            {isPlaying ? "Spiller" : isPaused ? "Pause" : isOn ? "På" : "Av"}
          </span>
        </div>
      </div>

      {isOn && (title || artist) && (
        <div className="flex gap-3 items-center">
          {imgUrl && (
            <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-bg-elevated">
              <img src={imgUrl} alt={title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
          <div className="min-w-0">
            {title  && <div className="text-sm font-medium truncate">{title}</div>}
            {artist && <div className="text-xs text-text-secondary truncate">{artist}</div>}
          </div>
        </div>
      )}

      {isOn && (
        <>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => cmd("media_previous_track")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
              <Icon icon="mdi:skip-previous" width={20} />
            </button>
            <button onClick={() => cmd(isPlaying ? "media_pause" : "media_play")} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12 hover:bg-white/20 active:scale-95 transition-transform">
              <Icon icon={isPlaying ? "mdi:pause" : "mdi:play"} width={24} />
            </button>
            <button onClick={() => cmd("media_next_track")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
              <Icon icon="mdi:skip-next" width={20} />
            </button>
            <button
              onClick={() => cmd("volume_mute", { is_volume_muted: !isMuted })}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95 ${isMuted ? "bg-accent-warm/15 text-accent-warm" : "bg-white/8 hover:bg-white/14"}`}
            >
              <Icon icon={isMuted ? "mdi:volume-off" : "mdi:volume-high"} width={18} />
            </button>
          </div>

          <VolumeSlider entityId={YAMAHA_RN602} volume={volume} connection={connection} />

          {quickSources.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {quickSources.map((s) => (
                <button
                  key={s}
                  onClick={() => cmd("select_source", { source: s })}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                    source === s
                      ? "bg-accent-warm/20 text-accent-warm"
                      : "bg-white/6 text-text-dim hover:bg-white/10"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SqueezeboxCard({ entities, connection }: { entities: HassEntities; connection: Connection | null }) {
  const entity = entities[SQUEEZEBOX_RADIO];
  if (!entity) return null;

  const state      = entity.state;
  const attrs      = entity.attributes as Record<string, unknown>;
  const isOn       = state !== "off" && state !== "unavailable";
  const isPlaying  = state === "playing";
  const isPaused   = state === "paused";

  const title      = attrs.media_title as string | undefined;
  const artist     = attrs.media_artist as string | undefined;
  const album      = attrs.media_album_name as string | undefined;
  const imgUrl     = attrs.entity_picture as string | undefined;
  const volume     = parseNumericState(String(attrs.volume_level ?? "")) ?? 0;
  const isMuted    = attrs.is_volume_muted === true;

  const cmd = (action: string, data?: Record<string, unknown>) => {
    if (!connection) return;
    callService(connection, "media_player", action, data, { entity_id: SQUEEZEBOX_RADIO });
  };

  return (
    <div className={`rounded-2xl p-4 space-y-3 ${isPlaying ? "bg-accent-cool/8 ring-1 ring-accent-cool/20" : "bg-bg-card"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:radio" width={18} className={isOn ? (isPlaying ? "text-accent-cool" : "text-text-secondary") : "text-text-dim"} />
          <span className="text-sm font-semibold">Squeezebox Radio</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => cmd(isOn ? "turn_off" : "turn_on")}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform active:scale-95 ${isOn ? "bg-accent-red/15 text-accent-red hover:bg-accent-red/25" : "bg-white/8 text-text-dim hover:bg-white/14"}`}
          >
            <Icon icon="mdi:power" width={14} />
          </button>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isPlaying ? "bg-accent-cool/15 text-accent-cool"
            : isPaused ? "bg-accent-warm/15 text-accent-warm"
            : isOn ? "bg-white/8 text-text-secondary"
            : "bg-white/8 text-text-dim"
          }`}>
            {isPlaying ? "Spiller" : isPaused ? "Pause" : isOn ? "På" : "Av"}
          </span>
        </div>
      </div>

      {isOn && (title || artist) && (
        <div className="flex gap-3 items-center">
          {imgUrl && (
            <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-bg-elevated">
              <img src={imgUrl} alt={title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}
          <div className="min-w-0">
            {title  && <div className="text-sm font-medium truncate">{title}</div>}
            {artist && <div className="text-xs text-text-secondary truncate">{artist}</div>}
            {album  && <div className="text-xs text-text-dim truncate">{album}</div>}
          </div>
        </div>
      )}

      {isOn && (
        <>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => cmd("media_previous_track")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
              <Icon icon="mdi:skip-previous" width={20} />
            </button>
            <button onClick={() => cmd(isPlaying ? "media_pause" : "media_play")} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12 hover:bg-white/20 active:scale-95 transition-transform">
              <Icon icon={isPlaying ? "mdi:pause" : "mdi:play"} width={24} />
            </button>
            <button onClick={() => cmd("media_next_track")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 active:scale-95 transition-transform">
              <Icon icon="mdi:skip-next" width={20} />
            </button>
            <button
              onClick={() => cmd("volume_mute", { is_volume_muted: !isMuted })}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95 ${isMuted ? "bg-accent-warm/15 text-accent-warm" : "bg-white/8 hover:bg-white/14"}`}
            >
              <Icon icon={isMuted ? "mdi:volume-off" : "mdi:volume-high"} width={18} />
            </button>
          </div>

          <VolumeSlider entityId={SQUEEZEBOX_RADIO} volume={volume} connection={connection} />
        </>
      )}
    </div>
  );
}

export function MediaPlayersPopup({ open, onClose }: MediaPlayersPopupProps) {
  const entities   = useHass((s) => s.entities) as HassEntities;
  const connection = useHass((s) => s.connection) as Connection | null;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Høyttalere & TV</Dialog.Title>
      <Dialog.Description className="sr-only">Apple TV, Yamaha og Squeezebox styring</Dialog.Description>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
        <div className="flex items-center gap-2 pt-1">
          <Icon icon="mdi:speaker-wireless" width={20} className="text-accent" />
          <span className="text-lg font-semibold">Høyttalere & TV</span>
        </div>

        <AppleTvCard   entities={entities} connection={connection} />
        <YamahaCard    entities={entities} connection={connection} />
        <SqueezeboxCard entities={entities} connection={connection} />
      </div>
    </BottomSheet>
  );
}
