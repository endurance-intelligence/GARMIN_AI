import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Icon } from './Icon'
import { garminSupabase, garminSupabaseReady } from '../lib/garminSupabase'
import '../styles/garmin-recovery.css'

export function GarminAuthSettings() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!garminSupabase) { setReady(true); return }
    let live = true
    garminSupabase.auth.getSession().then(({ data }) => {
      if (live) { setSession(data.session); setReady(true) }
    }).catch(() => { if (live) setReady(true) })
    const { data: listener } = garminSupabase.auth.onAuthStateChange((_event, current) => {
      if (live) { setSession(current); setReady(true) }
    })
    return () => { live = false; listener.subscription.unsubscribe() }
  }, [])

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!garminSupabase || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: result } = await garminSupabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: new URL(import.meta.env.BASE_URL,window.location.origin).toString(), shouldCreateUser: false },
      })
      if (result) setError(result.message)
      else setNotice('Login-Link verschickt. Bitte die E-Mail in diesem Browser öffnen.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung nicht möglich')
    } finally { setBusy(false) }
  }
  async function signOut() {
    if (!garminSupabase || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: result } = await garminSupabase.auth.signOut()
      if (result) setError(result.message)
      else setNotice('Du bist abgemeldet.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abmeldung nicht möglich')
    } finally { setBusy(false) }
  }

  return <section className="ri-account" aria-label="Supabase Anmeldung für Garmin Health">
    <div className="ri-account-head"><span className="ri-account-icon"><Icon name="settings"/></span><div><span className="micro-label">ACCOUNT / PRIVATE DATA</span><h3>Garmin-Datenzugriff</h3><p>Hier verwaltest du die Anmeldung. Der Coach zeigt nur Messwerte und Trainingsinformationen.</p></div></div>
    {!garminSupabaseReady && <div className="ri-notice">Supabase ist noch nicht konfiguriert. Bitte v0.4.1 vollständig installieren.</div>}
    {garminSupabaseReady && !ready && <div className="ri-notice">Anmeldung wird geprüft ...</div>}
    {garminSupabaseReady && ready && session && <div className="ri-account-status"><div><span className="ri-account-connected">● Angemeldet</span><strong>{session.user.email || 'Supabase-Konto'}</strong><p>Health-Daten bleiben durch die serverseitige Besitzerprüfung geschützt.</p></div><button type="button" className="secondary" disabled={busy} onClick={signOut}>Abmelden</button></div>}
    {garminSupabaseReady && ready && !session && <form className="ri-account-form" onSubmit={sendLink}>
      <label htmlFor="ri-owner-email">E-Mail-Adresse</label>
      <div className="ri-account-row"><input id="ri-owner-email" type="email" value={email} required placeholder="deine@email.de" onChange={e=>setEmail(e.target.value)}/><button className="primary" type="submit" disabled={busy}>{busy ? 'Sende ...' : 'Login-Link senden'}</button></div>
      <p>Nur das in Supabase freigegebene Konto kann auf deine privaten Gesundheitsdaten zugreifen.</p>
    </form>}
    {notice && <div className="ri-notice" role="status">{notice}</div>}
    {error && <div className="recovery-live-error" role="alert">{error}</div>}
  </section>
}
