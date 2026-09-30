import { Flame } from 'lucide-react';

export function StreakDisplay({ days, celebrating }: {
  days: number;
  celebrating: boolean;
}) {
  return <div className={`streak-display ${celebrating ? 'streak-celebrating' : ''}`}>
    <div aria-hidden="true" className="streak-flame mx-auto relative flex h-20 w-20 items-center justify-center rounded-full bg-[#fff1df] text-[#c86018]">
      <span className="streak-halo absolute inset-0 rounded-full border border-[#efb66f]"/>
      <Flame size={40} fill="currentColor" strokeWidth={1.5}/>
      {celebrating && <span className="streak-sparks absolute inset-0">
        {Array.from({ length: 8 }, (_, i) => <i key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 45}deg)` }}><span className="streak-spark absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-[#d49235]"/></i>)}
      </span>}
    </div>
    <div key={days} className="streak-number text-[clamp(5.5rem,28vw,8rem)] leading-none font-black tracking-[-.09em] mt-5 tabular-nums">{days}</div>
    <div className="text-base font-bold text-slate-600 mt-2">დღე ზედიზედ</div>
  </div>;
}
