const fs = require('fs'), assert = require('assert'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, process.env.SHRANCK_HTML || 'index.html'), 'utf8');
const m = html.match(/\/\/ <core>([\s\S]*?)\/\/ <\/core>/);
assert(m, 'core block missing');
const C = new Function(m[1] + '; return {num,personCost,itemTotals,normalize,seedState,findPersonByName,mergePeople,deletePerson,setQty,uid,validId,snapQty,setPath,compactPaths}')();
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const near = (a, b) => assert(Math.abs(a - b) < 1e-6, a + ' != ' + b);

const S = C.seedState();
const R = S.rounds[S.currentRoundId];
const item = nm => { for (const b of R.blocks) for (const i of b.items) if (i.name.toLowerCase().includes(nm)) return i; throw new Error('no item ' + nm); };

t('seed has no people and no orders', () => { assert.deepStrictEqual(Object.keys(S.people), []); assert.deepStrictEqual(Object.keys(R.orders), []); });
t('seed seafood delivery date', () => assert(/Nov 19/i.test(R.blocks[1].delivery)));
t('num sanitizes', () => { assert.strictEqual(C.num('abc'), 0); assert.strictEqual(C.num(-3), 0); assert.strictEqual(C.num(NaN), 0); assert.strictEqual(C.num('2.5'), 2.5); assert.strictEqual(C.num(null), 0); });
t('personCost striploin 1 + shortrib 1 = 317.98', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId];
  s.people.p1 = { id: 'p1', name: 'Eric C' };
  C.setQty(s, r.id, 'p1', r.blocks[0].items[0].id, 1); C.setQty(s, r.id, 'p1', r.blocks[0].items[1].id, 1);
  near(C.personCost(r, 'p1').total, 317.98);
});
t('personCost BT 8/12 2 bags = 57.00', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; s.people.p1 = { id: 'p1', name: 'A' };
  const bt = r.blocks[1].items.find(i => /8\/12/.test(i.name));
  C.setQty(s, r.id, 'p1', bt.id, 2); near(C.personCost(r, 'p1').total, 57);
});
t('pickerel blank price => priceTbd, cost 0', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; s.people.p1 = { id: 'p1', name: 'A' };
  const pk = r.blocks[1].items.find(i => /pickerel/i.test(i.name));
  C.setQty(s, r.id, 'p1', pk.id, 1);
  const c = C.personCost(r, 'p1'); assert.strictEqual(c.total, 0); assert.strictEqual(c.lines[0].priceTbd, true);
});
t('itemTotals striploin 12 of inc 5', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; s.people.p1 = { id: 'p1', name: 'A' };
  const st = r.blocks[0].items[0]; C.setQty(s, r.id, 'p1', st.id, 12);
  const x = C.itemTotals(r, st.id);
  assert.strictEqual(x.total, 12); assert.strictEqual(x.fullCases, 2); assert.strictEqual(x.short, 3); assert.strictEqual(x.over, 2); assert.strictEqual(x.aligned, false); near(x.cases, 2.4);
  C.setQty(s, r.id, 'p1', st.id, 15); assert.strictEqual(C.itemTotals(r, st.id).aligned, true);
});
t('half units: shortrib 0.5+0.5 aligned', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId];
  s.people.a = { id: 'a', name: 'A' }; s.people.b = { id: 'b', name: 'B' };
  const sr = r.blocks[0].items[1]; C.setQty(s, r.id, 'a', sr.id, 0.5);
  assert.strictEqual(C.itemTotals(r, sr.id).aligned, false);
  C.setQty(s, r.id, 'b', sr.id, 0.5); assert.strictEqual(C.itemTotals(r, sr.id).aligned, true);
  const x = C.itemTotals(r, sr.id); assert.strictEqual(x.short, 0);
});
t('float sums 0.1 x10 aligned for inc 1', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; const sr = r.blocks[0].items[1];
  for (let i = 0; i < 10; i++) { s.people['p' + i] = { id: 'p' + i, name: 'P' + i }; C.setQty(s, r.id, 'p' + i, sr.id, 0.1); }
  assert.strictEqual(C.itemTotals(r, sr.id).aligned, true);
});
t('normalize({}) and sparse blocks do not throw', () => {
  const a = C.normalize({}); assert(a.rounds && a.people && a.currentRoundId);
  const b = C.normalize({ rounds: { r1: { blocks: { 0: {} } } } }); assert(Object.keys(b.rounds).length >= 1);
  C.normalize(null); C.normalize(undefined);
});
t('normalize drops orders for unknown people/items, accepts object-style arrays', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; s.people.p1 = { id: 'p1', name: 'A' };
  r.orders.p1 = { [r.blocks[0].items[0].id]: 2, nope: 5 }; r.orders.ghost = { x: 1 };
  const raw = JSON.parse(JSON.stringify(s)); raw.rounds[r.id].blocks = Object.assign({}, raw.rounds[r.id].blocks);
  const n2 = C.normalize(raw); const o = n2.rounds[r.id].orders;
  assert(!o.ghost); assert(!('nope' in o.p1)); assert(Array.isArray(n2.rounds[r.id].blocks));
});
t('findPersonByName trim + case-insensitive', () => {
  const s = C.seedState(); s.people.p1 = { id: 'p1', name: 'Eric C' };
  assert.strictEqual(C.findPersonByName(s, '  eric c '), 'p1'); assert.strictEqual(C.findPersonByName(s, 'zed'), null);
});
t('deletePerson removes orders', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; s.people.p1 = { id: 'p1', name: 'A' };
  C.setQty(s, r.id, 'p1', r.blocks[0].items[0].id, 3); C.deletePerson(s, 'p1');
  assert(!s.people.p1); assert(!r.orders.p1);
});
t('mergePeople sums into target', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; const it = r.blocks[0].items[0].id;
  s.people.a = { id: 'a', name: 'A' }; s.people.b = { id: 'b', name: 'B' };
  C.setQty(s, r.id, 'a', it, 2); C.setQty(s, r.id, 'b', it, 3); C.mergePeople(s, 'a', 'b');
  assert(!s.people.a); assert.strictEqual(r.orders.b[it], 5); assert(!r.orders.a);
});
t('setQty 0/blank removes key', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; const it = r.blocks[0].items[0].id; s.people.a = { id: 'a', name: 'A' };
  C.setQty(s, r.id, 'a', it, 2); C.setQty(s, r.id, 'a', it, ''); assert(!(r.orders.a && it in r.orders.a));
});
t('normalize drops unsafe ids (people, rounds, blocks, items, orders)', () => {
  const bad = 'x" onmouseover="alert(1)';
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; const it = r.blocks[0].items[0].id;
  s.people.ok = { id: 'ok', name: 'OK' }; s.people[bad] = { id: bad, name: 'Evil' };
  r.orders.ok = { [it]: 1 }; r.orders[bad] = { [it]: 2 };
  r.blocks[0].items.push({ id: bad, name: 'evil item' }); r.blocks.push({ id: bad, title: 'evil block', items: [] });
  s.rounds[bad] = { id: bad, title: 'evil', blocks: [] }; s.rounds.r2 = { id: bad, title: 'mismatched', blocks: [] };
  const n2 = C.normalize(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(Object.keys(n2.people), ['ok']);
  assert(!n2.rounds[bad]); assert.strictEqual(n2.rounds.r2.id, 'r2');
  const R2 = n2.rounds[r.id];
  assert(!R2.blocks.some(b => b.id === bad)); assert(!R2.blocks[0].items.some(i => i.id === bad));
  assert.deepStrictEqual(Object.keys(R2.orders), ['ok']);
  assert(C.validId('p_ab-12')); assert(!C.validId('a b')); assert(!C.validId('x'.repeat(65))); assert(!C.validId(''));
});
t('normalize copes with leaf-deleted empty order parents', () => {
  const s = C.seedState(); const r = s.rounds[s.currentRoundId]; s.people.p1 = { id: 'p1', name: 'A' };
  const raw = JSON.parse(JSON.stringify(s)); delete raw.rounds[r.id].orders; raw.rounds[r.id].orders = { p1: null };
  const n2 = C.normalize(raw); assert.deepStrictEqual(n2.rounds[r.id].orders, {});
});
t('snapQty rounds to step, min 0', () => {
  assert.strictEqual(C.snapQty('1.3', 1), 1); assert.strictEqual(C.snapQty('1.6', 1), 2);
  assert.strictEqual(C.snapQty('0.7', 0.5), 0.5); assert.strictEqual(C.snapQty('0.2', 0.5), 0);
  assert.strictEqual(C.snapQty(-3, 1), 0); assert.strictEqual(C.snapQty('abc', 1), 0); assert.strictEqual(C.snapQty('2.75', 0.5), 3);
});
t('setPath creates parents and deletes leaves', () => {
  const o = {}; C.setPath(o, 'rounds/r/orders/p/i', 2); assert.strictEqual(o.rounds.r.orders.p.i, 2);
  C.setPath(o, 'rounds/r/orders/p/j', 3); C.setPath(o, 'rounds/r/orders/p/i', null);
  assert.deepStrictEqual(o.rounds.r.orders.p, { j: 3 });
});
t('compactPaths dedupes and drops descendants of included paths', () => {
  assert.deepStrictEqual(C.compactPaths(['a/b', 'a/b/c', 'a/bc', 'a/b', 'people/x']).sort(), ['a/b', 'a/bc', 'people/x']);
});
console.log(n + ' tests passed');
