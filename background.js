// PDF Translator - Background Service Worker

// 监听来自 viewer 的翻译请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslation(request.text, request.provider, request.apiKey, request.model, request.customUrl, request.customModel, request.customFormat)
      .then(result => sendResponse({ success: true, translation: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开放（异步响应）
  }

  if (request.action === 'getSettings') {
    chrome.storage.local.get(['provider', 'apiKey', 'model', 'customUrl', 'customModel', 'customFormat'], (data) => {
      sendResponse(data);
    });
    return true;
  }
});

// 安全解析 JSON 响应
async function parseJsonResponse(response, serviceName) {
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    const body = await response.text();
    if (body.startsWith('<!') || body.startsWith('<html')) {
      throw new Error(serviceName + ' 返回了 HTML 而非 JSON (HTTP ' + response.status + ')，请检查 API Key 和端点是否正确');
    }
    throw new Error(serviceName + ' API 错误: ' + response.status + ' - ' + body.substring(0, 200));
  }

  if (!contentType.includes('json')) {
    const body = await response.text();
    if (body.startsWith('<!') || body.startsWith('<html')) {
      throw new Error(serviceName + ' 返回了网页而非 API 数据，请检查 API 端点 URL 是否正确');
    }
    throw new Error(serviceName + ' 返回了非 JSON 内容 (Content-Type: ' + contentType + ')');
  }

  return response.json();
}

// 翻译处理函数
async function handleTranslation(text, provider, apiKey, model, customUrl, customModel, customFormat) {
  if (!apiKey) {
    throw new Error('请先在插件设置中配置 API Key');
  }

  switch (provider) {
    case 'deepl':
      return await translateWithDeepL(text, apiKey);
    case 'openai':
      return await translateWithOpenAI(text, apiKey, model || 'gpt-4o');
    case 'deepseek':
      return await translateWithDeepSeek(text, apiKey, model || 'deepseek-chat');
    case 'custom':
      return await translateWithCustom(text, apiKey, customUrl, customModel, customFormat || 'openai');
    default:
      throw new Error('未知的翻译服务: ' + provider);
  }
}

// DeepL 翻译
async function translateWithDeepL(text, apiKey) {
  const baseUrl = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'DeepL-Auth-Key ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: [text],
      target_lang: 'ZH'
    })
  });

  const data = await parseJsonResponse(response, 'DeepL');
  return data.translations[0].text;
}

// OpenAI 翻译
async function translateWithOpenAI(text, apiKey, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。要求：翻译准确、自然流畅，保持原文的段落结构。只输出翻译结果，不要添加任何解释。'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3
    })
  });

  const data = await parseJsonResponse(response, 'OpenAI');
  return data.choices[0].message.content.trim();
}

// DeepSeek 翻译（兼容 OpenAI 接口格式）
async function translateWithDeepSeek(text, apiKey, model) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。要求：翻译准确、自然流畅，保持原文的段落结构。只输出翻译结果，不要添加任何解释。'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3
    })
  });

  const data = await parseJsonResponse(response, 'DeepSeek');
  return data.choices[0].message.content.trim();
}

// 自定义供应商翻译（支持 OpenAI 兼容格式和 Anthropic Messages 格式）
async function translateWithCustom(text, apiKey, customUrl, customModel, customFormat) {
  if (!customUrl) {
    throw new Error('请先在插件设置中配置自定义 API 端点 URL');
  }
  if (!customModel) {
    throw new Error('请先在插件设置中配置自定义模型名称');
  }

  if (customFormat === 'anthropic') {
    // Anthropic Messages API 格式
    const response = await fetch(customUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: customModel,
        max_tokens: 4096,
        system: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。要求：翻译准确、自然流畅，保持原文的段落结构。只输出翻译结果，不要添加任何解释。',
        messages: [
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    const data = await parseJsonResponse(response, '自定义 API (Anthropic)');
    return data.content[0].text;
  } else {
    // OpenAI Chat Completions 兼容格式
    const response = await fetch(customUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: customModel,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。要求：翻译准确、自然流畅，保持原文的段落结构。只输出翻译结果，不要添加任何解释。'
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3
      })
    });

    const data = await parseJsonResponse(response, '自定义 API');
    return data.choices[0].message.content.trim();
  }
}
