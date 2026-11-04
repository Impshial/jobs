import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {parseWorkspace,WorkspaceConflict,type Snapshot,type Workspace} from './workspace';

export class LocalWorkspaceDatabase {
  private db:DatabaseSync;
  constructor(filename=path.join(process.cwd(),'.local-runtime','workspace.sqlite')){
    if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
    this.db=new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  }
  read():Snapshot|null {
    const row=this.db.prepare('SELECT document,revision,updated_at FROM workspace WHERE id=1').get() as {document:string;revision:number;updated_at:string}|undefined;
    return row?{document:parseWorkspace(JSON.parse(row.document)),revision:Number(row.revision),updatedAt:row.updated_at}:null;
  }
  write(document:Workspace,expectedRevision:number):Snapshot {
    document=parseWorkspace(document);
    const updatedAt=new Date().toISOString();
    const result=expectedRevision===0
      ?this.db.prepare('INSERT INTO workspace(id,document,revision,updated_at) VALUES(1,?,1,?) ON CONFLICT(id) DO NOTHING').run(JSON.stringify(document),updatedAt)
      :this.db.prepare('UPDATE workspace SET document=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?').run(JSON.stringify(document),updatedAt,expectedRevision);
    if(Number(result.changes)!==1)throw new WorkspaceConflict();
    return {document,revision:expectedRevision+1,updatedAt};
  }
  close(){this.db.close();}
}
