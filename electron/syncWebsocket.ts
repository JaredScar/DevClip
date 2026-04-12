import { BrowserWindow, ipcMain } from 'electron';

/**
 * DevClip Sync WebSocket Client
 *
 * Provides real-time sync notifications from the sync server.
 * Connects to WebSocket endpoint at wss://sync-server/v1/realtime
 * and notifies renderer process of sync updates.
 */

interface WSMessage {
  type: string;
  channel?: string;
  timestamp?: string;
  action?: string;
  id?: string | number;
}

interface SyncWSClientOptions {
  apiKey: string;
  deviceId: string;
  serverUrl: string;
  onMessage: (msg: WSMessage) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (err: Error) => void;
}

class SyncWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private options: SyncWSClientOptions;
  private isConnected = false;
  private reconnectDelay = 5000;
  private maxReconnectDelay = 60000;

  constructor(options: SyncWSClientOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    try {
      const wsUrl = this.options.serverUrl.replace(/^https?:\/\//, 'ws://').replace(/^http:\/\//, 'ws://') + '/v1/realtime';

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectDelay = 5000; // Reset reconnect delay
        this.options.onConnect();
        this.startHeartbeat();

        // Authenticate
        this.send({
          type: 'auth',
          apiKey: this.options.apiKey,
          deviceId: this.options.deviceId,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WSMessage;
          this.options.onMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.stopHeartbeat();
        this.options.onDisconnect();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        this.options.onError(new Error('WebSocket error'));
      };
    } catch (err) {
      this.options.onError(err as Error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  subscribe(channels: string[]): void {
    if (!this.isConnected) return;
    this.send({
      type: 'subscribe',
      channels,
    });
  }

  unsubscribe(channels: string[]): void {
    if (!this.isConnected) return;
    this.send({
      type: 'unsubscribe',
      channels,
    });
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}

// Global client instance
let syncWSClient: SyncWebSocketClient | null = null;
let getMainWindow: (() => BrowserWindow | null) | null = null;

export function setupSyncWebSocket(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow;

  ipcMain.handle('sync:wsConnect', async (_event, config: { apiKey: string; deviceId: string; serverUrl: string }) => {
    if (syncWSClient) {
      syncWSClient.disconnect();
    }

    syncWSClient = new SyncWebSocketClient({
      apiKey: config.apiKey,
      deviceId: config.deviceId,
      serverUrl: config.serverUrl,
      onConnect: () => {
        broadcastToRenderer({ type: 'ws_connected' });
      },
      onDisconnect: () => {
        broadcastToRenderer({ type: 'ws_disconnected' });
      },
      onError: (err) => {
        broadcastToRenderer({ type: 'ws_error', error: err.message });
      },
      onMessage: (msg) => {
        broadcastToRenderer({ type: 'ws_message', data: msg });
      },
    });

    syncWSClient.connect();
    return { ok: true };
  });

  ipcMain.handle('sync:wsDisconnect', () => {
    syncWSClient?.disconnect();
    syncWSClient = null;
    return { ok: true };
  });

  ipcMain.handle('sync:wsSubscribe', (_event, channels: string[]) => {
    syncWSClient?.subscribe(channels);
    return { ok: true };
  });

  ipcMain.handle('sync:wsUnsubscribe', (_event, channels: string[]) => {
    syncWSClient?.unsubscribe(channels);
    return { ok: true };
  });

  ipcMain.handle('sync:wsStatus', () => {
    return {
      connected: syncWSClient !== null,
    };
  });
}

function broadcastToRenderer(msg: Record<string, unknown>): void {
  const win = getMainWindow?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('sync:wsUpdate', msg);
  }
}
