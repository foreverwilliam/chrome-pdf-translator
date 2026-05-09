// PDF Translator - Popup 设置逻辑

document.addEventListener('DOMContentLoaded', () => {
  const providerEl = document.getElementById('provider');
  const apiKeyEl = document.getElementById('api-key');
  const modelEl = document.getElementById('model');
  const modelGroup = document.getElementById('model-group');
  const customUrlGroup = document.getElementById('custom-url-group');
  const customModelGroup = document.getElementById('custom-model-group');
  const customFormatGroup = document.getElementById('custom-format-group');
  const customUrlEl = document.getElementById('custom-url');
  const customModelEl = document.getElementById('custom-model');
  const formatSwitch = document.getElementById('format-switch');
  const formatHint = document.getElementById('format-hint');
  const keyHint = document.getElementById('key-hint');
  const saveBtn = document.getElementById('save-btn');
  const openBtn = document.getElementById('open-btn');
  const msgEl = document.getElementById('msg');

  // 加载已保存的设置
  chrome.storage.local.get(['provider', 'apiKey', 'model', 'customUrl', 'customModel', 'customFormat'], (data) => {
    if (data.provider) providerEl.value = data.provider;
    if (data.apiKey) apiKeyEl.value = data.apiKey;
    if (data.model) modelEl.value = data.model;
    if (data.customUrl) customUrlEl.value = data.customUrl;
    if (data.customModel) customModelEl.value = data.customModel;
    // 设置格式切换状态
    const fmt = data.customFormat || 'openai';
    formatSwitch.querySelectorAll('.format-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.format === fmt);
    });
    updateFormatHint(fmt);
    updateProviderUI();
    // 加载后恢复已保存的 model 选中状态
    if (data.model && (data.provider === 'openai' || data.provider === 'deepseek')) {
      modelEl.value = data.model;
    }
  });

  // 切换翻译服务时更新 UI
  providerEl.addEventListener('change', updateProviderUI);

  // 格式切换按钮
  formatSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('.format-option');
    if (!btn) return;
    formatSwitch.querySelectorAll('.format-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateFormatHint(btn.dataset.format);
  });

  function updateFormatHint(format) {
    if (!formatHint) return;
    if (format === 'anthropic') {
      formatHint.textContent = 'Anthropic Messages 格式（x-api-key + Bearer，兼容官方 API 与中转网关）';
    } else {
      formatHint.textContent = 'OpenAI Chat Completions 兼容格式';
    }
  }

  function updateProviderUI() {
    const provider = providerEl.value;
    const isCustom = provider === 'custom';
    const showModelSelect = provider === 'openai' || provider === 'deepseek';

    // 控制各区块的显隐
    modelGroup.classList.toggle('visible', showModelSelect);
    customUrlGroup.classList.toggle('visible', isCustom);
    customModelGroup.classList.toggle('visible', isCustom);
    customFormatGroup.classList.toggle('visible', isCustom);

    if (provider === 'deepl') {
      keyHint.textContent = 'DeepL Free Key 以 :fx 结尾';
      apiKeyEl.placeholder = '输入你的 DeepL API Key';
    } else if (provider === 'openai') {
      keyHint.textContent = '在 platform.openai.com 获取 API Key';
      apiKeyEl.placeholder = '输入你的 OpenAI API Key';
    } else if (provider === 'deepseek') {
      keyHint.textContent = '在 platform.deepseek.com 获取 API Key';
      apiKeyEl.placeholder = '输入你的 DeepSeek API Key';
    } else if (isCustom) {
      keyHint.textContent = '输入自定义 API 服务的 Key';
      apiKeyEl.placeholder = '输入你的 API Key';
    }

    // 根据 provider 切换预设模型选项
    if (showModelSelect) {
      updateModelOptions(provider);
    }
  }

  function updateModelOptions(provider) {
    modelEl.innerHTML = '';

    if (provider === 'openai') {
      addOption('gpt-4o', 'GPT-4o (推荐)');
      addOption('gpt-4o-mini', 'GPT-4o-mini (更快更便宜)');
      addOption('gpt-4-turbo', 'GPT-4 Turbo');
    } else if (provider === 'deepseek') {
      addOption('deepseek-chat', 'DeepSeek-V3 (推荐)');
      addOption('deepseek-reasoner', 'DeepSeek-R1 (推理增强)');
    }
  }

  function addOption(value, text) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    modelEl.appendChild(opt);
  }

  // 保存设置
  saveBtn.addEventListener('click', () => {
    const provider = providerEl.value;
    const apiKey = apiKeyEl.value.trim();
    const model = modelEl.value;
    const customUrl = customUrlEl.value.trim();
    const customModel = customModelEl.value.trim();
    const activeFormatBtn = formatSwitch.querySelector('.format-option.active');
    const customFormat = activeFormatBtn ? activeFormatBtn.dataset.format : 'openai';

    if (!apiKey) {
      showMsg('请输入 API Key', true);
      return;
    }

    if (provider === 'custom') {
      if (!customUrl) {
        showMsg('请输入 API 端点 URL', true);
        return;
      }
      if (!customModel) {
        showMsg('请输入模型名称', true);
        return;
      }
      // 简单校验 URL 格式
      if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://')) {
        showMsg('URL 需以 http:// 或 https:// 开头', true);
        return;
      }
    }

    chrome.storage.local.set({ provider, apiKey, model, customUrl, customModel, customFormat }, () => {
      showMsg('设置已保存 ✓');
    });
  });

  // 打开翻译器页面
  openBtn.addEventListener('click', () => {
    const viewerUrl = chrome.runtime.getURL('viewer/viewer.html');
    chrome.tabs.create({ url: viewerUrl });
    window.close();
  });

  function showMsg(text, isError) {
    msgEl.textContent = text;
    msgEl.style.color = isError ? '#e94560' : '#53d8a8';
    setTimeout(() => { msgEl.textContent = ''; }, 3000);
  }
});
