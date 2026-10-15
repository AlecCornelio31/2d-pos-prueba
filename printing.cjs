const crypto = require('node:crypto');
const uid = () => crypto.randomUUID();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const clean = value => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
const money = n => '$' + (n / 100).toFixed(2);
const sum = xs => xs.reduce((n, x) => n + x.amount, 0);
function ticket(o, kind, reprint, updated) {
 const kitchen = kind === 'kitchen';
 const total = o.items.reduce((n, l) => n + l.qty * l.unitPrice, 0) + o.shipping;
 const paid = sum(o.payments) - sum(o.refunds);
 const lines = ['2D', kitchen ? 'COCINA' : 'TICKET DEL CLIENTE', 'Pedido #' + clean(o.folio), 'Version ' + o.version];
 if (reprint) lines.push('*** REIMPRESION ***');
 if (updated) lines.push('*** CUENTA ACTUALIZADA ***', 'Sustituye el ticket anterior.', 'NO preparar todo otra vez.');
 lines.push(new Date(o.at).toLocaleString('es-MX', {timeZone: 'America/Mexico_City'}),
   o.type === 'table' ? 'Mesa: ' + clean(o.table) : o.type === 'delivery' ? 'A DOMICILIO' : 'PARA LLEVAR',
   'Atendio: ' + clean(o.waiter));
 if (o.customer) lines.push('Cliente: ' + clean(o.customer));
 if (!kitchen && o.phone) lines.push('Tel. cliente: ' + clean(o.phone));
 if (!kitchen && o.type === 'delivery') lines.push('Direccion: ' + clean(o.address));
 lines.push('--------------------------------');
 for (const l of o.items) {
   lines.push(l.qty + ' x ' + clean(l.name));
   if (l.units > 1) lines.push('PAQUETES: ' + l.qty + ' de ' + l.units, 'PIEZAS A PREPARAR: ' + l.qty * l.units);
   for (const e of l.extras) lines.push('+ ' + clean(e.name) + ' por pieza' + (kitchen ? '' : ' (' + money(e.price) + ')'));
   if (l.note) lines.push('INDICACIONES: ' + clean(l.note));
   if (!kitchen) lines.push('Unit./paquete: ' + money(l.unitPrice), 'Importe: ' + money(l.qty * l.unitPrice));
   lines.push('');
 }
 lines.push('--------------------------------');
 if (kitchen) lines.push('COMANDA COMPLETA', 'Revisar extras e indicaciones.');
 else {
   lines.push('Subtotal: ' + money(total - o.shipping));
   if (o.shipping) lines.push('Envio: ' + money(o.shipping));
   lines.push('TOTAL: ' + money(total), 'Pagado: ' + money(paid), 'Saldo: ' + money(total - paid), paid === total ? 'PAGADO' : 'PENDIENTE DE PAGO');
   const names = {cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia'};
   for (const p of o.payments) {
     lines.push(names[p.method] + ': ' + money(p.amount));
     if (p.method === 'cash') lines.push('Recibido: ' + money(p.received), 'Cambio: ' + money(p.change));
   }
   lines.push('', 'SERVICIO A DOMICILIO', '9321693968', 'Gracias por tu compra!', 'No es comprobante fiscal.');
 }
 return lines.join('\n');
}
function safeJobs(d) {
 return (d.printJobs || []).slice(-500).map(({id, orderId, version, kind, status, at, reprint, completedAt}) =>
   ({id, orderId, version, kind, status, at, reprint, completedAt}));
}
function request(d, u, b) {
 const o = d.orders.find(o => o.id === b.id);
 if (!o) fail('Pedido no encontrado.', 404);
 if (o.cancelled) fail('No se imprimen pedidos cancelados.');
 if (o.version !== b.version) fail('El pedido cambió. Actualiza antes de imprimir.', 409);
 const kinds = b.kind === 'both' ? ['kitchen', 'customer'] : ['kitchen', 'customer'].includes(b.kind) ? [b.kind] : null;
 if (!kinds) fail('Tipo de ticket inválido.');
 const jobs = d.printJobs ||= [];
 if (jobs.filter(j => j.status === 'queued').length >= 200) fail('Hay demasiados tickets pendientes. Revisa la estación de impresión.');
 const previous = jobs.filter(j => j.orderId === o.id);
 const ids = [];
 for (const kind of kinds) {
   const same = previous.filter(j => j.kind === kind && j.version === o.version);
   if (same.some(j => j.status === 'queued')) fail('Este ticket ya está en espera.', 409);
   if (same.length && b.reprint !== true) fail('Este ticket ya fue solicitado. Usa Reimprimir si hace falta otra copia.', 409);
   const reprint = same.length > 0;
   const j = {id: uid(), orderId: o.id, version: o.version, kind, status: 'queued', at: new Date().toISOString(), userId: u.id, reprint,
     text: ticket(o, kind, reprint, previous.some(j => j.kind === kind && j.version !== o.version && ['processing', 'spooled', 'error'].includes(j.status)))};
   jobs.push(j); ids.push(j.id);
 }
 d.audit.push({id: uid(), at: new Date().toISOString(), userId: u.id, user: u.fullName, message: 'Solicitó tickets · ' + o.folio});
 return {jobIds: ids};
}
function cashier(u) { if (!['admin', 'cashier'].includes(u.role)) fail('Solo caja o administrador puede operar la estación.', 403); }
function claim(d, u) {
 cashier(u);
 for (const j of d.printJobs || []) {
   if (j.status !== 'queued') continue;
   const o = d.orders.find(o => o.id === j.orderId);
   if (!o || o.cancelled || o.version !== j.version) { j.status = 'obsolete'; continue; }
   j.status = 'processing'; j.claimToken = uid(); j.claimedBy = u.id; j.claimedAt = new Date().toISOString();
   return {job: {id: j.id, kind: j.kind, text: j.text, claimToken: j.claimToken, folio: o.folio}};
 }
 return {job: null};
}
function ack(d, u, b) {
 cashier(u);
 const j = (d.printJobs || []).find(j => j.id === b.id);
 if (!j || j.claimedBy !== u.id || j.claimToken !== b.claimToken) fail('Solicitud de impresión no autorizada.', 403);
 if (!['spooled', 'error'].includes(b.status)) fail('Estado inválido.');
 if (j.status !== 'processing') {
   if (j.status === b.status) return {ok: true};
   fail('Este ticket ya tiene un resultado.', 409);
 }
 j.status = b.status; j.completedAt = new Date().toISOString();
 return {ok: true};
}
module.exports = {ticket, safeJobs, request, claim, ack};
