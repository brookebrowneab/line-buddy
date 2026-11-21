import { useEffect, useState, type ReactNode } from 'react';
export function ClassAccess({ children }: { children: ReactNode }) {
  const [checking,setChecking]=useState(true),[locked,setLocked]=useState(false),[code,setCode]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/transcription/status',{signal:controller.signal}).then(r=>r.json()).then(s=>setLocked(s.requiresClassCode && s.configured && !s.authorized))
      .catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});
    const expired=()=>{setLocked(true);setNote('Enter the class code again to continue.');};
    window.addEventListener('lines-class-unauthorized',expired);
    return()=>{controller.abort();window.removeEventListener('lines-class-unauthorized',expired);};
  },[]);
  if(checking)return <div className="page" role="status">Opening Lines…</div>;
  if(!locked)return <>{children}</>;
  const unlock=async(e:React.FormEvent)=>{
    e.preventDefault();if(!code.trim()||busy)return;setBusy(true);setNote('');
    try{
      const r=await fetch('/api/class/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.trim()})});
      const result=await r.json();if(!r.ok)throw new Error(result.error||'Could not check the code. Try again.');
      setCode('');setLocked(false);
    }catch(error){setNote(error instanceof Error?error.message:'Could not check the code. Try again.');}finally{setBusy(false);}
  };
  return <main className="page" style={{paddingTop:64}}>
    <h1>Welcome to Lines</h1>
    <p className="muted">Enter the class code from your teacher. You only need to do this once a week on this browser.</p>
    <form onSubmit={e=>void unlock(e)} style={{display:'grid',gap:14,marginTop:24}}>
      <label htmlFor="class-code">Class code</label>
      <input id="class-code" className="card" type="password" autoComplete="current-password" value={code} onChange={e=>setCode(e.target.value)} required style={{fontSize:20,padding:14,width:'100%',boxSizing:'border-box'}} />
      <button className="btn btn-primary" disabled={busy||!code.trim()}>{busy?'Checking…':'Start practising'}</button>
      {note&&<p role="alert">{note}</p>}
    </form>
    <p className="muted" style={{marginTop:28}}>Your progress stays in this browser. Speech checking sends your recording to ElevenLabs to turn it into words.</p>
  </main>;
}
