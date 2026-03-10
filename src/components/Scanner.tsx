import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
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
  const symbols = Array.from(new Set(prices.map(p => p.pair.split('/')[0])));

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="text-cyan" /> HFT SCANNER
        </h2>
        <div className="text-[10px] text-muted font-mono bg-bg3 px-2 py-1 rounded border border-border">
          REAL-TIME FEED
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-bg2">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg3/50 text-[10px] text-muted uppercase font-bold tracking-widest">
              <th className="p-4 border-b border-border">Symbol</th>
              {EXCHS.map(ex => (
                <th key={ex.id} className="p-4 border-b border-border text-center">{ex.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map(sym => (
              <tr key={sym} className="border-b border-border/50 hover:bg-bg3/20 transition-colors">
                <td className="p-4 font-bold text-sm">{sym}</td>
                {EXCHS.map(ex => {
                  const tick = prices.find(p => p.exchange === ex.id && p.pair.startsWith(sym));
                  return (
                    <td key={ex.id} className="p-4 text-center">
                      {tick ? (
                        <div className="space-y-0.5">
                          <div className="text-xs font-mono font-bold text-text">${tick.ask.toFixed(2)}</div>
                          <div className="text-[9px] text-muted font-mono">${tick.bid.toFixed(2)}</div>
                        </div>
                      ) : (
                        <span className="text-muted opacity-20">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Scanner;
