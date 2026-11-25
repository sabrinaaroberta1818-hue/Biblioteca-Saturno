(() => {
  'use strict';

  const NOME_BANCO = 'saturno-files';
  const VERSAO_BANCO = 1;
  const NOME_ARMAZENAMENTO = 'arquivos';
  const CHAVE_DADOS = 'saturno-library-v1';
  const LIMITE_ARQUIVO = 80 * 1024 * 1024;

  const selecionar = (seletor, contexto = document) => contexto.querySelector(seletor);
  const selecionarTodos = (seletor, contexto = document) => [...contexto.querySelectorAll(seletor)];

  const estado = {
    livros: [],
    categorias: [],
    tema: 'light',
    urlLeitor: null,
    exibicaoEpub: null
  };

  // Persistência dos arquivos PDF e EPUB no IndexedDB.
  function abrirBanco() {
    return new Promise((resolver, rejeitar) => {
      if (!('indexedDB' in window)) {
        rejeitar(new Error('IndexedDB não está disponível.'));
        return;
      }

      const solicitacao = indexedDB.open(NOME_BANCO, VERSAO_BANCO);

      solicitacao.onupgradeneeded = () => {
        const banco = solicitacao.result;
        if (!banco.objectStoreNames.contains(NOME_ARMAZENAMENTO)) {
          banco.createObjectStore(NOME_ARMAZENAMENTO);
        }
      };

      solicitacao.onsuccess = () => resolver(solicitacao.result);
      solicitacao.onerror = () => rejeitar(solicitacao.error);
    });
  }

  async function salvarArquivo(identificador, arquivo) {
    const banco = await abrirBanco();

    return new Promise((resolver, rejeitar) => {
      const transacao = banco.transaction(NOME_ARMAZENAMENTO, 'readwrite');
      transacao.objectStore(NOME_ARMAZENAMENTO).put(arquivo, identificador);
      transacao.oncomplete = () => { banco.close(); resolver(); };
      transacao.onerror = () => { banco.close(); rejeitar(transacao.error); };
    });
  }

  async function buscarArquivo(identificador) {
    const banco = await abrirBanco();

    return new Promise((resolver, rejeitar) => {
      const transacao = banco.transaction(NOME_ARMAZENAMENTO, 'readonly');
      const solicitacao = transacao.objectStore(NOME_ARMAZENAMENTO).get(identificador);
      solicitacao.onsuccess = () => {
        banco.close();
        resolver(solicitacao.result || null);
      };
      solicitacao.onerror = () => { banco.close(); rejeitar(solicitacao.error); };
    });
  }

  async function excluirArquivo(identificador) {
    if (!identificador) return;

    const banco = await abrirBanco();

    return new Promise((resolver, rejeitar) => {
      const transacao = banco.transaction(NOME_ARMAZENAMENTO, 'readwrite');
      transacao.objectStore(NOME_ARMAZENAMENTO).delete(identificador);
      transacao.oncomplete = () => { banco.close(); resolver(); };
      transacao.onerror = () => { banco.close(); rejeitar(transacao.error); };
    });
  }

  // Carregamento e gravação dos metadados da biblioteca.
  function carregarDados() {
    try {
      const dadosSalvos = JSON.parse(localStorage.getItem(CHAVE_DADOS) || '{}');
      estado.livros = Array.isArray(dadosSalvos.books) ? dadosSalvos.books : [];
      estado.categorias = Array.isArray(dadosSalvos.categories) ? dadosSalvos.categories : [];
      estado.tema = dadosSalvos.theme === 'dark' ? 'dark' : 'light';
    } catch (erro) {
      console.error('Não foi possível carregar os dados:', erro);
      mostrarAviso('Os dados salvos não puderam ser carregados.');
    }
  }

  function salvarDados() {
    try {
      localStorage.setItem(CHAVE_DADOS, JSON.stringify({
        books: estado.livros,
        categories: estado.categorias,
        theme: estado.tema
      }));
    } catch (erro) {
      console.error('Falha ao salvar os dados:', erro);
      mostrarAviso('Não foi possível salvar os dados. Verifique o armazenamento do navegador.');
    }
  }

  function mostrarAviso(mensagem) {
    const aviso = selecionar('#toast');
    aviso.textContent = mensagem;
    aviso.classList.add('show');

    clearTimeout(mostrarAviso.temporizador);
    mostrarAviso.temporizador = setTimeout(() => aviso.classList.remove('show'), 2800);
  }

  function escaparHtml(valor = '') {
    return String(valor).replace(/[&<>"']/g, caractere => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[caractere]);
  }

  function obterNomeCategoria(identificador) {
    const categoria = estado.categorias.find(item => item.id === identificador);
    return categoria?.name || 'Sem categoria';
  }

  // Apresentação e navegação.
  function atualizarTema() {
    document.body.classList.toggle('dark', estado.tema === 'dark');
    selecionar('#themeToggle').textContent = estado.tema === 'dark' ? '☀' : '☾';
    selecionar('#themeToggle').setAttribute(
      'aria-label',
      estado.tema === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'
    );
  }

  function alternarTema() {
    estado.tema = estado.tema === 'dark' ? 'light' : 'dark';
    salvarDados();
    atualizarTema();
  }

  function mostrarPagina(nomePagina) {
    selecionarTodos('.pagina').forEach(pagina => {
      pagina.classList.toggle('ativo', pagina.id === `page-${nomePagina}`);
    });

    selecionarTodos('.link-navegacao[data-page]').forEach(link => {
      link.classList.toggle('ativo', link.dataset.page === nomePagina);
    });

    const nomesPaginas = {
      home: 'Visão geral',
      catalog: 'Meu catálogo',
      categories: 'Categorias'
    };

    selecionar('#currentSection').textContent = nomesPaginas[nomePagina] || 'Saturno';
    selecionar('#barra-lateral').classList.remove('open');
    renderizarTudo();
  }

  function criarEstadoVazio(icone, titulo, descricao, acao = '') {
    return `
      <div class="estado-vazio">
        <span class="icone-vazio">${icone}</span>
        <b>${titulo}</b>
        <p>${descricao}</p>
        ${acao}
      </div>
    `;
  }

  function criarCartaoLivro(livro) {
    const capa = livro.cover
      ? `<img src="${livro.cover}" alt="Capa de ${escaparHtml(livro.title)}">`
      : `<div class="capa-sem-imagem">${escaparHtml(livro.title.slice(0, 34))}</div>`;

    return `
      <article class="cartao-livro">
        <div class="capa-livro">${capa}</div>
        <div class="informacoes-livro">
          <h3>${escaparHtml(livro.title)}</h3>
          <p>${escaparHtml(livro.author || 'Autor não informado')}</p>
          <div class="metadados-livro">
            <span class="etiqueta">${escaparHtml(obterNomeCategoria(livro.categoryId))}</span>
            <span class="texto-suave">${escaparHtml(livro.year || '')}</span>
          </div>
          <div class="acoes-livro">
            <button class="botao-pequeno" data-action="details" data-id="${livro.id}">Detalhes</button>
            <button class="botao-pequeno" data-action="read" data-id="${livro.id}" ${livro.fileId ? '' : 'disabled'}>Abrir</button>
            <button class="botao-pequeno" data-action="edit-book" data-id="${livro.id}">Editar</button>
            <button class="botao-pequeno danger" data-action="delete-book" data-id="${livro.id}">Excluir</button>
          </div>
        </div>
      </article>
    `;
  }

  // Renderização da visão geral: indicadores, categorias e os três últimos livros.
  function renderizarVisaoGeral() {
    selecionar('#totalBooks').textContent = estado.livros.length;
    selecionar('#totalCategories').textContent = estado.categorias.length;

    const categoriasComQuantidade = estado.categorias.map(categoria => ({
      nome: categoria.name,
      quantidade: estado.livros.filter(livro => livro.categoryId === categoria.id).length
    }));

    const areaCategorias = selecionar('#homeCategories');
    areaCategorias.className = 'barras-categorias mensagem-vazia-inline';

    areaCategorias.innerHTML = categoriasComQuantidade.length
      ? categoriasComQuantidade.map(categoria => {
          const percentual = estado.livros.length
            ? (categoria.quantidade / estado.livros.length) * 100
            : 0;

          return `
            <div class="linha-barra">
              <span>${escaparHtml(categoria.nome)}</span>
              <div class="trilho-barra">
                <div class="preenchimento-barra" style="width: ${percentual}%"></div>
              </div>
              <b>${categoria.quantidade}</b>
            </div>
          `;
        }).join('')
      : 'Suas categorias aparecerão aqui quando você começar a organizar o acervo.';

    const livrosRecentes = [...estado.livros]
      .sort((livroA, livroB) => (livroB.createdAt || 0) - (livroA.createdAt || 0))
      .slice(0, 3);

    const areaRecentes = selecionar('#recentBooks');

    if (livrosRecentes.length) {
      areaRecentes.className = 'grade-livros';
      areaRecentes.innerHTML = livrosRecentes.map(criarCartaoLivro).join('');
    } else {
      areaRecentes.className = 'grade-livros estado-vazio';
      areaRecentes.innerHTML = `
        <span class="icone-vazio">✧</span>
        <b>Sua estante está esperando por você</b>
        <p>Adicione seu primeiro livro para começar.</p>
        <button class="botao-secundario" data-action="new-book">Adicionar primeiro livro</button>
      `;
    }
  }

  function renderizarCatalogo() {
    const consulta = selecionar('#searchBooks').value.trim().toLocaleLowerCase('pt-BR');
    const categoriaSelecionada = selecionar('#filterCategory').value;
    const ordenacao = selecionar('#sortBooks').value;

    let livrosFiltrados = estado.livros.filter(livro =>
      livro.title.toLocaleLowerCase('pt-BR').includes(consulta) &&
      (!categoriaSelecionada || livro.categoryId === categoriaSelecionada)
    );

    if (ordenacao === 'title') {
      livrosFiltrados.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    } else if (ordenacao === 'author') {
      livrosFiltrados.sort((a, b) => (a.author || '').localeCompare(b.author || '', 'pt-BR'));
    } else {
      livrosFiltrados.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    const grade = selecionar('#catalogGrid');

    if (livrosFiltrados.length) {
      grade.className = 'grade-livros';
      grade.innerHTML = livrosFiltrados.map(criarCartaoLivro).join('');
      return;
    }

    grade.className = 'grade-livros estado-vazio';
    grade.innerHTML = criarEstadoVazio(
      '▤',
      consulta || categoriaSelecionada ? 'Nenhum resultado encontrado' : 'Nenhum livro cadastrado',
      consulta || categoriaSelecionada
        ? 'Tente alterar a busca ou o filtro.'
        : 'Seu catálogo está vazio. Adicione um título para começar.',
      '<button class="botao-secundario" data-action="new-book">＋ Adicionar livro</button>'
    );
  }

  function renderizarCategorias() {
    const grade = selecionar('#categoriesGrid');

    if (!estado.categorias.length) {
      grade.className = 'grade-categorias estado-vazio';
      grade.innerHTML = criarEstadoVazio(
        '▦',
        'Nenhuma categoria criada',
        'Crie sua primeira categoria para organizar os livros.',
        '<button class="botao-secundario" data-action="new-category">＋ Criar categoria</button>'
      );
      return;
    }

    grade.className = 'grade-categorias';
    grade.innerHTML = estado.categorias.map(categoria => {
      const quantidade = estado.livros.filter(livro => livro.categoryId === categoria.id).length;

      return `
        <article class="cartao-categoria">
          <span class="icone-categoria">▦</span>
          <h3>${escaparHtml(categoria.name)}</h3>
          <p>${quantidade} ${quantidade === 1 ? 'livro' : 'livros'}</p>
          <div class="acoes-livro">
            <button class="botao-pequeno" data-action="view-category" data-id="${categoria.id}">Ver livros</button>
            <button class="botao-pequeno" data-action="edit-category" data-id="${categoria.id}">Editar</button>
            <button class="botao-pequeno danger" data-action="delete-category" data-id="${categoria.id}">Excluir</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function atualizarOpcoesCategoria() {
    const opcoes = estado.categorias.map(categoria =>
      `<option value="${categoria.id}">${escaparHtml(categoria.name)}</option>`
    ).join('');

    const filtro = selecionar('#filterCategory');
    const filtroAtual = filtro.value;
    filtro.innerHTML = '<option value="">Todas as categorias</option>' + opcoes;
    filtro.value = filtroAtual;

    const campoCategoria = selecionar('#bookCategory');
    const categoriaAtual = campoCategoria.value;
    campoCategoria.innerHTML = '<option value="">Sem categoria</option>' + opcoes;
    campoCategoria.value = categoriaAtual;
  }

  function renderizarTudo() {
    atualizarOpcoesCategoria();
    renderizarVisaoGeral();
    renderizarCatalogo();
    renderizarCategorias();
  }

  // Cadastro e edição de livros.
  function abrirFormularioLivro(livro = null) {
    selecionar('#bookForm').reset();
    selecionar('#bookId').value = livro?.id || '';
    selecionar('#bookDialogTitle').textContent = livro ? 'Editar livro' : 'Adicionar livro';
    selecionar('#bookTitle').value = livro?.title || '';
    selecionar('#bookAuthor').value = livro?.author || '';
    selecionar('#bookYear').value = livro?.year || '';
    selecionar('#bookCategory').value = livro?.categoryId || '';
    selecionar('#bookDescription').value = livro?.description || '';
    selecionar('#fileHint').textContent = livro?.fileName
      ? `Arquivo atual: ${livro.fileName}. Selecione outro para substituir.`
      : 'O arquivo será mantido neste navegador.';
    selecionar('#bookDialog').showModal();
  }

  function converterArquivoParaUrl(arquivo) {
    return new Promise((resolver, rejeitar) => {
      const leitor = new FileReader();
      leitor.onload = () => resolver(leitor.result);
      leitor.onerror = () => rejeitar(leitor.error);
      leitor.readAsDataURL(arquivo);
    });
  }

  async function salvarLivro(evento) {
    evento.preventDefault();

    const identificador = selecionar('#bookId').value || crypto.randomUUID();
    const livroExistente = estado.livros.find(livro => livro.id === identificador);
    const arquivo = selecionar('#bookFile').files[0];
    const arquivoCapa = selecionar('#bookCover').files[0];

    if (arquivo && !/\.(pdf|epub)$/i.test(arquivo.name)) {
      mostrarAviso('Selecione um arquivo PDF ou EPUB.');
      return;
    }

    if (arquivo && arquivo.size > LIMITE_ARQUIVO) {
      mostrarAviso('O arquivo ultrapassa o limite de 80 MB.');
      return;
    }

    try {
      let identificadorArquivo = livroExistente?.fileId || '';
      let nomeArquivo = livroExistente?.fileName || '';

      if (arquivo) {
        await salvarArquivo(identificador, arquivo);
        identificadorArquivo = identificador;
        nomeArquivo = arquivo.name;
      }

      const capa = arquivoCapa
        ? await converterArquivoParaUrl(arquivoCapa)
        : (livroExistente?.cover || '');

      const livro = {
        id: identificador,
        title: selecionar('#bookTitle').value.trim(),
        author: selecionar('#bookAuthor').value.trim(),
        year: selecionar('#bookYear').value,
        categoryId: selecionar('#bookCategory').value,
        description: selecionar('#bookDescription').value.trim(),
        cover: capa,
        fileId: identificadorArquivo,
        fileName: nomeArquivo,
        createdAt: livroExistente?.createdAt || Date.now()
      };

      if (livroExistente) {
        estado.livros = estado.livros.map(item => item.id === identificador ? livro : item);
      } else {
        estado.livros.push(livro);
      }

      salvarDados();
      selecionar('#bookDialog').close();
      renderizarTudo();
      mostrarAviso(livroExistente ? 'Livro atualizado.' : 'Livro adicionado à biblioteca.');
    } catch (erro) {
      console.error(erro);
      mostrarAviso('Não foi possível salvar o livro ou o arquivo.');
    }
  }

  // Cadastro, edição e exclusão de categorias.
  function abrirFormularioCategoria(categoria = null) {
    selecionar('#categoryForm').reset();
    selecionar('#categoryId').value = categoria?.id || '';
    selecionar('#categoryName').value = categoria?.name || '';
    selecionar('#categoryDialogTitle').textContent = categoria ? 'Editar categoria' : 'Nova categoria';
    selecionar('#categoryDialog').showModal();
  }

  function salvarCategoria(evento) {
    evento.preventDefault();

    const identificador = selecionar('#categoryId').value || crypto.randomUUID();
    const nome = selecionar('#categoryName').value.trim();

    const nomeDuplicado = estado.categorias.some(categoria =>
      categoria.name.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR') &&
      categoria.id !== identificador
    );

    if (nomeDuplicado) {
      mostrarAviso('Já existe uma categoria com esse nome.');
      return;
    }

    const categoria = { id: identificador, name: nome };
    const categoriaExistente = estado.categorias.some(item => item.id === identificador);

    if (categoriaExistente) {
      estado.categorias = estado.categorias.map(item => item.id === identificador ? categoria : item);
    } else {
      estado.categorias.push(categoria);
    }

    salvarDados();
    selecionar('#categoryDialog').close();
    renderizarTudo();
    mostrarAviso('Categoria salva.');
  }

  function exibirDetalhesLivro(livro) {
    const capa = livro.cover
      ? `<img class="capa-detalhes" src="${livro.cover}" alt="Capa do livro">`
      : '<div class="capa-detalhes capa-sem-imagem">✧</div>';

    selecionar('#detailsContent').innerHTML = `
      <div class="layout-detalhes">
        ${capa}
        <div>
          <span class="subtitulo">DETALHES DO LIVRO</span>
          <h2>${escaparHtml(livro.title)}</h2>
          <p class="autor-detalhes">${escaparHtml(livro.author || 'Autor não informado')}</p>
          <span class="etiqueta">${escaparHtml(obterNomeCategoria(livro.categoryId))}</span>
          <p class="descricao-detalhes">${escaparHtml(livro.description || 'Nenhuma descrição cadastrada.')}</p>
          <p class="texto-suave">Ano: ${escaparHtml(livro.year || 'Não informado')}<br>
          Arquivo: ${escaparHtml(livro.fileName || 'Não anexado')}</p>
        </div>
      </div>
    `;

    selecionar('#detailsDialog').showModal();
  }

  // Leitura dos arquivos anexados.
  async function abrirLeitor(livro) {
    if (!livro.fileId) {
      mostrarAviso('Este livro ainda não possui arquivo.');
      return;
    }

    try {
      const arquivo = await buscarArquivo(livro.fileId);

      if (!arquivo) {
        mostrarAviso('O arquivo não foi encontrado neste navegador.');
        return;
      }

      selecionar('#readerTitle').textContent = livro.title;
      const areaLeitor = selecionar('#readerContent');
      areaLeitor.innerHTML = '';

      if (/\.pdf$/i.test(arquivo.name)) {
        estado.urlLeitor = URL.createObjectURL(arquivo);
        areaLeitor.innerHTML = `<iframe title="Leitor de PDF" src="${estado.urlLeitor}"></iframe>`;
        selecionar('#prevChapter').disabled = true;
        selecionar('#nextChapter').disabled = true;
      } else if (/\.epub$/i.test(arquivo.name)) {
        if (!window.ePub) {
          mostrarAviso('O leitor EPUB não carregou. Verifique sua conexão com a internet.');
          return;
        }

        areaLeitor.innerHTML = '<div id="epubViewer"></div>';
        const conteudo = await arquivo.arrayBuffer();
        const livroDigital = window.ePub(conteudo);

        estado.exibicaoEpub = livroDigital.renderTo('epubViewer', {
          width: '100%',
          height: '65vh',
          spread: 'none'
        });

        await estado.exibicaoEpub.display();
        selecionar('#prevChapter').disabled = false;
        selecionar('#nextChapter').disabled = false;
      } else {
        mostrarAviso('Formato de arquivo não suportado.');
        return;
      }

      selecionar('#readerDialog').showModal();
    } catch (erro) {
      console.error(erro);
      mostrarAviso('Não foi possível abrir o arquivo.');
    }
  }

  async function executarAcao(acao, identificador) {
    const livro = estado.livros.find(item => item.id === identificador);
    const categoria = estado.categorias.find(item => item.id === identificador);

    switch (acao) {
      case 'new-book':
        abrirFormularioLivro();
        break;
      case 'edit-book':
        if (livro) abrirFormularioLivro(livro);
        break;
      case 'details':
        if (livro) exibirDetalhesLivro(livro);
        break;
      case 'read':
        if (livro) await abrirLeitor(livro);
        break;
      case 'new-category':
        abrirFormularioCategoria();
        break;
      case 'edit-category':
        if (categoria) abrirFormularioCategoria(categoria);
        break;
      case 'view-category':
        selecionar('#filterCategory').value = identificador;
        mostrarPagina('catalog');
        break;
      case 'delete-category':
        if (categoria && confirm(`Excluir a categoria "${categoria.name}"? Os livros ficarão sem categoria.`)) {
          estado.categorias = estado.categorias.filter(item => item.id !== identificador);
          estado.livros.forEach(item => {
            if (item.categoryId === identificador) item.categoryId = '';
          });
          salvarDados();
          renderizarTudo();
          mostrarAviso('Categoria excluída.');
        }
        break;
      case 'delete-book':
        if (livro && confirm(`Excluir "${livro.title}" do acervo?`)) {
          try {
            await excluirArquivo(livro.fileId);
            estado.livros = estado.livros.filter(item => item.id !== identificador);
            salvarDados();
            renderizarTudo();
            mostrarAviso('Livro excluído.');
          } catch (erro) {
            console.error(erro);
            mostrarAviso('Não foi possível excluir o arquivo do livro.');
          }
        }
        break;
    }
  }

  // Eventos da interface.
  function configurarEventos() {
    document.addEventListener('click', async evento => {
      const linkPagina = evento.target.closest('[data-page]');

      if (linkPagina) {
        evento.preventDefault();
        mostrarPagina(linkPagina.dataset.page);
        return;
      }

      const botaoAcao = evento.target.closest('[data-action]');

      if (botaoAcao) {
        await executarAcao(botaoAcao.dataset.action, botaoAcao.dataset.id);
        return;
      }

      const botaoFechar = evento.target.closest('[data-close]');

      if (botaoFechar) {
        selecionar(`#${botaoFechar.dataset.close}`).close();
      }
    });

    selecionar('#bookForm').addEventListener('submit', salvarLivro);
    selecionar('#categoryForm').addEventListener('submit', salvarCategoria);
    selecionar('#searchBooks').addEventListener('input', renderizarCatalogo);
    selecionar('#filterCategory').addEventListener('change', renderizarCatalogo);
    selecionar('#sortBooks').addEventListener('change', renderizarCatalogo);
    selecionar('#themeToggle').addEventListener('click', alternarTema);
    selecionar('#mobileMenu').addEventListener('click', () => {
      selecionar('#barra-lateral').classList.toggle('open');
    });

    selecionar('#prevChapter').addEventListener('click', () => estado.exibicaoEpub?.prev());
    selecionar('#nextChapter').addEventListener('click', () => estado.exibicaoEpub?.next());

    selecionar('#readerDialog').addEventListener('close', () => {
      if (estado.urlLeitor) URL.revokeObjectURL(estado.urlLeitor);
      estado.urlLeitor = null;
      estado.exibicaoEpub = null;
      selecionar('#readerContent').innerHTML = '';
    });

    ['bookDialog', 'categoryDialog', 'detailsDialog', 'readerDialog'].forEach(identificador => {
      selecionar(`#${identificador}`).addEventListener('click', evento => {
        if (evento.target === evento.currentTarget) evento.currentTarget.close();
      });
    });
  }

  function inicializarAplicacao() {
    carregarDados();
    atualizarTema();

    selecionar('#data-atual').textContent = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }).format(new Date());

    configurarEventos();
    renderizarTudo();
  }

  document.addEventListener('DOMContentLoaded', inicializarAplicacao);
})();