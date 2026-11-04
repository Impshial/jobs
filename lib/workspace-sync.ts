import {parseWorkspace, WorkspaceConflict, type Snapshot, type Workspace, type WorkspaceStore} from './workspace';

export type SyncState={document:Workspace;revision:number;status:'saved'|'pending'|'saving'|'error'|'conflict';message:string};
type Options={store:WorkspaceStore;initial:Snapshot;changed:(state:SyncState)=>void;persistDraft:(document:Workspace,baseRevision:number)=>void;clearDraft:()=>void};

// All writes are serialized. A response for an older edit never replaces newer UI state.
export class WorkspaceSync {
  private state:SyncState;
  private baseline:string;
  private operation:Promise<void>|null=null;
  private disposed=false;
  private generation=0;
  constructor(private options:Options){
    this.state={document:options.initial.document,revision:options.initial.revision,status:'saved',message:''};
    this.baseline=JSON.stringify(this.state.document);
  }
  snapshot(){return this.state;}
  activate(){this.disposed=false;}
  private emit(patch:Partial<SyncState>){if(this.disposed)return;this.state={...this.state,...patch};this.options.changed(this.state);}
  edit(document:Workspace){
    document=parseWorkspace(document);
    if(JSON.stringify(document)===JSON.stringify(this.state.document))return;
    this.generation++;
    let message='';
    try{this.options.persistDraft(document,this.state.revision);}catch{message='Recovery storage is unavailable. Keep this page open until the database save completes.';}
    this.emit({document,status:this.state.status==='conflict'?'conflict':'pending',message});
  }
  async flush(){
    if(this.operation)return this.operation;
    if(this.disposed||this.state.status==='conflict')return;
    this.operation=this.saveLoop();
    try{await this.operation;}finally{this.operation=null;}
  }
  private async saveLoop(){
    while(!this.disposed&&JSON.stringify(this.state.document)!==this.baseline){
      const document=this.state.document;
      const serialized=JSON.stringify(document);
      this.emit({status:'saving'});
      try{
        const saved=await this.options.store.write(document,this.state.revision);
        if(this.disposed)return;
        this.baseline=serialized;
        this.state={...this.state,revision:saved.revision};
        try{
          if(JSON.stringify(this.state.document)===serialized)this.options.clearDraft();
          else this.options.persistDraft(this.state.document,saved.revision);
        }catch{/* A durable database save has already succeeded. */}
      }catch(error){
        this.emit({status:error instanceof WorkspaceConflict?'conflict':'error',message:error instanceof WorkspaceConflict?error.message:'Could not save to the database. Your changes are still on this device. Retry when connected.'});
        return;
      }
    }
    if(!this.disposed){try{this.options.clearDraft();}catch{}}
    this.emit({status:'saved',message:''});
  }
  async refresh(){
    if(this.disposed||this.operation||this.state.status!=='saved')return;
    const generation=this.generation;
    try{
      const remote=await this.options.store.read();
      // An edit during the read wins locally; the next CAS write will detect a conflict.
      if(this.disposed||generation!==this.generation||this.state.status!=='saved')return;
      if(remote&&remote.revision>this.state.revision){
        this.baseline=JSON.stringify(remote.document);
        this.emit({document:remote.document,revision:remote.revision});
      }
    }catch{/* A failed poll must not claim that a previously saved edit is unsaved. */}
  }
  dispose(){this.disposed=true;}
}
