'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CalculatorError,
  compute,
  clean,
  formatNumber,
  groupThousands
} = require('../calculator.js');

/** 便捷构造：数字与运算符交替传入，字符串视为运算符。 */
function tokens(...items) {
  return items.map((item) => {
    if (typeof item === 'string') return item;
    if (typeof item === 'number') return { value: item, percent: false };
    if (item && typeof item === 'object' && typeof item.value === 'number') {
      return { value: item.value, percent: Boolean(item.percent) };
    }
    throw new TypeError('不支持的 token: ' + String(item));
  });
}

test('按优先级计算：先乘除后加减', () => {
  assert.equal(compute(tokens(2, '+', 3, '×', 4)), 14);
  assert.equal(compute(tokens(10, '−', 2, '×', 3)), 4);
});

test('同级运算左结合', () => {
  assert.equal(compute(tokens(10, '−', 2, '−', 3)), 5);
  assert.equal(compute(tokens(12, '÷', 3, '÷', 2)), 2);
  assert.equal(compute(tokens(100, '÷', 4, '×', 5)), 125);
});

test('小数运算会消除浮点误差', () => {
  assert.equal(compute(tokens(0.1, '+', 0.2)), 0.3);
  assert.equal(formatNumber(compute(tokens(0.1, '+', 0.2))), '0.3');
  assert.equal(compute(tokens(1.1, '×', 3)), 3.3);
});

test('负数参与运算', () => {
  assert.equal(compute(tokens(-5, '+', 3)), -2);
  assert.equal(compute(tokens(-5, '×', -3)), 15);
});

test('百分号遵循常见计算器语义', () => {
  assert.equal(compute(tokens(200, '+', { value: 10, percent: true })), 220);
  assert.equal(compute(tokens(200, '−', { value: 10, percent: true })), 180);
  assert.equal(compute(tokens(200, '×', { value: 10, percent: true })), 20);
  assert.equal(compute(tokens(200, '÷', { value: 10, percent: true })), 2000);
  assert.equal(compute(tokens({ value: 50, percent: true })), 0.5);
});

test('连续百分比以当前累计值为基数', () => {
  assert.equal(compute(tokens(100, '+', { value: 10, percent: true }, '+', { value: 10, percent: true })), 121);
});

test('除以 0 抛出可读错误', () => {
  assert.throws(
    () => compute(tokens(1, '÷', 0)),
    (error) => error instanceof CalculatorError && error.message === '不能除以 0'
  );
});

test('非法表达式会抛出错误', () => {
  assert.throws(() => compute([]), /表达式为空/);
  assert.throws(() => compute(tokens(2, '+')), /表达式不完整/);
  assert.throws(() => compute([{ value: 2 }, '^', { value: 3 }]), /未知的运算符/);
  assert.throws(() => compute([{ value: Number.NaN }, '+', { value: 1 }]), CalculatorError);
});

test('结果溢出时抛出错误', () => {
  assert.throws(
    () => compute(tokens(1e308, '×', 10)),
    (error) => error instanceof CalculatorError && error.message === '结果超出范围'
  );
});

test('数值格式化：普通、小数、科学计数法', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(42), '42');
  assert.equal(formatNumber(123456789), '123456789');
  assert.equal(formatNumber(100000000000), '100000000000');
  assert.equal(formatNumber(1e13), '1e+13');
  assert.equal(formatNumber(1e-10), '1e-10');
  assert.equal(formatNumber(1 / 3), '0.333333333333');
});

test('千分位分组', () => {
  assert.equal(groupThousands('1234567'), '1,234,567');
  assert.equal(groupThousands('1234567.5'), '1,234,567.5');
  assert.equal(groupThousands('-1234'), '-1,234');
  assert.equal(groupThousands('12'), '12');
  assert.equal(groupThousands('0.'), '0.');
  assert.equal(groupThousands('1e+13'), '1e+13');
});

test('clean 保留最多 12 位有效数字', () => {
  assert.equal(clean(0.30000000000000004), 0.3);
  assert.equal(clean(1.2345678901234567), 1.23456789012);
});

test('计算不会修改传入的 tokens', () => {
  const input = tokens(2, '+', 3);
  const snapshot = JSON.parse(JSON.stringify(input));
  compute(input);
  assert.deepEqual(input, snapshot);
});
