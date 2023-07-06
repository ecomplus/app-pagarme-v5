// pending, paid, canceled, scheduled ou failed.
const parserInvoiceStatusToEcom = (status) => {
  // pending, paid, canceled, scheduled ou failed
  switch (status) {
    case 'pending':
    case 'paid':
      return status
    case 'scheduled':
      return 'under_analysis'
    case 'canceled':
      return 'voided'
    case 'failed':
      return 'unauthorized'
    default:
      return 'unknown'
  }
}
module.exports = {
  parserInvoiceStatusToEcom
}
