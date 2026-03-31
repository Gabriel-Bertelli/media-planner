import React, { useState, useMemo, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Database, Loader2, AlertCircle, LogOut, LayoutDashboard, Filter, 
  Calendar, Tag, Box, TrendingUp, Sparkles, Download, 
  Table as TableIcon, Lock, Eye, EyeOff 
} from 'lucide-react';
import { 
  BarChart, Bar, Legend, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LabelList, LineChart, Line, ComposedChart, Cell, PieChart, Pie
} from 'recharts';
import { format, isValid } from 'date-fns';
import { AIAssistant } from './components/AIAssistant';

// --- Utilitários ---
const parseLocalDate = (dateStr: string | number | Date) => {
  if (!dateStr) return new Date(NaN);
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr).split('T')[0].split(' ')[0];
  return new Date(`${str}T00:00:00`);
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [budget, setBudget] = useState(10000);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const cached = localStorage.getItem('ptsmart_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setData(parsed);
        setIsConnected(true);
      } catch (e) {
        console.error('Erro ao carregar cache');
      }
    }
  }, []);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md">
          <Database className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Media Planner</h1>
          <p className="text-slate-600 mb-6">Conecte sua base de dados para começar.</p>
          <div className="animate-pulse text-sm text-slate-400">Aguardando dados...</div>
        </div>
      </div>
    );
  }

  return <Dashboard data={data} debouncedSearch={debouncedSearch} budget={budget} setBudget={setBudget} />;
}

function Dashboard({ data, debouncedSearch, budget, setBudget }: any) {
  // 1. Estados de Filtro
  const keys = data.length > 0 ? Object.keys(data[0]) : [];
  const dateField = keys.find(k => /data|date|created|time/i.test(k));
  const campaignField = keys.includes('tipo_campanha') ? 'tipo_campanha' : keys.find(k => /campanha|campaign|tipo/i.test(k));
  const productField = keys.includes('produto') ? 'produto' : keys.find(k => /produto|product/i.test(k));
  const numericFields = keys.filter(k => typeof data[0][k] === 'number' && !/id/i.test(k));

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('custom');
  const [timeGrouping, setTimeGrouping] = useState('daily');
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState('all');

  // 2. Processamento de Dados (Hooks no topo)
  const preparedData = useMemo(() => {
    const filtered = debouncedSearch 
      ? data.filter((row: any) => Object.values(row).some(v => String(v).toLowerCase().includes(debouncedSearch.toLowerCase())))
      : data;

    return filtered.map((row: any) => {
      const newRow = { ...row };
      Object.keys(newRow).forEach((k) => {
        const v = newRow[k];
        if (typeof v === 'string') {
          const num = parseFloat(v.replace(',', '.'));
          if (!isNaN(num)) newRow[k] = num;
        }
      });
      return newRow;
    });
  }, [data, debouncedSearch]);

  const investmentSuggestion = useMemo(() => {
    if (!preparedData?.length) return { rows: [], total: budget, allocated: 0, message: '' };

    const getWindow = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d;
    };

    const windows = [{ days: 60, weight: 1 }, { days: 30, weight: 2 }, { days: 14, weight: 1 }, { days: 7, weight: 1 }];
    const group: any = {};

    preparedData.forEach((r: any) => {
      const camp = r[campaignField || ''] || 'Desconhecida';
      const date = parseLocalDate(r[dateField || '']);
      if (!group[camp]) group[camp] = { current: 0 };
      group[camp].current += r.investimento || 0;

      windows.forEach(w => {
        if (date >= getWindow(w.days)) {
          if (!group[camp][w.days]) group[camp][w.days] = { inv: 0, mat: 0 };
          group[camp][w.days].inv += r.investimento || 0;
          group[camp][w.days].mat += r.matriculas || 0;
        }
      });
    });

    const rows = Object.entries(group).map(([camp, v]: any) => {
      let weighted = 0, totalW = 0;
      windows.forEach(w => {
        const d = v[w.days];
        if (d && d.mat > 0) {
          weighted += (d.inv / d.mat) * w.weight;
          totalW += w.weight;
        }
      });
      const score = totalW > 0 ? 1 / (weighted / totalW) : 0;
      return { camp, score, current: v.current };
    });

    const totalScore = rows.reduce((a, b) => a + b.score, 0) || 1;
    let allocated = 0;
    const result = rows.map(r => {
      let suggested = (r.score / totalScore) * budget;
      suggested = Math.max(r.current * 0.65, Math.min(r.current * 1.35, suggested));
      allocated += suggested;
      return { ...r, suggested, delta: r.current > 0 ? ((suggested - r.current) / r.current) * 100 : 0 };
    });

    return { rows: result, message: budget - allocated > 0 ? `Saldo de R$ ${(budget - allocated).toFixed(0)} retido por segurança.` : '' };
  }, [preparedData, budget, campaignField, dateField]);

  // 3. Renderização
  if (!data.length) return <div className="p-10 text-center">Carregando...</div>;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 bg-slate-50 min-h-screen">
      {/* Filtros */}
      <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Orçamento Global</label>
          <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} className="w-full mt-1 px-3 py-2 border rounded-lg" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Campanha</label>
          <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg">
            <option value="all">Todas</option>
            {Array.from(new Set(data.map(d => d[campaignField || '']))).map(c => <option key={String(c)} value={String(c)}>{String(c)}</option>)}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button onClick={() => {localStorage.clear(); window.location.reload();}} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-lg ml-auto">
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </header>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Tabela de Investimento */}
          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /> Smart Allocation</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Campanha</th>
                    <th className="px-4 py-3">Invest. Atual</th>
                    <th className="px-4 py-3">Sugestão</th>
                    <th className="px-4 py-3">Variação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {investmentSuggestion.rows.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.camp}</td>
                      <td className="px-4 py-3">R$ {row.current.toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600">R$ {row.suggested.toLocaleString()}</td>
                      <td className={`px-4 py-3 font-bold ${row.delta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {row.delta > 0 ? '+' : ''}{row.delta.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Gráfico de Performance */}
          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[400px]">
            <h3 className="font-bold mb-6">Tendência de Conversão</h3>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={preparedData.slice(0, 30)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey={dateField || ''} hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="investimento" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="matriculas" stroke="#0f5aa6" strokeWidth={3} />
              </ComposedChart>
            </ResponsiveContainer>
          </section>
        </div>

        {/* Coluna Lateral - IA */}
        <aside className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-col h-full min-h-[600px]">
          <div className="mb-8">
            <Sparkles className="w-8 h-8 text-emerald-400 mb-4" />
            <h3 className="text-xl font-bold mb-2">Assistente de IA</h3>
            <p className="text-slate-400 text-sm">Analise métricas e peça insights sobre sua operação de mídia.</p>
          </div>
          <div className="flex-grow">
             <AIAssistant data={preparedData} />
          </div>
        </aside>
      </div>
    </div>
  );
}
