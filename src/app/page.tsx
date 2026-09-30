'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Flame, History, Home, RotateCcw, Trash2, WifiOff } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { STORAGE_KEY, APP_TITLE, CHALLENGE } from '@/lib/config';
import { addDays, dayNumber, localDate } from '@/lib/dates';
import type { ChallengeState } from '@/lib/types';
import { errorMessage, nameKey, normalizeName } from '@/lib/participant-name';

function stats(dates: string[], today: string) {
  const days = [...new Set(dates.filter(d => d <= today))].sort();
  let best = 0, run = 0, prev = '';
  for (const day of days) { run = prev && addDays(prev, 1) === day ? run + 1 : 1; best = Math.max(best, run); prev = day; }
  const current = prev === today || prev === addDays(today, -1) ? run : 0;
  return { current, best, total: days.length };
}

function friendlyError(message: string) {
  if (/NAME_TAKEN|participants_name_unique/i.test(message)) return 'ეს სახელი უკვე გამოყენებულია. მიუთითე სხვა სახელი ან დაამატე გვარი.';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) return 'კავშირი ვერ დამყარდა. შეამოწმე ინტერნეტი და სცადე ხელახლა.';
  if (/duplicate|unique/i.test(message)) return 'დღევანდელი მონიშვნა უკვე შენახულია.';
  if (/outside the challenge/i.test(message)) return 'ამ დღეს გამოწვევაში მონიშვნა შეუძლებელია.';
  if (/Invalid check-in date/i.test(message)) return 'მოწყობილობის თარიღი შეამოწმე და სცადე ხელახლა.';
  if (/Device not found|Invalid device token/i.test(message)) return 'ამ მოწყობილობის მონაცემები ვერ მოიძებნა. სცადე ხელახლა შესვლა.';
  return 'მოქმედება ვერ შესრულდა. სცადე ხელახლა.';
}

export default function Page() {
  const [state, setState] = useState<ChallengeState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const today = localDate();
  const supabase = useMemo(() => getSupabase(), []);
  const configured = !!supabase;

  const refresh = useCallback(async (deviceToken: string | null) => {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data, error: dbError } = await supabase.rpc('challenge_state', { p_token: deviceToken, p_today: localDate() });
      if (dbError) throw dbError;
      const next = data as ChallengeState;
      setState(next);
      if (deviceToken && !next.me) { localStorage.removeItem(STORAGE_KEY); setToken(null); }
      setError('');
    } catch (e) { setError(friendlyError(errorMessage(e))); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => {
    queueMicrotask(() => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(STORAGE_KEY); if (saved && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(saved)) { localStorage.removeItem(STORAGE_KEY); saved = null; } } catch { setError('ბრაუზერის მეხსიერება მიუწვდომელია. ჩართე ის, რომ მოწყობილობამ დაგიმახსოვროს.'); }
      setToken(saved); void refresh(saved);
    });
  }, [refresh]);

  async function join() {
    if (!supabase || lock.current || !name.trim()) return;
    setNotice('');
    const cleanName = normalizeName(name);
    if (state?.crew.some(member => nameKey(member.name) === nameKey(cleanName))) {
      setError(friendlyError('NAME_TAKEN'));
      return;
    }
    lock.current = true; setBusy(true); setError('');
    try {
      const id = crypto.randomUUID();
      const { error: dbError } = await supabase.rpc('challenge_join', { p_name: cleanName, p_token: id });
      if (dbError) throw dbError;
      localStorage.setItem(STORAGE_KEY, id);
      setToken(id);
      await refresh(id);
    } catch (e) { setError(friendlyError(errorMessage(e))); }
    finally { lock.current = false; setBusy(false); }
  }
  async function checkIn() {
    if (!supabase || !token || !state || lock.current || state.my_dates.includes(today)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { error: dbError } = await supabase.rpc('challenge_check_in', { p_token: token, p_today: today });
      if (dbError) throw dbError;
      setState(previous => previous ? { ...previous, my_dates: [...previous.my_dates, today], crew: previous.crew.map(m => m.is_me ? { ...m, checked_in_today: true, current_streak: stats([...previous.my_dates, today], today).current } : m) } : previous);
      await refresh(token);
    } catch (e) { setError(friendlyError(errorMessage(e))); }
    finally { lock.current = false; setBusy(false); }
  }
  function reset() { if (lock.current) return; setNotice(''); try { localStorage.removeItem(STORAGE_KEY); } catch { /* UI still resets */ } setToken(null); setState(previous => previous ? { ...previous, me: null, my_dates: [] } : previous); setTab('today'); }

  async function deleteProfile() {
    if (!supabase || !token || !state?.me || lock.current) return;
    if (!window.confirm('ნამდვილად გინდა შენი პროფილის წაშლა? შენი სახელი და ყველა მონიშვნა სამუდამოდ წაიშლება. აღდგენა შეუძლებელია.')) return;
    lock.current = true;
    setDeleting(true);
    setBusy(true);
    setError('');
    try {
      const { error: dbError } = await supabase.rpc('challenge_delete_me', { p_token: token });
      if (dbError) throw dbError;
      // Clear local identity only after the database confirms deletion.
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* This token no longer resolves to a participant. */ }
      setToken(null);
      setName('');
      setState(previous => previous ? {
        ...previous, me: null, my_dates: [],
        crew: previous.crew.filter(member => member.id !== previous.me?.id),
      } : previous);
      setTab('today');
      setNotice('შენი პროფილი და ყველა მონიშვნა წაშლილია.');
    } catch {
      setError('წაშლის დადასტურება ვერ მივიღეთ. შეამოწმე ინტერნეტი და ხელახლა სცადე პროფილის წაშლა.');
    } finally {
      lock.current = false;
      setDeleting(false);
      setBusy(false);
    }
  }

  const day = dayNumber(CHALLENGE.startDate, today);
  const checked = !!state?.my_dates.includes(today);
  const own = stats(state?.my_dates ?? [], today);
  const goalDays = CHALLENGE.goalDays;
  const canCheck = !!state?.challenge && day >= 1 && day <= CHALLENGE.calendarDays && own.total < goalDays;
  const progress = Math.min(100, Math.round(own.total / goalDays * 100));
  const challengeTitle = CHALLENGE.name;
  const needsDatabaseUpdate = !!state && (state.challenge.start_date !== CHALLENGE.startDate || state.challenge.duration_days !== CHALLENGE.calendarDays || state.challenge.goal_days !== CHALLENGE.goalDays);

  return <main className="min-h-dvh w-full max-w-2xl mx-auto px-4 sm:px-8 pb-32">
    {notice && <p role="status" className="mt-4 rounded-2xl bg-[#dff2e4] p-4 text-[#247a4d]">{notice}</p>}
    <header className="min-h-20 border-b border-[#e3eae0] flex items-center justify-between"><div className="text-base tracking-[.04em] font-black">{APP_TITLE}<span className="text-[#247a4d]">.</span></div><div className="h-2 w-2 rounded-full bg-[#247a4d] shadow-[0_0_0_4px_#e2f3e7]" /></header>
    {!configured ? <div className="rounded-3xl border border-amber-400/30 bg-[#fff8eb] p-6 mt-16"><h1 className="text-2xl font-bold">საჭიროა გამართვა</h1><p className="text-slate-600 mt-3 leading-relaxed">ჩაწერე NEXT_PUBLIC_SUPABASE_URL და NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local ფაილში, შემდეგ ხელახლა გაუშვი სერვერი. Supabase-ის SQL Editor-ში გაუშვი supabase/setup.sql.</p></div> : loading && !state ? <div className="mt-28 text-center text-slate-600 animate-pulse">გამოწვევა იტვირთება…</div> : <>
      {error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-800 flex gap-3 items-center"><WifiOff size={18} className="shrink-0"/><span className="flex-1">{error}</span><button className="ml-auto min-h-11 font-bold underline" disabled={busy} onClick={() => { if (!lock.current) void refresh(token); }}>ხელახლა</button></div>}
      {needsDatabaseUpdate && <div role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">გამოწვევის პარამეტრები მონაცემთა ბაზაში ჯერ არ განახლებულა. ორგანიზატორმა ხელახლა უნდა გაუშვას supabase/setup.sql.</div>}
      {!state?.me ? <section className="mx-auto max-w-md min-h-[calc(100dvh-6rem)] flex flex-col justify-center py-8 sm:py-16"><p className="text-[#247a4d] text-sm font-bold mb-5">პატარა ნაბიჯი, ყოველდღე</p><h1 className="text-[clamp(3.3rem,16vw,5.6rem)] leading-[.98] font-black tracking-[-.055em]">{APP_TITLE}<span className="text-[#247a4d]">.</span></h1><p className="mt-8 text-xl font-bold text-[#192b20]">{challengeTitle}</p><p className="mt-2 text-slate-600">იწყება 1 ოქტომბერს და მთავრდება 31 დეკემბერს.</p><form className="mt-14" onSubmit={e => { e.preventDefault(); void join(); }}><label htmlFor="name" className="text-sm font-bold tracking-[.16em] text-slate-600">როგორ მოგმართოთ?</label><input id="name" value={name} onChange={e => setName(e.target.value)} maxLength={40} autoComplete="given-name" placeholder="შენი სახელი" className="mt-3 w-full h-16 px-5 rounded-2xl bg-[#ffffff] border border-[#dce5da] text-lg outline-none focus:border-[#247a4d]"/><button type="submit" disabled={busy || !name.trim()} className="mt-4 w-full min-h-16 px-3 rounded-2xl bg-[#247a4d] text-white font-black tracking-wider disabled:opacity-50">{busy ? 'ერთდები…' : 'გამოწვევაში შესვლა'} →</button></form><p className="mt-6 text-sm text-slate-500 text-center">საჭიროა მხოლოდ სახელი. ანგარიში და პაროლი არ გჭირდება.</p></section> : <>
        {tab === 'today' ? <><div className="flex justify-between items-end gap-3 mt-7"><div className="min-w-0"><p className="text-slate-500 text-sm font-bold">{challengeTitle}</p><h1 className="text-[clamp(1.5rem,7vw,2.25rem)] leading-tight font-bold mt-2 break-words">გამარჯობა, {state.me.name}<span className="text-[#247a4d]">.</span></h1></div><div className="shrink-0 text-right text-sm font-semibold text-slate-600">დღე <span className="text-[#192b20] text-lg">{Math.max(0, Math.min(day, goalDays))}</span> / {goalDays}</div></div>
          <section className="mt-6 rounded-[2rem] bg-[#ffffff] border border-[#e3eae0] shadow-[0_14px_40px_-28px_#45654f] p-5 sm:p-9 text-center"><div className="mx-auto w-16 h-16 rounded-full bg-[#e2f3e7] flex items-center justify-center text-[#247a4d]"><Flame size={31} fill="currentColor" strokeWidth={1.5}/></div><div className="text-[clamp(5.5rem,28vw,8rem)] leading-none font-black tracking-[-.09em] mt-5 tabular-nums">{own.current}</div><div className="text-base font-bold text-slate-600 mt-2">დღე ზედიზედ</div><p className="text-base text-slate-500 mt-5">ყოველი დღე მნიშვნელოვანია.</p><button onClick={() => void checkIn()} disabled={busy || checked || !canCheck} className={`mt-8 w-full min-h-16 px-3 rounded-2xl font-black tracking-wide transition-transform active:scale-[.98] ${checked ? 'bg-[#dff2e4] text-[#247a4d]' : 'bg-[#247a4d] text-white disabled:opacity-50'}`}>{busy ? 'ინახება…' : checked ? <><Check className="inline mr-2" size={21}/> დღეს უკვე მონიშნე</> : !canCheck ? day < 1 ? 'გამოწვევა მალე დაიწყება' : 'გამოწვევა დასრულებულია' : <><Check className="inline mr-2" size={21}/> დღესაც უშაქროდ ვარ</>}</button></section>
          <section className="mt-10"><div className="flex flex-wrap justify-between items-center gap-2 mb-4"><h2 className="text-base font-black">დღევანდელი მეგობრები</h2><span className="text-sm text-slate-500">{state.crew.filter(m => m.checked_in_today).length} / {state.crew.length} მონიშნულია</span></div><div className="rounded-3xl bg-[#ffffff] border border-[#e3eae0] overflow-hidden">{state.crew.length ? state.crew.map(member => <div key={member.id} className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b last:border-0 border-[#e3eae0]"><div className="h-10 w-10 shrink-0 rounded-full bg-[#e5f3e8] flex items-center justify-center text-[#247a4d] font-bold">{member.name[0]?.toUpperCase()}</div><div className="font-semibold flex-1 min-w-0 truncate">{member.name}{member.is_me && <span className="text-sm text-slate-500 ml-2">შენ</span>}</div><span className="shrink-0 text-base text-slate-600 flex gap-1 items-center"><Flame size={16} className="text-[#247a4d]"/>{member.current_streak}</span><span aria-label={member.checked_in_today ? 'დღეს მონიშნა' : 'დღეს არ მოუნიშნავს'} className={`ml-2 h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${member.checked_in_today ? 'bg-[#247a4d] text-white' : 'bg-[#eef1eb] text-slate-500'}`}>{member.checked_in_today ? <Check size={16} strokeWidth={3}/> : '–'}</span></div>) : <p className="p-6 text-slate-500">ჯერ არავინ შემოერთებულა.</p>}</div></section>
          <section className="mt-5 rounded-3xl bg-[#ffffff] border border-[#e3eae0] p-6"><div className="flex justify-between"><div><p className="text-sm font-bold text-slate-500">შენი პროგრესი</p><p className="font-bold mt-2">{own.total} / {goalDays} დღე</p></div><span className="text-2xl font-black text-[#247a4d]">{progress}%</span></div><div className="h-2 bg-[#e6ebe4] rounded-full mt-5 overflow-hidden"><div className="h-full bg-[#247a4d] rounded-full transition-all" style={{ width: `${progress}%` }}/></div></section>
        </> : <><div className="mt-7"><p className="text-sm font-bold text-slate-500">შენი გზა</p><h1 className="text-4xl font-black mt-2">ისტორია<span className="text-[#247a4d]">.</span></h1></div><div className="grid grid-cols-2 gap-3 mt-8">{[['მიმდინარე სერია',own.current],['საუკეთესო სერია',own.best],['წარმატებული დღე',own.total],['შესრულებულია',`${progress}%`]].map(([label,value]) => <div key={label} className="min-w-0 rounded-2xl bg-[#ffffff] p-4 sm:p-5"><p className="text-sm leading-tight font-bold text-slate-500">{label}</p><p className="text-3xl font-black mt-3">{value}</p></div>)}</div><div className="rounded-3xl bg-[#ffffff] border border-[#e3eae0] p-4 sm:p-6 mt-5"><div className="flex flex-wrap gap-2 justify-between items-baseline"><h2 className="font-bold">{challengeTitle}</h2><span className="text-sm text-slate-500">{goalDays} დღის მიზანი</span></div><div className="grid grid-cols-5 min-[380px]:grid-cols-6 sm:grid-cols-7 gap-2 mt-6">{Array.from({length: CHALLENGE.calendarDays}, (_,i) => { const date = addDays(CHALLENGE.startDate,i); const done = state.my_dates.includes(date); const future = date > today; return <div key={date} aria-label={`${i + 1}-ე დღე: ${done ? 'მონიშნულია' : future ? 'მომავალი დღე' : 'გამოტოვებულია'}`} title={`${date}: ${done ? 'მონიშნულია' : future ? 'მომავალი დღე' : 'გამოტოვებულია'}`} className={`aspect-square rounded-xl flex flex-col items-center justify-center ${done ? 'bg-[#247a4d] text-white' : future ? 'bg-[#f0f3ed] text-slate-500' : 'bg-[#f7eae8] text-slate-600'}`}><span className="text-xs font-bold opacity-60">{i+1}</span><span className="text-lg font-bold leading-none">{done ? '✓' : future ? '·' : '×'}</span></div>; })}</div><div className="flex gap-4 mt-5 text-sm text-slate-500 flex-wrap"><span>🟢 მონიშნული</span><span>× გამოტოვებული</span><span>· მომავალი</span></div></div><button disabled={busy} onClick={reset} className="mt-9 min-h-12 flex items-center gap-2 text-left text-base text-slate-500 hover:text-[#192b20]"><RotateCcw size={15}/> ეს მე არ ვარ / მოწყობილობის განულება</button><p className="mt-2 text-sm text-slate-500">ამ მოწყობილობაზე პროფილიდან გამოხვალ. შენი სახელი და მონიშვნები ბაზაში დარჩება.</p></>}
        {tab === 'history' && <section className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-rose-900">პროფილის წაშლა</h2>
          <p className="mt-3 text-base leading-relaxed text-rose-800">შენი სახელი და ყველა მონიშვნა სამუდამოდ წაიშლება. აღდგენა შეუძლებელია. წაშლის შემდეგ ამ სახელით რეგისტრაცია კვლავ შესაძლებელი იქნება.</p>
          <button type="button" disabled={busy} onClick={() => void deleteProfile()} className="mt-5 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-rose-700 px-4 py-3 text-base font-bold text-white disabled:opacity-50"><Trash2 size={21} className="shrink-0"/>{deleting ? 'იშლება…' : 'ჩემი პროფილის წაშლა'}</button>
        </section>}
        <nav aria-label="მთავარი ნავიგაცია" className="fixed bottom-0 left-0 right-0 safe-bottom bg-white/95 backdrop-blur-xl border-t border-[#dce5da]"><div className="max-w-2xl mx-auto grid grid-cols-2 px-4 sm:px-8"><button disabled={busy} onClick={() => setTab('today')} aria-current={tab === 'today' ? 'page' : undefined} className={`min-h-17 py-2 flex flex-col items-center justify-center gap-1 text-sm font-bold ${tab === 'today' ? 'text-[#247a4d]' : 'text-slate-500'}`}><Home size={21}/> დღეს</button><button disabled={busy} onClick={() => setTab('history')} aria-current={tab === 'history' ? 'page' : undefined} className={`min-h-17 py-2 flex flex-col items-center justify-center gap-1 text-sm font-bold ${tab === 'history' ? 'text-[#247a4d]' : 'text-slate-500'}`}><History size={21}/> ისტორია</button></div></nav>
      </>}
    </>}
  </main>;
}
