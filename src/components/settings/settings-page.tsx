'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { catalogue } from '../../lib/catalogue';
import { applyApplicationBackup, clearApplicationData, createApplicationBackup, inspectApplicationBackup, type BackupPreview } from '../../lib/data/application-backup';

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function SettingsPage() {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('');

  const exportBackup = () => {
    try {
      download(`smartbasket-copia-${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date())}.json`, createApplicationBackup(window.localStorage, new Date().toISOString()));
      setMessage('Cópia de segurança transferida. Guarde o ficheiro num local seguro.');
    } catch { setMessage('Não foi possível criar a cópia. Os dados locais não foram alterados.'); }
  };

  const selectBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const checked = inspectApplicationBackup(await file.text(), window.localStorage);
      setPreview(checked);
      setMessage(checked.ok ? '' : checked.errors.join(' ') + ' Os dados atuais foram preservados.');
    } catch {
      setPreview(null);
      setMessage('Não foi possível ler o ficheiro. Os dados atuais foram preservados.');
    }
  };

  const restore = () => {
    if (!preview?.ok) return;
    const approved = window.confirm('A reposição substituirá os dados SmartBasket guardados neste dispositivo. Já verificou o resumo e tem uma cópia atual dos dados?');
    const result = applyApplicationBackup(window.localStorage, preview, approved);
    if (!result.ok) { setMessage(result.error); return; }
    setMessage('Cópia reposta com sucesso. A página vai atualizar os dados carregados.');
    window.location.reload();
  };

  const reset = () => {
    const approved = window.confirm('Apagar os dados SmartBasket deste dispositivo? Esta ação remove catálogo personalizado, plano, preferências, observações e histórico. Exporte uma cópia antes de continuar.');
    if (!approved) return;
    try {
      clearApplicationData(window.localStorage, true);
      setPreview(null);
      setMessage('Os dados guardados foram apagados. Os dados base da aplicação continuam disponíveis.');
    } catch { setMessage('O navegador não permitiu apagar todos os dados.'); }
  };

  return <main className="management-shell">
    <header className="management-heading"><span className="eyebrow">Neste dispositivo</span><h1>Definições e dados</h1><p>Gira as cópias de segurança e os dados locais do SmartBasket.</p></header>
    <section className="management-card"><h2>Como são guardados os dados</h2><p>O catálogo personalizado, o plano, as respostas guardadas, as observações e os respetivos registos ficam no armazenamento local deste navegador. Não são enviados para uma conta ou servidor. Limpar os dados do navegador também os pode remover.</p><p>As preferências de supermercado, agregado, refeições, alimentação, alergénios e despensa fazem parte das respostas guardadas do plano. Pode revê-las ao iniciar uma nova configuração. Não existem opções globais separadas nesta versão.</p><p>O catálogo base da aplicação não é alterado por uma reposição.</p><a className="button button-secondary" href="/">Rever preferências do plano</a><a className="button button-secondary" href="/catalogo">Abrir catálogo de produtos</a></section>
    <section className="management-card"><h2>Cópia de segurança</h2><p>A cópia inclui catálogo e preços, histórico de preços, observações, aprovações, alterações registadas, plano, preferências do assistente e estado de geração.</p><button className="button button-primary" type="button" onClick={exportBackup}>Transferir cópia JSON</button><div className="restore-controls"><label className="field-label" htmlFor="backup-file">Escolher uma cópia JSON para validar</label><input ref={input} id="backup-file" type="file" accept="application/json,.json" onChange={selectBackup} /></div>
      {preview && <div className="backup-preview" aria-live="polite"><h3>Pré-visualização — {fileName}</h3>{preview.ok ? <><p>Versão {preview.backup.schemaVersion} · exportada em {new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeZone: 'Europe/Lisbon' }).format(new Date(preview.backup.exportedAt))}</p><ul>{Object.entries(preview.counts).map(([label, count]) => <li key={label}>{label}: {count}</li>)}</ul>{preview.conflicts.length > 0 && <p className="warning-copy">A reposição substituirá alterações locais em {preview.conflicts.length} produto(s) com o mesmo ID. Reveja o ficheiro e guarde os dados atuais antes de confirmar.</p>}<button className="button button-primary" type="button" onClick={restore}>Validar e repor dados</button></> : <p role="alert">{preview.errors.join(' ')}</p>}</div>}
    </section>
    <section className="management-card danger-card"><h2>Apagar dados locais</h2><p>Remove os dados guardados do SmartBasket neste navegador. Esta operação não pode ser anulada sem uma cópia de segurança.</p><button className="button button-danger" type="button" onClick={reset}>Apagar os meus dados</button></section>
    {message && <p className="management-message" role="status">{message}</p>}
    <p className="management-footnote">Catálogo base: {catalogue.products.length} produtos. Os dados personalizados podem diferir.</p>
  </main>;
}
