"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { WSMessage } from "./types";
import { getWebSocketUrl } from "./api";

export function useWebSocket() {
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(getWebSocketUrl());

      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => {
        setIsConnected(false);
        // Reconnect after 2 seconds
        reconnectTimeout.current = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage;
          setLastMessage(msg);
        } catch {
          // Ignore non-JSON messages
        }
      };

      wsRef.current = ws;
    } catch {
      // WebSocket not available, retry
      reconnectTimeout.current = setTimeout(connect, 2000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { lastMessage, isConnected };
}
