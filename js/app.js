import { CNAES, ICMS, SIMPLES, TRANSICAO } from './data.js';
import * as Core from './core.js';

let cnae = null;
let anoSelecionado = 2026;
let issAliquota = 0.05; // Alíquota ISS padrão (pode ser alterada pelo usuário)

// ================= UI UPDATERS =================

function atualizarInfoAno(){
    const info = {
        2025: 'Sistema atual.',
        2026: 'Fase de teste - CBS/IBS 1% compensável. NFs devem destacar IBS/CBS (informativo).',
        2027: 'PIS/COFINS extintos. Início do Split Payment.',
        2028: 'Estabilização: CBS plena (8,8%) + IBS fixo (0,1%).',
        2029: 'Início da redução do ICMS/ISS (90%) e aumento do IBS.',
        2030: 'ICMS/ISS reduz para 80%. IBS sobe.',
        2031: 'ICMS/ISS reduz para 70%. IBS sobe.',
        2032: 'ICMS/ISS reduz para 60%. IBS sobe.',
        2033: 'Sistema novo completo (IVA 26,5%).'
    };
    document.getElementById('yearInfo').textContent = anoSelecionado + ' - ' + (info[anoSelecionado] || '');
}

function showAnexo(n, btn){
    document.querySelectorAll('.tab-anexo').forEach(x=>x.classList.remove('active'));
    if(btn) btn.classList.add('active');
    const anexo = SIMPLES[n];
    let h = `<h4 style="margin-bottom:12px;">${anexo.n}</h4><table><thead><tr><th>Faixa</th><th>Até</th><th>Alíquota</th><th>Dedução</th></tr></thead><tbody>`;
    anexo.f.forEach((f,i)=>{
        h += `<tr><td>${i+1}ª</td><td>${Core.fmtC(f.a)}</td><td>${Core.fmtP(f.al)}</td><td>${Core.fmtC(f.d)}</td></tr>`;
    });
    h += '</tbody></table>';
    document.getElementById('tblAnexo').innerHTML = h;
}

// ================= RENDER LOGIC =================

function renderResultados(fat, ano, pres, real, mei, simples){
    document.getElementById('placeholder').classList.add('hidden');
    document.getElementById('resultados').classList.remove('hidden');
    document.getElementById('anoTitulo').textContent = ano;

    let arr = [
        {n:'L. Presumido', v:pres.total, a:pres.aliq, o:pres},
        {n:'L. Real', v:real.total, a:real.aliq, o:real}
    ];
    if(mei.ok) arr.push({n:'MEI', v:mei.anual, a:mei.aliq});
    if(simples.ok) arr.push({n:'Simples', v:simples.anual, a:simples.aliq});
    arr.sort((a,b)=>a.v-b.v);
    const melhor = arr[0];

    document.getElementById('sumMelhor').textContent = melhor.n;
    document.getElementById('sumCarga').textContent = Core.fmtP(melhor.a);
    document.getElementById('sumTributos').textContent = Core.fmtC(melhor.v);

    let cred = (melhor.n==='L. Presumido' || melhor.n==='L. Real') ? melhor.o.detalhes.cred : 0;
    document.getElementById('sumCreditos').textContent = Core.fmtC(cred);

    renderSplitPayment(fat, ano, melhor);

    let html = '';

    // MEI CARD
    html += `<div class="result-card mei ${mei.ok?'':'disabled'} ${melhor.n==='MEI'?'best':''}">
        ${melhor.n==='MEI'?'<span class="best-badge">⭐ MELHOR</span>':''}
        <div class="result-title">MEI</div>
        ${mei.ok ? `
            <div class="result-row"><span class="lbl">Mensal:</span><span class="val">${Core.fmtC(mei.mensal || mei.anual/12)}</span></div>
            <div class="result-total"><span class="big">${Core.fmtC(mei.anual)}</span></div>
        ` : `<div class="alert alert-danger">${mei.msg || 'Indisponível'}</div>`}
    </div>`;

    // SIMPLES CARD
    html += `<div class="result-card simples ${simples.ok?'':'disabled'} ${melhor.n==='Simples'?'best':''}">
        ${melhor.n==='Simples'?'<span class="best-badge">⭐ MELHOR</span>':''}
        <div class="result-title">Simples Nacional</div>
        ${simples.ok ? `
            <div class="result-row"><span class="lbl">Anexo:</span><span class="val">${simples.anexo}</span></div>
            ${simples.msg ? `<div style="font-size:10px;color:orange">${simples.msg}</div>` : ''}
            <div class="result-total"><span class="big">${Core.fmtC(simples.anual)}</span></div>
            ${ano >= 2029 ? '<div class="alert alert-warning" style="margin-top:10px; padding:5px; font-size:9px;">⚠️ Estimativa. Tabela de desconto CBS/IBS pendente.</div>' : ''}
        ` : '<div class="alert alert-danger">Acima do Limite</div>'}
    </div>`;

    html += cardCorporativo('L. Presumido', pres, melhor.n==='L. Presumido', fat, ano);
    html += cardCorporativo('L. Real', real, melhor.n==='L. Real', fat, ano);

    document.getElementById('cards').innerHTML = html;
    renderGrafico(melhor);
    renderSistemas(ano, pres);
}

function cardCorporativo(titulo, dados, isBest, fat, ano){
    const d = dados.detalhes;

    // Aviso LC 224/2025 para empresas > R$ 5M no Presumido
    let avisoLC224 = '';
    if (titulo.includes('Presumido') && ano >= 2026 && fat > 5000000) {
        avisoLC224 = '<div style="font-size:9px; color:#f39c12; margin-top:5px;">⚠️ LC 224/25: +10% na base de presunção sobre excedente de R$ 5M</div>';
    }

    return `<div class="result-card ${titulo.includes('Real')?'real':'presumido'} ${isBest?'best':''}">
        ${isBest?'<span class="best-badge">⭐ MELHOR</span>':''}
        <div class="result-title">${titulo}</div>
        <div class="result-row"><span class="lbl">PIS/COF:</span><span class="val">${Core.fmtC(d.pis)}</span></div>
        <div class="result-row"><span class="lbl">ICMS/ISS:</span><span class="val">${Core.fmtC(d.icms)}</span></div>
        <div class="result-row"><span class="lbl">IBS/CBS Liq:</span><span class="val">${Core.fmtC(d.novo)}</span></div>
        <div class="result-row"><span class="lbl">IRPJ/CSLL:</span><span class="val">${Core.fmtC(d.irpj)}</span></div>
        ${d.cred > 0 ? `<div class="result-row" style="color:green"><span class="lbl">Crédito B2B:</span><span class="val">${Core.fmtC(d.cred)}</span></div>` : ''}
        <div class="result-total"><span class="big">${Core.fmtC(dados.total)}</span></div>
        ${avisoLC224}
    </div>`;
}

function renderSplitPayment(fat, ano, melhor){
    const ativo = ano >= 2027;
    let retencao = 0;
    let recuperado = 0;

    if(ativo && (melhor.n.includes('Real') || melhor.n.includes('Presumido'))){
        retencao = melhor.o.debitoBruto;
        recuperado = melhor.o.detalhes.cred;
    }

    // Tipo de operação (B2B vs B2C)
    let tipoOp = '';
    if (ano === 2027) {
        tipoOp = '<div style="font-size:9px; color:#1565c0; margin-top:3px;">📋 B2B: Split facultativo | B2C: Split obrigatório</div>';
    }

    document.getElementById('cfBruto').textContent = Core.fmtC(fat);
    document.getElementById('cfSplit').textContent = ativo ? ("- " + Core.fmtC(retencao)) : "R$ 0,00";
    document.getElementById('cfRecuperado').textContent = ativo ? ("+ " + Core.fmtC(recuperado)) : "R$ 0,00";
    document.getElementById('cfLiquido').textContent = Core.fmtC(fat - melhor.v);

    // Adiciona info sobre B2B/B2C se 2027
    const splitNote = document.querySelector('#cardSplit .split-note');
    if (splitNote) {
        splitNote.innerHTML = tipoOp;
    }
}

function renderGrafico(melhor){
    if(!melhor.o) return;

    const d = melhor.o.detalhes;
    const total = melhor.v;

    const p = {
        pis: (d.pis/total)*100,
        icms: (d.icms/total)*100,
        cbs: (d.cbs/total)*100,
        ibs: (d.ibs/total)*100,
        irpj: (d.irpj/total)*100
    };

    document.getElementById('chartComposicao').innerHTML = `
        <div class="chart-bar">
            ${p.pis > 0 ? `<div class="chart-segment seg-pis" style="width:${p.pis}%">PIS/COF</div>` : ''}
            ${p.icms > 0 ? `<div class="chart-segment seg-icms" style="width:${p.icms}%">ICMS/ISS</div>` : ''}
            ${p.cbs > 0 ? `<div class="chart-segment seg-cbs" style="width:${p.cbs}%">CBS</div>` : ''}
            ${p.ibs > 0 ? `<div class="chart-segment seg-ibs" style="width:${p.ibs}%">IBS</div>` : ''}
            ${p.irpj > 0 ? `<div class="chart-segment seg-irpj" style="width:${p.irpj}%">IR/CSLL</div>` : ''}
        </div>
        <div class="legend">
            ${p.cbs > 0 ? '<div class="legend-item"><div class="legend-color seg-cbs"></div> CBS (Federal)</div>' : ''}
            ${p.ibs > 0 ? '<div class="legend-item"><div class="legend-color seg-ibs"></div> IBS (Est/Mun)</div>' : ''}
            ${p.irpj > 0 ? '<div class="legend-item"><div class="legend-color seg-irpj"></div> IRPJ/CSLL</div>' : ''}
        </div>
    `;
}

function renderSistemas(ano, trib){
    const regra = TRANSICAO[ano] || TRANSICAO[2033];
    const pisPct = (!regra.semPisCofins ? regra.antigo : 0) * 100;
    const icmsPct = regra.antigo * 100;
    const novoPct = regra.cbsAliq > 0.01 ? 100 : (regra.cbsAliq > 0 ? 10 : 0);

    let html = '';
    if(pisPct > 0 || icmsPct > 0){
        html += `<div class="system-box old"><div class="title">🔴 Sistema Antigo (Em extinção)</div>
            ${pisPct>0?`<div class="progress-bar"><div class="progress-fill progress-old" style="width:${pisPct}%">PIS/COFINS ${pisPct}%</div></div>`:''}
            ${icmsPct>0?`<div class="progress-bar"><div class="progress-fill progress-old" style="width:${icmsPct}%">ICMS/ISS ${icmsPct}%</div></div>`:''}
        </div>`;
    }
    if(novoPct > 0){
        html += `<div class="system-box new"><div class="title">🟢 Sistema Novo (Implementação)</div>
            <div class="progress-bar"><div class="progress-fill progress-new" style="width:${novoPct}%">IBS/CBS (Split Payment)</div></div>
            ${regra.compensavel ? '<div style="font-size:10px;color:green">2026: Compensação integral com impostos antigos.</div>' : ''}
            ${ano === 2026 ? '<div style="font-size:9px;color:#1565c0;margin-top:3px;">📋 Obrigatório destacar IBS/CBS nas NFs (caráter informativo)</div>' : ''}
        </div>`;
    }
    document.getElementById('sistemasGrid').innerHTML = html;
}

function gerarComparativo(){
  const $ = (id) => document.getElementById(id);

  // Se não quiser digitar na aba comparativo:
  // - se fatComp/compraComp estiverem vazios, herda da calculadora
  const fatCompEl = $('fatComp');
  const compraCompEl = $('compraComp');

  const fatCalcEl = $('fatAnual');
  const compraCalcEl = $('comprasAnual');

  if (fatCompEl && (!fatCompEl.value || fatCompEl.value.trim() === '')) {
    if (fatCalcEl && fatCalcEl.value) fatCompEl.value = fatCalcEl.value;
  }
  if (compraCompEl && (!compraCompEl.value || compraCompEl.value.trim() === '')) {
    if (compraCalcEl && compraCalcEl.value) compraCompEl.value = compraCalcEl.value;
  }

  const fat = parseMoeda(fatCompEl ? fatCompEl.value : '0') || 0;
  const compras = parseMoeda(compraCompEl ? compraCompEl.value : '0') || 0;

  const regimeEl = $('regimeComp');
  const regime = regimeEl ? regimeEl.value : 'presumido';

  // Parâmetros adicionais - herdados da calculadora (sem exigir digitação)
  const tipo = ($('tipo') && $('tipo').value) ? $('tipo').value : 'servicos';
  const uf = ($('uf') && $('uf').value) ? $('uf').value : 'SP';
  const especial = ($('regimeEspecial') && $('regimeEspecial').value) ? $('regimeEspecial').value : 'padrao';
  const custoP = parseFloat(($('custoP') && $('custoP').value) ? $('custoP').value : '0') || 0;
  const folha = parseMoeda(($('folhaAnual') && $('folhaAnual').value) ? $('folhaAnual').value : '0') || 0;

  const alvo = $('resComparativo');
  if(!alvo) return;

  if(!fat){
    alvo.innerHTML = `<div style="padding:10px;">Informe o faturamento (ou preencha na Calculadora e volte aqui).</div>`;
    return;
  }

  const origem = $('fatAnual') ? 'Mesmos parâmetros da Calculadora' : 'Campos do Comparativo';
  const fmt = (n) => (n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  // Modo completo (com todas as colunas) quando o select estiver em "compararTodos"
  const compararTodos = (regime === 'compararTodos');

  if (compararTodos) {
    let h = `
      <div style="margin:6px 0 12px 0; font-size:13px; opacity:.9;">
        Parâmetros usados - ${origem} - Tipo: <b>${tipo}</b> - UF: <b>${uf}</b> - Regime especial: <b>${especial}</b> - Compras: <b>${fmt(compras)}</b>
      </div>

      <table style="width:100%; text-align:left; border-collapse:collapse;">
        <thead>
          <tr style="background:#f0f0f0; border-bottom:2px solid #ddd;">
            <th style="padding:8px;">Ano</th>
            <th style="padding:8px;">Melhor</th>
            <th style="padding:8px; text-align:right;">Total</th>
            <th style="padding:8px; text-align:right;">Presumido</th>
            <th style="padding:8px; text-align:right;">Real</th>
            <th style="padding:8px; text-align:right;">Simples</th>
            <th style="padding:8px; text-align:right;">MEI</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (let y = 2025; y <= 2033; y++){
      const presumido = Core.calcPresumido(fat, compras, tipo, uf, y, especial, issAliquota);
      const real = Core.calcReal(fat, compras, folha, custoP, tipo, uf, y, especial, issAliquota);
      const fatorR = Core.calcFatorR(fat, folha);
      const simples = Core.calcSimples(fat, 5, fatorR, y);
      const mei = Core.calcMEI(fat, tipo === 'servicos' ? 'servicos' : 'comercio', cnae ? cnae.c : null);

      const arr = [];
      if(presumido && presumido.ok) arr.push({ nome:'Presumido', v:(presumido.total ?? presumido.anual ?? 0) });
      if(real && real.ok) arr.push({ nome:'Real', v:(real.total ?? real.anual ?? 0) });
      if(simples && simples.ok) arr.push({ nome:'Simples', v:(simples.total ?? simples.anual ?? 0) });
      if(mei && mei.ok) arr.push({ nome:'MEI', v:(mei.total ?? mei.anual ?? 0) });

      arr.sort((a,b)=>a.v-b.v);
      const melhor = arr[0];

      h += `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${y}</td>
          <td style="padding:8px;">${melhor ? melhor.nome : '-'}</td>
          <td style="padding:8px; text-align:right;"><b>${fmt(melhor ? melhor.v : 0)}</b></td>
          <td style="padding:8px; text-align:right;">${fmt(presumido && presumido.ok ? (presumido.total ?? presumido.anual ?? 0) : 0)}</td>
          <td style="padding:8px; text-align:right;">${fmt(real && real.ok ? (real.total ?? real.anual ?? 0) : 0)}</td>
          <td style="padding:8px; text-align:right;">${fmt(simples && simples.ok ? (simples.total ?? simples.anual ?? 0) : 0)}</td>
          <td style="padding:8px; text-align:right;">${fmt(mei && mei.ok ? (mei.total ?? mei.anual ?? 0) : 0)}</td>
        </tr>
      `;
    }

    h += `</tbody></table>`;
    alvo.innerHTML = h;
    return;
  }

  // Modo "regime atual vs anos" (uma coluna de total)
  let nome = regime;
  let h = `
    <div style="margin:6px 0 12px 0; font-size:13px; opacity:.9;">
      Parâmetros usados - ${origem} - Tipo: <b>${tipo}</b> - UF: <b>${uf}</b> - Regime especial: <b>${especial}</b> - Compras: <b>${fmt(compras)}</b>
    </div>

    <table style="width:100%; text-align:left; border-collapse:collapse;">
      <thead>
        <tr style="background:#f0f0f0; border-bottom:2px solid #ddd;">
          <th style="padding:8px;">Ano</th>
          <th style="padding:8px;">Regime</th>
          <th style="padding:8px; text-align:right;">Total</th>
          <th style="padding:8px; text-align:right;">Alíquota</th>
          <th style="padding:8px;">Obs.</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let y = 2025; y <= 2033; y++){
    let r = null;
    let label = '';

    if (regime === 'presumido' || regime === 'Lucro Presumido'){
      label = 'Lucro Presumido';
      r = Core.calcPresumido(fat, compras, tipo, uf, y, especial, issAliquota);
    } else if (regime === 'real' || regime === 'Lucro Real'){
      label = 'Lucro Real';
      r = Core.calcReal(fat, compras, folha, custoP, tipo, uf, y, especial, issAliquota);
    } else if (regime === 'simples' || regime === 'Simples Nacional'){
      label = 'Simples Nacional';
      const fatorR = Core.calcFatorR(fat, folha);
      r = Core.calcSimples(fat, 5, fatorR, y);
    } else if (regime === 'mei' || regime === 'MEI'){
      label = 'MEI';
      r = Core.calcMEI(fat, tipo === 'servicos' ? 'servicos' : 'comercio', cnae ? cnae.c : null);
    } else {
      // fallback: tenta presumido
      label = 'Lucro Presumido';
      r = Core.calcPresumido(fat, compras, tipo, uf, y, especial, issAliquota);
    }

    const ok = r && r.ok;
    const total = ok ? (r.total ?? r.anual ?? 0) : 0;
    const aliq = ok ? (r.aliq || 0) : 0;
    const obs = ok ? '' : (r && r.msg ? r.msg : 'Não elegível');

    h += `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px;">${y}</td>
        <td style="padding:8px;">${label}</td>
        <td style="padding:8px; text-align:right;"><b>${fmt(total)}</b></td>
        <td style="padding:8px; text-align:right;">${(aliq*100).toFixed(2)}%</td>
        <td style="padding:8px; opacity:.8;">${obs}</td>
      </tr>
    `;
  }

  h += `</tbody></table>`;
  alvo.innerHTML = h;
}
// ================= MAIN CONTROLLER =================

function calcular(silent = false){
    const fat = parseMoeda(document.getElementById('fatAnual').value);
    const compras = parseMoeda(document.getElementById('comprasAnual').value);
    const folha = parseMoeda(document.getElementById('folhaAnual').value);
    const custoP = parseFloat(document.getElementById('custoP').value)||70;
    const tipo = document.getElementById('tipo').value;
    const uf = document.getElementById('uf').value;
    const regimeEsp = document.getElementById('regimeEspecial').value;
    const ano = anoSelecionado;

    // ISS do município (se disponível)
    const issEl = document.getElementById('issAliq');
    if (issEl) {
        issAliquota = parseFloat(issEl.value) / 100 || 0.05;
    }

    // Updates Fator R UI
    const fatorR = Core.calcFatorR(fat, folha);
    document.getElementById('fatorR').value = Core.fmtP(fatorR);

    if(fat<=0){
        if(!silent) alert('Informe o faturamento');
        return;
    }

    const anexo = cnae ? cnae.a : (tipo==='comercio'?1:3);
    const cnaeCodigo = cnae ? cnae.c : null;

    const tribPresumido = Core.calcPresumido(fat, compras, tipo, uf, ano, regimeEsp, issAliquota);
    const tribReal = Core.calcReal(fat, compras, folha, custoP, tipo, uf, ano, regimeEsp, issAliquota);
    const mei = Core.calcMEI(fat, tipo, cnaeCodigo);
    const simples = Core.calcSimples(fat, anexo, fatorR, ano);

    renderResultados(fat, ano, tribPresumido, tribReal, mei, simples);
}

// Event Listeners Initialization
document.addEventListener('DOMContentLoaded', () => {
    // 1. Populate UF
    const ufSelect = document.getElementById('uf');
    ufSelect.innerHTML = '';
    Object.keys(ICMS).sort().forEach(uf => {
        const option = document.createElement('option');
        option.value = uf;
        option.text = `${uf} - ${(ICMS[uf] * 100).toFixed(1).replace('.', ',')}%`;
        if(uf === 'SP') option.selected = true;
        ufSelect.appendChild(option);
    });

    // 2. Year Selector
    document.querySelectorAll('.year-btn').forEach(btn => {
        btn.addEventListener('click', function(){
            document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            anoSelecionado = parseInt(this.dataset.year);
            atualizarInfoAno();
            if(parseFloat(document.getElementById('fatAnual').value) > 0) calcular(true);
        });
    });

    // 3. Tab System (Main)
    document.querySelectorAll('#mainTabs .tab').forEach(btn => {
        btn.addEventListener('click', function(){
            const t = this.dataset.tab;
            // Sincroniza valores da Calculadora -> Comparativo ao abrir a aba
            if (t === 'comparativo') {
                const fatAnualEl = document.getElementById('fatAnual');
                const comprasAnualEl = document.getElementById('comprasAnual');
                const fatCompEl = document.getElementById('fatComp');
                const compraCompEl = document.getElementById('compraComp');
                if (fatAnualEl && fatCompEl) fatCompEl.value = fatAnualEl.value || '';
                if (comprasAnualEl && compraCompEl) compraCompEl.value = comprasAnualEl.value || '';
                // aplica máscara de moeda se existir
                if (typeof aplicarMascaraMoeda === 'function') {
                    if (fatCompEl) aplicarMascaraMoeda({ target: fatCompEl });
                    if (compraCompEl) aplicarMascaraMoeda({ target: compraCompEl });
                }
            }
            document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
            document.querySelectorAll('#mainTabs .tab').forEach(x=>x.classList.remove('active'));
            document.getElementById('tab_'+t).classList.add('active');
            this.classList.add('active');
        });
    });

    // 4. Tab System (Anexos)
    document.querySelectorAll('.tab-anexo').forEach(btn => {
        btn.addEventListener('click', function(){
            showAnexo(parseInt(this.dataset.anexo), this);
        });
    });

    // Init Anexo Tab
    showAnexo(1, document.querySelector('.tab-anexo[data-anexo="1"]'));

    // 5. Live Calculation Inputs
    document.querySelectorAll('#form input, #form select').forEach(el => {
        if(el.id !== 'cnaeInput') {
            el.addEventListener('input', () => calcular(true));
            el.addEventListener('change', () => calcular(true));
        }
    });


    // 6. Comparativo: Botão e Live Calculation (Cálculo ao digitar)
    const btnComp = document.getElementById('btnComparativo');
    const inputsComp = ['fatComp', 'compraComp', 'regimeComp'];

    // Adiciona o evento ao botão
    if(btnComp) btnComp.addEventListener('click', gerarComparativo);

    // Adiciona o evento "ao digitar/mudar" nos campos da aba Comparativo
    inputsComp.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', gerarComparativo);
            el.addEventListener('change', gerarComparativo);
        }
    });

    // 7. CNAE Search
    const cnaeInput = document.getElementById('cnaeInput');
    const cnaeList = document.getElementById('cnaeList');

    cnaeInput.addEventListener('input', function(){
        const t = this.value.toLowerCase().trim();
        if(t.length < 2){ cnaeList.classList.remove('show'); return; }

        const res = CNAES.filter(c =>
            c.c.replace(/[^0-9]/g, '').includes(t) ||
            c.c.includes(t) ||
            c.d.toLowerCase().includes(t)
        ).slice(0, 30);

        if(res.length === 0) {
            cnaeList.innerHTML = `<div class="cnae-item" style="color:#999; cursor:default;">Nenhum CNAE encontrado.</div>`;
        } else {
            cnaeList.innerHTML = res.map(c =>
                `<div class="cnae-item" data-cod="${c.c}">
                    <span class="code" style="color:#0f3460; font-weight:700;">${c.c}</span>
                    ${c.mei ? '<span style="font-size:8px; background:#4caf50; color:white; padding:1px 4px; border-radius:3px; margin-left:5px;">MEI</span>' : ''}
                    <br>
                    <span style="font-size:10px; color:#555;">${c.d}</span>
                 </div>`
            ).join('');
        }
        cnaeList.classList.add('show');
    });

    // Event Delegation for CNAE Click
    cnaeList.addEventListener('click', (e) => {
        const item = e.target.closest('.cnae-item');
        if(item){
            const cod = item.dataset.cod;
            cnae = CNAES.find(c=>c.c===cod);
            if(cnae){
                cnaeInput.value = `${cnae.c} - ${cnae.d}`;
                let infoText = `Anexo ${cnae.a===5?'V':cnae.a===4?'IV':cnae.a===3?'III':cnae.a===2?'II':'I'}`;
                if (cnae.fr) infoText += ' (Fator R)';
                if (cnae.mei) infoText += ' <span style="color:#4caf50">✓ MEI</span>';
                else infoText += ' <span style="color:#e74c3c">✗ MEI não permitido</span>';
                document.getElementById('cnaeInfo').innerHTML = infoText;
                cnaeList.classList.remove('show');
                calcular(true);
            }
        }
    });

    // Close CNAE list on outside click
    document.addEventListener('click', (e) => {
        if (!cnaeInput.contains(e.target) && !cnaeList.contains(e.target)) cnaeList.classList.remove('show');
    });

    // Submit prevent default
    document.getElementById('form').addEventListener('submit', (e) => { e.preventDefault(); calcular(false); });

    // Init year info
    atualizarInfoAno();
});

// Função para aplicar a máscara de moeda (R$ 1.234,56)
function aplicarMascaraMoeda(event) {
    let value = event.target.value;

    // Remove tudo que não é dígito
    value = value.replace(/\D/g, "");

    // Formata o valor
    value = (value / 100).toFixed(2) + "";
    value = value.replace(".", ",");
    value = value.replace(/(\d)(\d{3})(\d{3}),/g, "$1.$2.$3,");
    value = value.replace(/(\d)(\d{3}),/g, "$1.$2,");

    event.target.value = value === "NaN" ? "" : value;
}

// Helper para converter a string formatada de volta para número real
function parseMoeda(valor) {
    if (!valor) return 0;
    return parseFloat(valor.replace(/\./g, '').replace(',', '.')) || 0;
}

// Inicializa os eventos de máscara
document.querySelectorAll('.money-mask').forEach(input => {
    input.addEventListener('input', aplicarMascaraMoeda);
});

// Formata valores já preenchidos (ex.: quando herda dados entre abas)
document.querySelectorAll('.money-mask').forEach(input => {
    if (input.value && !String(input.value).includes(',')) {
        // aplica máscara manualmente ao valor existente
        const fakeEvent = { target: input };
        aplicarMascaraMoeda(fakeEvent);
    }
});
