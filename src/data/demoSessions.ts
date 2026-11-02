export const demoSessions = {
  "easy": {
    "summary": "Die Pace war gleichmäßig, aber HF und RPE sprechen gegen den geplanten Easy-Charakter. Nicht jede gute Zeit ist eine gute Easy-Einheit.",
    "goal": "Ziel: Locker & aerob",
    "rpe": "RPE 6/10 · Garmin",
    "quality": "Datenlage: gut · Demo",
    "grade": "Teilweise",
    "gradeSub": "erreicht",
    "metrics": [
      [
        "DISTANZ",
        "10,2",
        "km"
      ],
      [
        "Ø PACE",
        "5:42",
        "/km"
      ],
      [
        "Ø HF",
        "153",
        "bpm"
      ],
      [
        "DAUER",
        "58:08",
        ""
      ]
    ],
    "chartTitle": "Herzfrequenz über die Einheit",
    "chart": "M0,205 C80,170 108,151 190,145 S350,116 420,110 S550,82 680,70",
    "zone": [
      110,
      55
    ],
    "chartNote": "Die Herzfrequenz steigt gegen Ende über den geplanten lockeren Bereich.",
    "goodTitle": "Das war gut",
    "good": "Du bist ohne hektische Temposprünge gelaufen. Die Pace blieb kontrolliert.",
    "critTitle": "Das war nicht optimal",
    "crit": "Die HF lag lange über dem Easy-Bereich; RPE 6/10 bestätigt die höhere Beanspruchung.",
    "next": "Nächste Easy-Einheit nach HF steuern, nicht nach der Kilometerpace.",
    "planned": "Ein wirklich lockerer aerober Lauf zur Unterstützung der Regeneration.",
    "actual": "Die Einheit fühlte sich laut beispielhaftem Garmin-RPE fordernder an als vorgesehen.",
    "coach": "Easy nicht über die Pace definieren. Nächste Schlüsseleinheit im Wochenkontext überprüfen.",
    "title1": "Gute Kontrolle.",
    "title2": "Zu viel Intensität."
  },
  "intervals": {
    "summary": "Die schnellen Abschnitte sind bemerkenswert gleichmäßig. Die Pausen waren ausreichend und das letzte Intervall blieb kontrolliert – diesmal ist Lob angebracht.",
    "goal": "Ziel: Tempohärte & Kontrolle",
    "rpe": "RPE 8/10 · Garmin",
    "quality": "Datenlage: gut · Demo",
    "grade": "Erreicht",
    "gradeSub": "sauber umgesetzt",
    "metrics": [
      [
        "PROGRAMM",
        "6 × 800",
        "m"
      ],
      [
        "Ø SCHNELL",
        "4:18",
        "/km"
      ],
      [
        "HF PEAK",
        "178",
        "bpm"
      ],
      [
        "DAUER",
        "52:15",
        ""
      ]
    ],
    "chartTitle": "HF-Muster über die Wiederholungen",
    "chart": "M0,185 L40,183 L64,75 L105,81 L125,186 L164,176 L191,68 L237,83 L256,185 L299,177 L326,64 L373,78 L394,179 L434,175 L463,60 L506,75 L527,178 L570,175 L603,57 L649,76 L680,170",
    "zone": [
      55,
      55
    ],
    "chartNote": "Sechs klar getrennte Belastungs- und Erholungsphasen; kein auffälliger Einbruch im letzten Durchgang.",
    "goodTitle": "Das war stark",
    "good": "Die Wiederholungen waren gleichmäßig. Kein unnötig schneller Start und kein deutlicher Tempoabfall.",
    "critTitle": "Kein relevantes Problem",
    "crit": "Die Einheit erfüllt ihren Zweck. Eine künstliche Kritik wäre hier fehl am Platz.",
    "next": "Erholung ernst nehmen und die nächsten Easy-Einheiten auch wirklich locker laufen.",
    "planned": "Sechs kontrollierte Intervalle mit vollständiger Erholung zwischen den Belastungen.",
    "actual": "Konstanter Rhythmus, verlässliche Pausen und ein stabiler Schluss.",
    "coach": "Einheit als gelungen verbuchen; Qualität der folgenden Erholung beobachten, nicht sofort nachschärfen.",
    "title1": "Sechs Wiederholungen.",
    "title2": "Sechs starke Argumente."
  },
  "longrun": {
    "summary": "Die Belastung war über weite Strecken stabil. Gegen Ende fehlen im Beispiel aber Kohlenhydrate und die Herzfrequenz steigt bei ähnlicher Pace.",
    "goal": "Ziel: Ausdauer & Verpflegung",
    "rpe": "RPE 7/10 · Garmin",
    "quality": "Fueling: unvollständig · Demo",
    "grade": "Teilweise",
    "gradeSub": "mit Lernpotenzial",
    "metrics": [
      [
        "DISTANZ",
        "24,0",
        "km"
      ],
      [
        "Ø PACE",
        "6:12",
        "/km"
      ],
      [
        "Ø HF",
        "147",
        "bpm"
      ],
      [
        "DAUER",
        "2:28",
        "h"
      ]
    ],
    "chartTitle": "HF-Trend / lange Belastung",
    "chart": "M0,190 C60,178 101,169 143,154 S230,151 288,143 S386,130 440,125 S538,94 590,81 S645,53 680,37",
    "zone": [
      118,
      48
    ],
    "chartNote": "Im letzten Drittel erhöhte HF – Fueling, Wärme und Streckenprofil als mögliche Einflussfaktoren prüfen.",
    "goodTitle": "Das war gut",
    "good": "Du hast die Belastung lange stabil gehalten und dein Tempo nicht früh überzogen.",
    "critTitle": "Eine wichtige Lücke",
    "crit": "Die tatsächliche KH-Aufnahme ist im Beispiel unvollständig dokumentiert. Daraus darf der Coach keine sichere Ursache ableiten.",
    "next": "Vor dem nächsten Longrun die geplante KH-Menge vorbereiten und tatsächlich genommene Produkte kurz bestätigen.",
    "planned": "Langer, ruhiger Lauf mit regelmäßiger Energiezufuhr.",
    "actual": "Gutes Pacing, aber unvollständige Fueling-Daten und höherer Puls zum Ende.",
    "coach": "Versorgungsplan als Hypothese verbessern; nicht behaupten, dass jedes HF-Signal durch Fueling entstand.",
    "title1": "Starke Ausdauer.",
    "title2": "Fueling mit Lücke."
  }
} as const
