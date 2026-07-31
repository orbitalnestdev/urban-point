import React from 'react';
import { Trophy, ArrowRight, User } from 'lucide-react';

interface Props {
  ranking: {
    id: string;
    name: string;
    comisionReferido: number;
    feeLogistica: number;
  }[];
}

export function CanillitasRanking({ ranking }: Props) {
  if (!ranking || ranking.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
        <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-900 mb-1">Sin datos suficientes</h3>
        <p className="text-slate-500">Todavía no hay suficientes devengos generados en los últimos 30 días para armar el ranking.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center gap-3">
        <Trophy className="w-6 h-6 text-amber-500" />
        <h3 className="text-lg font-bold text-slate-900">Top Canillitas (Últimos 30 días)</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-100">
              <th className="px-6 py-4 font-semibold w-16 text-center">#</th>
              <th className="px-6 py-4 font-semibold">Canillita</th>
              <th className="px-6 py-4 font-semibold text-right">Fee Logística</th>
              <th className="px-6 py-4 font-semibold text-right">Comisión Referido</th>
              <th className="px-6 py-4 font-semibold text-right">Total Generado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ranking.map((canillita, index) => {
              const total = canillita.comisionReferido + canillita.feeLogistica;
              const isTop3 = index < 3;
              
              return (
                <tr key={canillita.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                      index === 0 ? 'bg-amber-100 text-amber-700' :
                      index === 1 ? 'bg-slate-200 text-slate-700' :
                      index === 2 ? 'bg-orange-100 text-orange-800' :
                      'bg-slate-50 text-slate-500'
                    }`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{canillita.name}</p>
                        <p className="text-xs font-mono text-slate-400">{canillita.id.substring(0, 8)}...</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600 font-medium">
                    ${(canillita.feeLogistica / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600 font-medium">
                    ${(canillita.comisionReferido / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-flex items-center gap-1 font-bold ${isTop3 ? 'text-green-600' : 'text-slate-900'}`}>
                      ${(total / 100).toFixed(2)}
                      {isTop3 && <ArrowRight className="w-4 h-4" />}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
