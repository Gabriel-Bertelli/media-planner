// ================= IMPORTS =================
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LayoutDashboard } from 'lucide-react';

// ================= APP =================
function App(){

// ================= STATES =================
const [data,setData] = useState<any[]>([]);
const [search,setSearch] = useState('');
const [debouncedSearch,setDebouncedSearch] = useState('');
const [budget,setBudget] = useState(10000);
const [tab,setTab] = useState<'dashboard'|'investment'>('dashboard');

// ================= DEBOUNCE =================
useEffect(()=>{
  const t = setTimeout(()=>setDebouncedSearch(search),300);
  return ()=>clearTimeout(t);
},[search]);

// ================= CACHE =================
useEffect(()=>{
  const cache = localStorage.getItem('ptsmart-cache');
  if(cache) setData(JSON.parse(cache));
},[]);

useEffect(()=>{
  if(data.length){
    localStorage.setItem('ptsmart-cache',JSON.stringify(data));
  }
},[data]);

// ================= PREP DATA =================
const preparedData = useMemo(()=>data,[data]);

// ================= FILTER =================
const filteredData = useMemo(()=>{
  if(!debouncedSearch) return preparedData;

  return preparedData.filter((row:any)=>
    JSON.stringify(row).toLowerCase().includes(debouncedSearch.toLowerCase())
  );
},[preparedData,debouncedSearch]);

// ================= KPIs =================
const kpis = useMemo(()=>{
  let investimento=0;
  let matriculas=0;

  filteredData.forEach(r=>{
    investimento += r.investimento || 0;
    matriculas += r.matriculas || 0;
  });

  return {
    investimento,
    matriculas,
    cac: matriculas>0 ? investimento/matriculas : null
  };
},[filteredData]);

// ================= INVESTMENT ENGINE =================
const investment = useMemo(()=>{
  if(!preparedData.length) return {rows:[],message:''};

  const windows = [
    {d:60,w:1},
    {d:30,w:2},
    {d:14,w:1},
    {d:7,w:1}
  ];

  const now = new Date();
  const group:any = {};

  preparedData.forEach(r=>{
    const c = r.campaign_name || 'unknown';
    const date = new Date(r.data);

    if(!group[c]) group[c]={cur:0};

    group[c].cur += r.investimento || 0;

    windows.forEach(win=>{
      const limit = new Date(now);
      limit.setDate(limit.getDate()-win.d);

      if(date>=limit){
        if(!group[c][win.d]) group[c][win.d]={inv:0,mat:0};
        group[c][win.d].inv += r.investimento||0;
        group[c][win.d].mat += r.matriculas||0;
      }
    });
  });

  const rows = Object.entries(group).map(([c,v]:any)=>{
    let sum=0,w=0;

    windows.forEach(win=>{
      const d = v[win.d];
      if(d && d.mat>0){
        const cac = d.inv/d.mat;
        sum += cac*win.w;
        w += win.w;
      }
    });

    const cac = w>0 ? sum/w : null;
    const score = cac ? 1/cac : 0;

    return {campaign:c,cac,score,current:v.cur};
  });

  const totalScore = rows.reduce((a,b)=>a+b.score,0)||1;

  let allocated=0;

  const result = rows.map(r=>{
    let suggested = (r.score/totalScore)*budget;

    const min = r.current*0.65;
    const max = r.current*1.35;

    suggested = Math.max(min,Math.min(max,suggested));

    allocated += suggested;

    const delta = r.current>0 ? ((suggested-r.current)/r.current)*100 : 0;

    return {...r,suggested,delta};
  });

  const remaining = budget - allocated;

  const message = remaining>0
    ? `Saldo restante: R$ ${remaining.toFixed(0)}`
    : '';

  return {rows:result,message};

},[preparedData,budget]);

// ================= EMPTY =================
if(!data.length){
  return (
    <div style={{padding:40,textAlign:'center'}}>
      <LayoutDashboard size={40}/>
      <p>Nenhum dado carregado</p>
    </div>
  );
}

// ================= UI =================
return (
  <div style={{padding:20,fontFamily:'sans-serif'}}>

    {/* HEADER */}
    <div style={{display:'flex',gap:10,marginBottom:20}}>
      <button onClick={()=>setTab('dashboard')}>Dashboard</button>
      <button onClick={()=>setTab('investment')}>Investimento</button>
    </div>

    {/* SEARCH */}
    <input
      placeholder="Buscar..."
      value={search}
      onChange={e=>setSearch(e.target.value)}
      style={{marginBottom:20,padding:8,width:'100%'}}
    />

    {/* DASHBOARD */}
    {tab==='dashboard' && (
      <div>
        <h2>KPIs</h2>
        <p>Investimento: R$ {kpis.investimento.toFixed(0)}</p>
        <p>Matrículas: {kpis.matriculas}</p>
        <p>CAC: {kpis.cac?.toFixed(2)}</p>
      </div>
    )}

    {/* INVESTMENT */}
    {tab==='investment' && (
      <div>
        <h2>Sugestão de Investimento</h2>

        <input
          type="number"
          value={budget}
          onChange={e=>setBudget(Number(e.target.value))}
        />

        <table border={1} cellPadding={6} style={{marginTop:20}}>
          <thead>
            <tr>
              <th>Campanha</th>
              <th>CAC</th>
              <th>Atual</th>
              <th>Sugerido</th>
              <th>Delta %</th>
            </tr>
          </thead>
          <tbody>
            {investment.rows.map((r:any,i:number)=>(
              <tr key={i}>
                <td>{r.campaign}</td>
                <td>{r.cac?.toFixed(2)}</td>
                <td>{r.current.toFixed(0)}</td>
                <td>{r.suggested.toFixed(0)}</td>
                <td style={{
                  color: r.delta>0 ? 'green' : 'red'
                }}>
                  {r.delta.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p>{investment.message}</p>
      </div>
    )}

  </div>
);

}

export default App;
