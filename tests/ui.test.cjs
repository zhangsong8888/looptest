'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const pageHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const calculatorSource = fs.readFileSync(path.join(root, 'calculator.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

/** 在 jsdom 中加载页面并执行脚本，返回可操作的页面对象。 */
function createPage() {
  const dom = new JSDOM(pageHtml, {
    url: 'http://localhost:8000/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  dom.window.eval(calculatorSource);
  dom.window.eval(appSource);
  return dom;
}

function text(page, selector) {
  return page.window.document.querySelector(selector).textContent;
}

function clickButton(page, action, value) {
  const selector = value === undefined
    ? '[data-action="' + action + '"]'
    : '[data-action="' + action + '"][data-value="' + value + '"]';
  const button = page.window.document.querySelector(selector);
  assert.ok(button, '找不到按钮：' + selector);
  button.click();
}

function pressKey(page, key) {
  page.window.document.dispatchEvent(new page.window.KeyboardEvent('keydown', {
    key: key,
    bubbles: true,
    cancelable: true
  }));
}

function enterNumber(page, digits) {
  String(digits).split('').forEach((digit) => {
    clickButton(page, 'digit', digit);
  });
}

test('点击按钮按优先级计算：2 + 3 × 4 = 14', () => {
  const page = createPage();

  enterNumber(page, 2);
  clickButton(page, 'operator', '+');
  enterNumber(page, 3);
  clickButton(page, 'operator', '×');
  enterNumber(page, 4);
  clickButton(page, 'equals');

  assert.equal(text(page, '#result'), '14');
  assert.equal(text(page, '#expression'), '2 + 3 × 4 =');
});

test('百分号：200 + 10% = 220', () => {
  const page = createPage();

  enterNumber(page, 200);
  clickButton(page, 'operator', '+');
  enterNumber(page, 10);
  clickButton(page, 'percent');
  assert.equal(text(page, '#result'), '10%');

  clickButton(page, 'equals');
  assert.equal(text(page, '#result'), '220');
});

test('除以 0 展示中文错误，清空后恢复', () => {
  const page = createPage();

  enterNumber(page, 9);
  clickButton(page, 'operator', '÷');
  enterNumber(page, 0);
  clickButton(page, 'equals');

  assert.equal(text(page, '#result'), '不能除以 0');
  assert.ok(page.window.document.querySelector('#result').classList.contains('is-error'));

  clickButton(page, 'clear');
  assert.equal(text(page, '#result'), '0');
  assert.equal(text(page, '#expression'), '0');
  assert.equal(page.window.document.querySelector('#result').classList.contains('is-error'), false);
});

test('出错后直接输入数字会重新开始', () => {
  const page = createPage();

  pressKey(page, '1');
  pressKey(page, '/');
  pressKey(page, '0');
  pressKey(page, 'Enter');
  assert.equal(text(page, '#result'), '不能除以 0');

  pressKey(page, '7');
  assert.equal(text(page, '#result'), '7');
});

test('键盘输入：12 + 3 Enter = 15', () => {
  const page = createPage();

  ['1', '2', '+', '3', 'Enter'].forEach((key) => pressKey(page, key));

  assert.equal(text(page, '#result'), '15');
  assert.equal(text(page, '#expression'), '12 + 3 =');
});

test('键盘退格、正负号与小数点', () => {
  const page = createPage();

  ['1', '2', '3', 'Backspace'].forEach((key) => pressKey(page, key));
  assert.equal(text(page, '#result'), '12');

  const page2 = createPage();
  clickButton(page2, 'sign');
  enterNumber(page2, 5);
  clickButton(page2, 'dot');
  clickButton(page2, 'digit', '2');
  assert.equal(text(page2, '#result'), '-5.2');
});

test('连续按运算符时替换而不是拼接', () => {
  const page = createPage();

  enterNumber(page, 5);
  clickButton(page, 'operator', '+');
  clickButton(page, 'operator', '×');
  enterNumber(page, 2);
  clickButton(page, 'equals');

  assert.equal(text(page, '#expression'), '5 × 2 =');
  assert.equal(text(page, '#result'), '10');
});

test('大数字显示千分位', () => {
  const page = createPage();

  enterNumber(page, 1234567);

  assert.equal(text(page, '#result'), '1,234,567');
  assert.equal(text(page, '#expression'), '1,234,567');
});

test('计算记录写入 localStorage，点击记录可复用结果', () => {
  const page = createPage();

  enterNumber(page, 8);
  clickButton(page, 'operator', '×');
  enterNumber(page, 7);
  clickButton(page, 'equals');

  const stored = JSON.parse(page.window.localStorage.getItem('calculator.history.v1'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].result, '56');

  const items = page.window.document.querySelectorAll('#history-list .history__item');
  assert.equal(items.length, 1);

  clickButton(page, 'clear');
  items[0].click();

  assert.equal(text(page, '#result'), '56');
  assert.equal(text(page, '#expression'), '8 × 7 =');

  page.window.document.querySelector('#clear-history').click();
  assert.equal(page.window.document.querySelectorAll('#history-list .history__item').length, 0);
  assert.equal(JSON.parse(page.window.localStorage.getItem('calculator.history.v1')).length, 0);
});

test('结果出现后输入数字会开始新计算', () => {
  const page = createPage();

  pressKey(page, '2');
  pressKey(page, '+');
  pressKey(page, '2');
  pressKey(page, '=');
  assert.equal(text(page, '#result'), '4');

  pressKey(page, '7');
  assert.equal(text(page, '#result'), '7');
  assert.equal(text(page, '#expression'), '7');
});

test('深色 / 浅色主题切换并写入 localStorage', () => {
  const page = createPage();
  const html = page.window.document.documentElement;

  assert.equal(html.getAttribute('data-theme'), 'light');

  page.window.document.querySelector('#theme-toggle').click();
  assert.equal(html.getAttribute('data-theme'), 'dark');
  assert.equal(page.window.localStorage.getItem('calculator.theme.v1'), 'dark');

  page.window.document.querySelector('#theme-toggle').click();
  assert.equal(html.getAttribute('data-theme'), 'light');
});

test('输入长度上限为 15 位数字', () => {
  const page = createPage();

  enterNumber(page, '12345678901234567890');

  assert.equal(text(page, '#result'), '123,456,789,012,345');
});
