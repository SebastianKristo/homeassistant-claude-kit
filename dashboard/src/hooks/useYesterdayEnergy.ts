import { useEffect, useState } from "react";
import type { Connection } from "home-assistant-js-websocket";

/** Fetch yesterday's total energy consumption via the recorder statistics API. */
export function useYesterdayEnergy(connection: Connection | null, entityId: string): number | null {
  const [kwh, setKwh] = useState<number | null>(null);
  useEffect(() => {
    if (!connection || !entityId) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    connection.sendMessagePromise<Record<string, Array<{ start: string; change: number | null }>>>({
      type: "recorder/statistics_during_period",
      start_time: yesterday.toISOString(),
      end_time: today.toISOString(),
      statistic_ids: [entityId],
      period: "day",
      types: ["change"],
    }).then((result) => {
      const entries = result[entityId];
      if (entries?.length) {
        const total = entries.reduce((s, e) => s + (e.change ?? 0), 0);
        setKwh(Math.max(0, total));
      }
    }).catch(() => {});
  }, [connection, entityId]);
  return kwh;
}
