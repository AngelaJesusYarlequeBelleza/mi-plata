// =============================================================
//  MI PLATA · lógica de la app (front) + conexión a Supabase (back)
// =============================================================
(function () {
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const FUENTES_INGRESO = ['Sueldo', 'Ventas', 'Otros ingresos'];
const CATEGORIAS_INICIALES = ['Comida casa','Comida fuera','Transporte','Cuidado personal','Salidas','Varios'];

const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = n => 'S/ ' + (Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Estado de la app
const S = {
  sb: null, user: null, loaded: false,
  movs: [], cats: [], deudas: [], meta: { nombre: 'Mi meta de ahorro', objetivo: 0 },
  month: today().slice(0, 7), view: 'inicio', filter: 'todos', tipo: 'gasto', cat: null
};

const cats = () => S.cats;
const catIdx = id => S.cats.findIndex(c => c.id === id);
const catColor = id => { const i = catIdx(id); return i < 0 ? 'var(--muted)' : 'var(--c' + (i % 8 + 1) + ')'; };
const catName = m => m.tipo === 'gasto' ? ((S.cats.find(c => c.id === m.cat) || {}).nombre || 'Sin categoría') : m.tipo === 'ahorro' ? 'Ahorro' : (m.cat || 'Ingreso');
const inMonth = () => S.movs.filter(m => (m.fecha || '').startsWith(S.month));
const sum = (a, t) => a.filter(m => m.tipo === t).reduce((s, m) => s + (+m.monto || 0), 0);
const monthLabel = ym => { const [y, m] = ym.split('-'); return MESES[+m - 1] + ' ' + y; };
const dayLabel = f => { const [y, m, d] = f.split('-'); return new Date(+y, +m - 1, +d).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }); };
const byNewest = (a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado);
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, 2400); }

// =============================================================
//  BACK: lectura y escritura en Supabase
// =============================================================
async function cargarTodo() {
  const [m, c, d, mt] = await Promise.all([
    S.sb.from('movimientos').select('*').order('fecha', { ascending: false }),
    S.sb.from('categorias').select('*').order('orden').order('creado'),
    S.sb.from('deudas').select('*').order('creado'),
    S.sb.from('metas').select('*').maybeSingle()
  ]);
  const err = m.error || c.error || d.error || mt.error;
  if (err) throw err;
  S.movs = m.data.map(r => ({ id: r.id, tipo: r.tipo, monto: +r.monto, cat: r.tipo === 'gasto' ? r.categoria_id : r.fuente, nota: r.nota || '', fecha: r.fecha, creado: r.creado }));
  S.cats = c.data.map(r => ({ id: r.id, nombre: r.nombre, presupuesto: +r.presupuesto }));
  S.deudas = d.data.map(r => ({ id: r.id, nombre: r.nombre, total: +r.total, cat: r.categoria_id }));
  if (mt.data) S.meta = { nombre: mt.data.nombre, objetivo: +mt.data.objetivo };
  // Primera vez sin categorías: crear unas básicas
  if (!S.cats.length) {
    const { error } = await S.sb.from('categorias').insert(CATEGORIAS_INICIALES.map((nombre, i) => ({ nombre, orden: i + 1 })));
    if (!error) return cargarTodo();
  }
  S.loaded = true;
}
async function ejecutar(promesa, ok) {
  const { error } = await promesa;
  if (error) { toast('No se pudo guardar: ' + error.message); return false; }
  await cargarTodo(); render(); if (ok) toast(ok); return true;
}
const api = {
  addMov: m => ejecutar(S.sb.from('movimientos').insert({
    tipo: m.tipo, monto: m.monto, nota: m.nota || null, fecha: m.fecha,
    categoria_id: m.tipo === 'gasto' ? (m.cat || null) : null,
    fuente: m.tipo === 'ingreso' ? (m.cat || null) : null
  })),
  delMov: id => ejecutar(S.sb.from('movimientos').delete().eq('id', id), 'Movimiento borrado'),
  addCat: nombre => ejecutar(S.sb.from('categorias').insert({ nombre, orden: S.cats.length + 1 }), 'Categoría añadida'),
  delCat: id => ejecutar(S.sb.from('categorias').delete().eq('id', id), 'Categoría quitada'),
  setBudget: (id, v) => ejecutar(S.sb.from('categorias').update({ presupuesto: v }).eq('id', id), 'Presupuesto actualizado'),
  saveMeta: meta => ejecutar(S.sb.from('metas').upsert({ user_id: S.user.id, nombre: meta.nombre, objetivo: meta.objetivo }), 'Meta guardada'),
  addDeuda: d => ejecutar(S.sb.from('deudas').insert({ nombre: d.nombre, total: d.total, categoria_id: d.cat || null }), 'Deuda agregada'),
  delDeuda: id => ejecutar(S.sb.from('deudas').delete().eq('id', id), 'Deuda borrada')
};

// =============================================================
//  FRONT: pantallas
// =============================================================
function movRow(m, withDel) {
  const color = m.tipo === 'gasto' ? catColor(m.cat) : m.tipo === 'ahorro' ? 'var(--save)' : 'var(--ok)';
  return `<div class="item"><span class="dot" style="background:${color}"></span>
  <div class="grow"><div class="t">${esc(m.nota || catName(m))}</div><div class="s">${esc(catName(m))}${withDel ? '' : ' · ' + esc(m.fecha.slice(8)) + ' ' + MESES[+m.fecha.slice(5, 7) - 1].slice(0, 3)}</div></div>
  <div class="amt num ${m.tipo}">${m.tipo === 'gasto' ? '−' : '+'} ${fmt(m.monto)}</div>
  ${withDel ? `<button class="del" data-del="${esc(m.id)}">Borrar</button>` : ''}</div>`;
}

function renderInicio() {
  const el = $('#v-inicio');
  if (!S.loaded) { el.innerHTML = '<div class="empty">Cargando tus movimientos…</div>'; return; }
  const mm = inMonth(), ing = sum(mm, 'ingreso'), gas = sum(mm, 'gasto'), aho = sum(mm, 'ahorro'), queda = ing - gas - aho;
  const pct = ing > 0 ? Math.min(100, (gas + aho) / ing * 100) : 0;
  const isCur = S.month === today().slice(0, 7);
  const [y, m] = S.month.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const restan = isCur ? dim - new Date().getDate() + 1 : 0;
  const note = ing === 0 ? 'Registra tu sueldo del mes para ver cuánto te queda.' :
    `Usaste el ${Math.round((gas + aho) / ing * 100)}% de tus ingresos.` + (isCur && queda > 0 && restan > 0 ? ` Puedes gastar ${fmt(queda / restan)} por día hasta fin de mes.` : '');
  const porCat = S.cats.map((c, i) => ({ c, i, g: mm.filter(x => x.tipo === 'gasto' && x.cat === c.id).reduce((s, x) => s + x.monto, 0) })).sort((a, b) => b.g - a.g);
  const sinCat = mm.filter(x => x.tipo === 'gasto' && catIdx(x.cat) < 0).reduce((s, x) => s + x.monto, 0);
  const catRows = porCat.filter(r => r.g > 0 || r.c.presupuesto > 0).map(({ c, i, g }) => {
    const p = c.presupuesto > 0 ? g / c.presupuesto * 100 : null;
    const st = p == null ? '' : p > 100 ? 'over' : p >= 80 ? 'warn' : '';
    return `<div class="item"><span class="dot" style="background:var(--c${i % 8 + 1})"></span><div class="grow">
      <div class="between"><span class="t">${esc(c.nombre)}</span><span class="num amt">${fmt(g)}</span></div>
      ${p != null ? `<div class="bar ${st}"><i style="width:${Math.min(100, p)}%"></i></div><div class="s num between" style="margin-top:4px"><span>de ${fmt(c.presupuesto)}</span>${st ? `<span class="pill ${st}">${st === 'over' ? 'Te pasaste ' + fmt(g - c.presupuesto) : 'Queda ' + fmt(c.presupuesto - g)}</span>` : `<span>Queda ${fmt(c.presupuesto - g)}</span>`}</div>` : '<div class="s">Sin presupuesto</div>'}
    </div></div>`;
  }).join('') + (sinCat > 0 ? `<div class="item"><span class="dot" style="background:var(--muted)"></span><div class="grow t">Sin categoría</div><span class="num amt">${fmt(sinCat)}</span></div>` : '');
  const ult = [...mm].sort(byNewest).slice(0, 5);
  el.innerHTML = `
  <div class="hero">
    <div><div class="lbl">Te queda en ${esc(MESES[m - 1])}</div><div class="big num"><small>S/</small>${queda.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
    <div class="meter" role="img" aria-label="Porcentaje usado de tus ingresos"><i style="width:${pct}%"></i></div>
    <div class="row num"><div><div class="lbl">Ingresos</div><div class="v">${fmt(ing)}</div></div><div><div class="lbl">Gastos</div><div class="v">${fmt(gas)}</div></div><div><div class="lbl">Ahorro</div><div class="v">${fmt(aho)}</div></div></div>
    <div class="note">${note}</div>
  </div>
  <h2>Gastos por categoría <button data-go="ajustes">Presupuestos</button></h2>
  <div class="list">${catRows || '<div class="empty">Aún no hay gastos este mes. Toca <b>+</b> para anotar el primero.</div>'}</div>
  <h2>Últimos movimientos <button data-go="movs">Ver todos</button></h2>
  <div class="list">${ult.map(x => movRow(x, false)).join('') || '<div class="empty">Sin movimientos en este mes.</div>'}</div>`;
}

function renderMovs() {
  const el = $('#v-movs');
  if (!S.loaded) { el.innerHTML = '<div class="empty">Cargando…</div>'; return; }
  let mm = inMonth(); if (S.filter !== 'todos') mm = mm.filter(m => m.tipo === S.filter);
  mm.sort(byNewest);
  const groups = {}; mm.forEach(m => (groups[m.fecha] = groups[m.fecha] || []).push(m));
  const F = [['todos','Todos'],['gasto','Gastos'],['ingreso','Ingresos'],['ahorro','Ahorro']];
  el.innerHTML = `<div class="chips" style="margin-top:6px">${F.map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div>
  ${Object.keys(groups).map(d => `<div class="dayhead">${esc(dayLabel(d))}</div><div class="list">${groups[d].map(x => movRow(x, true)).join('')}</div>`).join('') || '<div class="list" style="margin-top:14px"><div class="empty">No hay movimientos con este filtro en ' + esc(monthLabel(S.month)) + '.</div></div>'}`;
}

function renderMetas() {
  const el = $('#v-metas');
  const meta = S.meta;
  const ahorrado = sum(S.movs, 'ahorro');
  const mp = meta.objetivo > 0 ? Math.min(100, ahorrado / meta.objetivo * 100) : 0;
  const deudas = S.deudas.map(d => ({ ...d, pag: S.movs.filter(m => m.tipo === 'gasto' && m.cat === d.cat).reduce((s, m) => s + m.monto, 0) }));
  el.innerHTML = `
  <h2 style="margin-top:8px">Meta de ahorro</h2>
  <div class="list"><div class="item"><div class="grow">
    <div class="between"><span class="t">${esc(meta.nombre)}</span><span class="amt ahorro num">${fmt(ahorrado)}</span></div>
    ${meta.objetivo > 0 ? `<div class="bar"><i style="width:${mp}%;background:var(--save)"></i></div><div class="s num" style="margin-top:4px">${Math.round(mp)}% de ${fmt(meta.objetivo)} · faltan ${fmt(Math.max(0, meta.objetivo - ahorrado))}</div>` : '<div class="s">Define un monto objetivo abajo. Cada movimiento de tipo <b>Ahorro</b> se suma aquí.</div>'}
  </div></div></div>
  <form class="form" id="metaForm" style="margin-top:10px"><div class="r">
    <input id="mNombre" type="text" value="${esc(meta.nombre)}" aria-label="Nombre de la meta">
    <input id="mObj" type="number" min="0" step="0.01" value="${meta.objetivo || ''}" placeholder="Objetivo S/" aria-label="Objetivo" style="flex:0 1 130px">
    <button class="btn ghost" style="flex:0 0 auto">Guardar</button></div></form>

  <h2>Deudas</h2>
  <div class="list">${deudas.map(d => {
    const p = Math.min(100, d.pag / d.total * 100), done = d.pag >= d.total;
    return `<div class="item"><div class="grow">
      <div class="between"><span class="t">${esc(d.nombre)}</span>${done ? '<span class="pill">Pagada</span>' : `<span class="num s">faltan <b>${fmt(d.total - d.pag)}</b></span>`}</div>
      <div class="bar"><i style="width:${p}%"></i></div>
      <div class="s num" style="margin-top:4px">Pagado ${fmt(d.pag)} de ${fmt(d.total)} · se descuenta con gastos en “${esc((S.cats.find(c => c.id === d.cat) || {}).nombre || '—')}”</div>
    </div><button class="del" data-deldeuda="${esc(d.id)}">Borrar</button></div>`;
  }).join('') || '<div class="empty">No tienes deudas registradas. Agrega una y cada gasto en su categoría se descontará solo.</div>'}</div>
  <form class="form" id="deudaForm" style="margin-top:10px">
    <div class="lbl2">Agregar deuda</div>
    <div class="r"><input id="dNombre" type="text" placeholder="¿A quién? (ej. Mamá)" aria-label="Nombre"><input id="dTotal" type="number" min="0" step="0.01" placeholder="Total S/" aria-label="Total"></div>
    <div class="r"><select id="dCat" aria-label="Categoría de pagos">${S.cats.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select><button class="btn" style="flex:0 0 auto">Agregar</button></div>
  </form>`;
}

function renderAjustes() {
  const el = $('#v-ajustes');
  const mm = inMonth();
  el.innerHTML = `
  <h2 style="margin-top:8px">Categorías y presupuesto mensual</h2>
  <div class="list">${S.cats.map((c, i) => `<div class="item"><span class="dot" style="background:var(--c${i % 8 + 1})"></span><div class="grow t">${esc(c.nombre)}</div>
    <input class="budget num" type="number" min="0" step="1" id="b-${esc(c.id)}" data-budget="${esc(c.id)}" value="${c.presupuesto || ''}" placeholder="S/ —" aria-label="Presupuesto de ${esc(c.nombre)}">
    <button class="del" data-delcat="${esc(c.id)}">Quitar</button></div>`).join('')}</div>
  <form class="form" id="catForm" style="margin-top:10px"><div class="r"><input id="cNombre" type="text" placeholder="Nueva categoría (ej. Streaming)" aria-label="Nueva categoría"><button class="btn ghost" style="flex:0 0 auto">Añadir</button></div></form>

  <h2>Exportar</h2>
  <div class="form">
    <div class="s">Descarga tus movimientos en CSV para abrirlos en Excel.</div>
    <div class="r"><button class="btn ghost" id="expMes" type="button">Solo ${esc(monthLabel(S.month))} (${mm.length})</button><button class="btn ghost" id="expTodo" type="button">Todo (${S.movs.length})</button></div>
  </div>

  <h2>Cuenta</h2>
  <div class="form"><div class="s">Sesión iniciada como <b>${esc(S.user?.email)}</b></div><button class="btn ghost" id="logout" type="button">Cerrar sesión</button></div>`;
}

function render() {
  $('#mLabel').textContent = monthLabel(S.month);
  document.querySelectorAll('nav.tabs [data-v]').forEach(b => b.setAttribute('aria-current', b.dataset.v === S.view ? 'page' : 'false'));
  ['inicio', 'movs', 'metas', 'ajustes'].forEach(v => $('#v-' + v).hidden = v !== S.view);
  ({ inicio: renderInicio, movs: renderMovs, metas: renderMetas, ajustes: renderAjustes })[S.view]();
}

// =============================================================
//  Hoja para registrar un movimiento
// =============================================================
function paintCats() {
  $('#catWrap').hidden = S.tipo === 'ahorro';
  const list = S.tipo === 'gasto' ? S.cats.map((c, i) => ({ id: c.id, n: c.nombre, col: `var(--c${i % 8 + 1})` })) : FUENTES_INGRESO.map(n => ({ id: n, n, col: 'var(--ok)' }));
  if (!list.some(x => x.id === S.cat)) S.cat = list[0]?.id ?? null;
  $('#fCats').innerHTML = list.map(x => `<button type="button" class="chip" data-cat="${esc(x.id)}" aria-pressed="${x.id === S.cat}"><span class="dot" style="background:${x.col}"></span>${esc(x.n)}</button>`).join('');
}
function openAdd() {
  S.tipo = 'gasto'; S.cat = null;
  $('#fMonto').value = ''; $('#fNota').value = ''; $('#fErr').textContent = '';
  $('#fFecha').value = S.month === today().slice(0, 7) ? today() : S.month + '-01';
  document.querySelectorAll('#tipoSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === 'gasto'));
  paintCats(); $('#scrim').hidden = false; setTimeout(() => $('#fMonto').focus(), 50);
}
const closeAdd = () => $('#scrim').hidden = true;
$('#openAdd').onclick = openAdd; $('#closeAdd').onclick = closeAdd;
$('#scrim').addEventListener('click', e => { if (e.target.id === 'scrim') closeAdd(); });
$('#tipoSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.tipo = b.dataset.t; S.cat = null;
  document.querySelectorAll('#tipoSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
  paintCats();
});
$('#fCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; S.cat = b.dataset.cat; paintCats(); });
$('#addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const monto = parseFloat(($('#fMonto').value || '').replace(',', '.'));
  if (!(monto > 0)) { $('#fErr').textContent = 'Escribe un monto mayor a 0.'; return; }
  const fecha = $('#fFecha').value || today();
  const m = { tipo: S.tipo, monto: Math.round(monto * 100) / 100, cat: S.tipo === 'ahorro' ? '' : (S.cat || ''), nota: $('#fNota').value.trim(), fecha };
  const btn = e.submitter; if (btn) btn.disabled = true;
  const ok = await api.addMov(m);
  if (btn) btn.disabled = false;
  if (!ok) { $('#fErr').textContent = 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.'; return; }
  closeAdd();
  toast((S.tipo === 'gasto' ? 'Gasto' : S.tipo === 'ingreso' ? 'Ingreso' : 'Ahorro') + ' de ' + fmt(m.monto) + ' guardado');
  if (!fecha.startsWith(S.month)) { S.month = fecha.slice(0, 7); render(); }
});

// =============================================================
//  Eventos generales
// =============================================================
document.querySelectorAll('nav.tabs [data-v]').forEach(b => b.onclick = () => { S.view = b.dataset.v; render(); window.scrollTo(0, 0); });
function shiftMonth(d) { let [y, m] = S.month.split('-').map(Number); m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } S.month = y + '-' + pad(m); render(); }
$('#prevM').onclick = () => shiftMonth(-1); $('#nextM').onclick = () => shiftMonth(1);

document.addEventListener('click', async e => {
  const go = e.target.closest('[data-go]'); if (go) { S.view = go.dataset.go; render(); window.scrollTo(0, 0); return; }
  const f = e.target.closest('[data-filter]'); if (f) { S.filter = f.dataset.filter; render(); return; }
  const d = e.target.closest('[data-del],[data-deldeuda],[data-delcat]');
  if (d) {
    if (!d.classList.contains('arm')) {   // primer toque: pedir confirmación
      d.classList.add('arm'); d.textContent = '¿Seguro?';
      setTimeout(() => { if (d.isConnected) { d.classList.remove('arm'); d.textContent = d.dataset.delcat ? 'Quitar' : 'Borrar'; } }, 3000);
      return;
    }
    if (d.dataset.del) await api.delMov(d.dataset.del);
    else if (d.dataset.deldeuda) await api.delDeuda(d.dataset.deldeuda);
    else if (d.dataset.delcat) await api.delCat(d.dataset.delcat);
    return;
  }
  if (e.target.id === 'expMes' || e.target.id === 'expTodo') exportCSV(e.target.id === 'expMes');
  if (e.target.id === 'logout') { await S.sb.auth.signOut(); }
});
document.addEventListener('change', e => {
  const b = e.target.closest('[data-budget]'); if (!b) return;
  api.setBudget(b.dataset.budget, Math.max(0, parseFloat(b.value) || 0));
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'catForm') {
    e.preventDefault(); const n = $('#cNombre').value.trim(); if (!n) return;
    await api.addCat(n);
  }
  if (e.target.id === 'metaForm') {
    e.preventDefault();
    await api.saveMeta({ nombre: $('#mNombre').value.trim() || 'Mi meta de ahorro', objetivo: Math.max(0, parseFloat($('#mObj').value) || 0) });
  }
  if (e.target.id === 'deudaForm') {
    e.preventDefault(); const n = $('#dNombre').value.trim(), t = parseFloat($('#dTotal').value);
    if (!n || !(t > 0)) { toast('Escribe a quién le debes y el total'); return; }
    await api.addDeuda({ nombre: n, total: Math.round(t * 100) / 100, cat: $('#dCat').value });
  }
});

function exportCSV(soloMes) {
  const rows = (soloMes ? inMonth() : S.movs).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '﻿Fecha;Tipo;Categoría;Nota;Monto\n' + rows.map(m => [m.fecha, m.tipo, catName(m), m.nota, String(m.monto).replace('.', ',')].map(q).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'mi-plata-' + (soloMes ? S.month : 'todo') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// =============================================================
//  Login y arranque
// =============================================================
function mostrar(pantalla) {
  $('#login').hidden = pantalla !== 'login';
  $('#appMain').hidden = pantalla !== 'app';
  document.querySelector('nav.tabs').hidden = pantalla !== 'app';
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#lErr').textContent = '';
  const { error } = await S.sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lPass').value });
  if (error) $('#lErr').textContent = 'Correo o contraseña incorrectos.';
});

async function alCambiarSesion(session) {
  S.user = session?.user || null;
  if (!S.user) { S.loaded = false; S.movs = []; S.cats = []; S.deudas = []; mostrar('login'); return; }
  mostrar('app'); render();
  try { await cargarTodo(); } catch (err) { toast('No se pudieron cargar tus datos: ' + err.message); }
  render();
}

(function iniciar() {
  const cfg = window.MI_PLATA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith('PEGA_AQUI')) {
    mostrar('login');
    $('#lErr').textContent = 'Falta configurar la conexión: completa SUPABASE_URL y SUPABASE_ANON_KEY en config.js.';
    return;
  }
  S.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  S.sb.auth.onAuthStateChange((_evt, session) => { setTimeout(() => alCambiarSesion(session), 0); });
})();
})();
