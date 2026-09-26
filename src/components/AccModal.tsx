import { useState } from 'react';
import { Check, Trash } from '@phosphor-icons/react';
import { maskCpf } from '../lib/format.ts';
import type { Account } from '../lib/types.ts';
import { Dialog, ErrorLine } from './ui.tsx';

export function AccModal({ initial, onClose, onSave, onDelete }: {
  initial: Account | null;
  onClose: () => void;
  onSave: (a: Account) => Promise<void>;
  onDelete: (a: Account) => void;
}) {
  const [acc, setAcc] = useState<Account>(initial ? { ...initial } : { id: '', name: '', cpf: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Account>) => { setAcc(s => ({ ...s, ...p })); setError(''); };

  async function save() {
    if (!acc.name.trim()) return setError('Informe o nome.');
    if (acc.cpf && acc.cpf.replace(/\D/g, '').length !== 11) return setError('CPF deve ter 11 dígitos.');
    if (acc.email && !/^\S+@\S+\.\S+$/.test(acc.email.trim())) return setError('E-mail inválido.');
    setBusy(true);
    try {
      await onSave({ ...acc, name: acc.name.trim(), email: acc.email.trim() });
    } catch (e) {
      setError((e as Error).message || 'Não foi possível salvar.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={initial ? 'Editar conta' : 'Nova conta'} onClose={onClose} width={440}>
      <div className="field"><label htmlFor="acc-name">Nome</label><input id="acc-name" className="input" placeholder="Nome do titular" value={acc.name} onChange={e => set({ name: e.target.value })} autoFocus /></div>
      <div className="field"><label htmlFor="acc-cpf">CPF</label><input id="acc-cpf" className="input" inputMode="numeric" placeholder="000.000.000-00" value={acc.cpf} onChange={e => set({ cpf: maskCpf(e.target.value) })} /></div>
      <div className="field"><label htmlFor="acc-email">E-mail</label><input id="acc-email" className="input" type="email" placeholder="nome@email.com" value={acc.email} onChange={e => set({ email: e.target.value })} /></div>
      <div className="field"><label htmlFor="acc-pass">Senha</label><input id="acc-pass" className="input" type="text" placeholder="Senha da conta" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={acc.password} onChange={e => set({ password: e.target.value })} /></div>
      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {initial && (
          <button className="btn btn-ghost" onClick={() => onDelete(initial)} style={{ color: 'var(--color-neutral-400)' }}><Trash className="icon" />Excluir conta</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}><Check className="icon" />{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </Dialog>
  );
}
