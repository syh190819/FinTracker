/**
 * 日期工具函数
 */

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取当前月份字符串 YYYY-MM
 */
function currentMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 格式化显示：今天 / 昨天 / 具体日期
 */
function friendlyDate(dateStr) {
  const today = formatDate(new Date());
  const yesterday = formatDate(new Date(Date.now() - 86400000));
  if (dateStr === today) return '今天';
  if (dateStr === yesterday) return '昨天';
  return dateStr;
}

/**
 * 获取月份天数
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 获取上个月
 */
function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * 获取下个月
 */
function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * 获取当前年份
 */
function currentYear() {
  return String(new Date().getFullYear());
}

/**
 * 获取上一年
 */
function prevYear(year) {
  return String(Number(year) - 1);
}

/**
 * 获取下一年
 */
function nextYear(year) {
  return String(Number(year) + 1);
}

module.exports = {
  formatDate,
  currentMonth,
  friendlyDate,
  daysInMonth,
  prevMonth,
  nextMonth,
  currentYear,
  prevYear,
  nextYear
};
