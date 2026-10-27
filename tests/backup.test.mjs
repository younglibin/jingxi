import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = resolve('scripts/backup.sh');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'jingxi-backup-'));
  for (const path of ['data','images/originals','images/display','images/tmp','logs']) mkdirSync(join(root,path),{recursive:true});
  writeFileSync(join(root,'data/store.json'), JSON.stringify({schemaVersion:1,works:[{id:'one'}]}));
  writeFileSync(join(root,'images/originals/one.png'),'original image');
  writeFileSync(join(root,'images/display/one.png'),'display image');
  writeFileSync(join(root,'images/tmp/incomplete'),'incomplete');
  writeFileSync(join(root,'logs/private.log'),'private');
  return root;
}
test('offline backup preserves data and completed images while excluding temporary files and logs', () => {
  const root=fixture(); const out=join(root,'backups');
  try {
    const result=spawnSync('bash',[script,out],{env:{...process.env,STORAGE_ROOT:root,BACKUP_OFFLINE:'1'},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const archive=readdirSync(out).find(f=>f.endsWith('.tar.gz'));
    assert.ok(archive,'creates one archive');
    const listing=spawnSync('tar',['-tzf',join(out,archive)],{encoding:'utf8'});
    assert.equal(listing.status,0);
    assert.match(listing.stdout,/data\/store.json/);
    assert.match(listing.stdout,/images\/originals\/one.png/);
    assert.match(listing.stdout,/images\/display\/one.png/);
    assert.doesNotMatch(listing.stdout,/incomplete|private.log|backups/);
    const json=spawnSync('tar',['-xOzf',join(out,archive),'data/store.json'],{encoding:'utf8'});
    assert.deepEqual(JSON.parse(json.stdout),{schemaVersion:1,works:[{id:'one'}]});
    assert.ok(readFileSync(join(out,archive+'.sha256'),'utf8').includes(archive));
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('backup rejects a missing data file without fabricating an empty site',()=>{
  const root=mkdtempSync(join(tmpdir(),'jingxi-empty-'));
  try {
    const result=spawnSync('bash',[script,join(root,'out')],{env:{...process.env,STORAGE_ROOT:root,BACKUP_OFFLINE:'1'},encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/store.json/);
    assert.equal(readdirSync(root).length,0);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
