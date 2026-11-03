export type Account = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  password: string; // senha da conta no programa (exibida em texto)
};

/**
 * compra: compra de pontos Livelo · compra_latam: compra de milhas LATAM
 * transf: Livelo → LATAM (com bônus) · transf_livelo: Livelo → outra conta Livelo · venda: venda de milhas LATAM
 */
export type OpType = 'compra' | 'compra_latam' | 'transf' | 'transf_livelo' | 'venda';

export type Operation = {
  id: string;
  accountId: string; // na transf_livelo, a conta de origem
  toAccountId?: string; // somente transf_livelo: conta Livelo de destino
  type: OpType;
  date: string; // AAAA-MM-DD
  qty: number;
  value?: number; // compras (pago), venda (recebido) e transf_livelo (taxa paga, opcional)
  bonus?: number; // somente transf: % de bônus
  bonusQty?: number; // somente compras: pontos/milhas de bônus (quantidade absoluta)
  cpfQty?: number; // somente venda: CPFs (passageiros) emitidos
  createdAt: number;
};

export type Data = { accounts: Account[]; ops: Operation[] };
