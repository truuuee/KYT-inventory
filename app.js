/**
 * KYT Helmet Inventory Management System Web Application Logic
 */

(function () {
  'use strict';

  // State Management
  let allItems = [];
  let meta = {};
  let filteredItems = [];
  let currentPage = 1;
  let pageSize = 50;
  let currentSort = { column: 'no', direction: 'asc' };
  let currentCategory = 'all';
  let currentStatus = 'all';
  let searchQuery = '';

  // 동의어 / 유사 검색어 그룹 매핑 (소문자 기준)
  const SYNONYM_GROUPS = [
    ['levo', '레보'],
    ['ttr', '티티알'],
    ['글로시', '유광'],
    ['매트', '무광'],
    ['d-city', '디시티', '디씨티', 'dcity'],
    ['r1r', '알원알'],
    ['course', '코스'],
    ['galaxy', '갤럭시']
  ];

  function expandSearchToken(token) {
    const lower = token.toLowerCase();
    for (const group of SYNONYM_GROUPS) {
      if (group.some(word => word.toLowerCase() === lower)) {
        return group.map(w => w.toLowerCase());
      }
    }
    return [lower];
  }

  // DOM Elements
  const storeSyncDateEl = document.getElementById('storeSyncDate');
  const mappingStatusEl = document.getElementById('mappingStatus');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  const resultCountEl = document.getElementById('resultCount');
  
  const inventoryTable = document.getElementById('inventoryTable');
  const inventoryTableBody = document.getElementById('inventoryTableBody');
  const emptyState = document.getElementById('emptyState');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  
  const paginationBar = document.getElementById('paginationBar');
  const firstPageBtn = document.getElementById('firstPageBtn');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const lastPageBtn = document.getElementById('lastPageBtn');
  const pageNumbersEl = document.getElementById('pageNumbers');
  
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const copyToast = document.getElementById('copyToast');

  // Initialize
  init();

  async function init() {
    setupTheme();
    setupEventListeners();
    await loadData();
    applyFilters();
  }

  // ==========================================================================
  // Theme Management (Dark / Light)
  // ==========================================================================
  function setupTheme() {
    const savedTheme = localStorage.getItem('kyt_theme') || 'dark';
    setTheme(savedTheme);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.contains('theme-dark');
        const nextTheme = isDark ? 'light' : 'dark';
        setTheme(nextTheme);
      });
    }
  }

  function setTheme(theme) {
    if (theme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      if (themeIcon) themeIcon.textContent = '🌙';
      localStorage.setItem('kyt_theme', 'light');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      if (themeIcon) themeIcon.textContent = '☀️';
      localStorage.setItem('kyt_theme', 'dark');
    }
  }

  // ==========================================================================
  // Data Loading
  // ==========================================================================
  async function loadData() {
    try {
      let data = window.INVENTORY_DATA;
      if (!data) {
        const response = await fetch('inventory_data.json');
        if (!response.ok) throw new Error('inventory_data.json을 불러올 수 없습니다.');
        data = await response.json();
      }

      meta = data.meta || {};
      allItems = data.items || [];
      filteredItems = [...allItems];

      renderMetaInfo();
    } catch (err) {
      console.error('재고 데이터 로드 오류:', err);
      showEmptyState('데이터를 불러오지 못했습니다. build_inventory.py를 실행해 주세요.');
    }
  }

  function renderMetaInfo() {
    if (storeSyncDateEl) {
      storeSyncDateEl.textContent = meta.store_time || '갱신 일정';
    }
    if (mappingStatusEl) {
      mappingStatusEl.textContent = '정상 매핑';
    }
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  function setupEventListeners() {
    // Search Input
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        if (clearSearchBtn) {
          if (searchQuery.length > 0) {
            clearSearchBtn.classList.add('visible');
          } else {
            clearSearchBtn.classList.remove('visible');
          }
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          currentPage = 1;
          applyFilters();
        }, 150);
      });
    }

    // Clear Search Button
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchQuery = '';
          clearSearchBtn.classList.remove('visible');
          currentPage = 1;
          applyFilters();
          searchInput.focus();
        }
      });
    }

    // Category Filter Chips
    const categoryChips = document.getElementById('categoryChips');
    if (categoryChips) {
      categoryChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        categoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.cat;
        currentPage = 1;
        applyFilters();
      });
    }

    // Stock Status Filter Chips
    const statusChips = document.getElementById('statusChips');
    if (statusChips) {
      statusChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        statusChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentStatus = chip.dataset.status;
        currentPage = 1;
        applyFilters();
      });
    }

    // Page Size Select
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', (e) => {
        pageSize = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
        currentPage = 1;
        renderTable();
      });
    }

    // Table Sorting
    if (inventoryTable) {
      const thead = inventoryTable.querySelector('thead');
      if (thead) {
        thead.addEventListener('click', (e) => {
          const th = e.target.closest('th');
          if (!th || !th.dataset.sort) return;
          const sortKey = th.dataset.sort;

          if (currentSort.column === sortKey) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
          } else {
            currentSort.column = sortKey;
            currentSort.direction = 'asc';
          }

          updateSortHeaders();
          sortItems();
          renderTable();
        });
      }

      // One-click Copy on Table Body
      if (inventoryTableBody) {
        inventoryTableBody.addEventListener('click', (e) => {
          const copyCell = e.target.closest('.copyable');
          if (copyCell) {
            const textToCopy = copyCell.dataset.copy || copyCell.textContent.trim();
            if (textToCopy && textToCopy !== '준비중') {
              copyToClipboard(textToCopy);
            }
          }
        });
      }
    }

    // CSV Export
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', exportToCsv);
    }

    // Reset Filters Button
    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', resetAllFilters);
    }

    // Pagination Buttons
    if (firstPageBtn) firstPageBtn.addEventListener('click', () => goToPage(1));
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
    if (lastPageBtn) {
      lastPageBtn.addEventListener('click', () => {
        const totalPages = getTotalPages();
        goToPage(totalPages);
      });
    }
  }

  // ==========================================================================
  // Filtering & Sorting Logic
  // ==========================================================================
  function applyFilters() {
    let result = [...allItems];

    // 1. Category Filter
    if (currentCategory !== 'all') {
      result = result.filter(item => item.category === currentCategory);
    }

    // 2. Status Filter
    if (currentStatus === 'in-stock') {
      result = result.filter(item => item.status === 'in-stock');
    } else if (currentStatus === 'out-of-stock') {
      result = result.filter(item => item.status === 'out-of-stock');
    }

    // 3. Search Query (Multi-word search / AND condition with Synonym expansion)
    if (searchQuery) {
      const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter(item => {
        const searchTargets = [
          item.product_name || '',
          item.product_code || '',
          item.item_code || '',
          item.barcode || ''
        ].join(' ').toLowerCase();

        return tokens.every(token => {
          const variants = expandSearchToken(token);
          return variants.some(v => searchTargets.includes(v));
        });
      });
    }

    filteredItems = result;
    sortItems();

    if (resultCountEl) {
      resultCountEl.textContent = filteredItems.length.toLocaleString();
    }

    renderTable();
  }

  function sortItems() {
    const { column, direction } = currentSort;
    const modifier = direction === 'asc' ? 1 : -1;

    filteredItems.sort((a, b) => {
      let valA = a[column];
      let valB = b[column];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      // Number comparison for 'no' or 'stock' or 'price'
      if (column === 'no' || column === 'stock' || column === 'price') {
        return (Number(valA) - Number(valB)) * modifier;
      }

      // String comparison
      return String(valA).localeCompare(String(valB), 'ko') * modifier;
    });
  }

  function updateSortHeaders() {
    if (!inventoryTable) return;
    const thList = inventoryTable.querySelectorAll('thead th');
    thList.forEach(th => {
      const sortIcon = th.querySelector('.sort-icon');
      if (!sortIcon) return;

      if (th.dataset.sort === currentSort.column) {
        sortIcon.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';
        th.classList.add('sorted');
      } else {
        sortIcon.textContent = '';
        th.classList.remove('sorted');
      }
    });
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================
  function renderTable() {
    if (!inventoryTableBody) return;

    if (filteredItems.length === 0) {
      inventoryTableBody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (paginationBar) paginationBar.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (paginationBar) paginationBar.style.display = 'flex';

    // Pagination calculations
    const totalPages = getTotalPages();
    if (currentPage > totalPages) currentPage = totalPages || 1;

    let itemsToDisplay = [];
    let startIdx = 0;

    if (pageSize === 'all') {
      itemsToDisplay = filteredItems;
      startIdx = 0;
    } else {
      startIdx = (currentPage - 1) * pageSize;
      itemsToDisplay = filteredItems.slice(startIdx, startIdx + pageSize);
    }

    const htmlRows = itemsToDisplay.map((item, idx) => {
      const rowNo = startIdx + idx + 1;
      const isReadyItemCode = item.item_code === '준비중';
      const isReadyBarcode = item.barcode === '준비중';

      // Status Badge (matching image design)
      let statusBadge = '';
      if (item.status === 'in-stock') {
        statusBadge = `<div class="badge-status badge-instock"><span>보유 (O)</span></div>`;
      } else {
        statusBadge = `<div class="badge-status badge-outstock"><span>품절 (X)</span></div>`;
      }

      return `
        <tr>
          <td class="cell-no">${rowNo}</td>
          <td class="copyable" data-copy="${escapeHtml(item.product_code)}" title="클릭하여 복사">${escapeHtml(item.product_code)}</td>
          <td class="${isReadyItemCode ? 'text-ready' : 'copyable'}" data-copy="${isReadyItemCode ? '' : escapeHtml(item.item_code)}" title="${isReadyItemCode ? '' : '클릭하여 복사'}">${escapeHtml(item.item_code)}</td>
          <td class="copyable col-name" data-copy="${escapeHtml(item.product_name)}" title="클릭하여 복사">${escapeHtml(item.product_name)}</td>
          <td class="cell-price">${escapeHtml(item.price_formatted || (item.price ? item.price.toLocaleString() : '-'))}</td>
          <td class="${isReadyBarcode ? 'text-ready' : 'copyable'}" data-copy="${isReadyBarcode ? '' : escapeHtml(item.barcode)}" title="${isReadyBarcode ? '' : '클릭하여 복사'}">${escapeHtml(item.barcode)}</td>
          <td class="cell-status">${statusBadge}</td>
        </tr>
      `;
    }).join('');

    inventoryTableBody.innerHTML = htmlRows;
    renderPagination();
  }

  function getTotalPages() {
    if (pageSize === 'all') return 1;
    return Math.ceil(filteredItems.length / pageSize) || 1;
  }

  function renderPagination() {
    if (!pageNumbersEl || pageSize === 'all') {
      if (paginationBar) paginationBar.style.display = pageSize === 'all' ? 'none' : 'flex';
      return;
    }

    const totalPages = getTotalPages();
    if (firstPageBtn) firstPageBtn.disabled = currentPage === 1;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;
    if (lastPageBtn) lastPageBtn.disabled = currentPage === totalPages;

    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    let buttonsHtml = '';
    for (let p = startPage; p <= endPage; p++) {
      buttonsHtml += `
        <button class="page-num-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>
      `;
    }

    pageNumbersEl.innerHTML = buttonsHtml;

    // Attach click events to page number buttons
    pageNumbersEl.querySelectorAll('.page-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page, 10);
        goToPage(p);
      });
    });
  }

  function goToPage(page) {
    const totalPages = getTotalPages();
    if (page < 1 || page > totalPages || page === currentPage) return;
    currentPage = page;
    renderTable();
    // Smooth scroll back to top of table
    const controlsCard = document.querySelector('.controls-card');
    if (controlsCard) {
      controlsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ==========================================================================
  // Clipboard Copy & Toast
  // ==========================================================================
  let toastTimer;
  function copyToClipboard(text) {
    if (!navigator.clipboard) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(`'${text}' 복사되었습니다!`);
      return;
    }

    navigator.clipboard.writeText(text).then(() => {
      showToast(`'${text}' 클립보드에 복사되었습니다!`);
    }).catch(err => {
      console.error('클립보드 복사 실패:', err);
    });
  }

  function showToast(message) {
    if (!copyToast) return;
    copyToast.textContent = message;
    copyToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      copyToast.classList.remove('show');
    }, 1800);
  }

  // ==========================================================================
  // CSV Export (Excel Compatible with UTF-8 BOM)
  // ==========================================================================
  function exportToCsv() {
    if (filteredItems.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const headers = ['NO', '상품코드', '품목코드(상품메모)', '상품명', '소비자가', '바코드', '재고상태', '수량', '구분', '로케이션'];
    const rows = filteredItems.map((item, idx) => [
      idx + 1,
      `"${(item.product_code || '').replace(/"/g, '""')}"`,
      `"${(item.item_code || '').replace(/"/g, '""')}"`,
      `"${(item.product_name || '').replace(/"/g, '""')}"`,
      `"${item.price_formatted || (item.price ? item.price.toLocaleString() : '-')}"`,
      `\t${item.barcode || ''}`, // Prepend tab to prevent scientific notation in Excel
      item.status === 'in-stock' ? '보유(O)' : '품절(X)',
      item.stock || 0,
      item.category || '',
      `"${(item.location || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const now = new Date();
    const dateStr = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');

    link.setAttribute('href', url);
    link.setAttribute('download', `KYT_재고목록_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function resetAllFilters() {
    searchQuery = '';
    currentCategory = 'all';
    currentStatus = 'all';
    currentPage = 1;

    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.classList.remove('visible');

    const categoryChips = document.getElementById('categoryChips');
    if (categoryChips) {
      categoryChips.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.cat === 'all');
      });
    }

    const statusChips = document.getElementById('statusChips');
    if (statusChips) {
      statusChips.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.status === 'all');
      });
    }

    applyFilters();
  }

  function showEmptyState(msg) {
    if (emptyState) {
      const h3 = emptyState.querySelector('h3');
      if (h3 && msg) h3.textContent = msg;
      emptyState.classList.remove('hidden');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
