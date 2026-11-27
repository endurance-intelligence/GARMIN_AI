/** Secondary build only: scope application-owned browser storage accesses.
 * Never patch the browser's global Storage object or the Supabase SDK.
 * Unsupported access forms are rejected, not silently left unscoped. */
import ts from 'typescript'
const aliases={localStorage:'__garminScopedLocal',sessionStorage:'__garminScopedSession'}
const browserGlobals=new Set(['window','globalThis','self'])
const directNames=new Set(Object.keys(aliases))
const storageMethods=new Set(['getItem','setItem','removeItem','key','clear','length'])
const blocked=new Set(['indexedDB','BroadcastChannel','serviceWorker','caches'])
export function scopeBrowserStorage(source,file,prefix){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true)
 const edits=[],used=new Set()
 const fail=what=>{throw Error('Secondary browser storage review required in '+file+': '+what)}
 const globalObject=n=>ts.isIdentifier(n)&&browserGlobals.has(n.text)
 function use(n,name){
  const parent=n.parent
  if(ts.isPropertyAccessExpression(parent)&&parent.expression===n&&!storageMethods.has(parent.name.text))fail('unsupported Storage member')
  if(ts.isElementAccessExpression(parent)&&parent.expression===n)fail('computed Storage member')
  if(ts.isBinaryExpression(parent)&&parent.left===n&&parent.operatorToken.kind===ts.SyntaxKind.EqualsToken)fail('Storage assignment')
  if(ts.isVariableDeclaration(parent)&&parent.name===n||ts.isParameter(parent)&&parent.name===n||ts.isBindingElement(parent)&&parent.name===n||ts.isImportSpecifier(parent)||ts.isShorthandPropertyAssignment(parent))fail('Storage shadowing')
  used.add(name);edits.push({start:n.getStart(ast),end:n.end,text:aliases[name]})
 }
 function visit(n){
  if(ts.isPropertyAccessExpression(n)&&directNames.has(n.name.text)){
   if(!globalObject(n.expression))fail('unrecognized Storage object')
   use(n,n.name.text);return
  }
  if(ts.isElementAccessExpression(n)&&ts.isStringLiteral(n.argumentExpression)&&directNames.has(n.argumentExpression.text)){
   if(!globalObject(n.expression))fail('unrecognized computed Storage object')
   use(n,n.argumentExpression.text);return
  }
  if(ts.isIdentifier(n)&&directNames.has(n.text)){use(n,n.text);return}
  if(ts.isIdentifier(n)&&blocked.has(n.text))fail('additional browser persistence or cross-tab channel')
  if(ts.isPropertyAccessExpression(n)&&n.name.text==='cookie'&&ts.isIdentifier(n.expression)&&n.expression.text==='document')fail('cookies')
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='addEventListener'&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text==='storage')fail('storage event listener')
  ts.forEachChild(n,visit)
 }
 visit(ast)
 if(!edits.length)return source
 let code=source
 for(const e of edits.sort((a,b)=>b.start-a.start))code=code.slice(0,e.start)+e.text+code.slice(e.end)
 const setup="import {browserInstanceStorage as __garminBrowserInstanceStorage} from '/src/lib/instanceBrowserStorage.mjs'\n"+[...used].map(name=>'const '+aliases[name]+'=__garminBrowserInstanceStorage('+JSON.stringify(name)+','+JSON.stringify(prefix)+')').join('\n')+'\n'
 return setup+code
}
