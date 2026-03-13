const state = {
  estoque: [],
  historico: [],
  currentItemId: null,
};

const STORAGE_KEY = 'almoxarifado_local_v1';

const refs = {
  views: document.querySelectorAll('.view'),
  menuItems: document.querySelectorAll('.menu-item'),
  viewTitle: document.getElementById('viewTitle'),
  viewSubtitle: document.getElementById('viewSubtitle'),
  inputExcel: document.getElementById('inputExcel'),
  importStatus: document.getElementById('importStatus'),
  tbodyEstoque: document.getElementById('tbodyEstoque'),
  tbodyHistorico: document.getElementById('tbodyHistorico'),
  relSaidasMaterial: document.getElementById('relSaidasMaterial'),
  relAbaixoMinimo: document.getElementById('relAbaixoMinimo'),
  buscaEstoque: document.getElementById('buscaEstoque'),
  filtroMinimo: document.getElementById('filtroMinimo'),
  listaCriticos: document.getElementById('listaCriticos'),
  ultimasMovimentacoes: document.getElementById('ultimasMovimentacoes'),
  kpiItens: document.getElementById('kpiItens'),
  kpiQuantidade: document.getElementById('kpiQuantidade'),
  kpiMinimo: document.getElementById('kpiMinimo'),
  kpiMov: document.getElementById('kpiMov'),
  modal: document.getElementById('modalMovimentacao'),
  formMov: document.getElementById('formMovimentacao'),
  movMaterial: document.getElementById('movMaterial'),
  movTipo: document.getElementById('movTipo'),
  movQuantidade: document.getElementById('movQuantidade'),
  movMotivo: document.getElementById('movMotivo'),
  btnCancelarMov: document.getElementById('btnCancelarMov'),
};

const TITLES = {
  dashboard: ['Dashboard', 'Resumo geral do seu estoque e movimentações.'],
  importar: ['Importar Estoque', 'Carregue o relatório exportado da sua outra plataforma.'],
  estoque: ['Estoque Atual', 'Consulte, pesquise e altere quantidades de insumos.'],
  alteracoes: ['Alterações', 'Histórico completo de entradas, saídas e ajustes.'],
  relatorios: ['Relatórios', 'Visão resumida das saídas e dos itens críticos.'],
  exportar: ['Exportar Base', 'Baixe o estoque atualizado e mantenha seu backup local.'],
};

function setView(viewId) {
  refs.views.forEach(view => view.classList.toggle('active', view.id === viewId));
  refs.menuItems.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewId));
  refs.viewTitle.textContent = TITLES[viewId][0];
  refs.viewSubtitle.textContent = TITLES[viewId][1];
}

refs.menuItems.forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

function formatNumber(value) {
  const num = Number(value || 0);
  return num.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatMoney(value) {
  const num = Number(value || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function nowBR() {
  return new Date().toLocaleString('pt-BR');
}

function buildItemKey(row) {
  const barcode = String(row['Cod. Barras'] ?? '').trim();
  if (barcode) return `bar:${barcode}`;
  return `nome:${normalizeText(row['Material'])}|${normalizeText(row['Marca'])}|${normalizeText(row['Unidade'])}`;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  return Number(cleaned) || 0;
}

function consolidateRows(rows) {
  const map = new Map();

  rows.forEach((row, index) => {
    const material = row['Material'];
    if (!material) return;

    const key = buildItemKey(row);
    const current = map.get(key) || {
      id: crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${index}`,
      numero: row['#'] ?? index + 1,
      material: String(row['Material'] ?? '').trim(),
      marca: String(row['Marca'] ?? '').trim(),
      codBarras: String(row['Cod. Barras'] ?? '').trim(),
      ncm: String(row['NCM'] ?? '').trim(),
      unidade: String(row['Unidade'] ?? '').trim(),
      qtdMin: 0,
      qtdMax: 0,
      qtdAtual: 0,
      valorUnit: 0,
      total: 0,
    };

    current.qtdMin = Math.max(current.qtdMin, toNumber(row['Qtd. Min.']));
    current.qtdMax = Math.max(current.qtdMax, toNumber(row['Qtd. Max.']));
    current.qtdAtual += toNumber(row['Qtd. Atual']);
    current.valorUnit = toNumber(row['Valor Unt.']) || current.valorUnit;
    current.total = current.qtdAtual * current.valorUnit;

    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => a.material.localeCompare(b.material, 'pt-BR'));
}

function updateDashboard() {
  refs.kpiItens.textContent = formatNumber(state.estoque.length);
  refs.kpiQuantidade.textContent = formatNumber(state.estoque.reduce((sum, item) => sum + item.qtdAtual, 0));
  refs.kpiMinimo.textContent = formatNumber(state.estoque.filter(item => item.qtdAtual <= item.qtdMin).length);
  refs.kpiMov.textContent = formatNumber(state.historico.length);

  const criticos = [...state.estoque]
    .filter(item => item.qtdAtual <= item.qtdMin)
    .sort((a, b) => a.qtdAtual - b.qtdAtual)
    .slice(0, 6);

  refs.listaCriticos.innerHTML = criticos.length
    ? criticos.map(item => `
      <div class="list-item">
        <strong>${item.material}</strong>
        <span>Saldo: ${formatNumber(item.qtdAtual)} ${item.unidade} • Mínimo: ${formatNumber(item.qtdMin)}</span>
      </div>
    `).join('')
    : '<div class="empty-state">Nenhum item abaixo do mínimo.</div>';

  const ultimas = [...state.historico].slice(-6).reverse();
  refs.ultimasMovimentacoes.innerHTML = ultimas.length
    ? ultimas.map(item => `
      <div class="list-item">
        <strong>${item.material}</strong>
        <span>${item.data} • ${item.tipo.toUpperCase()} • ${formatNumber(item.quantidade)}</span>
      </div>
    `).join('')
    : '<div class="empty-state">Nenhuma movimentação registrada.</div>';
}

function getFilteredStock() {
  const term = normalizeText(refs.buscaEstoque.value);
  const mode = refs.filtroMinimo.value;

  return state.estoque.filter(item => {
    const matchText = !term || [
      item.material,
      item.marca,
      item.codBarras,
      item.unidade
    ].some(value => normalizeText(value).includes(term));

    const matchMin = mode === 'todos' || item.qtdAtual <= item.qtdMin;
    return matchText && matchMin;
  });
}

function renderStock() {
  const rows = getFilteredStock();

  refs.tbodyEstoque.innerHTML = rows.length ? rows.map(item => `
    <tr>
      <td>
        <strong>${item.material}</strong><br>
        <small>${item.codBarras || 'Sem código de barras'}</small>
      </td>
      <td>${item.marca || '-'}</td>
      <td>${item.unidade || '-'}</td>
      <td>${formatNumber(item.qtdMin)}</td>
      <td>${formatNumber(item.qtdAtual)}</td>
      <td>${formatMoney(item.valorUnit)}</td>
      <td>
        <span class="badge ${item.qtdAtual <= item.qtdMin ? 'low' : 'ok'}">
          ${item.qtdAtual <= item.qtdMin ? 'Abaixo do mínimo' : 'Normal'}
        </span>
      </td>
      <td>
        <div class="row-actions">
          <button data-id="${item.id}" data-action="saida">Retirar</button>
          <button data-id="${item.id}" data-action="entrada">Adicionar</button>
          <button data-id="${item.id}" data-action="ajuste">Ajustar</button>
        </div>
      </td>
    </tr>
  `).join('') : `
    <tr><td colspan="8"><div class="empty-state">Nenhum item encontrado.</div></td></tr>
  `;

  refs.tbodyEstoque.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => openMovementModal(btn.dataset.id, btn.dataset.action));
  });
}

function renderHistory() {
  const rows = [...state.historico].reverse();
  refs.tbodyHistorico.innerHTML = rows.length ? rows.map(item => `
    <tr>
      <td>${item.data}</td>
      <td>${item.material}</td>
      <td>${item.tipo}</td>
      <td>${formatNumber(item.antes)}</td>
      <td>${formatNumber(item.quantidade)}</td>
      <td>${formatNumber(item.depois)}</td>
      <td>${item.motivo}</td>
    </tr>
  `).join('') : `
    <tr><td colspan="7"><div class="empty-state">Nenhuma alteração registrada.</div></td></tr>
  `;
}

function renderReports() {
  const saidas = state.historico
    .filter(item => item.tipo === 'saida')
    .reduce((acc, item) => {
      acc[item.material] = (acc[item.material] || 0) + item.quantidade;
      return acc;
    }, {});

  const saidasOrdenadas = Object.entries(saidas).sort((a, b) => b[1] - a[1]).slice(0, 12);

  refs.relSaidasMaterial.innerHTML = saidasOrdenadas.length
    ? saidasOrdenadas.map(([material, qtd]) => `
      <div class="list-item">
        <strong>${material}</strong>
        <span>Retirado: ${formatNumber(qtd)}</span>
      </div>
    `).join('')
    : '<div class="empty-state">Nenhuma saída registrada até agora.</div>';

  const abaixo = state.estoque.filter(item => item.qtdAtual <= item.qtdMin);

  refs.relAbaixoMinimo.innerHTML = abaixo.length
    ? abaixo.map(item => `
      <div class="list-item">
        <strong>${item.material}</strong>
        <span>Saldo: ${formatNumber(item.qtdAtual)} ${item.unidade} • Mínimo: ${formatNumber(item.qtdMin)}</span>
      </div>
    `).join('')
    : '<div class="empty-state">Nenhum item abaixo do mínimo.</div>';
}

function refreshAll() {
  updateDashboard();
  renderStock();
  renderHistory();
  renderReports();
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    estoque: state.estoque,
    historico: state.historico,
  }));
  alert('Base salva no navegador com sucesso.');
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.estoque = parsed.estoque || [];
    state.historico = parsed.historico || [];
    refreshAll();
    refs.importStatus.textContent = 'Base local carregada do navegador.';
  } catch (error) {
    console.error(error);
  }
}

function clearAllData() {
  const confirmed = confirm('Isso vai apagar a base carregada e o histórico do navegador. Deseja continuar?');
  if (!confirmed) return;
  state.estoque = [];
  state.historico = [];
  localStorage.removeItem(STORAGE_KEY);
  refs.importStatus.textContent = 'Base limpa com sucesso.';
  refreshAll();
}

function openMovementModal(itemId, actionType) {
  const item = state.estoque.find(row => row.id === itemId);
  if (!item) return;

  state.currentItemId = itemId;
  refs.movMaterial.value = item.material;
  refs.movTipo.value = actionType;
  refs.movQuantidade.value = '';
  refs.movMotivo.value = '';
  refs.modal.showModal();
}

function closeModal() {
  refs.modal.close();
  state.currentItemId = null;
}

refs.btnCancelarMov.addEventListener('click', closeModal);

refs.formMov.addEventListener('submit', (event) => {
  event.preventDefault();

  const item = state.estoque.find(row => row.id === state.currentItemId);
  if (!item) return;

  const tipo = refs.movTipo.value;
  const quantidade = Number(refs.movQuantidade.value);
  const motivo = refs.movMotivo.value.trim();

  if (!quantidade || quantidade <= 0 || !motivo) {
    alert('Preencha a quantidade e o motivo.');
    return;
  }

  const antes = item.qtdAtual;
  let depois = antes;

  if (tipo === 'saida') {
    depois = antes - quantidade;
    if (depois < 0) {
      alert('A saída não pode deixar saldo negativo.');
      return;
    }
  } else if (tipo === 'entrada') {
    depois = antes + quantidade;
  } else {
    depois = quantidade;
  }

  item.qtdAtual = depois;
  item.total = item.qtdAtual * item.valorUnit;

  state.historico.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `mov-${Date.now()}`,
    data: nowBR(),
    material: item.material,
    tipo,
    antes,
    quantidade,
    depois,
    motivo,
  });

  saveSilently();
  refreshAll();
  closeModal();
  setView('alteracoes');
});

function saveSilently() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    estoque: state.estoque,
    historico: state.historico,
  }));
}

refs.buscaEstoque.addEventListener('input', renderStock);
refs.filtroMinimo.addEventListener('change', renderStock);
document.getElementById('btnSalvarLocal').addEventListener('click', saveLocal);
document.getElementById('btnLimparTudo').addEventListener('click', clearAllData);

function importWorkbook(workbook) {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  state.estoque = consolidateRows(rows);
  state.historico = [];
  saveSilently();
  refreshAll();

  refs.importStatus.textContent = `Arquivo importado com sucesso. ${state.estoque.length} itens consolidados a partir da planilha "${firstSheetName}".`;
  setView('estoque');
}

refs.inputExcel.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  importWorkbook(workbook);
});

document.getElementById('btnImportarExemplo').addEventListener('click', async () => {
  const response = await fetch('Relatorio_de_Estoque_8793.xlsx');
  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer);
  importWorkbook(workbook);
});

function exportToExcel(data, fileName, sheetName) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

document.getElementById('btnExportarEstoque').addEventListener('click', () => {
  if (!state.estoque.length) return alert('Não há estoque para exportar.');
  exportToExcel(state.estoque.map(item => ({
    Material: item.material,
    Marca: item.marca,
    'Cod. Barras': item.codBarras,
    Unidade: item.unidade,
    'Qtd. Min.': item.qtdMin,
    'Qtd. Max.': item.qtdMax,
    'Qtd. Atual': item.qtdAtual,
    'Valor Unt.': item.valorUnit,
    Total: item.total,
  })), 'estoque_atualizado.xlsx', 'Estoque');
});

document.getElementById('btnExportarHistorico').addEventListener('click', () => {
  if (!state.historico.length) return alert('Não há histórico para exportar.');
  exportToExcel(state.historico.map(item => ({
    Data: item.data,
    Material: item.material,
    Tipo: item.tipo,
    Antes: item.antes,
    Quantidade: item.quantidade,
    Depois: item.depois,
    Motivo: item.motivo,
  })), 'historico_movimentacoes.xlsx', 'Historico');
});

document.getElementById('btnExportarBackup').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({
    estoque: state.estoque,
    historico: state.historico,
    exportadoEm: nowBR(),
  }, null, 2)], { type: 'application/json' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'backup_almoxarifado.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

loadLocal();
refreshAll();
