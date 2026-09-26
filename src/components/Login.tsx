import { useState, type FormEvent } from 'react';
import { LockSimple, SignIn } from '@phosphor-icons/react';
import { ErrorLine } from './ui.tsx';

export function Login({ setup, onSubmit }: { setup: boolean; onSubmit: (user: string, pass: string) => Promise<void> }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!user.trim() || !pass) return setError('Informe usuário e senha.');
    if (setup) {
      if (pass.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
      if (pass !== pass2) return setError('As senhas não conferem.');
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(user.trim(), pass);
    } catch (err) {
      setError((err as Error).message || 'Não foi possível acessar. Tente novamente.');
      setBusy(false);
    }
  }

  const clear = () => setError('');
  return (
    <div className="login-wrap">
      <form onSubmit={submit} className="card elev-md login">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="brand-icon"><LockSimple size={18} /></span>
          <div>
            <div className="brand-title">Gestor de Milhas</div>
            <div className="brand-sub">{setup ? 'Crie seu acesso' : 'Entre para continuar'}</div>
          </div>
        </div>
        <div className="field"><label htmlFor="u">Usuário</label><input id="u" className="input" autoComplete="username" value={user} onChange={e => { setUser(e.target.value); clear(); }} autoFocus /></div>
        <div className="field"><label htmlFor="p">Senha</label><input id="p" className="input" type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={pass} onChange={e => { setPass(e.target.value); clear(); }} /></div>
        {setup && (
          <>
            <div className="field"><label htmlFor="p2">Confirmar senha</label><input id="p2" className="input" type="password" autoComplete="new-password" value={pass2} onChange={e => { setPass2(e.target.value); clear(); }} /></div>
            <div className="muted" style={{ fontSize: 12 }}>Os dados ficam protegidos por esta senha. Sem ela não é possível recuperá-los.</div>
          </>
        )}
        <ErrorLine>{error}</ErrorLine>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}><SignIn className="icon" />{busy ? 'Aguarde…' : setup ? 'Criar acesso' : 'Entrar'}</button>
      </form>
    </div>
  );
}
