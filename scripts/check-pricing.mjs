import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { parseKoleniHtmlPricing } from '../src/lib/pricingHtmlImport.js';

const html=readFileSync(new URL('../public/simulador-orcamento.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.ok(scripts.length>0,'O HTML do simulador deve ter script');
scripts.forEach(([_,code],i)=>new Script(code,{filename:'simulador-embutido-'+i+'.js'}));
assert.match(html,/function reprice\(\)/,'O rateio de arte deve estar implementado');
assert.match(html,/shared-setup-v3/,'O simulador precisa reconhecer a nova tabela');
assert.match(html,/id="arte"/,'A opção de arte compartilhada deve existir');
assert.match(html,/id="band"/,'A opção de bandeira deve existir');

const fixture = 'var D={qs:[10,20],avista:500/1e4,t3:1000/1e4,parc:3,gerado:"teste",band:{lim:40,a:500/100,b:300/100},tc:{"S1P101":2000/100},produtos:[],p:[],r:[],dv:[]};\n'
  + 'D.produtos.push("CAMISETA");D.p.push({"N":[10000,9000]});D.r.push(15263/1e4);D.dv.push([5800/1e4,6800/1e4]);';
const table = parseKoleniHtmlPricing(fixture,'SIMULADOR_TESTE.html');
assert.deepEqual(table.produtos,['CAMISETA']);
assert.deepEqual(table.p[0].N,[10000,9000]);
assert.equal(table.r[0],1.5263);
assert.deepEqual(table.dv[0],[0.58,0.68]);
assert.equal(table.band.a,5);
assert.equal(table.tc.S1P101,20);
assert.equal(table.pricingEngine,'shared-setup-v3');
assert.throws(()=>parseKoleniHtmlPricing('<html><script>alert(1)</script></html>'),/Não encontrei/);
console.log('OK: script HTML válido, estrutura V3 presente, parser HTML seguro e dados convertidos corretamente.');
