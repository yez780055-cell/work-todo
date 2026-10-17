import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const CountdownClockContext = createContext<Date | null>(null)

export function CountdownClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <CountdownClockContext.Provider value={now}>{children}</CountdownClockContext.Provider>
}

export function useCountdownNow(fallback: Date): Date {
  return useContext(CountdownClockContext) ?? fallback
}
