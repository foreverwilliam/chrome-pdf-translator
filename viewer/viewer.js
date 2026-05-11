// PDF Translator - Viewer 核心逻辑

(function () {
  'use strict';

  // 设置 PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';

  // ===== 状态管理 =====
  const state = {
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1.0,
    translations: {},  // { pageNum: { paragraphs: [...], translated: [...] } }
    isTranslating: false,
    bilingual: false,
    theme: 'dark',
    settings: {
      provider: 'deepl',
      apiKey: '',
      model: 'gpt-4o',
      customUrl: '',
      customModel: '',
      customFormat: 'openai'
    }
  };

  // ===== DOM 元素 =====
  const els = {
    fileUpload: document.getElementById('pdf-upload'),
    fileName: document.getElementById('file-name'),
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
    pageInfo: document.getElementById('page-info'),
    zoomIn: document.getElementById('zoom-in'),
    zoomOut: document.getElementById('zoom-out'),
    zoomLevel: document.getElementById('zoom-level'),
    translateBtn: document.getElementById('translate-btn'),
    translateAllBtn: document.getElementById('translate-all-btn'),
    status: document.getElementById('status'),
    pdfContainer: document.getElementById('pdf-container'),
    pdfCanvas: document.getElementById('pdf-canvas'),
    placeholder: document.getElementById('placeholder'),
    translationPlaceholder: document.getElementById('translation-placeholder'),
    translationContent: document.getElementById('translation-content'),
    panelLeft: document.getElementById('panel-left'),
    panelRight: document.getElementById('panel-right'),
    divider: document.getElementById('divider'),
    // 模型徽章 + 设置弹窗
    modelBadge: document.getElementById('model-badge'),
    settingsOverlay: document.getElementById('settings-overlay'),
    settingsModal: document.getElementById('settings-modal'),
    settingsClose: document.getElementById('settings-close'),
    sProvider: document.getElementById('s-provider'),
    sApiKey: document.getElementById('s-api-key'),
    sModel: document.getElementById('s-model'),
    sModelGroup: document.getElementById('s-model-group'),
    sCustomUrl: document.getElementById('s-custom-url'),
    sCustomUrlGroup: document.getElementById('s-custom-url-group'),
    sCustomModel: document.getElementById('s-custom-model'),
    sCustomModelGroup: document.getElementById('s-custom-model-group'),
    sCustomFormatGroup: document.getElementById('s-custom-format-group'),
    sFormatSwitch: document.getElementById('s-format-switch'),
    sFormatHint: document.getElementById('s-format-hint'),
    sKeyHint: document.getElementById('s-key-hint'),
    sSave: document.getElementById('s-save'),
    sMsg: document.getElementById('s-msg'),
    // 双语 + 主题按钮
    bilingualBtn: document.getElementById('bilingual-btn'),
    themeBtn: document.getElementById('theme-btn'),
    translationContainer: document.getElementById('translation-container')
  };

  const ctx = els.pdfCanvas.getContext('2d');

  // ===== 初始化 =====
  function init() {
    loadSettings();
    bindEvents();
    setupDragDrop();
    setupDividerDrag();
    setupSyncScroll();
    setupSettingsModal();
  }

  // 加载用户设置
  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['provider', 'apiKey', 'model', 'customUrl', 'customModel', 'customFormat', 'bilingual', 'theme'], (data) => {
        if (data.provider) state.settings.provider = data.provider;
        if (data.apiKey) state.settings.apiKey = data.apiKey;
        if (data.model) state.settings.model = data.model;
        if (data.customUrl) state.settings.customUrl = data.customUrl;
        if (data.customModel) state.settings.customModel = data.customModel;
        if (data.customFormat) state.settings.customFormat = data.customFormat;
        if (data.bilingual !== undefined) state.bilingual = data.bilingual;
        if (data.theme) state.theme = data.theme;
        updateModelBadge();
        applyBilingualState();
        applyThemeState();
      });
    } else {
      updateModelBadge();
      applyBilingualState();
      applyThemeState();
    }
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    els.fileUpload.addEventListener('change', handleFileSelect);
    els.prevPage.addEventListener('click', () => goToPage(state.currentPage - 1));
    els.nextPage.addEventListener('click', () => goToPage(state.currentPage + 1));
    els.zoomIn.addEventListener('click', () => setZoom(state.scale + 0.15));
    els.zoomOut.addEventListener('click', () => setZoom(state.scale - 0.15));
    els.translateBtn.addEventListener('click', () => translatePage(state.currentPage));
    els.translateAllBtn.addEventListener('click', translateAllPages);
    els.bilingualBtn.addEventListener('click', toggleBilingual);
    els.themeBtn.addEventListener('click', toggleTheme);
  }

  // ===== 文件选择 =====
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;
    loadPDF(file);
  }

  // ===== 拖放支持 =====
  function setupDragDrop() {
    const container = els.pdfContainer;

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.classList.add('drag-over');
    });

    container.addEventListener('dragleave', () => {
      container.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') {
        loadPDF(file);
      }
    });
  }

  // ===== 加载 PDF =====
  async function loadPDF(file) {
    setStatus('正在加载 PDF...');
    els.fileName.textContent = file.name;

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

    try {
      state.pdfDoc = await loadingTask.promise;
      state.totalPages = state.pdfDoc.numPages;
      state.currentPage = 1;
      state.translations = {};

      els.placeholder.classList.add('hidden');
      els.pdfCanvas.style.display = 'block';
      els.translateBtn.disabled = false;
      els.translateAllBtn.disabled = false;

      updatePageInfo();
      await renderPage(state.currentPage);
      setStatus('PDF 加载完成，共 ' + state.totalPages + ' 页');
    } catch (err) {
      setStatus('PDF 加载失败: ' + err.message);
      console.error(err);
    }
  }

  // ===== 渲染页面 =====
  async function renderPage(pageNum) {
    if (!state.pdfDoc) return;

    const page = await state.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: state.scale * 1.5 }); // 1.5x 提高清晰度

    els.pdfCanvas.width = viewport.width;
    els.pdfCanvas.height = viewport.height;
    els.pdfCanvas.style.width = (viewport.width / 1.5) + 'px';
    els.pdfCanvas.style.height = (viewport.height / 1.5) + 'px';

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    // 显示该页的已有翻译
    showTranslation(pageNum);
  }

  // ===== 页面导航 =====
  function goToPage(pageNum) {
    if (pageNum < 1 || pageNum > state.totalPages) return;
    state.currentPage = pageNum;
    updatePageInfo();
    renderPage(pageNum);
  }

  function updatePageInfo() {
    els.pageInfo.textContent = state.currentPage + ' / ' + state.totalPages;
    els.prevPage.disabled = state.currentPage <= 1;
    els.nextPage.disabled = state.currentPage >= state.totalPages;
  }

  // ===== 缩放 =====
  function setZoom(newScale) {
    newScale = Math.max(0.5, Math.min(3.0, newScale));
    state.scale = newScale;
    els.zoomLevel.textContent = Math.round(newScale * 100) + '%';
    renderPage(state.currentPage);
  }

  // ===== 提取文本 =====
  async function extractText(pageNum) {
    const page = await state.pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // 将 text items 按位置分组为段落
    const paragraphs = [];
    let currentParagraph = '';
    let lastY = null;

    for (const item of textContent.items) {
      const y = Math.round(item.transform[5]);

      if (lastY !== null && Math.abs(y - lastY) > 12) {
        // Y坐标变化较大，视为新段落
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
        }
        currentParagraph = item.str;
      } else {
        // 同一行或接近的行，拼接
        if (currentParagraph && !currentParagraph.endsWith(' ') && !item.str.startsWith(' ')) {
          currentParagraph += ' ';
        }
        currentParagraph += item.str;
      }
      lastY = y;
    }

    // 最后一个段落
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }

    // 过滤掉太短的内容（如页码）
    return paragraphs.filter(p => p.length > 3);
  }

  // ===== 翻译单页 =====
  const PARAGRAPH_SEPARATOR = '\n\n---SPLIT---\n\n';

  async function translatePage(pageNum) {
    if (state.isTranslating) return;

    // 检查设置
    if (!state.settings.apiKey) {
      setStatus('⚠️ 请先点击插件图标设置 API Key');
      loadSettings();
      return;
    }

    state.isTranslating = true;
    els.translateBtn.disabled = true;
    els.translateAllBtn.disabled = true;
    setStatus('正在提取第 ' + pageNum + ' 页文本...');

    try {
      const paragraphs = await extractText(pageNum);

      if (paragraphs.length === 0) {
        setStatus('第 ' + pageNum + ' 页没有可提取的文本');
        return;
      }

      showTranslationLoading(pageNum, paragraphs.length);
      setStatus('正在翻译第 ' + pageNum + ' 页（共 ' + paragraphs.length + ' 段）...');

      let finalTranslated;

      if (state.settings.provider === 'deepl') {
        // DeepL 原生支持数组批量翻译
        finalTranslated = await doTranslateDeepLBatch(paragraphs);
      } else {
        // LLM 类服务：合并段落为一次请求
        const batchText = paragraphs.join(PARAGRAPH_SEPARATOR);
        const batchResult = await doTranslate(batchText);

        // 按分隔符拆分结果
        const translated = batchResult.split(/\n*---SPLIT---\n*/).map(s => s.trim());

        if (translated.length === paragraphs.length) {
          finalTranslated = translated;
        } else {
          const fallback = batchResult.split(/\n{2,}/).map(s => s.trim()).filter(s => s);
          if (fallback.length === paragraphs.length) {
            finalTranslated = fallback;
          } else {
            finalTranslated = paragraphs.map((_, i) => i === 0 ? batchResult.trim() : '');
          }
        }
      }

      // 更新 UI
      for (let i = 0; i < paragraphs.length; i++) {
        updateTranslationParagraph(pageNum, i, paragraphs[i], finalTranslated[i] || '');
      }

      state.translations[pageNum] = { paragraphs, translated: finalTranslated };
      setStatus('第 ' + pageNum + ' 页翻译完成 ✓');
    } catch (err) {
      setStatus('翻译失败: ' + err.message);
      console.error(err);
    } finally {
      state.isTranslating = false;
      els.translateBtn.disabled = false;
      els.translateAllBtn.disabled = false;
    }
  }

  // ===== 翻译全部页 =====
  async function translateAllPages() {
    if (state.isTranslating) return;

    for (let i = 1; i <= state.totalPages; i++) {
      if (state.translations[i]) continue; // 跳过已翻译的页
      await goToPage(i);
      await translatePage(i);
      if (!state.isTranslating) break; // 出错时停止
    }

    setStatus('全部翻译完成 ✓');
  }

  // ===== 调用翻译 =====
  async function doTranslate(text) {
    // 尝试通过 chrome.runtime 发送给 background
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'translate',
          text: text,
          provider: state.settings.provider,
          apiKey: state.settings.apiKey,
          model: state.settings.model,
          customUrl: state.settings.customUrl,
          customModel: state.settings.customModel,
          customFormat: state.settings.customFormat
        }, (response) => {
          if (chrome.runtime.lastError) {
            // fallback to direct API call
            directTranslate(text).then(resolve).catch(reject);
            return;
          }
          if (response && response.success) {
            resolve(response.translation);
          } else {
            reject(new Error(response ? response.error : '翻译失败'));
          }
        });
      });
    }

    // Fallback: 直接调用 API
    return directTranslate(text);
  }

  // 直接调用翻译 API（不经过 background）
  async function directTranslate(text) {
    const { provider, apiKey, model, customUrl, customModel, customFormat } = state.settings;

    let resp;

    if (provider === 'deepl') {
      const baseUrl = apiKey.endsWith(':fx')
        ? 'https://api-free.deepl.com/v2/translate'
        : 'https://api.deepl.com/v2/translate';

      resp = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'DeepL-Auth-Key ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: [text], target_lang: 'ZH' })
      });

      const data = await parseJsonResponse(resp, 'DeepL');
      return extractDeepLText(data);
    }

    if (provider === 'openai') {
      resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages: [
            { role: 'system', content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。翻译准确、自然流畅。输入中各段落以 ---SPLIT--- 分隔，输出也必须用 ---SPLIT--- 分隔对应的翻译结果，保持段落数量一致。只输出翻译结果。' },
            { role: 'user', content: text }
          ],
          temperature: 0.3
        })
      });

      const data = await parseJsonResponse(resp, 'OpenAI');
      return extractChoicesText(data, 'OpenAI');
    }

    if (provider === 'deepseek') {
      resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。翻译准确、自然流畅。输入中各段落以 ---SPLIT--- 分隔，输出也必须用 ---SPLIT--- 分隔对应的翻译结果，保持段落数量一致。只输出翻译结果。' },
            { role: 'user', content: text }
          ],
          temperature: 0.3
        })
      });

      const data = await parseJsonResponse(resp, 'DeepSeek');
      return extractChoicesText(data, 'DeepSeek');
    }

    if (provider === 'custom') {
      if (!customUrl || !customModel) {
        throw new Error('请先在插件设置中配置自定义 API 端点和模型名称');
      }

      const format = customFormat || 'openai';
      const baseUrl = customUrl.replace(/\/+$/, '');
      let endpoint;
      if (format === 'anthropic') {
        endpoint = baseUrl.includes('/v1/messages') ? baseUrl : baseUrl + '/v1/messages';
      } else {
        endpoint = baseUrl.includes('/v1/chat/completions') ? baseUrl : baseUrl + '/v1/chat/completions';
      }

      if (format === 'anthropic') {
        // Anthropic Messages API 格式
        resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Authorization': 'Bearer ' + apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: customModel,
            max_tokens: 4096,
            system: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。翻译准确、自然流畅。输入中各段落以 ---SPLIT--- 分隔，输出也必须用 ---SPLIT--- 分隔对应的翻译结果，保持段落数量一致。只输出翻译结果。',
            messages: [
              { role: 'user', content: text }
            ]
          })
        });

        const data = await parseJsonResponse(resp, '自定义 API (Anthropic)');
        if (data.choices && Array.isArray(data.choices)) {
          console.warn('设置为 Anthropic 格式，但 API 返回了 OpenAI 格式，自动回退');
          return extractChoicesText(data, '自定义 API (Anthropic→OpenAI 自动回退)');
        }
        return extractAnthropicText(data, '自定义 API (Anthropic)');
      } else {
        // OpenAI Chat Completions 兼容格式
        resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: customModel,
            messages: [
              { role: 'system', content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。翻译准确、自然流畅。输入中各段落以 ---SPLIT--- 分隔，输出也必须用 ---SPLIT--- 分隔对应的翻译结果，保持段落数量一致。只输出翻译结果。' },
              { role: 'user', content: text }
            ],
            temperature: 0.3
          })
        });

        const data = await parseJsonResponse(resp, '自定义 API');
        // 智能检测：如果 API 实际返回 Anthropic 格式（有 content 数组无 choices），自动回退
        if (!data.choices && data.content && Array.isArray(data.content)) {
          console.warn('设置为 OpenAI 格式，但 API 返回了 Anthropic 格式，自动回退');
          return extractAnthropicText(data, '自定义 API (OpenAI→Anthropic 自动回退)');
        }
        return extractChoicesText(data, '自定义 API');
      }
    }

    throw new Error('未知翻译服务: ' + provider);
  }

  // DeepL 批量翻译（利用原生数组支持）
  async function doTranslateDeepLBatch(paragraphs) {
    const { apiKey } = state.settings;
    const baseUrl = apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'DeepL-Auth-Key ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: paragraphs, target_lang: 'ZH' })
    });

    const data = await parseJsonResponse(resp, 'DeepL');
    if (!data.translations || !Array.isArray(data.translations)) {
      throw new Error('DeepL 返回数据中缺少 translations 字段');
    }
    return data.translations.map(t => t.text);
  }

  // 安全解析 JSON 响应，遇到 HTML 时给出清晰错误
  async function parseJsonResponse(resp, serviceName) {
    const contentType = resp.headers.get('content-type') || '';

    if (!resp.ok) {
      const body = await resp.text();
      if (body.startsWith('<!') || body.startsWith('<html')) {
        throw new Error(serviceName + ' 返回了 HTML 而非 JSON (HTTP ' + resp.status + ')，请检查 API Key 和端点是否正确');
      }
      throw new Error(serviceName + ' 错误: ' + resp.status + ' - ' + body.substring(0, 200));
    }

    if (!contentType.includes('json')) {
      const body = await resp.text();
      if (body.startsWith('<!') || body.startsWith('<html')) {
        throw new Error(serviceName + ' 返回了网页而非 API 数据，请检查 API 端点 URL 是否正确');
      }
      throw new Error(serviceName + ' 返回了非 JSON 内容 (Content-Type: ' + contentType + ')');
    }

    return resp.json();
  }

  // 安全提取 OpenAI 兼容格式的翻译结果
  function extractChoicesText(data, serviceName) {
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error(serviceName + ' 返回数据结构异常:', JSON.stringify(data).substring(0, 500));
      throw new Error(serviceName + ' 返回数据中缺少 choices 字段，返回的 keys: ' + Object.keys(data).join(', '));
    }
    const msg = data.choices[0].message;
    if (!msg || typeof msg.content !== 'string') {
      console.error(serviceName + ' choices[0] 结构异常:', JSON.stringify(data.choices[0]).substring(0, 300));
      throw new Error(serviceName + ' 返回的 choices[0].message 格式不正确');
    }
    return msg.content.trim();
  }

  // 安全提取 Anthropic 格式的翻译结果
  function extractAnthropicText(data, serviceName) {
    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      console.error(serviceName + ' 返回数据结构异常:', JSON.stringify(data).substring(0, 500));
      throw new Error(serviceName + ' 返回数据中缺少 content 字段，返回的 keys: ' + Object.keys(data).join(', '));
    }
    if (typeof data.content[0].text !== 'string') {
      throw new Error(serviceName + ' 返回的 content[0].text 格式不正确');
    }
    return data.content[0].text;
  }

  // 安全提取 DeepL 格式的翻译结果
  function extractDeepLText(data) {
    if (!data.translations || !Array.isArray(data.translations) || data.translations.length === 0) {
      console.error('DeepL 返回数据结构异常:', JSON.stringify(data).substring(0, 500));
      throw new Error('DeepL 返回数据中缺少 translations 字段');
    }
    return data.translations[0].text;
  }

  // ===== 显示翻译结果 =====
  function showTranslation(pageNum) {
    const data = state.translations[pageNum];
    els.translationContent.innerHTML = '';

    if (!data) {
      els.translationContent.classList.remove('visible');
      els.translationPlaceholder.classList.remove('hidden');
      return;
    }

    els.translationPlaceholder.classList.add('hidden');
    els.translationContent.classList.add('visible');

    data.translated.forEach((text, i) => {
      const div = createTranslationBlock(data.paragraphs[i], text, i);
      els.translationContent.appendChild(div);
    });
  }

  function showTranslationLoading(pageNum, count) {
    els.translationPlaceholder.classList.add('hidden');
    els.translationContent.classList.add('visible');
    els.translationContent.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      div.className = 'translation-paragraph';
      div.id = 'trans-p-' + pageNum + '-' + i;
      div.innerHTML = '<div class="translation-loading"><div class="spinner"></div><div>正在翻译...</div></div>';
      els.translationContent.appendChild(div);
    }
  }

  function updateTranslationParagraph(pageNum, index, original, translated) {
    const div = document.getElementById('trans-p-' + pageNum + '-' + index);
    if (!div) return;

    div.innerHTML = '';
    const origDiv = document.createElement('div');
    origDiv.className = 'original';
    origDiv.textContent = original;
    div.appendChild(origDiv);

    const transDiv = document.createElement('div');
    transDiv.className = 'translated';
    transDiv.textContent = translated;
    div.appendChild(transDiv);

    // 点击切换显示原文
    div.addEventListener('click', () => {
      div.classList.toggle('show-original');
    });
  }

  function createTranslationBlock(original, translated, index) {
    const div = document.createElement('div');
    div.className = 'translation-paragraph';

    const origDiv = document.createElement('div');
    origDiv.className = 'original';
    origDiv.textContent = original;

    const transDiv = document.createElement('div');
    transDiv.className = 'translated';
    transDiv.textContent = translated;

    div.appendChild(origDiv);
    div.appendChild(transDiv);

    // 点击切换显示原文
    div.addEventListener('click', () => {
      div.classList.toggle('show-original');
    });

    return div;
  }

  // ===== 左右分栏拖动 =====
  function setupDividerDrag() {
    let isDragging = false;

    els.divider.addEventListener('mousedown', (e) => {
      isDragging = true;
      els.divider.classList.add('active');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const containerRect = els.pdfContainer.parentElement.parentElement.getBoundingClientRect();
      const percent = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      if (percent > 20 && percent < 80) {
        els.panelLeft.style.flex = 'none';
        els.panelLeft.style.width = percent + '%';
        els.panelRight.style.flex = 'none';
        els.panelRight.style.width = (100 - percent) + '%';
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      els.divider.classList.remove('active');
    });
  }

  // ===== 左右同步滚动 =====
  function setupSyncScroll() {
    let syncing = false;

    els.pdfContainer.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;

      const scrollPercent = els.pdfContainer.scrollTop /
        (els.pdfContainer.scrollHeight - els.pdfContainer.clientHeight);

      const targetScroll = scrollPercent *
        (els.translationContent.parentElement.scrollHeight - els.translationContent.parentElement.clientHeight);

      els.translationContent.parentElement.scrollTop = targetScroll;

      requestAnimationFrame(() => { syncing = false; });
    });

    const transContainer = els.translationContent.parentElement;
    transContainer.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;

      const scrollPercent = transContainer.scrollTop /
        (transContainer.scrollHeight - transContainer.clientHeight);

      const targetScroll = scrollPercent *
        (els.pdfContainer.scrollHeight - els.pdfContainer.clientHeight);

      els.pdfContainer.scrollTop = targetScroll;

      requestAnimationFrame(() => { syncing = false; });
    });
  }

  // ===== 双语对照模式切换 =====
  function toggleBilingual() {
    state.bilingual = !state.bilingual;
    applyBilingualState();
    // 持久化
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ bilingual: state.bilingual });
    }
  }

  function applyBilingualState() {
    if (state.bilingual) {
      els.translationContainer.classList.add('bilingual-mode');
      els.bilingualBtn.textContent = '双语 ✓';
      els.bilingualBtn.classList.add('active');
    } else {
      els.translationContainer.classList.remove('bilingual-mode');
      els.bilingualBtn.textContent = '双语 ✗';
      els.bilingualBtn.classList.remove('active');
    }
  }

  // ===== 日间/夜间模式切换 =====
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyThemeState();
    // 持久化
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ theme: state.theme });
    }
  }

  function applyThemeState() {
    if (state.theme === 'light') {
      document.body.classList.add('light-theme');
      els.themeBtn.textContent = '🌙 夜间';
    } else {
      document.body.classList.remove('light-theme');
      els.themeBtn.textContent = '☀ 日间';
    }
  }

  // ===== 工具函数 =====
  function setStatus(text) {
    els.status.textContent = text;
  }

  // ===== 设置弹窗逻辑 =====
  const providerLabels = {
    deepl: 'DeepL',
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    custom: '自定义'
  };

  const modelOptions = {
    openai: [
      { value: 'gpt-4o', label: 'GPT-4o (推荐)' },
      { value: 'gpt-4o-mini', label: 'GPT-4o-mini (更快更便宜)' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }
    ],
    deepseek: [
      { value: 'deepseek-chat', label: 'DeepSeek-V3 (推荐)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek-R1' }
    ]
  };

  const keyHints = {
    deepl: 'DeepL Free Key 以 :fx 结尾',
    openai: '在 platform.openai.com 获取 API Key',
    deepseek: '在 platform.deepseek.com 获取 API Key',
    custom: '根据 API 供应商要求填写 Key'
  };

  function getModelDisplayText() {
    const s = state.settings;
    const label = providerLabels[s.provider] || s.provider;

    if (s.provider === 'deepl') return label;
    if (s.provider === 'custom') {
      return s.customModel ? label + ' · ' + s.customModel : label;
    }
    // openai / deepseek
    const opts = modelOptions[s.provider];
    if (opts) {
      const found = opts.find(o => o.value === s.model);
      if (found) return label + ' · ' + found.value;
    }
    return s.model ? label + ' · ' + s.model : label;
  }

  function updateModelBadge() {
    const text = getModelDisplayText();
    const hasKey = !!state.settings.apiKey;
    els.modelBadge.textContent = '⚙ ' + text;
    els.modelBadge.title = hasKey
      ? '当前: ' + text + ' — 点击修改设置'
      : '⚠ 未设置 API Key — 点击配置';
    els.modelBadge.style.borderColor = hasKey ? '#533483' : '#e94560';
  }

  function setupSettingsModal() {
    // 打开设置
    els.modelBadge.addEventListener('click', openSettings);
    // 关闭设置
    els.settingsClose.addEventListener('click', closeSettings);
    els.settingsOverlay.addEventListener('click', closeSettings);
    // 切换翻译服务时更新 UI
    els.sProvider.addEventListener('change', () => {
      updateSettingsUI(els.sProvider.value);
    });
    // 格式切换按钮
    els.sFormatSwitch.addEventListener('click', (e) => {
      const btn = e.target.closest('.format-option');
      if (!btn) return;
      els.sFormatSwitch.querySelectorAll('.format-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateFormatHint(btn.dataset.format);
    });
    // 保存
    els.sSave.addEventListener('click', saveSettings);
  }

  function openSettings() {
    const s = state.settings;
    // 填充当前值
    els.sProvider.value = s.provider;
    els.sApiKey.value = s.apiKey;
    els.sCustomUrl.value = s.customUrl || '';
    els.sCustomModel.value = s.customModel || '';

    // 设置格式切换状态
    const fmt = s.customFormat || 'openai';
    els.sFormatSwitch.querySelectorAll('.format-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.format === fmt);
    });
    updateFormatHint(fmt);

    updateSettingsUI(s.provider);

    // 选中当前模型
    if (s.provider === 'openai' || s.provider === 'deepseek') {
      els.sModel.value = s.model;
    }

    els.sMsg.textContent = '';
    els.settingsOverlay.classList.remove('hidden');
    els.settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    els.settingsOverlay.classList.add('hidden');
    els.settingsModal.classList.add('hidden');
  }

  function updateSettingsUI(provider) {
    // 模型下拉（openai / deepseek）
    const showModel = provider === 'openai' || provider === 'deepseek';
    els.sModelGroup.classList.toggle('hidden', !showModel);
    if (showModel) populateModelDropdown(provider);

    // 自定义字段
    const showCustom = provider === 'custom';
    els.sCustomUrlGroup.classList.toggle('hidden', !showCustom);
    els.sCustomModelGroup.classList.toggle('hidden', !showCustom);
    els.sCustomFormatGroup.classList.toggle('hidden', !showCustom);

    // Key 提示
    els.sKeyHint.textContent = keyHints[provider] || '';
  }

  function updateFormatHint(format) {
    if (!els.sFormatHint) return;
    if (format === 'anthropic') {
      els.sFormatHint.textContent = 'Anthropic Messages 格式（x-api-key + Bearer，兼容官方 API 与中转网关）';
    } else {
      els.sFormatHint.textContent = 'OpenAI Chat Completions 兼容格式';
    }
  }

  function populateModelDropdown(provider) {
    const opts = modelOptions[provider];
    if (!opts) return;

    els.sModel.innerHTML = '';
    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      els.sModel.appendChild(opt);
    });
  }

  function saveSettings() {
    const provider = els.sProvider.value;
    const apiKey = els.sApiKey.value.trim();
    const model = els.sModel.value;
    const customUrl = els.sCustomUrl.value.trim();
    const customModel = els.sCustomModel.value.trim();
    const activeFormatBtn = els.sFormatSwitch.querySelector('.format-option.active');
    const customFormat = activeFormatBtn ? activeFormatBtn.dataset.format : 'openai';

    // 验证
    if (!apiKey) {
      els.sMsg.textContent = '⚠️ 请输入 API Key';
      els.sMsg.style.color = '#e94560';
      return;
    }
    if (provider === 'custom' && !customUrl) {
      els.sMsg.textContent = '⚠️ 请输入 API 端点 URL';
      els.sMsg.style.color = '#e94560';
      return;
    }
    if (provider === 'custom' && !customModel) {
      els.sMsg.textContent = '⚠️ 请输入模型名称';
      els.sMsg.style.color = '#e94560';
      return;
    }

    // 更新内存状态
    state.settings.provider = provider;
    state.settings.apiKey = apiKey;
    state.settings.model = model;
    state.settings.customUrl = customUrl;
    state.settings.customModel = customModel;
    state.settings.customFormat = customFormat;

    // 持久化
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ provider, apiKey, model, customUrl, customModel, customFormat }, () => {
        els.sMsg.textContent = '✓ 已保存';
        els.sMsg.style.color = '#53d8a8';
        updateModelBadge();
        setTimeout(closeSettings, 600);
      });
    } else {
      // 无 chrome.storage 的场景（调试用）
      els.sMsg.textContent = '✓ 已保存（本地）';
      els.sMsg.style.color = '#53d8a8';
      updateModelBadge();
      setTimeout(closeSettings, 600);
    }
  }

  // ===== 启动 =====
  init();

})();
