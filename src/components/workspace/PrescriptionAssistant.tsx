import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Bot, Mic, Square, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzePrescription } from '@/lib/prescription-assistant.functions';
import type { RxItem } from '@/lib/pharmacy-service';

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } }; length: number }; resultIndex: number }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function PrescriptionAssistant({ pharmacyId, branchId, onApply }: { pharmacyId: string; branchId: string; onApply: (items: RxItem[]) => void }) {
  const analyze = useServerFn(analyzePrescription);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string>();
  const [filename, setFilename] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof analyze>> | null>(null);
  const [review, setReview] = useState<Record<number, { selected: boolean; quantity: string; instructions: string }>>({});
  const voice = useRef<Recognition | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { voice.current?.abort(); generation.current++; }, []);
  useEffect(() => { generation.current++; setResult(null); setReview({}); }, [branchId]);
  const invalidate = () => { generation.current++; setResult(null); setReview({}); };
  const upload = async (file?: File) => {
    invalidate(); setImage(undefined); setFilename(''); setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP image up to 4 MB.'); return; }
    const reader = new FileReader();
    reader.onerror = () => setError('Could not read this image.');
    reader.onload = () => { if (typeof reader.result === 'string') { setImage(reader.result); setFilename(file.name); } };
    reader.readAsDataURL(file);
  };
  const startVoice = () => {
    if (listening) { voice.current?.stop(); return; }
    const browser = window as VoiceWindow;
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) { setError('Voice input is unavailable in this browser. Type or upload the prescription instead.'); return; }
    const recognition = new Constructor(); voice.current = recognition;
    recognition.lang = 'en-TZ'; recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = e => { let transcript = ''; for (let i = e.resultIndex; i < e.results.length; i++) transcript += `${e.results[i]?.[0]?.transcript ?? ''} `; invalidate(); setText(t => `${t} ${transcript}`.trim()); };
    recognition.onerror = () => { setListening(false); setError('Microphone or voice service unavailable. You can still type.'); };
    recognition.onend = () => setListening(false);
    try { setError(''); recognition.start(); setListening(true); } catch { setError('Could not start voice input.'); }
  };
  const submit = async () => {
    voice.current?.stop(); setBusy(true); setError(''); setResult(null);
    const version = ++generation.current;
    try {
      const next = await analyze({ data: { pharmacyId, branchId, text, image } });
      if (generation.current !== version) return;
      setResult(next);
      setReview(Object.fromEntries(next.analysis.medicines.map((m, i) => [i, { selected: false, quantity: m.quantity == null ? '' : String(m.quantity), instructions: m.instructions }])));
    } catch (e) { if (generation.current === version) setError(e instanceof Error ? e.message : 'Analysis unavailable.'); }
    finally { setBusy(false); }
  };
  const approved = result?.analysis.medicines.flatMap((m, i) => {
    const r = review[i]; const product = result.catalogue.find(p => p.id === m.product_id); const qty = Number(r?.quantity);
    return r?.selected && product && Number.isInteger(qty) && qty > 0 && qty <= product.stock ? [{ product_id: product.id, name: `${product.name} ${product.strength ?? ''}`.trim(), quantity: qty, instructions: r.instructions }] : [];
  }) ?? [];
  return <section className="space-y-3 border-y border-border py-4 text-foreground">
    <h4 className="flex items-center gap-2 font-semibold"><Bot className="size-4" />Covlo · Prescription Assistant</h4>
    <p className="text-xs text-muted-foreground">Pharmacist verification required. No diagnosis or automatic dispensing. Remove patient identifiers before uploading.</p>
    <label className="flex gap-2 text-xs items-start"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />I am authorized to send these medicine details to AI and, for voice input, the browser’s speech service.</label>
    <textarea aria-label="Prescription medicine details" rows={3} maxLength={12000} disabled={busy} value={text} onChange={e => { invalidate(); setText(e.target.value); }} placeholder="Medicine, strength, written dose and quantity" className="w-full rounded-md border border-input bg-background p-3 text-sm" />
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={!consent || busy} onClick={startVoice}>{listening ? <Square /> : <Mic />}{listening ? 'Stop' : 'Speak'}</Button>
      <label className="text-xs min-w-0"><span className="block mb-1">Prescription image</span><input aria-label="Prescription image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !consent} onChange={e => void upload(e.target.files?.[0])} className="max-w-full" /></label>
      <Button type="button" size="sm" disabled={busy || !consent || !branchId || (!text.trim() && !image)} onClick={() => void submit()}><ScanLine />{busy ? 'Analyzing…' : 'Analyze'}</Button>
    </div>
    {image && <div className="flex gap-3 items-center"><img src={image} alt="Uploaded prescription" className="h-24 w-24 object-contain border border-border" /><span className="text-xs break-all">{filename}</span><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { invalidate(); setImage(undefined); setFilename(''); }}>Remove</Button></div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {result && <div className="space-y-3">
      <p className="text-xs whitespace-pre-wrap">{result.analysis.transcription}</p>
      {result.analysis.warnings.map((w, i) => <p key={i} className="text-xs text-destructive">{w}</p>)}
      {result.analysis.medicines.map((m, i) => {
        const product = result.catalogue.find(p => p.id === m.product_id); const r = review[i];
        if (!r) return null;
        return <div key={i} className="border-b border-border pb-3 space-y-2">
          <label className="flex gap-2 text-sm"><input type="checkbox" aria-label={`Approve ${m.written_name}`} checked={r.selected} disabled={!product || product.stock <= 0} onChange={e => setReview({ ...review, [i]: { ...r, selected: e.target.checked } })} /><span>{m.written_name}<span className="block text-xs text-muted-foreground">{product ? `${product.name} ${product.strength ?? ''} · Available: ${product.stock}` : 'Uncertain or unmatched — choose manually'}</span></span></label>
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <input aria-label={`Reviewed quantity ${i + 1}`} type="number" min="1" max={product?.stock || undefined} value={r.quantity} onChange={e => setReview({ ...review, [i]: { ...r, quantity: e.target.value } })} className="min-w-0 rounded-md border border-input bg-background p-2 text-xs" placeholder="Quantity" />
            <input aria-label={`Reviewed dosage ${i + 1}`} value={r.instructions} onChange={e => setReview({ ...review, [i]: { ...r, instructions: e.target.value } })} className="min-w-0 rounded-md border border-input bg-background p-2 text-xs" placeholder="Verify written dosage" />
          </div>
        </div>;
      })}
      <Button type="button" size="sm" disabled={!approved.length} onClick={() => { onApply(approved); setResult(null); setReview({}); }}>Use reviewed medicines ({approved.length})</Button>
    </div>}
  </section>;
}