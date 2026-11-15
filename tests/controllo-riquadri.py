import asyncio, sys
from playwright.async_api import async_playwright
CHECK = """(() => {
  const out = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const e of document.querySelectorAll('main *, .testata *, .nav *, .foglio *')) {
    if (!vis(e)) continue;
    const cs = getComputedStyle(e);
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    if (e.closest('.banda')) continue;               // la banda scorre apposta
    if (e.closest('table')) continue;
    if (e.tagName === 'INPUT' || e.closest('.mini-omino') || e.classList.contains('mini-omino') || e.closest('.arte') || e.classList.contains('arte') || e.closest('svg')) continue;
    // testo che esce dal proprio riquadro
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && cs.display !== 'inline') {
      out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${(e.innerText||'').trim().slice(0,30)}" ${e.scrollWidth}>${e.clientWidth}`);
    }
    // parole spezzate a metà o tagliate: con a capo normale il testo non deve uscire
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      const prima = [e.style.overflowWrap, e.style.wordBreak, e.style.webkitLineClamp, e.style.display];
      e.style.overflowWrap = 'normal'; e.style.wordBreak = 'normal';
      const blocco = cs.display === 'inline' ? e.parentElement : e;
      const sw = blocco.scrollWidth, cw = blocco.clientWidth;
      // testo inline: confronta con il contenitore che lo racchiude
      const rr = e.getBoundingClientRect(), rb = blocco.getBoundingClientRect();
      if ((cw > 0 && sw > cw + 1) || (cs.display === 'inline' && rr.right > rb.right + 1)) out.push(`parola: ${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${(e.innerText||'').trim().slice(0,30)}"`);
      [e.style.overflowWrap, e.style.wordBreak, e.style.webkitLineClamp, e.style.display] = prima;
    }
    // figlio che sporge dal genitore con bordo
    const p = e.parentElement;
    if (p && getComputedStyle(p).borderRightWidth !== '0px' && !['absolute','fixed'].includes(cs.position)) {
      const rp = p.getBoundingClientRect(), re = e.getBoundingClientRect();
      if (re.right > rp.right + 1 && (e.innerText||'').trim()) out.push(`sporge: ${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${(e.innerText||'').trim().slice(0,30)}" in ${p.className}`);
    }
  }
  return [...new Set(out)];
})()"""
NOMI=['Mat','Vlad','Palli','Rambo','Nat','Ponti','Linda','Pippo','Cate','Bruzzi','Titti','Mimmo','Fiffo','Pat','Lucia','Silvia']
async def main():
    tot = 0
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for w in (320, 375, 390, 430):
            pg=await b.new_page(viewport={'width':w,'height':844}, device_scale_factor=2)
            await pg.route('**/firebase-config.js', lambda r: r.fulfill(content_type='application/javascript', body="export const firebaseConfig={apiKey:''};"))
            async def chk(nome):
                nonlocal tot
                await pg.wait_for_timeout(250)
                r = await pg.evaluate(CHECK)
                if r: tot += len(r); print(f'[{w}] {nome}:'); [print('   ', x) for x in r]
            await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(400); await chk('accesso')
            await pg.fill('#prova-nome','Mattia Matteucci'); await pg.click('[data-azione=entra-prova]'); await pg.wait_for_timeout(300); await chk('home vuota')
            await pg.click('[data-azione=apri-crea]'); await chk('foglio crea')
            await pg.fill('#crea-nome','Burraco del sabato sera tra amiche'); await pg.click('[data-azione=crea]'); await pg.wait_for_timeout(300); await chk('setup torneo punti')
            await pg.click('[data-azione=cfg][data-k=formato][data-v=eliminazione]'); await chk('setup eliminazione')
            await pg.click('[data-azione=salva-config]'); await pg.wait_for_timeout(200)
            for n in NOMI: await pg.fill('#nuovo-giocatore', n); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(20)
            await chk('setup giocatori')
            await pg.click('[data-azione=setup-tab][data-tab=coppie]'); await pg.click('[data-azione=estrai]'); await pg.wait_for_timeout(150); await chk('setup coppie')
            await pg.click('[data-azione=conferma-coppie]'); await pg.wait_for_timeout(200); await chk('riepilogo avvio')
            await pg.click('[data-azione=avvia]'); await pg.wait_for_timeout(300); await chk('turno 1')
            await pg.click('[data-azione=apri-risultato] >> nth=0'); await chk('foglio risultato')
            await pg.locator('.mano[data-lato=a][data-i="0"]').fill('-1250'); await pg.locator('.mano[data-lato=b][data-i="0"]').fill('12345'); await chk('foglio risultato con numeri lunghi')
            await pg.click('[data-azione=salva-risultato]'); await pg.wait_for_timeout(150)
            for i in range(1,4):
                await pg.click(f'[data-azione=apri-risultato] >> nth={i}'); await pg.locator('.mano[data-lato=a][data-i="0"]').fill('1500'); await pg.locator('.mano[data-lato=b][data-i="0"]').fill('900'); await pg.click('[data-azione=salva-risultato]'); await pg.wait_for_timeout(120)
            await pg.click('[data-azione=apri-chiudi-turno]'); await pg.click('[data-azione=conferma-ok]'); await pg.wait_for_timeout(400); await chk('turno 2')
            for t in ['classifica','storico','gruppo','inviti']:
                await pg.click(f'[data-azione=tab][data-tab={t}]'); await chk(t)
            await pg.click('[data-azione=tab][data-tab=classifica]'); await pg.click('[data-azione=class-tab][data-v=elenco]'); await chk('classifica elenco')
            await pg.click('[data-azione=home]'); await pg.wait_for_timeout(300); await chk('home con torneo in corso')
            await pg.goto('http://localhost:8765/index.html#/profilo'); await chk('profilo')
            # torneo a punti vittoria
            await pg.goto('http://localhost:8765/index.html#/'); await pg.wait_for_timeout(300)
            await pg.click('[data-azione=apri-crea]'); await pg.fill('#crea-nome','Coppa FIBur'); await pg.click('[data-azione=crea]'); await pg.wait_for_timeout(300)
            await pg.click('[data-azione=salva-config]'); await pg.wait_for_timeout(200)
            for n in NOMI: await pg.fill('#nuovo-giocatore', n); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(20)
            await pg.click('[data-azione=setup-tab][data-tab=coppie]'); await pg.click('[data-azione=estrai]'); await pg.wait_for_timeout(150)
            await pg.click('[data-azione=conferma-coppie]'); await pg.wait_for_timeout(200); await pg.click('[data-azione=avvia]'); await pg.wait_for_timeout(300); await chk('punti turno 1')
            for i in range(4):
                await pg.click(f'[data-azione=apri-risultato] >> nth={i}')
                if i == 0: await chk('punti foglio risultato')
                await pg.fill('#ris-a','1500'); await pg.fill('#ris-b','-250'); await pg.click('[data-azione=salva-risultato]'); await pg.wait_for_timeout(120)
            await chk('punti turno con risultati')
            await pg.click('[data-azione=apri-chiudi-turno]'); await pg.click('[data-azione=conferma-ok]'); await pg.wait_for_timeout(400)
            for t in ['turno','classifica','storico']:
                await pg.click(f'[data-azione=tab][data-tab={t}]'); await chk('punti ' + t)
            await pg.click('[data-azione=home]'); await pg.wait_for_timeout(300); await chk('home con due tornei')
            await pg.close()
        await b.close()
    print('PROBLEMI TOTALI:', tot)
asyncio.run(main())
