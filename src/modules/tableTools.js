export function createTableTools({ wordEl, onMutate }) {
  const miniToolbarEl = document.getElementById('table-mini-toolbar');
  let activeTable = null;
  let activeCell = null;

  function hideMiniToolbar() {
    activeTable = null;
    activeCell = null;
    if (miniToolbarEl) {
      miniToolbarEl.classList.remove('is-visible');
    }
  }

  function positionMiniToolbar(table) {
    if (!miniToolbarEl || !table) return;
    const workspaceEl = document.getElementById('workspace');
    const tableRect = table.getBoundingClientRect();
    const wsRect = workspaceEl.getBoundingClientRect();

    const top = tableRect.top - wsRect.top + workspaceEl.scrollTop - 36;
    const left = Math.max(8, tableRect.left - wsRect.left + workspaceEl.scrollLeft);

    miniToolbarEl.style.top = `${Math.max(4, top)}px`;
    miniToolbarEl.style.left = `${left}px`;
    miniToolbarEl.classList.add('is-visible');
  }

  function insertTable(rows = 3, cols = 3) {
    const safeRows = Math.max(1, Math.min(20, Number(rows) || 3));
    const safeCols = Math.max(1, Math.min(12, Number(cols) || 3));

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (let c = 0; c < safeCols; c += 1) {
      const th = document.createElement('th');
      th.textContent = `Header ${c + 1}`;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let r = 1; r < safeRows; r += 1) {
      const tr = document.createElement('tr');
      for (let c = 0; c < safeCols; c += 1) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    const spacer = document.createElement('p');
    spacer.innerHTML = '<br>';

    wordEl.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && wordEl.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createDocumentFragment();
      frag.appendChild(table);
      frag.appendChild(spacer);
      range.insertNode(frag);
    } else {
      wordEl.appendChild(table);
      wordEl.appendChild(spacer);
    }

    const firstCell = table.querySelector('th, td');
    if (firstCell && sel) {
      const newRange = document.createRange();
      newRange.selectNodeContents(firstCell);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
      activeTable = table;
      activeCell = firstCell;
      positionMiniToolbar(table);
    }

    onMutate?.();
  }

  function addRowBelow() {
    if (!activeTable || !activeCell) return;
    const currentRow = activeCell.closest('tr');
    if (!currentRow) return;

    const colCount = currentRow.children.length || 1;
    const newRow = document.createElement('tr');
    for (let i = 0; i < colCount; i += 1) {
      const td = document.createElement('td');
      td.innerHTML = '<br>';
      newRow.appendChild(td);
    }

    if (currentRow.parentElement?.tagName.toUpperCase() === 'THEAD') {
      let tbody = activeTable.querySelector('tbody');
      if (!tbody) {
        tbody = document.createElement('tbody');
        activeTable.appendChild(tbody);
      }
      tbody.insertBefore(newRow, tbody.firstChild);
    } else {
      currentRow.after(newRow);
    }

    positionMiniToolbar(activeTable);
    onMutate?.();
  }

  function addColumnRight() {
    if (!activeTable || !activeCell) return;
    const currentRow = activeCell.closest('tr');
    if (!currentRow) return;

    const colIndex = Array.from(currentRow.children).indexOf(activeCell);
    activeTable.querySelectorAll('tr').forEach((row) => {
      const isHeader = row.parentElement?.tagName.toUpperCase() === 'THEAD';
      const cell = document.createElement(isHeader ? 'th' : 'td');
      if (isHeader) {
        cell.textContent = `Header ${row.children.length + 1}`;
      } else {
        cell.innerHTML = '<br>';
      }
      const refCell = row.children[colIndex];
      if (refCell) {
        refCell.after(cell);
      } else {
        row.appendChild(cell);
      }
    });

    positionMiniToolbar(activeTable);
    onMutate?.();
  }

  function deleteRow() {
    if (!activeTable || !activeCell) return;
    const currentRow = activeCell.closest('tr');
    if (!currentRow) return;

    const allRows = activeTable.querySelectorAll('tr');
    if (allRows.length <= 1) {
      deleteTable();
      return;
    }

    currentRow.remove();
    hideMiniToolbar();
    onMutate?.();
  }

  function deleteColumn() {
    if (!activeTable || !activeCell) return;
    const currentRow = activeCell.closest('tr');
    if (!currentRow) return;

    const colIndex = Array.from(currentRow.children).indexOf(activeCell);
    if (currentRow.children.length <= 1) {
      deleteTable();
      return;
    }

    activeTable.querySelectorAll('tr').forEach((row) => {
      const target = row.children[colIndex];
      if (target) target.remove();
    });

    hideMiniToolbar();
    onMutate?.();
  }

  function deleteTable() {
    if (!activeTable) return;
    activeTable.remove();
    hideMiniToolbar();
    onMutate?.();
  }

  function handleSelectionCheck() {
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    if (!anchor || !wordEl.contains(anchor)) {
      hideMiniToolbar();
      return;
    }
    const el = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
    const cell = el?.closest('td, th');
    const table = cell?.closest('table');

    if (table && wordEl.contains(table)) {
      activeTable = table;
      activeCell = cell;
      positionMiniToolbar(table);
    } else {
      hideMiniToolbar();
    }
  }

  if (miniToolbarEl) {
    miniToolbarEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    miniToolbarEl.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-table-action]');
      if (!btn) return;
      const action = btn.dataset.tableAction;
      if (action === 'add-row') addRowBelow();
      else if (action === 'add-col') addColumnRight();
      else if (action === 'del-row') deleteRow();
      else if (action === 'del-col') deleteColumn();
      else if (action === 'del-table') deleteTable();
    });
  }

  wordEl.addEventListener('click', handleSelectionCheck);
  wordEl.addEventListener('keyup', handleSelectionCheck);
  document.addEventListener('mousedown', (event) => {
    if (
      miniToolbarEl &&
      !miniToolbarEl.contains(event.target) &&
      !wordEl.contains(event.target)
    ) {
      hideMiniToolbar();
    }
  });

  return {
    insertTable,
    hideMiniToolbar,
  };
}
