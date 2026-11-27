  <form className="ask-form" onSubmit={e=>{e.preventDefault();void send(query)}}>
   <label htmlFor="ask-coach-query">Deine Frage</label>
   <div><input id="ask-coach-query" value={query} maxLength={800} onChange={e=>setQuery(e.target.value)} placeholder="Wie schnell war mein letzter Lauf?"/><button type="submit" disabled={!query.trim()}>Senden <Icon name="arrow-up-right"/></button></div>
  </form>
