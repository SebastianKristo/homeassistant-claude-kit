import { useHass } from "@hakit/core";
import type { HassEntities } from "home-assistant-js-websocket";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@iconify/react";
import { BottomSheet } from "./BottomSheet";
import { parseNumericState } from "../../lib/format";
import {
  PLEX_STATUS, PLEX_CPU, PLEX_MEMORY,
  PLEX_RECENTLY_MOVIE, PLEX_RECENTLY_SHOW,
  PLEX_DISK_USAGE, PLEX_MAX_DISK_USAGE,
  PLEX_UPTIME, PLEX_NET_IN, PLEX_NET_OUT,
  RADARR_HEALTH, RADARR_UPCOMING,
  SONARR_UPCOMING,
} from "../../lib/entities";

interface MediaPopupProps {
  open: boolean;
  onClose: () => void;
}

interface MediaItem {
  title?: string;
  episode?: string;
  number?: string;
  runtime?: number;
  rating?: string;
  genres?: string;
  poster?: string;
  airdate?: string;
  studio?: string;
  summary?: string;
  flag?: boolean;
}

function formatRuntime(minutes: number | undefined): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}t ${m}m` : `${m}m`;
}

function formatAirdate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - now.getTime()) / 86_400_000);
    if (diff === 0) return "I dag";
    if (diff === 1) return "I morgen";
    if (diff === -1) return "I går";
    if (diff > 1 && diff < 7) return `Om ${diff} dager`;
    return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function parseItems(raw: unknown): MediaItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((e): e is MediaItem =>
      typeof e === "object" && e !== null && "title" in e && typeof (e as MediaItem).title === "string",
    )
    .slice(0, 5);
}

function formatBytes(gb: number | null): string {
  if (gb === null) return "—";
  if (gb >= 1) return `${gb.toFixed(1)} GiB`;
  return `${(gb * 1024).toFixed(0)} MiB`;
}

function formatUptime(hours: number | null): string {
  if (hours === null) return "—";
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  if (d > 0) return `${d}d ${h}t`;
  return `${h}t`;
}

// ── Shared item card ────────────────────────────────────────────────────────

function MediaItemCard({
  item,
  icon,
  showAirdate = false,
}: {
  item: MediaItem;
  icon: string;
  showAirdate?: boolean;
}) {
  const airLabel = showAirdate ? formatAirdate(item.airdate) : "";

  return (
    <div className="flex gap-3 items-start">
      {/* Poster */}
      <div className="w-11 h-16 shrink-0 rounded-lg bg-bg-elevated overflow-hidden flex items-center justify-center">
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Icon icon={icon} width={20} className="text-text-dim" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 py-0.5">
        <div className="font-medium text-sm truncate leading-tight">{item.title}</div>
        {item.episode && (
          <div className="text-xs text-text-secondary truncate mt-0.5">{item.episode}</div>
        )}
        {item.number && (
          <div className="text-xs text-text-dim">{item.number}</div>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {item.runtime && (
            <span className="text-[10px] text-text-dim">{formatRuntime(item.runtime)}</span>
          )}
          {item.rating && item.rating !== "" && (
            <span className="text-[10px] text-text-dim">{item.rating}</span>
          )}
          {item.studio && (
            <span className="text-[10px] text-text-dim">{item.studio}</span>
          )}
          {airLabel && (
            <span className={`text-[10px] font-medium ${
              airLabel === "I dag" || airLabel === "I morgen"
                ? "text-accent-green"
                : "text-text-dim"
            }`}>
              {airLabel}
            </span>
          )}
        </div>
        {item.genres && (
          <div className="text-[10px] text-text-dim truncate">{item.genres}</div>
        )}
      </div>
    </div>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  badge,
  badgeOk,
  children,
}: {
  icon: string;
  title: string;
  badge?: string;
  badgeOk?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon={icon} width={16} className="text-text-secondary" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {badge !== undefined && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            badgeOk
              ? "bg-accent-green/15 text-accent-green"
              : "bg-accent-red/15 text-accent-red"
          }`}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Plex session (now playing) ───────────────────────────────────────────────

interface PlexSession {
  entityId: string;
  title: string;
  subtitle: string;
  state: string;
  mediaDuration: number;
  mediaPosition: number;
  user: string;
  thumb: string;
}

function parsePlexSessions(entities: HassEntities): PlexSession[] {
  return Object.entries(entities)
    .filter(([id, e]) =>
      id.startsWith("media_player.plex_") &&
      (e.state === "playing" || e.state === "paused"),
    )
    .map(([id, e]) => {
      const attr = e.attributes as Record<string, unknown>;
      const title = (attr.media_series_title as string) || (attr.media_title as string) || "Ukjent";
      const episode = attr.media_title as string | undefined;
      const season = attr.media_season as number | undefined;
      const ep = attr.media_episode_number as number | undefined;
      let subtitle = "";
      if (season !== undefined && ep !== undefined) {
        subtitle = `S${String(season).padStart(2, "0")}E${String(ep).padStart(2, "0")}`;
        if (episode && episode !== title) subtitle += ` — ${episode}`;
      } else if (episode && episode !== title) {
        subtitle = episode;
      }
      return {
        entityId: id,
        title,
        subtitle,
        state: e.state,
        mediaDuration: (attr.media_duration as number) || 0,
        mediaPosition: (attr.media_position as number) || 0,
        user: (attr.media_content_rating as string) || "",
        thumb: (attr.entity_picture as string) || "",
      };
    });
}

function PlexSessionCard({ session }: { session: PlexSession }) {
  const pct = session.mediaDuration > 0
    ? Math.round((session.mediaPosition / session.mediaDuration) * 100)
    : 0;

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="flex gap-3 items-start">
      {/* Thumbnail */}
      <div className="w-11 h-16 shrink-0 rounded-lg bg-bg-elevated overflow-hidden flex items-center justify-center">
        {session.thumb ? (
          <img
            src={session.thumb}
            alt={session.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <Icon icon="mdi:plex" width={20} className="text-accent-warm" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-1.5">
          <Icon
            icon={session.state === "playing" ? "mdi:play" : "mdi:pause"}
            width={11}
            className={session.state === "playing" ? "text-accent-green shrink-0" : "text-text-dim shrink-0"}
          />
          <div className="font-medium text-sm truncate leading-tight">{session.title}</div>
        </div>
        {session.subtitle && (
          <div className="text-xs text-text-secondary truncate mt-0.5">{session.subtitle}</div>
        )}
        {session.mediaDuration > 0 && (
          <div className="mt-1.5 space-y-0.5">
            <div className="h-1 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-warm transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-dim tabular-nums">
              <span>{formatTime(session.mediaPosition)}</span>
              <span>{formatTime(session.mediaDuration)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main popup ──────────────────────────────────────────────────────────────

export function MediaPopup({ open, onClose }: MediaPopupProps) {
  const entities = useHass((s) => s.entities) as HassEntities;

  const plexOnline  = entities[PLEX_STATUS]?.state === "on";
  const plexCpu     = parseNumericState(entities[PLEX_CPU]?.state);
  const plexMemory  = parseNumericState(entities[PLEX_MEMORY]?.state);
  const plexDisk    = parseNumericState(entities[PLEX_DISK_USAGE]?.state);
  const plexMaxDisk = parseNumericState(entities[PLEX_MAX_DISK_USAGE]?.state);
  const plexUptime  = parseNumericState(entities[PLEX_UPTIME]?.state);
  const plexNetIn   = parseNumericState(entities[PLEX_NET_IN]?.state);
  const plexNetOut  = parseNumericState(entities[PLEX_NET_OUT]?.state);
  const radarrOk    = entities[RADARR_HEALTH]?.state === "on";

  const diskPct = plexDisk !== null && plexMaxDisk !== null && plexMaxDisk > 0
    ? Math.round((plexDisk / plexMaxDisk) * 100)
    : null;

  const radarrUpcoming = parseItems(
    (entities[RADARR_UPCOMING]?.attributes as { data?: unknown[] } | undefined)?.data,
  );
  const sonarrUpcoming = parseItems(
    (entities[SONARR_UPCOMING]?.attributes as { data?: unknown[] } | undefined)?.data,
  );

  const recentMovies = parseItems(
    (entities[PLEX_RECENTLY_MOVIE]?.attributes as { data?: unknown[] } | undefined)?.data,
  ).slice(0, 3);
  const recentShows = parseItems(
    (entities[PLEX_RECENTLY_SHOW]?.attributes as { data?: unknown[] } | undefined)?.data,
  ).slice(0, 3);

  const plexSessions = parsePlexSessions(entities);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <Dialog.Title className="sr-only">Media</Dialog.Title>
      <Dialog.Description className="sr-only">Plex, Radarr, Sonarr og mediastatus</Dialog.Description>

      <div className="overflow-y-auto px-4 pb-6 pt-2 space-y-4">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:plex" width={20} className={plexOnline ? "text-accent-warm" : "text-text-dim"} />
          <h2 className="text-base font-semibold">Media</h2>
        </div>

        {/* ── Nå på Plex ───────────────────────────────────────────── */}
        {plexSessions.length > 0 && (
          <Section icon="mdi:play-circle-outline" title="Nå på Plex">
            <div className="space-y-3">
              {plexSessions.map((s) => (
                <PlexSessionCard key={s.entityId} session={s} />
              ))}
            </div>
          </Section>
        )}

        {/* ── Plex server ──────────────────────────────────────────── */}
        <Section
          icon="mdi:plex"
          title="Plex"
          badge={plexOnline ? "Online" : "Offline"}
          badgeOk={plexOnline}
        >
          {plexOnline && (
            <div className="space-y-2">
              {/* CPU + RAM */}
              {(plexCpu !== null || plexMemory !== null) && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {plexCpu !== null && (
                    <div className="rounded-xl bg-bg-elevated px-3 py-2">
                      <div className="text-text-dim mb-0.5">CPU</div>
                      <div className="font-semibold tabular-nums">{plexCpu.toFixed(1)}%</div>
                    </div>
                  )}
                  {plexMemory !== null && (
                    <div className="rounded-xl bg-bg-elevated px-3 py-2">
                      <div className="text-text-dim mb-0.5">RAM</div>
                      <div className="font-semibold tabular-nums">{plexMemory.toFixed(0)}%</div>
                    </div>
                  )}
                </div>
              )}

              {/* Disk */}
              {plexDisk !== null && plexMaxDisk !== null && (
                <div className="rounded-xl bg-bg-elevated px-3 py-2 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-text-dim">Disk</span>
                    <span className="font-semibold tabular-nums">
                      {formatBytes(plexDisk)} / {formatBytes(plexMaxDisk)}
                    </span>
                  </div>
                  {diskPct !== null && (
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          diskPct > 85 ? "bg-accent-red" : diskPct > 65 ? "bg-accent-warm" : "bg-accent-cool"
                        }`}
                        style={{ width: `${diskPct}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Uptime + network */}
              {(plexUptime !== null || plexNetIn !== null || plexNetOut !== null) && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {plexUptime !== null && (
                    <div className="rounded-xl bg-bg-elevated px-3 py-2">
                      <div className="text-text-dim mb-0.5">Oppetid</div>
                      <div className="font-semibold tabular-nums">{formatUptime(plexUptime)}</div>
                    </div>
                  )}
                  {plexNetIn !== null && (
                    <div className="rounded-xl bg-bg-elevated px-3 py-2">
                      <div className="text-text-dim mb-0.5">Inn</div>
                      <div className="font-semibold tabular-nums">{formatBytes(plexNetIn)}</div>
                    </div>
                  )}
                  {plexNetOut !== null && (
                    <div className="rounded-xl bg-bg-elevated px-3 py-2">
                      <div className="text-text-dim mb-0.5">Ut</div>
                      <div className="font-semibold tabular-nums">{formatBytes(plexNetOut)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Sonarr — kommende episoder ───────────────────────────── */}
        {sonarrUpcoming.length > 0 && (
          <Section icon="mdi:television-play" title="Kommende serier">
            <div className="space-y-3">
              {sonarrUpcoming.map((item, i) => (
                <MediaItemCard key={i} item={item} icon="mdi:television-play" showAirdate />
              ))}
            </div>
          </Section>
        )}

        {/* ── Radarr — kommende filmer ─────────────────────────────── */}
        <Section
          icon="mdi:radar"
          title="Kommende filmer"
          badge={radarrOk ? "Sunn" : "Feil"}
          badgeOk={radarrOk}
        >
          {radarrUpcoming.length > 0 ? (
            <div className="space-y-3">
              {radarrUpcoming.map((item, i) => (
                <MediaItemCard key={i} item={item} icon="mdi:movie-outline" showAirdate />
              ))}
            </div>
          ) : (
            <div className="text-xs text-text-dim py-1">Ingen kommende filmer</div>
          )}
        </Section>

        {/* ── Nylig lagt til — filmer ──────────────────────────────── */}
        {recentMovies.length > 0 && (
          <Section icon="mdi:movie-outline" title="Nylig lagt til — filmer">
            <div className="space-y-3">
              {recentMovies.map((item, i) => (
                <MediaItemCard key={i} item={item} icon="mdi:movie" />
              ))}
            </div>
          </Section>
        )}

        {/* ── Nylig lagt til — serier ──────────────────────────────── */}
        {recentShows.length > 0 && (
          <Section icon="mdi:television-play" title="Nylig lagt til — serier">
            <div className="space-y-3">
              {recentShows.map((item, i) => (
                <MediaItemCard key={i} item={item} icon="mdi:television-play" />
              ))}
            </div>
          </Section>
        )}
      </div>
    </BottomSheet>
  );
}
