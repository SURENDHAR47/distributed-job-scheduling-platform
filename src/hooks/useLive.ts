import { useEffect, useRef, useState } from "react";
import { engine, type EventName } from "../lib/engine";

/**
 * Subscribes the component to the engine's realtime event bus (the in-browser
 * stand-in for a Socket.IO connection) and forces a re-render whenever
 * relevant events fire, so every page reflects live job/worker/queue state.
 */
export function useLive(events: EventName[] = ["state:sync"]) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const offs = events.map((e) => engine.bus.on(e, () => setTick((t) => t + 1)));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join(",")]);
}

export interface FeedItem {
  id: string;
  message: string;
  kind: "info" | "success" | "warning" | "error";
  timestamp: number;
}

/** Realtime activity feed shown in the topbar, sourced from the engine event bus. */
export function useRealtimeFeed(limit = 30) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const push = (message: string, kind: FeedItem["kind"]) => {
      counter.current += 1;
      setItems((prev) => [{ id: `${Date.now()}-${counter.current}`, message, kind, timestamp: Date.now() }, ...prev].slice(0, limit));
    };
    const offs = [
      engine.bus.on("job:completed", (j) => push(`Job "${j.name}" completed`, "success")),
      engine.bus.on("job:failed", (j) => push(`Job "${j.name}" failed — scheduling retry`, "warning")),
      engine.bus.on("job:dead_letter", (j) => push(`Job "${j.name}" moved to Dead Letter Queue`, "error")),
      engine.bus.on("worker:online", (w) => push(`Worker ${w.name} is online`, "info")),
      engine.bus.on("worker:offline", (w) => push(`Worker ${w.name} went offline`, "error")),
      engine.bus.on("queue:paused", (q) => push(`Queue "${q.name}" paused`, "warning")),
      engine.bus.on("queue:resumed", (q) => push(`Queue "${q.name}" resumed`, "success")),
    ];
    return () => offs.forEach((off) => off());
  }, [limit]);

  return items;
}
