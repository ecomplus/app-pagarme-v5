const getAppData = require('./../../lib/store-api/get-app-data')
const axios = require('./../../lib/pagarme/axios-create')
const {
  getOrderById,
  addPaymentHistory,
  updateTransaction,
  getOrderIntermediatorTransactionId,
  createNewOrderBasedOld,
  updateOrder,
  checkItemCategory
} = require('../../lib/store-api/utils')
const { logger } = require('../../context')
const { parserChangeStatusToEcom } = require('../../lib/pagarme/parses-utils')

exports.post = async ({ appSdk, admin }, req, res) => {
  const colletionFirebase = admin.firestore().collection('subscriptions')
  const { body, query } = req

  try {
    const type = body.type
    const storeId = parseInt(query.store_id)
    const auth = await appSdk.getAuth(storeId)
    const appData = await getAppData({ appSdk, storeId, auth })
    const pagarmeAxios = axios(appData.pagarme_api_token)
    logger.info(`>> webhook ${JSON.stringify(body)}, type:${type}`)
    if (type === 'subscription.created' && body.data) {
      const orderOriginalId = body.data?.code
      const subscriptionPagarmeId = body.data?.id
      // (`>> Check SubcriptionId: ${orderOriginalId}`)
      const documentSnapshot = await colletionFirebase.doc(orderOriginalId).get()
      const docSubscription = documentSnapshot.exists && documentSnapshot.data()
      if (!docSubscription) {
        logger.warn('> Subscription not found')
        return res.status(404)
          .send({ message: `Subscription code: #${orderOriginalId} not found` })
      } else {
        const requestPagarme = []
        // Check if the product belongs to categories that can be subscribed
        const categoryIds = appData.recurrency_category_ids
        const { items: itemsApi } = await getOrderById(appSdk, storeId, orderOriginalId, auth)

        if (categoryIds && Array.isArray(categoryIds) && categoryIds.length) {
          const { data: { items: itemsPagarme } } = await pagarmeAxios.get(`/subscriptions/${subscriptionPagarmeId}`)
          const itemsIdPagarmeDelete = await checkItemCategory(appSdk, storeId, auth, categoryIds, itemsPagarme, itemsApi)

          const urlRemoveItem = `/subscriptions/${subscriptionPagarmeId}/items/`
          if (itemsIdPagarmeDelete?.length) {
            itemsIdPagarmeDelete.forEach(itemId => {
              requestPagarme.push(pagarmeAxios.delete(`${urlRemoveItem}${itemId}`))
            })
          }
        }

        const { plan } = docSubscription
        const { discount } = plan
        const urlDiscount = `/subscriptions/${subscriptionPagarmeId}/discounts`
        const bodyDiscountPagarme = { value: discount.value }

        // Add plan discount on each product
        if (discount.type === 'percentage') {
          itemsApi?.forEach(item => {
            requestPagarme.push(pagarmeAxios.post(urlDiscount,
              {
                ...bodyDiscountPagarme,
                discount_type: 'percentage',
                item_id: `pi_${item.sku}`
              }
            ))
          })

          // Apply shipping discount if app configuration allows
          if (discount.apply_at !== 'subtotal') {
            requestPagarme.push(pagarmeAxios.post(urlDiscount,
              {
                ...bodyDiscountPagarme,
                discount_type: 'percentage',
                item_id: `pi_freight_${orderOriginalId}`
              }
            ))
          }
        } else {
          requestPagarme.push(pagarmeAxios.post(urlDiscount,
            {
              ...bodyDiscountPagarme,
              discount_type: 'flat'
            }
          ))
        }

        try {
          await Promise.all(requestPagarme)
          logger.info('>> Updated signature')
          res.status(201)
            .send({ message: 'Updated signature' })
        } catch (error) {
          logger.error(error)
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
      }
    } else if (type === 'subscription.canceled' && body.data) {
      const { data: subscription } = await pagarmeAxios.get(`/subscriptions/${body.data.id}`)
      if (subscription && subscription.status === 'canceled') {
        const orderOriginalId = subscription.code
        const orderOriginal = await getOrderById(appSdk, storeId, orderOriginalId, auth)
        if (!orderOriginal) {
          console.info('>> Order status canceled')
          return res.sendStatus(404)
        } else if (orderOriginal.status !== 'cancelled') {
          await updateOrder(appSdk, storeId, orderOriginalId, auth, { status: 'cancelled' })
          logger.info('>> Status update Cancelled')
          return res.sendStatus(200)
        } else {
          logger.info('>> Order status canceled')
          return res.sendStatus(200)
        }
      } else {
        return res.status(!subscription ? 404 : 400)
          .send({ message: !subscription ? 'Not found subscription' : 'Subscription not canceled' })
      }
    } else if (type.startsWith('charge.')) {
      const { data: charge } = await pagarmeAxios.get(`/charges/${body.data.id}`)
      logger.info(`>> Charge: ${JSON.stringify(charge)}`)
      if (charge.invoice) {
        const { invoice, status } = charge
        const order = await getOrderIntermediatorTransactionId(appSdk, storeId, invoice.id, auth)
        if (order) {
          if (order.financial_status.current !== parserChangeStatusToEcom(status)) {
            // updadte status
            const transaction = order.transactions.find(transaction => transaction.intermediator.transaction_id === invoice.id)
            const transactionPagarme = charge.last_transaction
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
              status: parserChangeStatusToEcom(status),
              notification_code: notificationCode,
              flags: ['PagarMe']
            }
            if (transaction && transaction._id) {
              bodyPaymentHistory.transaction_id = transaction._id
            }
            await addPaymentHistory(appSdk, storeId, order._id, auth, bodyPaymentHistory)
            logger.info('>> Status update to paid')
            return res.sendStatus(200)
          } else {
            return res.sendStatus(200)
          }
        } else {
          if (status === 'paid') {
            logger.info('>> Try create new order for recurrence')
            const { data: subscription } = await pagarmeAxios.get(`/subscriptions/${invoice.subscriptionId}`)
            const orderOriginal = await getOrderById(appSdk, storeId, subscription.code)
            const documentSnapshot = await colletionFirebase.doc(subscription.code).get()
            const docSubscription = documentSnapshot.exists && documentSnapshot.data()
            if (orderOriginal && docSubscription) {
              const { plan } = docSubscription

              await createNewOrderBasedOld(appSdk, storeId, auth, orderOriginal, plan, 'paid', charge, subscription)

              // Check if the product belongs to categories that can be subscribed, for next recurrence
              const categoryIds = appData.recurrency_category_ids
              if (categoryIds && Array.isArray(categoryIds) && categoryIds.length) {
                const requestPagarme = []
                const itemsPagarme = subscription.items
                const itemsApi = orderOriginal.items
                const itemsIdPagarmeDelete = await checkItemCategory(appSdk, storeId, auth, categoryIds, itemsPagarme, itemsApi)

                const urlRemoveItem = `/subscriptions/${invoice.subscriptionId}/items/`
                if (itemsIdPagarmeDelete?.length) {
                  itemsIdPagarmeDelete.forEach(itemId => {
                    requestPagarme.push(pagarmeAxios.delete(`${urlRemoveItem}${itemId}`))
                  })
                }

                try {
                  logger.info('>> Updated signature, for next recurrence')
                  await Promise.all(requestPagarme)
                } catch (err) {
                  logger.warn(err)
                }
              }

              logger.info('>> Create new Order')
              return res.sendStatus(201)
            } else {
              return res.status(404)
                .send({ message: `Subscription code: #${subscription.code} not found` })
            }
          } else {
            return res.status(400)
              .send({ message: 'Order not found and status is not paid' })
          }
        }
      } else if (charge.order) {
        // payment update (order in pagarme)
        logger.info('>> Try update status order')
        const { order: orderPagarme, status } = charge
        const order = await getOrderIntermediatorTransactionId(appSdk, storeId, orderPagarme.id, auth)
        if (order) {
          if (order.financial_status.current !== parserChangeStatusToEcom(status)) {
            // updadte status
            let isUpdateTransaction = false
            let transactionBody
            const transaction = order.transactions.find(transaction => transaction.intermediator.transaction_id === orderPagarme.id)
            const transactionPagarme = charge.last_transaction
            let notificationCode = `${type};${body.id};`
            if (transactionPagarme.transaction_type === 'credit_card') {
              notificationCode += `${transactionPagarme.gateway_id || ''};`
              notificationCode += `${transactionPagarme.acquirer_tid || ''};`
              notificationCode += `${transactionPagarme.acquirer_nsu || ''};`
              notificationCode += `${transactionPagarme.acquirer_auth_code || ''};`
            } else if (transactionPagarme.transaction_type === 'boleto') {
              notificationCode += `${transactionPagarme.gateway_id || ''};`
            } else if (transactionPagarme.transaction_type === 'pix') {
              let notes = transaction.notes
              // pix_provider_tid"
              notes = notes.replaceAll('display:block', 'display:none') // disable QR Code
              notes = `${notes} # PIX Aprovado`
              transactionBody = { notes }
              isUpdateTransaction = true
            }
            const bodyPaymentHistory = {
              date_time: transactionPagarme.updated_at || new Date().toISOString(),
              status: parserChangeStatusToEcom(status),
              notification_code: notificationCode,
              flags: ['PagarMe']
            }
            if (transaction && transaction._id) {
              bodyPaymentHistory.transaction_id = transaction._id
            }
            await addPaymentHistory(appSdk, storeId, order._id, auth, bodyPaymentHistory)
            if (isUpdateTransaction && transaction._id) {
              updateTransaction(appSdk, storeId, order._id, auth, transactionBody, transaction._id)
                .catch(logger.error)
            }
            logger.info(`>> Status update to ${parserChangeStatusToEcom(status)}`)
            return res.sendStatus(200)
          }
        } else {
          return res.sendStatus(404)
        }
      } else {
        return res.sendStatus(405)
      }
    } else {
      return res.sendStatus(405)
    }
  } catch (error) {
    logger.error(error)
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
