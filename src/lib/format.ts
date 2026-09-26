const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (v?: number) => {
  v = v || 0;
  return (v < -0.004 ? '−' : '') + moneyFmt.format(Math.abs(v));
};
export const num = (v?: number) => intFmt.format(Math.round(v || 0));
export const dec = (v?: number) => decFmt.format(v || 0);
export const dt = (iso?: string) => {
  const [y, m, d] = (iso || '').split('-');
  return d ? `${d}/${m}/${y}` : '';
};
export const today = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/** Aceita "3000", "3.000,00", "3000,5", "R$ 3.000". */
export const parseBR = (s: string | number | undefined) => {
  if (typeof s === 'number') return s;
  let t = String(s || '').replace(/[R$\s ]/g, '');
  t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\./g, '');
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
};
export const parsePct = (s: string | undefined) => {
  const n = parseFloat(String(s || '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
export const maskCpf = (s: string) => {
  const d = String(s || '').replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};
/** Máscara de quantidade inteira com ponto de milhar enquanto digita. */
export const maskQty = (s: string) => {
  const d = s.replace(/\D/g, '').slice(0, 12);
  return d ? num(parseInt(d, 10)) : '';
};
export const plural = (n: number, s: string, p: string) => (n === 1 ? `1 ${s}` : `${n} ${p}`);
export const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
