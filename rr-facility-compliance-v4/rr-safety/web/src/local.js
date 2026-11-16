// Demo mode: same rules as the .NET API, kept in this browser when the server is not reachable.
import seed from './seed.json';
const LS = k => JSON.parse(localStorage.getItem(k) || 'null'), SV = (k, v) => localStorage.setItem(k, JSON.stringify(v));
export const PS = (h, t) => { const d = new Date(t); if (h <= 2) { d.setMinutes(0, 0, 0); d.setHours(d.getHours() % 2 ? d.getHours() : d.getHours() - 1); return d; }
  d.setHours(0, 0, 0, 0); if (h <= 24) return d; if (h <= 168) { d.setDate(d.getDate() >= 21 ? 21 : d.getDate() >= 14 ? 14 : d.getDate() >= 7 ? 7 : 1); return d; } d.setDate(1); return d; };
export const PE = (h, s) => { const d = new Date(s); if (h <= 2) d.setHours(d.getHours() + 2); else if (h <= 24) d.setDate(d.getDate() + 1);
  else if (h <= 168) { if (s.getDate() === 21) { d.setDate(1); d.setMonth(d.getMonth() + 1); } else d.setDate(d.getDate() + (s.getDate() === 1 ? 6 : 7)); } else d.setMonth(d.getMonth() + 1); return d; };
const tpl = k => seed.templates.find(t => t.key === k);
const DB = () => { let d = LS('rr_local'); if (d) return d; const now = Date.now(); d = { created: now, insp: [] };
  seed.assets.forEach((a, ix) => { if (ix % 4 === 3) return; const t = tpl(a.template);   // sample history so the demo is not empty
    for (let k = 2; k >= 1; k--) { const bad = ix === 5 && k === 1;
      d.insp.push({ id: d.insp.length + 1, assetId: ix + 1, inspector: 'sample.data@check.com', method: 'QR', status: bad ? 'Fail' : 'Pass', remarks: '', photosJson: '[]',
        at: new Date(now - t.frequencyHours * 36e5 * (k - 0.5 + (ix % 4 === 1 ? 1.5 : 0))).toISOString(),
        responsesJson: JSON.stringify(Object.fromEntries(t.items.map((_, i) => [i, bad && i === 0 ? 'Fail' : 'Pass']))) }); } });
  SV('rr_local', d); return d; };
const byNew = (x, y) => y.at.localeCompare(x.at);
export const local = async (p, o = {}) => {
  const d = DB(), m = o.method || 'GET', me = localStorage.getItem('email') || '';
  const asset = (a, ix) => { const t = tpl(a.template), h = t.frequencyHours, s = PS(h, new Date());
    const l = d.insp.filter(i => i.assetId === ix + 1).sort(byNew)[0], la = l && new Date(l.at);
    const state = !l ? (new Date(d.created) < s ? 'overdue' : 'notyet') : l.status === 'Fail' ? 'failed' : la >= s ? 'ok' : la >= PS(h, new Date(s - 1000)) ? 'due' : 'overdue';
    return { id: ix + 1, code: a.code, name: a.name, location: a.location, templateKey: a.template, template: t.name, frequencyHours: h, lastAt: l && l.at, lastBy: l && l.inspector, state,
      due: (state === 'ok' ? PE(h, PE(h, s)) : PE(h, s)).toISOString() }; };
  if (p === '/assets') return seed.assets.map(asset);
  if (p.startsWith('/templates/')) { const t = tpl(p.slice(11)); return { name: t.name, items: t.items }; }
  if (p === '/inspections/recent') return d.insp.slice().sort(byNew).slice(0, 8).map(i => ({ name: seed.assets[i.assetId - 1].name, inspector: i.inspector, status: i.status, at: i.at }));
  if (p.endsWith('/inspections') && m === 'GET') return d.insp.filter(i => i.assetId === +p.split('/')[2]).sort(byNew);
  if (p === '/photos') return new Promise(r => { const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 640 / im.width), c = document.createElement('canvas');
    c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); r({ name: c.toDataURL('image/jpeg', .7) }); }; im.src = fr.result; }; fr.readAsDataURL(o.body.get('file')); });
  if (p === '/inspections' && m === 'POST') { if (!/@check\.com$/i.test(me)) return { error: 'You do not have access to submit inspections.' };
    const b = JSON.parse(o.body); d.insp.push({ id: d.insp.length + 1, assetId: b.assetId, inspector: me.toLowerCase(), method: b.method === 'Manual' ? 'Manual' : 'QR', at: new Date().toISOString(),
      status: Object.values(b.responses).includes('Fail') ? 'Fail' : 'Pass', remarks: b.remarks || '', responsesJson: JSON.stringify(b.responses), photosJson: JSON.stringify(b.photos) });
    SV('rr_local', d); return { id: d.insp.length }; }
  return {};
};
