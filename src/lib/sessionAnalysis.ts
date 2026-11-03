/** v0.6.0 – evidence-first, deterministic session signals, NOT a training prescription.
 * A session goal and HR zones are not available yet; no pass/fail for an easy run.
 */
export type SessionSample = { i: number; hr?: number; speed?: number; elapsed?: number; distance?: number }
export type SessionSignal = { level: 'info' | 'positive' | 'attention'; title: string; explanation: string }
export type SessionAnalysis = {
  quality: 'sufficient' | 'limited'
  validHr: number
  totalSamples: number
  meanHr: number | null
  firstHr: number | null
  lateHr: number | null
  hrChange: number | null
  speedChangePercent: number | null
  signals: SessionSignal[]
}

const mean = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null
const n = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const bpm = (value: number) => `${Math.round(value)} bpm`
const percent = (value: number) => `${Math.abs(value).toFixed(1).replace('.', ',')} %`

export function analyzeSession(samples: SessionSample[]): SessionAnalysis {
  const points = samples.filter(p => n(p.hr) && p.hr >= 35 && p.hr <= 220)
  const validHr = points.length
  const empty: SessionAnalysis = {
    quality: 'limited', validHr, totalSamples: samples.length,
    meanHr: null, firstHr: null, lateHr: null, hrChange: null,
    speedChangePercent: null,
    signals: [{ level: 'info', title: 'Noch keine zuverlässige HF-Auswertung',
      explanation: 'Für diese Einheit liegen zu wenige valide HF-Messpunkte vor. Garmin importiert die Details möglicherweise noch.' }],
  }
  if (validHr < 80) return empty

  // Compare comparable fractions of the recorded time series. Skip the first and
  // last 10%, where warmup/cooldown often dominate. No invented target zones.
  const first = points.slice(Math.floor(validHr * .15), Math.floor(validHr * .40))
  const late = points.slice(Math.floor(validHr * .60), Math.floor(validHr * .85))
  const firstHr = mean(first.map(p => p.hr!).filter(n))
  const lateHr = mean(late.map(p => p.hr!).filter(n))
  const meanHr = mean(points.map(p => p.hr!).filter(n))
  const earlySpeed = first.map(p=>p.speed).filter((v):v is number => n(v) && v>=1.2 && v<=8)
  const lateSpeed = late.map(p=>p.speed).filter((v):v is number => n(v) && v>=1.2 && v<=8)
  const sufficientSpeed = earlySpeed.length >= Math.max(20,first.length*.7) && lateSpeed.length >= Math.max(20,late.length*.7)
  const speedFirst = sufficientSpeed ? mean(earlySpeed) : null
  const speedLate = sufficientSpeed ? mean(lateSpeed) : null
  const speedChangePercent = speedFirst !== null && speedLate !== null && speedFirst>0
    ? 100*(speedLate/speedFirst-1) : null
  const hrChange = firstHr !== null && lateHr !== null ? lateHr-firstHr : null
  const result: SessionAnalysis = {
    quality: 'sufficient', validHr, totalSamples: samples.length,
    meanHr, firstHr, lateHr, hrChange, speedChangePercent, signals: [],
  }
  result.signals.push({
    level: 'info', title: 'HF-Verlauf messbar',
    explanation: `${validHr} gültige HF-Messpunkte. Früher Abschnitt ${bpm(firstHr!)} · später Abschnitt ${bpm(lateHr!)}. Die Randbereiche und die Mitte zwischen den Vergleichsabschnitten wurden ausgespart.`,
  })
  if (hrChange !== null && speedChangePercent !== null && Math.abs(speedChangePercent) <= 5) {
    if (hrChange >= 5) result.signals.push({
      level: 'attention', title: 'HF-Anstieg bei ähnlichem Tempo',
      explanation: `Die Herzfrequenz stieg um rund ${Math.round(hrChange)} bpm; die mittlere Geschwindigkeit änderte sich um ${percent(speedChangePercent)}. Das kann ein Hinweis auf kardiovaskuläre Drift sein, ist aber ohne Höhenprofil, Temperatur und Trainingsziel keine definitive Bewertung.`,
    })
    else if (Math.abs(hrChange) < 5) result.signals.push({
      level: 'positive', title: 'Vergleichsweise stabiler HF-Verlauf',
      explanation: `Bei ähnlicher Geschwindigkeit änderte sich die HF zwischen den Vergleichsabschnitten nur um ${Math.abs(Math.round(hrChange))} bpm. Das beschreibt diesen Lauf, keine allgemeine Erholungsfreigabe.`,
    })
    else result.signals.push({
      level: 'info', title: 'HF im Verlauf niedriger',
      explanation: `Der spätere Abschnitt lag rund ${Math.abs(Math.round(hrChange))} bpm unter dem früheren bei vergleichbarer Geschwindigkeit. Die Ursache ist aus diesen Daten allein nicht bestimmbar.`,
    })
  } else {
    result.signals.push({
      level: 'info', title: 'Pace-Einfluss nicht sicher getrennt',
      explanation: speedChangePercent === null
        ? 'Für einen sinnvollen Driftvergleich fehlen ausreichend plausible Geschwindigkeitsmesspunkte.'
        : `Die mittlere Geschwindigkeit änderte sich um ${percent(speedChangePercent)}. Daher wäre eine reine HF-Differenz kein verlässlicher Driftindikator.`,
    })
  }
  result.signals.push({
    level: 'info', title: 'Trainingsziel noch nicht hinterlegt',
    explanation: 'Ohne geplante HF-Zone, Zieltempo und subjektives Befinden können wir noch nicht beurteilen, ob ein Easy Run zu intensiv war. Es wird kein künstliches Urteil vergeben.',
  })
  return result
}
