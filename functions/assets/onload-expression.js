; (function () {
  const apiKey = window._pagarmeKey
  const storeId = window.storefront && window.storefront.settings && window.storefront.settings.store_id 
  window._pagarmeHash = async function (cardClient) {
    return new Promise(async function (resolve, reject) {
      const card = {
        number: cardClient.number,
        holder_name: cardClient.name,
        exp_month: cardClient.month,
        exp_year: cardClient.year,
        cvv: cardClient.cvc
      }

      if (storeId == 8192) {
        function success(data) {
          console.log(data)
          if (data.id) {
            resolve(data.id)
          }
          throw new Error('Credencial inválida')
        };
    
        function fail(error) {
          console.log('store id error', error)
          reject(error)
        };
    
        PagarmeCheckout.init(success,fail)
        }

      const resp = await fetch(
        `https://api.pagar.me/core/v5/tokens?appId=${apiKey}`,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          method: 'POST',
          body: JSON.stringify({
            type: 'card',
            card
          })
        }
      )

      try {
        const data = await resp.json()
        if (data.id) {
          resolve(data.id)
        }
        throw new Error('Credencial inválida')
      } catch (err) {
        console.log('credencial inválida')
        // console.error(err)
        reject(err)
      }
    })
  }
}())
