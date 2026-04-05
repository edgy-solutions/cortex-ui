import { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Share2, BarChart3 } from 'lucide-react';

interface ChartWidgetProps {
  data: string; // The stringified JSON array from Engine A/BAML
  type: 'BAR' | 'LINE' | 'PIE';
  subject: string;
  sql: string;
  onPublish: (sql: string, title: string) => void;
}

export const ChartWidget = ({ data, type, subject, sql, onPublish }: ChartWidgetProps) => {
  // Use useMemo to prevent re-parsing and Recharts flickering on parent re-renders
  const chartData = useMemo(() => {
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to parse chart data:", e);
      return [];
    }
  }, [data]);

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden group">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
        <BarChart3 className="w-24 h-24 text-cyan-400" />
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <h3 className="text-xl font-bold text-white tracking-tight leading-none">{subject}</h3>
          </div>
          <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
            Headless Analyst Preview
          </p>
        </div>
        
        <button 
          className="btn-publish flex items-center gap-2 group/btn"
          onClick={() => onPublish(sql, subject)}
        >
          <Share2 className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
          <span>Publish to Superset</span>
        </button>
      </div>
      
      <div className="h-[350px] w-full relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'LINE' ? (
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
              <XAxis 
                dataKey="name" 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tick={{ fill: '#94a3b8' }}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tick={{ fill: '#94a3b8' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                  borderColor: 'rgba(6, 182, 212, 0.4)', 
                  borderRadius: '12px',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  fontSize: '12px',
                  color: '#f1f5f9'
                }}
                itemStyle={{ color: '#22d3ee' }}
                cursor={{ stroke: '#06b6d4', strokeWidth: 1 }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#06b6d4" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#0f172a', stroke: '#06b6d4', strokeWidth: 2 }} 
                activeDot={{ r: 6, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }} 
                animationDuration={1500}
              />
            </LineChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
              <XAxis 
                dataKey="name" 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tick={{ fill: '#94a3b8' }}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tick={{ fill: '#94a3b8' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                  borderColor: 'rgba(6, 182, 212, 0.4)', 
                  borderRadius: '12px',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  fontSize: '12px',
                  color: '#f1f5f9'
                }}
                cursor={{ fill: 'rgba(6, 182, 212, 0.05)' }}
              />
              <Bar 
                dataKey="value" 
                fill="url(#barGradient)" 
                radius={[4, 4, 0, 0]} 
                animationDuration={1500}
              />
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.2} />
                </linearGradient>
              </defs>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Footer Info */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-tighter shrink-0 max-w-full overflow-hidden">
          <div className="flex items-center gap-1 shrink-0 overflow-hidden">
            <span className="text-cyan-500/50">SQL:</span>
            <span className="truncate max-w-[200px]">{sql}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-cyan-500/50">ENGINE:</span>
            <span>ANALYST_A</span>
          </div>
        </div>
      </div>
    </div>
  );
};
