export type Account = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  password: string; // senha da conta no programa (exibida em texto)
};

export type OpType = 'compra' | 'compra_latam' | 'transf' | 'venda';

export type Operation = {
  id: string;
  accountId: string;
  type: OpType;
  date: string; // AAAA-MM-DD
  qty: number;
  value?: number; // compras (pago) e venda (recebido)
  bonus?: number; // somente transf: % de bônus
  bonusQty?: number; // somente compras: pontos/milhas de bônus (quantidade absoluta)
  createdAt: number;
};

export type Data = { accounts: Account[]; ops: Operation[] };
