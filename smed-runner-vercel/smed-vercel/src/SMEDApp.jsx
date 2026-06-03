import { useState, useRef, useCallback, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).substr(2, 9);

const OP_COLORS = [
  "#FF6B35","#4ECDC4","#FFE66D","#A8E6CF","#FF8B94",
  "#6C5CE7","#00B894","#FDCB6E","#E17055","#74B9FF"
];

const DEFAULT_TASK_TYPES = [
  { name:"Validated",    color:"#00B894" },
  { name:"Non-Validated",color:"#74B9FF" },
  { name:"Waiting",      color:"#FF6B35" },
];

const TASK_TEMPLATES = {
  "Die Change": [
    {name:"Remove old die",duration:8,type:"Validated"},
    {name:"Clean press bed",duration:5,type:"Non-Validated"},
    {name:"Fetch new die",duration:6,type:"Waiting"},
    {name:"Install new die",duration:10,type:"Validated"},
    {name:"Adjust clamps",duration:7,type:"Non-Validated"},
    {name:"Trial run & inspect",duration:6,type:"Validated"},
  ],
  "Product Changeover": [
    {name:"Clear previous product",duration:5,type:"Non-Validated"},
    {name:"Clean surfaces",duration:8,type:"Non-Validated"},
    {name:"Retrieve new materials",duration:6,type:"Waiting"},
    {name:"Load product spec",duration:3,type:"Validated"},
    {name:"First article inspection",duration:5,type:"Validated"},
    {name:"Update work order",duration:2,type:"Validated"},
  ],
  "CNC Setup": [
    {name:"Remove previous job",duration:6,type:"Non-Validated"},
    {name:"Clean fixture & table",duration:7,type:"Non-Validated"},
    {name:"Retrieve program & tooling",duration:5,type:"Waiting"},
    {name:"Install fixture",duration:9,type:"Validated"},
    {name:"Set tool offsets",duration:8,type:"Non-Validated"},
    {name:"First-off measurement",duration:6,type:"Validated"},
  ],
};

const WAIT_COLOR = "#6B7280"; // grey for downtime/waiting

function blankOperator(index) {
  return { id:uid(), name:`Operator ${index+1}`, tasks:[] };
}
function makeWait(duration=5) {
  return { id:uid(), name:"Waiting / Downtime", duration, type:"__WAIT__", isWait:true };
}
function defaultProject(name="New Changeover", operatorCount=2, taskTypes=DEFAULT_TASK_TYPES) {
  return {
    id:uid(), name, created:Date.now(), notes:"",
    taskTypes: taskTypes.map(t=>({...t})),
    operators: Array.from({length:operatorCount},(_,i)=>blankOperator(i)),
  };
}

// ── Demo board: Tea & Toast changeover (always regenerated fresh) ─────────────
function makeDemoProject() {
  const T = (name,duration,type) => ({id:uid(),name,duration,type});
  const W = (duration) => ({id:uid(),name:"Waiting / Downtime",duration,type:"__WAIT__",isWait:true});
  return {
    id:"__DEMO__",
    isDemo:true,
    name:"☕ Tea & 🍞 Toast — Demo",
    created:Date.now(),
    notes:"A demo changeover: making a cup of tea and a piece of toast. Notice the waiting blocks (striped) and the bottleneck (the slower operator, highlighted orange). Drag tasks between the two people to balance them so they finish together!",
    taskTypes: DEFAULT_TASK_TYPES.map(t=>({...t})),
    operators:[
      {
        id:uid(), name:"Person 1 — Tea",
        tasks:[
          T("Fill & boil kettle",4,"Validated"),
          W(3),                                  // waiting for kettle
          T("Get cup & teabag",1,"Non-Validated"),
          T("Pour boiling water",1,"Validated"),
          W(3),                                  // waiting for brew
          T("Remove teabag",1,"Non-Validated"),
          T("Add milk & stir",1,"Validated"),
        ],
      },
      {
        id:uid(), name:"Person 2 — Toast",
        tasks:[
          T("Get bread out",1,"Non-Validated"),
          T("Put bread in toaster",1,"Validated"),
          W(4),                                  // waiting for toaster
          T("Butter the toast",2,"Validated"),
          T("Plate up & serve",1,"Non-Validated"),
        ],
      },
    ],
  };
}

// ── Tutorial walkthrough steps ────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  { title:"Welcome to SMED Runner! 👋", body:"This demo shows two people working in parallel: one making tea, one making toast. Let's walk through every feature. Tap Next to begin." },
  { title:"The Operator Columns", body:"Each column is one person and their tasks, top to bottom. The number (e.g. 12m) is their total time. The ORANGE column is the BOTTLENECK — the slowest person who sets how long the whole changeover takes." },
  { title:"Task Types & Colours", body:"Each task is colour-coded: green = Validated (value-add), blue = Non-Validated, orange = Waiting. The coloured dot and label tell you the category at a glance." },
  { title:"Waiting / Downtime ⏸", body:"See the grey STRIPED blocks? Those are waiting times — like waiting for the kettle to boil or the toaster to pop. This is idle time where the person can't do anything. Reducing these is a key SMED goal!" },
  { title:"Try Dragging a Task", body:"Now YOU try: press and hold a task (or click-drag on desktop) and move it to the OTHER person's column. Watch the times and efficiency update instantly. Balancing the load is the whole point of SMED!" },
  { title:"Add Your Own Task", body:"Tap the + ADD TASK button at the bottom of any column. Give it a name, a time in minutes, and a type. Try adding one now!" },
  { title:"Add a Waiting Block", body:"Tap the ⏸ ADD WAIT button to add a downtime block to a person. Use this to represent any time they're stood waiting." },
  { title:"Switch to Gantt View ▤", body:"Tap the ▤ icon at the top right. The Gantt view shows time flowing downward, so you can see exactly when each person is busy or waiting, side by side." },
  { title:"Run the Simulation ▶", body:"Tap ▶ RUN at the top, then press START. Watch the changeover play out live — tasks light up as they happen, and you'll see who finishes first and who's the bottleneck." },
  { title:"View the Report 📊", body:"Tap 📊 REPORT to see efficiency, total waiting time, a breakdown by task type, and improvement recommendations. You can export it as a PDF or Excel too." },
  { title:"You're all set! 🎉", body:"That's everything! Nothing here is saved — when you leave, this demo resets fresh for the next person. When you're ready, go HOME and tap START SMED BOARD to plan a real changeover." },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const SB_URL = "https://sbahezjpxdsqvkhelvph.supabase.co";
const SB_KEY = "sb_publishable_wNZpA8aXUFFt696nY21vgw_wmlZ6a7E";
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SB_KEY,
  "Authorization": `Bearer ${SB_KEY}`,
  "Prefer": "return=representation",
};

// ── fetch with timeout (prevents infinite hang) ──────────────────────────────
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(t);
    return r;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────
async function sbGet(table) {
  const r = await fetchWithTimeout(`${SB_URL}/rest/v1/${table}?select=*&order=created.asc`, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(`${table} fetch failed: ${r.status}`);
  return r.json();
}
async function sbUpsert(table, rows) {
  const r = await fetchWithTimeout(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${table} upsert failed: ${r.status}`);
}
async function sbDelete(table, id) {
  const r = await fetchWithTimeout(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE", headers: SB_HEADERS,
  });
  if (!r.ok) throw new Error(`${table} delete failed: ${r.status}`);
}

// ── Convert between app shape and DB shape ────────────────────────────────────
function projectToRow(p) {
  return {
    id: p.id,
    name: p.name,
    created: p.created,
    notes: p.notes || "",
    folder_id: p.folderId || null,
    task_types: p.taskTypes || [],
    operators: p.operators || [],
  };
}
function rowToProject(r) {
  return {
    id: r.id,
    name: r.name,
    created: r.created,
    notes: r.notes || "",
    folderId: r.folder_id || null,
    taskTypes: r.task_types || [],
    operators: r.operators || [],
  };
}
function folderToRow(f) {
  return { id: f.id, name: f.name, icon: f.icon, color: f.color, created: f.created };
}

// ── Check if tables exist ──────────────────────────────────────────────────────
async function checkTablesExist() {
  try {
    const r = await fetchWithTimeout(`${SB_URL}/rest/v1/projects?select=id&limit=1`, { headers: SB_HEADERS }, 8000);
    return r.status !== 404 && r.status !== 400;
  } catch { return false; }
}

// ── Load all data from Supabase ───────────────────────────────────────────────
async function loadFromSupabase() {
  const [projectRows, folderRows] = await Promise.all([sbGet("projects"), sbGet("folders")]);
  return {
    projects: projectRows.map(rowToProject),
    folders: folderRows,
  };
}

// ── Local cache fallback ──────────────────────────────────────────────────────
const CACHE_KEY = "smed_cache_v4";
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}
function loadCache() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
const iSty = {
  background:"#12141C",border:"1px solid #2A2D3A",color:"#E2E8F0",
  fontFamily:"inherit",fontSize:14,padding:"10px 14px",borderRadius:8,
  outline:"none",width:"100%",boxSizing:"border-box",
};
const iconBtnSty = {
  background:"transparent",border:"none",color:"#4a5568",
  cursor:"pointer",padding:"4px",lineHeight:1,borderRadius:4,
  display:"flex",alignItems:"center",justifyContent:"center",
};

function Pill({color,children,style={}}) {
  return <span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:color+"2E",color,fontWeight:700,letterSpacing:"0.04em",...style}}>{children}</span>;
}
function Btn({onClick,color="#FF6B35",text="#0D0F14",children,full,style={},disabled=false,sm=false}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:sm?"8px 16px":"12px 24px",
      background:disabled?"#1E2130":color,
      border:"none",color:disabled?"#4a5568":text,
      fontFamily:"inherit",fontSize:sm?11:13,fontWeight:700,
      cursor:disabled?"not-allowed":"pointer",borderRadius:8,
      letterSpacing:"0.06em",transition:"all 0.18s",
      width:full?"100%":"auto",opacity:disabled?0.5:1,
      boxShadow:disabled?"none":`0 2px 12px ${color}44`,
      ...style
    }}>{children}</button>
  );
}
function Logo() {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{width:34,height:34,background:"linear-gradient(135deg,#FF6B35,#E17055)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#FFF",boxShadow:"0 2px 10px #FF6B3566"}}>S</div>
      <div>
        <div style={{fontSize:15,fontWeight:800,color:"#FFF",letterSpacing:"0.08em",lineHeight:1}}>SMED RUNNER</div>
        <div style={{fontSize:8,color:"#4a5568",letterSpacing:"0.2em"}}>LEAN CHANGEOVER TOOL</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ReportPanel({operators, taskTypes, onClose}) {
  const maxTime = Math.max(...operators.map(o=>o.tasks.reduce((s,t)=>s+t.duration,0)),1);
  const minTime = Math.min(...operators.map(o=>o.tasks.reduce((s,t)=>s+t.duration,0)));
  const allTasks = operators.flatMap(o=>o.tasks);
  const total = allTasks.reduce((s,t)=>s+t.duration,0);
  const efficiency = Math.round((minTime/maxTime)*100);
  const waste = operators.reduce((s,o)=>s+(maxTime-o.tasks.reduce((sum,t)=>sum+t.duration,0)),0);
  const plannedDowntime = allTasks.filter(t=>t.isWait).reduce((s,t)=>s+t.duration,0);

  function exportCSV() {
    const rows=[["Operator","Task","Type","Duration (min)","Start (min)"]];
    operators.forEach(op=>{
      let c=0; op.tasks.forEach(t=>{rows.push([op.name,t.isWait?"Waiting / Downtime":t.name,t.isWait?"Waiting":t.type,t.duration,c]);c+=t.duration;});
    });
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download="smed_plan.csv"; a.click();
  }

  return (
    <div style={{position:"fixed",inset:0,background:"#000c",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"#0D0F14",border:"1px solid #2A2D3A",borderRadius:12,width:"100%",maxWidth:580,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #1E2130",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#0D0F14",zIndex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:"#FFF",letterSpacing:"0.08em"}}>CHANGEOVER REPORT</div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={exportCSV} color="#4ECDC4" sm>↓ CSV</Btn>
            <button onClick={onClose} style={{...iconBtnSty,fontSize:18,color:"#4a5568"}}>✕</button>
          </div>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
          {/* KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
            {[["EFFICIENCY",efficiency+"%",efficiency>85?"#00B894":efficiency>60?"#FFE66D":"#E17055"],["MAX TIME",maxTime+"m","#FF6B35"],["IDLE GAP",waste+"m","#E17055"],["PLANNED WAIT",plannedDowntime+"m",WAIT_COLOR]].map(([l,v,c])=>(
              <div key={l} style={{background:"#080A0F",border:"1px solid #1E2130",borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:8,color:"#4a5568",letterSpacing:"0.14em",marginBottom:3}}>{l}</div>
                <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
              </div>
            ))}
          </div>
          {/* Type breakdown */}
          <div style={{background:"#080A0F",border:"1px solid #1E2130",borderRadius:8,padding:"14px"}}>
            <div style={{fontSize:9,color:"#4a5568",letterSpacing:"0.14em",marginBottom:10}}>TIME BY TYPE</div>
            {[...taskTypes, {name:"Waiting / Downtime",color:WAIT_COLOR,__wait:true}].map(tt=>{
              const tasks = tt.__wait ? allTasks.filter(t=>t.isWait) : allTasks.filter(t=>!t.isWait && t.type===tt.name);
              const time=tasks.reduce((s,t)=>s+t.duration,0);
              const pct=total>0?Math.round(time/total*100):0;
              if (tt.__wait && time===0) return null;
              return (
                <div key={tt.name} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{width:110,fontSize:10,color:tt.color,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tt.__wait?"⏸ ":""}{tt.name}</div>
                  <div style={{flex:1,background:"#1A1D26",borderRadius:2,height:8}}>
                    <div style={{width:pct+"%",height:"100%",background:tt.color,borderRadius:2,transition:"width 0.4s"}}/>
                  </div>
                  <div style={{fontSize:10,color:"#9CA3AF",minWidth:70,textAlign:"right"}}>{time}m · {pct}%</div>
                </div>
              );
            })}
          </div>
          {/* Operator table */}
          <div style={{background:"#080A0F",border:"1px solid #1E2130",borderRadius:8,padding:"14px",overflowX:"auto"}}>
            <div style={{fontSize:9,color:"#4a5568",letterSpacing:"0.14em",marginBottom:10}}>OPERATOR BREAKDOWN</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr>{["Operator","Tasks","Time","vs Max","Balance"].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"4px 8px",fontSize:8,color:"#4a5568",letterSpacing:"0.1em",borderBottom:"1px solid #1E2130",fontWeight:400}}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>{operators.map((op,i)=>{
                const t=op.tasks.reduce((s,tk)=>s+tk.duration,0);
                const pct=Math.round(t/maxTime*100);
                const isMax=t===maxTime;
                return (
                  <tr key={op.id} style={{borderBottom:"1px solid #1E2130"}}>
                    <td style={{padding:"7px 8px",color:OP_COLORS[i%10],fontWeight:700}}>{op.name}</td>
                    <td style={{padding:"7px 8px",color:"#9CA3AF"}}>{op.tasks.length}</td>
                    <td style={{padding:"7px 8px",color:isMax?"#FF6B35":"#E2E8F0",fontWeight:isMax?700:400}}>{t}m {isMax?"⚠":""}</td>
                    <td style={{padding:"7px 8px",color:"#4a5568",fontSize:10}}>{pct===100?"BOTTLENECK":"-"+(maxTime-t)+"m"}</td>
                    <td style={{padding:"7px 8px",minWidth:60}}>
                      <div style={{background:"#1A1D26",borderRadius:2,height:5}}>
                        <div style={{width:pct+"%",height:"100%",background:OP_COLORS[i%10],borderRadius:2}}/>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {/* Recommendations */}
          <div style={{background:"#080A0F",border:"1px solid #1E2130",borderRadius:8,padding:"14px"}}>
            <div style={{fontSize:9,color:"#4a5568",letterSpacing:"0.14em",marginBottom:10}}>SMED RECOMMENDATIONS</div>
            {[
              efficiency<100&&`Balance load: Move ${maxTime-minTime}m of tasks from the bottleneck to reach 100% efficiency.`,
              waste>10&&`${waste} minutes of idle time across operators — consider adding preparation tasks.`,
              efficiency>=95&&"✓ Excellent load balance across all operators.",
            ].filter(Boolean).map((m,i)=>(
              <div key={i} style={{display:"flex",gap:8,padding:"8px 10px",background:String(m).startsWith("✓")?"#0a1f0a":"#1a1020",border:"1px solid "+(String(m).startsWith("✓")?"#1a3a1a":"#2a1a2a"),borderRadius:6,marginBottom:6}}>
                <span style={{color:String(m).startsWith("✓")?"#00B894":"#FFE66D",flexShrink:0}}>{String(m).startsWith("✓")?"✓":"→"}</span>
                <span style={{fontSize:11,color:String(m).startsWith("✓")?"#00B894":"#C4A35A",lineHeight:1.5}}>{String(m).replace("✓ ","")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK CARD
// ─────────────────────────────────────────────────────────────────────────────
function TaskCard({task,opId,taskTypes,onDragStart,onDragOver,onDrop,onDragEnd,onTouchStart,onTouchMove,onTouchEnd,dragging,dragOver,tIdx,phase,runMinutes,taskStart,onDelete,onUpdate}) {
  const [editing,setEditing] = useState(false);
  const isActive = phase==="run"&&runMinutes>=taskStart&&runMinutes<taskStart+task.duration;
  const isDone   = phase==="run"&&runMinutes>=taskStart+task.duration;
  const isDraggingThis = dragging?.taskId===task.id;
  const isDropTarget   = dragOver?.opId===opId&&dragOver?.index===tIdx;
  const isWait = task.isWait;
  const tt = isWait ? {name:"Waiting",color:WAIT_COLOR} : (taskTypes.find(t=>t.name===task.type)||taskTypes[0]||{name:"",color:"#aaa"});
  const tc = tt.color;
  return (
    <>
      {isDropTarget&&<div data-opid={opId} data-tidx={tIdx} style={{height:4,background:"#4ECDC4",borderRadius:2,margin:"3px 0",boxShadow:"0 0 8px #4ECDC4"}}/>}
      <div
        draggable
        onDragStart={e=>onDragStart(e,task.id,opId)}
        onDragOver={e=>onDragOver(e,opId,tIdx)}
        onDrop={e=>{e.stopPropagation();onDrop(e,opId,tIdx);}}
        onDragEnd={onDragEnd}
        onTouchStart={e=>onTouchStart(e,task.id,opId)}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        data-opid={opId}
        data-tidx={tIdx}
        style={{
          background:isWait
            ? `repeating-linear-gradient(45deg, #20242E, #20242E 6px, #181C24 6px, #181C24 12px)`
            : (isDone?"#0d1f0d":isActive?tc+"22":isDraggingThis?"#1f2535":"#1A1F2B"),
          border:`1px ${isWait?"dashed":"solid"} ${isActive?tc:isDone?"#2a4a2a":isDraggingThis?"#4ECDC4":isWait?"#4a5160":"#2E3445"}`,
          borderRadius:8,padding:"10px 12px",marginBottom:7,cursor:"grab",opacity:isDraggingThis?0.35:1,
          boxShadow:isActive?`0 0 14px ${tc}55`:isDraggingThis?"0 0 12px #4ECDC444":"0 1px 3px #00000040",
          transition:"all 0.18s",userSelect:"none",touchAction:"none"
        }}>
        {editing?(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {!isWait&&<input value={task.name} onChange={e=>onUpdate("name",e.target.value)} style={{...iSty,fontSize:13,padding:"8px 11px"}} autoFocus/>}
            <div style={{display:"flex",gap:6}}>
              <input type="number" value={task.duration} min={1} max={120}
                onChange={e=>onUpdate("duration",Number(e.target.value))}
                style={{...iSty,width:64,fontSize:13,padding:"8px",color:"#FFE66D"}} autoFocus={isWait}/>
              {!isWait&&<select value={task.type} onChange={e=>onUpdate("type",e.target.value)}
                style={{...iSty,flex:1,fontSize:12,padding:"8px",color:tc}}>
                {taskTypes.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}
              </select>}
              {isWait&&<span style={{flex:1,fontSize:11,color:WAIT_COLOR,display:"flex",alignItems:"center",letterSpacing:"0.06em"}}>⏸ DOWNTIME (min)</span>}
              <Btn onClick={()=>setEditing(false)} color="#4ECDC4" sm>✓</Btn>
            </div>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,flexWrap:"wrap"}}>
                {isWait
                  ? <Pill color={WAIT_COLOR}>⏸ WAITING</Pill>
                  : <Pill color={tc}>{task.type}</Pill>}
                {isDone&&<span style={{fontSize:9,color:"#00D9A3",fontWeight:700}}>✓ DONE</span>}
                {isActive&&<span style={{fontSize:9,color:tc,animation:"blink 1s infinite",fontWeight:700}}>● {isWait?"IDLE":"ACTIVE"}</span>}
              </div>
              <div style={{fontSize:13,color:isWait?"#9aa4b8":(isDone?"#6a7a6a":"#F0F4FA"),lineHeight:1.4,wordBreak:"break-word",fontWeight:500,fontStyle:isWait?"italic":"normal"}}>{task.name}</div>
            </div>
            <span style={{fontSize:15,fontWeight:800,color:isWait?WAIT_COLOR:"#FFD93D",minWidth:34,textAlign:"right",flexShrink:0}}>{task.duration}m</span>
            <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
              <button onClick={()=>setEditing(true)} style={{...iconBtnSty,fontSize:14,color:"#8a94a8"}} title="Edit">✎</button>
              <button onClick={onDelete} style={{...iconBtnSty,fontSize:14,color:"#9a4040"}} title="Delete">✕</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK-START WIZARD
// ─────────────────────────────────────────────────────────────────────────────
function QuickStartWizard({onLaunch, onCancel}) {
  const [step, setStep] = useState(1); // 1=people 2=types 3=name
  const [count, setCount] = useState(2);
  const [types, setTypes] = useState(DEFAULT_TASK_TYPES.map(t=>({...t})));
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeColor, setNewTypeColor] = useState("#A8E6CF");
  const [projectName, setProjectName] = useState("");

  const PRESET_COLORS = ["#FF6B35","#4ECDC4","#FFE66D","#A8E6CF","#FF8B94","#6C5CE7","#00B894","#74B9FF","#FDCB6E","#E17055"];

  function addType() {
    if(!newTypeName.trim()) return;
    setTypes(t=>[...t,{name:newTypeName.trim(),color:newTypeColor}]);
    setNewTypeName(""); setNewTypeColor("#A8E6CF");
  }
  function removeType(name) { setTypes(t=>t.filter(x=>x.name!==name)); }

  function launch() {
    const name = projectName.trim()||"New Changeover";
    onLaunch(defaultProject(name, count, types));
  }

  return (
    <div style={{position:"fixed",inset:0,background:"#000d",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0D0F14",border:"1px solid #2A2D3A",borderRadius:16,width:"100%",maxWidth:460,overflow:"hidden"}}>
        {/* Progress bar */}
        <div style={{height:3,background:"#1E2130"}}>
          <div style={{width:(step/3*100)+"%",height:"100%",background:"linear-gradient(90deg,#FF6B35,#4ECDC4)",transition:"width 0.3s ease"}}/>
        </div>
        <div style={{padding:"20px 22px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#FFF",letterSpacing:"0.06em"}}>QUICK START</div>
              <div style={{fontSize:9,color:"#4a5568",marginTop:2}}>Step {step} of 3</div>
            </div>
            <button onClick={onCancel} style={{...iconBtnSty,fontSize:18,color:"#4a5568"}}>✕</button>
          </div>

          {/* STEP 1 — People */}
          {step===1&&(
            <div style={{animation:"fadeIn 0.2s ease"}}>
              <div style={{fontSize:22,fontWeight:800,color:"#FFF",marginBottom:6}}>How many people?</div>
              <div style={{fontSize:12,color:"#4a5568",marginBottom:24}}>Select the number of operators for this changeover.</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:24}}>
                {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                  <button key={n} onClick={()=>setCount(n)} style={{
                    padding:"14px 0",borderRadius:10,fontSize:18,fontWeight:800,
                    background:count===n?"#FF6B35":"#12141C",
                    border:`2px solid ${count===n?"#FF6B35":"#1E2130"}`,
                    color:count===n?"#FFF":"#4a5568",cursor:"pointer",
                    transition:"all 0.15s",boxShadow:count===n?"0 0 16px #FF6B3555":"none",
                    fontFamily:"inherit",
                  }}>{n}</button>
                ))}
              </div>
              <Btn onClick={()=>setStep(2)} color="#FF6B35" full>NEXT →</Btn>
            </div>
          )}

          {/* STEP 2 — Task Types */}
          {step===2&&(
            <div style={{animation:"fadeIn 0.2s ease"}}>
              <div style={{fontSize:22,fontWeight:800,color:"#FFF",marginBottom:6}}>Task types</div>
              <div style={{fontSize:12,color:"#4a5568",marginBottom:16}}>These are the categories for your tasks. Edit, remove or add your own.</div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16,maxHeight:200,overflowY:"auto"}}>
                {types.map(t=>(
                  <div key={t.name} style={{display:"flex",alignItems:"center",gap:10,background:"#12141C",border:"1px solid #1E2130",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:t.color,flexShrink:0}}/>
                    <span style={{flex:1,fontSize:13,color:"#E2E8F0",fontWeight:600}}>{t.name}</span>
                    {types.length>1&&<button onClick={()=>removeType(t.name)} style={{...iconBtnSty,fontSize:14,color:"#6a2020"}}>✕</button>}
                  </div>
                ))}
              </div>
              {/* Add custom type */}
              <div style={{background:"#12141C",border:"1px dashed #2A2D3A",borderRadius:8,padding:"12px",marginBottom:16}}>
                <div style={{fontSize:9,color:"#4a5568",letterSpacing:"0.12em",marginBottom:8}}>ADD CUSTOM TYPE</div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <input value={newTypeName} onChange={e=>setNewTypeName(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&addType()}
                    placeholder="Type name…" style={{...iSty,fontSize:12,padding:"8px 10px"}}/>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  {PRESET_COLORS.map(c=>(
                    <button key={c} onClick={()=>setNewTypeColor(c)} style={{width:22,height:22,borderRadius:"50%",background:c,border:`2px solid ${newTypeColor===c?"#FFF":"transparent"}`,cursor:"pointer",flexShrink:0,transition:"border 0.1s"}}/>
                  ))}
                </div>
                <Btn onClick={addType} color="#4ECDC4" full sm disabled={!newTypeName.trim()}>+ ADD TYPE</Btn>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={()=>setStep(1)} color="#1E2130" text="#9CA3AF" style={{flex:1}}>← BACK</Btn>
                <Btn onClick={()=>setStep(3)} color="#FF6B35" style={{flex:2}} disabled={types.length===0}>NEXT →</Btn>
              </div>
            </div>
          )}

          {/* STEP 3 — Name */}
          {step===3&&(
            <div style={{animation:"fadeIn 0.2s ease"}}>
              <div style={{fontSize:22,fontWeight:800,color:"#FFF",marginBottom:6}}>Name your project</div>
              <div style={{fontSize:12,color:"#4a5568",marginBottom:20}}>Give this changeover a name so you can find it later.</div>
              <input value={projectName} onChange={e=>setProjectName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&launch()}
                placeholder="e.g. Line A — Morning Shift"
                style={{...iSty,fontSize:14,padding:"12px 14px",marginBottom:16}}
                autoFocus/>
              {/* Summary */}
              <div style={{background:"#12141C",border:"1px solid #1E2130",borderRadius:8,padding:"12px 14px",marginBottom:20}}>
                <div style={{fontSize:9,color:"#4a5568",letterSpacing:"0.12em",marginBottom:8}}>SUMMARY</div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  <div><div style={{fontSize:8,color:"#4a5568"}}>OPERATORS</div><div style={{fontSize:20,fontWeight:800,color:"#FF6B35"}}>{count}</div></div>
                  <div><div style={{fontSize:8,color:"#4a5568"}}>TASK TYPES</div><div style={{fontSize:20,fontWeight:800,color:"#4ECDC4"}}>{types.length}</div></div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                  {types.map(t=><Pill key={t.name} color={t.color}>{t.name}</Pill>)}
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={()=>setStep(2)} color="#1E2130" text="#9CA3AF" style={{flex:1}}>← BACK</Btn>
                <Btn onClick={launch} color="#FF6B35" style={{flex:2}}>🚀 LAUNCH BOARD</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME / LANDING PAGE  —  with Location Folders
// ─────────────────────────────────────────────────────────────────────────────
const FOLDER_COLORS = ["#FF6B35","#4ECDC4","#6C5CE7","#00B894","#FFE66D","#FF8B94","#74B9FF","#FDCB6E","#E17055","#A8E6CF"];
const FOLDER_ICONS  = ["🏭","🏗️","🔧","⚙️","🏢","🛠️","📦","🚀","🔬","🏪"];

function ProjectCard({p, onOpen, onDelete, onDuplicate, onMoveToFolder, folders, style={}}) {
  const ops = p.operators||[];
  const mxT = Math.max(...ops.map(o=>o.tasks.reduce((s,t)=>s+t.duration,0)),1);
  const mnT = Math.min(...ops.map(o=>o.tasks.reduce((s,t)=>s+t.duration,0)));
  const eff = Math.round((mnT/mxT)*100);
  const [showMove, setShowMove] = useState(false);

  return (
    <div style={{background:"#0D0F14",border:"1px solid #1E2130",borderRadius:12,overflow:"visible",cursor:"pointer",transition:"all 0.2s",textAlign:"left",position:"relative",...style}}
      onClick={()=>onOpen(p.id)}
      onMouseEnter={e=>{e.currentTarget.style.borderColor="#FF6B35";e.currentTarget.style.transform="translateY(-2px)";}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor="#1E2130";e.currentTarget.style.transform="translateY(0)";}}>
      <div style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:"#FFF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
          <div style={{fontSize:9,color:"#4a5568",marginTop:2}}>{new Date(p.created).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:8,color:"#4a5568"}}>OPS</div>
            <div style={{fontSize:15,fontWeight:800,color:"#4ECDC4"}}>{ops.length}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:8,color:"#4a5568"}}>EFF</div>
            <div style={{fontSize:15,fontWeight:800,color:eff>85?"#00B894":eff>60?"#FFE66D":"#E17055"}}>{eff}%</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:3}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setShowMove(v=>!v)} title="Move to folder" style={{...iconBtnSty,fontSize:12}}>📁</button>
            <button onClick={()=>onDuplicate(p.id)} title="Duplicate" style={{...iconBtnSty,fontSize:12,color:"#4ECDC4"}}>⧉</button>
            <button onClick={()=>onDelete(p.id)} title="Delete" style={{...iconBtnSty,fontSize:12,color:"#6a2020"}}>🗑</button>
          </div>
        </div>
      </div>
      {/* operator bars */}
      <div style={{padding:"0 14px 10px",display:"flex",flexDirection:"column",gap:3}}>
        {ops.slice(0,3).map((o,oi)=>{
          const t=o.tasks.reduce((s,tk)=>s+tk.duration,0);
          return (
            <div key={o.id} style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:8,color:OP_COLORS[oi%10],minWidth:76,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.name}</span>
              <div style={{flex:1,background:"#1A1D26",borderRadius:2,height:3}}>
                <div style={{width:(t/mxT*100)+"%",height:"100%",background:OP_COLORS[oi%10],borderRadius:2}}/>
              </div>
              <span style={{fontSize:8,color:"#4a5568",minWidth:20}}>{t}m</span>
            </div>
          );
        })}
        {ops.length>3&&<span style={{fontSize:8,color:"#4a5568"}}>+{ops.length-3} more</span>}
      </div>
      {/* move-to-folder dropdown */}
      {showMove&&(
        <div style={{position:"absolute",right:0,top:"100%",zIndex:50,background:"#0D0F14",border:"1px solid #2A2D3A",borderRadius:10,padding:8,minWidth:180,boxShadow:"0 8px 32px #000a"}}
          onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:9,color:"#4a5568",letterSpacing:"0.12em",padding:"4px 6px 6px"}}>MOVE TO FOLDER</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <button onClick={()=>{onMoveToFolder(p.id,null);setShowMove(false);}}
              style={{...iconBtnSty,justifyContent:"flex-start",gap:8,padding:"6px 8px",width:"100%",fontSize:11,color:!p.folderId?"#FF6B35":"#9CA3AF",background:!p.folderId?"#FF6B3514":"transparent",borderRadius:6}}>
              📋 Uncategorised {!p.folderId&&"✓"}
            </button>
            {folders.map(f=>(
              <button key={f.id} onClick={()=>{onMoveToFolder(p.id,f.id);setShowMove(false);}}
                style={{...iconBtnSty,justifyContent:"flex-start",gap:8,padding:"6px 8px",width:"100%",fontSize:11,color:p.folderId===f.id?f.color:"#9CA3AF",background:p.folderId===f.id?f.color+"14":"transparent",borderRadius:6}}>
                <span>{f.icon}</span><span style={{flex:1,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                {p.folderId===f.id&&<span style={{color:f.color}}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HomePage({projects, folders, onStartNew, onOpenProject, onDeleteProject,
  onDuplicateProject, onMoveToFolder, onCreateFolder, onDeleteFolder, onRenameFolder,
  saveIndicator, syncing, onRefresh, dbReady, onStartDemo}) {
  const [showContinue, setShowContinue] = useState(false);
  const [openFolders,  setOpenFolders]  = useState({}); // folderId -> bool
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderIcon, setNewFolderIcon] = useState("🏭");
  const [newFolderColor,setNewFolderColor]= useState("#FF6B35");
  const [renamingFolder,setRenamingFolder]= useState(null);
  const [renameVal,     setRenameVal]     = useState("");
  const [showTutorialAsk, setShowTutorialAsk] = useState(false);

  function toggleFolder(id) { setOpenFolders(s=>({...s,[id]:!s[id]})); }

  // split projects
  const uncategorised = projects.filter(p=>!p.folderId);

  function createFolder() {
    if (!newFolderName.trim()) return;
    onCreateFolder({ id:uid(), name:newFolderName.trim(), icon:newFolderIcon, color:newFolderColor, created:Date.now() });
    setNewFolderName(""); setShowNewFolder(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#0B0E15",color:"#E8EDF5",fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column"}}>
      <style>{globalCSS}</style>
      {/* Nav */}
      <div style={{padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #1E2130"}}>
        <Logo/>
      </div>

      {/* Hero */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"36px 22px 24px",textAlign:"center"}}>
        <Pill color="#FF6B35" style={{marginBottom:12}}>LEAN MANUFACTURING TOOL</Pill>
        <h1 style={{fontSize:"clamp(26px,5vw,48px)",fontWeight:900,color:"#FFF",margin:"0 0 10px",letterSpacing:"0.04em",lineHeight:1.1}}>
          Single Minute<br/><span style={{color:"#FF6B35"}}>Exchange of Die</span>
        </h1>
        <p style={{fontSize:"clamp(11px,1.8vw,14px)",color:"#4a5568",maxWidth:380,lineHeight:1.7,marginBottom:32}}>
          Plan, balance and simulate multi-operator changeovers.
        </p>
        <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:320}}>
          <Btn onClick={onStartNew} color="#FF6B35" full style={{padding:"15px 24px",borderRadius:12,fontSize:"clamp(12px,2.5vw,14px)"}}>
            ▶ START SMED BOARD
          </Btn>
          <Btn onClick={()=>setShowContinue(v=>!v)} color="#12141C" text="#E2E8F0" full
            style={{padding:"15px 24px",borderRadius:12,fontSize:"clamp(12px,2.5vw,14px)",border:"1px solid #2A2D3A",boxShadow:"none"}}>
            {showContinue?"▲ HIDE PROJECTS":"◈ CONTINUE A PROJECT"}
          </Btn>
          <Btn onClick={()=>setShowTutorialAsk(true)} color="#12141C" text="#4ECDC4" full
            style={{padding:"15px 24px",borderRadius:12,fontSize:"clamp(12px,2.5vw,14px)",border:"1px solid #4ECDC444",boxShadow:"none"}}>
            🎓 TUTORIAL / TEST
          </Btn>
        </div>
      </div>

      {/* Tutorial ask modal */}
      {showTutorialAsk&&(
        <div style={{position:"fixed",inset:0,background:"#000d",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setShowTutorialAsk(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#11141D",border:"1px solid #4ECDC444",borderRadius:16,width:"100%",maxWidth:420,padding:"28px 26px",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:10}}>🎓</div>
            <div style={{fontSize:18,fontWeight:800,color:"#FFF",marginBottom:8}}>Tutorial / Test</div>
            <div style={{fontSize:13,color:"#9aa4b8",lineHeight:1.6,marginBottom:6}}>
              Would you like to be guided through all the functions?
            </div>
            <div style={{fontSize:11,color:"#5a6478",lineHeight:1.6,marginBottom:22}}>
              This opens a demo "Tea &amp; Toast" changeover. Nothing is saved — it resets for the next person when you leave.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <Btn onClick={()=>{setShowTutorialAsk(false);onStartDemo(true);}} color="#4ECDC4" full
                style={{padding:"13px",borderRadius:10}}>
                ✓ YES — GUIDE ME THROUGH IT
              </Btn>
              <Btn onClick={()=>{setShowTutorialAsk(false);onStartDemo(false);}} color="#FF6B35" full
                style={{padding:"13px",borderRadius:10}}>
                ✗ NO — JUST LET ME PLAY
              </Btn>
              <button onClick={()=>setShowTutorialAsk(false)}
                style={{background:"transparent",border:"none",color:"#5a6478",fontFamily:"inherit",fontSize:11,cursor:"pointer",padding:"6px",letterSpacing:"0.08em"}}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Library */}
      {showContinue&&(
        <div style={{flex:1,padding:"0 22px 32px",maxWidth:600,width:"100%",margin:"0 auto",animation:"fadeIn 0.25s ease"}}>

          {/* Library header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:10,color:"#4a5568",letterSpacing:"0.14em"}}>PROJECT LIBRARY · {projects.length} BOARDS</div>
            <button onClick={()=>setShowNewFolder(v=>!v)}
              style={{...iconBtnSty,background:"#12141C",border:"1px solid #1E2130",borderRadius:7,padding:"6px 12px",fontSize:11,color:"#4ECDC4",letterSpacing:"0.08em",gap:5}}>
              + NEW FOLDER
            </button>
          </div>

          {/* New folder form */}
          {showNewFolder&&(
            <div style={{background:"#0D0F14",border:"1px solid #4ECDC444",borderRadius:12,padding:16,marginBottom:16,animation:"fadeIn 0.2s ease"}}>
              <div style={{fontSize:10,color:"#4ECDC4",letterSpacing:"0.12em",marginBottom:10}}>NEW LOCATION FOLDER</div>
              <input placeholder="e.g. Manchester Site, Line 4, Warehouse B…"
                value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&createFolder()}
                style={{...iSty,fontSize:13,marginBottom:10}} autoFocus/>
              {/* Icon picker */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {FOLDER_ICONS.map(ic=>(
                  <button key={ic} onClick={()=>setNewFolderIcon(ic)}
                    style={{width:34,height:34,fontSize:18,background:newFolderIcon===ic?"#FF6B3522":"#12141C",border:`1px solid ${newFolderIcon===ic?"#FF6B35":"#1E2130"}`,borderRadius:8,cursor:"pointer",transition:"all 0.15s"}}>
                    {ic}
                  </button>
                ))}
              </div>
              {/* Colour picker */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {FOLDER_COLORS.map(c=>(
                  <button key={c} onClick={()=>setNewFolderColor(c)}
                    style={{width:22,height:22,borderRadius:"50%",background:c,border:`2px solid ${newFolderColor===c?"#FFF":"transparent"}`,cursor:"pointer",transition:"border 0.1s"}}/>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={createFolder} color="#4ECDC4" sm style={{flex:1}} disabled={!newFolderName.trim()}>CREATE FOLDER</Btn>
                <Btn onClick={()=>setShowNewFolder(false)} color="#1E2130" text="#9CA3AF" sm>✕</Btn>
              </div>
            </div>
          )}

          {/* Folders */}
          {folders.map((f,fi)=>{
            const folderProjects = projects.filter(p=>p.folderId===f.id);
            const isOpen = openFolders[f.id] !== false; // default open
            return (
              <div key={f.id} style={{marginBottom:12}}>
                {/* Folder header */}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#0D0F14",border:`1px solid ${f.color}33`,borderRadius:isOpen&&folderProjects.length>0?"10px 10px 0 0":"10px",cursor:"pointer",transition:"all 0.2s"}}
                  onClick={()=>toggleFolder(f.id)}>
                  <div style={{width:32,height:32,background:f.color+"22",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                    {f.icon}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    {renamingFolder===f.id?(
                      <input value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                        onBlur={()=>{onRenameFolder(f.id,renameVal);setRenamingFolder(null);}}
                        onKeyDown={e=>{if(e.key==="Enter"){onRenameFolder(f.id,renameVal);setRenamingFolder(null);}}}
                        onClick={e=>e.stopPropagation()}
                        style={{...iSty,fontSize:12,fontWeight:700,padding:"3px 6px"}} autoFocus/>
                    ):(
                      <div style={{fontSize:13,fontWeight:700,color:f.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                    )}
                    <div style={{fontSize:9,color:"#4a5568",marginTop:1}}>{folderProjects.length} project{folderProjects.length!==1?"s":""}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>{setRenamingFolder(f.id);setRenameVal(f.name);}}
                      style={{...iconBtnSty,fontSize:12,color:"#4a5568"}}>✎</button>
                    <button onClick={()=>onDeleteFolder(f.id)}
                      style={{...iconBtnSty,fontSize:12,color:"#6a2020"}}>🗑</button>
                    <span style={{fontSize:14,color:"#4a5568",marginLeft:4}}>{isOpen?"▲":"▼"}</span>
                  </div>
                </div>
                {/* Folder contents */}
                {isOpen&&(
                  <div style={{background:"#080A0F",border:`1px solid ${f.color}22`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:10,display:"flex",flexDirection:"column",gap:8}}>
                    {folderProjects.length===0?(
                      <div style={{padding:"14px",textAlign:"center",fontSize:11,color:"#2A2D3A",letterSpacing:"0.08em"}}>
                        No projects here yet — move boards into this folder using the 📁 button
                      </div>
                    ):(
                      folderProjects.map(p=>(
                        <ProjectCard key={p.id} p={p} folders={folders}
                          onOpen={onOpenProject} onDelete={onDeleteProject}
                          onDuplicate={onDuplicateProject} onMoveToFolder={onMoveToFolder}/>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Uncategorised */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#0D0F14",border:"1px solid #2A2D3A",borderRadius:uncategorised.length>0?"10px 10px 0 0":"10px"}}>
              <div style={{width:32,height:32,background:"#2A2D3A33",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📋</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#9CA3AF"}}>Uncategorised</div>
                <div style={{fontSize:9,color:"#4a5568",marginTop:1}}>{uncategorised.length} project{uncategorised.length!==1?"s":""}</div>
              </div>
            </div>
            {uncategorised.length>0&&(
              <div style={{background:"#080A0F",border:"1px solid #2A2D3A",borderTop:"none",borderRadius:"0 0 10px 10px",padding:10,display:"flex",flexDirection:"column",gap:8}}>
                {uncategorised.map(p=>(
                  <ProjectCard key={p.id} p={p} folders={folders}
                    onOpen={onOpenProject} onDelete={onDeleteProject}
                    onDuplicate={onDuplicateProject} onMoveToFolder={onMoveToFolder}/>
                ))}
              </div>
            )}
          </div>

          {projects.length===0&&!showNewFolder&&(
            <div style={{padding:24,background:"#0D0F14",border:"1px solid #1E2130",borderRadius:12,color:"#4a5568",fontSize:12,textAlign:"center"}}>
              No saved projects yet. Start a new board to create one.
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{padding:"14px 22px",borderTop:"1px solid #1E2130",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
        <span style={{fontSize:9,color:"#2A2D3A",letterSpacing:"0.1em"}}>SMED RUNNER · LEAN WAYS OF WORKING</span>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {saveIndicator&&<span style={{fontSize:9,color:"#00B894",animation:"fadeIn 0.2s ease"}}>✓ Saved to database</span>}
          {!saveIndicator&&dbReady&&<span style={{fontSize:9,color:"#2A2D3A"}}>🔗 Shared database · auto-syncs every 30s</span>}
          <button onClick={onRefresh} title="Sync now" style={{...iconBtnSty,fontSize:10,color:"#4a5568",background:"#12141C",border:"1px solid #1E2130",borderRadius:5,padding:"4px 10px",letterSpacing:"0.08em"}}>
            {syncing?"⏳":"↻"} SYNC
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
function SMEDAppInner() {
  const [projects,setProjects]   = useState([]);
  const [folders, setFolders]    = useState([]);
  const [activeId,setActiveId]   = useState(null);
  const [loaded,setLoaded]       = useState(false);
  const [dbReady,setDbReady]     = useState(true);  // false = tables not created yet
  const [dbError,setDbError]     = useState(null);  // network error message
  const [screen,setScreen]       = useState("home");
  const [showWizard,setShowWizard]   = useState(false);
  const [showReport,setShowReport]   = useState(false);
  const [showAddTask,setShowAddTask] = useState(null);
  const [newTask,setNewTask]         = useState({name:"",duration:5,type:""});
  const [dragging,setDragging]       = useState(null);
  const [dragOver,setDragOver]       = useState(null);
  const [view,setView]   = useState("board"); // board | gantt
  const [phase,setPhase] = useState("plan");
  const [runTime,setRunTime] = useState(0);
  const [running,setRunning] = useState(false);
  const [finishTimes,setFinishTimes] = useState({});
  const timerRef = useRef(null);
  const saveTimer = useRef(null);
  const [showTemplPicker,setShowTemplPicker] = useState(null);
  const [showExport,setShowExport]           = useState(false);
  const [importStatus,setImportStatus]       = useState(null); // null | "ok" | "err"
  const [importMsg,setImportMsg]             = useState("");
  const ganttRef  = useRef(null);
  const xlsxReady = useRef(false);
  const [demoProject,setDemoProject] = useState(null); // holds the temporary demo board
  const [tutorialStep,setTutorialStep] = useState(null); // null = no tutorial, 0+ = step index

  // activeProject is either the demo (if active) or a real saved project
  const activeProject = demoProject || projects.find(p=>p.id===activeId)||null;
  const operators = activeProject?.operators||[];
  const taskTypes = activeProject?.taskTypes||DEFAULT_TASK_TYPES;
  const maxTime = operators.length>0?Math.max(...operators.map(o=>o.tasks.reduce((s,t)=>s+t.duration,0)),1):1;
  const minTime = operators.length>0?Math.min(...operators.map(o=>o.tasks.reduce((s,t)=>s+t.duration,0))):0;
  const efficiency = Math.round((minTime/maxTime)*100);
  const runMinutes = runTime/60;
  const allDone = phase==="run"&&operators.length>0&&operators.every(op=>runMinutes>=op.tasks.reduce((s,t)=>s+t.duration,0));

  // ── load from Supabase on mount ──────────────────────────────────────────────
  useEffect(() => {
    let done = false;
    // Hard safety net: never stay on loading screen more than 10s
    const failsafe = setTimeout(() => {
      if (!done) { setDbError("Database is slow to respond — showing offline data. Tap ↻ SYNC to retry."); setLoaded(true); }
    }, 10000);

    async function init() {
      // 1. Show cached data immediately so UI isn't blank
      const cache = loadCache();
      if (cache?.projects?.length) {
        setProjects(cache.projects);
        setFolders(cache.folders || []);
        setActiveId(cache.activeId || cache.projects[0]?.id || null);
      }
      // 2. Try to load live data from Supabase
      try {
        const data = await loadFromSupabase();
        setProjects(data.projects);
        setFolders(data.folders || []);
        if (!cache?.activeId) setActiveId(data.projects[0]?.id || null);
        saveCache({ projects: data.projects, folders: data.folders, activeId: cache?.activeId || data.projects[0]?.id || null });
        setDbError(null);
        setDbReady(true);
      } catch(e) {
        // Could be: tables missing, bad key, network down, or sandbox blocking
        const msg = String(e?.message || e);
        if (msg.includes("404") || msg.includes("400")) {
          setDbReady(false); // show setup screen
        } else {
          setDbError("Working offline — the shared database can't be reached from this preview. Once hosted at a real web address it will connect automatically. Your work is saved on this device meanwhile.");
        }
      }
      done = true;
      clearTimeout(failsafe);
      setLoaded(true);
    }
    init();
    return () => clearTimeout(failsafe);
  }, []);

  // ── real-time polling: refresh from Supabase every 30s ──────────────────────
  useEffect(() => {
    if (!loaded || !dbReady) return;
    const poll = setInterval(async () => {
      try {
        const data = await loadFromSupabase();
        setProjects(data.projects);
        setFolders(data.folders || []);
        saveCache({ projects: data.projects, folders: data.folders || [], activeId });
      } catch {}
    }, 30000);
    return () => clearInterval(poll);
  }, [loaded, dbReady]);

  // ── manual refresh ────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  async function manualRefresh() {
    if (!dbReady) return;
    setSyncing(true);
    try {
      const data = await loadFromSupabase();
      setProjects(data.projects);
      setFolders(data.folders || []);
      saveCache({ projects: data.projects, folders: data.folders || [], activeId });
      setDbError(null);
    } catch(e) {
      setDbError("Could not connect to database.");
    }
    setSyncing(false);
  }

  useEffect(()=>{ if(newTask.type===""&&taskTypes.length>0) setNewTask(n=>({...n,type:taskTypes[0].name})); },[taskTypes]);

  // ── helpers: write to Supabase + update local state ──────────────────────────
  function mutateProject(id,fn) {
    // Demo board: mutate in memory only, never touch DB
    if (demoProject && id === demoProject.id) {
      setDemoProject(p => ({...p, ...fn(p)}));
      return;
    }
    setProjects(ps => {
      const next = ps.map(p => p.id===id ? {...p,...fn(p)} : p);
      const updated = next.find(p=>p.id===id);
      if (updated && dbReady) sbUpsert("projects",[projectToRow(updated)]).catch(()=>{});
      saveCache({projects:next, folders, activeId});
      return next;
    });
  }
  function mutateOps(fn) {
    if (demoProject) { setDemoProject(p=>({...p, operators:fn(p.operators)})); return; }
    mutateProject(activeId,p=>({operators:fn(p.operators)}));
  }

  // ── tutorial / demo ───────────────────────────────────────────────────────────
  function startDemo(withTutorial) {
    const demo = makeDemoProject();
    setDemoProject(demo);
    setActiveId(null);
    setView("board"); setPhase("plan"); resetRun();
    setNewTask({name:"",duration:5,type:demo.taskTypes[0]?.name||""});
    setTutorialStep(withTutorial ? 0 : null);
    setScreen("board");
  }
  function exitDemo() {
    setDemoProject(null);
    setTutorialStep(null);
    setScreen("home");
    resetRun();
  }

  // ── folder management ─────────────────────────────────────────────────────────
  function createFolder(f) {
    setFolders(fs => {
      const next = [...fs, f];
      if (dbReady) sbUpsert("folders",[folderToRow(f)]).catch(()=>{});
      saveCache({projects, folders:next, activeId});
      return next;
    });
  }
  function deleteFolder(fid) {
    setFolders(fs => {
      const next = fs.filter(f=>f.id!==fid);
      if (dbReady) sbDelete("folders",fid).catch(()=>{});
      saveCache({projects, folders:next, activeId});
      return next;
    });
    setProjects(ps => {
      const next = ps.map(p=>p.folderId===fid?{...p,folderId:null}:p);
      // update affected projects in DB
      if (dbReady) next.filter(p=>p.folderId===null&&projects.find(x=>x.id===p.id)?.folderId===fid)
        .forEach(p=>sbUpsert("projects",[projectToRow(p)]).catch(()=>{}));
      return next;
    });
  }
  function renameFolder(fid,name) {
    setFolders(fs => {
      const next = fs.map(f=>f.id!==fid?f:{...f,name});
      const updated = next.find(f=>f.id===fid);
      if (updated && dbReady) sbUpsert("folders",[folderToRow(updated)]).catch(()=>{});
      saveCache({projects, folders:next, activeId});
      return next;
    });
  }
  function moveToFolder(pid, folderId) {
    setProjects(ps => {
      const next = ps.map(p=>p.id!==pid?p:{...p,folderId:folderId||null});
      const updated = next.find(p=>p.id===pid);
      if (updated && dbReady) sbUpsert("projects",[projectToRow(updated)]).catch(()=>{});
      saveCache({projects:next, folders, activeId});
      return next;
    });
  }

  function launchProject(p) {
    setProjects(ps => {
      const next = [...ps, p];
      if (dbReady) sbUpsert("projects",[projectToRow(p)]).catch(()=>{});
      saveCache({projects:next, folders, activeId:p.id});
      return next;
    });
    setActiveId(p.id);
    setShowWizard(false); setScreen("board"); resetRun();
    setNewTask({name:"",duration:5,type:p.taskTypes[0]?.name||""});
  }
  function openProject(id) {
    setActiveId(id); setScreen("board"); resetRun();
    const p=projects.find(x=>x.id===id);
    if(p) setNewTask({name:"",duration:5,type:p.taskTypes[0]?.name||""});
  }
  function deleteProject(id) {
    setProjects(ps => {
      const next = ps.filter(p=>p.id!==id);
      if (dbReady) sbDelete("projects",id).catch(()=>{});
      saveCache({projects:next, folders, activeId});
      return next;
    });
    if(activeId===id){ setActiveId(null); setScreen("home"); }
  }
  function duplicateProject(id) {
    const src=projects.find(p=>p.id===id); if(!src) return;
    const clone={...JSON.parse(JSON.stringify(src)),id:uid(),name:src.name+" (copy)",created:Date.now()};
    clone.operators=clone.operators.map(o=>({...o,id:uid(),tasks:o.tasks.map(t=>({...t,id:uid()}))}));
    setProjects(ps => {
      const next=[...ps,clone];
      if (dbReady) sbUpsert("projects",[projectToRow(clone)]).catch(()=>{});
      saveCache({projects:next, folders, activeId});
      return next;
    });
  }

  // ── save indicator (fires on any project/folder change) ──────────────────────
  const [saveIndicator,setSaveIndicator] = useState(false);
  useEffect(()=>{
    if(!loaded) return;
    setSaveIndicator(true);
    const t=setTimeout(()=>setSaveIndicator(false),1800);
    return ()=>clearTimeout(t);
  },[projects,folders]);

  function addOperator()        { mutateOps(ops=>[...ops,blankOperator(ops.length)]); }
  function removeOperator(opId) { if(operators.length>1) mutateOps(ops=>ops.filter(o=>o.id!==opId)); }
  function updateOpName(opId,n) { mutateOps(ops=>ops.map(o=>o.id!==opId?o:{...o,name:n})); }
  function updateNotes(notes)   { mutateProject(activeId,()=>({notes})); }

  function addTask(opId) {
    if(!newTask.name.trim()) return;
    const type = newTask.type||taskTypes[0]?.name||"";
    mutateOps(ops=>ops.map(o=>o.id!==opId?o:{...o,tasks:[...o.tasks,{...newTask,type,id:uid()}]}));
    setNewTask(n=>({...n,name:"",duration:5})); setShowAddTask(null);
  }
  function addTemplateToOp(opId, tasks) {
    const mapped = tasks.map(t=>{
      const matched = taskTypes.find(tt=>tt.name===t.type);
      return {...t, id:uid(), type: matched?t.type:(taskTypes[0]?.name||t.type)};
    });
    mutateOps(ops=>ops.map(o=>o.id!==opId?o:{...o,tasks:[...o.tasks,...mapped]}));
    setShowTemplPicker(null);
  }
  function addWait(opId) {
    mutateOps(ops=>ops.map(o=>o.id!==opId?o:{...o,tasks:[...o.tasks, makeWait(5)]}));
  }
  function deleteTask(opId,taskId)     { mutateOps(ops=>ops.map(o=>o.id!==opId?o:{...o,tasks:o.tasks.filter(t=>t.id!==taskId)})); }
  function updateTask(opId,taskId,f,v) { mutateOps(ops=>ops.map(o=>o.id!==opId?o:{...o,tasks:o.tasks.map(t=>t.id!==taskId?t:{...t,[f]:f==="duration"?Number(v):v})})); }

  // ── unified mouse + touch drag ──────────────────────────────────────────────
  const dragState = useRef(null); // { taskId, fromOpId, ghost }

  function commitMove(toOpId, toIndex) {
    if (!dragState.current) return;
    const { taskId, fromOpId } = dragState.current;
    mutateOps(ops => {
      if (fromOpId === toOpId) {
        return ops.map(o => {
          if (o.id !== fromOpId) return o;
          const tasks = [...o.tasks];
          const fi = tasks.findIndex(t => t.id === taskId);
          const [mv] = tasks.splice(fi, 1);
          tasks.splice(toIndex, 0, mv);
          return { ...o, tasks };
        });
      }
      let mv;
      const next = ops.map(o => {
        if (o.id !== fromOpId) return o;
        return { ...o, tasks: o.tasks.filter(t => { if (t.id === taskId) { mv = t; return false; } return true; }) };
      });
      return next.map(o => { if (o.id !== toOpId) return o; const tasks = [...o.tasks]; tasks.splice(toIndex, 0, mv); return { ...o, tasks }; });
    });
    setDragging(null); setDragOver(null);
    dragState.current = null;
  }

  // ── mouse drag (desktop) ──
  const onDragStart = useCallback((e, taskId, fromOpId) => {
    dragState.current = { taskId, fromOpId };
    setDragging({ taskId, fromOpId });
    e.dataTransfer.effectAllowed = "move";
  }, []);
  const onDragOver = useCallback((e, opId, index) => { e.preventDefault(); setDragOver({ opId, index }); }, []);
  const onDragEnd  = useCallback(() => { setDragging(null); setDragOver(null); dragState.current = null; }, []);
  const onDrop = useCallback((e, toOpId, toIndex) => { e.preventDefault(); commitMove(toOpId, toIndex); }, []);

  // ── touch drag (iOS / Android) ──
  const touchLong = useRef(null);

  const onTouchStart = useCallback((e, taskId, fromOpId) => {
    // Long-press 200ms to initiate drag
    const touch = e.touches[0];
    touchLong.current = setTimeout(() => {
      dragState.current = { taskId, fromOpId };
      setDragging({ taskId, fromOpId });
      // haptic if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 200);
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!dragState.current) { clearTimeout(touchLong.current); return; }
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    // Walk up DOM to find a task-drop-zone or op-drop-zone
    let node = el;
    while (node && node !== document.body) {
      const opId   = node.dataset?.opid;
      const tIdx   = node.dataset?.tidx;
      if (opId !== undefined) {
        setDragOver({ opId, index: tIdx !== undefined ? Number(tIdx) : 9999 });
        return;
      }
      node = node.parentElement;
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    clearTimeout(touchLong.current);
    if (!dragState.current) return;
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    let node = el;
    let toOpId = null, toIndex = 9999;
    while (node && node !== document.body) {
      if (node.dataset?.opid) { toOpId = node.dataset.opid; toIndex = node.dataset.tidx !== undefined ? Number(node.dataset.tidx) : 9999; break; }
      node = node.parentElement;
    }
    if (toOpId) commitMove(toOpId, toIndex);
    else { setDragging(null); setDragOver(null); dragState.current = null; }
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const prevent = e => e.preventDefault();
    document.addEventListener("touchmove", prevent, { passive: false });
    return () => document.removeEventListener("touchmove", prevent);
  }, [!!dragging]);

  function toggleRun(){
    if(running){ clearInterval(timerRef.current); setRunning(false); }
    else{
      setRunning(true);
      timerRef.current=setInterval(()=>{
        setRunTime(t=>{
          const next=t+1; const nextMin=next/60;
          setFinishTimes(ft=>{
            const u={...ft};
            operators.forEach(op=>{ if(!u[op.id]){ const ot=op.tasks.reduce((s,tk)=>s+tk.duration,0); if(nextMin>=ot) u[op.id]=nextMin.toFixed(1); } });
            return u;
          });
          if(next>=maxTime*60+60){ clearInterval(timerRef.current); setRunning(false); return next; }
          return next;
        });
      },80);
    }
  }
  function resetRun(){ clearInterval(timerRef.current); setRunning(false); setRunTime(0); setFinishTimes({}); }

  // ── load SheetJS on demand ──────────────────────────────────────────────────
  function ensureXLSX() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) { resolve(window.XLSX); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload  = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error("Failed to load SheetJS"));
      document.head.appendChild(s);
    });
  }

  // ── load jsPDF on demand ────────────────────────────────────────────────────
  function ensureJsPDF() {
    return new Promise((resolve, reject) => {
      if (window.jspdf) { resolve(window.jspdf.jsPDF); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload  = () => resolve(window.jspdf.jsPDF);
      s.onerror = () => reject(new Error("Failed to load jsPDF"));
      document.head.appendChild(s);
    });
  }

  // ── Export Gantt as PDF ─────────────────────────────────────────────────────
  async function exportGanttPDF() {
    try {
      const JsPDF = await ensureJsPDF();
      const doc = new JsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

      const PW = 277, PH = 190; // usable A4 landscape mm
      const LEFT = 48, TOP = 28, BOTTOM = 20;
      const chartH = PH - TOP - BOTTOM;
      const chartW = PW - LEFT - 10;
      const colW = chartW / operators.length;
      const totalMin = maxTime + 2;
      const pixPerMin = chartH / totalMin;

      // background
      doc.setFillColor(8, 10, 15);
      doc.rect(0, 0, PW + 20, PH + 20, "F");

      // title
      doc.setFont("helvetica","bold");
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text("SMED RUNNER — GANTT CHART", 10, 10);
      doc.setFontSize(8);
      doc.setTextColor(74, 85, 104);
      doc.text(activeProject.name, 10, 16);
      doc.text(new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}), 10, 21);

      // time axis labels
      doc.setFontSize(7);
      doc.setTextColor(74, 85, 104);
      for (let t = 0; t <= totalMin; t += 5) {
        const y = TOP + (t / totalMin) * chartH;
        doc.text(t + "m", LEFT - 8, y + 1);
        doc.setDrawColor(30, 33, 48);
        doc.setLineWidth(0.2);
        doc.line(LEFT, y, LEFT + chartW, y);
      }

      // target line (fastest operator)
      const targetY = TOP + (minTime / totalMin) * chartH;
      doc.setDrawColor(0, 184, 148, 0.4);
      doc.setLineWidth(0.4);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(LEFT, targetY, LEFT + chartW, targetY);
      doc.setLineDashPattern([], 0);

      // operator columns
      operators.forEach((op, opIdx) => {
        const x = LEFT + opIdx * colW;
        const opColor = OP_COLORS[opIdx % 10];
        const r = parseInt(opColor.slice(1,3),16);
        const g = parseInt(opColor.slice(3,5),16);
        const b = parseInt(opColor.slice(5,7),16);

        // column bg alternating
        if (opIdx % 2 === 0) {
          doc.setFillColor(13, 15, 20);
          doc.rect(x, TOP, colW, chartH, "F");
        }

        // operator header
        doc.setFillColor(r, g, b, 0.15);
        doc.rect(x, TOP - 10, colW, 10, "F");
        doc.setFont("helvetica","bold");
        doc.setFontSize(8);
        doc.setTextColor(r, g, b);
        doc.text(op.name.slice(0, 14), x + 2, TOP - 3);
        const opTime = op.tasks.reduce((s,t) => s+t.duration, 0);
        doc.setFontSize(7);
        doc.text(opTime + "m", x + colW - 8, TOP - 3);

        // task blocks
        let cursor = 0;
        op.tasks.forEach(task => {
          const ty = TOP + (cursor / totalMin) * chartH;
          const th = (task.duration / totalMin) * chartH;
          const isWait = task.isWait;
          const tt = isWait ? { color: WAIT_COLOR } : (taskTypes.find(t => t.name === task.type) || { color:"#999999" });
          const tc = tt.color;
          const tr2 = parseInt(tc.slice(1,3),16);
          const tg2 = parseInt(tc.slice(3,5),16);
          const tb2 = parseInt(tc.slice(5,7),16);

          // block fill (waits are lighter/dashed-look)
          doc.setFillColor(tr2, tg2, tb2, isWait ? 0.25 : 0.5);
          doc.setDrawColor(tr2, tg2, tb2);
          doc.setLineWidth(isWait ? 0.5 : 0.3);
          doc.roundedRect(x + 1, ty + 0.5, colW - 2, Math.max(th - 1, 1.5), 1, 1, "FD");

          // task name (clip to block height)
          if (th > 4) {
            doc.setFont("helvetica", isWait ? "italic" : "normal");
            doc.setFontSize(Math.min(6.5, th * 0.5));
            doc.setTextColor(255, 255, 255);
            const maxChars = Math.floor((colW - 4) / 1.8);
            const rawLabel = isWait ? "Waiting" : task.name;
            const label = rawLabel.length > maxChars ? rawLabel.slice(0, maxChars - 1) + "…" : rawLabel;
            doc.text(label, x + 2.5, ty + Math.min(th * 0.45, 4));
          }
          if (th > 7) {
            doc.setFontSize(5.5);
            doc.setTextColor(tr2, tg2, tb2);
            doc.text(task.duration + "m", x + 2.5, ty + Math.min(th * 0.75, 7));
          }

          cursor += task.duration;
        });

        // column separator
        doc.setDrawColor(30, 33, 48);
        doc.setLineWidth(0.3);
        doc.line(x, TOP - 10, x, TOP + chartH);
      });

      // outer border
      doc.setDrawColor(42, 45, 58);
      doc.setLineWidth(0.4);
      doc.rect(LEFT, TOP - 10, chartW, chartH + 10);

      // legend
      let lx = LEFT;
      const ly = TOP + chartH + 6;
      doc.setFontSize(6);
      taskTypes.forEach(tt => {
        const r3 = parseInt(tt.color.slice(1,3),16);
        const g3 = parseInt(tt.color.slice(3,5),16);
        const b3 = parseInt(tt.color.slice(5,7),16);
        doc.setFillColor(r3, g3, b3);
        doc.rect(lx, ly - 2, 4, 4, "F");
        doc.setTextColor(180,180,180);
        doc.text(tt.name, lx + 5, ly + 1);
        lx += doc.getTextWidth(tt.name) + 12;
      });

      // efficiency watermark
      doc.setFontSize(9);
      doc.setTextColor(74, 85, 104);
      doc.text(`Efficiency: ${efficiency}%   Max: ${maxTime}m   Operators: ${operators.length}`, PW - 60, PH - 3);

      doc.save(`${activeProject.name.replace(/[^a-z0-9]/gi,"_")}_gantt.pdf`);
    } catch (err) {
      alert("PDF export failed: " + err.message);
    }
  }

  // ── Export Excel Template ──────────────────────────────────────────────────
  async function exportExcelTemplate() {
    try {
      const XLSX = await ensureXLSX();
      const wb = XLSX.utils.book_new();

      // one sheet per operator
      operators.forEach((op, i) => {
        const rows = [
          ["SMED RUNNER — TASK IMPORT TEMPLATE"],
          ["Operator:", op.name],
          ["Project:", activeProject.name],
          [""],
          ["Task Name", "Task Time (min)", "Task Type"],
          ["", "", ""],
          ...op.tasks.map(t => [t.name, t.duration, t.type]),
          // blank rows for user to fill
          ...Array(10).fill(["", "", ""]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);

        // column widths
        ws["!cols"] = [{ wch: 40 }, { wch: 18 }, { wch: 20 }];

        // header note in cell A1 styling (SheetJS community doesn't do rich styles,
        // but we embed a note)
        ws["A1"] = { v: "SMED RUNNER — TASK IMPORT TEMPLATE", t:"s" };
        ws["A5"] = { v: "Task Name",         t:"s" };
        ws["B5"] = { v: "Task Time (min)",   t:"s" };
        ws["C5"] = { v: "Task Type",         t:"s" };

        // instruction row
        ws["A6"] = { v: `Fill rows below. Task Type options: ${taskTypes.map(t=>t.name).join(", ")}`, t:"s" };
        XLSX.utils.book_append_sheet(wb, ws, op.name.slice(0, 31));
      });

      // also add a blank "New Operator" template sheet
      const blankRows = [
        ["SMED RUNNER — TASK IMPORT TEMPLATE"],
        ["Operator:", "Enter Operator Name Here"],
        ["Project:", activeProject.name],
        [""],
        ["Task Name", "Task Time (min)", "Task Type"],
        [`Fill rows below. Task Type options: ${taskTypes.map(t=>t.name).join(", ")}`, "", ""],
        ...Array(15).fill(["", "", ""]),
      ];
      const blankWs = XLSX.utils.aoa_to_sheet(blankRows);
      blankWs["!cols"] = [{ wch: 40 }, { wch: 18 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, blankWs, "New Operator");

      XLSX.writeFile(wb, `${activeProject.name.replace(/[^a-z0-9]/gi,"_")}_tasks_template.xlsx`);
    } catch (err) {
      alert("Excel export failed: " + err.message);
    }
  }

  // ── Import Excel ───────────────────────────────────────────────────────────
  async function importExcel(file) {
    try {
      const XLSX = await ensureXLSX();
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type:"array" });
      let totalImported = 0;
      const errors = [];

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });

        // find the operator name from row 2 (index 1), cell B
        const opNameRaw = String(rows[1]?.[1] || "").trim();
        if (!opNameRaw || opNameRaw.toLowerCase().includes("enter operator")) return;

        // find data rows — header is row 5 (index 4), data starts row 7 (index 6)
        const dataStart = 6;
        const imported = [];

        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          const name = String(row[0] || "").trim();
          const durRaw = Number(row[1]);
          const typeRaw = String(row[2] || "").trim();
          if (!name) continue;
          const duration = isNaN(durRaw) || durRaw <= 0 ? 5 : Math.round(durRaw);
          // match type or use first
          const matchedType = taskTypes.find(t => t.name.toLowerCase() === typeRaw.toLowerCase());
          const type = matchedType ? matchedType.name : taskTypes[0]?.name || "Validated";
          imported.push({ id: uid(), name, duration, type });
        }

        if (imported.length === 0) return;

        // find matching operator by name (case-insensitive) or create new one
        const existingOp = operators.find(o => o.name.toLowerCase() === opNameRaw.toLowerCase());
        if (existingOp) {
          mutateOps(ops => ops.map(o =>
            o.id !== existingOp.id ? o : { ...o, tasks: [...o.tasks, ...imported] }
          ));
        } else {
          const newOp = { id: uid(), name: opNameRaw, tasks: imported };
          mutateOps(ops => [...ops, newOp]);
        }
        totalImported += imported.length;
      });

      if (totalImported > 0) {
        setImportStatus("ok");
        setImportMsg(`✓ Imported ${totalImported} task${totalImported !== 1 ? "s" : ""} successfully`);
      } else {
        setImportStatus("err");
        setImportMsg("No tasks found. Check the template format.");
      }
      setTimeout(() => setImportStatus(null), 4000);
    } catch (err) {
      setImportStatus("err");
      setImportMsg("Import failed: " + err.message);
      setTimeout(() => setImportStatus(null), 4000);
    }
  }

  // ── HOME ──
  // Show loading screen while reading from storage
  if (!loaded) return (
    <div style={{minHeight:"100vh",background:"#080A0F",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono','Courier New',monospace",gap:16}}>
      <style>{globalCSS}</style>
      <div style={{width:36,height:36,background:"linear-gradient(135deg,#FF6B35,#E17055)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#FFF",animation:"pulse 1.2s infinite"}}>S</div>
      <div style={{fontSize:11,color:"#4a5568",letterSpacing:"0.16em"}}>CONNECTING TO DATABASE…</div>
    </div>
  );

  // Show DB setup screen if tables haven't been created yet
  if (!dbReady) return (
    <div style={{minHeight:"100vh",background:"#080A0F",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono','Courier New',monospace",padding:24}}>
      <style>{globalCSS}</style>
      <div style={{width:"100%",maxWidth:560}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <div style={{width:36,height:36,background:"linear-gradient(135deg,#FF6B35,#E17055)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#FFF"}}>S</div>
          <div style={{fontSize:15,fontWeight:800,color:"#FFF",letterSpacing:"0.08em"}}>SMED RUNNER · DATABASE SETUP</div>
        </div>
        <div style={{background:"#0D0F14",border:"1px solid #FF6B3544",borderRadius:12,padding:20,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:"#FF6B35",marginBottom:8,letterSpacing:"0.06em"}}>⚠ ONE-TIME SETUP REQUIRED</div>
          <div style={{fontSize:12,color:"#9CA3AF",lineHeight:1.7,marginBottom:16}}>
            Your Supabase database needs two tables created before the app can save data.
            This only needs to be done once — copy the SQL below and run it in your Supabase SQL Editor.
          </div>
          <div style={{fontSize:10,color:"#4a5568",letterSpacing:"0.12em",marginBottom:8}}>HOW TO:</div>
          {["1. Go to supabase.com and open your SMED Planner project","2. Click 'SQL Editor' in the left sidebar","3. Click 'New query'","4. Paste the SQL below and click Run","5. Come back here and tap the button below"].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:6}}>
              <span style={{color:"#FF6B35",flexShrink:0,fontSize:11}}>{i+1}.</span>
              <span style={{fontSize:11,color:"#9CA3AF",lineHeight:1.5}}>{s.replace(/^\d\. /,"")}</span>
            </div>
          ))}
        </div>
        <div style={{background:"#080A0F",border:"1px solid #2A2D3A",borderRadius:10,padding:14,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:9,color:"#4a5568",letterSpacing:"0.14em"}}>SQL TO RUN IN SUPABASE</span>
            <button onClick={()=>{
              const sql=`create table if not exists folders (\n  id text primary key,\n  name text not null,\n  icon text default '🏭',\n  color text default '#FF6B35',\n  created bigint not null\n);\n\ncreate table if not exists projects (\n  id text primary key,\n  name text not null,\n  created bigint not null,\n  notes text default '',\n  folder_id text references folders(id) on delete set null,\n  task_types jsonb default '[]',\n  operators jsonb default '[]'\n);\n\nalter table folders enable row level security;\nalter table projects enable row level security;\n\ncreate policy "public_all_folders" on folders for all using (true) with check (true);\ncreate policy "public_all_projects" on projects for all using (true) with check (true);`;
              navigator.clipboard?.writeText(sql).then(()=>alert("SQL copied to clipboard!")).catch(()=>alert("Select and copy the text manually"));
            }} style={{...iconBtnSty,background:"#4ECDC422",border:"1px solid #4ECDC444",color:"#4ECDC4",padding:"5px 10px",fontSize:10,letterSpacing:"0.08em",borderRadius:6}}>
              📋 COPY SQL
            </button>
          </div>
          <pre style={{fontSize:9,color:"#6a7a8a",lineHeight:1.6,overflow:"auto",whiteSpace:"pre-wrap",margin:0,fontFamily:"'Courier New',monospace"}}>{`create table if not exists folders (
  id text primary key,
  name text not null,
  icon text default '🏭',
  color text default '#FF6B35',
  created bigint not null
);

create table if not exists projects (
  id text primary key,
  name text not null,
  created bigint not null,
  notes text default '',
  folder_id text references folders(id) on delete set null,
  task_types jsonb default '[]',
  operators jsonb default '[]'
);

alter table folders enable row level security;
alter table projects enable row level security;

create policy "public_all_folders" on folders
  for all using (true) with check (true);
create policy "public_all_projects" on projects
  for all using (true) with check (true);`}</pre>
        </div>
        <Btn onClick={()=>{ setDbReady(true); window.location.reload?.(); }} color="#FF6B35" full>
          ✓ I'VE RUN THE SQL — CONTINUE
        </Btn>
      </div>
    </div>
  );

  if(screen==="home") return (
    <>
      {showWizard&&<QuickStartWizard onLaunch={launchProject} onCancel={()=>setShowWizard(false)}/>}
      <div style={{display:"flex",flexDirection:"column",minHeight:"100vh"}}>
        {dbError&&(
          <div style={{background:"#2a0a0a",borderBottom:"1px solid #6a2020",padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <span style={{fontSize:11,color:"#E17055",flex:1}}>⚠ {dbError}</span>
            <button onClick={manualRefresh} style={{...iconBtnSty,fontSize:10,color:"#E17055",background:"#6a202033",border:"1px solid #6a2020",borderRadius:5,padding:"4px 10px",letterSpacing:"0.08em"}}>{syncing?"…":"RETRY"}</button>
          </div>
        )}
        <HomePage projects={projects} folders={folders} onStartNew={()=>setShowWizard(true)} onContinue={()=>{}}
          onOpenProject={openProject} onDeleteProject={deleteProject} onDuplicateProject={duplicateProject}
          onMoveToFolder={moveToFolder} onCreateFolder={createFolder}
          onDeleteFolder={deleteFolder} onRenameFolder={renameFolder}
          saveIndicator={saveIndicator} syncing={syncing} onRefresh={manualRefresh} dbReady={dbReady}
          onStartDemo={startDemo}/>
      </div>
    </>
  );

  // ── BOARD ──
  if(!activeProject) return null;

  return (
    <div style={{minHeight:"100vh",background:"#0B0E15",color:"#E8EDF5",fontFamily:"'DM Mono','Courier New',monospace",display:"flex",flexDirection:"column"}}>
      <style>{globalCSS}</style>
      {showReport&&<ReportPanel operators={operators} taskTypes={taskTypes} onClose={()=>setShowReport(false)}/>}

      {/* DEMO mode banner */}
      {demoProject&&(
        <div style={{background:"linear-gradient(90deg,#0a2a28,#11141D)",borderBottom:"1px solid #4ECDC444",padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"#4ECDC4",fontWeight:700,letterSpacing:"0.06em"}}>🎓 DEMO MODE</span>
          <span style={{fontSize:10,color:"#8aa4a8",flex:1}}>Play freely — nothing is saved. Leaving resets it for the next person.</span>
          {tutorialStep===null && (
            <button onClick={()=>setTutorialStep(0)} style={{...iconBtnSty,fontSize:10,color:"#4ECDC4",background:"#4ECDC422",border:"1px solid #4ECDC444",borderRadius:5,padding:"4px 10px",letterSpacing:"0.06em"}}>▶ START GUIDE</button>
          )}
        </div>
      )}

      {/* Tutorial walkthrough overlay */}
      {tutorialStep!==null && TUTORIAL_STEPS[tutorialStep] && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:250,display:"flex",justifyContent:"center",padding:"0 12px 16px",pointerEvents:"none"}}>
          <div style={{background:"#11141D",border:"2px solid #4ECDC4",borderRadius:14,maxWidth:440,width:"100%",padding:"16px 18px",boxShadow:"0 8px 40px #000a, 0 0 24px #4ECDC433",pointerEvents:"auto",animation:"fadeIn 0.25s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:9,color:"#4ECDC4",letterSpacing:"0.14em",fontWeight:700}}>STEP {tutorialStep+1} OF {TUTORIAL_STEPS.length}</span>
              <button onClick={()=>setTutorialStep(null)} style={{...iconBtnSty,fontSize:11,color:"#5a6478",letterSpacing:"0.08em"}}>SKIP GUIDE ✕</button>
            </div>
            {/* progress dots */}
            <div style={{display:"flex",gap:3,marginBottom:12}}>
              {TUTORIAL_STEPS.map((_,i)=>(
                <div key={i} style={{flex:1,height:3,borderRadius:2,background:i<=tutorialStep?"#4ECDC4":"#2E3445",transition:"background 0.3s"}}/>
              ))}
            </div>
            <div style={{fontSize:16,fontWeight:800,color:"#FFF",marginBottom:6}}>{TUTORIAL_STEPS[tutorialStep].title}</div>
            <div style={{fontSize:12,color:"#C0C8D8",lineHeight:1.6,marginBottom:16}}>{TUTORIAL_STEPS[tutorialStep].body}</div>
            <div style={{display:"flex",gap:8}}>
              {tutorialStep>0 && (
                <Btn onClick={()=>setTutorialStep(s=>s-1)} color="#252A38" text="#C0C8D8" sm style={{flex:1}}>← BACK</Btn>
              )}
              {tutorialStep<TUTORIAL_STEPS.length-1 ? (
                <Btn onClick={()=>setTutorialStep(s=>s+1)} color="#4ECDC4" sm style={{flex:2}}>NEXT →</Btn>
              ) : (
                <Btn onClick={()=>setTutorialStep(null)} color="#FF6B35" sm style={{flex:2}}>✓ FINISH GUIDE</Btn>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DB error banner */}
      {dbError&&!demoProject&&(
        <div style={{background:"#2a0a0a",borderBottom:"1px solid #6a2020",padding:"8px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:11,color:"#E17055"}}>⚠ {dbError}</span>
          <button onClick={manualRefresh} style={{...iconBtnSty,fontSize:10,color:"#E17055",background:"#6a202033",border:"1px solid #6a2020",borderRadius:5,padding:"4px 10px",letterSpacing:"0.08em",marginLeft:"auto"}}>{syncing?"…":"RETRY"}</button>
        </div>
      )}

      {/* ── EXPORT MODAL ── */}
      {showExport&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#0D0F14",border:"1px solid #2A2D3A",borderRadius:14,width:"100%",maxWidth:400}}>
            <div style={{padding:"16px 18px",borderBottom:"1px solid #1E2130",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#FFF",letterSpacing:"0.06em"}}>EXPORT & IMPORT</div>
              <button onClick={()=>setShowExport(false)} style={{...iconBtnSty,fontSize:18,color:"#4a5568"}}>✕</button>
            </div>
            <div style={{padding:18,display:"flex",flexDirection:"column",gap:12}}>

              {/* Gantt PDF */}
              <div style={{background:"#080A0F",border:"1px solid #1E2130",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{width:32,height:32,background:"#FF6B3522",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📄</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#FFF"}}>Gantt Chart PDF</div>
                    <div style={{fontSize:10,color:"#4a5568",marginTop:1}}>Full visual timeline exported to A4 landscape</div>
                  </div>
                </div>
                <Btn onClick={()=>{ exportGanttPDF(); setShowExport(false); }} color="#FF6B35" full>↓ EXPORT GANTT PDF</Btn>
              </div>

              {/* Excel template download */}
              <div style={{background:"#080A0F",border:"1px solid #1E2130",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{width:32,height:32,background:"#00B89422",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📊</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#FFF"}}>Excel Task Template</div>
                    <div style={{fontSize:10,color:"#4a5568",marginTop:1}}>Download · fill in tasks · re-import below</div>
                  </div>
                </div>
                <Btn onClick={()=>{ exportExcelTemplate(); }} color="#00B894" full>↓ DOWNLOAD TEMPLATE (.xlsx)</Btn>
              </div>

              {/* Excel import */}
              <div style={{background:"#080A0F",border:"1px solid #1E2130",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{width:32,height:32,background:"#4ECDC422",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📥</div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#FFF"}}>Import Tasks from Excel</div>
                    <div style={{fontSize:10,color:"#4a5568",marginTop:1}}>Upload a filled template — tasks added automatically</div>
                  </div>
                </div>
                <label style={{display:"block",width:"100%",padding:"10px",background:"#4ECDC4",border:"none",color:"#0D0F14",fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:8,letterSpacing:"0.06em",textAlign:"center",boxShadow:"0 2px 12px #4ECDC444",boxSizing:"border-box"}}>
                  ↑ UPLOAD .xlsx FILE
                  <input type="file" accept=".xlsx,.xls" style={{display:"none"}}
                    onChange={e=>{ const f=e.target.files?.[0]; if(f){ importExcel(f); setShowExport(false); } e.target.value=""; }}/>
                </label>
              </div>

              {/* format hint */}
              <div style={{padding:"10px 12px",background:"#0a0c12",border:"1px solid #1E2130",borderRadius:8}}>
                <div style={{fontSize:9,color:"#4a5568",letterSpacing:"0.1em",marginBottom:4}}>TEMPLATE FORMAT</div>
                <div style={{fontSize:10,color:"#3a4a5a",lineHeight:1.7}}>
                  Each sheet = one operator (sheet name = operator name)<br/>
                  Row 2 col B = Operator name<br/>
                  Data rows start at row 7: <span style={{color:"#4ECDC4"}}>Task Name | Time (min) | Task Type</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Import status toast */}
      {importStatus&&(
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:importStatus==="ok"?"#00B894":"#E17055",color:"#FFF",padding:"10px 20px",borderRadius:20,fontSize:12,fontWeight:700,zIndex:500,pointerEvents:"none",boxShadow:"0 4px 20px #00000066",whiteSpace:"nowrap"}}>
          {importMsg}
        </div>
      )}

      {/* Template picker modal */}
      {showTemplPicker&&(
        <div style={{position:"fixed",inset:0,background:"#000c",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#0D0F14",border:"1px solid #2A2D3A",borderRadius:12,width:"100%",maxWidth:420}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #1E2130",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#FFF",letterSpacing:"0.06em"}}>LOAD TEMPLATE</div>
              <button onClick={()=>setShowTemplPicker(null)} style={{...iconBtnSty,fontSize:18}}>✕</button>
            </div>
            <div style={{padding:16,display:"flex",flexDirection:"column",gap:10}}>
              {Object.entries(TASK_TEMPLATES).map(([name,tasks])=>(
                <div key={name} style={{background:"#080A0F",border:"1px solid #1E2130",borderRadius:8,padding:"12px 14px",cursor:"pointer",transition:"border-color 0.2s"}}
                  onClick={()=>addTemplateToOp(showTemplPicker,tasks)}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="#FF6B35"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="#1E2130"}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#FFF"}}>{name}</span>
                    <span style={{fontSize:10,color:"#FFE66D"}}>{tasks.length} tasks · {tasks.reduce((s,t)=>s+t.duration,0)}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Touch drag indicator */}
      {dragging && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#4ECDC4",color:"#0D0F14",padding:"8px 18px",borderRadius:20,fontSize:11,fontWeight:700,letterSpacing:"0.08em",zIndex:500,pointerEvents:"none",boxShadow:"0 4px 20px #4ECDC466"}}>
          ✋ DROP ON AN OPERATOR COLUMN
        </div>
      )}
      {allDone&&(
        <div style={{position:"fixed",inset:0,background:"#000d",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#0D0F14",border:"2px solid #00B894",borderRadius:16,padding:"28px 28px",textAlign:"center",maxWidth:360,boxShadow:"0 0 40px #00B89433",width:"100%"}}>
            <div style={{fontSize:44,marginBottom:8}}>✓</div>
            <div style={{fontSize:18,fontWeight:800,color:"#00B894",letterSpacing:"0.06em",marginBottom:4}}>CHANGEOVER COMPLETE</div>
            <div style={{fontSize:11,color:"#4a5568",marginBottom:20}}>All operators finished in {maxTime} minutes</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20}}>
              {operators.map((op,i)=>(
                <div key={op.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 12px",background:"#080A0F",borderRadius:6}}>
                  <span style={{fontSize:12,color:OP_COLORS[i%10],fontWeight:700}}>{op.name}</span>
                  <span style={{fontSize:12,color:"#00B894"}}>{finishTimes[op.id]||"—"}m ✓</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <Btn onClick={resetRun} color="#4ECDC4">↺ RESET</Btn>
              <Btn onClick={()=>setShowReport(true)} color="#FF6B35">VIEW REPORT</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{background:"#11141D",borderBottom:"1px solid #252A38",padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>{ if(demoProject){exitDemo();} else {setScreen("home");} }} style={{...iconBtnSty,fontSize:12,color:"#C0C8D8",letterSpacing:"0.1em",padding:"7px 12px",background:"#1A1F2B",border:"1px solid #2E3445",borderRadius:7,fontWeight:600}}>
            ← HOME
          </button>
          <div style={{display:"none"}}><Logo/></div>
          <div style={{fontSize:15,fontWeight:700,color:"#FFFFFF",letterSpacing:"0.03em",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {activeProject.folderId && folders.find(f=>f.id===activeProject.folderId) && (
              <span style={{color:folders.find(f=>f.id===activeProject.folderId).color,fontSize:10,marginRight:6}}>
                {folders.find(f=>f.id===activeProject.folderId).icon} {folders.find(f=>f.id===activeProject.folderId).name} ›
              </span>
            )}
            {activeProject.name}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>setShowReport(true)} style={{...iconBtnSty,fontSize:10,color:"#9CA3AF",background:"#12141C",border:"1px solid #1E2130",borderRadius:6,padding:"6px 10px",letterSpacing:"0.08em"}}>📊 REPORT</button>
          <button onClick={()=>setShowExport(true)} style={{...iconBtnSty,fontSize:10,color:"#9CA3AF",background:"#12141C",border:"1px solid #1E2130",borderRadius:6,padding:"6px 10px",letterSpacing:"0.08em"}}>↓ EXPORT</button>
          <button onClick={manualRefresh} title="Sync with shared database" style={{...iconBtnSty,fontSize:10,color:saveIndicator?"#00B894":"#4a5568",background:"#12141C",border:`1px solid ${saveIndicator?"#00B89444":"#1E2130"}`,borderRadius:6,padding:"6px 10px",letterSpacing:"0.08em",transition:"all 0.3s"}}>
            {syncing?"⏳ SYNCING…":saveIndicator?"✓ SAVED":"↻ SYNC"}
          </button>
          <div style={{display:"flex",background:"#12141C",border:"1px solid #1E2130",borderRadius:6,overflow:"hidden"}}>
            {[["board","⊞"],["gantt","▤"]].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"6px 12px",fontSize:12,fontFamily:"inherit",background:view===v?"#FF6B35":"transparent",color:view===v?"#FFF":"#4a5568",border:"none",cursor:"pointer",transition:"all 0.15s"}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",background:"#12141C",border:"1px solid #1E2130",borderRadius:6,overflow:"hidden"}}>
            {[["plan","PLAN"],["run","▶ RUN"]].map(([v,l])=>(
              <button key={v} onClick={()=>{setPhase(v);resetRun();}} style={{padding:"6px 12px",fontSize:10,fontFamily:"inherit",background:phase===v?(v==="run"?"#4ECDC4":"#FF6B35"):"transparent",color:phase===v?"#0D0F14":"#4a5568",border:"none",cursor:"pointer",letterSpacing:"0.08em",fontWeight:phase===v?700:400,transition:"all 0.15s"}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── STATS BAR ── */}
      <div style={{display:"flex",background:"#11141D",borderBottom:"1px solid #252A38",overflowX:"auto",flexShrink:0}}>
        {[
          ["OPERATORS",operators.length,"#4ECDC4"],
          ["TASKS",operators.reduce((s,o)=>s+o.tasks.length,0),"#FFD93D"],
          ["MAX TIME",maxTime+"m","#FF6B35"],
          ["EFFICIENCY",efficiency+"%",efficiency>85?"#00D9A3":efficiency>60?"#FFD93D":"#E17055"],
        ].map(([l,v,c])=>(
          <div key={l} style={{padding:"10px 20px",borderRight:"1px solid #252A38",flexShrink:0}}>
            <div style={{fontSize:9,color:"#8a94a8",letterSpacing:"0.14em",fontWeight:600}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
          </div>
        ))}
        <div style={{flex:1,padding:"10px 18px",display:"flex",flexDirection:"column",justifyContent:"center",minWidth:100}}>
          <div style={{fontSize:8,color:"#8a94a8",letterSpacing:"0.14em",marginBottom:4,fontWeight:600}}>LOAD BALANCE</div>
          <div style={{background:"#252A38",borderRadius:3,height:7,overflow:"hidden"}}>
            <div style={{width:efficiency+"%",height:"100%",background:`linear-gradient(90deg,#FF6B35,${efficiency>85?"#00D9A3":"#FFD93D"})`,transition:"width 0.4s ease"}}/>
          </div>
        </div>
      </div>

      {/* ── RUN BANNER ── */}
      {phase==="run"&&(
        <div style={{background:"#06100a",borderBottom:"1px solid #0d2a14",padding:"10px 16px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{fontSize:24,fontWeight:800,color:"#4ECDC4",letterSpacing:"0.04em",minWidth:60}}>
            {String(Math.floor(runMinutes)).padStart(2,"0")}:{String(Math.floor((runMinutes%1)*60)).padStart(2,"0")}
          </div>
          <div style={{flex:1,minWidth:120}}>
            <div style={{background:"#0d2a14",borderRadius:2,height:6,overflow:"hidden",marginBottom:4}}>
              <div style={{width:Math.min((runMinutes/maxTime)*100,100)+"%",height:"100%",background:"linear-gradient(90deg,#4ECDC4,#00B894)",transition:"width 0.08s linear"}}/>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {operators.map(op=>{
                const t=op.tasks.reduce((s,tk)=>s+tk.duration,0);
                const pct=Math.min(Math.round((runMinutes/(t||1))*100),100);
                return <span key={op.id} style={{fontSize:8,color:finishTimes[op.id]?"#00B894":pct>80?"#FFE66D":"#4a5568"}}>{op.name} {pct}%{finishTimes[op.id]?" ✓":""}</span>;
              })}
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <Btn onClick={toggleRun} color={running?"#E17055":"#4ECDC4"} sm>{running?"⏸":"▶"}</Btn>
            <Btn onClick={resetRun} color="#1E2130" text="#9CA3AF" sm style={{border:"1px solid #2A2D3A"}}>↺</Btn>
          </div>
        </div>
      )}

      {/* ── NOTES BAR ── */}
      <div style={{background:"#11141D",borderBottom:"1px solid #252A38",padding:"8px 18px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,color:"#8a94a8",flexShrink:0}}>📝</span>
        <input value={activeProject.notes||""} onChange={e=>updateNotes(e.target.value)}
          placeholder="Add notes, shift info, machine number…"
          style={{...iSty,border:"none",background:"transparent",fontSize:13,padding:"3px 4px",color:"#C0C8D8"}}/>
      </div>

      {/* ── CONTENT ── */}
      <div style={{flex:1,overflowY:"auto",padding:"18px 18px",background:"#0B0E15"}}>

        {/* ══ BOARD VIEW ══ */}
        {view==="board"&&(
          <div style={{display:"flex",gap:14,overflowX:"auto",paddingBottom:12,alignItems:"stretch",minHeight:"calc(100vh - 220px)"}}>
            {operators.map((op,opIdx)=>{
              const opTime=op.tasks.reduce((s,t)=>s+t.duration,0);
              const isBottleneck=opTime===maxTime&&maxTime>1&&op.tasks.length>0;
              let taskCursor=0;
              return (
                <div key={op.id} style={{flex:operators.length<=5?"1 1 0":"0 0 260px",minWidth:240,maxWidth:operators.length<=5?"none":340,display:"flex",flexDirection:"column",background:"#11141D",border:`1px solid ${isBottleneck?"#FF6B3566":"#252A38"}`,borderRadius:12,overflow:"hidden",boxShadow:isBottleneck?"0 0 18px #FF6B3522":"0 2px 8px #00000033",transition:"border-color 0.3s"}}>
                  {/* op header */}
                  <div style={{padding:"12px 14px",background:OP_COLORS[opIdx%10]+"22",borderBottom:`1px solid ${OP_COLORS[opIdx%10]}33`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:9,height:9,borderRadius:"50%",background:OP_COLORS[opIdx%10],flexShrink:0,boxShadow:`0 0 6px ${OP_COLORS[opIdx%10]}`}}/>
                      <input value={op.name} onChange={e=>updateOpName(op.id,e.target.value)}
                        style={{background:"transparent",border:"none",color:"#FFFFFF",fontFamily:"inherit",fontSize:14,fontWeight:700,letterSpacing:"0.03em",outline:"none",width:130}}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      {isBottleneck&&<span style={{fontSize:8,color:"#FFF",background:"#FF6B35",padding:"2px 6px",borderRadius:3,fontWeight:700,letterSpacing:"0.06em"}}>SLOW</span>}
                      <span style={{fontSize:15,fontWeight:800,color:OP_COLORS[opIdx%10]}}>{opTime}m</span>
                      {operators.length>1&&<button onClick={()=>removeOperator(op.id)} style={{...iconBtnSty,color:"#8a3030",fontSize:12}}>✕</button>}
                    </div>
                  </div>
                  {phase==="run"&&<div style={{background:"#1A1D26",height:2}}><div style={{width:Math.min((runMinutes/(opTime||1))*100,100)+"%",height:"100%",background:OP_COLORS[opIdx%10],transition:"width 0.08s linear"}}/></div>}

                  {/* tasks */}
                  <div style={{padding:"10px",flex:1,minHeight:160}} data-opid={op.id}
                    onDragOver={e=>onDragOver(e,op.id,op.tasks.length)}
                    onDrop={e=>onDrop(e,op.id,op.tasks.length)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                  >
                    {op.tasks.map((task,tIdx)=>{
                      const ts=taskCursor; taskCursor+=task.duration;
                      return <TaskCard key={task.id} task={task} opId={op.id} tIdx={tIdx} taskTypes={taskTypes} phase={phase} runMinutes={runMinutes} taskStart={ts} dragging={dragging} dragOver={dragOver} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onDelete={()=>deleteTask(op.id,task.id)} onUpdate={(f,v)=>updateTask(op.id,task.id,f,v)}/>;
                    })}
                    <div data-opid={op.id} data-tidx={op.tasks.length}
                      onDragOver={e=>onDragOver(e,op.id,op.tasks.length)}
                      onDrop={e=>onDrop(e,op.id,op.tasks.length)}
                      style={{height:30,border:"1px dashed",borderColor:dragOver?.opId===op.id&&dragOver?.index===op.tasks.length?"#4ECDC4":"#3A4150",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#5a6478",letterSpacing:"0.1em",transition:"all 0.2s"}}>
                      DROP HERE
                    </div>
                  </div>

                  {/* add/template */}
                  <div style={{padding:"0 10px 10px",display:"flex",flexDirection:"column",gap:6}}>
                    {showAddTask===op.id?(
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <input placeholder="Task name…" value={newTask.name} onChange={e=>setNewTask(n=>({...n,name:e.target.value}))}
                          onKeyDown={e=>e.key==="Enter"&&addTask(op.id)} style={{...iSty,fontSize:13,padding:"9px 11px"}} autoFocus/>
                        <div style={{display:"flex",gap:6}}>
                          <input type="number" value={newTask.duration} min={1} max={120}
                            onChange={e=>setNewTask(n=>({...n,duration:Number(e.target.value)}))}
                            style={{...iSty,width:58,fontSize:13,padding:"9px",color:"#FFE66D"}}/>
                          <select value={newTask.type} onChange={e=>setNewTask(n=>({...n,type:e.target.value}))}
                            style={{...iSty,flex:1,fontSize:12,padding:"9px",color:taskTypes.find(t=>t.name===newTask.type)?.color||"#E2E8F0"}}>
                            {taskTypes.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}
                          </select>
                        </div>
                        <div style={{display:"flex",gap:6}}>
                          <Btn onClick={()=>addTask(op.id)} color="#FF6B35" sm style={{flex:1}}>ADD</Btn>
                          <Btn onClick={()=>setShowAddTask(null)} color="#252A38" text="#C0C8D8" sm>✕</Btn>
                        </div>
                      </div>
                    ):(
                      <button onClick={()=>setShowAddTask(op.id)}
                        style={{width:"100%",padding:"8px",background:"#1A1F2B",border:"1px dashed #3A4150",color:"#8a94a8",fontFamily:"inherit",fontSize:11,cursor:"pointer",borderRadius:8,letterSpacing:"0.06em",transition:"all 0.2s",fontWeight:600}}
                        onMouseEnter={e=>{e.target.style.borderColor="#FF6B35";e.target.style.color="#FF6B35";}}
                        onMouseLeave={e=>{e.target.style.borderColor="#3A4150";e.target.style.color="#8a94a8";}}>
                        + ADD TASK
                      </button>
                    )}
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setShowTemplPicker(op.id)}
                        style={{flex:1,padding:"8px",background:"#1A1F2B",border:"1px dashed #3A4150",color:"#8a94a8",fontFamily:"inherit",fontSize:11,cursor:"pointer",borderRadius:8,letterSpacing:"0.06em",transition:"all 0.2s",fontWeight:600}}
                        onMouseEnter={e=>{e.target.style.borderColor="#4ECDC4";e.target.style.color="#4ECDC4";}}
                        onMouseLeave={e=>{e.target.style.borderColor="#3A4150";e.target.style.color="#8a94a8";}}>
                        ⊞ TEMPLATE
                      </button>
                      <button onClick={()=>addWait(op.id)} title="Add waiting / downtime block"
                        style={{flex:1,padding:"8px",background:"#1A1F2B",border:"1px dashed #4a5160",color:"#8a94a8",fontFamily:"inherit",fontSize:11,cursor:"pointer",borderRadius:8,letterSpacing:"0.06em",transition:"all 0.2s",fontWeight:600}}
                        onMouseEnter={e=>{e.target.style.borderColor=WAIT_COLOR;e.target.style.color="#b0b8c8";}}
                        onMouseLeave={e=>{e.target.style.borderColor="#4a5160";e.target.style.color="#8a94a8";}}>
                        ⏸ ADD WAIT
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* add operator */}
            {operators.length<10&&(
              <div style={{minWidth:120,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,paddingTop:30,flexShrink:0}}>
                <button onClick={addOperator}
                  style={{width:48,height:48,borderRadius:"50%",background:"transparent",border:"2px dashed #1E2130",color:"#2A2D3A",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",fontFamily:"inherit"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#4ECDC4";e.currentTarget.style.color="#4ECDC4";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#1E2130";e.currentTarget.style.color="#2A2D3A";}}>+</button>
                <span style={{fontSize:8,color:"#2A2D3A",letterSpacing:"0.08em",textAlign:"center"}}>ADD<br/>OPERATOR</span>
              </div>
            )}
          </div>
        )}

        {/* ══ VERTICAL GANTT VIEW ══ */}
        {view==="gantt"&&(
          <div style={{display:"flex",flexDirection:"column",gap:0,background:"#0D0F14",border:"1px solid #1E2130",borderRadius:10,overflow:"hidden"}}>

            {/* Column headers = operators */}
            <div style={{display:"flex",position:"sticky",top:0,zIndex:10,background:"#0D0F14",borderBottom:"2px solid #1E2130"}}>
              {/* time axis label col */}
              <div style={{width:52,flexShrink:0,borderRight:"1px solid #1E2130",padding:"10px 6px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:8,color:"#4a5568",letterSpacing:"0.1em",writingMode:"vertical-rl",transform:"rotate(180deg)"}}>MIN</span>
              </div>
              {operators.map((op,opIdx)=>{
                const opTime=op.tasks.reduce((s,t)=>s+t.duration,0);
                const isBottleneck=opTime===maxTime&&maxTime>1&&op.tasks.length>0;
                return (
                  <div key={op.id} style={{flex:1,padding:"8px 6px",borderRight:"1px solid #1E2130",background:OP_COLORS[opIdx%10]+"10",minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:OP_COLORS[opIdx%10],flexShrink:0}}/>
                      <span style={{fontSize:10,fontWeight:700,color:OP_COLORS[opIdx%10],overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{op.name}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:11,fontWeight:800,color:isBottleneck?"#FF6B35":OP_COLORS[opIdx%10]}}>{opTime}m</span>
                      {isBottleneck&&<span style={{fontSize:7,color:"#FF6B35",background:"#FF6B3514",padding:"1px 4px",borderRadius:2}}>SLOW</span>}
                    </div>
                    {phase==="run"&&(
                      <div style={{background:"#1A1D26",borderRadius:2,height:3,marginTop:4}}>
                        <div style={{width:Math.min((runMinutes/(opTime||1))*100,100)+"%",height:"100%",background:OP_COLORS[opIdx%10],transition:"width 0.08s linear",borderRadius:2}}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vertical timeline body */}
            <div style={{display:"flex",position:"relative",overflowY:"auto",maxHeight:"60vh"}}>
              {/* Time ruler column */}
              <div style={{width:52,flexShrink:0,borderRight:"1px solid #1E2130",position:"relative",background:"#080A0F"}}>
                {Array.from({length:maxTime+2},(_,i)=>i).filter(i=>i%5===0||i===0).map(t=>(
                  <div key={t} style={{position:"absolute",top:(t/(maxTime+2)*100)+"%",left:0,right:0,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:6}}>
                    <span style={{fontSize:8,color:"#4a5568",letterSpacing:"0.06em"}}>{t}m</span>
                  </div>
                ))}
                {/* height spacer */}
                <div style={{height:(maxTime+2)*28+"px"}}/>
              </div>

              {/* Operator columns */}
              {operators.map((op,opIdx)=>{
                const opTime=op.tasks.reduce((s,t)=>s+t.duration,0);
                let cursor=0;
                return (
                  <div key={op.id} style={{flex:1,position:"relative",borderRight:"1px solid #1E2130",minWidth:0,background:opIdx%2===0?"#0D0F14":"#0A0C12"}}
                  data-opid={op.id}
                  onDragOver={e=>onDragOver(e,op.id,9999)}
                  onDrop={e=>onDrop(e,op.id,9999)}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                >
                    {/* horizontal grid lines */}
                    {Array.from({length:maxTime+2},(_,i)=>i).filter(i=>i%5===0).map(t=>(
                      <div key={t} style={{position:"absolute",top:(t/(maxTime+2)*100)+"%",left:0,right:0,height:1,background:"#1E2130",pointerEvents:"none"}}/>
                    ))}

                    {/* current time line */}
                    {phase==="run"&&runMinutes>0&&(
                      <div style={{position:"absolute",top:(runMinutes/(maxTime+2)*100)+"%",left:0,right:0,height:2,background:"#4ECDC4",boxShadow:"0 0 8px #4ECDC4",zIndex:8,pointerEvents:"none"}}/>
                    )}

                    {/* target line */}
                    <div style={{position:"absolute",top:(minTime/(maxTime+2)*100)+"%",left:0,right:0,height:1,borderTop:"1px dashed #00B89444",zIndex:7,pointerEvents:"none"}}/>

                    {/* task blocks */}
                    {op.tasks.map(task=>{
                      const topPct  = cursor/(maxTime+2)*100;
                      const heightPct = task.duration/(maxTime+2)*100;
                      const isActive = phase==="run"&&runMinutes>=cursor&&runMinutes<cursor+task.duration;
                      const isDone   = phase==="run"&&runMinutes>=cursor+task.duration;
                      cursor+=task.duration;
                      const isWait = task.isWait;
                      const tc= isWait ? WAIT_COLOR : (taskTypes.find(t=>t.name===task.type)||{color:"#aaa"}).color;
                      const isDraggingThis = dragging?.taskId===task.id;
                      return (
                        <div key={task.id}
                          draggable
                          onDragStart={e=>onDragStart(e,task.id,op.id)}
                          onDragEnd={onDragEnd}
                          onTouchStart={e=>onTouchStart(e,task.id,op.id)}
                          onTouchMove={onTouchMove}
                          onTouchEnd={onTouchEnd}
                          data-opid={op.id}
                          title={`${task.name} (${task.duration}m)`}
                          style={{
                            position:"absolute",
                            top:`calc(${topPct}% + 1px)`,
                            height:`calc(${heightPct}% - 2px)`,
                            left:2,right:2,
                            background:isWait
                              ? `repeating-linear-gradient(45deg, ${tc}44, ${tc}44 5px, ${tc}22 5px, ${tc}22 10px)`
                              : (isDone?tc+"22":isActive?tc:isDraggingThis?tc+"44":tc+"66"),
                            border:`1px ${isWait?"dashed":"solid"} ${tc}`,
                            borderRadius:5,
                            overflow:"hidden",
                            cursor:"grab",
                            display:"flex",
                            flexDirection:"column",
                            justifyContent:"center",
                            padding:"0 5px",
                            boxShadow:isActive?`0 0 10px ${tc}77`:isDraggingThis?`0 0 8px ${tc}55`:"none",
                            transition:"background 0.18s, box-shadow 0.18s",
                            zIndex:5,
                            opacity:isDraggingThis?0.4:1,
                          }}>
                          <div style={{fontSize:9,color:isWait?"#b0b8c8":(isDone?tc+"88":"#FFF"),fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.2,fontStyle:isWait?"italic":"normal"}}>{isWait?"⏸ Waiting":task.name}</div>
                          <div style={{fontSize:8,color:isWait?"#b0b8c8":(isDone?tc+"66":tc),marginTop:1}}>{task.duration}m</div>
                          {isActive&&<div style={{position:"absolute",inset:0,background:tc+"22",animation:"pulse 1s infinite"}}/>}
                        </div>
                      );
                    })}

                    {/* height spacer */}
                    <div style={{height:(maxTime+2)*28+"px"}}/>
                  </div>
                );
              })}
            </div>

            {/* Gantt legend */}
            <div style={{padding:"10px 12px",borderTop:"1px solid #1E2130",display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
              {taskTypes.map(tt=>(
                <div key={tt.name} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:8,height:8,background:tt.color,borderRadius:2}}/>
                  <span style={{fontSize:9,color:"#4a5568"}}>{tt.name}</span>
                </div>
              ))}
              <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:14,height:1,borderTop:"1px dashed #00B894"}}/>
                  <span style={{fontSize:8,color:"#4a5568"}}>TARGET</span>
                </div>
                {phase==="run"&&<div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:3,height:12,background:"#4ECDC4",borderRadius:1,boxShadow:"0 0 6px #4ECDC4"}}/>
                  <span style={{fontSize:8,color:"#4a5568"}}>NOW</span>
                </div>}
              </div>
            </div>
          </div>
        )}

        {/* Type legend */}
        <div style={{marginTop:14,padding:"10px 14px",background:"#11141D",border:"1px solid #252A38",borderRadius:8,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {taskTypes.map(tt=><div key={tt.name} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:9,height:9,borderRadius:"50%",background:tt.color}}/><span style={{fontSize:10,color:"#C0C8D8"}}>{tt.name}</span></div>)}
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:9,height:9,borderRadius:2,background:`repeating-linear-gradient(45deg, ${WAIT_COLOR}, ${WAIT_COLOR} 2px, #181C24 2px, #181C24 4px)`,border:`1px solid ${WAIT_COLOR}`}}/>
              <span style={{fontSize:10,color:"#C0C8D8"}}>⏸ Waiting / Downtime</span>
            </div>
          </div>
          <span style={{fontSize:9,color:"#5a6478"}}>Drag tasks to rebalance · Auto-saved</span>
          {saveIndicator && <span style={{fontSize:9,color:"#00D9A3",animation:"fadeIn 0.2s ease"}}>✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD GATE  (simple front-end lock — keeps casual visitors out)
// ─────────────────────────────────────────────────────────────────────────────
const SITE_PASSWORD = "AZMaccLean";
const PW_SESSION_KEY = "smed_unlocked_v1";

export default function SMEDApp() {
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(PW_SESSION_KEY) === "1"; } catch { return false; }
  });
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  function submit() {
    if (pw === SITE_PASSWORD) {
      setUnlocked(true);
      try { sessionStorage.setItem(PW_SESSION_KEY, "1"); } catch {}
    } else {
      setError(true);
      setPw("");
      setTimeout(() => setError(false), 1500);
    }
  }

  if (unlocked) return <SMEDAppInner />;

  return (
    <div style={{minHeight:"100vh",background:"#0B0E15",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono','Courier New',monospace",padding:24}}>
      <style>{globalCSS}</style>
      <div style={{width:"100%",maxWidth:340,textAlign:"center"}}>
        <div style={{width:48,height:48,background:"linear-gradient(135deg,#FF6B35,#E17055)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:900,color:"#FFF",margin:"0 auto 16px",boxShadow:"0 4px 20px #FF6B3555"}}>S</div>
        <div style={{fontSize:18,fontWeight:800,color:"#FFF",letterSpacing:"0.08em",marginBottom:4}}>SMED RUNNER</div>
        <div style={{fontSize:10,color:"#5a6478",letterSpacing:"0.2em",marginBottom:28}}>ENTER PASSWORD TO CONTINUE</div>
        <input
          type="password"
          value={pw}
          onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&submit()}
          placeholder="Password"
          autoFocus
          style={{
            width:"100%",boxSizing:"border-box",background:"#11141D",
            border:`1px solid ${error?"#E17055":"#2E3445"}`,
            color:"#E8EDF5",fontFamily:"inherit",fontSize:15,padding:"13px 16px",
            borderRadius:10,outline:"none",textAlign:"center",letterSpacing:"0.1em",
            marginBottom:12,transition:"border-color 0.2s"
          }}/>
        {error && <div style={{fontSize:11,color:"#E17055",marginBottom:12,animation:"fadeIn 0.2s ease"}}>Incorrect password — try again</div>}
        <button onClick={submit} style={{
          width:"100%",padding:"13px",background:"#FF6B35",border:"none",color:"#0D0F14",
          fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",borderRadius:10,
          letterSpacing:"0.08em",boxShadow:"0 2px 12px #FF6B3544"
        }}>UNLOCK →</button>
        <div style={{fontSize:9,color:"#3a4150",marginTop:20,letterSpacing:"0.1em"}}>INTERNAL TOOL · AUTHORISED USERS ONLY</div>
      </div>
    </div>
  );
}

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }
  @keyframes blink  { 0%,100%{opacity:1;} 50%{opacity:0.15;} }
  @keyframes fadeIn { from{opacity:0;transform:translateY(-8px);} to{opacity:1;transform:translateY(0);} }
  @keyframes pulse  { 0%,100%{opacity:0.3;} 50%{opacity:0.7;} }
  select option { background:#0D0F14; }
  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:#080A0F; }
  ::-webkit-scrollbar-thumb { background:#1E2130; border-radius:2px; }
  input[type=number]::-webkit-inner-spin-button { opacity:0.3; }
  body { -webkit-tap-highlight-color: transparent; }
  @media (max-width: 480px) {
    .board-col { min-width: 180px !important; max-width: 200px !important; }
  }
`;
