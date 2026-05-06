export function backoffSeconds(retry: number, cap: number): number {
  if (retry < 1) return 0;
  return Math.min(2 ** (retry - 1), cap);
}

export type ReconnectConfig = {
  maxRetries: number;
  backoffCap: number;
  idleTimeout: number;
  startConnection: () => { stop: () => void };
  onAttempt: (retry: number, waitSec: number) => void;
  onConnected: () => void;
  onLost: (reason: string) => void;
  onIdle: () => void;
  onMaxRetries: (retries: number) => void;
};

export type ReconnectController = {
  start: () => void;
  noteConnected: () => void;
  noteEvent: () => void;
  noteDisconnect: (reason: string) => void;
  stop: () => void;
};

export function createReconnect(cfg: ReconnectConfig): ReconnectController {
  let retries = 0;
  let active: { stop: () => void } | null = null;
  let scheduled: NodeJS.Timeout | null = null;
  let idle: NodeJS.Timeout | null = null;
  let stopped = false;

  const armIdle = (): void => {
    if (idle) clearTimeout(idle);
    if (cfg.idleTimeout > 0) {
      idle = setTimeout(() => {
        cfg.onIdle();
        if (active) active.stop();
      }, cfg.idleTimeout * 1000);
    }
  };

  const connectNow = (): void => {
    scheduled = null;
    if (stopped) return;
    active = cfg.startConnection();
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
    if (retries >= cfg.maxRetries) {
      cfg.onMaxRetries(retries);
      return;
    }
    retries++;
    const wait = backoffSeconds(retries, cfg.backoffCap);
    cfg.onAttempt(retries, wait);
    scheduled = setTimeout(connectNow, wait * 1000);
  };

  return {
    start: connectNow,
    noteConnected: () => {
      retries = 0;
      armIdle();
      cfg.onConnected();
    },
    noteEvent: armIdle,
    noteDisconnect: (reason) => {
      if (!stopped) cfg.onLost(reason);
      active = null;
      if (idle) clearTimeout(idle);
      idle = null;
      scheduleReconnect();
    },
    stop: () => {
      stopped = true;
      if (scheduled) clearTimeout(scheduled);
      if (idle) clearTimeout(idle);
      if (active) active.stop();
    },
  };
}
