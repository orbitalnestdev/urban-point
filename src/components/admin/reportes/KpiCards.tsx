import React from 'react';
import { TrendingUp, DollarSign, Wallet } from 'lucide-react';

interface Props {
  data: {
    totalVendido: number;
    totalDevengado: number;
    payoutsPendientes: number;
  };
}

export function KpiCards({ data }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Total Vendido (30d)</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">${(data.totalVendido / 100).toFixed(2)}</h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
        <p className="text-sm text-slate-500">Monto total de órdenes pagadas.</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Total Comisiones (30d)</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">${(data.totalDevengado / 100).toFixed(2)}</h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
        <p className="text-sm text-slate-500">Monto devengado por referidos y logística.</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Payouts Pendientes</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">${(data.payoutsPendientes / 100).toFixed(2)}</h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
        </div>
        <p className="text-sm text-slate-500">Comisiones disponibles y listas para liquidar.</p>
      </div>
    </div>
  );
}
