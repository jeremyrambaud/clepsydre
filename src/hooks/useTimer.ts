import { useState, useRef, useCallback, useEffect } from "react";

const TIMER_STORAGE_KEY = "clepsydre-active-timer";

interface PersistedTimerState {
  isRunning: boolean;
  isPaused: boolean;
  startTimeMs: number | null;
  pausedElapsed: number;
  elapsedSeconds: number;
}

function readPersistedTimerState(): PersistedTimerState {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) {
      return {
        isRunning: false,
        isPaused: false,
        startTimeMs: null,
        pausedElapsed: 0,
        elapsedSeconds: 0,
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedTimerState>;
    const isRunning = Boolean(parsed.isRunning);
    const isPaused = Boolean(parsed.isPaused);
    const startTimeMs = typeof parsed.startTimeMs === "number" ? parsed.startTimeMs : null;
    const pausedElapsed = Math.max(0, Math.floor(parsed.pausedElapsed ?? 0));
    const storedElapsed = Math.max(0, Math.floor(parsed.elapsedSeconds ?? 0));

    if (isRunning && !isPaused && startTimeMs !== null) {
      const liveElapsed = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
      return {
        isRunning,
        isPaused,
        startTimeMs,
        pausedElapsed: liveElapsed,
        elapsedSeconds: liveElapsed,
      };
    }

    if (isRunning && isPaused) {
      const paused = pausedElapsed || storedElapsed;
      return {
        isRunning,
        isPaused,
        startTimeMs,
        pausedElapsed: paused,
        elapsedSeconds: paused,
      };
    }

    return {
      isRunning: false,
      isPaused: false,
      startTimeMs: null,
      pausedElapsed: 0,
      elapsedSeconds: 0,
    };
  } catch {
    return {
      isRunning: false,
      isPaused: false,
      startTimeMs: null,
      pausedElapsed: 0,
      elapsedSeconds: 0,
    };
  }
}

export interface TimerReturn {
  elapsedSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  hours: string;
  minutes: string;
  seconds: string;
  startTime: Date | null;
  setStartTime: (date: Date) => void;
  subtractElapsed: (seconds: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function useTimer(): TimerReturn {
  const initialStateRef = useRef<PersistedTimerState | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = readPersistedTimerState();
  }

  const persistedState = initialStateRef.current;
  const [startTime, setStartTimeState] = useState<Date | null>(
    persistedState.startTimeMs ? new Date(persistedState.startTimeMs) : null
  );
  const [pausedElapsed, setPausedElapsed] = useState(persistedState.pausedElapsed);
  const [elapsedSeconds, setElapsedSeconds] = useState(persistedState.elapsedSeconds);
  const [isRunning, setIsRunning] = useState(persistedState.isRunning);
  const [isPaused, setIsPaused] = useState(persistedState.isPaused);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    setStartTimeState((st) => {
      if (!st) return st;
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - st.getTime()) / 1000)));
      return st;
    });
  }, []);

  const start = useCallback(() => {
    clearTimer();
    const now = new Date();
    setStartTimeState(now);
    setPausedElapsed(0);
    setElapsedSeconds(0);
    setIsRunning(true);
    setIsPaused(false);
    intervalRef.current = setInterval(tick, 1000);
  }, [clearTimer, tick]);

  const pause = useCallback(() => {
    clearTimer();
    setIsPaused(true);
    setPausedElapsed(elapsedSeconds);
  }, [clearTimer, elapsedSeconds]);

  const resume = useCallback(() => {
    const now = new Date();
    const adjusted = new Date(now.getTime() - pausedElapsed * 1000);
    setStartTimeState(adjusted);
    setIsPaused(false);
    intervalRef.current = setInterval(tick, 1000);
  }, [pausedElapsed, tick]);

  const reset = useCallback(() => {
    clearTimer();
    setStartTimeState(null);
    setPausedElapsed(0);
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsPaused(false);
  }, [clearTimer]);

  const stop = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    setIsPaused(false);
  }, [clearTimer]);

  const setStartTime = useCallback(
    (date: Date) => {
      setStartTimeState(date);
      if (isRunning && !isPaused) {
        const now = Date.now();
        setElapsedSeconds(Math.max(0, Math.floor((now - date.getTime()) / 1000)));
      } else if (isPaused) {
        const now = Date.now();
        const newElapsed = Math.max(0, Math.floor((now - date.getTime()) / 1000));
        setElapsedSeconds(newElapsed);
        setPausedElapsed(newElapsed);
      }
    },
    [isRunning, isPaused]
  );

  const subtractElapsed = useCallback((seconds: number) => {
    const delta = Math.max(0, Math.floor(seconds));
    if (delta === 0) return;

    setElapsedSeconds((previousElapsed) => {
      const nextElapsed = Math.max(0, previousElapsed - delta);
      setPausedElapsed(nextElapsed);
      setStartTimeState((currentStartTime) => {
        if (!currentStartTime) return currentStartTime;
        return new Date(Date.now() - nextElapsed * 1000);
      });
      return nextElapsed;
    });
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    if (isRunning && !isPaused && startTime && !intervalRef.current) {
      tick();
      intervalRef.current = setInterval(tick, 1000);
    }

    if ((!isRunning || isPaused || !startTime) && intervalRef.current) {
      clearTimer();
    }
  }, [clearTimer, isPaused, isRunning, startTime, tick]);

  useEffect(() => {
    if (isRunning || isPaused) {
      const payload: PersistedTimerState = {
        isRunning,
        isPaused,
        startTimeMs: startTime ? startTime.getTime() : null,
        pausedElapsed,
        elapsedSeconds,
      };
      localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(payload));
      return;
    }

    localStorage.removeItem(TIMER_STORAGE_KEY);
  }, [elapsedSeconds, isPaused, isRunning, pausedElapsed, startTime]);

  const totalH = Math.floor(elapsedSeconds / 3600);
  const totalM = Math.floor((elapsedSeconds % 3600) / 60);
  const totalS = elapsedSeconds % 60;

  return {
    elapsedSeconds,
    isRunning,
    isPaused,
    hours: pad(totalH),
    minutes: pad(totalM),
    seconds: pad(totalS),
    startTime,
    setStartTime,
    subtractElapsed,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
