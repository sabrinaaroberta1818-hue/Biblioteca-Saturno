(() => {
  'use strict';

  const DB_NAME = 'saturno-files';
  const DB_VERSION = 1;
  const STORE = 'files';
  const DATA_KEY = 'saturno-library-v1';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const state = {
    books: [], categories: [], theme: 'light', grid: 3,
    readingStatus: 'Quero ler', epubRendition: null, readerUrl: null
  };

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB não está disponível.'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveFile(id, file) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(file, id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function getFile(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => { db.close(); resolve(request.result || null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function deleteFile(id) {
    if (!id) return;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(DATA_KEY) || '{}');
      state.books = Array.isArray(saved.books) ? saved.books : [];
      state.categories = Array.isArray(saved.categories) ? saved.categories : [];
      state.theme = saved.theme === 'dark' ? 'dark' : 'light';
      state.grid = [2, 3, 4].includes(Number(saved.grid)) ? Number(saved.grid) : 3;
    } catch (error) {
      console.error('Não foi possível carregar os dados:', error);
      notify('Os dados salvos não puderam ser carregados.');
    }
  }

  function persist() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify({
        books: state.books, categories: state.categories,
        theme: state.theme, grid: state.grid
      }));
    } catch (error) {
      console.error('Falha ao salvar:', error);
      notify('Não foi possível salvar. Exporte seus dados e verifique o armazenamento.');
    }
  }

  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function categoryName(id) {
    return state.categories.find(category => category.id === id)?.name || 'Sem categoria';
  }

  function updateTheme() {
    document.body.classList.toggle('dark', state.theme === 'dark');
    $('#themeToggle').textContent = state.theme === 'dark' ? '☀' : '☾';
    $('#settingsTheme').textContent = state.theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';
    $('#gridPreference').value = String(state.grid);
  }

  function showPage(name) {
    $$('.page').forEach(page => page.classList.toggle('active', page.id === `page-${name}`));
    $$('.nav-link[data-page]').forEach(link => link.classList.toggle('active', link.dataset.page === name));
    $('#currentSection').textContent = ({
      home: 'Visão geral', catalog: 'Meu catálogo', categories: 'Categorias',
      reading: 'Lista de leitura', favorites: 'Favoritos', settings: 'Configurações'
    })[name] || 'Saturno';
    $('#sidebar').classList.remove('open');
    renderAll();
  }

  function emptyState(icon, title, description, action = '') {
    return `<div class="empty-state"><span class="empty-icon">${icon}</span><b>${title}</b><p>${description}</p>${action}</div>`;
  }

  function bookCard(book) {
    const cover = book.cover
      ? `<img src="${book.cover}" alt="Capa de ${escapeHTML(book.title)}">`
      : `<div class="cover-placeholder">${escapeHTML(book.title.slice(0, 34))}</div>`;
    const favoriteLabel = book.favorite ? '♥' : '♡';
    return `<article class="book-card">
      <div class="book-cover">${cover}</div>
      <div class="book-info"><h3>${escapeHTML(book.title)}</h3>
        <p>${escapeHTML(book.author || 'Autor não informado')}</p>
        <div class="book-meta"><span class="tag">${escapeHTML(categoryName(book.categoryId))}</span><span class="muted">${book.year || ''}</span></div>
        <div class="book-actions">
          <button class="mini-button" data-action="details" data-id="${book.id}">Detalhes</button>
          <button class="mini-button" data-action="read" data-id="${book.id}" ${book.fileId ? '' : 'disabled'}>Abrir</button>
          <button class="mini-button favorite" data-action="favorite" data-id="${book.id}" aria-label="Favoritar">${favoriteLabel}</button>
          <button class="mini-button" data-action="edit-book" data-id="${book.id}">Editar</button>
        </div>
      </div>
    </article>`;
  }

  function renderHome() {
    const favorites = state.books.filter(book => book.favorite).length;
    $('#totalBooks').textContent = state.books.length;
    $('#totalFavorites').textContent = favorites;
    $('#totalReading').textContent = state.books.filter(book => book.status === 'Lendo').length;
    $('#totalRead').textContent = state.books.filter(book => book.status === 'Lidos').length;

    const categories = state.categories.map(category => ({
      name: category.name,
      count: state.books.filter(book => book.categoryId === category.id).length
    }));
    $('#homeCategories').innerHTML = categories.length
      ? categories.map(item => `<div class="bar-row"><span>${escapeHTML(item.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${state.books.length ? item.count / state.books.length * 100 : 0}%"></div></div><b>${item.count}</b></div>`).join('')
      : 'Crie categorias e associe seus livros para acompanhar a distribuição do acervo.';
    const recent = [...state.books].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
    $('#recentBooks').className = recent.length ? 'book-grid' : 'book-grid empty-state';
    $('#recentBooks').innerHTML = recent.length
      ? recent.map(bookCard).join('')
      : emptyState('✧', 'Sua estante está esperando por você', 'Adicione seu primeiro livro para começar.', '<button class="secondary-button" data-action="new-book">Adicionar primeiro livro</button>');
  }

  function renderCatalog() {
    const query = $('#searchBooks').value.trim().toLocaleLowerCase('pt-BR');
    const categoryId = $('#filterCategory').value;
    const sort = $('#sortBooks').value;
    let books = state.books.filter(book =>
      book.title.toLocaleLowerCase('pt-BR').includes(query) &&
      (!categoryId || book.categoryId === categoryId)
    );
    if (sort === 'title') books.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    if (sort === 'author') books.sort((a, b) => (a.author || '').localeCompare(b.author || '', 'pt-BR'));
    if (sort === 'recent') books.sort((a, b) => b.createdAt - a.createdAt);
    $('#catalogGrid').className = books.length ? 'book-grid' : 'book-grid empty-state';
    $('#catalogGrid').innerHTML = books.length
      ? books.map(bookCard).join('')
      : emptyState('▤', query || categoryId ? 'Nenhum resultado encontrado' : 'Nenhum livro cadastrado',
        query || categoryId ? 'Tente alterar a busca ou o filtro.' : 'Seu catálogo está vazio. Adicione um título para começar.',
        '<button class="secondary-button" data-action="new-book">＋ Adicionar livro</button>');
  }

  function renderCategories() {
    $('#categoriesGrid').className = state.categories.length ? 'category-grid' : 'category-grid empty-state';
    $('#categoriesGrid').innerHTML = state.categories.length
      ? state.categories.map(category => {
        const count = state.books.filter(book => book.categoryId === category.id).length;
        return `<article class="category-card">
        <span class="category-symbol">▦</span>
        <h3>${escapeHTML(category.name)}</h3>
        <p>${count} ${count === 1 ? 'livro' : 'livros'}</p>
        <div class="book-actions">
        <button class="mini-button" data-action="view-category" data-id="${category.id}">Ver livros</button>
        <button class="mini-button" data-action="edit-category" data-id="${category.id}">Editar</button>
        <button class="mini-button danger" data-action="delete-category" data-id="${category.id}">Excluir</button>
        </div>
        </article>`;
      }).join('')
      : emptyState('▦', 'Nenhuma categoria criada', 'Crie sua primeira categoria para organizar os livros.', '<button class="secondary-button" data-action="new-category">＋ Criar categoria</button>');
  }

  function renderReading() {
    const counts = {
      'Quero ler': state.books.filter(book => book.status === 'Quero ler').length,
      Lendo: state.books.filter(book => book.status === 'Lendo').length,
      Lidos: state.books.filter(book => book.status === 'Lidos').length
    };
    $('#countWant').textContent = counts['Quero ler'];
    $('#countDoing').textContent = counts.Lendo;
    $('#countDone').textContent = counts.Lidos;
    $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.status === state.readingStatus));
    const books = state.books.filter(book => book.status === state.readingStatus);
    $('#readingGrid').className = books.length ? 'book-grid' : 'book-grid empty-state';
    $('#readingGrid').innerHTML = books.length
      ? books.map(book => `${bookCard(book)}<div class="status-control"><label class="field">Situação<select data-status-book="${book.id}">${['Quero ler', 'Lendo', 'Lidos'].map(status => `<option ${book.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><button class="mini-button danger" data-action="remove-reading" data-id="${book.id}">Remover da lista</button></div>`).join('')
      : emptyState('◷', `Nenhum livro em “${state.readingStatus}”`, 'Adicione um livro pelo catálogo e escolha sua situação.', '<button class="secondary-button" data-page="catalog">Ir para o catálogo</button>');
  }

  function renderFavorites() {
    const books = state.books.filter(book => book.favorite);
    $('#favoritesGrid').className = books.length ? 'book-grid' : 'book-grid empty-state';
    $('#favoritesGrid').innerHTML = books.length
      ? books.map(bookCard).join('')
      : emptyState('♡', 'Nenhum favorito por enquanto', 'Toque no coração de um livro para guardá-lo aqui.', '<button class="secondary-button" data-page="catalog">Explorar catálogo</button>');
  }

  function renderSelects() {
    const options = state.categories.map(category =>
      `<option value="${category.id}">${escapeHTML(category.name)}</option>`).join('');
    const filter = $('#filterCategory');
    const currentFilter = filter.value;
    filter.innerHTML = '<option value="">Todas as categorias</option>' + options;
    filter.value = currentFilter;
    const select = $('#bookCategory');
    const current = select.value;
    select.innerHTML = '<option value="">Sem categoria</option>' + options;
    select.value = current;
  }

  function renderAll() {
    renderSelects();
    renderHome();
    renderCatalog();
    renderCategories();
    renderReading();
    renderFavorites();
    document.documentElement.style.setProperty('--book-columns', state.grid);
  }

  function openBookForm(book = null) {
    $('#bookForm').reset();
    $('#bookId').value = book?.id || '';
    $('#bookDialogTitle').textContent = book ? 'Editar livro' : 'Adicionar livro';
    $('#bookTitle').value = book?.title || '';
    $('#bookAuthor').value = book?.author || '';
    $('#bookYear').value = book?.year || '';
    $('#bookCategory').value = book?.categoryId || '';
    $('#bookDescription').value = book?.description || '';
    $('#fileHint').textContent = book?.fileName ? `Arquivo atual: ${book.fileName}. Selecione outro para substituir.` : 'O arquivo será mantido neste navegador.';
    $('#bookDialog').showModal();
  }

  async function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function submitBook(event) {
    event.preventDefault();
    const id = $('#bookId').value || crypto.randomUUID();
    const existing = state.books.find(book => book.id === id);
    const file = $('#bookFile').files[0];
    const coverFile = $('#bookCover').files[0];
    if (file && !/\.(pdf|epub)$/i.test(file.name)) {
      notify('Selecione um arquivo PDF ou EPUB.'); return;
    }
    if (file && file.size > 80 * 1024 * 1024) {
      notify('O arquivo ultrapassa o limite sugerido de 80 MB.'); return;
    }
    try {
      let fileId = existing?.fileId || '';
      let fileName = existing?.fileName || '';
      if (file) {
        await saveFile(id, file);
        fileId = id;
        fileName = file.name;
      }
      const cover = coverFile ? await readAsDataURL(coverFile) : (existing?.cover || '');
      const book = {
        id, title: $('#bookTitle').value.trim(), author: $('#bookAuthor').value.trim(),
        year: $('#bookYear').value, categoryId: $('#bookCategory').value,
        description: $('#bookDescription').value.trim(), cover, fileId, fileName,
        favorite: existing?.favorite || false, status: existing?.status || '',
        createdAt: existing?.createdAt || Date.now()
      };
      if (existing) state.books = state.books.map(item => item.id === id ? book : item);
      else state.books.push(book);
      persist(); $('#bookDialog').close(); renderAll();
      notify(existing ? 'Livro atualizado.' : 'Livro adicionado à biblioteca.');
    } catch (error) {
      console.error(error); notify('Não foi possível salvar o livro ou o arquivo.');
    }
  }

  function openCategoryForm(category = null) {
    $('#categoryForm').reset();
    $('#categoryId').value = category?.id || '';
    $('#categoryName').value = category?.name || '';
    $('#categoryDialogTitle').textContent = category ? 'Editar categoria' : 'Nova categoria';
    $('#categoryDialog').showModal();
  }

  function submitCategory(event) {
    event.preventDefault();
    const id = $('#categoryId').value || crypto.randomUUID();
    const name = $('#categoryName').value.trim();
    if (state.categories.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.id !== id)) {
      notify('Já existe uma categoria com esse nome.'); return;
    }
    const category = { id, name };
    if (state.categories.some(item => item.id === id)) {
      state.categories = state.categories.map(item => item.id === id ? category : item);
    } else state.categories.push(category);
    persist(); $('#categoryDialog').close(); renderAll(); notify('Categoria salva.');
  }

  function showDetails(book) {
    const cover = book.cover || '';
    $('#detailsContent').innerHTML = `<div class="detail-layout">
      ${cover ? `<img class="detail-cover" src="${cover}" alt="Capa">` : '<div class="detail-cover cover-placeholder">✧</div>'}
      <div><span class="eyebrow">DETALHES DO LIVRO</span><h2>${escapeHTML(book.title)}</h2>
        <p class="detail-author">${escapeHTML(book.author || 'Autor não informado')}</p>
        <span class="tag">${escapeHTML(categoryName(book.categoryId))}</span>
        <p class="detail-description">${escapeHTML(book.description || 'Nenhuma descrição cadastrada.')}</p>
        <p class="muted">Ano: ${escapeHTML(book.year || 'Não informado')}<br>Arquivo: ${escapeHTML(book.fileName || 'Não anexado')}</p>
      </div></div>`;
    $('#detailsDialog').showModal();
  }

  async function openReader(book) {
    if (!book.fileId) { notify('Este livro ainda não possui arquivo.'); return; }
    try {
      const file = await getFile(book.fileId);
      if (!file) { notify('O arquivo não foi encontrado neste navegador.'); return; }
      $('#readerTitle').textContent = book.title;
      const content = $('#readerContent');
      content.innerHTML = '';
      if (/\.pdf$/i.test(file.name)) {
        const url = URL.createObjectURL(file);
        state.readerUrl = url;
        content.innerHTML = `<iframe title="Leitor de PDF" src="${url}"></iframe>`;
        $('#prevChapter').disabled = true;
        $('#nextChapter').disabled = true;
      } else if (/\.epub$/i.test(file.name)) {
        if (!window.ePub) {
          notify('O leitor EPUB não carregou. Verifique sua conexão com a internet.');
          return;
        }
        content.innerHTML = '<div id="epubViewer"></div>';
        const buffer = await file.arrayBuffer();
        const bookFile = window.ePub(buffer);
        state.epubRendition = bookFile.renderTo('epubViewer', { width: '100%', height: '65vh', spread: 'none' });
        await state.epubRendition.display();
        $('#prevChapter').disabled = false;
        $('#nextChapter').disabled = false;
      } else {
        notify('Formato de arquivo não suportado.'); return;
      }
      $('#readerDialog').showModal();
    } catch (error) {
      console.error(error); notify('Não foi possível abrir o arquivo.');
    }
  }

  async function handleAction(action, id) {
    const book = state.books.find(item => item.id === id);
    const category = state.categories.find(item => item.id === id);
    switch (action) {
      case 'new-book': openBookForm(); break;
      case 'edit-book': if (book) openBookForm(book); break;
      case 'details': if (book) showDetails(book); break;
      case 'read': if (book) await openReader(book); break;
      case 'favorite':
        if (book) { book.favorite = !book.favorite; persist(); renderAll(); notify(book.favorite ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.'); }
        break;
      case 'new-category': openCategoryForm(); break;
      case 'edit-category': if (category) openCategoryForm(category); break;
      case 'delete-category':
        if (category && confirm(`Excluir a categoria "${category.name}"? Os livros ficarão sem categoria.`)) {
          state.categories = state.categories.filter(item => item.id !== id);
          state.books.forEach(item => { if (item.categoryId === id) item.categoryId = ''; });
          persist(); renderAll(); notify('Categoria excluída.');
        }
        break;
      case 'view-category':
        $('#filterCategory').value = id; showPage('catalog'); break;
      case 'remove-reading':
        if (book) { book.status = ''; persist(); renderAll(); notify('Livro removido da lista de leitura.'); }
        break;
      case 'delete-book':
        if (book && confirm(`Excluir "${book.title}" do acervo?`)) {
          await deleteFile(book.fileId);
          state.books = state.books.filter(item => item.id !== id);
          persist(); renderAll(); notify('Livro excluído.');
        }
        break;
    }
  }

  function exportData() {
    const payload = {
      application: 'Saturno', exportedAt: new Date().toISOString(),
      note: 'Exportação de metadados. Os arquivos PDF/EPUB não são incluídos.',
      books: state.books, categories: state.categories,
      preferences: { theme: state.theme, grid: state.grid }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'saturno-backup.json'; anchor.click();
    URL.revokeObjectURL(url);
    notify('Exportação iniciada.');
  }

  async function clearLibrary() {
    if (!confirm('Tem certeza? Todos os livros e categorias salvos neste navegador serão apagados.')) return;
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
      state.books = []; state.categories = [];
      persist(); renderAll(); notify('Biblioteca limpa.');
    } catch (error) {
      console.error(error); notify('Não foi possível limpar os arquivos armazenados.');
    }
  }

  function bindEvents() {
    document.addEventListener('click', async event => {
      const pageLink = event.target.closest('[data-page]');
      if (pageLink) { event.preventDefault(); showPage(pageLink.dataset.page); return; }
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        await handleAction(actionButton.dataset.action, actionButton.dataset.id);
        return;
      }
      const closeButton = event.target.closest('[data-close]');
      if (closeButton) $(`#${closeButton.dataset.close}`).close();
    });

    $('#bookForm').addEventListener('submit', submitBook);
    $('#categoryForm').addEventListener('submit', submitCategory);
    $('#searchBooks').addEventListener('input', renderCatalog);
    $('#filterCategory').addEventListener('change', renderCatalog);
    $('#sortBooks').addEventListener('change', renderCatalog);
    $('#readingTabs').addEventListener('click', event => {
      const tab = event.target.closest('[data-status]');
      if (tab) { state.readingStatus = tab.dataset.status; renderReading(); }
    });
    $('#readingGrid').addEventListener('change', event => {
      const select = event.target.closest('[data-status-book]');
      if (!select) return;
      const book = state.books.find(item => item.id === select.dataset.statusBook);
      if (book) { book.status = select.value; persist(); renderAll(); }
    });
    $('#themeToggle').addEventListener('click', toggleTheme);
    $('#settingsTheme').addEventListener('click', toggleTheme);
    $('#gridPreference').addEventListener('change', event => {
      state.grid = Number(event.target.value); persist(); renderAll();
    });
    $('#exportData').addEventListener('click', exportData);
    $('#clearData').addEventListener('click', clearLibrary);
    $('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#prevChapter').addEventListener('click', () => state.epubRendition?.prev());
    $('#nextChapter').addEventListener('click', () => state.epubRendition?.next());
    $('#readerDialog').addEventListener('close', () => {
      if (state.readerUrl) URL.revokeObjectURL(state.readerUrl);
      state.readerUrl = null; state.epubRendition = null;
      $('#readerContent').innerHTML = '';
    });
    ['bookDialog', 'categoryDialog', 'detailsDialog', 'readerDialog'].forEach(id => {
      $(`#${id}`).addEventListener('click', event => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      });
    });
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    persist(); updateTheme();
  }

  function initialize() {
    loadData();
    updateTheme();
    $('#today').textContent = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short'
    }).format(new Date());
    bindEvents();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();