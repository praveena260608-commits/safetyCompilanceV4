import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';
import { local } from './local';

let LOCAL = false;   // true = server unreachable, so the app runs in demo mode (data kept in this browser)
const api = (p, o = {}) => LOCAL ? local(p, o) : fetch('/api' + p, { ...o, headers: { ...o.headers, 'X-User': localStorage.getItem('email') || '' } })
  .then(async r => { const j = await r.json().catch(() => null); if (j === null) throw 0; return j; }).catch(() => { LOCAL = true; return local(p, o); });
const nm = e => (e || '').split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const roleOf = e => (/@check\.com$/i.test(e) ? 'inspector' : /@rolls-royce\.com$/i.test(e) ? 'viewer' : null);
const PREFIX = 'SITESAFETY::';
const freq = h => (h <= 2 ? 'Every 2 hours' : h <= 24 ? 'Daily' : h <= 168 ? 'Weekly' : 'Monthly');
const ORDER = ['Every 2 hours', 'Daily', 'Weekly', 'Monthly'];
const LABEL = { ok: 'Compliant', due: 'Due', overdue: 'Overdue', failed: 'Failed', notyet: 'Not yet inspected' };
const sc = s => (s === 'ok' ? 'ok' : s === 'due' ? 'warn' : s === 'notyet' ? 'mute' : 'bad');
const fmt = d => (d ? new Date(/Z$/.test(d) ? d : d + 'Z').toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never');
const ICON = { scan: 'M4 8V5a1 1 0 0 1 1-1h3M4 16v3a1 1 0 0 0 1 1h3M20 8V5a1 1 0 0 0-1-1h-3M20 16v3a1 1 0 0 1-1 1h-3M4 12h16',
  equipment: 'M3 4h18v16H3zM3 9h18M8 4v16', qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM15 15h2v2h-2zM19 19h2v2h-2z', analytics: 'M4 20V10M12 20V4M20 20v-7' };
const TABS = [['scan', 'Scan'], ['equipment', 'Equipment'], ['qr', 'QR Codes'], ['analytics', 'Analytics']];
const Ic = ({ k, c }) => <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={ICON[k]} /></svg>;
const QR = ({ text, size }) => { const q = qrcode(0, 'M'); q.addData(text); q.make();
  return <div className="qrs" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 6, margin: 8, scalable: true }) }} />; };
const Head = ({ eyebrow, title, sub, children }) => <div className="section-head"><div><div className="section-eyebrow">{eyebrow}</div><div className="section-title">{title}</div>{sub && <div className="section-sub">{sub}</div>}</div>{children}</div>;

export default function App() {
  const [email, setEmail] = useState(localStorage.getItem('email') || ''), [assets, setAssets] = useState([]), [tab, setTab] = useState('scan');
  const [offline, setOffline] = useState(false), [job, setJob] = useState(null), [view, setView] = useState(null), [toast, setToast] = useState('');
  const role = roleOf(email), load = () => api('/assets').then(x => { setAssets(Array.isArray(x) ? x : []); setOffline(LOCAL); });
  useEffect(() => { if (role) { load(); setTab(role === 'inspector' ? 'scan' : 'equipment'); } }, [email]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3800); return () => clearTimeout(t); } }, [toast]);
  if (!role) return <Login onIn={e => { localStorage.setItem('email', e); setEmail(e); }} />;
  const tabs = TABS.filter(([k]) => role === 'inspector' || k === 'equipment' || k === 'analytics');
  return (<>
    <div className="app-header"><div className="brand-left"><div className="brand-eyebrow">Facilities &amp; Safety</div><div className="brand-title">Facility Compliance</div></div>
      <div className="brand-right" style={{ gap: 14 }}><div style={{ textAlign: 'right', fontSize: 12 }}><b style={{ fontWeight: 500 }}>{nm(email)}</b><br /><span style={{ color: 'var(--ink-faint)' }}>{role === 'inspector' ? 'Inspector' : 'Employee'}</span></div>
        <button className="btn btn-ghost btn-sm" onClick={() => { localStorage.removeItem('email'); setEmail(''); }}>Sign out</button><img src="/logo.png" alt="Rolls-Royce" /></div></div>
    <div className="app-nav">{tabs.map(([k, l]) => <button key={k} className={'nav-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}><Ic k={k} />{l}</button>)}</div>
    {offline && <div className="fallback-note" style={{ margin: '14px 5vw 0' }}>Server not connected — running in demo mode. Data is saved in this browser only.</div>}
    {tab === 'scan' && <Scan assets={assets} open={(id, m) => setJob({ id, m })} />}
    {tab === 'equipment' && <Equipment assets={assets} open={setView} />}
    {tab === 'qr' && <QRPage assets={assets} />}
    {tab === 'analytics' && <Analytics assets={assets} />}
    <div className="bottom-nav">{tabs.map(([k, l]) => <button key={k} className={'bnav-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}><Ic k={k} c="bnav-ic" />{l}</button>)}</div>
    {job && <Inspect a={assets.find(x => x.id === job.id)} method={job.m} email={email} close={ok => { setJob(null); if (ok) { load(); setToast('Inspection recorded · checked by ' + nm(email) + ' · ' + fmt(new Date().toISOString())); } }} />}
    {view && <History a={assets.find(x => x.id === view)} close={() => setView(null)} inspect={role === 'inspector' ? () => { setJob({ id: view, m: 'Manual' }); setView(null); } : null} />}
    {toast && <div className="toast show">{toast}</div>}
  </>);
}

function Login({ onIn }) {
  const [v, setV] = useState(''), [err, setErr] = useState('');
  return (<div className="view active" style={{ maxWidth: 460, paddingTop: 90 }}><img src="/logo.png" style={{ height: 56, marginBottom: 28 }} alt="Rolls-Royce" />
    <Head eyebrow="Facilities &amp; Safety" title="Facility Compliance" sub="Sign in with your work email." />
    <input type="text" value={v} placeholder="name@rolls-royce.com" onChange={e => setV(e.target.value)} />
    <button className="btn btn-dark" style={{ marginTop: 14 }} onClick={() => roleOf(v.trim()) ? onIn(v.trim().toLowerCase()) : setErr('This email does not have access.')}>Continue</button>
    {err && <div className="fallback-note" style={{ marginTop: 14 }}>{err}</div>}<div className="section-sub">Prototype sign-in. Production will use company single sign-on.</div></div>);
}

function Scan({ assets, open }) {
  const v = useRef(), stream = useRef(), raf = useRef(), file = useRef();
  const [on, setOn] = useState(false), [err, setErr] = useState(''), [msg, setMsg] = useState('');
  const stop = () => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setOn(false); };
  useEffect(() => stop, []);
  const hit = data => { const a = assets.find(x => data === PREFIX + x.code); if (a) { stop(); open(a.id, 'QR'); return true; } return false; };
  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      v.current.srcObject = stream.current; await v.current.play(); setOn(true); setErr('');
      const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
      const tick = () => { if (!stream.current) return; const e = v.current;
        if (e.videoWidth) { c.width = e.videoWidth; c.height = e.videoHeight; x.drawImage(e, 0, 0); const d = x.getImageData(0, 0, c.width, c.height); const r = jsQR(d.data, d.width, d.height); if (r && hit(r.data)) return; }
        raf.current = requestAnimationFrame(tick); };
      tick();
    } catch { setErr('Camera access isn’t available here — use “Scan from photo” or tap an item below.'); }
  };
  const fromPhoto = f => { if (!f) return; const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height); const r = jsQR(d.data, d.width, d.height);
    if (!(r && hit(r.data))) setMsg('No matching QR found in that photo.'); }; img.src = URL.createObjectURL(f); };
  return (<div className="view active">
    <Head eyebrow="Step 1" title="Scan equipment QR code" sub="Point the camera at the QR tag on the equipment. Its checklist opens automatically." />
    <div className="scan-card"><div className="scan-viewport">
      {!on && <div className="scan-idle"><div className="t">Camera is off</div><p>Tap “Open Camera” to scan.</p></div>}
      <video ref={v} playsInline muted style={{ display: on ? 'block' : 'none' }} />{on && <div className="scan-frame"><div className="box" /></div>}</div>
      <div className="scan-status-bar"><div className="scan-status-text">{on ? <><span className="dot-pulse" /> Scanning…</> : 'Ready to scan'}</div>
        <div className="scan-actions"><button className="btn btn-outline-light btn-sm" onClick={() => file.current.click()}>Scan from photo</button>
          <button className="btn btn-light btn-sm" onClick={on ? stop : start}>{on ? 'Close' : 'Open Camera'}</button>
          <input ref={file} type="file" accept="image/*" hidden onChange={e => fromPhoto(e.target.files[0])} /></div></div></div>
    {(err || msg) && <div className="fallback-note">{err || msg}</div>}
    <div className="panel" style={{ marginTop: 26 }}><div className="panel-title">Select equipment</div><div className="section-sub" style={{ marginTop: -8, marginBottom: 14 }}>Choose the equipment to inspect. Records made without a QR scan are marked “Manual”.</div>
    <div className="sim-grid">{assets.map(a => <button key={a.id} className="sim-tile" onClick={() => open(a.id, 'Manual')}><span className={'status-chip ' + sc(a.state)}>{LABEL[a.state]}</span>
      <span className="tile-id">{a.code}</span><span className="tile-name">{a.name}</span></button>)}</div></div></div>);
}

function Equipment({ assets, open }) {
  const n = s => assets.filter(a => sc(a.state) === s).length, pct = assets.length ? Math.round(100 * n('ok') / assets.length) : 0;
  return (<div className="view active"><Head eyebrow="Registry" title="Equipment" sub="Tap any item to see its full inspection history." />
    <div className="stats-strip"><div className="stat-box ok"><div className="n">{pct}%</div><div className="l">Compliance</div></div><div className="stat-box bad"><div className="n">{n('bad')}</div><div className="l">Overdue / failed</div></div>
      <div className="stat-box warn"><div className="n">{n('warn')}</div><div className="l">Due soon</div></div><div className="stat-box"><div className="n">{assets.length}</div><div className="l">Total equipment</div></div></div>
    <div className="equip-grid">{assets.map(a => <div key={a.id} className={'equip-card ' + sc(a.state)} onClick={() => open(a.id)}>
      <div className="equip-top"><div><div className="equip-name">{a.name}</div><div className="equip-meta">{a.code} · {freq(a.frequencyHours)}</div><div className="equip-loc">{a.location}</div></div>
        <span className={'status-chip ' + sc(a.state)}>{LABEL[a.state]}</span></div>
      <div className="equip-due">{a.lastAt ? <>Last checked <b>{fmt(a.lastAt)}</b> by <b>{nm(a.lastBy)}</b></> : <b>Not yet inspected</b>} · Due by <b>{fmt(a.due)}</b></div>
      <div className="equip-foot"><span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>View history</span><span className="chevron">›</span></div></div>)}</div></div>);
}

function QRPage({ assets }) {
  return (<div className="view active" id="view-qr"><Head eyebrow="Physical Tags" title="Printable QR codes" sub="Print and attach each code to its equipment. Scanning opens the correct checklist.">
    <button className="btn btn-dark print-hide" onClick={() => window.print()}>Print all codes</button></Head>
    <div className="qr-print-grid">{assets.map(a => <div className="qr-print-card" key={a.id}><div className="qr-box"><QR text={PREFIX + a.code} size={130} /></div>
      <div><div className="qname">{a.name}</div><div className="qid">{a.code}</div></div></div>)}</div></div>);
}

function Analytics({ assets }) {
  const [recent, setRecent] = useState([]); useEffect(() => { api('/inspections/recent').then(setRecent); }, []);
  const n = s => assets.filter(a => sc(a.state) === s).length, tot = assets.length || 1, health = Math.round((n('ok') + n('warn') * 0.5) / tot * 100);
  const r = 62, c = 2 * Math.PI * r, col = health >= 80 ? 'var(--ok)' : health >= 50 ? 'var(--warn)' : 'var(--bad)';
  return (<div className="view active"><Head eyebrow="Overview" title="Safety health analytics" sub="Live compliance across all registered equipment." />
    <div className="analytics-grid"><div className="panel"><div className="panel-title">Overall health score</div><div className="health-ring-wrap"><svg width="152" height="152" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r={r} fill="none" stroke="#EEEEEA" strokeWidth="12" /><circle cx="75" cy="75" r={r} fill="none" stroke={col} strokeWidth="12" strokeDasharray={c} strokeDashoffset={c - health / 100 * c} strokeLinecap="round" transform="rotate(-90 75 75)" />
      <text x="75" y="80" textAnchor="middle" fontFamily="Fraunces,serif" fontWeight="600" fontSize="31" fill="var(--ink)">{health}%</text></svg></div></div>
      <div className="panel"><div className="panel-title">Status distribution</div><div className="dist-row">{[['ok', 'var(--ok)'], ['warn', 'var(--warn)'], ['bad', 'var(--bad)'], ['mute', 'var(--silver)']].map(([k, co]) => n(k) > 0 && <div key={k} className="dist-seg" style={{ flex: n(k), background: co }}>{n(k)}</div>)}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Compliant · Due · Overdue/failed · Not yet inspected</div></div></div>
    <div className="panel"><div className="panel-title">Compliance by schedule</div>{ORDER.map(f => { const l = assets.filter(a => freq(a.frequencyHours) === f); if (!l.length) return null; const p = Math.round(100 * l.filter(a => a.state === 'ok').length / l.length);
      return <div className="type-row" key={f}><div className="type-label">{f}</div><div className="type-bar-track"><div className="type-bar-fill" style={{ width: p + '%', background: p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--bad)' }} /></div><div className="type-pct">{p}%</div></div>; })}</div>
    <div className="panel"><div className="panel-title">Recent activity</div>{recent.map((e, i) => <div className="timeline-item" key={i}><div className={'tl-dot ' + (e.status === 'Fail' ? 'bad' : 'ok')} />
      <div><div className="tl-text"><b>{e.name}</b> {e.status === 'Fail' ? 'failed' : 'passed'} — {nm(e.inspector)}</div><div className="tl-time">{fmt(e.at)}</div></div></div>)}</div></div>);
}

function Inspect({ a, method, email, close }) {
  const [t, setT] = useState(null), [res, setRes] = useState({}), [rem, setRem] = useState(''), [files, setFiles] = useState([]), [busy, setBusy] = useState(false);
  useEffect(() => { api('/templates/' + a.templateKey).then(setT); }, [a.id]);
  const submit = async () => {
    if (t.items.some((_, i) => !res[i])) return alert('Mark every item Pass or Fail.');
    setBusy(true); const photos = [];
    for (const f of files) { const fd = new FormData(); fd.append('file', f); const r = await api('/photos', { method: 'POST', body: fd }); if (r.error) { setBusy(false); return alert(r.error); } photos.push(r.name); }
    const r = await api('/inspections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: a.id, remarks: rem, responses: res, photos, method }) });
    if (r.error) { setBusy(false); return alert(r.error); } close(true);
  };
  return (<div className="overlay active" onClick={e => e.target === e.currentTarget && close(false)}><div className="sheet">
    <div className="sheet-head"><div><h3>{a.name}</h3><p>{a.code} · {freq(a.frequencyHours)} · via {method} · as {nm(email)}</p></div><button className="sheet-close" onClick={() => close(false)}>×</button></div>
    <div className="sheet-body">{t && t.items.map((it, i) => <div className="check-item" key={i}><p>{it}</p><div className="toggle-group">{['Pass', 'Fail'].map(v => <button key={v} className={`toggle-btn ${v.toLowerCase()}${res[i] === v ? ' active' : ''}`} onClick={() => setRes({ ...res, [i]: v })}>{v.toUpperCase()}</button>)}</div></div>)}
      <div className="field-label">Remarks (optional)</div><textarea rows="2" value={rem} onChange={e => setRem(e.target.value)} />
      <div className="field-label">Photo evidence (optional)</div><input type="file" accept="image/*" capture="environment" multiple onChange={e => setFiles([...e.target.files])} /></div>
    <div className="sheet-foot"><button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => close(false)}>Cancel</button><button className="btn btn-dark" style={{ flex: 1 }} disabled={busy} onClick={submit}>Submit inspection</button></div></div></div>);
}

function History({ a, close, inspect }) {
  const [t, setT] = useState(null), [h, setH] = useState(null);
  useEffect(() => { api('/templates/' + a.templateKey).then(setT); api(`/assets/${a.id}/inspections`).then(setH); }, [a.id]);
  return (<div className="overlay active" onClick={e => e.target === e.currentTarget && close()}><div className="sheet">
    <div className="sheet-head"><div><h3>{a.name}</h3><p>{a.code} · {freq(a.frequencyHours)}</p></div><button className="sheet-close" onClick={close}>×</button></div>
    <div className="sheet-body"><div className="equip-due"><span className={'status-chip ' + sc(a.state)}>{LABEL[a.state]}</span> &nbsp; Due by <b>{fmt(a.due)}</b>{inspect && <button className="btn btn-dark btn-sm" style={{ marginLeft: 14 }} onClick={inspect}>Start inspection</button>}</div><div className="field-label">Inspection history</div>
      {!h ? <div className="empty-state">Loading…</div> : h.length === 0 ? <div className="empty-state">No inspections recorded yet.</div> : h.map(x => { const r = JSON.parse(x.responsesJson); return (
        <div className="hist-entry" key={x.id}><div className="hist-entry-top"><div><div className="hist-inspector">Checked by {nm(x.inspector)}</div><div className="hist-time">{fmt(x.at)} · {x.method}</div></div>
          <span className={'status-chip ' + (x.status === 'Fail' ? 'bad' : 'ok')}>{x.status === 'Fail' ? 'Failed' : 'Passed'}</span></div>
          {x.remarks && <div className="hist-notes">{x.remarks}</div>}
          <details><summary className="toggle-details-btn">View checklist</summary><div className="hist-details">{t && t.items.map((it, i) => <div className="hist-check-row" key={i}><span>{it}</span><span className={'res ' + (r[i] === 'Fail' ? 'fail' : 'pass')}>{(r[i] || '—').toUpperCase()}</span></div>)}</div></details>
          {JSON.parse(x.photosJson).map(p => <img key={p} className="hist-photo-thumb" src={p.startsWith('data:') ? p : '/api/photos/' + p} alt="" />)}</div>); })}</div></div></div>);
}
