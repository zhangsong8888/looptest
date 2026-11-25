/*!
 * app.js — 计算器页面的交互逻辑：输入状态、渲染、键盘、历史记录与主题。
 */
(function () {
  'use strict';

  var engine = window.CalcEngine;
  if (!engine) {
    return;
  }

  var compute = engine.compute;
  var formatNumber = engine.formatNumber;
  var groupThousands = engine.groupThousands;

  var MAX_ENTRY_DIGITS = 15;
  var MAX_HISTORY = 20;
  var HISTORY_KEY = 'calculator.history.v1';
  var THEME_KEY = 'calculator.theme.v1';

  var state = {
    tokens: [],           // 已确定的数字与运算符：[{ value, percent }, '×', ...]
    entry: '0',           // 正在输入的数字
    entryPercent: false,  // 当前输入是否带了百分号
    justEvaluated: false, // 是否刚完成一次计算
    lastExpression: '',   // 刚完成的计算式，用于回显
    error: '',
    history: []
  };

  var expressionEl = document.getElementById('expression');
  var resultEl = document.getElementById('result');
  var keypadEl = document.getElementById('keypad');
  var historyListEl = document.getElementById('history-list');
  var historyEmptyEl = document.getElementById('history-empty');
  var clearHistoryEl = document.getElementById('clear-history');
  var themeToggleEl = document.getElementById('theme-toggle');

  /* ---------------------------------- 状态 ---------------------------------- */

  function reset() {
    state.tokens = [];
    state.entry = '0';
    state.entryPercent = false;
    state.justEvaluated = false;
    state.lastExpression = '';
    state.error = '';
  }

  function startFreshIfEvaluated() {
    if (!state.justEvaluated) {
      return;
    }
    state.tokens = [];
    state.entry = '0';
    state.entryPercent = false;
    state.justEvaluated = false;
    state.lastExpression = '';
  }

  function entryValue() {
    var raw = state.entry === '-' ? '-0' : state.entry;
    var value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function lastNumber() {
    for (var i = state.tokens.length - 1; i >= 0; i -= 1) {
      if (typeof state.tokens[i] === 'object') {
        return state.tokens[i];
      }
    }
    return null;
  }

  /* ---------------------------------- 输入 ---------------------------------- */

  function inputDigit(digit) {
    if (state.error) {
      reset();
    }
    startFreshIfEvaluated();

    if (state.entryPercent) {
      return;
    }

    var digitCount = state.entry.replace(/[^0-9]/g, '').length;

    if (state.entry === '0') {
      state.entry = digit;
    } else if (state.entry === '-0') {
      state.entry = '-' + digit;
    } else if (state.entry === '' || state.entry === '-') {
      state.entry += digit;
    } else {
      if (digitCount >= MAX_ENTRY_DIGITS) {
        return;
      }
      state.entry += digit;
    }
  }

  function inputDot() {
    if (state.error) {
      reset();
    }
    startFreshIfEvaluated();

    if (state.entryPercent) {
      return;
    }

    if (state.entry === '' || state.entry === '-') {
      state.entry += '0.';
    } else if (state.entry.indexOf('.') === -1) {
      state.entry += '.';
    }
  }

  function appendOperator(operator) {
    if (state.error) {
      reset();
    }

    if (state.justEvaluated) {
      state.tokens = [{ value: entryValue(), percent: false }];
      state.entry = '';
      state.entryPercent = false;
      state.justEvaluated = false;
      state.lastExpression = '';
    } else if (state.entry !== '') {
      state.tokens.push({ value: entryValue(), percent: state.entryPercent });
      state.entry = '';
      state.entryPercent = false;
    }

    if (state.tokens.length === 0) {
      state.tokens.push({ value: 0, percent: false });
    }

    if (state.tokens.length % 2 === 1) {
      state.tokens.push(operator);
    } else {
      state.tokens[state.tokens.length - 1] = operator;
    }
  }

  function evaluate() {
    if (state.error) {
      return;
    }

    var tokens = state.tokens.slice();

    if (state.entry !== '') {
      tokens.push({ value: entryValue(), percent: state.entryPercent });
    }

    if (tokens.length > 0 && typeof tokens[tokens.length - 1] === 'string') {
      tokens.pop();
    }

    if (tokens.length === 0 || tokens.length % 2 === 0) {
      return;
    }

    if (state.tokens.length === 0 && !state.entryPercent && entryValue() === 0 && state.entry === '0') {
      return;
    }

    try {
      var expression = tokens.map(tokenText).join(' ');
      var result = formatNumber(compute(tokens));

      state.lastExpression = expression + ' =';
      state.tokens = [];
      state.entry = result;
      state.entryPercent = false;
      state.justEvaluated = true;
      state.error = '';

      pushHistory(expression, result);
    } catch (error) {
      state.error = error instanceof engine.CalculatorError ? error.message : '计算失败，请重试';
      state.justEvaluated = false;
      state.lastExpression = '';
    }
  }

  function applyPercent() {
    if (state.error) {
      reset();
    }

    if (state.justEvaluated) {
      state.tokens = [];
      state.entry = formatNumber(entryValue() / 100);
      state.entryPercent = false;
      state.justEvaluated = false;
      state.lastExpression = '';
      return;
    }

    if (state.entry === '' || state.entry === '-') {
      return;
    }

    state.entryPercent = true;
  }

  function toggleSign() {
    if (state.error) {
      reset();
    }

    if (state.justEvaluated) {
      state.entry = formatNumber(-entryValue());
      return;
    }

    if (state.entry === '' || state.entry === '0') {
      state.entry = '-0';
    } else if (state.entry.charAt(0) === '-') {
      state.entry = state.entry.slice(1) || '0';
      if (state.entry === '-') {
        state.entry = '0';
      }
    } else {
      state.entry = '-' + state.entry;
    }
  }

  function backspace() {
    if (state.error) {
      reset();
      return;
    }

    if (state.justEvaluated) {
      reset();
      return;
    }

    if (state.entryPercent) {
      state.entryPercent = false;
      return;
    }

    if (state.entry !== '') {
      if (state.entry === '0' || state.entry === '-0') {
        return;
      }
      state.entry = state.entry.slice(0, -1);
      if (state.entry === '' || state.entry === '-') {
        state.entry = '0';
      }
      return;
    }

    if (typeof state.tokens[state.tokens.length - 1] === 'string') {
      state.tokens.pop();
    }

    var previous = state.tokens.pop();
    if (previous) {
      state.entry = formatNumber(previous.value);
      state.entryPercent = Boolean(previous.percent);
    }
  }

  /* ---------------------------------- 渲染 ---------------------------------- */

  function tokenText(token) {
    if (typeof token === 'string') {
      return token;
    }
    return groupThousands(formatNumber(token.value)) + (token.percent ? '%' : '');
  }

  function renderEntry() {
    return groupThousands(state.entry) + (state.entryPercent ? '%' : '');
  }

  function displayExpression() {
    if (state.justEvaluated) {
      return state.lastExpression;
    }

    var parts = state.tokens.map(tokenText);
    if (state.entry !== '') {
      parts.push(renderEntry());
    }

    return parts.length > 0 ? parts.join(' ') : '0';
  }

  function displayResult() {
    if (state.error) {
      return state.error;
    }

    if (state.justEvaluated) {
      return groupThousands(state.entry);
    }

    if (state.entry !== '') {
      return renderEntry();
    }

    var pending = lastNumber();
    if (pending) {
      return groupThousands(formatNumber(pending.value)) + (pending.percent ? '%' : '');
    }

    return '0';
  }

  function render() {
    expressionEl.textContent = displayExpression();

    var text = displayResult();
    resultEl.textContent = text;
    resultEl.classList.toggle('is-error', Boolean(state.error));
    resultEl.title = text;
  }

  /* --------------------------------- 历史记录 -------------------------------- */

  function loadHistory() {
    try {
      var raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) {
        return [];
      }
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(function (item) {
        return item && typeof item.expression === 'string' && typeof item.result === 'string';
      }).slice(0, MAX_HISTORY);
    } catch (error) {
      return [];
    }
  }

  function saveHistory() {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
    } catch (error) {
      /* 隐私模式或存储已满时忽略，历史记录仅保留在当前页面内。 */
    }
  }

  function pushHistory(expression, result) {
    var latest = state.history[0];
    if (latest && latest.expression === expression && latest.result === result) {
      return;
    }

    state.history.unshift({ expression: expression, result: result });
    state.history = state.history.slice(0, MAX_HISTORY);
    saveHistory();
    renderHistory();
  }

  function useHistoryItem(item) {
    state.tokens = [];
    state.entry = item.result;
    state.entryPercent = false;
    state.justEvaluated = true;
    state.lastExpression = item.expression + ' =';
    state.error = '';
    render();
  }

  function renderHistory() {
    historyListEl.innerHTML = '';

    state.history.forEach(function (item) {
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'history__item';
      button.title = '使用该结果';

      var expression = document.createElement('span');
      expression.className = 'history__expression';
      expression.textContent = item.expression + ' =';

      var result = document.createElement('span');
      result.className = 'history__result';
      result.textContent = groupThousands(item.result);

      button.appendChild(expression);
      button.appendChild(result);
      button.addEventListener('click', function () {
        useHistoryItem(item);
      });

      li.appendChild(button);
      historyListEl.appendChild(li);
    });

    historyListEl.hidden = state.history.length === 0;
    historyEmptyEl.hidden = state.history.length > 0;
    clearHistoryEl.hidden = state.history.length === 0;
  }

  /* ---------------------------------- 主题 ---------------------------------- */

  function loadTheme() {
    try {
      var saved = window.localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    } catch (error) {
      /* 忽略存储异常。 */
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggleEl.setAttribute('aria-pressed', String(theme === 'dark'));
    themeToggleEl.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch (error) {
      /* 忽略存储异常。 */
    }
  }

  /* ---------------------------------- 交互 ---------------------------------- */

  var actions = {
    digit: inputDigit,
    dot: inputDot,
    operator: appendOperator,
    percent: applyPercent,
    sign: toggleSign,
    backspace: backspace,
    clear: reset,
    equals: evaluate
  };

  keypadEl.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    var action = actions[button.dataset.action];
    if (!action) {
      return;
    }

    action(button.dataset.value);
    render();
  });

  clearHistoryEl.addEventListener('click', function () {
    state.history = [];
    saveHistory();
    renderHistory();
  });

  themeToggleEl.addEventListener('click', toggleTheme);

  var keyMap = {
    '+': { action: appendOperator, value: '+' },
    '-': { action: appendOperator, value: '−' },
    '*': { action: appendOperator, value: '×' },
    'x': { action: appendOperator, value: '×' },
    'X': { action: appendOperator, value: '×' },
    '/': { action: appendOperator, value: '÷' },
    '=': { action: evaluate },
    'Enter': { action: evaluate },
    'Backspace': { action: backspace },
    'Escape': { action: reset },
    'Delete': { action: reset },
    '%': { action: applyPercent },
    '.': { action: inputDot },
    ',': { action: inputDot }
  };

  function flashKey(selector) {
    var button = document.querySelector(selector);
    if (!button) {
      return;
    }
    button.classList.add('is-pressed');
    window.setTimeout(function () {
      button.classList.remove('is-pressed');
    }, 120);
  }

  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    var key = event.key;
    var selector = null;

    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      inputDigit(key);
      render();
      flashKey('[data-action="digit"][data-value="' + key + '"]');
      return;
    }

    var mapped = keyMap[key];
    if (!mapped) {
      return;
    }

    event.preventDefault();
    mapped.action(mapped.value);
    render();

    if (mapped.action === appendOperator) {
      selector = '[data-action="operator"][data-value="' + mapped.value + '"]';
    } else if (mapped.action === evaluate) {
      selector = '[data-action="equals"]';
    } else if (mapped.action === backspace) {
      selector = '[data-action="backspace"]';
    } else if (mapped.action === reset) {
      selector = '[data-action="clear"]';
    } else if (mapped.action === applyPercent) {
      selector = '[data-action="percent"]';
    } else if (mapped.action === inputDot) {
      selector = '[data-action="dot"]';
    }

    if (selector) {
      flashKey(selector);
    }
  });

  /* ---------------------------------- 启动 ---------------------------------- */

  state.history = loadHistory();
  applyTheme(loadTheme());
  renderHistory();
  render();
})();
