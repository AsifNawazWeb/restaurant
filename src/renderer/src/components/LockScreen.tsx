import { useState } from 'react'
import { Utensils, LockKeyhole } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { api, unwrap } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Terminal lock overlay — login with a staff PIN (4-6 digits). */
export function LockScreen() {
  const { setUser, setLocked } = useUi()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (pin.length < 4) {
      setError('Enter a 4-6 digit PIN')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const user = await unwrap(api.users.loginByPin(pin))
      if (!user) {
        setError('Invalid PIN')
        setPin('')
        return
      }
      setUser(user)
      setLocked(false)
      setPin('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function press(digit: string) {
    if (pin.length >= 6) return
    setPin((p) => p + digit)
    setError(null)
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK']

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-overlay backdrop-blur-md">
      <div className="w-[360px] rounded-2xl border border-border bg-surface/95 p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-sm">
            <Utensils size={22} />
          </div>
          <h1 className="mt-3 text-[16px] font-bold text-foreground">RestoPulse POS</h1>
          <p className="mt-1 text-[12px] text-foreground-muted">Enter your PIN to unlock the terminal</p>
        </div>

        <div className="relative mt-4">
          <LockKeyhole size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            autoFocus
            value={pin}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
              setPin(v)
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="••••"
            className="h-11 pl-9 text-center text-[18px] font-semibold tracking-[0.5em]"
            type="password"
            inputMode="numeric"
          />
        </div>
        {error && <div className="mt-2 text-center text-[12px] font-medium text-danger">{error}</div>}

        <div className="mt-4 grid grid-cols-3 gap-2">
          {digits.map((d) => (
            <Button
              key={d}
              variant={d === 'OK' ? 'default' : 'secondary'}
              size="lg"
              disabled={busy}
              onClick={() => {
                if (d === 'C') setPin('')
                else if (d === 'OK') submit()
                else press(d)
              }}
              className={d === 'C' ? 'text-danger' : ''}
            >
              {d}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
