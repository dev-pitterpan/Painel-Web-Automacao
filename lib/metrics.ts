import type { DashboardData, HistoryRow } from "./types";

export function parseHistoryDate(value: string) {
	const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})(?::(\d{2}))?$/);
	if (match) {
		const [, day, month, year, hour, minute, second = "00"] = match;
		return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function matches(row: HistoryRow, options: { q: string; marca: string; status: string }) {
	const searchable = [row.sku, row.tituloAntes, row.tituloDepois, row.marca].join(" ").toLowerCase();
	return (!options.q || searchable.includes(options.q)) &&
		(!options.marca || row.marca === options.marca) &&
		(!options.status || row.status.toLowerCase().includes(options.status));
}


function isValidBrand(value: string) {
	const brand = String(value || "").trim();
	if (!brand) return false;

	// Remove valores que claramente não são marcas,
	// como 0, códigos de barras e outros códigos apenas numéricos.
	// Uma marca válida precisa conter pelo menos uma letra.
	return /\p{L}/u.test(brand);
}

function percentageChange(current: number, previous: number) {
	if (previous === 0) return null;
	return ((current - previous) / previous) * 100;
}

export function calculateTimeSavedMinutes(productCount: number, settings = { manualSecondsPerProduct: 60, batchSize: 5, batchSeconds: 40 }) {
	if (!Number.isFinite(productCount) || productCount <= 0) return 0;
	const normalizedCount = Math.floor(productCount);
	const manualSeconds = normalizedCount * settings.manualSecondsPerProduct;
	const automatedSeconds = Math.ceil(normalizedCount / settings.batchSize) * settings.batchSeconds;
	return Math.max(0, (manualSeconds - automatedSeconds) / 60);
}

function calculateMetrics(rows: HistoryRow[], timeSettings: { manualSecondsPerProduct: number; batchSize: number; batchSeconds: number }) {
	const sucesso = rows.filter(row => !row.status.toLowerCase().startsWith("erro")).length;
	const erros = rows.length - sucesso;
	return {
		total: rows.length,
		sucesso,
		erros,
		taxaSucesso: rows.length ? sucesso / rows.length * 100 : 0,
		titulosAlterados: rows.filter(row => row.tituloAlterado).length,
		tagsAlteradas: rows.filter(row => row.tagsAlteradas).length,
		colecoesAlteradas: rows.filter(row => row.colecoesAlteradas).length,
		descricoesGeradas: rows.filter(row => row.descricaoGerada).length,
		tempoEconomizadoMin: calculateTimeSavedMinutes(rows.length, timeSettings)
	};
}

function monthRange(month: string) {
	const [year, value] = month.split("-").map(Number);
	const start = new Date(`${month}-01T00:00:00-03:00`).getTime();
	const nextMonth = value === 12 ? 1 : value + 1;
	const nextYear = value === 12 ? year + 1 : year;
	return { start, end: new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00-03:00`).getTime() };
}

function previousMonthOf(month: string) {
	const [year, value] = month.split("-").map(Number);
	return `${value === 1 ? year - 1 : year}-${String(value === 1 ? 12 : value - 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
	const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00-03:00`));
	return label.charAt(0).toUpperCase() + label.slice(1);
}

function matchesQuality(row: HistoryRow, quality: string) {
	if (!quality) return true;
	if (quality === "missingTitle") return !String(row.tituloDepois || row.tituloAntes).trim();
	if (quality === "missingBrand") return !isValidBrand(row.marca);
	if (quality === "missingTags") return !String(row.tagsDepois || row.tagsAntes).trim();
	if (quality === "missingCollection") return !String(row.colecoesDepois || row.colecoesAntes).trim();
	if (quality === "missingSku") return !String(row.sku).trim();
	if (quality === "errors") return row.status.toLowerCase().startsWith("erro");
	return true;
}

export function buildDashboard(rows: HistoryRow[], options: { q?: string; marca?: string; status?: string; days?: number; month?: string; compareMonth?: string; quality?: string; catalog?: boolean; timeSettings?: { manualSecondsPerProduct: number; batchSize: number; batchSeconds: number } } = {}): DashboardData {
	const days = options.days || 30;
	const timeSettings = options.timeSettings || { manualSecondsPerProduct: 60, batchSize: 5, batchSeconds: 40 };
	const now = Date.now();
	const fullPeriod = options.month === "all";
	const validMonth = /^\d{4}-\d{2}$/.test(options.month || "") ? options.month! : null;
	const currentRange = validMonth ? monthRange(validMonth) : null;
	const currentStart = fullPeriod ? Number.NEGATIVE_INFINITY : currentRange?.start ?? now - days * 86400000;
	const currentEnd = fullPeriod ? Number.POSITIVE_INFINITY : currentRange?.end ?? now;
	const requestedComparison = /^\d{4}-\d{2}$/.test(options.compareMonth || "") ? options.compareMonth! : validMonth ? previousMonthOf(validMonth) : null;
	const comparisonRange = requestedComparison ? monthRange(requestedComparison) : null;
	const previousStart = comparisonRange?.start ?? currentStart - days * 86400000;
	const previousEnd = comparisonRange?.end ?? currentStart;
	const filters = { q: (options.q || "").toLowerCase(), marca: options.marca || "", status: (options.status || "").toLowerCase() };
	const periodRows = rows.filter(row => {
		const date = parseHistoryDate(row.dataHora);
		return date !== null && date.getTime() >= currentStart && date.getTime() < currentEnd && matches(row, filters) && matchesQuality(row, options.quality || "");
	}).sort((a, b) => (parseHistoryDate(b.dataHora)?.getTime() || 0) - (parseHistoryDate(a.dataHora)?.getTime() || 0));
	const catalogRows = rows
		.filter(row => matches(row, filters) && matchesQuality(row, options.quality || ""))
		.sort((a, b) => (parseHistoryDate(b.dataHora)?.getTime() || 0) - (parseHistoryDate(a.dataHora)?.getTime() || 0));
	// Na aba Produtos, cada linha preenchida da planilha representa um produto
	// processado e precisa permanecer visível, inclusive quando o SKU se repete.
	// A planilha já descarta linhas totalmente vazias durante a leitura.
	const currentRows = options.catalog ? catalogRows : periodRows;
	const previousRows = options.catalog || fullPeriod ? [] : rows.filter(row => {
		const date = parseHistoryDate(row.dataHora);
		return date !== null && date.getTime() >= previousStart && date.getTime() < previousEnd && matches(row, filters) && matchesQuality(row, options.quality || "");
	});
	const metrics = calculateMetrics(currentRows, timeSettings);
	const previous = calculateMetrics(previousRows, timeSettings);
	const comparisons = {
		total: percentageChange(metrics.total, previous.total),
		sucesso: percentageChange(metrics.sucesso, previous.sucesso),
		erros: percentageChange(metrics.erros, previous.erros),
		taxaSucesso: previous.taxaSucesso ? metrics.taxaSucesso - previous.taxaSucesso : null,
		titulosAlterados: percentageChange(metrics.titulosAlterados, previous.titulosAlterados),
		tagsAlteradas: percentageChange(metrics.tagsAlteradas, previous.tagsAlteradas),
		colecoesAlteradas: percentageChange(metrics.colecoesAlteradas, previous.colecoesAlteradas),
		descricoesGeradas: percentageChange(metrics.descricoesGeradas, previous.descricoesGeradas),
		tempoEconomizadoMin: percentageChange(metrics.tempoEconomizadoMin, previous.tempoEconomizadoMin)
	};
	const daily = new Map<string, { sucesso: number; erros: number }>();
	currentRows.forEach(row => {
		const date = parseHistoryDate(row.dataHora);
		const key = date ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date) : "Sem data";
		const value = daily.get(key) || { sucesso: 0, erros: 0 };
		row.status.toLowerCase().startsWith("erro") ? value.erros++ : value.sucesso++;
		daily.set(key, value);
	});
	const brands = new Map<string, number>();
	currentRows.forEach(row => {
		const key = String(row.marca || "").trim();

		if (!isValidBrand(key)) {
			return;
		}

		brands.set(key, (brands.get(key) || 0) + 1);
	});
	return {
		rows: currentRows,
		metrics: { ...metrics, comparisons },
		byDay: [...daily.entries()].map(([data, value]) => ({ data, ...value })),
		byBrand: [...brands.entries()].map(([marca, total]) => ({ marca, total })).sort((a, b) => b.total - a.total).slice(0, 20),
		brands: [...new Set(
			rows
				.map(row => String(row.marca || "").trim())
				.filter(isValidBrand)
		)].sort((a, b) => a.localeCompare(b, "pt-BR")),
		comparison: {
			available: !fullPeriod && previousRows.length > 0,
			label: requestedComparison ? monthLabel(requestedComparison) : "período anterior"
		}
	};
}
