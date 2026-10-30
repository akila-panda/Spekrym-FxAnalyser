/** W4: live presence peers (other windows). Empty when sync is not running (tests). */
import { useEffect, useState } from "react";
import { getSync } from "@/sync/startSync";
import type { Peer } from "@/sync/presence";

export function usePeers(): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);
  useEffect(() => {
    const p = getSync()?.presence;
    if (!p) return;
    setPeers(p.peers());
    return p.onChange(setPeers);
  }, []);
  return peers;
}