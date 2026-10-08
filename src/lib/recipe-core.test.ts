import { describe, expect, it } from 'vitest'
import {
  bySection,
  combineAmounts,
  formatAmount,
  formatQty,
  guessAisle,
  guessTimerSeconds,
  isCookable,
  missingLabel,
  missingParts,
  normalizeName,
  normalizeRecipeUrl,
  parseIngredientLine,
  parseLeadingAmount,
  roundNice,
  scaleIngredient,
  stripDecoration,
  toMetric,
  toStep,
  type Recipe,
} from '@core/recipe-core.ts'

describe('parseLeadingAmount', () => {
  it('liest die üblichen Schreibweisen', () => {
    expect(parseLeadingAmount('200 g Mehl')?.qty).toBe(200)
    expect(parseLeadingAmount('1,5 EL Öl')?.qty).toBe(1.5)
    expect(parseLeadingAmount('1.5 tbsp oil')?.qty).toBe(1.5)
    expect(parseLeadingAmount('1/2 TL Salz')?.qty).toBe(0.5)
    expect(parseLeadingAmount('1 1/2 Tassen Milch')?.qty).toBe(1.5)
    expect(parseLeadingAmount('½ TL Salz')?.qty).toBe(0.5)
    expect(parseLeadingAmount('1½ EL Honig')?.qty).toBe(1.5)
  })

  it('nimmt bei Bereichen die untere Grenze und schluckt den Rest', () => {
    expect(parseLeadingAmount('2-3 Eier')).toEqual({ qty: 2, rest: 'Eier' })
    expect(parseLeadingAmount('2–3 Eier')?.qty).toBe(2)
    expect(parseLeadingAmount('2 bis 3 Eier')).toEqual({ qty: 2, rest: 'Eier' })
  })

  it('gibt null zurück, wenn keine Zahl dasteht', () => {
    expect(parseLeadingAmount('Salz nach Geschmack')).toBeNull()
    expect(parseLeadingAmount('Saft einer Zitrone')).toBeNull()
  })
})

describe('toMetric', () => {
  it('rechnet nur definitorisch um', () => {
    expect(toMetric(1, 'kg')).toEqual({ qty: 1000, unit: 'g' })
    expect(toMetric(1, 'lb')).toEqual({ qty: 454, unit: 'g' })
    expect(toMetric(2, 'cup')).toEqual({ qty: 480, unit: 'ml' })
    expect(toMetric(1, 'stick')).toEqual({ qty: 113, unit: 'g' })
  })

  it('lässt küchenübliche Einheiten in Ruhe', () => {
    expect(toMetric(2, 'EL')).toEqual({ qty: 2, unit: 'EL' })
    expect(toMetric(3, 'Zehe')).toEqual({ qty: 3, unit: 'Zehe' })
    expect(toMetric(null, 'Prise')).toEqual({ qty: null, unit: 'Prise' })
  })
})

describe('parseIngredientLine', () => {
  it('zerlegt eine deutsche Zeile', () => {
    const ing = parseIngredientLine('200 g Mehl')
    expect(ing).toMatchObject({ qty: 200, unit: 'g', name_display: 'Mehl', name_key: 'mehl' })
    expect(ing.raw).toBe('200 g Mehl')
  })

  it('zerlegt eine amerikanische Zeile und rechnet um', () => {
    const ing = parseIngredientLine('1 cup flour')
    expect(ing).toMatchObject({ qty: 240, unit: 'ml', name_key: 'mehl' })
    // Das Original bleibt sichtbar — die Umrechnung ersetzt es nicht
    expect(ing.raw).toBe('1 cup flour')
  })

  it('trennt Zusätze ab, ohne sie zu verlieren', () => {
    const komma = parseIngredientLine('2 Zehen Knoblauch, fein gehackt')
    expect(komma).toMatchObject({ qty: 2, unit: 'Zehe', name_key: 'knoblauch', note: 'fein gehackt' })

    const klammer = parseIngredientLine('1 Dose (400 g) gehackte Tomaten')
    expect(klammer).toMatchObject({ qty: 1, unit: 'Dose', note: '400 g' })
    expect(klammer.name_key).toBe('tomate')
  })

  it('lässt Mengenloses mengenlos, statt etwas zu raten', () => {
    const ing = parseIngredientLine('Salz und Pfeffer nach Geschmack')
    expect(ing.qty).toBeNull()
    expect(ing.unit).toBeNull()
    expect(ing.name_display).toBe('Salz und Pfeffer nach Geschmack')
  })

  it('hält ein unbekanntes Wort nicht für eine Einheit', () => {
    const ing = parseIngredientLine('3 Bananen')
    expect(ing.qty).toBe(3)
    expect(ing.unit).toBeNull()
    expect(ing.name_display).toBe('Bananen')
  })

  it('räumt Aufzählungszeichen weg', () => {
    expect(parseIngredientLine('▢ 250 ml Sahne').qty).toBe(250)
    expect(parseIngredientLine('- 250 ml Sahne').unit).toBe('ml')
  })
})

describe('normalizeName', () => {
  it('führt Schreibweisen desselben Dings zusammen', () => {
    expect(normalizeName('Zwiebeln')).toBe('zwiebel')
    expect(normalizeName('Zwiebel')).toBe('zwiebel')
    expect(normalizeName('Tomaten')).toBe('tomate')
    expect(normalizeName('frische Petersilie')).toBe('petersilie')
    expect(normalizeName('Eier')).toBe('ei')
    expect(normalizeName('flour')).toBe('mehl')
  })

  it('lässt kurze Wörter heil, statt sie kaputtzukürzen', () => {
    expect(normalizeName('Butter')).toBe('butter')
    expect(normalizeName('Sahne')).toBe('sahne')
    expect(normalizeName('Zucker')).toBe('zucker')
  })
})

describe('roundNice / formatQty / formatAmount', () => {
  it('rundet auf abmessbare Werte', () => {
    expect(roundNice(133.333)).toBe(133)
    expect(roundNice(3.4)).toBe(3.5)
    expect(roundNice(0.333)).toBe(0.25)
  })

  it('schreibt Brüche als Brüche und Kommas als Kommas', () => {
    expect(formatQty(0.5)).toBe('½')
    expect(formatQty(1.5)).toBe('1½')
    expect(formatQty(0.75)).toBe('¾')
    expect(formatQty(2.4)).toBe('2,4')
    expect(formatQty(300)).toBe('300')
  })

  it('setzt Menge und Einheit zusammen', () => {
    expect(formatAmount(300, 'g')).toBe('300 g')
    expect(formatAmount(1.5, 'EL')).toBe('1½ EL')
    expect(formatAmount(null, 'Prise')).toBe('Prise')
    expect(formatAmount(2, null)).toBe('2')
    // Gramm bleiben ganzzahlig — „0,5 g Salz“ misst niemand ab
    expect(formatAmount(150.5, 'g')).toBe('151 g')
  })

  it('setzt zählbare Einheiten in den Plural', () => {
    expect(formatAmount(1, 'Zehe')).toBe('1 Zehe')
    expect(formatAmount(2, 'Zehe')).toBe('2 Zehen')
    expect(formatAmount(3, 'Dose')).toBe('3 Dosen')
    // Maßeinheiten bleiben, wie sie sind
    expect(formatAmount(2, 'EL')).toBe('2 EL')
    expect(formatAmount(500, 'g')).toBe('500 g')
  })
})

describe('scaleIngredient', () => {
  it('skaliert Mengen', () => {
    const ing = parseIngredientLine('200 g Mehl')
    expect(scaleIngredient(ing, 2).qty).toBe(400)
    expect(scaleIngredient(ing, 0.5).qty).toBe(100)
  })

  it('lässt Zutaten ohne Menge unangetastet', () => {
    const ing = parseIngredientLine('Salz nach Geschmack')
    expect(scaleIngredient(ing, 3)).toEqual(ing)
  })

  it('macht aus 1 Ei bei 1,5× keinen Bruch-Unsinn', () => {
    const ei = parseIngredientLine('1 Ei')
    expect(formatAmount(scaleIngredient(ei, 1.5).qty, null)).toBe('1½')
  })
})

describe('combineAmounts', () => {
  it('rechnet gleiche Einheiten zusammen', () => {
    expect(combineAmounts({ qty: 200, unit: 'g' }, { qty: 150, unit: 'g' })).toEqual({
      qty: 350,
      unit: 'g',
    })
  })

  it('verweigert alles Uneindeutige', () => {
    expect(combineAmounts({ qty: 200, unit: 'g' }, { qty: 1, unit: 'EL' })).toBeNull()
    expect(combineAmounts({ qty: null, unit: 'g' }, { qty: 150, unit: 'g' })).toBeNull()
  })
})

describe('guessTimerSeconds', () => {
  it('findet Dauern im Schritttext', () => {
    expect(guessTimerSeconds('ca. 20 Min backen')).toBe(1200)
    expect(guessTimerSeconds('30 Sekunden anrösten')).toBe(30)
    expect(guessTimerSeconds('1 Stunde ruhen lassen')).toBe(3600)
    expect(guessTimerSeconds('bake for 25 minutes')).toBe(1500)
  })

  it('nimmt bei Bereichen die untere Grenze', () => {
    expect(guessTimerSeconds('20–25 Minuten backen')).toBe(1200)
  })

  it('erfindet keinen Timer, wo keine Zeit steht', () => {
    expect(guessTimerSeconds('Zwiebeln glasig anbraten')).toBeNull()
  })
})

describe('toStep', () => {
  it('räumt Nummerierung weg und hängt den Timer an', () => {
    expect(toStep('3. Bei 180 Grad 25 Minuten backen.')).toEqual({
      text: 'Bei 180 Grad 25 Minuten backen.',
      timer_seconds: 1500,
      group: null,
    })
  })

  it('merkt sich den Abschnitt, zu dem der Schritt gehört', () => {
    expect(toStep('Alles verrühren.', 'DILL AIOLI').group).toBe('DILL AIOLI')
  })

  it('nimmt den Index nicht als Abschnitt, wenn direkt gemappt wird', () => {
    // .map(toStep) hätte hier 0, 1, 2 als Gruppe eingetragen — deshalb
    // wickeln alle Aufrufer den Aufruf ein.
    const steps = ['Erst dies.', 'Dann das.'].map((text) => toStep(text))
    expect(steps.every((s) => s.group === null)).toBe(true)
  })
})

describe('stripDecoration', () => {
  it('wirft Emoji raus, ohne den Namen zu verstümmeln', () => {
    expect(stripDecoration('1 Gurke 🥒')).toBe('1 Gurke')
    expect(stripDecoration('Frischer Dill 🌿')).toBe('Frischer Dill')
  })

  it('entfernt Marken-Handles samt der Klammer, die nur sie enthielt', () => {
    expect(stripDecoration('shredded vegan mozzarella (@violife_foods )')).toBe(
      'shredded vegan mozzarella',
    )
    expect(stripDecoration('@violife_foods')).toBe('')
  })

  it('lässt Mailadressen heil — das @ steht dort mitten im Wort', () => {
    expect(stripDecoration('bestellt bei hallo@hofladen.de')).toBe('bestellt bei hallo@hofladen.de')
  })

  it('schneidet Rabattcode-Werbung ab', () => {
    expect(stripDecoration('vanilla whey @legion discount code KORY to save 20 percent!')).toBe(
      'vanilla whey',
    )
  })

  it('lässt normale Namen in Ruhe — auch Grad, Brüche und Bindestriche', () => {
    expect(stripDecoration('Light-Mayonnaise')).toBe('Light-Mayonnaise')
    expect(stripDecoration('½ Zwiebel')).toBe('½ Zwiebel')
    expect(stripDecoration('bei 180 °C rösten')).toBe('bei 180 °C rösten')
  })

  it('gibt leer zurück, statt zu raten, wenn nur Deko dastand', () => {
    expect(stripDecoration('🔥🔥🔥')).toBe('')
  })
})

describe('bySection', () => {
  it('teilt in Abschnitte und behält die Reihenfolge', () => {
    const sections = bySection([
      { group: 'Teig' },
      { group: 'Teig' },
      { group: 'Füllung' },
    ])
    expect(sections.map(([name, items]) => [name, items.length])).toEqual([
      ['Teig', 2],
      ['Füllung', 1],
    ])
  })

  it('macht aus einer wiederholten Überschrift einen zweiten Block', () => {
    const sections = bySection([{ group: 'A' }, { group: 'B' }, { group: 'A' }])
    expect(sections).toHaveLength(3)
  })

  it('kommt mit lauter gruppenlosen Einträgen klar', () => {
    expect(bySection([{ group: null }, { group: null }])).toEqual([
      [null, [{ group: null }, { group: null }]],
    ])
  })
})

describe('guessAisle', () => {
  it('sortiert die Klassiker richtig ein', () => {
    expect(guessAisle('zwiebel')).toBe('obst_gemuese')
    expect(guessAisle('sahne')).toBe('kuehlregal')
    expect(guessAisle('hackfleisch')).toBe('fleisch_fisch')
    expect(guessAisle('mehl')).toBe('trocken')
    expect(guessAisle('salz')).toBe('gewuerze')
  })

  it('gibt zu, wenn es nicht passt', () => {
    expect(guessAisle('einhornstaub')).toBe('sonstiges')
  })
})

describe('normalizeRecipeUrl', () => {
  it('ergaenzt ein fehlendes https:// — Safari laesst es beim Kopieren weg', () => {
    expect(normalizeRecipeUrl('www.instagram.com/reels/DdHZlGKT2Hk')).toBe(
      'https://www.instagram.com/reels/DdHZlGKT2Hk',
    )
    expect(normalizeRecipeUrl('instagram.com/p/ABC123')).toBe('https://instagram.com/p/ABC123')
  })

  it('laesst vollstaendige Adressen unveraendert', () => {
    expect(normalizeRecipeUrl('https://www.tiktok.com/@koch/video/123')).toBe(
      'https://www.tiktok.com/@koch/video/123',
    )
  })

  it('raeumt Leerzeichen am Rand weg', () => {
    expect(normalizeRecipeUrl('  instagram.com/reel/XY  ')).toBe('https://instagram.com/reel/XY')
  })

  it('erkennt eingefuegten Rezepttext als das, was er ist: kein Link', () => {
    expect(normalizeRecipeUrl('200 g Mehl\n1 Ei')).toBeNull()
    expect(normalizeRecipeUrl('Sommerlicher Thunfisch-Salat')).toBeNull()
  })

  it('lehnt ab, was kein Server sein kann', () => {
    expect(normalizeRecipeUrl('Zutaten')).toBeNull()
    expect(normalizeRecipeUrl('')).toBeNull()
    expect(normalizeRecipeUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('missingParts', () => {
  const base = (over: Partial<Recipe>): Recipe =>
    ({
      id: 'r', title: 'T', source_type: 'web', source_url: null, source_author: null,
      image_path: null, servings: null, total_minutes: null, status: 'complete', lang: null,
      raw_text: null, ingredients: [], steps: [], tags: [], nutrition: null, variant: null,
      created_at: '', updated_at: '', ...over,
    }) as Recipe

  const zutat = parseIngredientLine('200 g Mehl')
  const schritt = toStep('Alles verruehren.')

  it('meldet beides, wenn gar nichts da ist', () => {
    expect(missingParts(base({}))).toEqual(['ingredients', 'steps'])
  })

  it('erkennt den lecocque-Fall: Zutaten da, Zubereitung leer', () => {
    expect(missingParts(base({ ingredients: [zutat] }))).toEqual(['steps'])
  })

  it('meldet nichts bei einem vollstaendigen Rezept', () => {
    expect(missingParts(base({ ingredients: [zutat], steps: [schritt] }))).toEqual([])
    expect(isCookable(base({ ingredients: [zutat], steps: [schritt] }))).toBe(true)
  })

  it('richtet sich nach der eigenen Fassung, wenn es eine gibt', () => {
    // Original unvollstaendig, eigene Version vollstaendig -> nichts fehlt
    const r = base({
      ingredients: [zutat],
      steps: [],
      variant: { servings: null, total_minutes: null, ingredients: [zutat], steps: [schritt], note: null, updated_at: '' },
    })
    expect(missingParts(r)).toEqual([])
  })

  it('formuliert den Hinweis lesbar', () => {
    expect(missingLabel(['ingredients', 'steps'])).toBe('Zutaten und Zubereitung fehlen')
    expect(missingLabel(['steps'])).toBe('Zubereitung fehlt')
    expect(missingLabel([])).toBe('')
  })
})
