const getAppData = require('./../../lib/store-api/get-app-data')
const axios = require('./../../lib/pagarme/axios-create')
const {
  getOrderById,
  addPaymentHistory,
  updateTransaction,
  getOrderIntermediatorTransactionId,
  createNewOrderBasedOld,
  updateOrder
} = require('../../lib/store-api/utils')

exports.post = async ({ appSdk, admin }, req, res) => {
  const colletionFirebase = admin.firestore().collection('subscriptions')
  const { body, query } = req
  // console.log('>> QUERY: ', query)
  try {
    const type = body.type
    const storeId = parseInt(query.store_id)
    const auth = await appSdk.getAuth(storeId)
    const appData = await getAppData({ appSdk, storeId, auth })
    const pagarmeAxios = axios(appData.pagarme_secret_key)

    // check store ai query, check autentication

    console.log('>> webhook ', JSON.stringify(body), ` type:${type}`)
    if (type === 'invoice.created' && body.data) {
      const { data: invoice } = await pagarmeAxios.get(`/invoices/${body.data.id}`)
      if (invoice) {
        const orderOriginalId = invoice.subscription?.code
        const subscriptionPagarmeId = invoice.subscription?.id
        console.log(`>> Check Invoice: ${JSON.stringify(invoice)}, SubcriptionId: ${orderOriginalId}`)

        const documentSnapshot = await colletionFirebase.doc(orderOriginalId).get()
        const docSubscription = documentSnapshot.exists && documentSnapshot.data()

        if (!docSubscription) {
          console.log('Subscription not found')
          return res.status(404)
            .send({ message: `Subscription code: #${orderOriginalId} not found` })
        } else {
          //
          if (docSubscription.invoicePagarmeId === invoice.id) {
            const { plan: { discount } } = docSubscription
            const url = `/subscriptions/${subscriptionPagarmeId}/discounts`
            const bodyDiscountPagarme = {
              value: discount.value,
              discount_type: discount.percentage ? 'percentage' : 'flat'
            }
            try {
              await pagarmeAxios.post(url, bodyDiscountPagarme)
              res.status(201)
                .send({ message: 'Discount updated' })
            } catch (error) {
              console.error(error)
              const errCode = 'WEBHOOK_PAGARME_INVOICE_CREATED'
              let status = 409
              let message = error.message
              if (error.response) {
                status = error.response.status || status
                const { data } = error.response
                if (status !== 401 && status !== 403) {
                  message = error.response.message || message
                } else if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
                  message = data.errors[0].message
                }
              }
              return res.status(status || 400)
                .send({
                  error: errCode,
                  message
                })
            }
          } else {
            return res.status(200)
              .send({ message: 'Not the first invoice' })
          }
        }
      } else {
        return res.status(404)
          .send({ message: 'Not found invoice' })
      }
    } else if (type.endsWith('.paid')) {
      const isInvoice = type.split('.paid')[0] === 'invoice'
      try {
        if (isInvoice) {
          const { data: invoice } = await pagarmeAxios.get(`/invoices/${body.data.id}`)
          if (invoice) {
            const orderOriginalId = invoice.subscription?.code
            // const subscriptionPagarmeId = invoice.subscription?.id
            // console.log(`>> Check Invoice paid: ${JSON.stringify(invoice)}, SubcriptionId: ${orderOriginalId}`)

            const documentSnapshot = await colletionFirebase.doc(orderOriginalId).get()
            const docSubscription = documentSnapshot.exists && documentSnapshot.data()

            if (!docSubscription) {
              console.log('Subscription not found')
              return res.status(404)
                .send({ message: `Subscription code: #${orderOriginalId} not found` })
            } else {
              //
              const orderOriginal = await getOrderById(appSdk, storeId, orderOriginalId, auth)

              if (docSubscription.invoicePagarmeId === invoice.id) {
                // update status order original
                if (orderOriginal.financial_status.current !== 'paid') {
                  console.log('>> Try add payment history frist recurrence')
                  const transactionPagarme = invoice.charge.last_transaction
                  const transactionId = orderOriginal.transactions[0]._id

                  let notificationCode = `${type};${body.id};`
                  if (transactionPagarme.transaction_type === 'credit_card') {
                    notificationCode += `${transactionPagarme.gateway_id || ''};`
                    notificationCode += `${transactionPagarme.acquirer_tid || ''};`
                    notificationCode += `${transactionPagarme.acquirer_nsu || ''};`
                    notificationCode += `${transactionPagarme.acquirer_auth_code || ''};`
                  } else if (transactionPagarme.transaction_type === 'boleto') {
                    notificationCode += `${transactionPagarme.gateway_id || ''};`
                  }

                  const bodyPaymentHistory = {
                    date_time: transactionPagarme.updated_at || new Date().toISOString(),
                    status: 'paid',
                    notification_code: notificationCode,
                    flags: ['PagarMe']
                  }
                  if (transactionId) {
                    bodyPaymentHistory.transaction_id = transactionId
                  }
                  await addPaymentHistory(appSdk, storeId, orderOriginalId, auth, bodyPaymentHistory)
                  const bodyTransaction = {
                    intermediator: {
                      transaction_id: `${invoice.id};`,
                      transaction_code: `${transactionPagarme.acquirer_auth_code || ''};`,
                      transaction_reference: `${transactionPagarme.acquirer_tid || ''};`

                    }
                  }
                  if (transactionId) {
                    await updateTransaction(appSdk, storeId, orderOriginalId, auth, bodyTransaction, transactionId)
                  } else {
                    bodyTransaction.amount = orderOriginal.amount.total
                    const code = transactionPagarme.transaction_type === 'credit_card' ? 'credit_card' : 'banking_billet'
                    bodyTransaction.payment_method = { code }
                    await updateTransaction(appSdk, storeId, orderOriginalId, auth, bodyTransaction)
                  }
                  console.log('>> update status for paid')
                  return res.sendStatus(200)
                } else {
                  console.log('>>Frist recurrence is paid')
                  return res.sendStatus(200)
                }
              } else {
                // Check order exists
                const order = await getOrderIntermediatorTransactionId(appSdk, storeId, invoice.id, auth)
                console.log('>> ', order)
                if (!order) {
                  console.log('>> Try create new order for recurrence')
                  const documentSnapshot = await colletionFirebase.doc(orderOriginalId).get()
                  const docSubscription = documentSnapshot.exists && documentSnapshot.data()
                  // create new order
                  if (docSubscription) {
                    const { plan } = docSubscription
                    await createNewOrderBasedOld(appSdk, storeId, auth, orderOriginal, plan, 'paid', invoice)
                    console.log('>> Create new Order')
                    return res.sendStatus(201)
                  } else {
                    console.log('Subscription not found')
                    return res.status(404)
                      .send({ message: `Subscription code: #${orderOriginalId} not found` })
                  }
                }
              }
            }
          } else {
            return res.status(404)
              .send({ message: 'Not found invoice' })
          }
        }
      } catch (error) {
        console.error(error)
        const errCode = `WEBHOOK_PAGARME_${isInvoice ? 'INVOICE' : 'ORDER'}_PAID`
        let status = 409
        let message = error.message
        if (error.response) {
          status = error.response.status || status
          const { data } = error.response
          if (status !== 401 && status !== 403) {
            message = error.response.message || message
          } else if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
            message = data.errors[0].message
          }
        }
        return res.status(status || 400)
          .send({
            error: errCode,
            message
          })
      }
    } else if (type.endsWith('.canceled')) {
      const webhookType = type.split('.paid')[0]
      if (webhookType === 'subscription') {
        console.log()
        const { data: subscription } = await pagarmeAxios.get(`/subscriptions/${body.data.id}`)
        if (subscription) {
          const orderOriginalId = subscription.code
          const orderOriginal = await getOrderById(appSdk, storeId, orderOriginalId, auth)
          if (orderOriginal && orderOriginal.status !== 'cancelled') {
            await updateOrder(appSdk, storeId, orderOriginalId, auth, { status: 'cancelled' })
            console.log('>> Status update Cancelled')
            return res.sendStatus(200)
          } else {
            console.log('>> Order not found or status canceled')
            return res.sendStatus(200)
          }
        } else {
          return res.status(404)
            .send({ message: 'Not found subscription' })
        }
      } else if (webhookType === 'invoice') {
        const { data: invoice } = await pagarmeAxios.get(`/invoices/${body.data.id}`)
        if (invoice) {
          const orderOriginalId = invoice.subscription?.code
          const documentSnapshot = await colletionFirebase.doc(orderOriginalId).get()
          const docSubscription = documentSnapshot.exists && documentSnapshot.data()
          if (!docSubscription) {
            console.log('Subscription not found')
            return res.status(404)
              .send({ message: `Subscription code: #${orderOriginalId} not found` })
          } else {
            let order
            let transactionId
            if (docSubscription.invoicePagarmeId === invoice.id) {
              order = await getOrderById(appSdk, storeId, orderOriginalId, auth)
              transactionId = order.transactions[0]._id
            } else {
              order = await getOrderIntermediatorTransactionId(appSdk, storeId, invoice.id, auth)
              const transaction = order.transactions.find(transaction =>
                transaction.intermediator.transaction_id === invoice.id
              )
              transactionId = transaction && transaction._id
            }

            if (order && order.financial_status.current !== 'voided') {
              // await updateOrder(appSdk, storeId, orderOriginalId, auth, { status: 'cancelled' })
              const transactionPagarme = invoice.charge.last_transaction

              let notificationCode = `${type};${body.id};`
              if (transactionPagarme.transaction_type === 'credit_card') {
                notificationCode += `${transactionPagarme.gateway_id || ''};`
                notificationCode += `${transactionPagarme.acquirer_tid || ''};`
                notificationCode += `${transactionPagarme.acquirer_nsu || ''};`
                notificationCode += `${transactionPagarme.acquirer_auth_code || ''};`
              } else if (transactionPagarme.transaction_type === 'boleto') {
                notificationCode += `${transactionPagarme.gateway_id || ''};`
              }

              const bodyPaymentHistory = {
                date_time: transactionPagarme.updated_at || new Date().toISOString(),
                status: 'voided',
                notification_code: notificationCode,
                flags: ['PagarMe']
              }
              if (transactionId) {
                bodyPaymentHistory.transaction_id = transactionId
              }
              await addPaymentHistory(appSdk, storeId, orderOriginalId, auth, bodyPaymentHistory)
              console.log('>> financial status update voided')
              return res.sendStatus(200)
            } else {
              console.log('>> Order not found or financial status voided')
              return res.sendStatus(200)
            }
          }
        } else {
          return res.status(404)
            .send({ message: 'Not found invoice' })
        }
      }
    }
  } catch (error) {
    console.error(error)
    const errCode = 'WEBHOOK_PAGARME_INTERNAL_ERR'
    let status = 409
    let message = error.message
    if (error.response) {
      status = error.response.status || status
      const { data } = error.response
      if (status !== 401 && status !== 403) {
        message = error.response.message || message
      } else if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
        message = data.errors[0].message
      }
    }
    return res.status(status || 500)
      .send({
        error: errCode,
        message
      })
  }
}
