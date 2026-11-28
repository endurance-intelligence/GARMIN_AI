// Per-invocation lazy access, no secrets in the browser or logs.
// Rejection is memoized too: never retry the token endpoint in the same invocation.
export function lazyGarminToken(fetchToken){
 let promise
 return ()=>promise??=Promise.resolve().then(fetchToken)
}
export function garminRateLimited(error){
 return error?.status===429||/\bHTTP 429\b/.test(String(error?.message||''))
}
