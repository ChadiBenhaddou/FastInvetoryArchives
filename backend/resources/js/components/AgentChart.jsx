import { useState } from 'react';

// Categorical palette (validated: CVD ΔE ≥ 9.1, normal ΔE ≥ 19.6 on white). Fixed order,
// assigned by agent name so an agent keeps its color whatever the filter.
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const OTHER = '#a8a7a2';

const dayLabel = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Photos per agent per day: stacked columns, legend, hover tooltip and a table view. */
export default function AgentChart({ days, data }) {
    const [hover, setHover] = useState(null);
    const [table, setTable] = useState(false);

    const agents = Object.keys(data).sort((a, b) => a.localeCompare(b, 'fr'));
    const shown = agents.slice(0, PALETTE.length);
    // A 9th agent never gets a generated color: it folds into "Autres".
    const series = [...shown.map((a, i) => ({ name: a, color: PALETTE[i], values: data[a] })),
        ...(agents.length > PALETTE.length ? [{
            name: 'Autres', color: OTHER,
            values: Object.fromEntries(days.map((d) => [d, agents.slice(PALETTE.length).reduce((s, a) => s + (data[a][d] ?? 0), 0)])),
        }] : [])];

    const totals = days.map((d) => series.reduce((s, x) => s + (x.values[d] ?? 0), 0));
    const max = Math.max(1, ...totals);
    const W = 640, H = 190, PAD_B = 22, PAD_T = 16;
    const colW = W / days.length;
    const barW = Math.min(28, colW * 0.6);
    const y = (v) => ((H - PAD_B - PAD_T) * v) / max;

    if (!agents.length) return <p className="text-sm text-stone-500">Aucune photo sur les 14 derniers jours.</p>;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-700">
                {series.map((s) => (
                    <span key={s.name} className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.name}
                    </span>
                ))}
                <button onClick={() => setTable(!table)} className="ms-auto text-amber-700 hover:underline">{table ? 'Voir le graphique' : 'Voir le tableau'}</button>
            </div>

            {table ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead><tr className="text-stone-500"><th className="py-1 text-left font-medium">Agent</th>{days.map((d) => <th key={d} className="px-1 text-right font-medium">{dayLabel(d)}</th>)}</tr></thead>
                        <tbody>
                            {series.map((s) => (
                                <tr key={s.name} className="border-t border-stone-100">
                                    <td className="py-1 pe-2">{s.name}</td>
                                    {days.map((d) => <td key={d} className="px-1 text-right tabular-nums">{s.values[d] ?? 0}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="relative">
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Photos par agent et par jour, 14 derniers jours">
                        {[0.5, 1].map((f) => (
                            <g key={f}>
                                <line x1="0" x2={W} y1={H - PAD_B - y(max * f)} y2={H - PAD_B - y(max * f)} stroke="#e7e5e4" strokeWidth="1" />
                                <text x="2" y={H - PAD_B - y(max * f) - 3} className="fill-stone-500" fontSize="10">{Math.round(max * f)}</text>
                            </g>
                        ))}
                        {days.map((d, i) => {
                            const x = i * colW + (colW - barW) / 2;
                            let base = H - PAD_B;
                            return (
                                <g key={d} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                                    <rect x={i * colW} y="0" width={colW} height={H} fill={hover === i ? '#f5f5f4' : 'transparent'} />
                                    {series.map((s) => {
                                        const v = s.values[d] ?? 0;
                                        if (!v) return null;
                                        const h = Math.max(1, y(v) - 2); // 2px surface gap between stacked segments
                                        base -= y(v);
                                        return <rect key={s.name} x={x} y={base + 2} width={barW} height={h} rx="3" fill={s.color} />;
                                    })}
                                    <text x={i * colW + colW / 2} y={H - 6} textAnchor="middle" fontSize="10" className="fill-stone-500">{dayLabel(d)}</text>
                                </g>
                            );
                        })}
                    </svg>
                    {hover !== null && totals[hover] > 0 && (
                        <div className="pointer-events-none absolute top-0 z-10 rounded-md bg-white p-2 text-xs shadow-lg ring-1 ring-stone-200"
                            style={{ left: `${Math.min(75, (hover / days.length) * 100)}%` }}>
                            <div className="mb-1 font-medium">{dayLabel(days[hover])} — {totals[hover]} photo(s)</div>
                            {series.filter((s) => s.values[days[hover]]).map((s) => (
                                <div key={s.name} className="flex items-center gap-1.5">
                                    <span className="size-2 rounded-sm" style={{ background: s.color }} /> {s.name} : {s.values[days[hover]]}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
