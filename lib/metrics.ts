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

export function calculateTimeSavedMinutes(productCount: number) {
	if (!Number.isFinite(productCount) || productCount <= 0) return 0;
	const normalizedCount = Math.floor(productCount);
	const manualSeconds = normalizedCount * 60;
	const automatedSeconds = Math.ceil(normalizedCount / 5) * 40;
	return Math.max(0, (manualSeconds - automatedSeconds) / 60);
}

function calculateMetrics(rows: HistoryRow[]) {
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
		tempoEconomizadoMin: calculateTimeSavedMinutes(rows.length)
	};
}

export function buildDashboard(rows: HistoryRow[], options: { q?: string; marca?: string; status?: string; days?: number; month?: string } = {}): DashboardData {
	const days = options.days || 30;
	const now = Date.now();
	const fullPeriod = options.month === "all";
	const validMonth = /^\d{4}-\d{2}$/.test(options.month || "") ? options.month! : null;
	const [selectedYear, selectedMonth] = validMonth ? validMonth.split("-").map(Number) : [0, 0];
	const currentStart = fullPeriod ? Number.NEGATIVE_INFINITY : validMonth ? new Date(`${validMonth}-01T00:00:00-03:00`).getTime() : now - days * 86400000;
	const currentEnd = fullPeriod ? Number.POSITIVE_INFINITY : validMonth ? new Date(`${selectedYear}-${String(selectedMonth === 12 ? 1 : selectedMonth + 1).padStart(2, "0")}-01T00:00:00-03:00`).setFullYear(selectedMonth === 12 ? selectedYear + 1 : selectedYear) : now;
	const previousYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
	const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
	const previousStart = validMonth ? new Date(`${previousYear}-${String(previousMonth).padStart(2, "0")}-01T00:00:00-03:00`).getTime() : currentStart - days * 86400000;
	const previousEnd = validMonth ? currentStart : currentStart;
	const filters = { q: (options.q || "").toLowerCase(), marca: options.marca || "", status: (options.status || "").toLowerCase() };
	const currentRows = rows.filter(row => {
		const date = parseHistoryDate(row.dataHora);
		return date !== null && date.getTime() >= currentStart && date.getTime() < currentEnd && matches(row, filters);
	});
	const previousRows = fullPeriod ? [] : rows.filter(row => {
		const date = parseHistoryDate(row.dataHora);
		return date !== null && date.getTime() >= previousStart && date.getTime() < previousEnd && matches(row, filters);
	});
	const metrics = calculateMetrics(currentRows);
	const previous = calculateMetrics(previousRows);
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
		)].sort((a, b) => a.localeCompare(b, "pt-BR"))
	};
}
