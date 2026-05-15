import { useState, useRef, useCallback, useEffect } from "react";

export interface TimerReturn {
  elapsedSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  hours: string;
  minutes: string;
  seconds: string;
  startTime: Date | null;
  setStartTime: (date: Date) => void;
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
  const [startTime, setStartTimeState] = useState<Date | null>(null);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

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
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
