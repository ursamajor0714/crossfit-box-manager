function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + parseInt(months));
  return d.toISOString().split('T')[0];
}

module.exports = { addMonths };
