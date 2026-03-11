import React, { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { EXCHS } from '../constants';

interface PriceTick {
  exchange: string;
  pair: string;
  bid: number;
  ask: number;
  vol: number;
  ts: number;
}

const Scanner: React.FC<{ prices: PriceTick[] }> = ({ prices }) => {
  const symbols = useMemo(
    () => Array.from(new Set(prices.map(p => p.pair.split('/')[0]))).slice(0, 12),
    [prices]
  );

  // Only show exchanges that are in EXCHS list
  const activeExchanges = EXCHS.slice(0, 5);

  if (prices.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <BarChart3 className="w-12 h-12 text-slate-800 mx-auto" />
        <p className="text-slate-500 text-sm">Connecting to price feed...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            HFT SCANNER
          </h2>
        </div>
        <span className="text-[10px] font-mono bg-slate-800 px-2 py-1 rounded border border-slate-700 text-slate-400">
          REAL-TIME FEED
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left border-collapse min-w-[480px]">
          <thead>
            <tr className="bg-slate-800/50 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
              <th className="p-3 border-b border-slate-800 sticky left-0 bg-slate-800/50">Symbol</th>
              {activeExchanges.map(ex => (
                <th key={ex.id} className="p-3 border-b border-slate-800 text-center whitespace-nowrap">
                  <span className="mr-1">{ex.logo}</span>{ex.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map(sym => {
              // Find min ask and max bid for spread highlight
              const symTicks = activeExchanges
                .map(ex => prices.find(p => p.exchange === ex.id && p.pair.startsWith(sym + '/')))
                .filter(Boolean) as PriceTick[];

              const minAsk = symTicks.length ? Math.min(...symTicks.map(t => t.ask)) : null;
              const maxBid = symTicks.length ? Math.max(...symTicks.map(t => t.bid)) : null;

              return (
                <tr key={sym} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                  <td className="p-3 font-bold text-sm sticky left-0 bg-slate-900">{sym}</td>
                  {activeExchanges.map(ex => {
                    const tick = prices.find(p => p.exchange === ex.id && p.pair.startsWith(sym + '/'));
                    const isCheapest = tick && minAsk !== null && tick.ask === minAsk;
                    const isMostExpensive = tick && maxBid !== null && tick.bid === maxBid;

                    return (
                      <td key={ex.id} className="p-3 text-center">
                        {tick ? (
                          <div className="space-y-0.5">
                            <div className={`text-xs font-mono font-bold ${isMostExpensive ? 'text-emerald-400' : 'text-slate-200'}`}>
                              ${tick.ask.toFixed(2)}
                            </div>
                            <div className={`text-[9px] font-mono ${isCheapest ? 'text-cyan-400' : 'text-slate-500'}`}>
                              ${tick.bid.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-[10px] text-slate-500 font-mono px-1">
        <span><span className="text-emerald-400 font-bold">green ask</span> = highest sell</span>
        <span><span className="text-cyan-400 font-bold">cyan bid</span> = lowest buy</span>
      </div>
    </div>
  );
};

export default Scanner;
