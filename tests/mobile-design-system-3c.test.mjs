import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const css=read('src/styles/design-system.css')
const app=read('src/App.tsx')
const token=name=>css.match(new RegExp('--ds-'+name+':(#[0-9a-f]{6})'))?.[1]
const luminance=hex=>{const [r,g,b]=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b}
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('shared tokens are loaded after feature CSS and used across core screens',()=>{
 assert.ok(app.indexOf("import './styles/navigation-goals.css'")<app.indexOf("import './styles/design-system.css'"))
 for(const s of ['.co-home .co-recovery-glance','.hc-weekpanel','.lsa-wrap','.th-history','.wti-card','.gpg-root','.cpp-root','.rfc-root','.goals-page .rgp-root'])assert.ok(css.includes(s),s)
 assert.match(css,/font-variant-numeric:tabular-nums/)
 assert.match(css,/--ds-touch:44px/)
 assert.match(css,/prefers-reduced-motion:reduce/)
})
test('foreground, semantic tones and primary action meet WCAG AA text contrast on defined surfaces',()=>{
 for(const tone of ['ink','muted','actual','plan','draft','suggestion','option','warning','error']){
  for(const surface of ['panel','inset'])assert.ok(contrast(token(tone),token(surface))>=4.5,tone+' on '+surface)
 }
 assert.ok(contrast(token('on-accent'),token('accent'))>=4.5)
 assert.equal(new Set(['actual','plan','draft','suggestion','option','warning','error'].map(token)).size,7)
})
test('calendar legend and measured versus planned bars share semantic tokens without overriding safety states',()=>{
 assert.match(css,/\.hc-key-actual,\.wti-fill.actual[^{}]*\{background:var\(--ds-actual\)\}/)
 assert.match(css,/\.hc-key-plan,\.wti-fill.approved[^{}]*\{background:var\(--ds-plan\)\}/)
 assert.match(css,/\.hc-key-coach\{background:var\(--ds-suggestion\);border:1px dashed/)
 assert.match(css,/\.hwb-card.is-coach:not\(.is-coach-info\):not\(.is-race\):not\(.is-rejected\)/)
 assert.match(css,/\.cdl-primary:not\(.cdl-nonwrite\)/)
 assert.doesNotMatch(css,/\.tq-blocked\{|\.hwb-quick-declined\{|\.hc-delete-confirm\{/)
 const calendar=read('src/pages/CalendarPage.tsx')
 for(const label of ['Garmin · gemacht','GARMIN_AI · gespeichert','Coach · Vorschlag','ORC · optional','Training freigeben','An Intervals.icu senden'])assert.ok(calendar.includes(label))
})
