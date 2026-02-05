import { TRANSICAO, ICMS, SIMPLES, ALIQUOTA_PADRAO_NOVA, CNAES } from './data.js';

// ========== FORMATADORES ==========
export const fmt = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtC = v => 'R$ ' + fmt(v);
export const fmtP = v => (v * 100).toFixed(2) + '%';

// ========== CÁLCULOS AUXILIARES ==========
export function calcFatorR(fat, folha) {
    if (fat > 0 && folha > 0) {
        return folha / fat;
    }
    return 0;
}

// ========== VALIDAÇÃO CNAE-MEI ==========
export function validaCnaeMei(cnaeCodigo) {
    if (!cnaeCodigo) return { permitido: true, msg: '' };
    const cnaeObj = CNAES.find(c => c.c === cnaeCodigo);
    if (!cnaeObj) return { permitido: true, msg: '' };
    if (!cnaeObj.mei) {
        return { permitido: false, msg: `CNAE ${cnaeCodigo} não permite MEI` };
    }
    return { permitido: true, msg: '' };
}

// ========== LUCRO PRESUMIDO ==========
// Inclui LC 224/2025: Acréscimo de 10% sobre base para receitas > R$ 5M
export function calcPresumido(fat, compras, tipo, uf, ano, regimeEsp, issAliq = 0.05) {
    const regra = TRANSICAO[ano] || TRANSICAO[2033];
    let detalhes = { pis: 0, icms: 0, cbs: 0, ibs: 0, novo: 0, cred: 0, irpj: 0 };

    // 1. Tributos Antigos (PIS/COFINS e ICMS/ISS)
    if (!regra.semPisCofins) {
        detalhes.pis = fat * 0.0365 * regra.antigo;
    } else if (regra.compensavel) {
        detalhes.pis = fat * 0.0365;
    }

    // ISS: usa alíquota informada (padrão 5%, mas pode variar de 2% a 5% por município)
    // ICMS: usa alíquota do estado
    const aliqIcmsIss = tipo === 'servicos' ? issAliq : (ICMS[uf] || 0.18);
    detalhes.icms = fat * aliqIcmsIss * regra.antigo;

    // 2. Novo Sistema (CBS e IBS Separados)
    let redutor = 1.0;
    if (regimeEsp === 'prof_liberal') redutor = 0.7;
    const regimes60 = ['saude', 'educacao', 'cultura', 'transporte', 'agro'];
    if (regimes60.includes(regimeEsp)) redutor = 0.4;

    // Cálculos de Débito e Crédito
    let debCbs = fat * regra.cbsAliq * redutor;
    let credCbs = compras * regra.cbsAliq * redutor;
    let debIbs = fat * regra.ibsAliq * redutor;
    let credIbs = compras * regra.ibsAliq * redutor;

    // Em 2026, os valores são compensáveis (não geram custo extra direto no simulador)
    if (regra.compensavel) {
        detalhes.cbs = 0;
        detalhes.ibs = 0;
    } else {
        detalhes.cbs = Math.max(0, debCbs - credCbs);
        detalhes.ibs = Math.max(0, debIbs - credIbs);
    }

    detalhes.novo = detalhes.cbs + detalhes.ibs;
    detalhes.cred = credCbs + credIbs;
    const debitoBrutoTotal = debCbs + debIbs;

    // 3. IRPJ/CSLL (Base Presumida)
    // LC 224/2025: Acréscimo de 10% sobre percentuais de presunção para receita > R$ 5M
    let base = tipo === 'servicos' ? 0.32 : 0.08;

    // Aplicação da LC 224/2025 (a partir de 2026)
    let baseIrpj;
    const LIMITE_LC224 = 5000000; // R$ 5 milhões

    if (ano >= 2026 && fat > LIMITE_LC224) {
        // Base normal até R$ 5M
        const baseAte5M = LIMITE_LC224 * base;
        // Base com acréscimo de 10% sobre o excedente
        const baseAcima5M = (fat - LIMITE_LC224) * (base * 1.1);
        baseIrpj = baseAte5M + baseAcima5M;
    } else {
        baseIrpj = fat * base;
    }

    const irpj = (baseIrpj * 0.15) + (baseIrpj > 240000 ? (baseIrpj - 240000) * 0.1 : 0);
    const csll = baseIrpj * 0.09;
    detalhes.irpj = irpj + csll;

    const total = detalhes.pis + detalhes.icms + detalhes.novo + detalhes.irpj;
    return { ok: true, total, anual: total, aliq: total / fat, detalhes, debitoBruto: debitoBrutoTotal };
}

// ========== LUCRO REAL ==========
export function calcReal(fat, compras, folha, custoP, tipo, uf, ano, regimeEsp, issAliq = 0.05) {
    const regra = TRANSICAO[ano] || TRANSICAO[2033];
    let detalhes = { pis: 0, icms: 0, cbs: 0, ibs: 0, novo: 0, cred: 0, irpj: 0 };

    // 1. Tributos Antigos
    if (!regra.semPisCofins) {
        const deb = fat * 0.0925;
        const cred = compras * 0.0925;
        detalhes.pis = Math.max(0, deb - cred) * regra.antigo;
    } else if (regra.compensavel) {
        detalhes.pis = Math.max(0, (fat - compras) * 0.0925);
    }

    // ISS: usa alíquota informada (padrão 5%)
    const aliqIcmsIss = tipo === 'servicos' ? issAliq : (ICMS[uf] || 0.18);
    detalhes.icms = fat * aliqIcmsIss * regra.antigo;

    // 2. Novo Sistema (CBS e IBS Separados)
    let redutor = 1.0;
    if (regimeEsp === 'prof_liberal') redutor = 0.7;
    const regimes60 = ['saude', 'educacao', 'cultura', 'transporte', 'agro'];
    if (regimes60.includes(regimeEsp)) redutor = 0.4;

    let debCbs = fat * regra.cbsAliq * redutor;
    let credCbs = compras * regra.cbsAliq * redutor;
    let debIbs = fat * regra.ibsAliq * redutor;
    let credIbs = compras * regra.ibsAliq * redutor;

    if (regra.compensavel) {
        detalhes.cbs = 0;
        detalhes.ibs = 0;
    } else {
        detalhes.cbs = Math.max(0, debCbs - credCbs);
        detalhes.ibs = Math.max(0, debIbs - credIbs);
    }

    detalhes.novo = detalhes.cbs + detalhes.ibs;
    detalhes.cred = credCbs + credIbs;
    const debitoBrutoTotal = debCbs + debIbs;

    // 3. IRPJ/CSLL (Base Lucro Real)
    const despesasTotais = fat * (custoP / 100);
    const lucroAntesIR = Math.max(0, fat - despesasTotais);

    // IRPJ: 15% + adicional 10% sobre o que exceder R$ 20.000/mês (R$ 240.000/ano)
    const irpj = (lucroAntesIR * 0.15) + (lucroAntesIR > 240000 ? (lucroAntesIR - 240000) * 0.1 : 0);

    // CSLL: 9% para a maioria das atividades
    const csll = lucroAntesIR * 0.09;

    detalhes.irpj = irpj + csll;

    const total = detalhes.pis + detalhes.icms + detalhes.novo + detalhes.irpj;
    return { ok: true, total, anual: total, aliq: total / fat, detalhes, debitoBruto: debitoBrutoTotal };
}

// ========== MEI ==========
// Valores atualizados 2026 (SM R$ 1.621,00)
// Inclui validação de CNAE permitido para MEI
export function calcMEI(fat, tipo, cnaeCodigo = null) {
    if (fat > 81000) return { ok: false, total: 0, anual: 0, aliq: 0, msg: 'Acima de 81k' };

    // Validação de CNAE se informado
    if (cnaeCodigo) {
        const validacao = validaCnaeMei(cnaeCodigo);
        if (!validacao.permitido) {
            return { ok: false, total: 0, anual: 0, aliq: 0, msg: validacao.msg };
        }
    }

    // Valores atualizados 2026 (SM R$ 1.621,00)
    // INSS: R$ 81,05 (5% SM)
    // ICMS: R$ 1,00 | ISS: R$ 5,00
    let val;
    if (tipo === 'comercio' || tipo === 'industria') {
        val = 82.05;  // INSS + ICMS
    } else if (tipo === 'servicos') {
        val = 86.05;  // INSS + ISS
    } else {
        val = 87.05;  // INSS + ICMS + ISS (comércio e serviços)
    }
    const anual = val * 12;
    return { ok: true, total: anual, anual, aliq: anual / fat, mensal: val };
}

// ========== SIMPLES NACIONAL ==========
export function calcSimples(fat, anexo, fatorR, ano) {
    // Compatibilidade de assinatura:
    // - Forma nova: calcSimples(fat, anexo, fatorR, ano)
    // - Forma antiga (algumas telas): calcSimples(fat, folha, ano)
    if (ano === undefined && typeof fatorR === 'number' && fatorR >= 2020 && Number(anexo) > 6) {
        const folha = Number(anexo) || 0;
        ano = fatorR;
        fatorR = calcFatorR(fat, folha);
        anexo = 5; // padrão conservador quando não há seletor de anexo nessa tela
    }

    if (!fat || fat <= 0) return { ok: false, total: 0, anual: 0, aliq: 0, msg: 'Faturamento inválido' };
    if (fat > 4800000) return { ok: false, total: 0, anual: 0, aliq: 0, msg: 'Acima de 4.8M' };

    let ax = Number(anexo);
    if (!Number.isFinite(ax)) ax = 5;
    ax = Math.trunc(ax);

    // Regra do Fator R: Se Anexo V e Fator R >= 28%, migra para Anexo III
    const fatorRAplicado = ax === 5 && (Number(fatorR) || 0) >= 0.28;
    if (fatorRAplicado) ax = 3;

    // Guard: tabela do anexo existe
    if (!SIMPLES || !SIMPLES[ax] || !Array.isArray(SIMPLES[ax].f)) {
        return { ok: false, total: 0, anual: 0, aliq: 0, anexo: ax, msg: 'Tabela do Simples não encontrada' };
    }

    const faixas = SIMPLES[ax].f;

    // Guard: faixa encontrada
    let fx = faixas.find(f => fat <= f.a);
    if (!fx) fx = faixas[faixas.length - 1];
    if (!fx) return { ok: false, total: 0, anual: 0, aliq: 0, anexo: ax, msg: 'Faixa do Simples não encontrada' };

    const aliqNominal = Number(fx.al) || 0;
    const deducao = Number(fx.d) || 0;

    const aliqEfetivaBase = ((fat * aliqNominal) - deducao) / fat;
    const impostoBase = fat * aliqEfetivaBase;

    let total = impostoBase;
    let msg = "";

    // IMPORTANTE: A transição do Simples Nacional na Reforma ainda não está totalmente definida
    // Esta é uma ESTIMATIVA baseada nas discussões da LCP 214/2024
    if ((Number(ano) || 0) >= 2029) {
        // Divisão estimada: ~67% tributos federais, ~33% estaduais/municipais
        const partFederal = impostoBase * 0.67;
        const partEstadual = impostoBase * 0.33;
        const regra = TRANSICAO[ano] || TRANSICAO[2033];

        // NOTA: Este cálculo é uma APROXIMAÇÃO
        // A legislação definitiva pode ser diferente
        const descontoSimples = 0.5; // Desconto estimado de 50% sobre alíquota padrão
        const novoSimples = (fat * ALIQUOTA_PADRAO_NOVA * descontoSimples) * (1 - regra.antigo);

        total = partFederal + (partEstadual * regra.antigo) + novoSimples;
        msg = "Cálculo Híbrido - ESTIMATIVA (LCP 214 em regulamentação)";
    }

    // Adiciona info sobre Fator R se aplicado
    if (fatorRAplicado) {
        msg = msg ? msg + " | Fator R aplicado (Anexo V → III)" : "Fator R aplicado (Anexo V → III)";
    }

    return { ok: true, total: total, anual: total, aliq: total / fat, anexo: ax, msg: msg, fatorRAplicado };
}
