'use client';

import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

const DISMISSED_KEY = 'no-sugar-install-prompt-dismissed-v1';

type InstallEvent = Event & {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallPrompt() {
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);
  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [manualSteps, setManualSteps] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const userAgent = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(userAgent);
    const android = /Android/i.test(userAgent);
    const installed = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if ((!ios && !android) || installed) return;
    try { if (localStorage.getItem(DISMISSED_KEY)) return; } catch { /* Still show the prompt. */ }

    queueMicrotask(() => {
      setPlatform(ios ? 'ios' : 'android');
      setVisible(true);
    });

    function onInstallAvailable(event: Event) {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      setManualSteps(false);
    }
    function onInstalled() {
      setVisible(false);
      try { localStorage.setItem(DISMISSED_KEY, 'installed'); } catch { /* Optional memory. */ }
    }
    window.addEventListener('beforeinstallprompt', onInstallAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_KEY, 'dismissed'); } catch { /* Optional memory. */ }
  }

  async function install() {
    if (!installEvent) { setManualSteps(true); return; }
    try {
      const result = await installEvent.prompt();
      setInstallEvent(null);
      if (result.outcome === 'accepted') dismiss();
      else setManualSteps(true);
    } catch {
      setManualSteps(true);
    }
  }

  if (!visible || !platform) return null;

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#17291d]/50 p-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[3px] sm:items-center" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="install-title" className="w-full max-w-md rounded-[1.75rem] bg-white p-6 text-[#192b20] shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e2f3e7] text-[#247a4d]"><Download size={27}/></div>
        <button onClick={dismiss} aria-label="დახურვა" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0f3ed] text-slate-600"><X size={21}/></button>
      </div>
      <h2 id="install-title" className="mt-6 text-2xl font-black leading-tight">დაამატე მთავარ ეკრანზე</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">„უშაქროდ“ ტელეფონზე აპივით გაიხსნება და ყოველდღე მარტივად შემოხვალ.</p>

      {platform === 'ios' || manualSteps ? <div className="mt-6 rounded-2xl bg-[#f3f7f1] p-5 text-base leading-relaxed">
        <p className="font-bold">{platform === 'ios' ? 'iPhone-ზე დამატება' : 'ბრაუზერიდან დამატება'}</p>
        {platform === 'ios' ? <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
          <li>გახსენი ეს გვერდი Safari-ში. უმჯობესია, ჯერ დაამატო და შემდეგ შეიყვანო შენი სახელი.</li>
          <li>ქვედა ან ზედა ზოლში დააჭირე გაზიარებას <Share2 size={17} className="inline align-middle"/>.</li>
          <li>აირჩიე „მთავარ ეკრანზე დამატება“ და შემდეგ „დამატება“.</li>
        </ol> : <p className="mt-3 text-slate-700">გახსენი ბრაუზერის მენიუ ⋮ და აირჩიე „აპის დაყენება“ ან „მთავარ ეკრანზე დამატება“.</p>}
      </div> : null}

      {platform === 'android' && !manualSteps ? <button onClick={() => void install()} className="mt-6 min-h-14 w-full rounded-2xl bg-[#247a4d] px-4 text-base font-bold text-white">მთავარ ეკრანზე დამატება</button> : <button onClick={dismiss} className="mt-6 min-h-14 w-full rounded-2xl bg-[#247a4d] px-4 text-base font-bold text-white">გასაგებია</button>}
      <button onClick={dismiss} className="mt-3 min-h-11 w-full text-sm text-slate-500">ახლა არა</button>
    </section>
  </div>;
}
