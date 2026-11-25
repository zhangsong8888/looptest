/*!
 * calculator.js — 纯计算逻辑，不依赖 DOM。
 * 浏览器中挂到 window.CalcEngine，Node 中通过 module.exports 导出，便于单元测试。
 */
(function (root, factory) {
  'use strict';
  var engine = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = engine;
  }
  root.CalcEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var OPERATORS = new Set(['+', '−', '×', '÷']);
  var MAX_SIGNIFICANT_DIGITS = 12;

  /** 计算阶段可以预期的错误，例如除以 0、结果溢出。 */
  function CalculatorError(message) {
    this.name = 'CalculatorError';
    this.message = message;
  }
  CalculatorError.prototype = Object.create(Error.prototype);
  CalculatorError.prototype.constructor = CalculatorError;

  /**
   * 去掉浮点误差：0.1 + 0.2 变成 0.3，而不是 0.30000000000000004。
   * @param {number} value
   * @returns {number}
   */
  function clean(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new CalculatorError('无效的数字');
    }
    if (!Number.isFinite(value)) {
      throw new CalculatorError('结果超出范围');
    }
    if (value === 0) {
      return 0;
    }
    return Number.parseFloat(value.toPrecision(MAX_SIGNIFICANT_DIGITS));
  }

  /**
   * 计算表达式。
   * tokens 形如 [{ value, percent }, '×', { value, percent }]：
   * 数字与运算符交替出现，必须以数字开始和结束。
   *
   * 百分号语义与常见计算器一致：
   *   200 + 10% = 220、200 − 10% = 180、200 × 10% = 20、200 ÷ 10% = 2000。
   * 单独一个百分数则按数值除以 100 处理（50% = 0.5）。
   *
   * @param {Array<{value:number, percent?:boolean}|string>} tokens
   * @returns {number}
   */
  function compute(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new CalculatorError('表达式为空');
    }
    if (tokens.length % 2 === 0) {
      throw new CalculatorError('表达式不完整');
    }

    var numbers = [];
    var operators = [];

    tokens.forEach(function (token, index) {
      if (index % 2 === 0) {
        if (!token || typeof token !== 'object') {
          throw new CalculatorError('表达式格式错误');
        }
        var value = Number(token.value);
        if (!Number.isFinite(value)) {
          throw new CalculatorError('无效的数字');
        }
        numbers.push({ value: value, percent: Boolean(token.percent) });
      } else {
        if (typeof token !== 'string' || !OPERATORS.has(token)) {
          throw new CalculatorError('未知的运算符');
        }
        operators.push(token);
      }
    });

    // 第一轮：先处理 × ÷（左结合）。
    for (var i = 0; i < operators.length; ) {
      var op = operators[i];
      if (op !== '×' && op !== '÷') {
        i += 1;
        continue;
      }

      var left = numbers[i].percent ? numbers[i].value / 100 : numbers[i].value;
      var right = numbers[i + 1].percent ? numbers[i + 1].value / 100 : numbers[i + 1].value;
      var result;

      if (op === '×') {
        result = left * right;
      } else {
        if (right === 0) {
          throw new CalculatorError('不能除以 0');
        }
        result = left / right;
      }

      numbers.splice(i, 2, { value: clean(result), percent: false });
      operators.splice(i, 1);
    }

    // 第二轮：+ −（左结合），百分号以左侧累计值作为基数。
    var accumulator = numbers[0].percent ? numbers[0].value / 100 : numbers[0].value;

    for (var j = 0; j < operators.length; j += 1) {
      var current = numbers[j + 1];
      var operand = current.value;

      if (current.percent) {
        operand = operators[j] === '+' || operators[j] === '−'
          ? (accumulator * operand) / 100
          : operand / 100;
      }

      accumulator = operators[j] === '+' ? accumulator + operand : accumulator - operand;
      accumulator = clean(accumulator);
    }

    return clean(accumulator);
  }

  /**
   * 把数值格式化为适合展示的字符串（最多 12 位有效数字，过大/过小用科学计数法）。
   * @param {number} value
   * @returns {string}
   */
  function formatNumber(value) {
    var number = clean(value);

    if (number === 0) {
      return '0';
    }

    var absolute = Math.abs(number);
    if (absolute >= 1e12 || absolute < 1e-9) {
      return number.toExponential(6).replace(/\.?0+e/, 'e');
    }

    var text = String(number);
    if (text.length > 15) {
      text = number.toPrecision(MAX_SIGNIFICANT_DIGITS);
      if (text.indexOf('e') !== -1) {
        return number.toExponential(6).replace(/\.?0+e/, 'e');
      }
      text = text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    }

    return text;
  }

  /**
   * 给整数部分加千分位，例如 "1234567.5" -> "1,234,567.5"。
   * 非纯数字文本原样返回。
   * @param {string} text
   * @returns {string}
   */
  function groupThousands(text) {
    if (!/^-?\d+(\.\d*)?$/.test(text)) {
      return text;
    }

    var negative = text.charAt(0) === '-';
    var body = negative ? text.slice(1) : text;
    var parts = body.split('.');
    var grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return (negative ? '-' : '') + grouped + (parts.length > 1 ? '.' + parts[1] : '');
  }

  return {
    CalculatorError: CalculatorError,
    compute: compute,
    clean: clean,
    formatNumber: formatNumber,
    groupThousands: groupThousands
  };
});
