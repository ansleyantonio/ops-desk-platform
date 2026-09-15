const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { parseStatusHistory, noteValue, writeStatusHistory, appendStatus } = require('./pen-status-history.cjs');

// Only prepend older dated evidence. Existing recorded history is authoritative.
function restoreEarlierHistory(notes, observations) {
  let current = parseStatusHistory(notes);
  if (current.some(entry => !Number.isFinite(Date.parse(entry.at)))) return current;
  if (!current.length) {
    const status = noteValue(notes, 'API status');
    const at = noteValue(notes, 'Updated') || noteValue(notes, 'Created');
    if (status && Number.isFinite(Date.parse(at))) current = [{ at, status }];
  }
  const boundary = current.length ? Math.min(...current.map(entry => Date.parse(entry.at))) : Infinity;
  const older = observations.filter(entry => Number.isFinite(Date.parse(entry.at)) && Date.parse(entry.at) < boundary).sort((a,b) => Date.parse(a.at)-Date.parse(b.at));
  let prefix = [];
  for (const entry of older) prefix = appendStatus(prefix, entry.status, entry.at);
  // A repeated observation of the initial status does not establish a transition.
  if (prefix.length && current.length && prefix.at(-1).status.toLowerCase() === current[0].status.toLowerCase()) prefix.pop();
  return [...prefix, ...current];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const output = path.resolve('outputs');
  const files = fs.readdirSync(output).filter(name => /^pre-pen-(api-sync-backup|projects-preserve-teams-sync|tickets-only-sync).*\.json$/.test(name)).sort();
  const byTicket = new Map();
  for (const name of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(output,name),'utf8'));
    const rows = Array.isArray(payload) ? payload : payload.project_modules || [];
    for (const row of rows) {
      if (!String(row.notes || '').startsWith('Source: PEN ticketing API')) continue;
      const entries = parseStatusHistory(row.notes);
      const status = noteValue(row.notes,'API status');
      const at = noteValue(row.notes,'Updated') || noteValue(row.notes,'Created');
      if (status && Number.isFinite(Date.parse(at))) entries.push({at,status});
      byTicket.set(row.id,[...(byTicket.get(row.id)||[]), ...entries]);
    }
  }
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || undefined,
    database: process.env.MYSQL_DATABASE || 'project-pal', charset:'utf8mb4',
  });
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT id, notes FROM project_modules WHERE notes LIKE 'Source: PEN ticketing API%' FOR UPDATE");
    const changes=[]; let earliest=null; let latest=null; let entries=0;
    for (const row of rows) {
      const history=restoreEarlierHistory(row.notes,byTicket.get(row.id)||[]);
      const notes=writeStatusHistory(row.notes,history);
      if(notes !== row.notes) changes.push({...row,nextNotes:notes});
      for (const entry of history) {
        const at=Date.parse(entry.at); if (!Number.isFinite(at)) continue;
        entries++; earliest=earliest===null ? at : Math.min(earliest,at); latest=latest===null ? at : Math.max(latest,at);
      }
    }
    let backupPath=null;
    if(apply && changes.length) {
      backupPath=path.join(output,`pre-earlier-history-restore-${Date.now()}.json`);
      fs.writeFileSync(backupPath,JSON.stringify(changes.map(({id,notes})=>({id,notes}))),{mode:0o600});
      for(const row of changes) await connection.execute('UPDATE project_modules SET notes=? WHERE id=?',[row.nextNotes,row.id]);
    }
    if(apply) await connection.commit(); else await connection.rollback();
    console.log(JSON.stringify({mode:apply?'applied':'preview',snapshots:files.length,tickets:rows.length,ticketsChanged:changes.length,datedObservations:entries,earliest:earliest===null?null:new Date(earliest).toISOString(),latest:latest===null?null:new Date(latest).toISOString(),backupPath},null,2));
  } catch(error) { await connection.rollback(); throw error; }
  finally { await connection.end(); }
}
module.exports={restoreEarlierHistory};
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
