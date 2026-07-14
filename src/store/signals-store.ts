"use client";

import { create } from "zustand";
import { api, WS_URL, type Signal } from "@/lib/api";
import { getToken } from "@/store/auth-store";

interface SignalsState {
  signals: Signal[];
  loading: boolean;
  live: boolean;
  load: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
}

let ws: WebSocket | null = null;

export const useSignalsStore = create<SignalsState>((set) => ({
  signals: [],
  loading: true,
  live: false,

  load: async () => {
    const token = getToken();
    if (!token) return;
    try {
      const signals = await api.signals(token, 24);
      set({ signals, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  connect: () => {
    if (ws || typeof window === "undefined") return;
    try {
      // Pass the token so the server filters the live push by this user's access.
      const token = getToken();
      ws = new WebSocket(token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL);
      ws.onopen = () => set({ live: true });
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type: string; data: Signal[] };
          if (msg.type === "signals") set({ signals: msg.data, loading: false });
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => { set({ live: false }); ws = null; };
      ws.onerror = () => { set({ live: false }); };
    } catch { /* WS unavailable — REST polling still works */ }
  },

  disconnect: () => {
    ws?.close();
    ws = null;
    set({ live: false });
  },
}));
