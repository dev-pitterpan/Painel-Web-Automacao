export type HistoryRow = {
  dataHora: string;
  sku: string;
  marca: string;
  tituloAntes: string;
  tituloDepois: string;
  tagsAntes: string;
  tagsDepois: string;
  colecoesAntes: string;
  colecoesDepois: string;
  tituloAlterado: boolean;
  tagsAlteradas: boolean;
  colecoesAlteradas: boolean;
  descricaoGerada: boolean;
  status: string;
};

type MetricComparisons = {
  total: number | null;
  sucesso: number | null;
  erros: number | null;
  taxaSucesso: number | null;
  titulosAlterados: number | null;
  tagsAlteradas: number | null;
  colecoesAlteradas: number | null;
  descricoesGeradas: number | null;
  tempoEconomizadoMin: number | null;
};

export type DashboardData = {
  rows: HistoryRow[];
  metrics: {
    total: number;
    sucesso: number;
    erros: number;
    taxaSucesso: number;
    titulosAlterados: number;
    tagsAlteradas: number;
    colecoesAlteradas: number;
    descricoesGeradas: number;
    tempoEconomizadoMin: number;
    comparisons: MetricComparisons;
  };
  byDay: Array<{ data: string; sucesso: number; erros: number }>;
  byBrand: Array<{ marca: string; total: number }>;
  brands: string[];
  source?: {
    status: "connected";
    lastSyncedAt: string;
    sheetName: string;
    totalRows: number;
    totalErrors: number;
  };
};
