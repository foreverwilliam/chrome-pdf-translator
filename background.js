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
  return extractDeepLText(data);
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
          content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。要求：翻译准确、自然流畅。输入中各段落以 ---SPLIT--- 分隔，输出也必须用 ---SPLIT--- 分隔对应的翻译结果，保持段落数量一致。只输出翻译结果，不要添加任何解释。'
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
  return extractChoicesText(data, 'OpenAI');
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
          content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。要求：翻译准确、自然流畅。输入中各段落以 ---SPLIT--- 分隔，输出也必须用 ---SPLIT--- 分隔对应的翻译结果，保持段落数量一致。只输出翻译结果，不要添加任何解释。'
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
  return extractChoicesText(data, 'DeepSeek');
}

// 自定义供应商翻译（支持 OpenAI 兼容格式和 Anthropic Messages 格式）
async function translateWithCustom(text, apiKey, customUrl, customModel, customFormat) {
  if (!customUrl) {
    throw new Error('请先在插件设置中配置自定义 API 端点 URL');
  }
  if (!customModel) {
    throw new Error('请先在插件设置中配置自定义模型名称');
  }

  // 自动拼接路径：用户只需填 base URL
  const baseUrl = customUrl.replace(/\/+$/, '');
  let endpoint;
  if (customFormat === 'anthropic') {
    endpoint = baseUrl.includes('/v1/messages') ? baseUrl : baseUrl + '/v1/messages';
  } else {
    endpoint = baseUrl.includes('/v1/chat/completions') ? baseUrl : baseUrl + '/v1/chat/completions';
  }

  if (customFormat === 'anthropic') {
    // Anthropic Messages API 格式
    const response = await fetch(endpoint, {
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
        system: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。要求：翻译准确、自然流畅。输入中各段落以 ---SPLIT--- 分隔，输出也必须用 ---SPLIT--- 分隔对应的翻译结果，保持段落数量一致。只输出翻译结果，不要添加任何解释。',
        messages: [
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    const data = await parseJsonResponse(response, '自定义 API (Anthropic)');
    // 智能检测：如果 API 实际返回 OpenAI 格式（有 choices），自动回退
    if (data.choices && Array.isArray(data.choices)) {
      console.warn('设置为 Anthropic 格式，但 API 返回了 OpenAI 格式（含 choices），自动按 OpenAI 格式提取');
      return extractChoicesText(data, '自定义 API (Anthropic→OpenAI 自动回退)');
    }
    return extractAnthropicText(data, '自定义 API (Anthropic)');
  } else {
    // OpenAI Chat Completions 兼容格式
    const response = await fetch(endpoint, {
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
            content: '你是一个专业的英中翻译器。请将以下英文文本翻译成简体中文。要求：翻译准确、自然流畅。输入中各段落以 ---SPLIT--- 分隔，输出也必须用 ---SPLIT--- 分隔对应的翻译结果，保持段落数量一致。只输出翻译结果，不要添加任何解释。'
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
    // 智能检测：如果 API 实际返回 Anthropic 格式（有 content 数组无 choices），自动回退
    if (!data.choices && data.content && Array.isArray(data.content)) {
      console.warn('设置为 OpenAI 格式，但 API 返回了 Anthropic 格式（含 content），自动按 Anthropic 格式提取');
      return extractAnthropicText(data, '自定义 API (OpenAI→Anthropic 自动回退)');
    }
    return extractChoicesText(data, '自定义 API');
  }
}
